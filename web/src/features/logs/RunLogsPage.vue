<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { AlertCircle, RefreshCw, ScrollText, UsersRound } from '@lucide/vue'
import { useDefaultUserSelection } from '@/features/users/useDefaultUserSelection'
import { useUsers } from '@/features/users/useUsers'
import type { AutomationRunLog } from '@/features/users/types'
import RunLogList from './RunLogList.vue'

type LogLevelFilter = AutomationRunLog['level'] | 'all'

const { users, loading, error, refreshUsers } = useUsers()
const { selectedUserId, selectedUser } = useDefaultUserSelection(users)
const selectedLevel = shallowRef<LogLevelFilter>('all')

const userLogs = computed(() => selectedUser.value?.automationRun.logs ?? [])
const visibleLogs = computed(() => userLogs.value
  .filter(entry => selectedLevel.value === 'all' || entry.level === selectedLevel.value)
  .slice()
  .reverse())
const runStatusLabel = computed(() => {
  const status = selectedUser.value?.automationRun.status ?? 'idle'
  return { idle: '等待运行', running: '正在应用', active: '持续运行', completed: '已完成', failed: '有失败' }[status]
})
const activeRun = computed(() => ['running', 'active'].includes(selectedUser.value?.automationRun.status ?? 'idle'))
</script>

<template>
  <section class="page-panel">
    <div class="page-content">
      <header class="page-header">
        <div>
          <h1 class="page-title">运行日志</h1>
          <p class="page-subtitle">按账号查看脚本执行结果；运行中的任务会随页面自动刷新</p>
        </div>
        <button class="jade-button" type="button" :disabled="loading" @click="refreshUsers()">
          <RefreshCw :size="19" :class="{ spinning: loading }" />
          <span>刷新日志</span>
        </button>
      </header>

      <div v-if="error" class="service-error" role="alert"><AlertCircle :size="18" />{{ error }}</div>

      <section class="log-controls" aria-label="日志筛选">
        <div class="control-intro">
          <UsersRound :size="21" />
          <div>
            <strong>查看账号</strong>
            <small>不会显示账号密码或通信原文</small>
          </div>
        </div>
        <label class="control-field">
          <span>账号与区服</span>
          <select v-model="selectedUserId" class="field-control">
            <option value="">请选择用户</option>
            <option v-for="user in users" :key="user.id" :value="user.id">{{ user.note }} · {{ user.serverName }}{{ user.serverId }}服</option>
          </select>
        </label>
        <label class="control-field">
          <span>日志类型</span>
          <select v-model="selectedLevel" class="field-control">
            <option value="all">全部记录</option>
            <option value="info">运行信息</option>
            <option value="success">成功</option>
            <option value="skip">已跳过</option>
            <option value="error">失败</option>
          </select>
        </label>
      </section>

      <section v-if="selectedUser" class="run-summary">
        <div>
          <span class="summary-label">当前运行状态</span>
          <strong :class="{ 'status-active': activeRun }">{{ runStatusLabel }}</strong>
        </div>
        <div><span class="summary-label">完成</span><strong>{{ selectedUser.automationRun.completed }}</strong></div>
        <div><span class="summary-label">跳过</span><strong>{{ selectedUser.automationRun.skipped }}</strong></div>
        <div><span class="summary-label">失败</span><strong>{{ selectedUser.automationRun.failed }}</strong></div>
        <div><span class="summary-label">显示记录</span><strong>{{ visibleLogs.length }} / {{ userLogs.length }}</strong></div>
      </section>

      <RunLogList :entries="visibleLogs" :has-selected-user="Boolean(selectedUser)" />
    </div>
  </section>
</template>

<style scoped>
.jade-button { display: inline-flex; gap: 8px; align-items: center; }.spinning { animation: spin 850ms linear infinite; }
.service-error { display: flex; gap: 9px; align-items: center; margin-top: 16px; padding: 11px 13px; color: #9a4d32; font-size: 13px; background: #f9e7df; border: 1px solid #d7a18d; border-radius: 8px; }
.log-controls { display: grid; grid-template-columns: minmax(190px, 1fr) minmax(240px, 1.45fr) minmax(150px, .7fr); gap: 14px; align-items: end; margin: 18px 0 14px; padding: 14px; background: rgb(232 240 229 / 74%); border: 1px solid #b2c4af; border-radius: 8px; }
.control-intro { display: flex; gap: 10px; align-items: center; color: #42685a; }.control-intro strong,.control-intro small { display: block; }.control-intro strong { color: #364a3d; font-family: var(--font-serif); font-size: 15px; }.control-intro small { margin-top: 3px; color: #718076; font-size: 11px; }
.control-field { display: grid; gap: 5px; }.control-field > span { color: #657469; font-size: 11px; font-weight: 800; }
.run-summary { display: grid; grid-template-columns: 1.5fr repeat(4, 1fr); gap: 1px; margin-bottom: 14px; overflow: hidden; background: #cfc1a6; border: 1px solid #cfc1a6; border-radius: 8px; }.run-summary > div { min-height: 66px; padding: 10px 13px; background: #fbf7ea; }.summary-label,.run-summary strong { display: block; }.summary-label { color: #887c69; font-size: 11px; }.run-summary strong { margin-top: 5px; color: #51422b; font-family: var(--font-serif); font-size: 16px; }.run-summary .status-active { color: #287159; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 800px) { .log-controls { grid-template-columns: 1fr 1fr; }.control-intro { grid-column: 1 / -1; }.run-summary { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 520px) { .page-header .jade-button span { display: none; }.log-controls { grid-template-columns: 1fr; }.run-summary { grid-template-columns: 1fr 1fr; } }
</style>
