import GameNetMgr from "#game/net/GameNetMgr.js";
import Protocol from "#game/net/Protocol.js";
import logger from "#utils/logger.js";
import LoopMgr from "#game/common/LoopMgr.js";
import UserMgr from "#game/mgr/UserMgr.js";
import account from '#config/runtimeAccount.js';
import { automationTaskValue, isAutomationTaskEnabled } from '#game/common/AutomationTaskMgr.js';
import { localDateKey } from '#game/common/localDateKey.js';

export default class UnionMgr {
    constructor() {
        this.unionId = null;              // 妖盟ID
        this.memberNum = null;            // 妖盟成员数量
        this.memberList = null;           // 妖盟成员列表
        this.lastCheckTime = 0;           // 上次检查时间
        this.CHECK_CD = 1000 * 60 * 10;   // 每次间隔时间
        this.latestUnionData = null;
        this.lastDailyTaskQueryAt = 0;
        this.dailyRewardRequestedDate = '';
        this.bargainedBusinessIds = new Set();
        this.shopPurchaseKeys = new Set();
        this.shopPurchaseDate = '';

        this.isProcessing = false;

        LoopMgr.inst.add(this);
    }

    static get inst() {
        if (!this._instance) {
            this._instance = new UnionMgr();
        }
        return this._instance;
    }

    clear() {
        LoopMgr.inst.remove(this);
    }

    collectPlayerData(data = []) {
        return data
            .filter(member => member?.playerData)
            .map(member => ({
                userId: member.playerData.playerId,
                nickName: member.playerData.nickName,
            }));
    }

    // 推送妖盟数据
    static pushMyUnionDataBroadcast(t) {
        UnionMgr.inst.applyUnionData(t);
    }

    applyAutomationConfig() {
        const hasUnionTask = [
            'union.demon-hunt', 'union.bargain', 'union.daily-task-reward',
            'union.ad-reward', 'shop.union-purchases',
        ].some(taskId => isAutomationTaskEnabled(taskId));
        if (!hasUnionTask) return;
        if (this.latestUnionData) this.applyUnionData(this.latestUnionData);
        logger.info('[妖盟管理] 请求当前妖盟状态');
        GameNetMgr.inst.sendPbMsg(Protocol.S_UNION_ENTER, {}, null);
    }

    receiveUnionEnter(t) {
        if (Number(t?.ret) !== 0 || !t?.myUnionData) {
            logger.info('[妖盟管理] 当前角色未加入妖盟或妖盟数据不可用');
            return;
        }
        this.applyUnionData(t.myUnionData);
    }

    requestDailyTaskState() {
        if (!isAutomationTaskEnabled('union.daily-task-reward')) return;
        const now = Date.now();
        if (now - this.lastDailyTaskQueryAt < 30_000) return;
        this.lastDailyTaskQueryAt = now;
        logger.info('[妖盟管理] 查询每日任务领奖进度');
        GameNetMgr.inst.sendPbMsg(Protocol.S_UNION_DAILYTASK, {}, null);
    }

    receiveDailyTask(t) {
        if (!isAutomationTaskEnabled('union.daily-task-reward') || Number(t?.ret) !== 0) return;
        const progress = Number(t?.progress) || 0;
        const day = localDateKey();
        if (progress < 4) {
            logger.info(`[妖盟管理] 每日任务进度 ${progress}/4，暂不领奖`);
            return;
        }
        if (this.dailyRewardRequestedDate === day) return;
        this.dailyRewardRequestedDate = day;
        logger.info('[妖盟管理] 每日任务已完成，领取奖励');
        GameNetMgr.inst.sendPbMsg(Protocol.S_UNION_GETDAILYTASK, { actIndex: 4 }, null);
    }

