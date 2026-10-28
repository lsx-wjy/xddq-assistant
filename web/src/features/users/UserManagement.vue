<script setup lang="ts">
import { computed, onUnmounted, shallowRef } from 'vue'
import { AlertCircle, CheckCircle2, LoaderCircle, LogIn, RefreshCw } from '@lucide/vue'
import { displayNameFor } from '@/features/activities/activityTaxonomy'
import UserDetailsDrawer from './UserDetailsDrawer.vue'
import UserDrawer from './UserDrawer.vue'
import UserFilters from './UserFilters.vue'
import UserTable from './UserTable.vue'
import { useUsers } from './useUsers'
import type { UserDraft, UserRecord } from './types'

const {
  users,
  loading,
  error,
  serverOptions,
  refreshUsers,
  loginUser,
  updateUser,
  setConnection,
} = useUsers()

const query = shallowRef('')
const status = shallowRef('all')
const server = shallowRef('all')
const drawerOpen = shallowRef(false)
const editingUserId = shallowRef('')
const detailUserId = shallowRef('')
const saving = shallowRef(false)
const saveError = shallowRef('')
const connectionPendingId = shallowRef('')
const toastMessage = shallowRef('')
const toastTone = shallowRef<'success' | 'error'>('success')
let toastTimer: number | undefined

const editingUser = computed(() => users.value.find(user => user.id === editingUserId.value) ?? null)
const detailUser = computed(() => users.value.find(user => user.id === detailUserId.value) ?? null)
const visibleUsers = computed(() => {
  const normalizedQuery = query.value.trim().toLocaleLowerCase()
  return users.value.filter(user => {
    const activityText = user.selectedActivities.map(displayNameFor).join(' ')
    const matchesQuery = !normalizedQuery
      || user.note.toLocaleLowerCase().includes(normalizedQuery)
      || user.account.toLocaleLowerCase().includes(normalizedQuery)
      || user.accountMasked.toLocaleLowerCase().includes(normalizedQuery)
      || `${user.serverName}${user.serverId}`.toLocaleLowerCase().includes(normalizedQuery)
      || activityText.toLocaleLowerCase().includes(normalizedQuery)
    const matchesStatus = status.value === 'all' || user.connectionState === status.value
    const matchesServer = server.value === 'all' || String(user.serverId) === server.value
    return matchesQuery && matchesStatus && matchesServer
  })
})
const emptyMessage = computed(() => {
  if (loading.value && !users.value.length) return '正在读取本机用户…'
  if (users.value.length && !visibleUsers.value.length) return '没有符合当前筛选条件的用户'
  return '还没有用户，点击右上角添加'
})

function showToast(message: string, tone: 'success' | 'error' = 'success') {
  toastMessage.value = message
  toastTone.value = tone
  if (toastTimer) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toastMessage.value = ''
  }, 3_200)
}

function openCreateDrawer() {
  editingUserId.value = ''
  saveError.value = ''
  drawerOpen.value = true
}

function openEditDrawer(user: UserRecord) {
  detailUserId.value = ''
  editingUserId.value = user.id
  saveError.value = ''
  drawerOpen.value = true
}

function openDetails(user: UserRecord) {
  detailUserId.value = user.id
}

function closeFormDrawer() {
  if (saving.value) return
  drawerOpen.value = false
  editingUserId.value = ''
  saveError.value = ''
}

async function handleSave(draft: UserDraft) {
  if (saving.value) return
  saving.value = true
  saveError.value = ''
  try {
    const currentUser = editingUser.value
    if (currentUser) {
      const updated = await updateUser(currentUser.id, draft)
      drawerOpen.value = false
      editingUserId.value = ''
      detailUserId.value = updated.id
      showToast(`已保存“${updated.note}”的修改，连接保持关闭`)
      return
    }
    const created = await loginUser({ account: draft.account, password: draft.password, serverId: draft.serverId })
    drawerOpen.value = false
    detailUserId.value = created.id
    showToast(`“${created.note}”登录验证成功，已加入用户列表`)
  } catch (requestError) {
    saveError.value = requestError instanceof Error ? requestError.message : '用户保存失败'
  } finally {
    saving.value = false
  }
}

