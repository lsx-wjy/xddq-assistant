import assert from 'node:assert/strict';

process.env.XDDQ_RUNTIME_ACCOUNT = Buffer.from(JSON.stringify({
    automation: { tasks: { 'cave.palace': { enabled: true } } },
    activities: { selectedGroups: [], allowCombat: false, allowPurchase: false },
    switch: { homeland: false, chopTree: false, challenge: 0 },
})).toString('base64');
const { ProtobufMgr } = await import('../src/game/net/ProtobufMgr.js');
const { default: PalaceMgr } = await import('../src/game/mgr/PalaceMgr.js');
const { default: GameNetMgr } = await import('../src/game/net/GameNetMgr.js');
const { default: Protocol } = await import('../src/game/net/Protocol.js');
await ProtobufMgr.inst.initialize();
const calls = [];
GameNetMgr.inst.sendPbMsg = (id, payload) => {
    const type = ProtobufMgr.inst.getMsg(id, true);
    assert.ok(type, `Missing request schema for ${id}`);
    assert.equal(type.verify(payload), null);
    for (const key of Object.keys(payload)) assert.ok(type.fields[key], `Unknown field ${key}`);
    const bytes = type.encode(payload).finish();
    calls.push({ id, decoded: type.decode(bytes) });
    return true;
};
const palace = PalaceMgr.inst;
palace.checkWorship({ worship: true, worshipRandom: true });
palace.checkMiracle({ miracleId: 0 });
palace.PalaceWorshipRsp({ titleId: 42 });
await palace.checkReward({ data: [{ id: 'offline-gift' }] });
assert.deepEqual(calls.map(c => c.id), [Protocol.S_PALACE_WORSHIP, Protocol.S_PALACE_WORSHIP, Protocol.S_PALACE_WORSHIP, Protocol.S_PALACE_SEND_GIFT_GET_REWARD]);
assert.equal(calls[3].decoded.type, 1);
assert.equal(calls[3].decoded.id, 'offline-gift');
console.log('仙宫流程离线验证通过：膜拜与送礼领奖分开，枚举编码正确；未发出网络请求。');
