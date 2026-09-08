<script setup lang="ts">
import { computed, onUnmounted, shallowRef } from 'vue'
import { AlertCircle, CheckCircle2, Play, RefreshCw, UsersRound } from '@lucide/vue'
import { useDefaultUserSelection } from '@/features/users/useDefaultUserSelection'
import { useUsers } from '@/features/users/useUsers'
import type { AutomationSettings, AutomationTask, AutomationTaskState } from './types'
import { automationCategoryMeta, taskStateFor, type AutomationCategory } from './types'
import AutomationTaskDrawer from './AutomationTaskDrawer.vue'
import AutomationTaskList from './AutomationTaskList.vue'
import { useAutomationLogPolling } from './useAutomationLogPolling'
import { useAutomationTasks } from './useAutomationTasks'

const { users, loading, error, refreshUsers } = useUsers()
const { tasks, savingUserId, saveSettings, runSelected } = useAutomationTasks()
const categories = computed(() => (Object.keys(automationCategoryMeta) as AutomationCategory[])
  .filter(category => tasks.value.some(task => task.category === category)))
const selectedCategory = shallowRef<AutomationCategory>('basic')
const selectedTaskId = shallowRef('')
const toastMessage = shallowRef('')
const toastTone = shallowRef<'success' | 'error'>('success')
let toastTimer: number | undefined

const { selectedUserId, selectedUser } = useDefaultUserSelection(users)
const selectedTask = computed(() => tasks.value.find(task => task.id === selectedTaskId.value) ?? null)
const currentTasks = computed(() => tasks.value.filter(task => task.category === selectedCategory.value))
const categoryCounts = computed(() => Object.fromEntries(categories.value.map(category => [category, tasks.value.filter(task => task.category === category).length])))
const saving = computed(() => Boolean(selectedUser.value && savingUserId.value === selectedUser.value.id))
function isTaskAuthorized(task: AutomationTask) {
  return (!task.requires.includes('combat') || selectedUser.value?.allowCombat === true)
    && (!task.requires.includes('purchase') || selectedUser.value?.allowPurchase === true)
}
const selectedTaskCount = computed(() => {
  const settings = selectedUser.value?.automationSettings
  return tasks.value.filter(task => taskStateFor(task, settings).enabled && isTaskAuthorized(task)).length
})
const runInProgress = computed(() => selectedUser.value?.automationRun?.status === 'running')
const logPollingActive = computed(() => ['running', 'active'].includes(selectedUser.value?.automationRun?.status ?? 'idle'))
const automationRunStatusLabel = computed(() => {
  const status = selectedUser.value?.automationRun.status ?? 'idle'
  return { idle: '等待运行', running: '正在应用', active: '持续运行', completed: '已完成', failed: '有失败' }[status]
})
const runButtonLabel = computed(() => selectedUser.value?.automationRun?.status === 'active' ? '重新应用已选任务' : '运行已选任务')
const latestTreeLog = computed(() => selectedUser.value?.automationRun.logs
  .slice()
  .reverse()
  .find(entry => entry.message.includes('[砍树]') || entry.message.includes('[装备]')) ?? null)

useAutomationLogPolling({
  selectedUserId,
  isActive: logPollingActive,
  refresh: () => refreshUsers({ silent: true }),
})

function showToast(message: string, tone: 'success' | 'error' = 'success') {
  toastMessage.value = message
  toastTone.value = tone
  if (toastTimer) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => { toastMessage.value = '' }, 3_400)
}

function inspectTask(task: AutomationTask) {
  selectedTaskId.value = task.id
}

async function saveTask(task: AutomationTask, state: AutomationTaskState) {
  const user = selectedUser.value
  if (!user) return
  const currentSettings: AutomationSettings = user.automationSettings ?? { tasks: {} }
  const nextSettings: AutomationSettings = {
    ...currentSettings,
    tasks: { ...currentSettings.tasks, [task.id]: state },
  }
  try {
    await saveSettings(user.id, nextSettings)
    await refreshUsers({ silent: true })
    selectedTaskId.value = ''
    showToast(`已保存“${task.name}”。${state.enabled ? '点击“运行已选任务”后开始执行。' : '该任务保持关闭。'}`)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '任务保存失败', 'error')
  }
}

async function toggleTask(task: AutomationTask, enabled: boolean) {
  const user = selectedUser.value
  if (!user) {
    showToast('请先选择一个用户，再勾选任务。', 'error')
    return
  }
  const previous = taskStateFor(task, user.automationSettings)
  await saveTask(task, { enabled, values: previous.values })
}

async function runSelectedTasks() {
  const user = selectedUser.value
  if (!user || !selectedTaskCount.value || runInProgress.value) return
  try {
    await runSelected(user.id)
    await refreshUsers({ silent: true })
    showToast(`已启动 ${selectedTaskCount.value} 项已勾选任务；运行日志会持续更新。`)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '自动任务启动失败', 'error')
  }
}

onUnmounted(() => { if (toastTimer) window.clearTimeout(toastTimer) })
</script>

