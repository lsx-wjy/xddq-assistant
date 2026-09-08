import account from '#config/runtimeAccount.js';

const adRewardTaskIds = new Set([
    'basic.ad-frog',
    'cave.ad-spirit',
    'cave.ad-magic',
    'cave.ad-magic-treasure',
    'cave.ad-pupil',
    'cave.ad-gather-energy',
    'union.ad-reward',
]);

export function isAutomationTaskEnabled(taskId) {
    return account.automation?.tasks?.[taskId]?.enabled === true
        || (adRewardTaskIds.has(taskId)
            && account.automation?.tasks?.['basic.claim-all-ads']?.enabled === true);
}

export function automationTaskValue(taskId, key, fallback = false) {
    const value = account.automation?.tasks?.[taskId]?.values?.[key];
    return value === undefined ? fallback : value;
}
