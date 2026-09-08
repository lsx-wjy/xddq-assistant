<script setup lang="ts">
import { computed } from 'vue'
import { CircleAlert, LoaderCircle, LogIn, LogOut, UserRoundCheck } from '@lucide/vue'
import type { ConnectionState, UserRecord } from '@/features/users/types'

const props = defineProps<{
  users: readonly UserRecord[]
  loading: boolean
  error: string
  connectionPending: boolean
}>()

const emit = defineEmits<{
  toggleConnection: []
}>()

const selectedUserId = defineModel<string>('selectedUserId', { required: true })

const selectedUser = computed(() =>
  props.users.find(user => user.id === selectedUserId.value) ?? null,
)

const stateCopy: Record<ConnectionState, { label: string; tone: string }> = {
  connecting: { label: '连接中', tone: 'status-seal--amber' },
  running: { label: '运行中', tone: '' },
  reconnecting: { label: '等待重连', tone: 'status-seal--amber' },
  stopped: { label: '未连接', tone: 'status-seal--slate' },
  error: { label: '连接异常', tone: 'status-seal--red' },
}

const connectionActive = computed(() => Boolean(
  selectedUser.value?.desiredConnected
  || selectedUser.value?.connectionState === 'running'
  || selectedUser.value?.connectionState === 'connecting'
  || selectedUser.value?.connectionState === 'reconnecting',
))

const connectionButtonTitle = computed(() => {
  if (!selectedUser.value) return '请先选择账号'
  if (selectedUser.value.connectionBlocked && !connectionActive.value) {
    return selectedUser.value.lastError || '该角色当前被服务器限制登录'
  }
  return connectionActive.value ? '断开当前账号' : '连接当前账号'
})
</script>

<template>
  <section class="account-runner" aria-label="玩法运行账号">
    <div class="account-copy">
      <UserRoundCheck :size="22" />
      <span>
        <strong>运行账号</strong>
        <small>连接由你手动控制，不会因运行功能自动登录</small>
      </span>
    </div>

    <div class="account-control">
      <LoaderCircle v-if="loading" class="is-spinning" :size="17" aria-hidden="true" />
      <select v-model="selectedUserId" :disabled="loading || users.length === 0" aria-label="选择运行账号">
        <option value="">{{ users.length ? '请选择账号与区服' : '请先在用户管理中添加账号' }}</option>
        <option v-for="user in users" :key="user.id" :value="user.id">
          {{ user.note }} · {{ user.accountMasked }} · {{ user.serverName }}
        </option>
      </select>
      <span
        v-if="selectedUser"
        class="status-seal"
        :class="stateCopy[selectedUser.connectionState].tone"
      >
        {{ stateCopy[selectedUser.connectionState].label }}
      </span>
      <span v-else class="selection-hint">未选择账号</span>
      <button
        class="connection-button"
        :class="{ 'connection-button--disconnect': connectionActive }"
        type="button"
        :disabled="!selectedUser || connectionPending || (selectedUser.connectionBlocked && !connectionActive)"
        :title="connectionButtonTitle"
        @click="emit('toggleConnection')"
      >
        <LoaderCircle v-if="connectionPending" class="is-spinning" :size="16" />
        <LogOut v-else-if="connectionActive" :size="16" />
        <LogIn v-else :size="16" />
        {{ connectionActive ? '断开' : '连接' }}
      </button>
    </div>

    <p v-if="error" class="account-error" role="alert">
      <CircleAlert :size="15" />
      {{ error }}
    </p>
  </section>
</template>

<style scoped>
.account-runner {
  display: grid;
  grid-template-columns: minmax(240px, 0.9fr) minmax(360px, 1.1fr);
  align-items: center;
  gap: 16px 24px;
  min-height: 74px;
  padding: 13px 17px;
  background:
    linear-gradient(100deg, rgb(226 238 225 / 88%), rgb(248 243 226 / 88%));
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  border-left: 1px solid var(--line);
}

.account-copy,
.account-control {
  display: flex;
  align-items: center;
}

.account-copy {
  gap: 11px;
  color: var(--jade-800);
}

.account-copy strong,
.account-copy small {
  display: block;
}

.account-copy strong {
  color: #3c3428;
  font-family: var(--font-serif);
  font-size: 15px;
}

.account-copy small {
  margin-top: 3px;
  color: #7b7265;
  font-size: 12px;
}

.account-control {
  justify-content: flex-end;
  gap: 10px;
}

.account-control select {
  width: min(100%, 380px);
  min-height: 42px;
  padding: 0 38px 0 13px;
  color: var(--text-strong);
  background: rgb(255 253 245 / 94%);
  border: 1px solid #ad9f80;
  border-radius: 8px;
  cursor: pointer;
}

.account-control select:disabled {
  color: var(--text-muted);
  cursor: not-allowed;
}

.selection-hint {
  color: #7d7467;
  font-size: 12px;
  white-space: nowrap;
}

.connection-button {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  gap: 6px;
  padding: 0 13px;
  color: #fff5d8;
  font-family: var(--font-serif);
  font-size: 13px;
  font-weight: 750;
  background: linear-gradient(180deg, #4b9f86, #256d5b);
  border: 1px solid #8c743e;
  border-radius: 7px;
  cursor: pointer;
}

.connection-button--disconnect {
  background: linear-gradient(180deg, #b86952, #944431);
}

.connection-button:disabled {
  color: #8b8476;
  background: #e4e0d4;
  border-color: #bbb3a1;
  cursor: not-allowed;
}

.account-error {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 7px;
  margin: -4px 0 0;
  color: var(--cinnabar);
  font-size: 12px;
}

.is-spinning {
  animation: spin 850ms linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 860px) {
  .account-runner {
    grid-template-columns: 1fr;
  }

  .account-control {
    justify-content: flex-start;
  }
}

@media (max-width: 620px) {
  .account-runner {
    padding: 13px 10px;
  }

  .account-control {
    align-items: stretch;
    flex-direction: column;
  }

  .account-control select {
    width: 100%;
  }
}
</style>
