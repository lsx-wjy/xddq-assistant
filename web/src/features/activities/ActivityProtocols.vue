<script setup lang="ts">
import { computed, onUnmounted, shallowRef, watch } from 'vue'
import { AlertCircle, CheckCircle2, RefreshCw } from '@lucide/vue'
import { useUsers } from '@/features/users/useUsers'
import { useDefaultUserSelection } from '@/features/users/useDefaultUserSelection'
import type { UserRecord } from '@/features/users/types'
import ActivityAccountBar from './ActivityAccountBar.vue'
import ActivityCategoryBar from './ActivityCategoryBar.vue'
import ActivityDrawer from './ActivityDrawer.vue'
import ActivityFilters from './ActivityFilters.vue'
import ActivityTable from './ActivityTable.vue'
import { useActivities } from './useActivities'
import { useProtocolRunner } from './useProtocolRunner'
import { searchAliasesFor } from './activityTaxonomy'
import type {
  ActivityItem,
  ActivityProtocol,
  GameplayCategory,
  OpenState,
  ProtocolRunOptions,
} from './types'

const { activities, categories, summary } = useActivities()
const {
  users,
  loading: usersLoading,
  error: usersError,
  refreshUsers,
  setConnection,
} = useUsers()
const { states: protocolStates, runProtocol } = useProtocolRunner()

const pageSize = 6
const query = shallowRef('')
const category = shallowRef<GameplayCategory | 'all'>('all')
const openState = shallowRef<OpenState | 'all'>('all')
const risk = shallowRef('all')
const includeUnknown = shallowRef(true)
const currentPage = shallowRef(1)
const selectedActivityName = shallowRef('')
const syncing = shallowRef(false)
const connectionPending = shallowRef(false)
const toastMessage = shallowRef('')
const { selectedUserId, selectedUser } = useDefaultUserSelection(users)
const toastTone = shallowRef<'success' | 'error'>('success')
let toastTimer: number | undefined

const activityViews = computed<ActivityItem[]>(() => activities.value.map(activity => {
  const observation = selectedUser.value?.activityObservations?.[activity.name]
  const observedProtocolCount = observation ? Object.keys(observation.protocols).length : 0
  return {
    ...activity,
    openState: observation ? 'observed' : 'unknown',
    observedProtocolCount,
    recentMessage: observation ? formatObservationTime(observation.lastSeenAt) : '尚未收到',
  }
}))

const selectedActivity = computed(() =>
  activityViews.value.find(activity => activity.name === selectedActivityName.value) ?? null,
)

const selectedObservation = computed(() => {
  const activityName = selectedActivityName.value
  return activityName ? selectedUser.value?.activityObservations?.[activityName] : undefined
})

const categoryCounts = computed(() => [
  {
    id: 'all' as const,
    label: '全部玩法',
    description: '查看所有任务、玩法与系统功能',
    count: activityViews.value.length,
  },
  ...categories
    .map(item => ({
      ...item,
      count: activityViews.value.filter(activity => activity.category === item.id).length,
    }))
    .filter(item => item.count > 0),
])

const filteredActivities = computed(() => {
  const normalizedQuery = query.value.trim().toLocaleLowerCase()
  return activityViews.value.filter(activity => {
    const matchesQuery = !normalizedQuery
      || activity.displayName.toLocaleLowerCase().includes(normalizedQuery)
      || activity.name.toLocaleLowerCase().includes(normalizedQuery)
      || searchAliasesFor(activity.name).some(alias => alias.toLocaleLowerCase().includes(normalizedQuery))
      || activity.protocols.some(protocol =>
        protocol.key.toLocaleLowerCase().includes(normalizedQuery)
        || protocol.comment.toLocaleLowerCase().includes(normalizedQuery),
      )
    const matchesOpen = openState.value === 'all' || activity.openState === openState.value
    const matchesRisk = risk.value === 'all' || activity.riskLevel === risk.value
    const matchesCategory = category.value === 'all' || activity.category === category.value
    const matchesUnknown = includeUnknown.value || activity.openState !== 'unknown'
    return matchesQuery && matchesOpen && matchesRisk && matchesCategory && matchesUnknown
  })
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredActivities.value.length / pageSize)))

const pageActivities = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredActivities.value.slice(start, start + pageSize)
})

const paginationItems = computed<Array<number | 'ellipsis'>>(() => {
  const total = totalPages.value
  const current = currentPage.value
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1)
  if (current <= 3) return [1, 2, 3, 'ellipsis', total]
  if (current >= total - 2) return [1, 'ellipsis', total - 2, total - 1, total]
  return [1, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total]
})

watch([query, category, openState, risk, includeUnknown], () => {
  currentPage.value = 1
})

watch(totalPages, total => {
  if (currentPage.value > total) currentPage.value = total
})

function formatObservationTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '已收到'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function showToast(message: string, tone: 'success' | 'error' = 'success') {
  toastMessage.value = message
  toastTone.value = tone
  if (toastTimer) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toastMessage.value = ''
  }, 2600)
}

function isConnectionActive(user: UserRecord) {
  return user.desiredConnected
    || user.connectionState === 'running'
    || user.connectionState === 'connecting'
    || user.connectionState === 'reconnecting'
}

async function toggleConnection() {
  const user = selectedUser.value
  if (!user || connectionPending.value) return
  connectionPending.value = true
  const shouldConnect = !isConnectionActive(user)
  try {
    const updated = await setConnection(user.id, shouldConnect)
    showToast(`${updated.note} · ${shouldConnect ? '开始连接' : '已断开连接'}`)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '连接操作失败', 'error')
  } finally {
    connectionPending.value = false
  }
}

