import { computed, onMounted, onUnmounted, readonly, shallowRef } from 'vue'
import type { UserDraft, UserLoginDraft, UserRecord } from './types'

interface UsersResponse {
  users: UserRecord[]
  error?: string
}

interface UserResponse {
  user: UserRecord
  error?: string
}

async function readResponse<T extends { error?: string }>(response: Response): Promise<T> {
  const payload = await response.json() as T
  if (!response.ok) throw new Error(payload.error || '本机用户服务请求失败')
  return payload
}

export function useUsers() {
  const users = shallowRef<UserRecord[]>([])
  const loading = shallowRef(true)
  const error = shallowRef('')
  let pollTimer: number | undefined
  let refreshing = false

  const serverOptions = computed(() =>
    [...new Map(users.value.map(user => [user.serverId, user])).values()].map(user => ({
      id: user.serverId,
      label: `${user.serverName} ${user.serverId}服`,
    })),
  )

  function replaceUser(updated: UserRecord) {
    const exists = users.value.some(user => user.id === updated.id)
    users.value = exists
      ? users.value.map(user => user.id === updated.id ? updated : user)
      : [...users.value, updated]
  }

  async function refreshUsers(options: { silent?: boolean } = {}) {
    if (refreshing) return
    refreshing = true
    if (!options.silent) loading.value = true
    try {
      const response = await fetch('/api/users', { cache: 'no-store' })
      const payload = await readResponse<UsersResponse>(response)
      users.value = Array.isArray(payload.users) ? payload.users : []
      error.value = ''
    } catch (requestError) {
      error.value = requestError instanceof Error ? requestError.message : '无法读取用户列表'
    } finally {
      refreshing = false
      loading.value = false
    }
  }

  async function loginUser(draft: UserLoginDraft) {
    const response = await fetch('/api/users/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    })
    const { user } = await readResponse<UserResponse>(response)
    replaceUser(user)
    return user
  }

  async function updateUser(userId: string, draft: UserDraft) {
    const response = await fetch(`/api/users/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    })
    const { user } = await readResponse<UserResponse>(response)
    replaceUser(user)
    return user
  }

  async function setConnection(userId: string, shouldConnect: boolean) {
    const action = shouldConnect ? 'connect' : 'disconnect'
    const response = await fetch(`/api/users/${encodeURIComponent(userId)}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const { user } = await readResponse<UserResponse>(response)
    replaceUser(user)
    return user
  }

  onMounted(() => {
    void refreshUsers()
    pollTimer = window.setInterval(() => void refreshUsers({ silent: true }), 2_500)
  })

  onUnmounted(() => {
    if (pollTimer) window.clearInterval(pollTimer)
  })

  return {
    users: readonly(users),
    loading: readonly(loading),
    error: readonly(error),
    serverOptions,
    refreshUsers,
    loginUser,
    updateUser,
    setConnection,
  }
}
