import { onScopeDispose, readonly, shallowRef } from 'vue'
import type { ServerOption } from './types'

interface ServerOptionsResponse {
  servers?: ServerOption[]
  error?: string
}

export function useServerOptions() {
  const options = shallowRef<ServerOption[]>([])
  const loading = shallowRef(false)
  const error = shallowRef('')
  let activeRequest: AbortController | undefined

  function reset() {
    activeRequest?.abort()
    activeRequest = undefined
    options.value = []
    loading.value = false
    error.value = ''
  }

  async function load(account: string, password: string) {
    const normalizedAccount = account.trim()
    if (!normalizedAccount || !password) {
      error.value = '请先填写平台账号和登录密码'
      return
    }

    activeRequest?.abort()
    const controller = new AbortController()
    activeRequest = controller
    loading.value = true
    error.value = ''
    options.value = []

    try {
      const response = await fetch('/api/server-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: normalizedAccount, password }),
        cache: 'no-store',
        signal: controller.signal,
      })
      const payload = await response.json() as ServerOptionsResponse

      if (!response.ok) {
        throw new Error(payload.error || '区服读取失败，请检查账号和密码')
      }

      const servers = Array.isArray(payload.servers) ? payload.servers : []
      if (!servers.length) {
        throw new Error('该账号没有可选择的角色区服')
      }

      options.value = servers
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === 'AbortError') return
      error.value = requestError instanceof Error ? requestError.message : '区服读取失败，请稍后重试'
    } finally {
      if (activeRequest === controller) {
        activeRequest = undefined
        loading.value = false
      }
    }
  }

  onScopeDispose(() => activeRequest?.abort())

  return {
    options: readonly(options),
    loading: readonly(loading),
    error: readonly(error),
    load,
    reset,
  }
}
