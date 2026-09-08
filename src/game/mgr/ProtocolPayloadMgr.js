import ActivityCompatMgr from '#game/mgr/ActivityCompatMgr.js';
import { ProtobufMgr } from '#game/net/ProtobufMgr.js';
import Long from 'long';

const SCRIPT_PAYLOADS = new Map([
    ['S_HOMELAND_REFRESH_RESOURCE', { type: 1, position: -1, itemId: 0, isUseADTime: false }],
    ['S_RANK_BATTLE_CHALLENGE', { index: 0 }],
    ['S_ACTIVITY_SHARE', { activityId: 0, conditionId: 0 }],
    ['S_ACTIVITY_BBS', { activityId: 0, conditionId: 0 }],
    ['S_ACTIVITY_GAME_CIRCLE', { activityId: 0, conditionId: 0 }],
    ['S_PUPIL_TRAIN', { isOneKey: 1 }],
    ['S_PUPIL_GET_AD_REWARD', { isUseADTime: false }],
    ['S_AD_REWARD_GET_REWARD', { isUseADTime: false }],
    ['S_GATHER_ENERGY_GET_AD_AWARD', { isUseADTime: false }],
    ['S_SECRETTOWER_FIGHT', { type: 1 }],
    ['S_SPIRIT_DRAW', { drawTimes: 1, isAd: true, isUseADTime: false }],
    ['S_MAGIC_DERIVATION', { times: 1, isAd: true, isUseADTime: false }],
    ['S_HERORANK_GET_FIGHT_LIST', { type: 0 }],
    ['S_ATTRIBUTE_DREAM_MSG', { auto: false, times: 1 }],
    ['S_ATTRIBUTE_DREAM_LV_UP_SPEED_UP', { speedUpType: 1, useTimes: 1, isUseADTime: false }],
    ['S_TOWER_VIEW_SAVE_SELECT', {
        markPreference: [
            { priority: 1, skillType: 1017 },
            { priority: 2, skillType: 1018 },
            { priority: 3, skillType: 1023 },
            { priority: 4, skillType: 1024 },
            { priority: 5, skillType: 1022 },
        ],
    }],
    ['S_TOWER_SELECT_BUFF', { index: 0, isOneKey: true }],
    ['S_TOWER_CHALLENGE', { index: 0, isOneKey: true }],
    ['S_UNION_GETDAILYTASK', { actIndex: 4 }],
    ['S_WATCH_AD_TASK', { activityId: 0, conditionId: 120006, isUseADTime: false }],
    ['S_TASK_GET_REWARD', { taskId: [120006] }],
]);

function clonePayload(payload) {
    return JSON.parse(JSON.stringify(payload));
}

function hasValue(value) {
    return value !== null && value !== undefined && value !== '';
}

function asFiniteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function asInt64(value) {
    if (Long.isLong(value)) return value;
    if (!hasValue(value)) return null;
    try {
        return Long.fromString(String(value));
    } catch (_error) {
        return null;
    }
}

function isSuccessfulResponse(data) {
    return data?.ret === undefined || Number(data.ret) === 0;
}

function isToday(timestamp) {
    const value = asFiniteNumber(timestamp);
    if (value === null) return false;
    const date = new Date(value);
    const today = new Date();
    return date.getFullYear() === today.getFullYear()
        && date.getMonth() === today.getMonth()
        && date.getDate() === today.getDate();
}

class ProtocolPayloadMgr {
    static get inst() {
        if (!this._instance) this._instance = new ProtocolPayloadMgr();
        return this._instance;
    }

    resolve({ protocolKey, msgId, mode = 'auto', payload = {}, playerId }) {
        const requestType = ProtobufMgr.inst.getMsg(msgId, true);
        if (!requestType) {
            return { ok: false, error: '没有可用的请求 protobuf 定义，暂时不能运行该功能' };
        }

        if (mode === 'advanced') {
            return this.verify(requestType, payload, 'advanced', '使用高级参数');
        }

        const dynamicResolver = this.dynamicResolvers[protocolKey];
        if (dynamicResolver) {
            const resolved = dynamicResolver.call(this, playerId);
            if (!resolved.ok) return resolved;
            return this.verify(requestType, resolved.payload, resolved.source, resolved.message);
        }

        if (SCRIPT_PAYLOADS.has(protocolKey)) {
            return this.verify(
                requestType,
                clonePayload(SCRIPT_PAYLOADS.get(protocolKey)),
                'script',
                '已使用原脚本的请求参数',
            );
        }

        const defaultPayload = {};
        const verificationError = requestType.verify(defaultPayload);
        if (!verificationError) {
            return {
                ok: true,
                payload: defaultPayload,
                source: 'protocol-default',
                message: requestType.fieldsArray.length === 0
                    ? '该功能不需要参数'
                    : '已使用协议默认参数',
            };
        }

        const requiredFields = requestType.fieldsArray
            .filter(field => field.required)
            .map(field => field.name);
        return {
            ok: false,
            error: requiredFields.length > 0
                ? `原脚本尚未实现此功能的自动取参，当前缺少：${requiredFields.join('、')}`
                : `无法自动生成请求参数：${verificationError}`,
        };
    }

