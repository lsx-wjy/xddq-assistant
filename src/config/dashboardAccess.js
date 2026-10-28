import { readFileSync } from 'node:fs';

const configFile = new URL('../../config/dashboard-access.json', import.meta.url);

export function parseDashboardAccess(value) {
    if (!value || !Array.isArray(value.allowedUnionIds)
        || !Array.isArray(value.allowedPlatformAccounts)
        || !Number.isSafeInteger(value.maxGameConnections) || value.maxGameConnections < 1
        || [...value.allowedUnionIds, ...value.allowedPlatformAccounts]
            .some(item => typeof item !== 'string' || !item.trim())) {
        throw new Error('访问配置无效：请检查白名单和 maxGameConnections 正整数');
    }
    return {
        allowedUnionIds: value.allowedUnionIds.map(item => item.trim()),
        allowedPlatformAccounts: value.allowedPlatformAccounts.map(item => item.trim().toLowerCase()),
        maxGameConnections: value.maxGameConnections,
    };
}

export function readDashboardAccess() {
    try {
        return parseDashboardAccess(JSON.parse(readFileSync(configFile, 'utf8')));
    } catch (error) {
        throw new Error(`无法读取 config/dashboard-access.json：${error.message}`);
    }
}

export function isPlatformAccountAllowed(config, account) {
    return config.allowedPlatformAccounts.includes(String(account || '').trim().toLowerCase());
}

export function isDashboardUserAllowed(config, account, unionId) {
    return isPlatformAccountAllowed(config, account)
        || config.allowedUnionIds.includes(String(unionId || ''));
}
