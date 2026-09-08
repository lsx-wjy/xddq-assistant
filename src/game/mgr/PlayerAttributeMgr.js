import GameNetMgr from "#game/net/GameNetMgr.js";
import Protocol from "#game/net/Protocol.js";
import logger from "#utils/logger.js";
import LoopMgr from "#game/common/LoopMgr.js";
import { DBMgr } from "#game/common/DBMgr.js";
import BagMgr from "#game/mgr/BagMgr.js";
import account from "#config/runtimeAccount.js";
import { isAutomationTaskEnabled } from '#game/common/AutomationTaskMgr.js';

class Attribute {
    static Chop(times = 1) {
        logger.info(`[砍树] 持续执行：砍树 ${times} 次`);
        return GameNetMgr.inst.sendPbMsg(Protocol.S_ATTRIBUTE_DREAM_MSG, { auto: false, times: times }, null);
    }

    static CheckUnfinishedEquipment() {
        logger.debug(`查看掉落装备`);
        return GameNetMgr.inst.sendPbMsg(Protocol.S_ATTRIBUTE_GET_UNDEAL_EQUIPMENT_MSG, {}, null);
    }

    static FetchSeparation() {
        logger.debug(`获取分身数据`);
        return GameNetMgr.inst.sendPbMsg(Protocol.S_ATTRIBUTE_GET_SEPARATION_DATAA_MSG_LIST_REQ, {}, null);
    }

    static SwitchSeparation(idx) {
        logger.debug(`切换分身 ${idx}`);
        return GameNetMgr.inst.sendPbMsg(Protocol.S_ATTRIBUTE_SWITCH_SEPARATION_REQ, { separationIdx: idx }, null);
    }

    static DealEquipmentEnum_Resolve(id) {
        logger.debug(`粉碎装备`);
        return GameNetMgr.inst.sendPbMsg(Protocol.S_ATTRIBUTE_EQUIPMENT_DEAL_MSG, { type: 1, idList: [id] }, null);
    }

    static DealEquipmentEnum_EquipAndResolveOld(id) {
        logger.debug(`佩戴装备 & 分解旧装备`);
        return GameNetMgr.inst.sendPbMsg(Protocol.S_ATTRIBUTE_EQUIPMENT_DEAL_MSG, { type: 2, idList: [id] }, null);
    }
}

export default class PlayerAttributeMgr {
    constructor() {
        this.AD_REWARD_DAILY_MAX_NUM = 8;                           // 每日最大领取次数
        this.AD_REWARD_CD = 30 * 60 * 1000;                         // 每次间隔时间 (30分钟)
        this.separation = false;                                    // 是否有分身
        this.equipmentData = { 0: [], 1: [], 2: [] };
        this.fightValueData = { 0: [], 1: [], 2: [] };
        this.treeLevel = 1;                                         // 树等级
        this.chopTimes = 1;                                         // 根据树等级计算砍树次数

        this.chopEnabled = account.switch.chopTree || false;        // 用于存储 chopTree 的定时任务
        this.previousPeachNum = 0;                                  // 用于存储上一次的桃子数量

        // 🔒储存状态防止同时砍树和灵脉时候出现问题
        this.isProcessing = false;

        LoopMgr.inst.add(this);
    }

    static isMonthCardVip = false;  // 月卡
    static isYearCardVip = false;   // 终身卡
    static realmsId = 0;            // 等级
    static fightValue = 0;          // 妖力

    static get inst() {
        if (!this._instance) {
            this._instance = new PlayerAttributeMgr();
        }
        return this._instance;
    }

    clear() {
        LoopMgr.inst.remove(this);
    }

    // 201 玩家属性信息同步
    SyncAttribute(t) {
        this.lastAttributeData = t;
        PlayerAttributeMgr.realmsId = t.realmsId;
        PlayerAttributeMgr.fightValue = t.fightValue;
        logger.info(`[属性管理] 等级: ${PlayerAttributeMgr.realmsId} 妖力: ${PlayerAttributeMgr.fightValue}`);
    }

    // 215 同步分身数据
    checkSeparation(t) {
        if (t.ret === 0 && Array.isArray(t.useSeparationDataMsg) && t.useSeparationDataMsg.length === 3) {
            logger.debug("[属性管理] 有分身数据");
            this.separation = true;

            logger.debug("[属性管理] 更新分身数据");
            t.useSeparationDataMsg.forEach((data) => {
                if (data.hasOwnProperty("index")) {
                    this.equipmentData[data.index] = data.equipmentList || [];
                    this.fightValueData[data.index] = data.fightValue ?? PlayerAttributeMgr.fightValue;
                }
            });
        }
    }

