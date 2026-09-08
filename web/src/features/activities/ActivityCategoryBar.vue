<script setup lang="ts">
import type { GameplayCategory } from './types'

interface CategoryCount {
  id: GameplayCategory | 'all'
  label: string
  description: string
  count: number
}

defineProps<{
  categories: readonly CategoryCount[]
}>()

const category = defineModel<GameplayCategory | 'all'>('category', { required: true })
</script>

<template>
  <nav class="category-bar" aria-label="玩法分类">
    <button
      v-for="item in categories"
      :key="item.id"
      type="button"
      :class="{ 'category-chip--active': category === item.id }"
      :aria-pressed="category === item.id"
      :title="item.description"
      @click="category = item.id"
    >
      <span>{{ item.label }}</span>
      <small>{{ item.count }}</small>
    </button>
  </nav>
</template>

<style scoped>
.category-bar {
  display: flex;
  gap: 9px;
  padding: 14px;
  overflow-x: auto;
  background: rgb(247 242 224 / 80%);
  border-bottom: 1px solid var(--line);
  scrollbar-width: thin;
}

.category-bar button {
  display: inline-flex;
  flex: 0 0 auto;
  min-height: 38px;
  align-items: center;
  gap: 8px;
  padding: 0 13px;
  color: #665d50;
  font-size: 13px;
  font-weight: 700;
  background: linear-gradient(180deg, #fffdf5, #eee8d6);
  border: 1px solid #c8b996;
  border-radius: 8px;
  box-shadow: inset 0 1px rgb(255 255 255 / 80%);
  cursor: pointer;
  transition: color 150ms ease, background 150ms ease, border-color 150ms ease;
}

.category-bar button:hover {
  color: var(--jade-800);
  border-color: #8fad9d;
}

.category-bar small {
  display: grid;
  min-width: 24px;
  height: 22px;
  padding: 0 6px;
  color: #7d715e;
  font-size: 11px;
  background: rgb(120 106 75 / 10%);
  border-radius: 99px;
  place-items: center;
}

.category-bar .category-chip--active {
  color: #fff5d5;
  background: linear-gradient(180deg, #4eaa8f, #27715e);
  border-color: #9f7d3c;
  box-shadow: inset 0 0 0 2px rgb(255 235 174 / 22%), 0 3px 8px rgb(39 94 77 / 18%);
}

.category-chip--active small {
  color: #f8e9bc;
  background: rgb(8 57 47 / 34%);
}

@media (max-width: 620px) {
  .category-bar {
    margin-inline: -4px;
    padding: 11px 4px;
  }
}
</style>
