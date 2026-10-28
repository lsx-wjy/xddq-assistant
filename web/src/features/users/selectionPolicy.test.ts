import assert from 'node:assert/strict'
import test from 'node:test'

import { chooseSelectedUserId } from './selectionPolicy.ts'

const users = [
  { id: 'first', connected: false },
  { id: 'running', connected: true },
  { id: 'mine', connected: false },
]

test('keeps the current selection while that user remains available', () => {
  assert.equal(chooseSelectedUserId(users, 'mine', ''), 'mine')
})

test('prefers the authenticated user over connection state', () => {
  assert.equal(chooseSelectedUserId(users, '', 'mine'), 'mine')
})

test('falls back to a connected user and then the first available user', () => {
  assert.equal(chooseSelectedUserId(users, '', ''), 'running')
  assert.equal(chooseSelectedUserId(users.filter(user => !user.connected), '', ''), 'first')
  assert.equal(chooseSelectedUserId([], '', ''), '')
})
