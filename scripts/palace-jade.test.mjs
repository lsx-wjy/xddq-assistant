import assert from 'node:assert/strict'
import test from 'node:test'
import PalaceMgr from '../src/game/mgr/PalaceMgr.js'
import MsgRecvMgr from '../src/game/common/MsgRecvMgr.js'
import GameNetMgr from '../src/game/net/GameNetMgr.js'
import ActivityCompatMgr from '../src/game/mgr/ActivityCompatMgr.js'

test('朝拜和送福领奖响应都累计实际仙玉，其他道具和失败响应不计入', () => {
  const reports = []
  const manager = new PalaceMgr({
    now: () => new Date('2026-10-28T12:00:00Z'),
    report: resources => reports.push(resources),
    initialDailyJade: null,
    log: () => {},
  })
  const prior = PalaceMgr._instance
  PalaceMgr._instance = manager
  try {
    MsgRecvMgr.PalaceWorshipRsp({ ret: 0, reward: '100000=120|100004=5' })
    const giftResponse = { ret: 0n, reward: '100000=30' }
    MsgRecvMgr.GetSendGiftRewardRsp(giftResponse)
    MsgRecvMgr.GetSendGiftRewardRsp(giftResponse)
    MsgRecvMgr.GetSendGiftRewardRsp({ ret: 4805n, reward: '100000=999' })
    MsgRecvMgr.GetSendGiftRewardRsp({ ret: 0, reward: '100004=100' })
    assert.deepEqual(reports, [
      { dailyClaimedJade: 120, dailyClaimedJadeDate: '2026-10-28', dailyClaimedJadeSource: 'palace' },
      { dailyClaimedJade: 150, dailyClaimedJadeDate: '2026-10-28', dailyClaimedJadeSource: 'palace' },
    ])
  } finally {
    PalaceMgr._instance = prior
  }
})

test('当日领玉以北京时间午夜为边界，重新连接后继承同日仙宫统计', () => {
  let now = new Date('2026-10-28T15:59:59Z')
  const reports = []
  const manager = new PalaceMgr({
    now: () => now,
    report: resources => reports.push(resources),
    initialDailyJade: {
      dailyClaimedJade: 200, dailyClaimedJadeDate: '2026-10-28', dailyClaimedJadeSource: 'palace',
    },
    log: () => {},
  })
  manager.recordReward({ ret: 0, reward: '100000=50' })
  assert.equal(reports.at(-1).dailyClaimedJade, 250)
  now = new Date('2026-10-28T16:00:01Z')
  manager.recordReward({ ret: 0, reward: '100000=30' })
  assert.deepEqual(reports.at(-1), {
    dailyClaimedJade: 30, dailyClaimedJadeDate: '2026-10-29', dailyClaimedJadeSource: 'palace',
  })
})

test('旧聚宝盆计数不混入仙宫统计，各角色管理器分别累计', () => {
  const reports = []
  const manager = new PalaceMgr({
    now: () => new Date('2026-10-28T12:00:00Z'),
    report: resources => reports.push(resources),
    initialDailyJade: { dailyClaimedJade: 999, dailyClaimedJadeDate: '2026-10-28' },
    log: () => {},
  })
  manager.recordReward({ ret: 0, reward: '100000=20' })
  assert.equal(reports.at(-1).dailyClaimedJade, 20)
  const other = new PalaceMgr({
    now: () => new Date('2026-10-28T12:00:00Z'),
    report: resources => reports.push(resources), initialDailyJade: null,
    log: () => {},
  })
  other.recordReward({ ret: 0, reward: '100000=10' })
  assert.equal(reports.at(-1).dailyClaimedJade, 10)
})

test('手动回调截获朝拜/送福响应时仍计数，同一响应经过默认处理器不会重复计数或写日志', t => {
  const reports = []
  const logs = []
  const manager = new PalaceMgr({
    now: () => new Date('2026-10-28T12:00:00Z'),
    report: resources => reports.push(resources), initialDailyJade: null,
    log: message => logs.push(message),
  })
  const prior = PalaceMgr._instance
  PalaceMgr._instance = manager
  t.mock.method(ActivityCompatMgr.inst, 'capture', () => {})
  const game = new GameNetMgr()
  game.accessPending = false
  let callbacks = 0
  try {
    for (const [id, method] of [[4802, 'CityMsg.PalaceWorshipRsp'], [4807, 'CityMsg.GetSendGiftRewardRsp']]) {
      game.addHandler(id, () => callbacks++)
      const response = { ret: 0, reward: '100000=120|100004=1' }
      game.resvHandler(id, response, method)
      game.resvHandler(id, response, method)
    }
    assert.equal(callbacks, 2)
    assert.equal(reports.length, 2)
    assert.equal(reports.at(-1).dailyClaimedJade, 240)
    assert.equal(logs.length, 2)
    assert.match(logs[0], /\[仙宫领玉\].*仙宫朝拜.*本次 \+120 仙玉.*当日累计 120 仙玉/)
    assert.match(logs[1], /仙宫送福.*本次 \+120 仙玉.*当日累计 240 仙玉.*2026-10-28/)
    game.resvHandler(4807, { ret: 4805, reward: '100000=999' }, 'CityMsg.GetSendGiftRewardRsp')
    game.resvHandler(4807, { ret: null, reward: '100000=999' }, 'CityMsg.GetSendGiftRewardRsp')
    game.resvHandler(4807, { ret: 0, reward: '100004=5' }, 'CityMsg.GetSendGiftRewardRsp')
    MsgRecvMgr.observePalaceReward('AssistantPalaceAutoRewardResp', { ret: 0, reward: '100000=999' })
    assert.equal(logs.length, 2)
    assert.equal(reports.at(-1).dailyClaimedJade, 240)
  } finally {
    PalaceMgr._instance = prior
  }
})
