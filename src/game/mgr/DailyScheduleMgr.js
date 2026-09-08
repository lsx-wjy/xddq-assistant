import LoopMgr from '#game/common/LoopMgr.js';
import logger from '#utils/logger.js';
import { isAutomationTaskEnabled } from '#game/common/AutomationTaskMgr.js';
import { localDateKey } from '#game/common/localDateKey.js';

export default class DailyScheduleMgr {
    constructor() {
        this.lastRestartDate = '';
        LoopMgr.inst.add(this);
    }

    static get inst() {
        if (!this._instance) this._instance = new DailyScheduleMgr();
        return this._instance;
    }

    clear() {
        LoopMgr.inst.remove(this);
    }

    async loopUpdate() {
        if (!isAutomationTaskEnabled('schedule.daily-restart')) return;
        const now = new Date();
        const dayKey = localDateKey(now);
        const isRestartWindow = now.getHours() === 0 && now.getMinutes() === 0 && now.getSeconds() >= 30;
        if (!isRestartWindow || this.lastRestartDate === dayKey) return;

        this.lastRestartDate = dayKey;
        logger.info('[定时任务] 到达 00:00:30，正在请求重启游戏连接');
        if (typeof process.send === 'function' && process.connected) {
            process.send({ type: 'scheduled-restart' }, () => {});
        }
    }
}
