import fs from 'fs/promises';
import protobuf from 'protobufjs';
import path from 'path';
import createPath from '#utils/path.js';

const resolvePath = createPath(import.meta.url);

class ProtobufMgr {
    constructor() {
        this.cmdList = [];
        this.resvCmdList = [];
        this.messages = {};
        this.msgInfoDict = {};
        this.activityRegistry = [];
        this.missingByteDecoders = [];
        this.missingMessageTypes = [];
        this.initialized = false;
        this.initializationPromise = null;
        this.basePath = resolvePath('../config/grpc/json');
        this.protoPath = resolvePath('../config/grpc/protobuf');
    }

    static get inst() {
        if (!this._instance) {
            this._instance = new ProtobufMgr();
        }
        return this._instance;
    }

    async initialize() {
        if (this.initialized) return;
        if (!this.initializationPromise) {
            this.initializationPromise = this.loadProtocols().finally(() => {
                this.initializationPromise = null;
            });
        }
        return this.initializationPromise;
    }

    async loadProtocols() {
        // 读取Json文件
        const [cityMsgInfoRes, cmdListRes, resvCmdListRes, activityRegistryRes] = await Promise.all([
            fs.readFile(path.join(this.basePath, 'CityMsgInfo'), 'utf-8'),
            fs.readFile(path.join(this.basePath, 'cmdList.json'), 'utf-8'),
            fs.readFile(path.join(this.basePath, 'resvCmdList.json'), 'utf-8'),
            fs.readFile(path.join(this.basePath, 'activityRegistry.json'), 'utf-8'),
        ]);
        const msgInfo = JSON.parse(cityMsgInfoRes);
        this.msgInfoDict = msgInfo;
        this.cmdList = JSON.parse(cmdListRes);
        this.resvCmdList = JSON.parse(resvCmdListRes);
        this.activityRegistry = JSON.parse(activityRegistryRes);

        // 所有协议共用一个 Root，让 Common、Battle 等公共依赖只解析一次。
        // 每个文件单独 protobuf.load 会保留多份公共定义，显著放大角色进程内存。
        const protoFiles = await fs.readdir(this.protoPath);
        const root = new protobuf.Root();
        await root.load(protoFiles.map(protoName => path.join(this.protoPath, protoName)));
        root.resolveAll();

        this.messages = {};
        this.missingByteDecoders = [];
        this.missingMessageTypes = [];
        for (const protoName of protoFiles) this.registerMessages(protoName, root);
        this.initialized = true;
    }

    registerMessages(protoName, root) {
        const msgInfo = this.msgInfoDict[protoName] || [];

        for (const msg of msgInfo) {
            if (!msg) continue;
            for (const method of [msg.cmMethod, msg.smMethod]) {
                const qualified = this.qualifyMethod(method);
                if (!qualified) continue;
                try {
                    this.messages[qualified] = root.lookupType(qualified);
                } catch (_error) {
                    // 协议表可能先于尚未随包发布的 proto 定义，用于识别但不可发送。
                    this.missingMessageTypes.push(`${protoName}:${method}`);
                }
            }
            if (msg.byteDecode) {
                const qualified = this.qualifyMethod(msg.byteDecode);
                try {
                    this.messages[qualified] = root.lookupType(qualified);
                } catch (_error) {
                    // 官方资源偶尔保留已从 proto 注释掉的旧 byteDecode 条目。
                    this.missingByteDecoders.push(`${protoName}:${msg.byteDecode}`);
                }
            }
        }
    }

    qualifyMethod(method) {
        if (!method) return null;
        if (method.startsWith('com.yq.msg.')) return method;
        return `com.yq.msg.${method.includes('.') ? method : `CityMsg.${method}`}`;
    }

    getMsgCandidates(msgId, isRequest = false, preferredMethod = null) {
        const command = isRequest ? this.cmdList[msgId] : this.resvCmdList[msgId];
        if (!command) return [];

        const methods = isRequest
            ? [command.cmMethod]
            : (command.candidates?.map(candidate => candidate.smMethod) || [command.smMethod]);
        if (preferredMethod) {
            methods.sort((left, right) =>
                Number(right === preferredMethod) - Number(left === preferredMethod)
            );
        }

        return [...new Set(methods)]
            .map(method => ({ method, type: this.messages[this.qualifyMethod(method)] }))
            .filter(candidate => candidate.type);
    }

    getMsg(msgId, isRequest = false, preferredMethod = null) {
        return this.getMsgCandidates(msgId, isRequest, preferredMethod)[0]?.type || null;
    }
}

export { ProtobufMgr };
