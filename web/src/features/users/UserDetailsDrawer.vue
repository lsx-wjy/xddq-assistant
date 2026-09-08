<script setup lang="ts">
import { computed } from 'vue'
import { AlertCircle, KeyRound, Pencil, PlugZap, Power, ShieldCheck, UserRound } from '@lucide/vue'
import AppDrawer from '@/components/ui/AppDrawer.vue'
import { displayNameFor, categoryFor, categoryLabelFor } from '@/features/activities/activityTaxonomy'
import type { ConnectionState, UserRecord } from './types'

const props = withDefaults(defineProps<{
  open: boolean
  user: UserRecord | null
  connectionPending?: boolean
}>(), {
  connectionPending: false,
})

const emit = defineEmits<{
  close: []
  edit: [user: UserRecord]
  toggleConnection: [user: UserRecord]
}>()

const stateCopy: Record<ConnectionState, { label: string; detail: string; tone: string }> = {
  connecting: { label: '连接中', detail: '正在启动账号进程', tone: 'status-seal--amber' },
  running: { label: '运行中', detail: '游戏连接已建立', tone: '' },
  reconnecting: { label: '等待重连', detail: '正在等待下一次重连', tone: 'status-seal--amber' },
  stopped: { label: '已停止', detail: '由你手动连接', tone: 'status-seal--slate' },
  error: { label: '连接异常', detail: '请查看错误信息', tone: 'status-seal--red' },
}

const selectedActivities = computed(() =>
  (props.user?.selectedActivities ?? []).map(name => ({
    name,
    displayName: displayNameFor(name),
    categoryLabel: categoryLabelFor(categoryFor(name)),
  })),
)
const shouldDisconnect = computed(() => Boolean(
  props.user?.desiredConnected
  || props.user?.connectionState === 'running'
  || props.user?.connectionState === 'connecting'
  || props.user?.connectionState === 'reconnecting',
))
const connectButtonLabel = computed(() => {
  if (props.connectionPending) return '处理中…'
  if (shouldDisconnect.value) return '断开连接'
  if (props.user?.connectionBlocked) return '服务器限制中'
  return props.user?.connectionState === 'error' ? '重新连接' : '连接账号'
})
const restrictionDetails = computed(() => {
  if (props.user?.loginErrorCode !== 505) return null
  if (props.user.forbiddenEndTime) {
    return `服务器返回的解除时间：${formatDateTime(props.user.forbiddenEndTime)}`
  }
  if (props.user.retryBlockedUntil) {
    return `服务器未返回解除时间；为避免重复触发，暂停连接至 ${formatDateTime(props.user.retryBlockedUntil)}`
  }
  return '服务器未返回解除时间，请先使用官方客户端确认账号状态'
})

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
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
</script>

<template>
  <AppDrawer :open="open" labelled-by="user-details-title" @close="emit('close')">
    <div v-if="user" class="user-details">
      <header class="drawer-heading">
        <span class="details-avatar">{{ user.note.slice(0, 1) }}</span>
        <div>
          <h2 id="user-details-title">{{ user.note }}</h2>
          <p>{{ user.serverName }} · ID {{ user.serverId }}</p>
        </div>
      </header>

      <div class="connection-banner" :class="stateCopy[user.connectionState].tone">
        <span class="status-seal" :class="stateCopy[user.connectionState].tone">
          {{ stateCopy[user.connectionState].label }}
        </span>
        <span>
          <strong>{{ stateCopy[user.connectionState].detail }}</strong>
          <small>最近在线：{{ formatDate(user.lastOnlineAt) }}</small>
        </span>
      </div>

      <div v-if="user.lastError" class="error-banner" role="alert">
        <AlertCircle :size="18" />
        <span><strong>最近错误</strong>{{ user.lastError }}</span>
      </div>

      <div v-if="restrictionDetails" class="restriction-banner" role="status">
        <strong>登录保护已启动</strong>
        <span>{{ restrictionDetails }}</span>
      </div>

      <div class="ornament-line">账号信息</div>
      <dl class="details-list">
        <div>
          <dt><UserRound :size="16" /> 平台账号</dt>
          <dd>{{ user.account }}</dd>
        </div>
        <div>
          <dt><KeyRound :size="16" /> 登录密码</dt>
          <dd>{{ user.hasPassword ? '已保存在本机数据库' : '未保存' }}</dd>
        </div>
        <div>
          <dt>角色区服</dt>
          <dd>{{ user.serverName }}（ID {{ user.serverId }}）</dd>
        </div>
        <div>
          <dt>连接方式</dt>
          <dd>仅手动连接</dd>
        </div>
        <div>
          <dt>断线重连</dt>
          <dd>{{ user.autoReconnect ? '已开启' : '已关闭' }}</dd>
        </div>
      </dl>

      <div class="ornament-line">运行玩法</div>
      <div v-if="selectedActivities.length" class="selected-activities">
        <span v-for="activity in selectedActivities" :key="activity.name">
          <strong>{{ activity.displayName }}</strong>
          <small>{{ activity.categoryLabel }}</small>
        </span>
      </div>
      <div v-else class="empty-selection">当前没有选择任何玩法</div>

      <div class="ornament-line">安全设置</div>
      <dl class="details-list details-list--compact">
        <div>
          <dt><ShieldCheck :size="16" /> 消息快照</dt>
          <dd>{{ user.persistSnapshots ? '记录到本地日志' : '不记录' }}</dd>
        </div>
        <div>
          <dt>自动战斗</dt>
          <dd :class="{ 'risk-enabled': user.allowCombat }">{{ user.allowCombat ? '已允许' : '未允许' }}</dd>
        </div>
        <div>
          <dt>购买与交易</dt>
          <dd :class="{ 'risk-enabled': user.allowPurchase }">{{ user.allowPurchase ? '已允许' : '未允许' }}</dd>
        </div>
      </dl>

      <div class="drawer-actions details-actions">
        <button class="paper-button" type="button" @click="emit('edit', user)">
          <Pencil :size="17" />
          修改
        </button>
        <button
          class="jade-button"
          :class="{ 'disconnect-button': shouldDisconnect }"
          type="button"
          :disabled="connectionPending || user.connectionBlocked"
          @click="emit('toggleConnection', user)"
        >
          <Power v-if="shouldDisconnect" :size="18" />
          <PlugZap v-else :size="18" />
          {{ connectButtonLabel }}
        </button>
      </div>
    </div>
  </AppDrawer>
