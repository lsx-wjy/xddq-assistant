
import Protocol from '#game/net/Protocol.js';
import { Stream } from '#game/net/Stream.js';
import { ProtobufMgr } from '#game/net/ProtobufMgr.js';
import { NetSocket, NetState } from '#game/net/NetSocket.js';

import logger from "#utils/logger.js";
import MsgRecvMgr from '#game/common/MsgRecvMgr.js';
import LoopMgr from '#game/common/LoopMgr.js';
import ActivityCompatMgr from '#game/mgr/ActivityCompatMgr.js';
import ProtocolPayloadMgr from '#game/mgr/ProtocolPayloadMgr.js';
import account from '#config/runtimeAccount.js';
import { readDashboardAccess, isPlatformAccountAllowed, isDashboardUserAllowed } from '#config/dashboardAccess.js';

class GameNetMgr {
    constructor() {
        this.token = null;
        this.playerId = null;
        // Server
        this.net = new NetSocket();
        this.isLogined = false;
        this.loginAccepted = false;
        this.loginReady = false;
        this.loopStarted = false;
        this._closed = false;
        // Restart
        this.maxReconnectNum = 3;
        this.reconnectDelays = [5_000, 15_000, 45_000];
        this.autoReconnect = account.autoReconnect === true;
        this.reconnectTimer = null;
        this.exitTimer = null;
        this.reConnectTimes = 0;
        this.isReconnectNum = 0;
        // handlers
        this.handlers = {};
        // Msg
        this.sendMsgLength = 0;
        this.expectedResponses = new Map();
        this.blockedRequests = new Set();
        this.lastSendError = '';
        this.accessConfig = account.dashboardAccessRequired ? readDashboardAccess() : null;
        this.resetAccessCheck();
    }

    static get inst() {
        if (this._instance == null) {
            this._instance = new GameNetMgr();
        }
        return this._instance;
    }

    connectGameServer(url, playerId, token) {
        this.playerId = playerId;
        this.token = token;

        this._closed = false;
        this.resetLoginLifecycle();
        this.net.initWithUrl(url);
        this.net.addHandler(this.ping.bind(this), this.parseArrayBuffMsg.bind(this));

        this.net.connect(this.netStateChangeHandler.bind(this));
    }

    netStateChangeHandler(state, event) {
        this.netConnState = state;

        switch (this.netConnState) {
            case NetState.NET_CONNECT:
                this.netConnectHandler();
                break;
            case NetState.NET_CLOSE:
                this.netCloseHandler(event);
                break;
            case NetState.NET_ERROR:
                this.netErrorHandler(event);
                break;
        }
    }

    netConnectHandler() {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
        this._closed = false;
        if (account.dashboardAccessRequired) {
            try {
                this.accessConfig = readDashboardAccess();
            } catch (error) {
                this.reportRuntimeError({ message: error.message, retryable: false });
                return;
            }
        }
        this.resetLoginLifecycle();
        this.login();
        logger.info("[WebSocket] 连接成功");
    }

    netCloseHandler(event) {
        const code = Number.isFinite(event?.code) ? event.code : '未知';
        const reason = event?.reason ? Buffer.from(event.reason).toString('utf8') : '';
        logger.error(`[WebSocket] 已断开连接（code=${code}${reason ? `，reason=${reason}` : ''}）`);
        this.resetLoginLifecycle();
        if (!this._closed) this.reConnect();
    }

    netErrorHandler(event) {
        logger.error(`[WebSocket] 连接错误${event?.message ? `：${event.message}` : ''}`);
        this.resetLoginLifecycle();
        this.reConnect();
    }

