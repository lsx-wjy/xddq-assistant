import account from "#config/runtimeAccount.js";
import initialize from "#loaders/index.js";
import logger from "#utils/logger.js";
import GameNetMgr from "#game/net/GameNetMgr.js";
import { isAutomationTaskEnabled } from '#game/common/AutomationTaskMgr.js';

function toSerializable(value) {
    return JSON.parse(JSON.stringify(value, (_key, item) => {
        if (typeof item === 'bigint') return item.toString();
        if (
            item
            && typeof item === 'object'
            && item.constructor?.name === 'Long'
            && typeof item.toString === 'function'
        ) return item.toString();
        return item;
    }));
}

function sendProtocolResult(payload) {
    if (typeof process.send === 'function' && process.connected) {
        process.send({ type: 'protocol-request-result', ...payload }, () => {});
    }
}

async function applyAutomationConfig(config) {
    if (!config || typeof config !== 'object') {
        throw new Error('自动任务配置格式无效');
    }

    account.switch = { ...account.switch, ...(config.switch || {}) };
    account.rules = Array.isArray(config.rules) ? config.rules : account.rules;
    account.chopTree = { ...account.chopTree, ...(config.chopTree || {}) };
    account.automation = config.automation || account.automation;
    account.activities = { ...account.activities, ...(config.activities || {}) };

    const [{ default: LoopMgr }, { default: PlayerAttributeMgr }, { default: ActivityCompatMgr }] = await Promise.all([
        import('#game/common/LoopMgr.js'),
        import('#game/mgr/PlayerAttributeMgr.js'),
        import('#game/mgr/ActivityCompatMgr.js'),
    ]);

    ActivityCompatMgr.inst.applyRuntimeConfig();
    const playerAttribute = PlayerAttributeMgr.inst;
    playerAttribute.applyAutomationConfig();
    LoopMgr.inst.add(playerAttribute);

    const passiveManagers = [
        ['basic.ad-frog', '#game/mgr/FrogMgr.js'],
        ['basic.destiny-travel', '#game/mgr/DestinyMgr.js'],
        ['cave.ad-spirit', '#game/mgr/SpiritMgr.js'],
        ['cave.ad-magic', '#game/mgr/MagicMgr.js'],
        ['cave.ad-magic-treasure', '#game/mgr/MagicTreasureMgr.js'],
        ['cave.ad-pupil', '#game/mgr/PupilMgr.js'],
        ['cave.ad-gather-energy', '#game/mgr/GatherEnergyMgr.js'],
        ['union.demon-hunt', '#game/mgr/UnionMgr.js'],
        ['schedule.daily-restart', '#game/mgr/DailyScheduleMgr.js'],
        ['basic.assistant-palace-jade', '#game/mgr/AssistantPalaceRewardMgr.js'],
    ];
    for (const [taskId, modulePath] of passiveManagers) {
        if (!isAutomationTaskEnabled(taskId)) continue;
        const { default: Manager } = await import(modulePath);
        LoopMgr.inst.add(Manager.inst);
    }

    const customTaskIds = [
        'basic.chop-tree', 'basic.claim-all-ads', 'basic.fortune-share', 'basic.mail-rewards',
        'cave.pupil-training', 'cave.pupil-management', 'cave.palace',
        // 单项广告任务也要主动请求其状态，不能只在“一键领取全部广告奖励”时生效。
        'cave.ad-pupil', 'cave.ad-gather-energy',
    ];
    if (customTaskIds.some(taskId => isAutomationTaskEnabled(taskId))) {
        const { default: CustomMgr } = await import('#game/mgr/CustomMgr.js');
        const custom = CustomMgr.inst;
        custom.applyAutomationConfig();
        LoopMgr.inst.add(custom);
    }

    const unionTaskIds = ['union.demon-hunt', 'union.ad-reward', 'union.daily-task-reward', 'union.bargain', 'shop.union-purchases'];
    if (unionTaskIds.some(taskId => isAutomationTaskEnabled(taskId))) {
        const { default: UnionMgr } = await import('#game/mgr/UnionMgr.js');
        const union = UnionMgr.inst;
        union.applyAutomationConfig();
        LoopMgr.inst.add(union);
    }

    const activityTaskIds = ['basic.daily-task', 'basic.free-activity-gifts'];
    if (activityTaskIds.some(taskId => isAutomationTaskEnabled(taskId))) {
        const { default: ActivityMgr } = await import('#game/mgr/ActivityMgr.js');
        ActivityMgr.inst.applyAutomationConfig();
    }

    const bagTaskIds = ['challenge.duel', 'basic.use-talent-reishi'];
    if (bagTaskIds.some(taskId => isAutomationTaskEnabled(taskId))) {
        const { default: BagMgr } = await import('#game/mgr/BagMgr.js');
        LoopMgr.inst.add(BagMgr.inst);
    }

    const managedChallenges = [
        ['chapterChallenge', 'chapterShowResult', '#game/mgr/ChapterMgr.js'],
        ['towerChallenge', 'towerShowResult', '#game/mgr/TowerMgr.js'],
        ['secretTowerChallenge', 'secretTowerShowResult', '#game/mgr/SecretTowerMgr.js'],
    ];
    for (const [countKey, resultKey, modulePath] of managedChallenges) {
        const count = Number(account.switch[countKey] || 0);
        if (count <= 0) continue;
        const { default: Manager } = await import(modulePath);
        const manager = Manager.inst;
        manager.challenge = count;
        manager.showResult = account.switch[resultKey] === true;
        LoopMgr.inst.add(manager);
    }

    if (account.switch.herorank === true || isAutomationTaskEnabled('shop.hero-rank-peach')) {
        const { default: HeroRankMgr } = await import('#game/mgr/HeroRankMgr.js');
        const heroRank = HeroRankMgr.inst;
        heroRank.enabled = account.switch.herorank === true;
        LoopMgr.inst.add(heroRank);
    }

    if (account.switch.homeland === true) {
        const { default: HomelandMgr } = await import('#game/mgr/HomelandMgr.js');
        const homeland = HomelandMgr.inst;
        homeland.rules = account.rules;
        homeland.counter.maxFailure = account.automation?.tasks?.['homeland.resource-collection']?.values?.unlimitedRefresh === true
            ? Number.MAX_SAFE_INTEGER
            : 6;
        LoopMgr.inst.add(homeland);
    }

    // 连接后才启动循环：支持“先连接、后勾选任务”的场景。
    if (GameNetMgr.inst.loginReady) LoopMgr.inst.start();
}

