import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import account from '#config/runtimeAccount.js';
import logger from '#utils/logger.js';
import { ProtobufMgr } from '#game/net/ProtobufMgr.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

class ActivityCompatMgr {
    constructor() {
        this.applyRuntimeConfig();
        this.snapshots = new Map();
        this.discovered = new Set();
        this.responseIndex = null;
        this.requestIndex = null;
        this.persistTimer = null;
    }

    applyRuntimeConfig() {
        const configured = account.activities || {};
        this.config = {
            enabled: configured.enabled !== false,
            logDiscovery: configured.logDiscovery !== false,
            persistSnapshots: configured.persistSnapshots === true,
            snapshotFile: configured.snapshotFile || 'logs/activity-snapshots.json',
            autoClaim: configured.autoClaim === true,
            autoFreeShop: configured.autoFreeShop === true,
            allowCombat: configured.allowCombat === true,
            allowPurchase: configured.allowPurchase === true,
            // 仅由面板根据已勾选任务生成的内部请求白名单。它只放行脚本管理器
            // 已实现的操作，手动协议入口仍走 checkManualRequest 的授权校验。
            internalRequestIds: new Set(
                Array.isArray(configured.internalRequestIds)
                    ? configured.internalRequestIds.filter(Number.isInteger)
                    : [],
            ),
        };
        this.selectedGroups = Array.isArray(configured.selectedGroups)
            ? new Set(configured.selectedGroups)
            : null;
    }

    static get inst() {
        if (!this._instance) this._instance = new ActivityCompatMgr();
        return this._instance;
    }

    buildResponseIndex() {
        if (this.responseIndex) return;
        this.responseIndex = new Map();
        for (const group of ProtobufMgr.inst.activityRegistry) {
            for (const protocol of group.protocols) {
                if (!protocol.responseMethod) continue;
                const key = `${protocol.responseId}:${protocol.responseMethod}`;
                if (!this.responseIndex.has(key)) this.responseIndex.set(key, []);
                this.responseIndex.get(key).push({ group, protocol });
            }
        }
    }

    buildRequestIndex() {
        if (this.requestIndex) return;
        this.requestIndex = new Map();
        for (const group of ProtobufMgr.inst.activityRegistry) {
            for (const protocol of group.protocols) {
                if (!protocol.requestMethod) continue;
                if (!this.requestIndex.has(protocol.id)) this.requestIndex.set(protocol.id, []);
                this.requestIndex.get(protocol.id).push({ group, protocol });
            }
        }
    }

    hasSelectedTasks() {
        // null 表示使用旧版 account.js 配置，保留原有运行方式；空 Set 表示面板明确未选择任务。
        return this.selectedGroups === null || this.selectedGroups.size > 0;
    }

    checkRequest(msgId) {
        if (this.config.internalRequestIds.has(msgId)) return { allowed: true };
        if (this.selectedGroups === null) return { allowed: true };
        if (this.selectedGroups.size === 0) {
            return { allowed: false, reason: '当前用户未选择任何运行任务' };
        }

        this.buildRequestIndex();
        const matches = this.requestIndex.get(msgId) || [];
        const selectedMatches = matches.filter(match => this.selectedGroups.has(match.group.name));
        if (selectedMatches.length === 0) {
            const groups = [...new Set(matches.map(match => match.group.name))];
            return {
                allowed: false,
                reason: groups.length > 0
                    ? `所属玩法未启用：${groups.join(' / ')}`
                    : '该请求不属于已选择的玩法',
            };
        }

        const permitted = selectedMatches.find(({ protocol }) => {
            if (protocol.risk === 'purchase' || protocol.risk === 'transaction') {
                return this.config.allowPurchase;
            }
            if (protocol.risk === 'combat') return this.config.allowCombat;
            return true;
        });
        if (permitted) return { allowed: true };

        const risks = new Set(selectedMatches.map(match => match.protocol.risk));
        if (risks.has('purchase') || risks.has('transaction')) {
            return { allowed: false, reason: '购买与交易类操作未授权' };
        }
        if (risks.has('combat')) return { allowed: false, reason: '战斗类操作未授权' };
        return { allowed: false, reason: '该操作未授权' };
    }

    checkManualRequest(msgId, protocolKey) {
        this.buildRequestIndex();
        const match = (this.requestIndex.get(msgId) || [])
            .find(item => item.protocol.key === protocolKey);
        if (!match) {
            return { allowed: false, reason: '该功能不是已识别的可请求协议' };
        }

        const { risk } = match.protocol;
        if ((risk === 'purchase' || risk === 'transaction') && !this.config.allowPurchase) {
            return { allowed: false, reason: '购买与交易类操作未授权，请先在用户管理中开启' };
        }
        if (risk === 'combat' && !this.config.allowCombat) {
            return { allowed: false, reason: '战斗类操作未授权，请先在用户管理中开启' };
        }
        return { allowed: true, group: match.group, protocol: match.protocol };
    }

    capture(msgId, method, data) {
        if (!this.config.enabled || !method) return;
        this.buildResponseIndex();

        const matches = this.responseIndex.get(`${msgId}:${method}`) || [];
        for (const match of matches) {
            const receivedAt = new Date().toISOString();
            const key = `${match.group.name}:${match.protocol.key}`;
            this.snapshots.set(key, {
                group: match.group.name,
                protocol: match.protocol.key,
                method,
                msgId,
                receivedAt,
                data: this.toSerializable(data),
            });
            if (typeof process.send === 'function' && process.connected) {
                process.send({
                    type: 'activity-observation',
                    group: match.group.name,
                    protocol: match.protocol.key,
                    method,
                    msgId,
                    receivedAt,
                }, () => {});
            }
            if (!this.discovered.has(match.group.name)) {
                this.discovered.add(match.group.name);
                if (this.config.logDiscovery) {
                    logger.info(`[活动兼容] 已接收 ${match.group.name}（不受开放状态过滤）`);
                }
            }
        }

        if (matches.length > 0 && this.config.persistSnapshots) this.schedulePersist();
    }

    toSerializable(value) {
        return JSON.parse(JSON.stringify(value, (_key, item) =>
            typeof item === 'bigint' ? item.toString() : item
        ));
    }

    schedulePersist() {
        if (this.persistTimer) clearTimeout(this.persistTimer);
        this.persistTimer = setTimeout(() => {
            this.persistTimer = null;
            this.persist().catch(error => logger.warn(`[活动兼容] 保存快照失败: ${error.message}`));
        }, 250);
    }

    async persist() {
        const outputPath = path.resolve(projectRoot, this.config.snapshotFile);
        const relative = path.relative(projectRoot, outputPath);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
            throw new Error('snapshotFile 必须位于项目目录内');
        }
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.writeFile(
            outputPath,
            `${JSON.stringify([...this.snapshots.values()], null, 2)}\n`,
            'utf8',
        );
    }

    getSnapshot(groupName, protocolKey) {
        return this.snapshots.get(`${groupName}:${protocolKey}`) || null;
    }

    getSnapshots(groupName = null) {
        return [...this.snapshots.values()]
            .filter(snapshot => !groupName || snapshot.group === groupName)
            .sort((left, right) => Date.parse(right.receivedAt) - Date.parse(left.receivedAt));
    }

    listGroups() {
        return ProtobufMgr.inst.activityRegistry;
    }

    canAutoExecute(risk) {
        if (risk === 'claim') return this.config.autoClaim;
        if (risk === 'combat') return this.config.allowCombat;
        if (risk === 'purchase' || risk === 'transaction') return this.config.allowPurchase;
        return false;
    }
}

export default ActivityCompatMgr;
