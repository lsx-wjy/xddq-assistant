import assert from 'node:assert/strict'
import test from 'node:test'

const moduleUrl = new URL('../src/game/mgr/AssistantPalaceRewardMgr.js', import.meta.url)
const rewardModule = await import(moduleUrl).catch(() => null)

test('仙官赐福奖励管理器模块可用', () => {
  assert.ok(rewardModule, '应提供 AssistantPalaceRewardMgr 模块')
})

test('固定按北京时间判断22点领取窗口', () => {
  assert.equal(typeof rewardModule?.chinaDateParts, 'function')
  assert.deepEqual(
    rewardModule.chinaDateParts(new Date('2026-10-28T14:00:05.000Z')),
    { dateKey: '2026-10-28', hour: 22, minute: 0, second: 5 },
  )
})

test('从官方奖励字符串中汇总仙玉数量', () => {
  assert.equal(typeof rewardModule?.rewardItemAmount, 'function')
  assert.equal(rewardModule.rewardItemAmount('100000=120', 100000), 120)
  assert.equal(rewardModule.rewardItemAmount('100004=5|100000=80;100000=20', 100000), 100)
  assert.equal(rewardModule.rewardItemAmount('100004=5', 100000), 0)
})

test('22点前不领取，22点后根据未领取记录发送一次请求', () => {
  let now = new Date('2026-10-28T13:59:59.000Z')
  const requests = []
  const manager = new rewardModule.default({
    now: () => now,
    enabled: () => true,
    ready: () => true,
    sendReward: callback => {
      requests.push(callback)
      return true
    },
  })

  manager.receiveSync({ records: [{ count: 1, type: 1, time: 0, reward: false }] })
  manager.loopUpdate()
  assert.equal(requests.length, 0)

  now = new Date('2026-10-28T14:00:01.000Z')
  manager.loopUpdate()
  manager.loopUpdate()
  assert.equal(requests.length, 1, '响应返回前不得重复发送')

  requests[0]({ ret: 0, reward: '100000=100', records: [{ count: 1, type: 1, time: 0, reward: true }] })
  manager.loopUpdate()
  assert.equal(requests.length, 1, '领取完成后当天不得重复发送')
})

test('22点后未收到同步时允许一次兜底探测', () => {
  const requests = []
  const manager = new rewardModule.default({
    now: () => new Date('2026-10-28T14:03:00.000Z'),
    enabled: () => true,
    ready: () => true,
    sendReward: callback => {
      requests.push(callback)
      return true
    },
  })

  manager.loopUpdate()
  manager.loopUpdate()
  assert.equal(requests.length, 1)
})

test('未达到条件时延迟重试，已领取时停止当天请求', () => {
  let now = new Date('2026-10-28T14:00:00.000Z')
  const requests = []
  const manager = new rewardModule.default({
    now: () => now,
    enabled: () => true,
    ready: () => true,
    sendReward: callback => {
      requests.push(callback)
      return true
    },
  })

  manager.loopUpdate()
  requests[0]({ ret: 5202 })
  now = new Date('2026-10-28T14:00:59.000Z')
  manager.loopUpdate()
  assert.equal(requests.length, 1)

  now = new Date('2026-10-28T14:01:00.000Z')
  manager.loopUpdate()
  assert.equal(requests.length, 2)
  requests[1]({ ret: 5203 })

  now = new Date('2026-10-28T15:00:00.000Z')
  manager.loopUpdate()
  assert.equal(requests.length, 2)
})

test('未连接或任务关闭时不发送领取请求', () => {
  let enabled = false
  let ready = true
  let requestCount = 0
  const manager = new rewardModule.default({
    now: () => new Date('2026-10-28T14:00:00.000Z'),
    enabled: () => enabled,
    ready: () => ready,
    sendReward: () => {
      requestCount += 1
      return true
    },
  })

  manager.loopUpdate()
  enabled = true
  ready = false
  manager.loopUpdate()
  assert.equal(requestCount, 0)
})

test('22点前收到的昨日已领取状态不会阻止当晚兜底领取', () => {
  let now = new Date('2026-10-29T02:00:00.000Z')
  const requests = []
  const manager = new rewardModule.default({
    now: () => now,
    enabled: () => true,
    ready: () => true,
    sendReward: callback => {
      requests.push(callback)
      return true
    },
  })

  manager.receiveSync({ records: [{ count: 1, type: 1, time: 0, reward: true }] })
  now = new Date('2026-10-29T14:00:00.000Z')
  manager.loopUpdate()
  assert.equal(requests.length, 1)
})

test('跨午夜到达的响应只完成发起请求的日期', () => {
  let now = new Date('2026-10-28T15:59:59.000Z')
  const requests = []
  const manager = new rewardModule.default({
    now: () => now,
    enabled: () => true,
    ready: () => true,
    sendReward: callback => {
      requests.push(callback)
      return true
    },
  })

  manager.loopUpdate()
  now = new Date('2026-10-28T16:00:01.000Z')
  requests[0]({ ret: 5203 })

  now = new Date('2026-10-29T14:00:00.000Z')
  manager.loopUpdate()
  assert.equal(requests.length, 2)
})

test('未知错误码停止当天请求且不会抛出异常', () => {
  let now = new Date('2026-10-28T14:00:00.000Z')
  const requests = []
  const manager = new rewardModule.default({
    now: () => now,
    enabled: () => true,
    ready: () => true,
    sendReward: callback => {
      requests.push(callback)
      return true
    },
  })

  manager.loopUpdate()
  assert.doesNotThrow(() => requests[0]({ ret: 5999 }))
  now = new Date('2026-10-28T15:00:00.000Z')
  manager.loopUpdate()
  assert.equal(requests.length, 1)
})

test('聚宝盆成功领奖不再上报仙宫的当日领玉统计', () => {
  const requests = []
  const manager = new rewardModule.default({
    now: () => new Date('2026-10-28T14:00:00.000Z'),
    enabled: () => true,
    ready: () => true,
    sendReward: callback => {
      requests.push(callback)
      return true
    },
  })

  manager.loopUpdate()
  const sent = []
  const priorSend = Object.getOwnPropertyDescriptor(process, 'send')
  const priorConnected = Object.getOwnPropertyDescriptor(process, 'connected')
  try {
    Object.defineProperty(process, 'send', { value: message => sent.push(message), configurable: true })
    Object.defineProperty(process, 'connected', { value: true, configurable: true })
    requests[0]({ ret: 0, reward: '100000=120|100004=5' })
    assert.equal(manager.completedDate, '2026-10-28')
    assert.deepEqual(sent.filter(message => message.type === 'profile-update'), [])
  } finally {
    if (priorSend) Object.defineProperty(process, 'send', priorSend)
    else delete process.send
    if (priorConnected) Object.defineProperty(process, 'connected', priorConnected)
    else delete process.connected
  }
})
