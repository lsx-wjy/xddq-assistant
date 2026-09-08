<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { AlertTriangle, CheckCircle2, CircleDashed, LockKeyhole, Save } from '@lucide/vue'
import AppDrawer from '@/components/ui/AppDrawer.vue'
import type { UserRecord } from '@/features/users/types'
import type { AutomationSettings, AutomationTask, AutomationTaskState } from './types'
import { taskStateFor } from './types'
import AutomationTaskSettingsForm from './AutomationTaskSettingsForm.vue'

const props = defineProps<{
  open: boolean
  task: AutomationTask | null
  settings?: AutomationSettings
  user: UserRecord | null
  saving: boolean
}>()

const emit = defineEmits<{
  close: []
  save: [task: AutomationTask, state: AutomationTaskState]
}>()

const localState = reactive<AutomationTaskState>({ enabled: false, values: {} })

function hydrateLocalState() {
  if (!props.task) return
  const state = taskStateFor(props.task, props.settings)
  localState.enabled = state.enabled
  localState.values = { ...state.values }
}

watch(
  [() => props.open, () => props.task?.id ?? '', () => props.user?.id ?? ''],
  ([open]) => {
    // The user list refreshes while tasks are running. Reloading from the
    // props on every refresh would overwrite a value the user is typing.
    if (open) hydrateLocalState()
  },
  { immediate: true },
)

const authorizationMissing = computed(() => {
  if (!props.task || !props.user) return []
  const missing: string[] = []
  if (props.task.requires.includes('combat') && !props.user.allowCombat) missing.push('战斗')
  if (props.task.requires.includes('purchase') && !props.user.allowPurchase) missing.push('购买')
  return missing
})

const canEnable = computed(() => props.task?.status === 'ready' && authorizationMissing.value.length === 0)
function close() {
  if (!props.saving) emit('close')
}

function save() {
  if (!props.task || props.saving) return
  emit('save', props.task, { enabled: canEnable.value ? localState.enabled : false, values: { ...localState.values } })
}

function updateLocalState(state: AutomationTaskState) {
  localState.enabled = state.enabled
  localState.values = { ...state.values }
}
</script>

<template>
  <AppDrawer :open="open" labelled-by="automation-task-title" @close="close">
    <template v-if="task">
      <header class="drawer-heading">
        <h2 id="automation-task-title">{{ task.name }}</h2>
      </header>

      <section class="task-description">
        <CircleDashed :size="19" />
        <p>{{ task.description }}</p>
      </section>

      <template v-if="task.status === 'ready'">
        <section v-if="!user" class="warning-panel">
          <AlertTriangle :size="19" />
          <p>请先选择一个用户。任务配置将按用户和区服分别保存。</p>
        </section>
        <section v-else-if="authorizationMissing.length" class="warning-panel">
          <LockKeyhole :size="19" />
          <p>此任务需要{{ authorizationMissing.join('、') }}授权。请先在“用户管理”的运行玩法区域开启相应授权。</p>
        </section>

        <div class="ornament-line">运行与规则</div>
        <AutomationTaskSettingsForm
          :task="task"
          :state="localState"
          :disabled="!user"
          :enable-disabled="!canEnable"
          @update-state="updateLocalState"
        />

        <section class="connection-note">
          <CheckCircle2 :size="18" />
          <p>保存不会自动连接或断开账号。点击“运行已选任务”后才会将配置应用到你已手动连接的角色。</p>
        </section>
      </template>

      <section v-else class="not-ready-panel">
        <AlertTriangle :size="20" />
        <div>
          <strong>{{ task.status === 'protocol' ? '协议已经识别，但尚未形成可靠的自动流程' : task.status === 'partial' ? '已有部分原脚本逻辑，尚不能安全地提供完整开关' : '已列入任务目录，等待后续实现' }}</strong>
          <p>为避免出现“看起来能开启、实际上无效”的按钮，这项任务暂不提供开关。相关底层协议仍可在“协议工具”中查看和逐条调试。</p>
        </div>
      </section>

      <footer v-if="task.status === 'ready'" class="drawer-actions">
        <button class="paper-button" type="button" :disabled="saving" @click="close">取消</button>
        <button class="jade-button" type="button" :disabled="saving || !user" @click="save">
          <Save :size="18" />
          <span>{{ saving ? '保存中' : '保存任务配置' }}</span>
        </button>
      </footer>
    </template>
  </AppDrawer>
</template>

<style scoped>
.drawer-heading { padding-right: 38px; }
.drawer-heading h2 { margin: 0; color: #302617; font-family: var(--font-display); font-size: 31px; line-height: 1.15; }
.task-description,
.connection-note,
.warning-panel,
.not-ready-panel { display: flex; gap: 10px; margin-top: 20px; padding: 12px; border: 1px solid; border-radius: 8px; }
.task-description { color: #536e61; background: #eaf1e8; border-color: #b7cab4; }
.task-description p,
.connection-note p,
.warning-panel p,
.not-ready-panel p { margin: 0; font-size: 12px; line-height: 1.65; }
.warning-panel { color: #9b4f32; background: #f9e7df; border-color: #d7a18d; }
.connection-note { color: #376c59; background: #e5f0e7; border-color: #aac4b0; }
.not-ready-panel { color: #705b35; background: #f4ecd9; border-color: #d1bb8c; }
.not-ready-panel strong { display: block; color: #594323; font-family: var(--font-serif); font-size: 14px; line-height: 1.45; }
.not-ready-panel p { margin-top: 5px; color: #75664e; }
</style>
