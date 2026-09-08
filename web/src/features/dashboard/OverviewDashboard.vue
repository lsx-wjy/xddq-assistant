<script setup lang="ts">
import { computed } from 'vue'
import { Bot, ListTree, UsersRound } from '@lucide/vue'
import { useUsers } from '@/features/users/useUsers'
import { automationTasks } from '@/features/automation/useAutomationTasks'

type Destination = 'users' | 'automation' | 'activities' | 'logs' | 'settings'

const emit = defineEmits<{ navigate: [destination: Destination] }>()
const { users } = useUsers()

const connectedCount = computed(() => users.value.filter(user => user.connectionState === 'running').length)
const selectedTaskCount = computed(() => users.value.reduce((total, user) =>
  total + Object.values(user.automationSettings.tasks).filter(task => task.enabled).length, 0))
const activeAutomationCount = computed(() => users.value.filter(user => ['running', 'active'].includes(user.automationRun.status)).length)
</script>

<template>
  <section class="page-panel">
    <div class="page-content">
      <header class="page-header">
        <div>
          <h1 class="page-title">总览</h1>
          <p class="page-subtitle">账号连接、自动任务与玩法运行状态一目了然</p>
        </div>
      </header>

      <div class="overview-grid">
        <article class="overview-card">
          <UsersRound :size="24" />
          <strong>{{ users.length }}</strong>
          <span>已保存账号</span>
          <small>{{ connectedCount }} 个当前连接</small>
          <button type="button" @click="emit('navigate', 'users')">管理账号</button>
        </article>
        <article class="overview-card overview-card--jade">
          <Bot :size="24" />
          <strong>{{ selectedTaskCount }}</strong>
          <span>已勾选任务</span>
          <small>{{ activeAutomationCount }} 个账号正在运行自动任务</small>
          <button type="button" @click="emit('navigate', 'automation')">配置任务</button>
        </article>
        <article class="overview-card overview-card--gold">
          <ListTree :size="24" />
          <strong>{{ automationTasks.length }}</strong>
          <span>玩法与任务目录</span>
          <small>可按分类逐项配置</small>
          <button type="button" @click="emit('navigate', 'activities')">查看玩法</button>
        </article>
      </div>

      <section class="overview-note">
        <h2>开始使用</h2>
        <ol>
          <li>在“用户管理”添加账号并手动连接。</li>
          <li>在“自动任务”勾选想运行的玩法。</li>
          <li>点击“运行已选任务”，在“运行日志”查看逐条结果。</li>
        </ol>
      </section>
    </div>
  </section>
</template>

<style scoped>
.overview-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.overview-card { display: grid; justify-items: start; gap: 5px; min-height: 190px; padding: 20px; color: #5d5140; background: linear-gradient(145deg, #faf6e9, #e9e3cf); border: 1px solid #cbb98d; border-radius: 10px; }
.overview-card--jade { color: #2e6958; background: linear-gradient(145deg, #ecf4e9, #d6e8dc); border-color: #9db9a6; }
.overview-card--gold { color: #755324; background: linear-gradient(145deg, #fcf2d8, #ecdcad); border-color: #d0ad64; }
.overview-card strong { margin-top: 7px; font-family: var(--font-display); font-size: 44px; line-height: 1; }.overview-card span { font-family: var(--font-serif); font-size: 17px; font-weight: 800; }.overview-card small { color: #7b7163; font-size: 12px; }.overview-card button { margin-top: auto; padding: 7px 10px; color: inherit; font-family: var(--font-serif); font-size: 12px; font-weight: 800; background: rgb(255 255 255 / 55%); border: 1px solid currentColor; border-radius: 6px; cursor: pointer; }
.overview-note { margin-top: 18px; padding: 18px 20px; background: rgb(255 253 245 / 65%); border: 1px solid var(--line); border-radius: 9px; }.overview-note h2 { margin: 0; color: #4b3e2b; font-family: var(--font-serif); font-size: 19px; }.overview-note ol { margin: 12px 0 0; padding-left: 22px; color: #6e6456; font-size: 13px; line-height: 2; }
@media (max-width: 760px) { .overview-grid { grid-template-columns: 1fr; } }
</style>
