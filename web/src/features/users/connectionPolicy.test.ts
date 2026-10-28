import assert from 'node:assert/strict'
import test from 'node:test'

import { connectionActionFor } from './connectionPolicy.ts'

test('stopped role can be connected', () => {
  assert.deepEqual(connectionActionFor({
    connectionState: 'stopped',
    desiredConnected: false,
    connectionBlocked: false,
  }, false), {
    active: false,
    shouldConnect: true,
    disabled: false,
    actionLabel: '连接角色',
    statusLabel: '尚未连接',
  })
})

test('active role can be disconnected', () => {
  for (const connectionState of ['connecting', 'running', 'reconnecting'] as const) {
    const action = connectionActionFor({ connectionState, desiredConnected: true, connectionBlocked: false }, false)
    assert.equal(action.active, true)
    assert.equal(action.shouldConnect, false)
    assert.equal(action.actionLabel, '断开连接')
    assert.equal(action.disabled, false)
  }
})

test('blocked and pending roles cannot start another connection action', () => {
  const blocked = connectionActionFor({ connectionState: 'error', desiredConnected: false, connectionBlocked: true }, false)
  assert.equal(blocked.disabled, true)
  assert.equal(blocked.statusLabel, '登录暂受限制')

  const pending = connectionActionFor({ connectionState: 'stopped', desiredConnected: false, connectionBlocked: false }, true)
  assert.equal(pending.disabled, true)
  assert.equal(pending.actionLabel, '处理中…')
})
