import assert from 'node:assert/strict'
import test from 'node:test'

import { reportProfile } from '../src/game/common/ProfileReporter.js'

test('profile reporter emits a small typed IPC patch when IPC is available', () => {
  const messages = []
  const sent = reportProfile({ progress: { realmsId: 12 } }, message => messages.push(message))

  assert.equal(sent, true)
  assert.deepEqual(messages, [{ type: 'profile-update', profile: { progress: { realmsId: 12 } } }])
})

test('profile reporter is a no-op without IPC', () => {
  assert.equal(reportProfile({ progress: { realmsId: 12 } }, null), false)
})
