<script setup lang="ts">
import { computed } from 'vue'
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue'
import type { AutomationField, AutomationSettingSource, AutomationTask, AutomationTaskState } from './types'

const props = defineProps<{
  task: AutomationTask
  state: AutomationTaskState
  disabled: boolean
  enableDisabled: boolean
}>()

const emit = defineEmits<{
  updateState: [state: AutomationTaskState]
}>()

const sourceMeta: Record<Exclude<AutomationSettingSource, 'none'>, { title: string, description: string }> = {
  apk: {
    title: '游戏原生设置',
    description: '字段按游戏客户端的自动模式还原；实际是否生效仍以当前角色的解锁、会员和服务器规则为准。',
  },
  script: {
    title: '脚本运行规则',
    description: '这是本助手额外提供的安全保护或执行规则，并不属于游戏客户端的原生设置。',
  },
}

const fieldGroups = computed(() => (['apk', 'script'] as const)
  .map(source => ({
    source,
    ...sourceMeta[source],
    fields: props.task.fields.filter(field => settingSourceFor(field) === source),
  }))
  .filter(group => group.fields.length > 0))

const hasConfigurableFields = computed(() => props.task.fields.length > 0)
const noSettingsMessage = computed(() => props.task.settingsNote || '这项自动任务没有额外可调参数，会依据游戏当前状态和可领取次数执行。')

function settingSourceFor(field: AutomationField): Exclude<AutomationSettingSource, 'none'> {
  return field.source || (props.task.settingsSource === 'apk' ? 'apk' : 'script')
}

function updateEnabled(enabled: boolean) {
  emit('updateState', { enabled, values: { ...props.state.values } })
}

function updateValue(key: string, value: number | boolean) {
  emit('updateState', { enabled: props.state.enabled, values: { ...props.state.values, [key]: value } })
}
</script>

<template>
  <div class="settings-form">
    <section class="settings-intro">
      <div class="settings-copy">
        <strong>启用此任务</strong>
        <small>这是助手的运行开关；保存后点击“运行已选任务”才会应用到当前已连接的角色。</small>
      </div>
      <ToggleSwitch
        :model-value="state.enabled"
        label="启用此任务"
        :disabled="enableDisabled"
        @update:model-value="updateEnabled"
      />
    </section>

    <template v-if="hasConfigurableFields">
      <section v-for="group in fieldGroups" :key="group.source" class="settings-group">
        <header class="settings-group-heading">
          <strong>{{ group.title }}</strong>
          <p>{{ group.description }}</p>
        </header>

        <label v-for="field in group.fields" :key="field.key" class="automation-field">
          <span class="automation-field-copy">
            <strong>{{ field.label }}</strong>
            <small v-if="field.help">{{ field.help }}</small>
          </span>
          <ToggleSwitch
            v-if="field.type === 'toggle'"
            :model-value="Boolean(state.values[field.key])"
            :label="field.label"
            :disabled="disabled"
            @update:model-value="updateValue(field.key, $event)"
          />
          <select
            v-else-if="field.type === 'select'"
            :value="Number(state.values[field.key])"
            class="field-control automation-select"
            :disabled="disabled"
            @change="updateValue(field.key, Number(($event.target as HTMLSelectElement).value))"
          >
            <option v-for="option in field.options ?? []" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
          <input
            v-else
            :value="Number(state.values[field.key])"
            class="field-control automation-number"
            type="number"
            :min="field.min"
            :max="field.max"
            :disabled="disabled"
            @input="updateValue(field.key, Number(($event.target as HTMLInputElement).value))"
          >
        </label>
      </section>
    </template>
    <section v-else class="no-settings-panel">
      <strong>按游戏状态执行</strong>
      <p>{{ noSettingsMessage }}</p>
    </section>
  </div>
</template>

<style scoped>
.settings-form { display: grid; gap: 18px; }
.settings-intro,
.no-settings-panel { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px; border: 1px solid #cad7c5; border-radius: 8px; background: #f0f5ed; }
.settings-copy strong,
.settings-copy small { display: block; }
.settings-copy strong,
.settings-group-heading strong,
.automation-field-copy strong,
.no-settings-panel strong { color: #3d3428; font-size: 15px; line-height: 1.35; }
.settings-copy small,
.settings-group-heading p,
.automation-field-copy small,
.no-settings-panel p { margin: 3px 0 0; color: #7d7569; font-size: 12px; line-height: 1.55; }
.settings-group { border-top: 1px dashed #c8b998; padding-top: 16px; }
.settings-group-heading { margin-bottom: 7px; }
.automation-field { display: grid; grid-template-columns: minmax(0, 1fr) minmax(120px, 180px); align-items: center; gap: 16px; min-height: 57px; padding: 8px 4px; }
.automation-field-copy strong,
.automation-field-copy small { display: block; }
.automation-number,
.automation-select { text-align: center; }
.no-settings-panel { display: block; background: #f6f1e5; border-color: #d9c89e; }
@media (max-width: 620px) {
  .settings-intro { align-items: flex-start; flex-direction: column; }
  .automation-field { grid-template-columns: 1fr; gap: 8px; }
  .automation-field .toggle { justify-self: start; }
}
</style>
