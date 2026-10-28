<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue'
import { AlertTriangle, Eye, EyeOff, RefreshCw, ShieldCheck } from '@lucide/vue'
import AppDrawer from '@/components/ui/AppDrawer.vue'
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue'
import UserActivitySelector from './UserActivitySelector.vue'
import type { ServerOption, UserDraft, UserRecord } from './types'
import { useServerOptions } from './useServerOptions'

type UserFormState = Omit<UserDraft, 'serverId'> & { serverId: number | null }

const props = withDefaults(defineProps<{
  open: boolean
  user: UserRecord | null
  saving?: boolean
  error?: string
}>(), {
  saving: false,
  error: '',
})

const emit = defineEmits<{
  close: []
  save: [draft: UserDraft]
}>()

const passwordVisible = shallowRef(false)
const submitted = shallowRef(false)
const manualServerEntry = shallowRef(false)
const { options: serverOptions, loading: serversLoading, error: serverError, load: loadServerOptions, reset: resetServerOptions } = useServerOptions()

const form = reactive<UserFormState>(emptyForm())
const isEditing = computed(() => Boolean(props.user))
const canLoadServers = computed(() => form.account.trim().length > 0 && form.password.length > 0)
const selectableServers = computed<ServerOption[]>(() => {
  const options = [...serverOptions.value]
  const serverId = Number(form.serverId)
  if (Number.isInteger(serverId) && serverId > 0 && !options.some(option => option.serverId === serverId)) {
    options.unshift({ serverId, serverName: form.serverName || `区服 ${serverId}` })
  }
  return options
})
const serverPlaceholder = computed(() => {
  if (serversLoading.value) return '正在读取角色区服…'
  if (isEditing.value && form.serverId) return '当前已保存区服'
  if (!canLoadServers.value) return isEditing.value ? '填写密码后可重新读取区服' : '请先填写账号和密码'
  if (!selectableServers.value.length) return '点击右侧按钮读取区服'
  return '请选择角色所在区服'
})
const isValid = computed(() =>
  (isEditing.value ? form.note.trim().length > 0 : true)
  && form.account.trim().length > 0
  && (isEditing.value || form.password.length > 0)
  && Number.isInteger(Number(form.serverId))
  && Number(form.serverId) > 0,
)

function emptyForm(): UserFormState {
  return {
    note: '',
    account: '',
    password: '',
    serverName: '',
    serverId: null,
    autoReconnect: false,
    selectedActivities: [],
    persistSnapshots: false,
    allowCombat: false,
    allowPurchase: false,
  }
}

function hydrateForm(user: UserRecord | null) {
  Object.assign(form, user
    ? {
        note: user.note,
        account: user.account,
        password: '',
        serverName: user.serverName,
        serverId: user.serverId,
        autoReconnect: user.autoReconnect,
        selectedActivities: [...user.selectedActivities],
        persistSnapshots: user.persistSnapshots,
        allowCombat: user.allowCombat,
        allowPurchase: user.allowPurchase,
      }
    : emptyForm())
  passwordVisible.value = false
  submitted.value = false
  manualServerEntry.value = false
  resetServerOptions()
}

watch(
  [() => props.open, () => props.user?.id],
  ([open]) => {
    if (open) hydrateForm(props.user)
  },
  { immediate: true },
)

function loadServersIfReady() {
  if (!canLoadServers.value || serversLoading.value || serverOptions.value.length || manualServerEntry.value) return
  void loadServerOptions(form.account, form.password)
}

async function loadServers() {
  if (!canLoadServers.value || serversLoading.value) return
  manualServerEntry.value = false
  await loadServerOptions(form.account, form.password)
  if (serverOptions.value.length) {
    const selected = serverOptions.value.find(server => server.serverId === Number(form.serverId))
    if (!selected) {
      form.serverId = null
      form.serverName = ''
    }
  }
}

function selectServer() {
  const selected = selectableServers.value.find(server => server.serverId === Number(form.serverId))
  form.serverName = selected?.serverName ?? ''
}

function toggleManualServerEntry() {
  manualServerEntry.value = !manualServerEntry.value
}

function closeDrawer() {
  if (props.saving) return
  emit('close')
}

