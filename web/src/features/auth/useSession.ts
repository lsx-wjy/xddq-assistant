import { readonly, shallowRef } from 'vue'
import type { UserRecord } from '@/features/users/types'

export type SessionRole = 'admin' | 'user'

export interface SessionState {
  authenticated: boolean
  role: SessionRole | null
  userId: string | null
  displayName: string
  user?: UserRecord
}

export interface LoginCredentials {
  account: string
  password: string
  serverId?: number
}

const session = shallowRef<SessionState>({
  authenticated: false,
  role: null,
  userId: null,
  displayName: '',
})
const loading = shallowRef(true)
const error = shallowRef('')

async function readSessionResponse(response: Response) {
  const payload = await response.json() as SessionState & { error?: string }
  if (!response.ok) throw new Error(payload.error || '登录服务请求失败')
  return payload
}

export function useSession() {
  async function refreshSession() {
    loading.value = true
    try {
      session.value = await readSessionResponse(await fetch('/api/session', { cache: 'no-store' }))
      error.value = ''
    } catch (requestError) {
      session.value = { authenticated: false, role: null, userId: null, displayName: '' }
      error.value = requestError instanceof Error ? requestError.message : '无法读取登录状态'
    } finally {
      loading.value = false
    }
  }

  async function login(credentials: LoginCredentials) {
    loading.value = true
    error.value = ''
    try {
      const response = await fetch('/api/session/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      })
      session.value = await readSessionResponse(response)
      return session.value
    } catch (requestError) {
      error.value = requestError instanceof Error ? requestError.message : '登录失败'
      throw requestError
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    try {
      await fetch('/api/session/logout', { method: 'POST' })
    } finally {
      session.value = { authenticated: false, role: null, userId: null, displayName: '' }
      error.value = ''
      loading.value = false
    }
  }

  return {
    session: readonly(session),
    loading: readonly(loading),
    error: readonly(error),
    refreshSession,
    login,
    logout,
  }
}
