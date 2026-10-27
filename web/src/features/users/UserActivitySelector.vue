<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { CheckCheck, Eraser, Search, ShieldAlert } from '@lucide/vue'
import { useActivities } from '@/features/activities/useActivities'
import { searchAliasesFor } from '@/features/activities/activityTaxonomy'

const selectedActivities = defineModel<string[]>({ required: true })

const { activities, categories } = useActivities()
const query = shallowRef('')
const category = shallowRef('all')

const selectedSet = computed(() => new Set(selectedActivities.value))
const visibleActivities = computed(() => {
  const normalizedQuery = query.value.trim().toLocaleLowerCase()
  return activities.value.filter(activity => {
    const matchesCategory = category.value === 'all' || activity.category === category.value
    const matchesQuery = !normalizedQuery
      || activity.displayName.toLocaleLowerCase().includes(normalizedQuery)
      || activity.name.toLocaleLowerCase().includes(normalizedQuery)
      || searchAliasesFor(activity.name).some(alias => alias.toLocaleLowerCase().includes(normalizedQuery))
      || activity.categoryLabel.toLocaleLowerCase().includes(normalizedQuery)
    return matchesCategory && matchesQuery
  })
})
const selectedVisibleCount = computed(() =>
  visibleActivities.value.filter(activity => selectedSet.value.has(activity.name)).length,
)

function setSelected(name: string, checked: boolean) {
  if (checked) {
    selectedActivities.value = [...new Set([...selectedActivities.value, name])]
    return
  }
  selectedActivities.value = selectedActivities.value.filter(item => item !== name)
}

function selectVisible() {
  selectedActivities.value = [
    ...new Set([...selectedActivities.value, ...visibleActivities.value.map(activity => activity.name)]),
  ]
}

function clearAll() {
  selectedActivities.value = []
}

function riskCopy(level: 'low' | 'medium' | 'high') {
  if (level === 'high') return '购买/交易'
  if (level === 'medium') return '战斗'
  return ''
}
</script>

<template>
  <section class="activity-selector" aria-labelledby="activity-selector-title">
    <div class="selector-heading">
      <div>
        <strong id="activity-selector-title">选择要运行的玩法</strong>
        <small>未选择时不接入任何玩法；已实现自动流程的项目还会遵循下方安全开关。</small>
      </div>
      <span class="selected-count">已选 {{ selectedActivities.length }} / {{ activities.length }}</span>
    </div>

    <div class="selector-toolbar">
      <label class="selector-search">
        <Search :size="17" aria-hidden="true" />
        <span class="sr-only">搜索玩法</span>
        <input v-model="query" type="search" placeholder="搜索玩法名称" />
      </label>
      <select v-model="category" class="selector-category" aria-label="玩法分类">
        <option value="all">全部分类</option>
        <option v-for="item in categories" :key="item.id" :value="item.id">
          {{ item.label }}
        </option>
      </select>
    </div>

    <div class="selector-actions">
      <span>当前范围 {{ visibleActivities.length }} 项，已选 {{ selectedVisibleCount }} 项</span>
      <span class="selector-action-buttons">
        <button type="button" :disabled="!visibleActivities.length" @click="selectVisible">
          <CheckCheck :size="15" />
          选择当前范围
        </button>
        <button type="button" :disabled="!selectedActivities.length" @click="clearAll">
          <Eraser :size="15" />
          清空全部
        </button>
      </span>
    </div>

    <div class="activity-list">
      <label v-for="activity in visibleActivities" :key="activity.name" class="activity-option">
        <input
          type="checkbox"
          :checked="selectedSet.has(activity.name)"
          @change="setSelected(activity.name, ($event.target as HTMLInputElement).checked)"
        />
        <span class="activity-check" aria-hidden="true"></span>
        <span class="activity-copy">
          <strong>{{ activity.displayName }}</strong>
          <small>{{ activity.categoryLabel }} · {{ activity.name }}</small>
        </span>
        <span v-if="activity.riskLevel !== 'low'" class="risk-mark" :class="`risk-mark--${activity.riskLevel}`">
          <ShieldAlert :size="13" />
          {{ riskCopy(activity.riskLevel) }}
        </span>
      </label>
      <p v-if="visibleActivities.length === 0" class="selector-empty">没有匹配的玩法</p>
    </div>
  </section>
</template>

<style scoped>
.activity-selector {
  overflow: hidden;
  background: rgb(255 253 245 / 55%);
  border: 1px solid rgb(158 132 77 / 36%);
  border-radius: 10px;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 70%);
}

.selector-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 15px 12px;
  background: linear-gradient(180deg, rgb(232 239 220 / 85%), rgb(242 240 220 / 54%));
  border-bottom: 1px solid var(--line);
}