    reConnect() {
        if (this._closed || this.reconnectTimer) return;
        if (!this.autoReconnect) {
            this.stopAfterDisconnect("已关闭断线自动重连");
            return;
        }
        if (this.isReconnectNum >= this.maxReconnectNum) {
            this.stopAfterDisconnect("重连超过次数");
            return;
        }

        const delay = this.reconnectDelays[this.isReconnectNum];
        this.isReconnectNum += 1;
        logger.warn(`[WebSocket] ${delay / 1000} 秒后开始第 ${this.isReconnectNum} 次重连`);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (this._closed) return;
            GameNetMgr.inst.net.reConnect();
            GameNetMgr.inst.handlers = {};
            GameNetMgr.inst.expectedResponses.clear();
        }, delay);
    }

    stopAfterDisconnect(reason) {
        logger.error(`[WebSocket] ${reason}，已停止连接进程`);
        this.close();
        if (!this.exitTimer) {
            this.exitTimer = setTimeout(() => process.exit(2), 100);
        }
    }

    login() {
        const loginData = {
            token: this.token,
            language: "zh_cn",
            liveShowType: 0,
        };
        this.sendPbMsg(Protocol.S_PLAYER_LOGIN, loginData, null);
    }

    handleLoginResponse(data) {
        const ret = Number(data?.ret);
        if (ret !== 0) {
            this.reportRuntimeError({
                code: Number.isFinite(ret) ? ret : null,
                message: `WebSocket 游戏登录失败（ret=${Number.isFinite(ret) ? ret : '未知'}）`,
                retryable: false,
            });
            return;
        }

        this.loginAccepted = true;
        this.isLogined = true;
        this.net.heartbeatStart();
        logger.info('[WebSocket] 登录验证成功，等待角色数据同步');
    }

    handleLoginOver() {
        if (!this.loginAccepted) {
            logger.warn('[WebSocket] 收到登录同步完成消息，但登录验证尚未成功，已忽略');
            return;
        }
        if (this.loginReady) return;

        if (this.accessPending) {
            this.accessWaiting = true;
            if (this.accessUnionId !== null) this.finishAccessCheck();
            else {
                if (!this.accessTimer) {
                    this.accessTimer = setTimeout(() => this.reportRuntimeError({
                        message: '妖盟资格验证超时，请稍后重试', retryable: false,
                    }), 15_000);
                    this.sendPbMsg(Protocol.S_UNION_ENTER, {}, null);
                }
            }
            return;
        }

        this.loginReady = true;
        this.reConnectTimes = 0;
        this.isReconnectNum = 0;
        logger.info('[WebSocket] 角色数据同步完成');
        if (ActivityCompatMgr.inst.hasSelectedTasks()) {
            LoopMgr.inst.start();
            this.loopStarted = true;
            logger.info('[任务] 已按用户选择启动循环任务');
        } else {
            logger.info('[任务] 未选择运行任务，仅保持连接');
        }
    }

    resetLoginLifecycle() {
        this.isLogined = false;
        this.loginAccepted = false;
        this.loginReady = false;
        this.loopStarted = false;
        this.blockedRequests.clear();
        LoopMgr.inst.end();
        this.net.heartbeatStop();
        this.resetAccessCheck();
    }

    resetAccessCheck() {
        if (this.accessTimer) clearTimeout(this.accessTimer);
        this.accessTimer = null;
        this.accessPending = Boolean(this.accessConfig && !isPlatformAccountAllowed(this.accessConfig, account.username));
        this.accessWaiting = false;
        this.accessUnionId = null;
        this.accessMessages = [];
    }

    finishAccessCheck() {
        if (!this.accessWaiting || !this.accessPending) return;
        if (!isDashboardUserAllowed(this.accessConfig, account.username, this.accessUnionId)) {
            this.reportRuntimeError({ message: '登录未获授权：平台账号和角色妖盟均不在白名单中', retryable: false });
            return;
        }
        clearTimeout(this.accessTimer);
        this.accessTimer = null;
        this.accessPending = false;
        const buffered = this.accessMessages;
        this.accessMessages = [];
        for (const args of buffered) this.resvHandler(...args);
        this.handleLoginOver();
    }

    reportRuntimeError({ code = null, message, retryable = false }) {
        const runtimeError = {
            type: 'runtime-error',
            code,
            message,
            forbiddenEndTime: null,
            retryable,
        };
        logger.error(message);
        if (typeof process.send === 'function') process.send(runtimeError);
        this.close();
        if (!this.exitTimer) this.exitTimer = setTimeout(() => process.exit(2), 100);
    }

    ping() {
        this.sendPbMsg(Protocol.S_PLAYER_PING, null, null);
    }

    addHandler(msgId, handler) {
        this.handlers[msgId] = (data) => {
            if (msgId !== "disconnect" && typeof data === "string") {
                data = JSON.parse(data);
            }
            handler(data);
        };
    }

    sendPbMsg(msgId, msgData, callback, extraCmd, options = {}) {
        this.lastSendError = '';
        if (!this.net.isConnected()) {
            return this.rejectSend(msgId, 'WebSocket 尚未连接');
        }

        const isLogin = msgId === Protocol.S_PLAYER_LOGIN;
        const isPing = msgId === Protocol.S_PLAYER_PING;
        const isAccessQuery = this.accessPending && this.accessWaiting && msgId === Protocol.S_UNION_ENTER;
        if (this.accessPending && !isLogin && !isPing && !isAccessQuery) {
            return this.rejectSend(msgId, '正在验证妖盟登录资格');
        }
        if (!isLogin && !isPing && !isAccessQuery && !this.loginReady) {
            return this.rejectSend(msgId, '登录数据同步尚未完成');
        }
        if (isPing && !this.loginAccepted) {
            return this.rejectSend(msgId, '登录验证尚未成功');
        }
        if (!isLogin && !isPing && !isAccessQuery) {
            const requestPolicy = options.manual
                ? ActivityCompatMgr.inst.checkManualRequest(msgId, options.protocolKey)
                : ActivityCompatMgr.inst.checkRequest(msgId);
            if (!requestPolicy.allowed) {
                return this.rejectSend(msgId, requestPolicy.reason);
            }
        }

        // Create a new message stream
        const stream = new Stream();
        stream.init(msgId, +this.playerId, NetSocket.BYTES_OF_MSG_HEADER + NetSocket.MSG_DATA_LENGTH, true);
        stream.writeShort(NetSocket.HEADER);
        stream.writeInt(50);
        stream.writeInt(msgId);
        stream.writeLong(this.playerId);

        const protoCmd = ProtobufMgr.inst.cmdList[msgId];
        if (!stream.pbMsg || !protoCmd?.cmMethod) {
            return this.rejectSend(msgId, '没有可用的 protobuf 映射');
        }
        if (options.manual) {
            const verificationError = stream.pbMsg.verify(msgData || {});
            if (verificationError) {
                return this.rejectSend(msgId, `请求参数不符合协议：${verificationError}`);
            }
        }
        const body = stream.pbMsg.encode(msgData || {}).finish();
        stream.writeBytes(body, 18);

        stream.writeInt(stream.offset, 2);
        // parseSendData
        const t = new Uint8Array(stream.offset);
        t.set(stream.buff.subarray(0, stream.offset));
        stream.buff = t;
        stream.streamsize = stream.offset;

        // Add handler
        if (callback && protoCmd?.smMsgId !== undefined && this.net.isConnected()) {
            this.addHandler(protoCmd.smMsgId, callback);
        }

        const responseConfig = ProtobufMgr.inst.resvCmdList[protoCmd.smMsgId];
        if (responseConfig?.candidates?.length > 1 && protoCmd.smMethod) {
            this.expectedResponses.set(protoCmd.smMsgId, {
                method: protoCmd.smMethod,
                expiresAt: Date.now() + 30_000,
            });
        }

        if (extraCmd && ProtobufMgr.inst.cmdList[extraCmd]) {
            this.addHandler(extraCmd, callback);
        }

        this.net.sendMsg(stream);
        return true;
    }

    sendManualProtocol(protocolKey, msgId, request, callback) {
        const requestPolicy = ActivityCompatMgr.inst.checkManualRequest(msgId, protocolKey);
        if (!requestPolicy.allowed) return { ok: false, error: requestPolicy.reason };

        const resolved = ProtocolPayloadMgr.inst.resolve({
            protocolKey,
            msgId,
            mode: request?.mode || 'auto',
            payload: request?.payload || {},
            playerId: this.playerId,
        });
        if (!resolved.ok) return resolved;

        const protocol = requestPolicy.protocol;
        const waitingForResponse = Boolean(
            protocol.responseMethod
            && Number.isInteger(protocol.responseId)
            && protocol.responseId > 0,
        );
        const sent = this.sendPbMsg(
            msgId,
            resolved.payload,
            waitingForResponse
                ? response => callback(response, resolved)
                : null,
            null,
            { manual: true, protocolKey },
        );
        if (!sent) return { ok: false, error: this.lastSendError || '协议发送失败' };
        return {
            ok: true,
            waitingForResponse,
            parameterSource: resolved.source,
            parameterMessage: resolved.message,
            resolvedPayload: resolved.payload,
        };
    }

    rejectSend(msgId, reason) {
        this.lastSendError = reason;
        this.logBlockedRequestOnce(msgId, reason);
        return false;
    }

    logBlockedRequestOnce(msgId, reason) {
        const key = `${msgId}:${reason}`;
        if (this.blockedRequests.has(key)) return;
        this.blockedRequests.add(key);
        logger.warn(`[发送闸门] 已阻止请求 ${msgId}：${reason}`);
    }

    parseArrayBuffMsg(arrayBuffer) {
        try {
            const stream = new Stream();
            stream.initByBuff(arrayBuffer, NetSocket.BYTES_OF_MSG_HEADER);
            stream.readShort();
            const length = stream.readInt();
            const msgId = stream.readInt();

            const msgBody = new Uint8Array(arrayBuffer.subarray(NetSocket.BYTES_OF_MSG_HEADER, length));

            const preferredMethod = this.takeExpectedResponse(msgId);
            const candidates = ProtobufMgr.inst.getMsgCandidates(msgId, false, preferredMethod);
            const selected = this.decodeBestCandidate(candidates, msgBody, preferredMethod);
            if (selected) {
                // logger.info(`msgId: ${msgId} ${JSON.stringify(selected.data)}`);
                this.resvHandler(msgId, selected.data, selected.method);
            }
        } catch (error) {
            logger.debug(`[未知协议] ${error.message} ${this.toHexString(new Uint8Array(arrayBuffer))}`);
        }
    }

    takeExpectedResponse(msgId) {
        const expected = this.expectedResponses.get(msgId);
        if (!expected) return null;
        this.expectedResponses.delete(msgId);
        return expected.expiresAt >= Date.now() ? expected.method : null;
    }

    decodeBestCandidate(candidates, msgBody, preferredMethod) {
        let best = null;
        for (const candidate of candidates) {
            try {
                const data = candidate.type.decode(msgBody);
                const encodedLength = candidate.type.encode(data).finish().length;
                const score =
                    (candidate.method === preferredMethod ? 1_000_000_000 : 0) +
                    (encodedLength === msgBody.length ? 1_000_000 : 0) +
                    encodedLength;
                if (!best || score > best.score) {
                    best = { ...candidate, data, score };
                }
            } catch (_error) {
                // 共享响应编号时，某些候选消息无法解码属于正常情况。
            }
        }
        return best;
    }

    toHexString = (bytes) => {
        let hex = [];
        for (let i = 0; i < bytes.length; i++) {
            let current = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
            hex.push((current >>> 4).toString(16));
            hex.push((current & 0xf).toString(16));
        }
        return hex.join("");
    };

    resvHandler(msgId, msgData, decodedMethod = null) {
        if (msgData) {
            const responseConfig = ProtobufMgr.inst.resvCmdList[msgId];
            const methodPath = decodedMethod || responseConfig?.smMethod;
            const method = methodPath?.split('.').at(-1);
            if (this.accessPending && !['RspLoginMsg', 'LoginOverMsg'].includes(method)) {
                if (method === 'MyUnionData') {
                    this.accessUnionId = String(msgData?.baseData?.unionId || '');
                } else if (method === 'RspUnionEnter') {
                    this.accessUnionId = Number(msgData?.ret) === 0
                        ? String(msgData?.myUnionData?.baseData?.unionId || '') : '';
                }
                this.accessMessages.push([msgId, msgData, decodedMethod]);
                if (this.accessUnionId !== null) this.finishAccessCheck();
                return;
            }
            ActivityCompatMgr.inst.capture(msgId, methodPath, msgData);
            MsgRecvMgr.observePalaceReward(method, msgData);

            if (msgId && this.handlers[msgId]) {
                const handler = this.handlers[msgId];
                delete this.handlers[msgId];
                handler.call(this, msgData);
            } else if (methodPath) {
                const protoCmd = methodPath.split(".");
                const method = protoCmd[protoCmd.length - 1];

                if (MsgRecvMgr[method]) {
                    logger.debug(`[Handler] 找到处理函数: ${method} msgId: ${msgId} ${JSON.stringify(msgData)}`);
                    MsgRecvMgr[method](msgData, msgId);
                } else {
                    logger.debug(`[Handler] 未找到处理函数: ${method}`);
                }
            }
        }
    }

    close() {
        this._closed = true;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
        this.resetLoginLifecycle();
        if (this.net) {
            this.net.heartbeatStop();
            this.net.close(true);
        };
        this.isReconnectNum = 0;
    }
}


export default GameNetMgr;
