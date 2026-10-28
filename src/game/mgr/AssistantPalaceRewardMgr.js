import { isAutomationTaskEnabled } from '#game/common/AutomationTaskMgr.js';
import { reportProfile } from '#game/common/ProfileReporter.js';
import GameNetMgr from '#game/net/GameNetMgr.js';
import Protocol from '#game/net/Protocol.js';
import logger from '#utils/logger.js';

const TASK_ID = 'basic.assistant-palace-jade';

const CHINA_TIME_FORMATTER = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
});

export function chinaDateParts(date = new Date()) {
    const values = Object.fromEntries(
        CHINA_TIME_FORMATTER.formatToParts(date)
            .filter(part => part.type !== 'literal')
            .map(part => [part.type, part.value]),
    );
    return {
        dateKey: `${values.year}-${values.month}-${values.day}`,
        hour: Number(values.hour),
        minute: Number(values.minute),
        second: Number(values.second),
    };
}

export function rewardItemAmount(reward, itemId) {
    if (typeof reward !== 'string' || !Number.isInteger(Number(itemId))) return 0;
    const pattern = new RegExp(`(?:^|[^0-9])${Number(itemId)}\\s*=\\s*(\\d+)`, 'g');
    let total = 0;
    for (const match of reward.matchAll(pattern)) {
        const amount = Number(match[1]);
        if (Number.isSafeInteger(amount) && amount > 0) total += amount;
    }
    return total;
}

function recordIsEligible(record, nowMs) {
    if (!record || record.reward === true) return false;
    const rawTime = Number(record.time);
    if (!Number.isFinite(rawTime) || rawTime <= 0) return true;
    const timestampMs = rawTime < 1_000_000_000_000 ? rawTime * 1000 : rawTime;
    return timestampMs <= nowMs;
}

export default class AssistantPalaceRewardMgr {
    constructor({
        now = () => new Date(),
        enabled = () => false,
        ready = () => false,
        sendReward = () => false,
        reportDailyJade = () => {},
        log = () => {},
    } = {}) {
        this.now = now;
        this.enabled = enabled;
        this.ready = ready;
        this.sendReward = sendReward;
        this.reportDailyJade = reportDailyJade;
        this.log = log;
        this.records = null;
        this.recordsDate = '';
        this.inFlight = false;
        this.requestStartedAt = 0;
        this.requestDate = '';
        this.retryAt = 0;
        this.attemptDate = '';
        this.attempts = 0;
        this.completedDate = '';
        this.dailyClaimDate = '';
        this.dailyClaimedJade = 0;
        this.maxDailyAttempts = 6;
    }

    static get inst() {
        if (!this._instance) {
            this._instance = new AssistantPalaceRewardMgr({
                enabled: () => isAutomationTaskEnabled(TASK_ID),
                ready: () => GameNetMgr.inst.loginReady,
                sendReward: callback => GameNetMgr.inst.sendPbMsg(
                    Protocol.S_ASSISTANT_PALACE_AUTO_REWARD,
                    {},
                    callback,
                ),
                reportDailyJade: ({ date, amount }) => reportProfile({ resources: {
                    dailyClaimedJade: amount,
                    dailyClaimedJadeDate: date,
                } }),
                log: (level, message) => {
                    const writer = typeof logger[level] === 'function' ? logger[level] : logger.info;
                    writer.call(logger, `[仙官赐福] ${message}`);
                },
            });
        }
        return this._instance;
    }

    receiveSync(data) {
        this.records = Array.isArray(data?.records) ? data.records.map(record => ({ ...record })) : [];
        const now = this.now();
        const { dateKey, hour } = chinaDateParts(now);
        this.recordsDate = hour >= 22 ? dateKey : '';
        if (this.recordsDate && this.records.length > 0 && this.records.every(record => record.reward === true)) {
            this.completedDate = dateKey;
        }
        this.loopUpdate();
    }

    loopUpdate() {
        if (!this.enabled() || !this.ready()) return;

        const now = this.now();
        const nowMs = now.getTime();
        const { dateKey, hour } = chinaDateParts(now);
        if (hour < 22 || this.completedDate === dateKey) return;

        if (this.attemptDate !== dateKey) {
            this.attemptDate = dateKey;
            this.attempts = 0;
            this.retryAt = 0;
            this.inFlight = false;
            this.requestDate = '';
        }

        if (this.inFlight) {
            if (nowMs - this.requestStartedAt < 30_000) return;
            this.inFlight = false;
            this.retryAt = nowMs + 60_000;
            this.log('warn', '领取请求等待响应超时，将稍后重试');
        }
        if (nowMs < this.retryAt || this.attempts >= this.maxDailyAttempts) return;

        if (this.records !== null && this.recordsDate === dateKey) {
            if (this.records.length === 0) return;
            if (this.records.every(record => record.reward === true)) {
                this.completedDate = dateKey;
                return;
            }
            if (!this.records.some(record => recordIsEligible(record, nowMs))) return;
        }

        this.inFlight = true;
        this.requestStartedAt = nowMs;
        this.requestDate = dateKey;
        const sent = this.sendReward(response => this.receiveRewardResponse(response));
        if (!sent) {
            this.inFlight = false;
            this.retryAt = nowMs + 60_000;
            return;
        }
        this.attempts += 1;
        this.log('info', `正在领取仙官赐福仙玉（第 ${this.attempts} 次请求）`);
    }

    receiveRewardResponse(data) {
        const wasInFlight = this.inFlight;
        this.inFlight = false;
        const now = this.now();
        const nowMs = now.getTime();
        const { dateKey: responseDate } = chinaDateParts(now);
        const claimDate = this.requestDate || responseDate;
        this.requestDate = '';
        const ret = Number(data?.ret);

        if (ret === 0) {
            const claimedJade = wasInFlight ? rewardItemAmount(data?.reward, 100000) : 0;
            if (claimedJade > 0) {
                if (this.dailyClaimDate !== claimDate) {
                    this.dailyClaimDate = claimDate;
                    this.dailyClaimedJade = 0;
                }
                this.dailyClaimedJade += claimedJade;
                this.reportDailyJade({ date: claimDate, amount: this.dailyClaimedJade });
            }
            if (Array.isArray(data?.records) && data.records.length > 0) {
                this.records = data.records.map(record => ({ ...record }));
                this.recordsDate = claimDate;
                if (this.records.every(record => record.reward === true)) this.completedDate = claimDate;
            } else {
                this.completedDate = claimDate;
            }
            this.log('info', `仙官赐福仙玉领取成功${data?.reward ? `：${data.reward}` : ''}`);
            return;
        }

        if (ret === 5202) {
            this.retryAt = nowMs + 60_000;
            this.log('info', '仙官赐福奖励尚未达到领取条件，60 秒后重试');
            return;
        }
        if (ret === 5203) {
            this.completedDate = claimDate;
            this.log('info', '仙官赐福奖励今日已经领取');
            return;
        }

        this.completedDate = claimDate;
        this.log('warn', `仙官赐福领取失败（ret=${Number.isFinite(ret) ? ret : '未知'}），今日不再重试`);
    }
}