    // 209 处理装备。筛选模型按游戏内 DreamAutoMgr.CheckAutoResolve 还原：
    // 非仙树来源的装备暂停；低品质直接分解；命中保留条件时暂停或（明确选择时）换装。
    async handlerEquipment(t) {
        if (!isAutomationTaskEnabled('basic.chop-tree') || t.ret !== 0) return;
        if (this.isProcessing) {
            logger.debug('[砍树] 忙碌中，跳过处理');
            return;
        }

        this.isProcessing = true;
        try {
            const items = Array.isArray(t.undDealEquipmentDataMsg) ? t.undDealEquipmentDataMsg : [];
            for (const equipment of items) {
                const unDealEquipment = equipment?.unDealEquipmentData;
                if (!unDealEquipment?.id) {
                    logger.warn('[装备] 收到缺少装备标识的未处理装备，已跳过本条数据');
                    continue;
                }

                // 官方客户端只会自动处理仙树产出的装备；其余来源由用户确认。
                if (Number(unDealEquipment.src) !== 1) {
                    this.pauseChopTree('检测到非仙树来源的未处理装备，已保留等待手动处理');
                    return;
                }

                const decision = this.evaluateEquipment({
                    quality: Number(unDealEquipment.quality),
                    fightValue: equipment.fightValue,
                    attributeList: Array.isArray(unDealEquipment.attributeList) ? unDealEquipment.attributeList : [],
                });
                const label = this.describeEquipment(unDealEquipment, equipment.fightValue);

                if (decision.action === 'resolve') {
                    logger.info(`[装备] 分解 ${label}：${decision.reason}`);
                    await Attribute.DealEquipmentEnum_Resolve(unDealEquipment.id);
                    continue;
                }

                logger.warn(`[装备] 保留 ${label}：${decision.reason}`);
                if (decision.action === 'equip') {
                    await this.equipMatchedEquipment(unDealEquipment.id, decision.target);
                    logger.info(`[装备] 已自动换装至${this.getSeparationName(decision.target)}，并请求分解旧装备`);
                    Attribute.FetchSeparation();
                    continue;
                }

                this.pauseChopTree('命中装备保留条件，等待你在游戏内确认是否替换');
                return;
            }
        } catch (error) {
            logger.error(`[装备] 处理掉落装备失败: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            this.isProcessing = false;
        }
    }

    getEquipmentRule() {
        const configured = account.chopTree?.equipment || {};
        const groups = Array.isArray(configured.attributeGroups) ? configured.attributeGroups : [];
        const numberInRange = (value, fallback, minimum, maximum) => {
            const number = Number(value);
            return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, Math.round(number))) : fallback;
        };

        return {
            quality: numberInRange(configured.quality, 11, 1, 34),
            keepHigherPower: configured.keepHigherPower === true,
            conditionMode: numberInRange(configured.conditionMode, 1, 0, 1),
            attributeGroups: [0, 1].map(index => {
                const group = groups[index] || {};
                return {
                    enabled: group.enabled === true,
                    attack: numberInRange(group.attack, 0, 0, 10),
                    resistance: numberInRange(group.resistance, 0, 0, 16),
                };
            }),
            matchedAction: numberInRange(configured.matchedAction, 1, 1, 2),
            autoEquipTarget: numberInRange(configured.autoEquipTarget, 0, 0, 2),
        };
    }

    getAutoCostRule() {
        const configured = account.chopTree?.autoCost || {};
        const multiplier = Number(configured.multiplier);
        return {
            enabled: configured.enabled === true,
            multiplier: Number.isFinite(multiplier) ? Math.min(6, Math.max(1, Math.round(multiplier))) : 1,
        };
    }

    evaluateEquipment({ quality, fightValue, attributeList }) {
        const rule = this.getEquipmentRule();
        if (quality < rule.quality) {
            return { action: 'resolve', reason: `品质 ${quality} 低于门槛 ${rule.quality}` };
        }

        const attributesEnabled = rule.attributeGroups.some(group => group.enabled);
        const powerMatched = rule.keepHigherPower && this.isFightValueHigher(fightValue, this.getCurrentFightValue(rule.autoEquipTarget));
        const attributesMatched = attributesEnabled && rule.attributeGroups.some(group =>
            group.enabled && this.matchesAttributeGroup(attributeList, group)
        );
        let shouldKeep = true;

        if (rule.keepHigherPower && attributesEnabled) {
            shouldKeep = rule.conditionMode === 1
                ? powerMatched && attributesMatched
                : powerMatched || attributesMatched;
        } else if (rule.keepHigherPower) {
            shouldKeep = powerMatched;
        } else if (attributesEnabled) {
            shouldKeep = attributesMatched;
        }

        if (!shouldKeep) {
            return { action: 'resolve', reason: this.buildEquipmentReason(rule, powerMatched, attributesMatched, false) };
        }
        return {
            action: rule.matchedAction === 2 ? 'equip' : 'pause',
            target: rule.autoEquipTarget,
            reason: this.buildEquipmentReason(rule, powerMatched, attributesMatched, true),
        };
    }

    matchesAttributeGroup(attributeList, group) {
        const types = new Set(attributeList.map(attribute => Number(attribute?.type)).filter(Number.isFinite));
        const hasAttack = group.attack > 0;
        const hasResistance = group.resistance > 0;
        if (!hasAttack && !hasResistance) return [...types].some(type => type >= 5 && type <= 16);
        if (hasAttack && hasResistance) return types.has(group.attack) && types.has(group.resistance);
        return types.has(hasAttack ? group.attack : group.resistance);
    }

    buildEquipmentReason(rule, powerMatched, attributesMatched, shouldKeep) {
        const parts = [];
        if (rule.keepHigherPower) parts.push(`妖力${powerMatched ? '更高' : '未提升'}`);
        if (rule.attributeGroups.some(group => group.enabled)) parts.push(`属性${attributesMatched ? '命中' : '未命中'}`);
        if (!parts.length) return shouldKeep ? '达到品质门槛，未设置额外筛选条件' : '未命中保留条件';
        return `${parts.join(rule.conditionMode === 1 ? '且' : '或')}${shouldKeep ? '，命中保留条件' : '，未命中保留条件'}`;
    }

    getCurrentFightValue(target) {
        const targetValue = this.fightValueData?.[target];
        if (targetValue !== undefined && !Array.isArray(targetValue) && targetValue !== null) return targetValue;
        return PlayerAttributeMgr.fightValue;
    }

    isFightValueHigher(nextValue, currentValue) {
        const toBigInt = value => {
            const normalized = value && typeof value === 'object' && typeof value.toString === 'function'
                ? value.toString()
                : String(value ?? '0');
            return BigInt(normalized);
        };
        try {
            return toBigInt(nextValue) > toBigInt(currentValue);
        } catch {
            return Number(nextValue) > Number(currentValue);
        }
    }

    describeEquipment(equipment, fightValue) {
        const quality = DBMgr.inst.getEquipmentQuality(equipment.quality) || `品质${equipment.quality}`;
        const name = DBMgr.inst.getEquipmentName(equipment.equipmentId);
        const attributes = (equipment.attributeList || [])
            .map(attribute => `${DBMgr.inst.getAttribute(attribute.type) || `属性${attribute.type}`}:${Number(attribute.value) / 10}`)
            .join('、');
        const detail = account.chopTree?.showResult && attributes ? `，属性 ${attributes}` : '';
        return `${quality} ${name}（妖力 ${String(fightValue ?? 0)}${detail}）`;
    }

    async equipMatchedEquipment(id, target) {
        if (this.separation) await Attribute.SwitchSeparation(target);
        await Attribute.DealEquipmentEnum_EquipAndResolveOld(id);
    }

    getSeparationName(index) {
        return ['元体', '阳神', '阴身'][index] || '当前角色';
    }

    pauseChopTree(reason) {
        this.chopEnabled = false;
        logger.warn(`[砍树] 已暂停：${reason}`);
    }

    doChopTree() {
        const item = BagMgr.inst.findItemById(100004);
        const peachCount = Number(item?.num) || 0;
        const stopPeachCount = Number(account.chopTree.stop.num) || 0;
        const stopLevel = Number(account.chopTree.stop.level) || Number.MAX_SAFE_INTEGER;
        const playerLevel = Number(PlayerAttributeMgr.realmsId) || 0;
        if (peachCount < stopPeachCount || playerLevel >= stopLevel) {
            const reason = peachCount < stopPeachCount
                ? `桃子 ${peachCount} 低于下限 ${stopPeachCount}`
                : `角色等级 ${playerLevel} 已达到停止等级 ${stopLevel}`;
            logger.warn(`[砍树] 已停止：${reason}`);
            this.chopEnabled = false;
            return;
        }

        if (peachCount !== this.previousPeachNum) {
            logger.info(`[砍树] 剩余 ${peachCount} 桃子，仙树 Lv.${this.treeLevel}`);
            this.previousPeachNum = peachCount;
        }
        // The client exposes this as “自动消耗倍率”.  The tree level determines
        // the highest usable value; the saved preference can only lower it.
        const autoCost = this.getAutoCostRule();
        const chopTimes = autoCost.enabled
            ? Math.min(this.chopTimes, autoCost.multiplier)
            : 1;
        Attribute.Chop(chopTimes);
        Attribute.CheckUnfinishedEquipment();
    }

    // 207 仙树初始化以及自动升级
    SyncTree(t) {
        this.lastTreeData = t;
        this.getAdRewardTimes = t.freeSpeedUpTimes || 0;
        this.dreamLvUpEndTime = parseInt(t.dreamLvUpEndTime, 10) || 0;
        this.lastAdRewardTime = parseInt(t.freeSpeedUpCdEndTime, 10) || 0;
        this.treeLevel = t.dreamLv;
        this.calculateMultiplier(this.treeLevel);
    }

    calculateMultiplier(treeLevel) {
        if (treeLevel >= 22) {
            this.chopTimes = 6;
        } else if (treeLevel >= 19) {
            this.chopTimes = 5;
        } else if (treeLevel >= 17) {
            this.chopTimes = 4;
        } else if (treeLevel >= 12) {
            this.chopTimes = 3;
        } else if (treeLevel >= 9) {
            this.chopTimes = 2;
        } else {
            this.chopTimes = 1;
        }
    }

    processReward() {
        if (!isAutomationTaskEnabled('basic.tree-speedup')) return;
        const now = Date.now();
        if (this.getAdRewardTimes < this.AD_REWARD_DAILY_MAX_NUM && now - this.lastAdRewardTime >= this.AD_REWARD_CD && this.dreamLvUpEndTime !== 0) {
            logger.info(`[仙树管理] 还剩 ${this.AD_REWARD_DAILY_MAX_NUM - this.getAdRewardTimes} 次广告激励`);

            GameNetMgr.inst.sendPbMsg(Protocol.S_ATTRIBUTE_DREAM_LV_UP_SPEED_UP, { speedUpType: 1, useTimes: 1, isUseADTime: false }, null);
            this.getAdRewardTimes++;
            this.lastAdRewardTime = now;
        }
    }

    // 104 判断是否VIP
    SyncVip(t) {
        this.lastPrivilegeCardData = t;
        const monthlyCardExpired = this.isExpired(t.monthlyCardEndTime);
        const getMonthlyCardRewardToday = this.isToday(t.getMonthlyCardRewardTime);
        const yearCardExpired = this.isYearCardEndTimeNegativeOne(t.yearCardEndTime);
        const getYearCardRewardToday = this.isToday(t.getYearCardRewardTime);

        if (!monthlyCardExpired) {
            logger.info(`[玩家管理] 检测到月卡`);
            PlayerAttributeMgr.isMonthCardVip = true;
            if (isAutomationTaskEnabled('basic.vip-month') && !getMonthlyCardRewardToday) {
                logger.info(`[玩家管理] 月卡领取奖励`);
                GameNetMgr.inst.sendPbMsg(Protocol.S_PRIVILEGE_CARD_RECEIVE_REWARD, { type: 1 }, null);
            }
        }

        if (!yearCardExpired) {
            logger.info(`[玩家管理] 检测到年卡`);
            PlayerAttributeMgr.isYearCardVip = true;
            if (isAutomationTaskEnabled('basic.vip-year') && !getYearCardRewardToday) {
                logger.info(`[玩家管理] 年卡领取奖励`);
                GameNetMgr.inst.sendPbMsg(Protocol.S_PRIVILEGE_CARD_RECEIVE_REWARD, { type: 2 }, null);
            }
        }
    }

    isExpired(timestamp) {
        const now = Date.now();
        return parseInt(timestamp, 10) < now;
    }

    isToday(timestamp) {
        const date = new Date(parseInt(timestamp, 10));
        const today = new Date();
        return date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
    }

    isYearCardEndTimeNegativeOne(timestamp) {
        return !(Number(timestamp) !== 0);
    }

    applyAutomationConfig() {
        this.chopEnabled = isAutomationTaskEnabled('basic.chop-tree');
        if (this.lastPrivilegeCardData) this.SyncVip(this.lastPrivilegeCardData);
    }

    async loopUpdate() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            // 自动升级仙树
            this.processReward();

            // 自动砍树
            if (this.chopEnabled) {
                this.doChopTree();
            }
        } catch (error) {
            logger.error(`[PlayerAttributeMgr] loopUpdate error: ${error}`);
        } finally {
            this.isProcessing = false;
        }
    }
}
