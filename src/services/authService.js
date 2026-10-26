import axios from "axios";
import CryptoJS from "crypto-js";
import qs from "qs";
import { v4 as uuidv4 } from "uuid";
import logger from "#utils/logger.js";
import { readFileSync } from 'node:fs';

const protocolVersion = JSON.parse(readFileSync(
    new URL('../game/config/grpc/version.json', import.meta.url), 'utf8',
));

const GAME_CONFIG = Object.freeze({
    serverListUrl: "https://login-xddq-cn.ap3615.com/server/list",
    clientVersion: `${protocolVersion.version}.${protocolVersion.buildID}`,
    platform: "android",
    deviceplate: "Android",
    channelId: 31,
    urlType: "mainLandAppUrl",
    packageId: protocolVersion.packageID,
    loginType: 0,
    appid: "37h5",
    gameId: 223,
    sqGameId: 913,
    cGameId: "23448",
    language: "zh_cn",
});

function toEpochMilliseconds(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
}

function formatForbiddenEndTime(value) {
    const milliseconds = toEpochMilliseconds(value);
    if (!milliseconds) return "";
    return new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    }).format(new Date(milliseconds));
}

export class GameLoginError extends Error {
    constructor(response) {
        const code = Number(response?.ret);
        const forbiddenEndTime = toEpochMilliseconds(response?.forbiddenEndTime);
        const responseMessage = response?.message
            || response?.msg
            || response?.error
            || response?.retMsg
            || response?.ret_msg;

        let message;
        if (code === 505) {
            const endTimeText = formatForbiddenEndTime(forbiddenEndTime);
            message = endTimeText
                ? `角色被服务器禁止登录，预计解除时间：${endTimeText}（错误码 505）`
                : "角色被服务器禁止登录，服务器未返回解除时间（错误码 505）";
        } else if (code === 497) {
            message = "账号正在其他设备登录或需要接管登录（错误码 497）";
        } else {
            const messageSuffix = responseMessage ? `（${responseMessage}）` : "";
            message = `游戏登录失败，错误码: ${code}${messageSuffix}`;
        }

        super(message);
        this.name = "GameLoginError";
        this.code = Number.isFinite(code) ? code : null;
        this.forbiddenEndTime = forbiddenEndTime;
        this.retryable = code !== 505 && code !== 497;
    }
}

export default class AuthService {
    constructor(deviceIdentity = {}) {
        this.clientId = deviceIdentity.clientId || uuidv4();
        this.deviceId = deviceIdentity.deviceId || `Android-${this.clientId}`;
    }

