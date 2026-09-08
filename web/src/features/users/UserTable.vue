<script setup lang="ts">
import { Eye, LoaderCircle, Pencil, PlugZap, Power } from '@lucide/vue'
import type { ConnectionState, UserRecord } from './types'

withDefaults(defineProps<{
  users: UserRecord[]
  connectionPendingId?: string
  emptyMessage?: string
}>(), {
  connectionPendingId: '',
  emptyMessage: '还没有用户，点击右上角添加',
})

const emit = defineEmits<{
  inspect: [user: UserRecord]
  edit: [user: UserRecord]
  toggleConnection: [user: UserRecord]
}>()

const stateCopy: Record<ConnectionState, { label: string; detail: string; tone: string }> = {
  connecting: { label: '连接中', detail: '正在启动', tone: 'status-seal--amber' },
  running: { label: '运行中', detail: '游戏连接已建立', tone: '' },
  reconnecting: { label: '等待重连', detail: '正在等待重连', tone: 'status-seal--amber' },
  stopped: { label: '已停止', detail: '由你手动连接', tone: 'status-seal--slate' },
  error: { label: '连接异常', detail: '查看详情了解原因', tone: 'status-seal--red' },
}

function shouldDisconnect(user: UserRecord) {
  return user.desiredConnected
    || user.connectionState === 'running'
    || user.connectionState === 'connecting'
    || user.connectionState === 'reconnecting'
}

