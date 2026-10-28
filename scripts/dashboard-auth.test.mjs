import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canUseProtocolRunner,
  createAdminPasswordHash,
  createSessionRegistry,
  scopeUsersForPrincipal,
  userIsAccessible,
  verifyAdminPassword,
} from './dashboard-auth.mjs'

test('admin password verification accepts only the configured password', () => {
  const passwordHash = createAdminPasswordHash('correct horse', 'fixed-test-salt')

  assert.equal(verifyAdminPassword('correct horse', passwordHash), true)
  assert.equal(verifyAdminPassword('wrong horse', passwordHash), false)
  assert.equal(verifyAdminPassword('', passwordHash), false)
})

test('session registry creates, resolves, revokes and expires opaque sessions', () => {
  let now = 1_000
  let sequence = 0
  const sessions = createSessionRegistry({
    now: () => now,
    ttlMs: 500,
    createToken: () => `token-${++sequence}`,
  })
  const principal = { role: 'user', userId: 'user-1' }

  const session = sessions.create(principal)
  assert.equal(session.token, 'token-1')
  assert.deepEqual(sessions.resolve(session.token), principal)

  sessions.revoke(session.token)
  assert.equal(sessions.resolve(session.token), null)

  const expiring = sessions.create({ role: 'admin', userId: null })
  now += 501
  assert.equal(sessions.resolve(expiring.token), null)
})

test('regular users can only see and access their own role while admin can access all roles', () => {
  const users = [{ id: 'user-1' }, { id: 'user-2' }]
  const admin = { role: 'admin', userId: null }
  const regular = { role: 'user', userId: 'user-2' }

  assert.deepEqual(scopeUsersForPrincipal(users, admin), users)
  assert.deepEqual(scopeUsersForPrincipal(users, regular), [{ id: 'user-2' }])
  assert.equal(userIsAccessible(admin, 'user-1'), true)
  assert.equal(userIsAccessible(regular, 'user-2'), true)
  assert.equal(userIsAccessible(regular, 'user-1'), false)
  assert.equal(canUseProtocolRunner(admin), true)
  assert.equal(canUseProtocolRunner(regular), false)
})
