import { readonly, shallowRef } from 'vue'
import type {
  ActivityProtocol,
  ProtocolRunOptions,
  ProtocolRunResult,
  ProtocolRunState,
} from './types'

interface ProtocolResponse extends ProtocolRunResult {
  error?: string
}

const idleState: ProtocolRunState = {
  status: 'idle',
  result: null,
  error: '',
}

export function protocolStateKey(protocol: ActivityProtocol) {
  return `${protocol.id}:${protocol.key}:${protocol.requestMethod || protocol.responseMethod}`
}

export function useProtocolRunner() {
  const states = shallowRef<Record<string, ProtocolRunState>>({})

  function updateState(key: string, state: ProtocolRunState) {
    states.value = { ...states.value, [key]: state }
  }

  function stateFor(protocol: ActivityProtocol) {
    return states.value[protocolStateKey(protocol)] ?? idleState
  }

  async function runProtocol(userId: string, protocol: ActivityProtocol, options: ProtocolRunOptions) {
    const key = protocolStateKey(protocol)
    let payload: unknown = undefined
    if (options.mode === 'advanced') {
      try {
        payload = JSON.parse(options.payloadText || '{}')
      } catch {
        updateState(key, { status: 'error', result: null, error: '高级参数不是有效 JSON' })
        return
      }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        updateState(key, { status: 'error', result: null, error: '高级参数必须是 JSON 对象' })
        return
      }
    }

    updateState(key, { status: 'running', result: null, error: '' })
    try {
      const response = await fetch(
        `/api/users/${encodeURIComponent(userId)}/protocols/${encodeURIComponent(protocol.key)}/run`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: options.mode, ...(options.mode === 'advanced' ? { payload } : {}) }),
        },
      )
      const result = await response.json() as ProtocolResponse
      if (!response.ok || !result.ok) throw new Error(result.error || '功能请求失败')
      updateState(key, { status: 'success', result, error: '' })
    } catch (error) {
      updateState(key, {
        status: 'error',
        result: null,
        error: error instanceof Error ? error.message : '功能请求失败',
      })
    }
  }

  return {
    states: readonly(states),
    stateFor,
    runProtocol,
  }
}