function formatDate(value: string | null) {
  if (!value) return '尚未连接'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function safetyCopy(user: UserRecord) {
  const enabled = []
  if (user.allowCombat) enabled.push('战斗')
  if (user.allowPurchase) enabled.push('购买')
  return enabled.length ? `已允许${enabled.join('、')}` : '仅接收与解析'
}

function connectionActionLabel(user: UserRecord, pending: boolean) {
  if (pending) return '处理中'
  if (shouldDisconnect(user)) return '断开'
  if (user.connectionBlocked) return '暂不可重试'
  return user.connectionState === 'error' ? '重试' : '连接'
}

function stateDetail(user: UserRecord) {
  if (user.loginErrorCode === 505) {
    return user.connectionBlocked ? '服务器已限制角色登录' : '限制冷却已结束，请谨慎重试'
  }
  return stateCopy[user.connectionState].detail
}

function connectionTitle(user: UserRecord) {
  if (user.connectionBlocked) {
    return user.retryBlockedUntil
      ? `为避免重复触发 505，暂停至 ${new Date(user.retryBlockedUntil).toLocaleString('zh-CN')}`
      : '角色当前被服务器限制登录'
  }
  return shouldDisconnect(user) ? '断开此用户' : '连接此用户'
}
</script>

<template>
  <div class="table-wrap">
    <table class="user-table">
      <thead>
        <tr>
          <th>用户</th>
          <th>区服</th>
          <th>连接状态</th>
          <th>运行玩法</th>
          <th>安全设置</th>
          <th>最近在线</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="user in users" :key="user.id">
          <td>
            <div class="user-cell">
              <span class="avatar">{{ user.note.slice(0, 1) }}</span>
              <span>
                <strong>{{ user.note }}</strong>
                <small>{{ user.accountMasked }}</small>
              </span>
            </div>
          </td>
          <td>
            <strong class="server-name">{{ user.serverName }}</strong>
            <small class="cell-detail">ID {{ user.serverId }}</small>
          </td>
          <td>
            <span class="status-seal" :class="stateCopy[user.connectionState].tone">
              {{ stateCopy[user.connectionState].label }}
            </span>
            <small class="cell-detail">{{ stateDetail(user) }}</small>
          </td>
          <td>
            <strong class="task-count">{{ user.taskCount ? `${user.taskCount} 项` : '未选择' }}</strong>
            <small class="cell-detail">保存后不会自动连接</small>
          </td>
          <td>
            <span :class="{ 'safety-risk': user.allowCombat || user.allowPurchase }">{{ safetyCopy(user) }}</span>
          </td>
          <td>{{ formatDate(user.lastOnlineAt) }}</td>
          <td>
            <div class="row-actions">
              <button type="button" title="查看账号详情" @click="emit('inspect', user)">
                <Eye :size="17" />
                <span>查看</span>
              </button>
              <button type="button" title="修改用户" @click="emit('edit', user)">
                <Pencil :size="16" />
                <span>修改</span>
              </button>
              <button
                class="connection-action"
                :class="{ 'connection-action--stop': shouldDisconnect(user) }"
                type="button"
                :disabled="connectionPendingId === user.id || user.connectionBlocked"
                :title="connectionTitle(user)"
                @click="emit('toggleConnection', user)"
              >
                <LoaderCircle v-if="connectionPendingId === user.id" class="is-spinning" :size="16" />
                <Power v-else-if="shouldDisconnect(user)" :size="16" />
                <PlugZap v-else :size="16" />
                <span>{{ connectionActionLabel(user, connectionPendingId === user.id) }}</span>
              </button>
            </div>
          </td>
        </tr>
        <tr v-if="users.length === 0">
          <td class="empty-cell" colspan="7"><span>{{ emptyMessage }}</span></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.table-wrap {
  overflow-x: auto;
}

.user-table {
  width: 100%;
  min-width: 900px;
  border-collapse: collapse;
  table-layout: fixed;
}

.user-table th,
.user-table td {
  padding: 15px 13px;
  text-align: left;
  vertical-align: middle;
  border-bottom: 1px solid var(--line);
}

.user-table th {
  color: #413723;
  font-family: var(--font-serif);
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.05em;
  background: linear-gradient(180deg, rgb(233 237 220 / 88%), rgb(226 230 211 / 72%));
}

.user-table th:nth-child(1) { width: 16%; }
.user-table th:nth-child(2) { width: 11%; }
.user-table th:nth-child(3) { width: 15%; }
.user-table th:nth-child(4) { width: 13%; }
.user-table th:nth-child(5) { width: 13%; }
.user-table th:nth-child(6) { width: 12%; }
.user-table th:nth-child(7) { width: 20%; }

.user-table tbody tr {
  background: rgb(255 253 245 / 43%);
  transition: background 150ms ease, box-shadow 150ms ease;
}

.user-table tbody tr:hover {
  background: rgb(225 238 225 / 64%);
  box-shadow: inset 3px 0 var(--jade-700);
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 11px;
}

.user-cell strong,
.user-cell small {
  display: block;
}

.user-cell strong,
.server-name,
.task-count {
  color: #352d21;
  font-family: var(--font-serif);
  font-size: 15px;
}

.user-cell small,
.cell-detail {
  margin-top: 4px;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.35;
}

.avatar {
  display: grid;
  flex: 0 0 auto;
  width: 43px;
  height: 43px;
  color: #2c6d5c;
  font-family: var(--font-display);
  font-size: 21px;
  font-weight: 800;
  background: radial-gradient(circle at 40% 35%, #fbfaec 0 35%, #d5e1ce 36% 66%, #b5934e 68% 73%, #f2e1ab 75% 100%);
  border-radius: 50%;
  place-items: center;
  box-shadow: 0 2px 5px rgb(77 59 29 / 18%);
}

.cell-detail {
  display: block;
}

.safety-risk {
  color: var(--cinnabar);
  font-weight: 750;
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 3px;
}

.row-actions button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 34px;
  padding: 0 6px;
  color: var(--jade-800);
  font-size: 12px;
  background: transparent;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
}

.row-actions button:hover {
  background: rgb(46 132 108 / 10%);
}

.row-actions .connection-action {
  margin-left: 2px;
  padding-inline: 8px;
  color: #fff7dc;
  font-weight: 750;
  background: var(--jade-700);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 24%);
}

.row-actions .connection-action:hover {
  background: var(--jade-800);
}

.row-actions .connection-action--stop {
  color: #a64531;
  background: rgb(255 239 232 / 86%);
  border: 1px solid #d3a08d;
  box-shadow: none;
}

.row-actions .connection-action:disabled {
  opacity: 0.58;
  cursor: wait;
}

.is-spinning {
  animation: spin 800ms linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty-cell {
  height: 210px;
  color: var(--text-muted);
  font-family: var(--font-serif);
  font-size: 15px;
  text-align: left !important;
}

.empty-cell span {
  position: sticky;
  left: 0;
  display: block;
  width: min(100%, calc(100vw - 49px));
  text-align: center;
}
</style>