async function toggleConnection(user: UserRecord) {
  if (connectionPendingId.value) return
  if (user.connectionBlocked) {
    showToast(user.lastError || '该角色当前被服务器限制登录，请等待解除后再试', 'error')
    return
  }
  const shouldConnect = !user.desiredConnected
    && user.connectionState !== 'running'
    && user.connectionState !== 'connecting'
    && user.connectionState !== 'reconnecting'
  connectionPendingId.value = user.id
  try {
    const updated = await setConnection(user.id, shouldConnect)
    showToast(shouldConnect ? `正在连接“${updated.note}”` : `已断开“${updated.note}”`)
  } catch (requestError) {
    showToast(requestError instanceof Error ? requestError.message : '连接操作失败', 'error')
  } finally {
    connectionPendingId.value = ''
  }
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
          <h1 class="page-title">用户管理</h1>
          <p class="page-subtitle">账号、区服、连接与运行玩法均由你逐项管理</p>
        </div>
        <button class="jade-button" type="button" aria-label="登录用户" @click="openCreateDrawer">
          <LogIn :size="20" />
          <span>登录用户</span>
        </button>
      </header>

      <div v-if="error" class="service-error" role="alert">
        <AlertCircle :size="18" />
        <span>{{ error }}</span>
        <button type="button" :disabled="loading" @click="refreshUsers()">
          <RefreshCw :size="15" :class="{ 'is-spinning': loading }" />
          重新读取
        </button>
      </div>

      <UserFilters
        v-model:query="query"
        v-model:status="status"
        v-model:server="server"
        :servers="serverOptions"
      />

      <div class="table-stage">
        <span v-if="loading && users.length" class="refresh-indicator">
          <LoaderCircle :size="14" class="is-spinning" />
          正在同步状态
        </span>
        <UserTable
          :users="visibleUsers"
          :connection-pending-id="connectionPendingId"
          :empty-message="emptyMessage"
          @inspect="openDetails"
          @edit="openEditDrawer"
          @toggle-connection="toggleConnection"
        />
      </div>

      <footer class="table-footer">
        <span>当前显示 {{ visibleUsers.length }} 位，共 {{ users.length }} 位用户</span>
        <span>连接不会自动开启 · 玩法默认不选择</span>
      </footer>
    </div>
  </section>

  <UserDrawer
    :open="drawerOpen"
    :user="editingUser"
    :saving="saving"
    :error="saveError"
    @close="closeFormDrawer"
    @save="handleSave"
  />

  <UserDetailsDrawer
    :open="Boolean(detailUserId)"
    :user="detailUser"
    :connection-pending="connectionPendingId === detailUserId"
    @close="detailUserId = ''"
    @edit="openEditDrawer"
    @toggle-connection="toggleConnection"
  />

  <div v-if="toastMessage" class="toast" :class="{ 'toast--error': toastTone === 'error' }" role="status">
    <AlertCircle v-if="toastTone === 'error'" :size="18" />
    <CheckCircle2 v-else :size="18" />
    {{ toastMessage }}
  </div>
</template>

<style scoped>
.service-error {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 4px 14px;
  padding: 11px 13px;
  color: #a64331;
  font-size: 13px;
  background: rgb(255 237 231 / 82%);
  border: 1px solid #d7a18f;
  border-radius: 8px;
}

.service-error span {
  flex: 1;
}

.service-error button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 8px;
  color: inherit;
  font-size: 12px;
  font-weight: 750;
  background: transparent;
  border: 1px solid currentColor;
  border-radius: 6px;
  cursor: pointer;
}

.table-stage {
  position: relative;
}

.refresh-indicator {
  position: absolute;
  top: -31px;
  right: 12px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #718075;
  font-size: 11px;
}

.table-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 24px 14px 6px;
  color: #72695b;
  font-family: var(--font-serif);
  font-size: 13px;
}

.is-spinning {
  animation: spin 800ms linear infinite;
}

.toast--error {
  background: #8f3829;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 620px) {
  .page-header .jade-button span {
    display: none;
  }

  .service-error,
  .table-footer {
    align-items: flex-start;
    flex-direction: column;
  }

  .table-footer {
    gap: 6px;
  }
}
</style>