process.on('message', message => {
    if (message?.type === 'automation-config') {
        void applyAutomationConfig(message.config).catch(error => {
            logger.error(`[自动任务] 应用配置失败: ${error instanceof Error ? error.message : String(error)}`);
        });
        return;
    }
    if (message?.type !== 'protocol-request') return;
    const { requestId, protocolKey, msgId, mode, payload } = message;

    try {
        const result = GameNetMgr.inst.sendManualProtocol(
            protocolKey,
            Number(msgId),
            { mode: mode || 'auto', payload: payload || {} },
            (response, resolution) => sendProtocolResult({
                requestId,
                protocolKey,
                ok: true,
                response: toSerializable(response),
                parameterSource: resolution.source,
                parameterMessage: resolution.message,
                resolvedPayload: toSerializable(resolution.payload),
            }),
        );
        if (!result.ok) {
            sendProtocolResult({ requestId, protocolKey, ok: false, error: result.error });
        } else if (!result.waitingForResponse) {
            sendProtocolResult({
                requestId,
                protocolKey,
                ok: true,
                response: null,
                message: '请求已发送，该协议没有独立响应消息',
                parameterSource: result.parameterSource,
                parameterMessage: result.parameterMessage,
                resolvedPayload: toSerializable(result.resolvedPayload),
            });
        }
    } catch (error) {
        sendProtocolResult({
            requestId,
            protocolKey,
            ok: false,
            error: error instanceof Error ? error.message : '协议发送失败',
        });
    }
});

async function start() {
    const { username, password, serverId } = account;
    await initialize(username, password, serverId);
}

start().catch((error) => {
    const message = error instanceof Error ? error.message : "登录失败";
    const runtimeError = {
        type: "runtime-error",
        code: Number.isFinite(error?.code) ? error.code : null,
        message,
        forbiddenEndTime: error?.forbiddenEndTime || null,
        retryable: error?.retryable !== false,
    };

    logger.error(message);
    if (typeof process.send === "function") {
        process.send(runtimeError);
    }
    process.exitCode = 1;
});
