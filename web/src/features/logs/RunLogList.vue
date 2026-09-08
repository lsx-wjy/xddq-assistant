<script setup lang="ts">
import { ScrollText } from '@lucide/vue'
import type { AutomationRunLog } from '@/features/users/types'

interface Props {
  entries: readonly AutomationRunLog[]
  hasSelectedUser: boolean
}

defineProps<Props>()

function displayTime(value: string) {
  return new Date(value).toLocaleTimeString('zh-CN', { hour12: false })
}
</script>

<template>
  <section class="log-panel" aria-label="运行日志列表">
    <div v-if="!hasSelectedUser" class="empty-state">
      <ScrollText :size="26" />
      <p>请选择一个已保存的账号，查看它的运行记录。</p>
    </div>
    <div v-else-if="!entries.length" class="empty-state">
      <ScrollText :size="26" />
      <p>当前筛选条件下没有日志。运行已选任务后，结果会实时显示在这里。</p>
    </div>
    <ol v-else class="log-list">
      <li v-for="(entry, index) in entries" :key="`${entry.at}-${index}`" :class="`log-entry log-entry--${entry.level}`">
        <time :datetime="entry.at">{{ displayTime(entry.at) }}</time>
        <span class="log-level">{{ entry.level }}</span>
        <p>{{ entry.message }}</p>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.log-panel { min-height: 250px; overflow: hidden; background: rgb(255 253 245 / 58%); border: 1px solid #c9b99d; border-radius: 8px; }
.empty-state { display: grid; min-height: 250px; padding: 36px 20px; color: #857765; place-content: center; justify-items: center; text-align: center; }
.empty-state p { max-width: 390px; margin: 11px 0 0; font-size: 13px; line-height: 1.6; }
.log-list { max-height: min(61vh, 690px); margin: 0; padding: 0; overflow: auto; list-style: none; }
.log-entry { display: grid; grid-template-columns: 76px 62px minmax(0, 1fr); gap: 10px; align-items: start; padding: 11px 14px; color: #5f655c; border-bottom: 1px solid #e2dac7; }
.log-entry:last-child { border-bottom: 0; }
.log-entry time { color: #887c69; font-family: ui-monospace, Consolas, monospace; font-size: 11px; line-height: 1.55; }
.log-level { width: fit-content; padding: 2px 6px; color: #786c5b; font-size: 10px; font-weight: 800; line-height: 1.25; text-transform: uppercase; background: #f0eadb; border: 1px solid #d4c8b2; border-radius: 4px; }
.log-entry p { margin: 0; font-size: 13px; line-height: 1.55; word-break: break-word; }
.log-entry--success { color: #27715b; }.log-entry--success .log-level { color: #27715b; background: #e4f1e5; border-color: #a9c6ad; }
.log-entry--error { color: #a14430; }.log-entry--error .log-level { color: #a14430; background: #f8e5dd; border-color: #d7a292; }
.log-entry--skip { color: #8b692e; }.log-entry--skip .log-level { color: #8b692e; background: #f8efd7; border-color: #d5bd82; }
@media (max-width: 620px) { .log-entry { grid-template-columns: 64px minmax(0, 1fr); gap: 7px; }.log-level { grid-column: 1; }.log-entry p { grid-column: 2; grid-row: 1 / span 2; } }
</style>
