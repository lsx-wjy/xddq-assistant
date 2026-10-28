import assert from 'node:assert/strict'
import test from 'node:test'
import { parseDashboardAccess, isDashboardUserAllowed } from '../src/config/dashboardAccess.js'
import { createConnectionSlots, ConnectionLimitError } from './dashboard-connection-slots.mjs'
import GameNetMgr from '../src/game/net/GameNetMgr.js'
import Protocol from '../src/game/net/Protocol.js'
import { ProtobufMgr } from '../src/game/net/ProtobufMgr.js'

const policy = parseDashboardAccess({
  allowedUnionIds: ['31076296822'],
  allowedPlatformAccounts: ['tgzh21d22454', 'tgzhp1273617'],
  maxGameConnections: 6,
})

test('account or union whitelist grants access, unrelated identities and missing union are rejected', () => {
  assert.equal(isDashboardUserAllowed(policy, 'tgzh21d22454', ''), true)
  assert.equal(isDashboardUserAllowed(policy, 'TGZHP1273617', 'other-union'), true)
  assert.equal(isDashboardUserAllowed(policy, 'other-account', '31076296822'), true)
  assert.equal(isDashboardUserAllowed(policy, 'other-account', '31076296823'), false)
  assert.equal(isDashboardUserAllowed(policy, 'other-account', undefined), false)
  assert.equal(isDashboardUserAllowed({ ...policy, allowedUnionIds: [], allowedPlatformAccounts: [] }, 'tgzh21d22454', '31076296822'), false)
})

test('invalid configuration fails closed', () => {
  for (const limit of [undefined, 0, -1, 1.5, '6', Infinity]) {
    assert.throws(() => parseDashboardAccess({ ...policy, maxGameConnections: limit }))
  }
  assert.throws(() => parseDashboardAccess({ ...policy, allowedUnionIds: [31076296822] }))
  assert.throws(() => parseDashboardAccess({ ...policy, allowedPlatformAccounts: [''] }))
})

test('simultaneous connection requests stop at six and release only their own slot', async () => {
  let limit = 6
  const slots = createConnectionSlots(() => limit)
  const requests = await Promise.allSettled(Array.from({ length: 12 }, async () => slots.acquire()))
  const admitted = requests.filter(result => result.status === 'fulfilled').map(result => result.value)
  assert.equal(admitted.length, 6)
  assert.equal(slots.size, 6)
  for (const rejected of requests.filter(result => result.status === 'rejected')) {
    assert.ok(rejected.reason instanceof ConnectionLimitError)
    assert.equal(rejected.reason.statusCode, 409)
  }
  admitted[0]()
  const replacement = slots.acquire()
  admitted[0]() // A duplicate exit/close callback must not free the replacement slot.
  assert.equal(slots.size, 6)
  assert.throws(() => slots.acquire(), ConnectionLimitError)
  limit = 2 // Lowering the limit does not evict connections or admit any new ones.
  assert.throws(() => slots.acquire(), ConnectionLimitError)
  admitted.forEach(release => release())
  replacement()
  assert.equal(slots.size, 0)
  assert.equal(typeof slots.acquire(), 'function')
})

function pendingGame(unionId) {
  const game = new GameNetMgr()
  game.accessConfig = policy
  game.accessPending = true
  game.accessWaiting = true
  game.accessUnionId = unionId
  game.accessMessages = []
  return game
}

test('union authorization rejects nonmembers before replaying gameplay data or starting tasks', () => {
  for (const unionId of ['', '31076296823']) {
    const game = pendingGame(unionId)
    let denied
    game.reportRuntimeError = error => { denied = error }
    game.resvHandler = () => assert.fail('unauthorized gameplay handlers must not run')
    game.handleLoginOver = () => assert.fail('unauthorized tasks must not start')
    game.accessMessages.push([2124, {}, 'Union.MyUnionData'])
    game.finishAccessCheck()
    assert.match(denied.message, /未获授权/)
    assert.equal(denied.retryable, false)
  }
})

test('verified union replays buffered data before completing login', () => {
  const game = pendingGame('31076296822')
  const events = []
  game.resvHandler = (...args) => events.push(args)
  game.handleLoginOver = () => events.push('ready')
  game.accessMessages.push([2124, { baseData: { unionId: '31076296822' } }, 'Union.MyUnionData'])
  game.finishAccessCheck()
  assert.equal(game.accessPending, false)
  assert.equal(events.length, 2)
  assert.equal(events[1], 'ready')
  assert.equal(game.accessMessages.length, 0)
})

test('login sync waits for authoritative union response and buffers gameplay broadcasts', () => {
  const game = pendingGame(null)
  const sent = []
  game.loginAccepted = true
  game.accessWaiting = false
  game.sendPbMsg = msgId => { sent.push(msgId); return true }
  game.handleLoginOver()
  assert.equal(game.loginReady, false)
  assert.deepEqual(sent, [Protocol.S_UNION_ENTER])
  game.handleLoginOver()
  assert.equal(sent.length, 1)
  const prior = ProtobufMgr.inst.resvCmdList
  ProtobufMgr.inst.resvCmdList = {}
  try {
    game.resvHandler(201, { realmsId: 100 }, 'Attribute.PlayerAttributeDataMsg')
    assert.equal(game.accessMessages.length, 1)
    assert.equal(game.accessPending, true)
    let denied
    game.reportRuntimeError = error => { denied = error }
    game.resvHandler(22102, { ret: 0, myUnionData: { baseData: { unionId: 'wrong-union' } } }, 'Union.RspUnionEnter')
    assert.match(denied.message, /未获授权/)
    assert.equal(game.loginReady, false)
  } finally {
    clearTimeout(game.accessTimer)
    ProtobufMgr.inst.resvCmdList = prior
  }
})

test('authorization send gate blocks gameplay even while checking a guild', () => {
  const game = pendingGame(null)
  game.net.isConnected = () => true
  game.logBlockedRequestOnce = () => {}
  assert.equal(game.sendPbMsg(Protocol.S_UNION_DAILYTASK, {}), false)
  assert.equal(game.lastSendError, '正在验证妖盟登录资格')
})
