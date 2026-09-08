import { readonly, shallowRef } from 'vue'
import automationTaskData from '@automation-tasks'
import type { AutomationSettings, AutomationTask } from './types'

interface UserResponse {
  user: { automationSettings: AutomationSettings }
  error?: string
}

const configuredTasks = automationTaskData as AutomationTask[]
// 自动任务只展示用户可理解、且已有脚本流程的功能；协议目录仍在玩法中心。
export const automationTasks = configuredTasks.filter(task => task.status === 'ready' && !task.hidden)

async function readResponse(response: Response): Promise<UserResponse> {
  const payload = await response.json() as UserResponse
  if (!response.ok) throw new Error(payload.error || '自动任务保存失败')
  return payload
}

export function useAutomationTasks() {
  const savingUserId = shallowRef('')

  async function saveSettings(userId: string, automationSettings: AutomationSettings) {
    savingUserId.value = userId
    try {
      const response = await fetch(`/api/users/${encodeURIComponent(userId)}/automation-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ automationSettings }),
      })
      return (await readResponse(response)).user
    } finally {
      savingUserId.value = ''
    }
  }

  async function runSelected(userId: string) {
    const response = await fetch(`/api/users/${encodeURIComponent(userId)}/automation/run`, { method: 'POST' })
    return (await readResponse(response)).user
  }

  return {
    tasks: readonly(shallowRef(automationTasks)),
    savingUserId: readonly(savingUserId),
    saveSettings,
    runSelected,
  }
}
