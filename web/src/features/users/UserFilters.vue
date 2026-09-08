<script setup lang="ts">
import { Search } from '@lucide/vue'

const query = defineModel<string>('query', { required: true })
const status = defineModel<string>('status', { required: true })
const server = defineModel<string>('server', { required: true })

defineProps<{
  servers: Array<{ id: number; label: string }>
}>()
</script>

<template>
  <div class="filters">
    <label class="search-control">
      <Search :size="20" :stroke-width="1.8" aria-hidden="true" />
      <span class="sr-only">搜索用户、账号、区服或玩法</span>
      <input v-model="query" type="search" placeholder="搜索用户、账号、区服或玩法" />
    </label>
    <select v-model="status" class="filter-control" aria-label="连接状态">
      <option value="all">全部状态</option>
      <option value="connecting">连接中</option>
      <option value="running">运行中</option>
      <option value="reconnecting">等待重连</option>
      <option value="stopped">已停止</option>
      <option value="error">连接异常</option>
    </select>
    <select v-model="server" class="filter-control" aria-label="区服">
      <option value="all">全部区服</option>
      <option v-for="item in servers" :key="item.id" :value="String(item.id)">
        {{ item.label }}
      </option>
    </select>
  </div>
</template>

<style scoped>
.filters {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 190px 190px;
  gap: 16px;
  padding: 18px 14px;
  background: rgb(236 239 224 / 65%);
  border-block: 1px solid var(--line);
}

.search-control {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 0 14px;
  color: #7d7567;
  background: rgb(255 253 245 / 86%);
  border: 1px solid #b9aa8a;
  border-radius: 8px;
  box-shadow: inset 0 2px 4px rgb(91 75 44 / 6%);
}

.search-control:focus-within {
  color: var(--jade-700);
  border-color: var(--jade-700);
  box-shadow: 0 0 0 3px rgb(49 141 117 / 13%);
}

.search-control input {
  width: 100%;
  min-width: 0;
  color: var(--text-strong);
  background: transparent;
  border: 0;
  outline: 0;
}

.search-control input::placeholder {
  color: #999183;
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

@media (max-width: 820px) {
  .filters {
    grid-template-columns: 1fr 1fr;
  }

  .search-control {
    grid-column: 1 / -1;
  }
}

@media (max-width: 520px) {
  .filters {
    grid-template-columns: 1fr;
    padding-inline: 4px;
  }

  .search-control {
    grid-column: auto;
  }
}
</style>