function saveUser() {
  submitted.value = true
  if (!isValid.value || props.saving) return
  emit('save', {
    note: form.note.trim() || form.serverName || form.account.trim(),
    account: form.account.trim(),
    password: form.password,
    serverId: Number(form.serverId),
    serverName: form.serverName || `区服 ${Number(form.serverId)}`,
    autoReconnect: form.autoReconnect,
    selectedActivities: [...form.selectedActivities],
    persistSnapshots: form.persistSnapshots,
    allowCombat: form.allowCombat,
    allowPurchase: form.allowPurchase,
  })
}
</script>

<template>
  <AppDrawer :open="open" labelled-by="user-form-title" @close="closeDrawer">
    <form class="user-form" @submit.prevent="saveUser">
      <header class="drawer-heading">
        <h2 id="user-form-title">{{ isEditing ? '修改用户' : '登录用户' }}</h2>
        <p>{{ isEditing ? '修改账号、区服与运行玩法' : '验证平台账号，并选择要加入管理台的角色' }}</p>
      </header>

      <div class="ornament-line">账号信息</div>
      <div class="form-fields">
        <label v-if="isEditing" class="field-label">
          <span>用户备注</span>
          <input v-model.trim="form.note" class="field-control" type="text" placeholder="例如：青云客" />
        </label>
        <label class="field-label">
          <span>平台账号</span>
          <input v-model.trim="form.account" class="field-control" type="text" placeholder="请输入账号" autocomplete="username" @blur="loadServersIfReady" />
        </label>
        <label class="field-label">
          <span>登录密码</span>
          <span class="password-field">
            <input
              v-model="form.password"
              class="field-control"
              :type="passwordVisible ? 'text' : 'password'"
              :placeholder="isEditing ? '留空保持原密码' : '请输入密码'"
              autocomplete="current-password"
              @blur="loadServersIfReady"
            />
            <button type="button" :aria-label="passwordVisible ? '隐藏密码' : '显示密码'" @click="passwordVisible = !passwordVisible">
              <EyeOff v-if="passwordVisible" :size="18" />
              <Eye v-else :size="18" />
            </button>
          </span>
        </label>
        <label v-if="manualServerEntry" class="field-label">
          <span>区服 ID</span>
          <input v-model.number="form.serverId" class="field-control" type="number" min="1" placeholder="请输入数字区服 ID" />
        </label>
        <label v-else class="field-label">
          <span>选择区服</span>
          <span class="server-field">
            <select
              v-model.number="form.serverId"
              class="field-control"
              :disabled="serversLoading || !selectableServers.length"
              @change="selectServer"
            >
              <option :value="null" disabled>{{ serverPlaceholder }}</option>
              <option v-for="serverOption in selectableServers" :key="serverOption.serverId" :value="serverOption.serverId">
                {{ serverOption.serverName }}（ID {{ serverOption.serverId }}）
              </option>
            </select>
            <button
              class="paper-button server-load-button"
              type="button"
              :disabled="!canLoadServers || serversLoading"
              @click="loadServers"
            >
              <RefreshCw :size="16" :class="{ 'is-spinning': serversLoading }" />
              {{ serversLoading ? '读取中' : '读取区服' }}
            </button>
          </span>
        </label>
        <label v-if="manualServerEntry" class="field-label">
          <span>区服名称</span>
          <input v-model.trim="form.serverName" class="field-control" type="text" placeholder="例如：青云" />
        </label>
      </div>

      <div class="server-feedback" aria-live="polite">
        <span v-if="manualServerEntry">自动读取失败时，可手动填写区服名称和数字 ID</span>
        <span v-else-if="serverError" class="server-feedback__error">{{ serverError }}</span>
        <span v-else-if="serverOptions.length">已读取 {{ serverOptions.length }} 个角色区服，请选择区服名称</span>
        <span v-else-if="isEditing">当前区服会保留；如需重新读取，请填写密码后点击按钮</span>
        <span v-else>填写账号和密码后可以读取角色区服</span>
        <button type="button" @click="toggleManualServerEntry">
          {{ manualServerEntry ? '返回区服选择' : '手动填写区服' }}
        </button>
      </div>

      <p class="privacy-note">
        <ShieldCheck :size="15" />
        {{ isEditing ? '密码仅保存在本机 SQLite 数据库中，不会返回浏览器页面' : '登录时会再次验证账号与所选区服，成功后才加入用户列表' }}
      </p>
      <p v-if="submitted && !isValid" class="form-error">
        请完整填写{{ isEditing ? '备注、' : '' }}账号{{ isEditing ? '' : '、密码' }}并选择有效区服。
      </p>
      <p v-if="error" class="form-error">{{ error }}</p>

      <template v-if="isEditing">
        <div class="ornament-line">运行玩法</div>
        <UserActivitySelector v-model="form.selectedActivities" />

        <div class="ornament-line">连接与安全</div>
        <div class="settings-list">
        <div class="settings-row">
          <div class="settings-copy">
            <strong>断线自动重连</strong>
            <small>仅在你手动连接后生效，默认关闭</small>
          </div>
          <ToggleSwitch v-model="form.autoReconnect" label="断线自动重连" />
        </div>
        <div class="settings-row">
          <div class="settings-copy">
            <strong>记录玩法消息快照</strong>
            <small>把所选玩法的最新消息保存到本地日志</small>
          </div>
          <ToggleSwitch v-model="form.persistSnapshots" label="记录玩法消息快照" />
        </div>
        <div class="settings-row settings-row--risk">
          <div class="settings-copy">
            <strong>允许自动战斗 <AlertTriangle :size="14" /></strong>
            <small>只对所选且已实现自动战斗的玩法生效</small>
          </div>
          <ToggleSwitch v-model="form.allowCombat" label="允许自动战斗" />
        </div>
        <div class="settings-row settings-row--danger">
          <div class="settings-copy">
            <strong>允许购买与交易 <AlertTriangle :size="14" /></strong>
            <small>默认关闭；当前兼容层不会自动开启消费行为</small>
          </div>
          <ToggleSwitch v-model="form.allowPurchase" label="允许购买与交易" />
        </div>
        </div>
      </template>

      <div class="drawer-actions">
        <button class="paper-button" type="button" :disabled="saving" @click="closeDrawer">取消</button>
        <button class="jade-button" type="submit" :disabled="saving">
          {{ saving ? (isEditing ? '正在保存…' : '正在登录…') : isEditing ? '保存修改' : '登录用户' }}
        </button>
      </div>
    </form>
  </AppDrawer>