<template>
  <section class="page-panel">
    <div class="page-content">
      <header class="page-header">
        <div>
          <h1 class="page-title">自动任务</h1>
          <p class="page-subtitle">选择脚本功能，点击运行，然后在下方查看结果；配置会按账号和区服保存</p>
        </div>
        <div class="header-actions">
          <button class="jade-button" type="button" :disabled="loading" @click="refreshUsers()">
            <RefreshCw :size="19" :class="{ spinning: loading }" />
            <span>刷新用户</span>
          </button>
        </div>
      </header>

      <section class="run-queue-bar">
        <div>
          <strong>已选择 {{ selectedTaskCount }} 项脚本功能</strong>
          <small>勾选会立即保存到当前账号和区服。持续任务会在已连接角色上按规则循环执行，直到关闭、断开或满足停止条件。</small>
        </div>
        <button class="jade-button" type="button" :disabled="!selectedUser || !selectedTaskCount || runInProgress" @click="runSelectedTasks">
          <Play :size="18" />
          <span>{{ runInProgress ? '正在应用配置' : runButtonLabel }}</span>
        </button>
      </section>

      <div class="user-picker">
        <UsersRound :size="20" />
        <div>
          <strong>当前配置用户</strong>
          <small>任务配置独立保存；已连接角色会自动带入，但不会主动连接账号</small>
        </div>
        <select v-model="selectedUserId" class="field-control">
          <option value="">请选择用户</option>
          <option v-for="user in users" :key="user.id" :value="user.id">{{ user.note }} · {{ user.serverName }}{{ user.serverId }}服</option>
        </select>
      </div>

      <div v-if="error" class="service-error"><AlertCircle :size="18" />{{ error }}</div>
      <div v-else-if="!users.length && !loading" class="empty-user-note"><UsersRound :size="24" /><p>还没有用户。请先在“用户管理”添加账号、读取区服并手动选择连接。</p></div>

      <nav class="category-tabs" aria-label="自动任务分类">
        <button
          v-for="category in categories"
          :key="category"
          type="button"
          :class="{ 'category-tab--active': selectedCategory === category }"
          @click="selectedCategory = category"
        >
          <span>{{ automationCategoryMeta[category].label }}</span>
          <small>{{ categoryCounts[category] }}</small>
        </button>
      </nav>

      <section class="category-heading">
        <div>
          <h2>{{ automationCategoryMeta[selectedCategory].label }}</h2>
          <p>{{ automationCategoryMeta[selectedCategory].description }}</p>
        </div>
        <span>勾选后点击运行；需要参数时点“设置”</span>
      </section>

      <AutomationTaskList
        :tasks="currentTasks"
        :settings="selectedUser?.automationSettings"
        :allow-combat="selectedUser?.allowCombat ?? false"
        :allow-purchase="selectedUser?.allowPurchase ?? false"
        @inspect="inspectTask"
        @toggle="toggleTask"
      />

      <section v-if="selectedUser" class="automation-log-panel">
        <header>
          <div>
            <h2>运行日志</h2>
            <p>{{ logPollingActive ? '自动任务运行中，脚本日志每秒自动更新；不会显示账号、密码或通信原文。' : '显示本次运行的启动记录，以及脚本反馈的结果；不会显示账号、密码或通信原文。' }}</p>
          </div>
          <span :class="`log-state log-state--${selectedUser.automationRun.status}`">
            {{ automationRunStatusLabel }}
          </span>
        </header>
        <p v-if="latestTreeLog" class="tree-log-summary">
          <strong>砍树与装备处理：</strong>{{ latestTreeLog.message.replace(/^.*?(\[砍树\]|\[装备\])\s*/, '') }}
        </p>
        <p v-if="!selectedUser.automationRun.logs.length" class="empty-log">勾选玩法后点击“运行已选任务”，运行记录会出现在这里。</p>
        <ol v-else class="automation-log-list">
          <li v-for="(entry, index) in selectedUser.automationRun.logs.slice().reverse()" :key="`${entry.at}-${index}`" :class="`log-entry--${entry.level}`">
            <time>{{ new Date(entry.at).toLocaleTimeString('zh-CN', { hour12: false }) }}</time>
            <span>{{ entry.message }}</span>
          </li>
        </ol>
      </section>
    </div>
  </section>

  <AutomationTaskDrawer
    :open="selectedTask !== null"
    :task="selectedTask"
    :settings="selectedUser?.automationSettings"
    :user="selectedUser"
    :saving="saving"
    @close="selectedTaskId = ''"
    @save="saveTask"
  />

  <div v-if="toastMessage" class="toast" :class="{ 'toast--error': toastTone === 'error' }" role="status">
    <AlertCircle v-if="toastTone === 'error'" :size="18" />
    <CheckCircle2 v-else :size="18" />
    {{ toastMessage }}
  </div>
</template>

