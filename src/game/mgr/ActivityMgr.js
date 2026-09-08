import GameNetMgr from "#game/net/GameNetMgr.js";
import Protocol from "#game/net/Protocol.js";
import logger from "#utils/logger.js";
import { isAutomationTaskEnabled } from '#game/common/AutomationTaskMgr.js';


export default class ActivityMgr {
    constructor() {
        this.mainConfigs = [];
        this.detailRequestedAt = new Map();
    }

    static get inst() {
        if (!this._instance) {
            this._instance = new ActivityMgr();
        }
        return this._instance;
    }

    hasEnabledTask() {
        return isAutomationTaskEnabled('basic.daily-task')
            || isAutomationTaskEnabled('basic.free-activity-gifts');
    }

    applyAutomationConfig() {
        this.requestEnabledActivityDetails();
    }

    syncMainConfigs(t) {
        this.mainConfigs = Array.isArray(t?.mainConfig) ? t.mainConfig : [];
        this.requestEnabledActivityDetails();
    }

    isCurrentActivity(config, now = Date.now()) {
        const normalizeTime = value => {
            const numeric = Number(value || 0);
            return numeric > 0 && numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
        };
        const beginTime = normalizeTime(config?.beginTime);
        const endTime = normalizeTime(config?.endTime);
        return (!beginTime || beginTime <= now) && (!endTime || endTime >= now);
    }

    requestEnabledActivityDetails() {
        if (!this.hasEnabledTask()) return;
        const now = Date.now();
        for (const config of this.mainConfigs) {
            const activityId = Number(config?.activityId);
            if (!Number.isInteger(activityId) || activityId <= 0 || !this.isCurrentActivity(config, now)) continue;
            const lastRequested = this.detailRequestedAt.get(activityId) || 0;
            if (now - lastRequested < 5 * 60 * 1000) continue;
            this.detailRequestedAt.set(activityId, now);
            logger.debug(`[活动管理] 获取活动 ${activityId} 的当前详情`);
            GameNetMgr.inst.sendPbMsg(Protocol.S_ACTIVITY_GET_DATA, { activityId }, null);
        }
    }

    receiveActivityDetail(t) {
        if (Number(t?.ret) !== 0 || !t?.activity) return;
        this.getReward({ activityDataList: [t.activity] });
        this.buyFree({ activityDataList: [t.activity] });
    }

    // 1002 1007 
    getReward(t) {
        if (!isAutomationTaskEnabled('basic.daily-task')) return;
        const acts = t.activityDataList ?? t.activityConditionDataList ?? null;
        if (acts) {
            for (const i of acts) {
                const activityId = i.activityId;
                // 领取所有未领取的奖励
                for (const j of i.conditionDataList || []) {
                    if (!j.isGetReward && String(j.completeTime ?? 0) !== "0") {
                        logger.info(`[活动管理] ${activityId} 满足条件领取奖励: ${j.conditionId}`);
                        GameNetMgr.inst.sendPbMsg(Protocol.S_ACTIVITY_GET_CONDITION_REWARD, { activityId: activityId, conditionId: j.conditionId }, null);
                    }
                }
            }
        }
    }

    // 1002
    buyFree(t) {
        if (!isAutomationTaskEnabled('basic.free-activity-gifts')) return;
        const acts = t.activityDataList;
        if (acts) {
            for (const i of acts) {
                const activityId = i.activityId;
                const mallConfig = i.detailConfig?.commonConfig?.mallConfig || null;
                const boughtCounts = new Map((i.mallBuyCountList || []).map(item => [Number(item.mallId), Number(item.count) || 0]));
                if (mallConfig) {
                    // 100000=0 表示免费领取 有就领
                    mallConfig.filter((item) => item.mallTempMsg?.price === "100000=0").forEach((item) => {
                        const id = item.mallTempMsg.id;
                        const buyLimit = Number(item.mallTempMsg.buyLimit);
                        const bought = boughtCounts.get(Number(id)) || 0;
                        const name = item.mallTempMsg.name;
                        // 不猜测不限购商品的领取次数；有明确上限时仅补领剩余次数。
                        const remaining = Number.isFinite(buyLimit) && buyLimit > 0 ? Math.max(0, buyLimit - bought) : 0;
                        if (!remaining) return;
                        logger.info(`[活动管理] ${activityId} 领取免费礼包 ${name}，剩余 ${remaining} 次`);
                        for (let i = 0; i < remaining; i++) {
                            GameNetMgr.inst.sendPbMsg(Protocol.S_ACTIVITY_BUY_MALL_GOODS, { activityId: activityId, mallId: id, count: "1" }, null);
                        }
                    });
                }
            }
        }
    }
}