    verify(requestType, payload, source, message) {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            return { ok: false, error: '请求参数必须是 JSON 对象' };
        }
        const verificationError = requestType.verify(payload);
        if (verificationError) {
            return {
                ok: false,
                error: source === 'advanced'
                    ? `高级参数不符合协议：${verificationError}`
                    : `脚本自动参数不符合协议：${verificationError}`,
            };
        }
        return { ok: true, payload, source, message };
    }

    latestSnapshot(groupName, predicate = () => true) {
        return ActivityCompatMgr.inst.getSnapshots(groupName)
            .find(snapshot => isSuccessfulResponse(snapshot.data) && predicate(snapshot)) || null;
    }

    resolveHomelandEnter(playerId) {
        const exploration = this.latestSnapshot('Homeland', snapshot =>
            ['S_HOMELAND_EXPLORE', 'S_HOMELAND_EXPLORE_REFRESH'].includes(snapshot.protocol)
            && snapshot.data?.exploreData
        );
        const exploreData = exploration?.data?.exploreData;
        const candidates = [
            ...(exploreData?.nearHomeland || []),
            ...(exploreData?.enemy || []),
        ];
        const target = candidates.find(candidate =>
            !candidate.isInCollecting
            && hasValue(candidate.playerInfo?.playerId)
            && Array.isArray(candidate.rewardId)
            && candidate.rewardId.length > 0
        );
        if (target) {
            return {
                ok: true,
                payload: { playerId: asInt64(target.playerInfo.playerId) },
                source: 'snapshot',
                message: '已从福地探寻结果选择可查看的福地',
            };
        }
        if (hasValue(playerId)) {
            return {
                ok: true,
                payload: { playerId: asInt64(playerId) },
                source: 'runtime',
                message: '未发现探寻目标，已进入当前角色自己的福地',
            };
        }
        return { ok: false, error: '尚未取得角色 ID，请等待角色数据同步完成' };
    }

    resolveHomelandDispatch(playerId) {
        const snapshot = this.latestSnapshot('Homeland', item => item.data?.homeland?.reward);
        const homeland = snapshot?.data?.homeland;
        if (!homeland) {
            return { ok: false, error: '缺少福地详情，请先运行“福地探寻”，再运行“进入福地”' };
        }

        const workerSnapshot = this.latestSnapshot('Homeland', item =>
            item.protocol === 'S_HOMELAND_SYNC_MSG'
        );
        if (workerSnapshot && Number(workerSnapshot.data?.freeWorkerNum || 0) < 1) {
            return { ok: false, error: '当前没有空闲鼠宝，无法自动派遣' };
        }
        if (workerSnapshot && Number(workerSnapshot.data?.energy || 0) < 1) {
            return { ok: false, error: '当前福地体力不足，无法自动派遣' };
        }

        const targetPlayerId = homeland.owner?.playerId;
        const reward = homeland.reward.find(item => {
            const rewardText = String(item.reward ?? '');
            return Number.isInteger(Number(item.pos))
                && hasValue(targetPlayerId)
                && rewardText.includes('=')
                && rewardText !== '-1'
                && !item.owner
                && !item.enemy
                && (item.isOnlyOwnerPull !== true || String(targetPlayerId) === String(playerId));
        });
        if (!reward) {
            return {
                ok: false,
                error: '当前福地没有可安全派遣的位置，请重新运行“福地探寻”和“进入福地”',
            };
        }
        return {
            ok: true,
            payload: {
                playerId: asInt64(targetPlayerId),
                pos: Number(reward.pos),
                workerNum: 1,
            },
            source: 'snapshot',
            message: `已从福地详情选择第 ${Number(reward.pos) + 1} 个可派遣位置`,
        };
    }

    resolveTalentReadBook() {
        const snapshot = this.latestSnapshot(null, item => Array.isArray(item.data?.bagData));
        const books = snapshot?.data?.bagData?.find(item => Number(item.propId) === 100008);
        const readTimes = asFiniteNumber(books?.num);
        if (!readTimes || readTimes < 1) {
            return { ok: false, error: '背包中没有可用的万年灵芝，或尚未收到背包数据' };
        }
        return {
            ok: true,
            payload: { readTimes: Math.min(Math.trunc(readTimes), 2_147_483_647) },
            source: 'snapshot',
            message: `已按背包数量自动设置使用 ${Math.trunc(readTimes)} 个万年灵芝`,
        };
    }

    resolveDestinyTravel() {
        const snapshot = this.latestSnapshot('Attribute', item =>
            item.protocol === 'S_ATTRIBUTE_DATA_SYNC_MSG'
            && hasValue(item.data?.realmsId)
        );
        return {
            ok: true,
            payload: { isOneKey: Number(snapshot?.data?.realmsId || 0) >= 156 },
            source: snapshot ? 'snapshot' : 'script',
            message: snapshot
                ? '已按当前境界判断是否使用一键游历'
                : '尚未取得境界数据，已按原脚本使用普通游历',
        };
    }

    resolvePrivilegeCardReward() {
        const snapshot = this.latestSnapshot('PrivilegeCard', item =>
            item.protocol === 'S_PRIVILEGE_CARD_SYNC_DATA'
        );
        const data = snapshot?.data;
        if (!data) return { ok: false, error: '缺少特权卡状态，请等待登录数据同步完成' };

        const monthlyActive = Number(data.monthlyCardEndTime || 0) >= Date.now();
        if (monthlyActive && !isToday(data.getMonthlyCardRewardTime)) {
            return {
                ok: true,
                payload: { type: 1 },
                source: 'snapshot',
                message: '已检测到今日尚未领取的月卡奖励',
            };
        }
        const yearActive = Number(data.yearCardEndTime || 0) !== 0;
        if (yearActive && !isToday(data.getYearCardRewardTime)) {
            return {
                ok: true,
                payload: { type: 2 },
                source: 'snapshot',
                message: '已检测到今日尚未领取的年卡奖励',
            };
        }
        return { ok: false, error: '当前没有可领取的月卡或年卡奖励' };
    }

    resolveEquipmentDeal() {
        const snapshot = this.latestSnapshot('Attribute', item =>
            item.protocol === 'S_ATTRIBUTE_GET_UNDEAL_EQUIPMENT_MSG'
        );
        if (!snapshot) {
            return { ok: false, error: '缺少待处理装备，请先运行“获取未处理装备数据”' };
        }
        return {
            ok: false,
            error: '原脚本会比较品质、属性和分身装备后决定换装或分解，不能安全地把它简化成一次盲目请求',
        };
    }

    resolveMallPurchase() {
        return {
            ok: false,
            error: '原脚本在不同玩法中购买的商品不同；当前功能没有唯一商品目标，已阻止自动猜测购买',
        };
    }

    resolveHeroRankFight() {
        const snapshot = this.latestSnapshot('HeroRank', item =>
            item.protocol === 'S_HERORANK_GET_FIGHT_LIST'
            && item.data?.fightPlayerList?.canFightPlayerInfoList?.length > 0
        );
        const players = snapshot?.data?.fightPlayerList?.canFightPlayerInfoList || [];
        const player = players.find(item => item.showInfo?.nickName?.startsWith('HeroRank_Name'))
            || players[0];
        if (!player) {
            return { ok: false, error: '缺少挑战者列表，请先运行“请求挑战者列表”' };
        }
        return {
            ok: true,
            payload: {
                targetId: Long.ZERO,
                targetRank: player.rank,
                masterId: player.masterId,
                masterLv: player.masterLv,
                appearanceId: player.showInfo?.appearanceId,
                cloudId: player.showInfo?.equipCloudId,
            },
            source: 'snapshot',
            message: '已按原脚本规则从挑战者列表选择目标',
        };
    }

    resolveMagicTreasureDraw() {
        const snapshot = this.latestSnapshot('MagicTreasure', item => {
            const data = item.data?.syncMsg || item.data;
            return Array.isArray(data?.jackpotData) && Array.isArray(data?.jackpotConfig);
        });
        const data = snapshot?.data?.syncMsg || snapshot?.data;
        if (!data) return { ok: false, error: '缺少法宝奖池数据，请等待玩家法宝数据同步' };

        const configs = new Map((data.jackpotConfig || []).map(item => [Number(item.poolId), item]));
        const pool = (data.jackpotData || []).find(item => {
            const config = configs.get(Number(item.poolId));
            return Number(item.freeDrawTimes || 0) < Number(config?.freeTimes ?? 2);
        }) || (data.jackpotData || []).find(item => Number(item.adFreeTimes || 0) < 2);
        if (!pool) return { ok: false, error: '当前法宝奖池没有可用的免费或广告抽取次数' };

        const config = configs.get(Number(pool.poolId));
        const freeAvailable = Number(pool.freeDrawTimes || 0) < Number(config?.freeTimes ?? 2);
        const itemId = asFiniteNumber(String(config?.drawItemCostParam || '').split('=')[0]);
        return {
            ok: true,
            payload: freeAvailable
                ? { drawTimes: 1, isAd: false, poolId: pool.poolId, ...(itemId ? { itemId } : {}) }
                : { drawTimes: 1, isAd: true, poolId: pool.poolId, isUseADTime: false },
            source: 'snapshot',
            message: freeAvailable ? '已选择可免费抽取的法宝奖池' : '已选择可用的广告抽取次数',
        };
    }

    resolvePupilGraduate() {
        const snapshot = this.latestSnapshot('Pupil', item => Array.isArray(item.data?.siteList));
        const site = snapshot?.data?.siteList?.find(item =>
            item.pupilData
            && item.trainTimeInfo
            && Number(item.pupilData.level || 0) * 20 <= Number(item.trainTimeInfo.trainTimes || 0)
        );
        if (!site) return { ok: false, error: '当前没有可出师弟子，请先运行“进入宗门系统”刷新弟子状态' };
        return {
            ok: true,
            payload: { siteIndex: site.index },
            source: 'snapshot',
            message: `已选择可出师的第 ${Number(site.index) + 1} 个位置`,
        };
    }

    resolvePalaceWorship() {
        const snapshot = this.latestSnapshot('Palace', item => Array.isArray(item.data?.palaceData));
        const palace = snapshot?.data?.palaceData?.find(item => item.show && !item.worship);
        if (!palace) return { ok: false, error: '缺少可膜拜仙宫数据，请先运行“进入仙宫外部”' };
        return {
            ok: true,
            payload: { titleId: palace.titleId, isRandom: 0 },
            source: 'snapshot',
            message: '已从仙宫数据选择尚未膜拜的称号',
        };
    }

    resolvePalaceGiftReward() {
        const snapshot = this.latestSnapshot('Palace', item =>
            item.protocol === 'S_PALACE_SEND_GIFT_SYNC_DATA'
            && Array.isArray(item.data?.data)
        );
        const gift = snapshot?.data?.data?.find(item => hasValue(item.id));
        if (!gift) return { ok: false, error: '当前没有可领取的仙宫礼物，请等待送福数据同步' };
        return {
            ok: true,
            payload: { id: gift.id, getReward: true, type: 1 },
            source: 'snapshot',
            message: '已从仙宫送福数据选择一份未领取礼物',
        };
    }

    dynamicResolvers = {
        S_HOMELAND_ENTER: this.resolveHomelandEnter,
        S_HOMELAND_DISPATCH_WORKER: this.resolveHomelandDispatch,
        S_HOMELAND_DISPATCH_WORKER_PREVIEW: this.resolveHomelandDispatch,
        S_TALENT_READ_BOOK: this.resolveTalentReadBook,
        S_DESTINY_TRAVEL: this.resolveDestinyTravel,
        S_PRIVILEGE_CARD_RECEIVE_REWARD: this.resolvePrivilegeCardReward,
        S_ATTRIBUTE_EQUIPMENT_DEAL_MSG: this.resolveEquipmentDeal,
        S_MALL_BUY_GOODS: this.resolveMallPurchase,
        S_HERORANK_FIGHT: this.resolveHeroRankFight,
        S_MAGIC_TREASURE_DRAW_REQ: this.resolveMagicTreasureDraw,
        S_PUPIL_GRADUATE: this.resolvePupilGraduate,
        S_PALACE_WORSHIP: this.resolvePalaceWorship,
        S_PALACE_SEND_GIFT_GET_REWARD: this.resolvePalaceGiftReward,
    };
}

export default ProtocolPayloadMgr;