<style scoped>
.header-actions { display: flex; flex: 0 0 auto; flex-wrap: wrap; gap: 9px; }
.header-actions .jade-button { white-space: nowrap; }
.run-queue-bar { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-top: 12px; padding: 12px 14px; color: #395f52; background: linear-gradient(90deg, rgb(224 240 229 / 86%), rgb(241 238 215 / 76%)); border: 1px solid #a6c2ac; border-radius: 8px; }
.run-queue-bar strong,.run-queue-bar small { display: block; }
.run-queue-bar strong { color: #2b5b49; font-family: var(--font-serif); font-size: 15px; }
.run-queue-bar small { margin-top: 3px; color: #6a796e; font-size: 11px; }
.automation-log-panel { margin-top: 18px; overflow: hidden; border: 1px solid #c8baa0; border-radius: 8px; }
.automation-log-panel > header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; background: #ede8d8; border-bottom: 1px solid #d1c3a7; }
.automation-log-panel h2 { margin: 0; color: #483c2a; font-family: var(--font-serif); font-size: 17px; }
.automation-log-panel header p { margin: 3px 0 0; color: #7b7161; font-size: 11px; }
.tree-log-summary { margin: 0; padding: 8px 14px; color: #716146; font-size: 11px; line-height: 1.5; background: #fbf5e5; border-bottom: 1px solid #e2dac7; }
.tree-log-summary strong { margin-right: 4px; color: #51422b; }
.log-state { padding: 4px 8px; font-family: var(--font-serif); font-size: 11px; font-weight: 800; border: 1px solid; border-radius: 5px; }
.log-state--idle { color: #756d60; background: #f5f2e8; border-color: #c9c0ad; }.log-state--running,.log-state--active { color: #286b58; background: #e3f0e5; border-color: #9fc2a9; }.log-state--completed { color: #376c59; background: #e3f0e5; border-color: #9fc2a9; }.log-state--failed { color: #a04731; background: #f7e4dc; border-color: #d5a193; }
.empty-log { margin: 0; padding: 20px 14px; color: #817768; font-size: 12px; }
.automation-log-list { max-height: 320px; margin: 0; padding: 0; overflow: auto; list-style: none; background: rgb(255 253 245 / 60%); }
.automation-log-list li { display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 8px; padding: 8px 14px; color: #5d635d; font-size: 12px; border-bottom: 1px solid #e2dac7; }.automation-log-list time { color: #887c69; font-family: ui-monospace, Consolas, monospace; font-size: 10px; }.log-entry--success { color: #27715b !important; }.log-entry--error { color: #a14430 !important; }.log-entry--skip { color: #8b692e !important; }
.user-picker { display: grid; grid-template-columns: auto minmax(0, 1fr) minmax(240px, 350px); align-items: center; gap: 12px; margin-top: 16px; padding: 12px 15px; color: #42685a; background: rgb(231 240 229 / 74%); border: 1px solid #b2c4af; border-radius: 8px; }
.user-picker strong,
.user-picker small { display: block; }
.user-picker strong { color: #364a3d; font-family: var(--font-serif); font-size: 15px; }
.user-picker small { margin-top: 3px; color: #718076; font-size: 11px; }
.category-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin: 22px 0 0; padding-bottom: 13px; border-bottom: 1px solid var(--line); }
.category-tabs button { display: inline-flex; align-items: center; gap: 8px; min-height: 38px; padding: 0 13px; color: #665b4b; font-family: var(--font-serif); font-size: 14px; background: #f7f1e1; border: 1px solid #cbbd9e; border-radius: 7px; cursor: pointer; }
.category-tabs button:hover { border-color: #8b9c79; }
.category-tabs .category-tab--active { color: #eff4e4; background: linear-gradient(180deg, #408d76, #205f52); border-color: #7a6335; }
.category-tabs small { display: grid; min-width: 18px; height: 18px; color: inherit; font-size: 10px; background: rgb(255 255 255 / 18%); border-radius: 50%; place-items: center; }
.category-heading { display: flex; align-items: end; justify-content: space-between; gap: 20px; margin: 18px 4px 12px; }
.category-heading h2 { margin: 0; color: #423222; font-family: var(--font-display); font-size: 28px; }
.category-heading p { margin: 5px 0 0; color: #776c5c; font-family: var(--font-serif); font-size: 13px; }
.category-heading > span { color: #817666; font-size: 11px; }
.service-error,.empty-user-note { display: flex; align-items: center; gap: 10px; margin-top: 16px; padding: 12px 14px; color: #9a4d32; background: #f9e7df; border: 1px solid #d7a18d; border-radius: 8px; }
.empty-user-note { color: #5e6d62; background: #ecf0e8; border-color: #c5cdc0; }
.empty-user-note p { margin: 0; font-size: 13px; line-height: 1.55; }
.spinning { animation: spin 850ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 760px) { .user-picker { grid-template-columns: auto minmax(0, 1fr); } .user-picker select { grid-column: 1 / -1; } .run-queue-bar { align-items: flex-start; flex-direction: column; } .category-heading { align-items: flex-start; flex-direction: column; gap: 5px; } }
</style>
