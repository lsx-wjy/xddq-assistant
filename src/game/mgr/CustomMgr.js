import GameNetMgr from "#game/net/GameNetMgr.js";
import Protocol from "#game/net/Protocol.js";
import logger from "#utils/logger.js";
import LoopMgr from "#game/common/LoopMgr.js";
import { isAutomationTaskEnabled } from '#game/common/AutomationTaskMgr.js';

export default class CustomMgr {
    constructor() {
        this.CUSTOM_INTERVAL = 1000 * 60 * 10; // 每次间隔时间(10分钟)
        this.lastExecuteTime = 0;
        this.initialized = false;
        
        this.isProcessing = false;

        LoopMgr.inst.add(this);
    }

    static get inst() {
        if (!this._instance) {
            this._instance = new CustomMgr();
        }
        return this._instance;
    }

    clear() {
        LoopMgr.inst.remove(this);
    }

    init() {
        if (!this.initialized) {
            let initializedTask = false;
            if (isAutomationTaskEnabled('basic.claim-all-ads')) {
                logger.info("[自定义管理] 请求聚灵阵广告奖励状态");
                GameNetMgr.inst.sendPbMsg(Protocol.S_GATHER_ENERGY_ENTER_NEW, {}, null);
                initializedTask = true;
            }
            if (isAutomationTaskEnabled('basic.fortune-share')) {
                logger.info("[自定义管理] 执行灵兽运势免费奖励");
                GameNetMgr.inst.sendPbMsg(Protocol.S_ACTIVITY_SHARE, { activityId: 0, conditionId: 0 }, null);
                GameNetMgr.inst.sendPbMsg(Protocol.S_ACTIVITY_BBS, { activityId: 0, conditionId: 0 }, null);
                GameNetMgr.inst.sendPbMsg(Protocol.S_ACTIVITY_GAME_CIRCLE, { activityId: 0, conditionId: 0 }, null);
                initializedTask = true;
            }
            if (isAutomationTaskEnabled('basic.chop-tree')) {
                GameNetMgr.inst.sendPbMsg(Protocol.S_ATTRIBUTE_GET_SEPARATION_DATAA_MSG_LIST_REQ, {}, null);
                initializedTask = true;
            }
            if (
                isAutomationTaskEnabled('cave.pupil-training')
                || isAutomationTaskEnabled('cave.pupil-management')
                || isAutomationTaskEnabled('cave.ad-pupil')
            ) {
                logger.info('[自定义管理] 请求宗门弟子当前状态');
                GameNetMgr.inst.sendPbMsg(Protocol.S_PUPIL_ENTER, {}, null);
                initializedTask = true;
            }
            if (isAutomationTaskEnabled('basic.mail-rewards')) {
                logger.info('[自定义管理] 请求一键领取邮件附件');
                GameNetMgr.inst.sendPbMsg(Protocol.S_MAIL_GET_ALL_REWARD, {}, null);
                initializedTask = true;
            }
            if (initializedTask) logger.info("[自定义管理] 已初始化已选任务");
            this.initialized = true;
        }
    }

    applyAutomationConfig() {
        this.initialized = false;
        this.lastExecuteTime = 0;
        this.init();
    }

    customLoop() {
        const now = Date.now();
        if (now - this.lastExecuteTime >= this.CUSTOM_INTERVAL) {
            this.lastExecuteTime = now;
            if (isAutomationTaskEnabled('cave.pupil-training') || isAutomationTaskEnabled('cave.pupil-management')) {
                logger.info("[自定义管理] 刷新宗门弟子状态");
                GameNetMgr.inst.sendPbMsg(Protocol.S_PUPIL_ENTER, {}, null);
            }
            if (isAutomationTaskEnabled('cave.palace')) {
                logger.info("[自定义管理] 请求仙宫数据");
                GameNetMgr.inst.sendPbMsg(Protocol.S_PALACE_ENTER_OUTER, {}, null);
            }
        }    
    }

    async loopUpdate() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            this.customLoop();
        } catch (error) {
            logger.error(`[自定义管理] loopUpdate error: ${error}`);
        } finally {
            this.isProcessing = false;
        }
    }
}