    getRandomNum(count) {
        const chars = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        let result = "";
        for (let i = 0; i < count; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    encryptPwd(pwd) {
        if (!pwd) {
            return null;
        }
        const str = this.getRandomNum(8) + pwd.substring(0, 3) + this.getRandomNum(5) + pwd.substring(3) + this.getRandomNum(2);
        return CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(str)).trim();
    }

    createRequestBody(token, userInfo) {
        const uid = userInfo.uid?.toString();
        const puid = userInfo.puid?.toString() || uid;
        const uname = userInfo.login_account || userInfo.uname || puid;
        const dataObj = {
            appID: GAME_CONFIG.gameId.toString(),
            gameId: GAME_CONFIG.cGameId,
            pid: GAME_CONFIG.appid,
            clientId: this.clientId,
            sqGameId: GAME_CONFIG.sqGameId.toString(),
            token,
            puid,
            uid,
            uname,
            time: Math.floor(Date.now() / 1000).toString(),
            c_game_id: GAME_CONFIG.cGameId,
        };

        const appKey = userInfo.appKey || userInfo.app_key;
        const oaid = userInfo.oaid;
        if (appKey) dataObj.appKey = String(appKey);
        if (oaid) dataObj.oaid = String(oaid);

        return encodeURIComponent(JSON.stringify(dataObj));
    }

    async firstRequest(username, password) {
        const data = qs.stringify({
            login_account: username,
            password: this.encryptPwd(password),
        });

        const config = {
            method: "post",
            url: "https://mysdk.37.com/index.php?c=api-login&a=act_login",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data,
        };

        const response = await axios(config);
        return response.data;
    }

    async secondRequest(username, ptoken) {
        const data = qs.stringify({
            is_self: "1",
            pid: GAME_CONFIG.appid,
            ptoken,
            puid: username,
        });

        const config = {
            method: "post",
            url: "https://apimyh5.37.com/index.php?c=sdk-login&a=act_login",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data,
        };

        const response = await axios(config);
        return response.data;
    }

    async requestServerList(uid) {
        const body = {
            openId: uid.toString(),
            clientVersion: GAME_CONFIG.clientVersion,
            pFullVersion: GAME_CONFIG.clientVersion,
            platform: GAME_CONFIG.platform,
            channelId: GAME_CONFIG.channelId,
            urlType: GAME_CONFIG.urlType,
            packageMark: GAME_CONFIG.packageId,
            language: GAME_CONFIG.language,
        };

        const response = await axios.post(GAME_CONFIG.serverListUrl, body, {
            headers: { "Content-Type": "application/json" },
        });
        return response.data;
    }

    async thirdRequest(server, token, userInfo) {
        if (!server?.address) {
            throw new Error(`区服 ${server?.serverId ?? "未知"} 未返回登录地址`);
        }

        const address = server.address.replace(/\/$/, "");
        const data = {
            data: this.createRequestBody(token, userInfo),
            loginType: GAME_CONFIG.loginType,
            deviceplate: GAME_CONFIG.deviceplate,
            deviceId: this.deviceId,
            channelId: GAME_CONFIG.channelId,
            appid: GAME_CONFIG.appid,
            gameId: GAME_CONFIG.gameId,
            urlType: GAME_CONFIG.urlType,
            packageId: GAME_CONFIG.packageId,
            c_game_id: GAME_CONFIG.cGameId,
        };

        const response = await axios.post(`${address}/player/login`, data, {
            headers: { "Content-Type": "application/json" },
        });
        return response.data;
    }

    async Bind(username, password) {
        const response = await this.firstRequest(username, password);
        if (response.code === 1) {
            return response.data;
        }
        throw new Error(response.message || response.msg || "账号登录失败");
    }

    async List(username, password) {
        try {
            const firstResponse = await this.Bind(username, password);
            const uid = firstResponse.userinfo.uid;
            const response = await this.requestServerList(uid);
            const { serverList = [], playerServerList = [] } = response;
            const playerServerIds = new Set(playerServerList.map(Number));

            if (playerServerIds.size === 0) {
                throw new Error("该账号没有已创建角色的区服");
            }

            const servers = serverList
                .filter(server => playerServerIds.has(Number(server.serverId)))
                .sort((a, b) => Number(a.serverId) - Number(b.serverId))
                .map((server, index) => ({
                    id: index,
                    serverId: server.serverId,
                    serverName: server.serverName,
                    address: server.address,
                }));

            return { servers };
        } catch (error) {
            logger.error(`无法获取服务器列表: ${error.message}`);
            throw error;
        }
    }

    async Login(username, password, serverId) {
        try {
            logger.info("正在连接服务器...");
            const firstResponse = await this.Bind(username, password);
            const ptoken = firstResponse.app_pst;
            const uid = firstResponse.userinfo.uid;

            const [secondResponse, serverResponse] = await Promise.all([
                this.secondRequest(username, ptoken),
                this.requestServerList(uid),
            ]);

            if (secondResponse.code !== 1) {
                throw new Error(secondResponse.message || secondResponse.msg || "SDK 登录失败");
            }

            const server = (serverResponse.serverList || []).find(
                item => Number(item.serverId) === Number(serverId),
            );
            if (!server) {
                throw new Error(`区服 ${serverId} 不在新版区服列表中，请检查 account.js 中的 serverId`);
            }

            const sdkData = secondResponse.data;
            const token = sdkData.app_pst;
            const userInfo = {
                uid: sdkData.userinfo?.uid || uid,
                puid: sdkData.userinfo?.puid || username,
                login_account: sdkData.userinfo?.login_account || username,
                appKey: sdkData.appKey || sdkData.app_key || sdkData.userinfo?.appKey || sdkData.userinfo?.app_key,
                oaid: sdkData.oaid || sdkData.userinfo?.oaid,
            };
            const thirdResponse = await this.thirdRequest(server, token, userInfo);

            if (thirdResponse.ret !== 0) {
                throw new GameLoginError(thirdResponse);
            }

            logger.info(`登录成功: ${server.serverName}，playerId=${thirdResponse.playerId}`);
            return thirdResponse;
        } catch (error) {
            if (error instanceof Error) throw error;
            throw new Error("登录失败");
        }
    }
}
