<script setup lang="ts">
import { Search } from '@lucide/vue'
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue'

const query = defineModel<string>('query', { required: true })
const openState = defineModel<string>('openState', { required: true })
const risk = defineModel<string>('risk', { required: true })
const includeUnknown = defineModel<boolean>('includeUnknown', { required: true })
</script>

<template>
  <div class="activity-filters">
    <label class="activity-search">
      <Search :size="20" :stroke-width="1.8" aria-hidden="true" />
      <span class="sr-only">搜索玩法、任务或功能</span>
      <input v-model="query" type="search" placeholder="搜索玩法、任务或功能" />
    </label>
    <select v-model="openState" class="filter-control" aria-label="检测状态">
      <option value="all">全部检测状态</option>
      <option value="observed">已收到服务端数据</option>
      <option value="unknown">尚未检测</option>
      <option value="closed">服务器明确未开放</option>
    </select>
    <select v-model="risk" class="filter-control" aria-label="风险级别">
      <option value="all">全部风险级别</option>
      <option value="low">观察</option>
      <option value="medium">战斗</option>
      <option value="high">购买与交易</option>
    </select>
    <div class="unknown-switch">
      <div>
        <strong>包含尚未检测玩法</strong>
        <small>功能仍全部可查看</small>
      </div>
      <ToggleSwitch v-model="includeUnknown" label="包含尚未检测玩法" />
    </div>
  </div>
</template>

<style scoped>
.activity-filters {
  display: grid;
  grid-template-columns: minmax(250px, 1fr) 190px 190px minmax(210px, auto);
  gap: 14px;
  align-items: center;
  padding: 16px 14px;
  background: rgb(236 239 224 / 65%);
  border-block: 1px solid var(--line);
}

.activity-search {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 0 14px;
  color: #7d7567;
  background: rgb(255 253 245 / 86%);
  border: 1px solid #b9aa8a;
  border-radius: 8px;
}

.activity-search:focus-within {
  color: var(--jade-700);
  border-color: var(--jade-700);
  box-shadow: 0 0 0 3px rgb(49 141 117 / 13%);
}

.activity-search input {
  width: 100%;
  min-width: 0;
  color: var(--text-strong);
  background: transparent;
  border: 0;
  outline: none;
}

.activity-search input::placeholder {
  color: #999183;
}

.unknown-switch {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}

.unknown-switch strong,
.unknown-switch small {
  display: block;
  text-align: right;
}

.unknown-switch strong {
  color: #4a4033;
  font-size: 13px;
}

.unknown-switch small {
  margin-top: 3px;
  color: #a25d1f;
  font-family: var(--font-serif);
  font-size: 11px;
  font-weight: 700;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 1180px) {
  .activity-filters {
    grid-template-columns: 1fr 1fr;
  }

  .activity-search {
    grid-column: 1 / -1;
  }
}

@media (max-width: 600px) {
  .activity-filters {
    grid-template-columns: 1fr;
    padding-inline: 4px;
  }

  .activity-search {
    grid-column: auto;
  }

  .unknown-switch {
    justify-content: space-between;
  }

  .unknown-switch strong,
  .unknown-switch small {
    text-align: left;
  }
}
</style>