</template>

<style scoped>
.drawer-heading h2 {
  margin: 0;
  color: #372b1a;
  font-family: var(--font-display);
  font-size: 34px;
  letter-spacing: 0.08em;
}

.drawer-heading p {
  margin: 7px 0 0;
  color: #756c5d;
  font-family: var(--font-serif);
  font-size: 14px;
  letter-spacing: 0.04em;
}

.form-fields {
  display: grid;
  gap: 13px;
}

.password-field {
  position: relative;
}

.password-field .field-control {
  padding-right: 46px;
}

.password-field button {
  position: absolute;
  top: 50%;
  right: 8px;
  display: grid;
  width: 34px;
  height: 34px;
  color: #6c665b;
  background: transparent;
  border: 0;
  border-radius: 50%;
  place-items: center;
  transform: translateY(-50%);
  cursor: pointer;
}

.server-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 9px;
}

.server-field select:disabled {
  color: #8c8578;
  background: rgb(238 233 219 / 72%);
}

.server-load-button {
  min-width: 112px;
  min-height: 44px;
  padding: 0 13px;
  font-size: 13px;
}

.server-load-button:disabled,
.drawer-actions button:disabled {
  opacity: 0.58;
  filter: grayscale(0.35);
  transform: none;
}

.server-feedback {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-height: 25px;
  margin: 7px 0 0 117px;
  color: #6f766a;
  font-size: 12px;
  line-height: 1.5;
}

.server-feedback__error {
  color: var(--cinnabar);
}

.server-feedback button {
  flex: 0 0 auto;
  padding: 3px 0;
  color: var(--jade-800);
  font-size: 12px;
  font-weight: 700;
  background: transparent;
  border: 0;
  border-bottom: 1px dashed currentColor;
  cursor: pointer;
}

.is-spinning {
  animation: server-spin 800ms linear infinite;
}

@keyframes server-spin {
  to { transform: rotate(360deg); }
}

.privacy-note,
.form-error {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 12px 0 0 117px;
  color: #4b7968;
  font-size: 12px;
  line-height: 1.5;
}

.form-error {
  color: var(--cinnabar);
}

.settings-copy strong {
  display: flex;
  align-items: center;
  gap: 6px;
}

.settings-row--risk svg {
  color: var(--amber);
}

.settings-row--danger svg {
  color: var(--cinnabar);
}

@media (max-width: 620px) {
  .server-field {
    grid-template-columns: 1fr;
  }

  .server-load-button {
    width: 100%;
  }

  .server-feedback {
    margin-left: 0;
  }

  .privacy-note,
  .form-error {
    margin-left: 0;
  }
}
</style>
