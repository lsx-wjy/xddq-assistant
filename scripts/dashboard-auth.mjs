import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1_000

export function createAdminPasswordHash(password, salt = randomBytes(16).toString('hex')) {
  const digest = scryptSync(String(password), salt, 64).toString('hex')
  return `scrypt$${salt}$${digest}`
}

export function verifyAdminPassword(password, encodedHash) {
  const [algorithm, salt, expectedHex] = String(encodedHash || '').split('$')
  if (algorithm !== 'scrypt' || !salt || !/^[0-9a-f]{128}$/i.test(expectedHex || '')) return false

  const actual = scryptSync(String(password || ''), salt, 64)
  const expected = Buffer.from(expectedHex, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function createSessionRegistry({
  now = Date.now,
  ttlMs = DEFAULT_SESSION_TTL_MS,
  createToken = () => randomBytes(32).toString('base64url'),
} = {}) {
  const sessions = new Map()

  function purgeExpired() {
    const currentTime = now()
    for (const [token, session] of sessions) {
      if (session.expiresAt <= currentTime) sessions.delete(token)
    }
  }

  return {
    create(principal) {
      purgeExpired()
      const token = createToken()
      const expiresAt = now() + ttlMs
      sessions.set(token, { principal: { ...principal }, expiresAt })
      return { token, expiresAt }
    },
    resolve(token) {
      if (!token) return null
      const session = sessions.get(token)
      if (!session) return null
      if (session.expiresAt <= now()) {
        sessions.delete(token)
        return null
      }
      return { ...session.principal }
    },
    revoke(token) {
      if (token) sessions.delete(token)
    },
    clear() {
      sessions.clear()
    },
  }
}

export function scopeUsersForPrincipal(users, principal) {
  if (principal?.role === 'admin') return users
  return users.filter(user => user.id === principal?.userId)
}

export function userIsAccessible(principal, userId) {
  return principal?.role === 'admin' || (principal?.role === 'user' && principal.userId === userId)
}

export function canUseProtocolRunner(principal) {
  return principal?.role === 'admin'
}
