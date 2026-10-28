import GameNetMgr from "#game/net/GameNetMgr.js";
import Protocol from "#game/net/Protocol.js";
import logger from "#utils/logger.js";
import { isAutomationTaskEnabled } from '#game/common/AutomationTaskMgr.js';
import { reportProfile } from '#game/common/ProfileReporter.js';
import { rewardItemAmount } from '#game/common/RewardItems.js';
import account from '#config/runtimeAccount.js';
import { chinaDateKey } from '#game/common/chinaDateKey.js';

export default class PalaceMgr {
    constructor({
        now = () => new Date(),
        initialDailyJade = account.palaceDailyJade,
        report = resources => reportProfile({ resources }),
        log = message => logger.info(message),
    } = {}) {
        this.now = now;
        this.report = report;
        this.log = log;
        this.seenRewards = new WeakSet();
        this.dailyClaimDate = initialDailyJade?.dailyClaimedJadeSource === 'palace'
            ? initialDailyJade.dailyClaimedJadeDate : '';
        this.dailyClaimedJade = Number.isSafeInteger(initialDailyJade?.dailyClaimedJade)
            && initialDailyJade.dailyClaimedJade >= 0 ? initialDailyJade.dailyClaimedJade : 0;
    }

    static isMiracle = false;

    static get inst() {
        if (!this._instance) {
            this._instance = new PalaceMgr();
        }
        return this._instance;
    }

    clear() {}

    recordReward(response, source = '仙宫领奖') {
        if (!response || typeof response !== 'object' || this.seenRewards.has(response)) return;
        this.seenRewards.add(response);
        if (response.ret == null || Number(response.ret) !== 0) return;
        const amount = rewardItemAmount(response.reward, 100000);
        if (amount <= 0) return;
        const date = chinaDateKey(this.now());
        if (this.dailyClaimDate !== date) {
            this.dailyClaimDate = date;
            this.dailyClaimedJade = 0;
        }
        this.dailyClaimedJade += amount;
        this.report({
            dailyClaimedJade: this.dailyClaimedJade,
            dailyClaimedJadeDate: date,
            dailyClaimedJadeSource: 'palace',
        });
        this.log(`[仙宫领玉] ${source}成功：本次 +${amount} 仙玉，当日累计 ${this.dailyClaimedJade} 仙玉（北京时间 ${date}；账号 ${account.username || '未指定'}，区服 ${account.serverId || '未指定'}）`);
    }

    async checkReward(t) {
        if (!isAutomationTaskEnabled('cave.palace')) return;
        for (let i = 0; i < t.data.length; i++) {
            const id = t.data[i].id;
            logger.info(`[仙宫管理] 收获礼物 ${id}`);
            GameNetMgr.inst.sendPbMsg(Protocol.S_PALACE_SEND_GIFT_GET_REWARD, {id: id, getReward: true, type: 1}, null);
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }

    PalaceWorshipRsp(t) {
        this.recordReward(t, '仙宫朝拜');
        if (!isAutomationTaskEnabled('cave.palace')) return;
        if (t.titleId) {
            GameNetMgr.inst.sendPbMsg(Protocol.S_PALACE_WORSHIP, {titleId: t.titleId, isRandom: 0}, null);
        }
    }

    checkWorship(t) {
        if (!isAutomationTaskEnabled('cave.palace')) return;
        logger.debug(`[仙宫管理] 检查崇拜`);
        if (t.worship && t.worshipRandom) {
            GameNetMgr.inst.sendPbMsg(Protocol.S_PALACE_WORSHIP, {titleId: 0, isRandom: 1}, null);
        }
    }

    checkMiracle(t) {
        if (t.miracleId !== 0) {
            logger.info(`[仙宫管理] 已膜拜成功`);
            PalaceMgr.isMiracle = true;
        } else if (isAutomationTaskEnabled('cave.palace')) {
            PalaceMgr.isMiracle = false;
            GameNetMgr.inst.sendPbMsg(Protocol.S_PALACE_WORSHIP, {titleId: 0, isRandom: 1}, null);
        } else {
            PalaceMgr.isMiracle = false;
        }
    }
}