async function handleProtocolRun(protocol: ActivityProtocol, options: ProtocolRunOptions) {
  const user = selectedUser.value
  if (!user) {
    showToast('请先在上方选择账号', 'error')
    return
  }
  if (user.connectionState !== 'running') {
    showToast('请先手动连接账号，并等待角色数据同步完成', 'error')
    return
  }
  await runProtocol(user.id, protocol, options)
}

async function refreshGameplayIndex() {
  if (syncing.value) return
  syncing.value = true
  await refreshUsers({ silent: true })
  syncing.value = false
  showToast(`检测状态已刷新：${summary.value.activityGroups} 个一级玩法`)
}

function inspectActivity(activity: ActivityItem) {
  selectedActivityName.value = activity.name
}

function goToPage(page: number) {
  currentPage.value = Math.min(Math.max(1, page), totalPages.value)
}

onUnmounted(() => {
  if (toastTimer) window.clearTimeout(toastTimer)
})
</script>

<template>
  <section class="page-panel">
    <div class="page-content">
      <header class="page-header">
        <div>
          <h1 class="page-title">玩法中心</h1>
          <p class="page-subtitle">完整玩法目录：先按分类选择玩法，再按功能逐条向服务器请求</p>
        </div>
        <button class="jade-button" type="button" :disabled="syncing" @click="refreshGameplayIndex">
          <RefreshCw :size="19" :class="{ spinning: syncing }" />
          <span>{{ syncing ? '刷新中' : '刷新检测状态' }}</span>
        </button>
      </header>

      <div class="summary-strip">
        <span>APK {{ summary.apk }}</span>
        <i></i>
        <span>{{ summary.activityGroups }} 个一级玩法</span>
        <i></i>
        <span>{{ summary.protocols }} 条 APK 协议常量</span>
        <i></i>
        <span>尚未收到数据 ≠ 未开放</span>
      </div>

      <ActivityAccountBar
        v-model:selected-user-id="selectedUserId"
        :users="users"
        :loading="usersLoading"
        :error="usersError"
        :connection-pending="connectionPending"
        @toggle-connection="toggleConnection"
      />

      <ActivityCategoryBar v-model:category="category" :categories="categoryCounts" />

      <ActivityFilters
        v-model:query="query"
        v-model:open-state="openState"
        v-model:risk="risk"
        v-model:include-unknown="includeUnknown"
      />

      <ActivityTable
        :activities="pageActivities"
        :selected-activity-name="selectedActivityName"
        :account-selected="selectedUser !== null"
        @inspect="inspectActivity"
      />

      <footer class="activity-footer">
        <span>共 {{ filteredActivities.length }} 个一级玩法，进入后可查看全部功能</span>
        <nav class="pagination" aria-label="玩法列表分页">
          <button type="button" aria-label="上一页" :disabled="currentPage === 1" @click="goToPage(currentPage - 1)">‹</button>
          <template v-for="(item, index) in paginationItems" :key="`${item}-${index}`">
            <span v-if="item === 'ellipsis'" class="ellipsis">…</span>
            <button
              v-else
              type="button"
              :class="{ 'pagination-current': item === currentPage }"
              :aria-current="item === currentPage ? 'page' : undefined"
              @click="goToPage(item)"
            >
              {{ item }}
            </button>
          </template>
          <button type="button" aria-label="下一页" :disabled="currentPage === totalPages" @click="goToPage(currentPage + 1)">›</button>
        </nav>
      </footer>
    </div>
  </section>

  <ActivityDrawer
    :open="selectedActivity !== null"
    :activity="selectedActivity"
    :user="selectedUser"
    :observation="selectedObservation"
    :run-states="protocolStates"
    @close="selectedActivityName = ''"
    @run="handleProtocolRun"
  />

  <div v-if="toastMessage" class="toast" :class="{ 'toast--error': toastTone === 'error' }" role="status">
    <AlertCircle v-if="toastTone === 'error'" :size="18" />
    <CheckCircle2 v-else :size="18" />
    {{ toastMessage }}
  </div>
</template>

<style scoped>
.summary-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  min-height: 48px;
  padding: 0 18px;
  color: #655e52;
  font-family: var(--font-serif);
  font-size: 13px;
  letter-spacing: 0.03em;
  background: linear-gradient(180deg, rgb(238 239 224 / 78%), rgb(229 232 214 / 72%));
  border: 1px solid var(--line);
  border-radius: 7px 7px 0 0;
}

.summary-strip i { width: 4px; height: 4px; background: #907442; border-radius: 50%; }
.activity-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 20px 14px 5px;
  color: #72695b;
  font-family: var(--font-serif);
  font-size: 14px;
}

.pagination { display: flex; align-items: center; gap: 7px; }
.pagination button {
  display: grid;
  min-width: 36px;
  height: 36px;
  padding: 0 8px;
  color: #4d483f;
  background: #fbf8ed;
  border: 1px solid #c7baa0;
  border-radius: 7px;
  place-items: center;
  cursor: pointer;
}

.pagination button:disabled { opacity: 0.45; }
.pagination .pagination-current {
  color: var(--jade-900);
  background: #eff3e9;
  border-color: var(--jade-700);
  box-shadow: inset 0 0 0 2px rgb(48 134 112 / 10%);
}

.ellipsis { min-width: 22px; text-align: center; }
.spinning { animation: spin 850ms linear infinite; }
.toast--error { background: #7a352b; }

@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 700px) {
  .summary-strip { gap: 8px 10px; padding-block: 10px; }
  .activity-footer { align-items: flex-start; flex-direction: column; }
  .pagination { max-width: 100%; overflow-x: auto; }
}
</style>
