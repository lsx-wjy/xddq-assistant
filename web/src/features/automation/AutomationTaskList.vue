<script setup lang="ts">
import { LockKeyhole, Settings2 } from '@lucide/vue'
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue'
import type { AutomationSettings, AutomationTask } from './types'
import { taskStateFor } from './types'

const props = defineProps<{
  tasks: readonly AutomationTask[]
  settings?: AutomationSettings
  allowCombat: boolean
  allowPurchase: boolean
}>()

const emit = defineEmits<{
  inspect: [task: AutomationTask]
  toggle: [task: AutomationTask, enabled: boolean]
}>()

function needsAuthorization(task: AutomationTask) {
  return (task.requires.includes('combat') && !props.allowCombat)
    || (task.requires.includes('purchase') && !props.allowPurchase)
}
</script>

<template>
  <div class="task-list">
    <article v-for="task in tasks" :key="task.id" class="task-row">
      <div class="task-leading">
        <ToggleSwitch
          :model-value="taskStateFor(task, settings).enabled"
          :label="`${task.name}开关`"
          :disabled="needsAuthorization(task)"
          @click.stop
          @update:model-value="emit('toggle', task, $event)"
        />
      </div>
      <div class="task-copy">
        <div class="task-name-line">
          <strong>{{ task.name }}</strong>
          <span v-if="needsAuthorization(task)" class="authorization-note"><LockKeyhole :size="12" />需授权</span>
        </div>
        <p>{{ task.description }}</p>
      </div>
      <button class="task-action" type="button" @click="emit('inspect', task)">
        <Settings2 :size="16" />
        <span>设置</span>
      </button>
    </article>
  </div>
</template>

<style scoped>
.task-list { display: grid; gap: 9px; }
.task-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  min-height: 90px;
  padding: 14px 15px;
  background: rgb(255 253 245 / 66%);
  border: 1px solid #cbbd9e;
  border-radius: 9px;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}
.task-row:hover { border-color: #9c8755; box-shadow: 0 6px 14px rgb(74 58 28 / 9%); }
.task-copy { min-width: 0; }
.task-name-line { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.task-name-line strong { color: #3a3023; font-family: var(--font-serif); font-size: 16px; }
.task-copy p { margin: 5px 0 3px; color: #716858; font-size: 12px; line-height: 1.55; }
.authorization-note { display: inline-flex; align-items: center; gap: 4px; padding: 3px 7px; font-family: var(--font-serif); font-size: 11px; font-weight: 700; border: 1px solid; border-radius: 5px; }
.authorization-note { color: #a65333; background: #f8e5dd; border-color: #d8a490; }
.task-action { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-width: 78px; min-height: 36px; color: #5a4730; font-family: var(--font-serif); font-size: 12px; font-weight: 750; background: #f8f0dc; border: 1px solid #c8b68f; border-radius: 6px; cursor: pointer; }
.task-action:hover { color: #1e6755; border-color: #699d89; }
@media (max-width: 620px) { .task-row { grid-template-columns: auto minmax(0, 1fr); gap: 12px; } .task-action { grid-column: 2; justify-self: start; } }
</style>
