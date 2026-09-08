<script setup lang="ts">
import { ChevronRight, ListTree } from '@lucide/vue'
import medallionSheet from '@/assets/activity-medallions.png'
import type { ActivityItem } from './types'

defineProps<{
  activities: readonly ActivityItem[]
  selectedActivityName: string
  accountSelected: boolean
}>()

const emit = defineEmits<{
  inspect: [activity: ActivityItem]
}>()

const observationCopy = {
  observed: { label: '已收到服务端数据', tone: '' },
  closed: { label: '服务器明确未开放', tone: 'status-seal--red' },
  unknown: { label: '尚未检测', tone: 'status-seal--slate' },
} as const

function medallionStyle(index: number) {
  const column = index % 3
  const row = Math.floor(index / 3)
  return {
    backgroundImage: `url(${medallionSheet})`,
    backgroundPosition: `${column * 50}% ${row * 100}%`,
  }
}

function strategyTone(activity: ActivityItem) {
  if (activity.riskLevel === 'high') return 'strategy--danger'
  if (activity.riskLevel === 'medium') return 'strategy--amber'
  return ''
}
</script>

<template>
  <div class="table-wrap">
    <table class="activity-table">
      <thead>
        <tr>
          <th>玩法 / 任务</th>
          <th>玩法分类</th>
          <th>检测状态</th>
          <th>功能数量</th>
          <th>请求能力</th>
          <th>最近数据</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="activity in activities"
          :key="activity.name"
          :class="{ 'activity-row--selected': selectedActivityName === activity.name }"
          @dblclick="emit('inspect', activity)"
        >
          <td>
            <div class="activity-cell">
              <span class="medallion" :style="medallionStyle(activity.iconIndex)" aria-hidden="true"></span>
              <span>
                <strong>{{ activity.displayName }}</strong>
                <small>{{ activity.name }}</small>
              </span>
            </div>
          </td>
          <td>
            <span class="category-badge" :class="`category-badge--${activity.category}`">
              {{ activity.categoryLabel }}
            </span>
          </td>
          <td>
            <span class="status-seal" :class="accountSelected ? observationCopy[activity.openState].tone : 'status-seal--slate'">
              {{ accountSelected ? observationCopy[activity.openState].label : '请先选择账号' }}
            </span>
            <small v-if="activity.observedProtocolCount" class="observation-count">
              {{ activity.observedProtocolCount }} 个功能有数据
            </small>
          </td>
          <td class="feature-count">{{ activity.protocols.length }}</td>
          <td>
            <span class="strategy" :class="strategyTone(activity)">{{ activity.strategy }}</span>
            <small class="execution-note">进入详情后逐条操作</small>
          </td>
          <td>{{ activity.recentMessage }}</td>
          <td>
            <button class="detail-action" type="button" :title="`查看${activity.displayName}的全部功能`" @click="emit('inspect', activity)">
              <ListTree :size="17" />
              <span>功能详情</span>
              <ChevronRight :size="15" />
            </button>
          </td>
        </tr>
        <tr v-if="activities.length === 0">
          <td class="empty-cell" colspan="7">没有匹配的玩法或任务</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.table-wrap { overflow-x: auto; }

.activity-table {
  width: 100%;
  min-width: 1010px;
  border-collapse: collapse;
  table-layout: fixed;
}

.activity-table th,
.activity-table td {
  padding: 10px 13px;
  text-align: left;
  vertical-align: middle;
  border-bottom: 1px solid var(--line);
}

.activity-table th {
  height: 48px;
  color: #413723;
  font-family: var(--font-serif);
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.05em;
  background: linear-gradient(180deg, rgb(233 237 220 / 88%), rgb(226 230 211 / 72%));
}

.activity-table th:nth-child(1) { width: 18%; }
.activity-table th:nth-child(2) { width: 12%; }
.activity-table th:nth-child(3) { width: 18%; }
.activity-table th:nth-child(4) { width: 9%; }
.activity-table th:nth-child(5) { width: 18%; }
.activity-table th:nth-child(6) { width: 11%; }
.activity-table th:nth-child(7) { width: 14%; }

.activity-table tbody tr {
  background: rgb(255 253 245 / 42%);
  transition: background 150ms ease, box-shadow 150ms ease;
}

.activity-table tbody tr:hover,
.activity-table tbody .activity-row--selected {
  background: rgb(225 238 225 / 66%);
  box-shadow: inset 3px 0 var(--jade-700);
}

.activity-cell { display: flex; align-items: center; gap: 11px; }
.activity-cell strong,
.activity-cell small { display: block; }
.activity-cell strong { color: #322b20; font-family: var(--font-serif); font-size: 15px; }
.activity-cell small {
  max-width: 150px;
  margin-top: 3px;
  overflow: hidden;
  color: var(--text-muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.medallion {
  flex: 0 0 auto;
  width: 50px;
  height: 50px;
  background-repeat: no-repeat;
  background-size: 300% 200%;
  border: 2px solid #c2a65e;
  border-radius: 50%;
  box-shadow: inset 0 0 0 2px rgb(255 241 185 / 45%), 0 2px 5px rgb(68 50 20 / 21%);
}

.feature-count { color: #3b3429; font-family: var(--font-serif); font-size: 17px; }

.category-badge {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  padding: 3px 10px;
  color: #276756;
  font-family: var(--font-serif);
  font-size: 12px;
  font-weight: 700;
  background: #e4efe5;
  border: 1px solid #acc5b5;
  border-radius: 7px;
  white-space: nowrap;
}

.category-badge--competition,
.category-badge--challenge { color: #9a5a20; background: #f8ead1; border-color: #d6b67a; }
.category-badge--union { color: #695287; background: #ede5f2; border-color: #bea9cc; }
.category-badge--seasonal,
.category-badge--welfare { color: #9a4e42; background: #f8e5dc; border-color: #d7aa97; }
.category-badge--commerce { color: #a44734; background: #f6ddd5; border-color: #d49685; }
.category-badge--system,
.category-badge--other { color: #647071; background: #e8ebea; border-color: #b8c0bd; }

.strategy { color: var(--jade-800); font-family: var(--font-serif); font-size: 13px; font-weight: 700; }
.strategy--amber { color: var(--amber); }
.strategy--danger { color: var(--cinnabar); }
.execution-note,
.observation-count { display: block; margin-top: 3px; color: var(--text-muted); font-size: 10px; }

.detail-action {
  display: inline-flex;
  min-height: 35px;
  align-items: center;
  gap: 5px;
  padding: 0 9px;
  color: var(--jade-800);
  font-family: var(--font-serif);
  font-size: 12px;
  font-weight: 750;
  background: rgb(238 244 232 / 72%);
  border: 1px solid #9eb8a8;
  border-radius: 6px;
  cursor: pointer;
}

.detail-action:hover { background: rgb(214 233 215 / 88%); border-color: var(--jade-700); }
.empty-cell { height: 190px; color: var(--text-muted); text-align: center !important; }
</style>