</template>

<style scoped>
.drawer-heading {
  display: flex;
  align-items: center;
  gap: 14px;
  padding-right: 48px;
}

.drawer-heading h2 {
  margin: 0;
  color: #372b1a;
  font-family: var(--font-display);
  font-size: 32px;
  letter-spacing: 0.07em;
}

.drawer-heading p {
  margin: 5px 0 0;
  color: #756c5d;
  font-family: var(--font-serif);
  font-size: 13px;
}

.details-avatar {
  display: grid;
  flex: 0 0 auto;
  width: 54px;
  height: 54px;
  color: #2c6d5c;
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 800;
  background: radial-gradient(circle at 40% 35%, #fbfaec 0 35%, #d5e1ce 36% 66%, #b5934e 68% 73%, #f2e1ab 75% 100%);
  border-radius: 50%;
  place-items: center;
  box-shadow: 0 3px 7px rgb(77 59 29 / 20%);
}

.connection-banner {
  display: flex;
  align-items: center;
  gap: 13px;
  margin-top: 22px;
  padding: 13px 14px;
  background: rgb(225 239 226 / 63%);
  border: 1px solid #b8c9b5;
  border-radius: 9px;
}

.connection-banner.status-seal--amber {
  background: rgb(255 241 215 / 67%);
  border-color: #dcb77d;
}

.connection-banner.status-seal--red {
  background: rgb(255 237 231 / 72%);
  border-color: #d7a18f;
}

.connection-banner.status-seal--slate {
  background: rgb(235 236 231 / 72%);
  border-color: #c2c5bd;
}

.connection-banner strong,
.connection-banner small {
  display: block;
}

.connection-banner strong {
  color: #3e372d;
  font-size: 13px;
}

.connection-banner small {
  margin-top: 3px;
  color: #7c7468;
  font-size: 11px;
}

.error-banner {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-top: 10px;
  padding: 10px 12px;
  color: #a64230;
  font-size: 12px;
  line-height: 1.5;
  background: rgb(255 237 231 / 78%);
  border: 1px solid #d7a18f;
  border-radius: 8px;
}

.error-banner strong {
  display: block;
}

.restriction-banner {
  margin-top: 10px;
  padding: 10px 12px;
  color: #7b5425;
  font-size: 12px;
  line-height: 1.5;
  background: rgb(255 244 215 / 82%);
  border: 1px solid #d8ba79;
  border-radius: 8px;
}

.restriction-banner strong,
.restriction-banner span {
  display: block;
}

.details-list {
  display: grid;
  gap: 1px;
  margin: 0;
  overflow: hidden;
  background: rgb(143 119 69 / 20%);
  border: 1px solid rgb(143 119 69 / 22%);
  border-radius: 9px;
}

.details-list > div {
  display: grid;
  grid-template-columns: 125px minmax(0, 1fr);
  gap: 16px;
  padding: 12px 14px;
  background: rgb(255 253 245 / 83%);
}

.details-list dt,
.details-list dd {
  margin: 0;
}

.details-list dt {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #746b5d;
  font-size: 12px;
  font-weight: 750;
}

.details-list dd {
  min-width: 0;
  color: #383027;
  font-family: var(--font-serif);
  font-size: 14px;
  overflow-wrap: anywhere;
}

.selected-activities {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 236px;
  padding-right: 4px;
  overflow-y: auto;
}

.selected-activities span {
  min-width: 116px;
  padding: 8px 10px;
  background: rgb(232 240 223 / 75%);
  border: 1px solid #bdc8a9;
  border-radius: 7px;
}

.selected-activities strong,
.selected-activities small {
  display: block;
}

.selected-activities strong {
  color: #345c4e;
  font-family: var(--font-serif);
  font-size: 13px;
}

.selected-activities small {
  margin-top: 3px;
  color: #7f776a;
  font-size: 10px;
}

.empty-selection {
  padding: 26px 14px;
  color: var(--text-muted);
  text-align: center;
  background: rgb(255 253 245 / 53%);
  border: 1px dashed #bcae91;
  border-radius: 8px;
}

.risk-enabled {
  color: var(--cinnabar) !important;
  font-weight: 800;
}

.details-actions button:disabled {
  opacity: 0.58;
}

.disconnect-button {
  background: linear-gradient(180deg, #c97b5c, #a84936);
}

@media (max-width: 620px) {
  .details-list > div {
    grid-template-columns: 1fr;
    gap: 5px;
  }
}
</style>
