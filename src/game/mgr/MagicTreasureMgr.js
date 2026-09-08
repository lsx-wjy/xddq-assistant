import GameNetMgr from "#game/net/GameNetMgr.js";
import Protocol from "#game/net/Protocol.js";
import logger from "#utils/logger.js";
import LoopMgr from "#game/common/LoopMgr.js";
import { isAutomationTaskEnabled } from '#game/common/AutomationTaskMgr.js';

export default class MagicTreasureMgr {
    constructor() {
        this.AD_REWARD_DAILY_MAX_NUM = 2; // 每日最大领取次数
        this.AD_REWARD_CD = 1000;         // 每次间隔时间
        this.FREE_NUM = 2;                // 免费抽奖次数
        // 面板可单独启用广告法宝。首次同步奖池前不要假设数据已存在，
        // 否则循环会在连接刚建立时访问 undefined 并持续报错。
        this.jackpotData = [];
        this.hasJackpotData = false;
        this.isProcessing = false;

        LoopMgr.inst.add(this);
    }

    static get inst() {
        if (!this._instance) {
            this._instance = new MagicTreasureMgr();
        }
        return this._instance;
    }

    clear() {
        LoopMgr.inst.remove(this);
    }

    checkReward(t) {
        this.isProcessing = true;
        const jackpotConfig = Array.isArray(t?.jackpotConfig) ? t.jackpotConfig : [];
        this.jackpotData = Array.isArray(t?.jackpotData)
            ? t.jackpotData.slice(0, jackpotConfig.length)
            : [];
    
        // 有时候会出现奇怪的情况，需要重新初始化
        // 如果 jackpotData 的长度小于 jackpotConfig 的长度，则填充 jackpotData
        while (this.jackpotData.length < jackpotConfig.length) {
            const nextIndex = this.jackpotData.length;
            this.jackpotData.push({
                poolId: nextIndex + 1,
                freeDrawTimes: 0,
                adFreeTimes: 0,
                lastAdTime: "0"
            });
        }
    
        // 设置名称
        this.jackpotData.forEach((i, index) => {
            i.name = jackpotConfig[index].title;
            // t.jackpotConfig[index].drawItemCostParam删除=号后面的内容
            i.cost = jackpotConfig[index].drawItemCostParam.split("=")[0];
        });
        this.hasJackpotData = this.jackpotData.length > 0;
        this.isProcessing = false;
    }

    processReward() {
        const now = Date.now();

        for (const pool of this.jackpotData) {
            if (pool.adFreeTimes < this.AD_REWARD_DAILY_MAX_NUM && now - pool.lastAdTime >= this.AD_REWARD_CD) {
                logger.info(`[法宝管理] [${pool.name}] 还剩 ${this.AD_REWARD_DAILY_MAX_NUM - pool.adFreeTimes} 次广告激励`);
                GameNetMgr.inst.sendPbMsg(Protocol.S_MAGIC_TREASURE_DRAW_REQ, { drawTimes: 1, isAd: true, poolId: pool.poolId, isUseADTime: false}, null);
                pool.adFreeTimes++;
                pool.lastAdTime = now;
            }

            if (pool.freeDrawTimes < this.FREE_NUM) {
                logger.info(`[法宝管理] [${pool.name}] 还剩 ${this.FREE_NUM - pool.freeDrawTimes} 次免费次数`);
                GameNetMgr.inst.sendPbMsg(Protocol.S_MAGIC_TREASURE_DRAW_REQ, { drawTimes: 1, isAd: false, poolId: pool.poolId, itemId: pool.cost}, null);
                pool.freeDrawTimes++;
            }
        }
    }

    async loopUpdate() {
        if (!isAutomationTaskEnabled('cave.ad-magic-treasure')) return;
        if (!this.hasJackpotData) return;
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            if (this.jackpotData.every(i => i.adFreeTimes >= this.AD_REWARD_DAILY_MAX_NUM) 
                && this.jackpotData.every(i => i.freeDrawTimes >= this.FREE_NUM)) {
                this.clear();
                logger.info("[法宝管理] 达到每日最大领取次数，停止奖励领取");
                this.isProcessing = false;
                return;
            } else {
                this.processReward();
            }
        } catch (error) {
            logger.error(`[法宝管理] loopUpdate error: ${error}`);
        } finally {
            this.isProcessing = false;
        }
    }
}