.selector-heading strong,
.selector-heading small {
  display: block;
}

.selector-heading strong {
  color: #3d3428;
  font-family: var(--font-serif);
  font-size: 15px;
}

.selector-heading small {
  max-width: 330px;
  margin-top: 4px;
  color: #7b7468;
  font-size: 12px;
  line-height: 1.5;
}

.selected-count {
  flex: 0 0 auto;
  padding: 5px 9px;
  color: var(--jade-800);
  font-size: 12px;
  font-weight: 800;
  background: rgb(225 239 226 / 82%);
  border: 1px solid #b2c8b2;
  border-radius: 7px;
}

.selector-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 142px;
  gap: 9px;
  padding: 12px 12px 9px;
}

.selector-search {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 39px;
  padding: 0 11px;
  color: #82796b;
  background: rgb(255 255 249 / 82%);
  border: 1px solid #b9aa8a;
  border-radius: 7px;
}

.selector-search:focus-within {
  color: var(--jade-700);
  border-color: var(--jade-700);
  box-shadow: 0 0 0 3px rgb(49 141 117 / 12%);
}

.selector-search input {
  width: 100%;
  min-width: 0;
  color: var(--text-strong);
  font-size: 13px;
  background: transparent;
  border: 0;
  outline: 0;
}

.selector-category {
  min-height: 39px;
  padding: 0 9px;
  color: var(--text-strong);
  font-size: 13px;
  background: rgb(255 255 249 / 82%);
  border: 1px solid #b9aa8a;
  border-radius: 7px;
}

.selector-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 12px 10px;
  color: #81796c;
  font-size: 11px;
}

.selector-action-buttons {
  display: flex;
  gap: 10px;
}

.selector-action-buttons button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 0;
  color: var(--jade-800);
  font-size: 11px;
  font-weight: 750;
  background: transparent;
  border: 0;
  border-bottom: 1px dashed currentColor;
  cursor: pointer;
}

.selector-action-buttons button:disabled {
  color: #aaa293;
  cursor: not-allowed;
}

.activity-list {
  max-height: 330px;
  padding: 2px 7px 8px;
  overflow-y: auto;
  border-top: 1px solid rgb(145 116 59 / 15%);
}

.activity-option {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  min-height: 54px;
  padding: 8px 9px;
  border-bottom: 1px solid rgb(137 113 70 / 15%);
  cursor: pointer;
  transition: background 140ms ease;
}

.activity-option:hover {
  background: rgb(224 237 223 / 52%);
}

.activity-option input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.activity-check {
  display: grid;
  width: 18px;
  height: 18px;
  background: #fffdf5;
  border: 1px solid #a89b82;
  border-radius: 4px;
  place-items: center;
}

.activity-check::after {
  width: 8px;
  height: 4px;
  content: '';
  border-bottom: 2px solid white;
  border-left: 2px solid white;
  opacity: 0;
  transform: rotate(-45deg) translateY(-1px);
}

.activity-option input:checked + .activity-check {
  background: var(--jade-700);
  border-color: var(--jade-900);
  box-shadow: inset 0 0 0 2px rgb(255 255 255 / 20%);
}

.activity-option input:checked + .activity-check::after {
  opacity: 1;
}

.activity-option input:focus-visible + .activity-check {
  outline: 3px solid rgb(41 137 113 / 25%);
  outline-offset: 2px;
}

.activity-copy strong,
.activity-copy small {
  display: block;
}

.activity-copy strong {
  color: #3c3428;
  font-family: var(--font-serif);
  font-size: 14px;
}

.activity-copy small {
  margin-top: 3px;
  color: #8a8275;
  font-size: 11px;
}

.risk-mark {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px;
  color: #b2611f;
  font-size: 10px;
  font-weight: 750;
  background: #fff1d7;
  border: 1px solid #dcb77d;
  border-radius: 5px;
}

.risk-mark--high {
  color: var(--cinnabar);
  background: #fff0ea;
  border-color: #d7a18f;
}

.selector-empty {
  margin: 0;
  padding: 38px 12px;
  color: var(--text-muted);
  text-align: center;
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

@media (max-width: 620px) {
  .selector-heading,
  .selector-actions {
    align-items: flex-start;
    flex-direction: column;
  }

  .selector-toolbar {
    grid-template-columns: 1fr;
  }

  .selector-action-buttons {
    width: 100%;
    justify-content: space-between;
  }

  .activity-option {
    grid-template-columns: 20px minmax(0, 1fr);
  }

  .risk-mark {
    grid-column: 2;
    justify-self: start;
  }
}
</style>