    applyUnionData(t) {
        const data = t?.myUnionData || t || {};
        const baseData = data.baseData || data;
        this.latestUnionData = data;
        this.unionId = baseData.unionId || null;
        this.memberNum = baseData.memberNum || null;
        this.memberList = this.collectPlayerData(data.memberList) || [];

        if (isAutomationTaskEnabled('union.ad-reward')) {
            logger.info("[妖盟管理] 领取妖盟广告奖励");
            GameNetMgr.inst.sendPbMsg(Protocol.S_WATCH_AD_TASK, { activityId: 0, conditionId: 120006, isUseADTime: false }, null);
            GameNetMgr.inst.sendPbMsg(Protocol.S_TASK_GET_REWARD, { taskId: [120006] }, null);
        }
        this.requestDailyTaskState();
        if (isAutomationTaskEnabled('shop.union-purchases') && account.activities?.allowPurchase === true) {
            const day = localDateKey();
            if (this.shopPurchaseDate !== day) {
                this.shopPurchaseDate = day;
                this.shopPurchaseKeys.clear();
            }
            const buy = (key, label, mallId, count = 1) => {
                if (automationTaskValue('shop.union-purchases', key, false) !== true) return;
                if (this.shopPurchaseKeys.has(key)) return;
                logger.info(`[妖盟管理] ${label}`);
                if (GameNetMgr.inst.sendPbMsg(Protocol.S_MALL_BUY_GOODS, { mallId, count, activityId: 0 }, null)) {
                    this.shopPurchaseKeys.add(key);
                }
            };
            buy('freePeach', '购买免费桃', 230000011);
            buy('peachOne', '购买桃 1', 230000001);
            buy('peachTwo', '购买桃 2', 230000002);
            buy('tengSnakeToken', '购买腾蛇信物', 230000012, 3);
        }
    }

    // 砍价
    cutPriceSyncData(t) {
        if (isAutomationTaskEnabled('union.bargain') && t) {
            const hasBargained = (t.records || []).some(record => String(record.userId) === String(UserMgr.playerId));
            const businessId = Number(t.bussinessId);
            if (!hasBargained && Number.isInteger(businessId) && !this.bargainedBusinessIds.has(businessId)) {
                logger.info(`[妖盟管理] ${UserMgr.nickName} 开始砍价`);
                if (GameNetMgr.inst.sendPbMsg(Protocol.S_CUT_PRICE_BARGAIN, { bussinessId: businessId }, null)) {
                    this.bargainedBusinessIds.add(businessId);
                }
            }
        }
        
    }

    fightBoss() {
        if (!isAutomationTaskEnabled('union.demon-hunt') || account.activities?.allowCombat !== true) return;
        const now = Date.now();
        if (now - this.lastCheckTime >= this.CHECK_CD) {

            logger.info("[妖盟管理] 妖盟讨伐 妖盟布阵");
            GameNetMgr.inst.sendPbMsg(Protocol.S_UNION_BOSS_ARRAYING, {}, null);
            // TODO
            logger.info("[妖盟管理] 妖盟讨伐 已满20人开始战斗");
            GameNetMgr.inst.sendPbMsg(Protocol.S_UNION_BOSS_BATTLE, {}, null);

            logger.debug("[妖盟管理] 妖盟讨伐 妖盟领奖");
            GameNetMgr.inst.sendPbMsg(Protocol.S_UNION_BOSS_RECEIVE_REWARD, {}, null);

            this.lastCheckTime = now;
        }
    }

    async loopUpdate() {
        if (!isAutomationTaskEnabled('union.demon-hunt') || account.activities?.allowCombat !== true) return;
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            // 获取当前时间
            const now = new Date();
            const isWeekend = now.getDay() === 6 || now.getDay() === 0;
            if (!this.unionId || isWeekend) {
                logger.info("[妖盟管理] 未加入妖盟或今天是周末，跳过妖盟讨伐");
                return;
            }

            this.fightBoss();
        } catch (error) {
            logger.error(`[妖盟管理] loopUpdate error: ${error}`);
        } finally {
            this.isProcessing = false;
        }
    }
}
