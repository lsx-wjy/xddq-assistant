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
