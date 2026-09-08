<script setup lang="ts">
import {
  Activity,
  Bot,
  House,
  ScrollText,
  Settings,
  Users,
} from '@lucide/vue'
import companionImage from '@/assets/cultivator-companion.png'

type PageKey = 'overview' | 'users' | 'automation' | 'activities' | 'logs' | 'settings'

const currentPage = defineModel<PageKey>({ required: true })

const navigation = [
  { key: 'overview', label: '总览', icon: House, enabled: true },
  { key: 'users', label: '用户管理', icon: Users, enabled: true },
  { key: 'automation', label: '自动任务', icon: Bot, enabled: true },
  { key: 'activities', label: '玩法中心', icon: Activity, enabled: true },
  { key: 'logs', label: '运行日志', icon: ScrollText, enabled: true },
  { key: 'settings', label: '系统设置', icon: Settings, enabled: true },
] as const

function selectItem(key: string, enabled: boolean) {
  if (enabled && (key === 'overview' || key === 'users' || key === 'automation' || key === 'activities' || key === 'logs' || key === 'settings')) {
    currentPage.value = key as PageKey
  }
}
</script>

<template>
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 48 48" role="img">
          <circle cx="24" cy="24" r="21" fill="#e9d8a5" />
          <path d="M24 3a21 21 0 0 1 0 42c-8 0-11-6-11-11s4-9 11-9c6 0 11-5 11-11S31 3 24 3Z" fill="#3d9d82" />
          <circle cx="24" cy="14" r="4" fill="#e9d8a5" />
          <circle cx="24" cy="34" r="4" fill="#3d9d82" />
        </svg>
      </div>
      <div class="brand-name">寻道助手</div>
    </div>

    <nav class="navigation" aria-label="主导航">
      <button
        v-for="item in navigation"
        :key="item.key"
        class="nav-item"
        :class="{
          'nav-item--active': currentPage === item.key,
          'nav-item--disabled': !item.enabled,
        }"
        :aria-current="currentPage === item.key ? 'page' : undefined"
        :title="item.enabled ? item.label : `${item.label}即将开放`"
        type="button"
        @click="selectItem(item.key, item.enabled)"
      >
        <component :is="item.icon" :size="22" :stroke-width="1.8" />
        <span>{{ item.label }}</span>
      </button>
    </nav>

    <div class="sidebar-art" aria-hidden="true">
      <img :src="companionImage" alt="" />
    </div>

    <div class="service-status">
      <span class="status-orb" aria-hidden="true"></span>
      <span>本地服务运行中</span>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  width: var(--sidebar-width);
  height: 100dvh;
  padding: 24px 14px 18px;
  color: var(--gold-soft);
  background:
    radial-gradient(circle at 50% 88%, rgb(61 132 108 / 22%), transparent 30%),
    repeating-linear-gradient(100deg, rgb(255 255 255 / 1.5%) 0 1px, transparent 1px 7px),
    linear-gradient(180deg, #153f39 0%, #0b2e2d 100%);
  border-right: 2px solid #b89b5c;
  box-shadow: 12px 0 32px rgb(33 61 51 / 18%);
  overflow: hidden;
}

.sidebar::before,
.sidebar::after {
  position: absolute;
  inset: 8px;
  z-index: -1;
  content: '';
  pointer-events: none;
  border: 1px solid rgb(218 189 120 / 48%);
  border-radius: 13px;
}

.sidebar::after {
  inset: auto 18px 114px;
  height: 1px;
  border: 0;
  background: linear-gradient(90deg, transparent, #cbb276, transparent);
}

.brand {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 5px 0 20px;
}

.brand-mark {
  width: 62px;
  height: 62px;
  padding: 6px;
  background: radial-gradient(circle, #5fb99b 0%, #164b42 58%, #d5b66e 61%, #775c2b 69%, transparent 70%);
  filter: drop-shadow(0 5px 9px rgb(0 0 0 / 35%));
}

.brand-mark svg {
  width: 100%;
  height: 100%;
}

.brand-name {
  color: #f0dfad;
  font-family: var(--font-display);
  font-size: 30px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-shadow: 0 2px 0 #2b2110, 0 4px 10px rgb(0 0 0 / 38%);
}

.navigation {
  display: grid;
  gap: 10px;
}

.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 56px;
  padding: 0 22px;
  color: #ead9a2;
  font-family: var(--font-ui);
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 0.05em;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  transition: transform 160ms ease, color 160ms ease, background 160ms ease;
}

.nav-item:not(.nav-item--disabled):hover {
  color: #fff3ca;
  transform: translateX(3px);
  background: rgb(90 164 140 / 14%);
}

.nav-item--active {
  color: #fff4ce;
  background:
    linear-gradient(90deg, rgb(76 188 155 / 86%), rgb(61 143 123 / 78%)),
    #3f937d;
  border-color: #ead8a1;
  box-shadow:
    inset 0 0 0 2px rgb(126 82 26 / 48%),
    inset 0 0 18px rgb(181 255 226 / 22%),
    0 5px 13px rgb(0 0 0 / 24%);
}

.nav-item--active::before,
.nav-item--active::after {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 24px;
  content: '';
  background: #d8bd77;
  border-radius: 50%;
  transform: translateY(-50%);
  clip-path: polygon(50% 0, 100% 35%, 72% 50%, 100% 65%, 50% 100%, 0 65%, 28% 50%, 0 35%);
}

.nav-item--active::before { left: -7px; }
.nav-item--active::after { right: -7px; }

.nav-item--disabled {
  opacity: 0.72;
  cursor: not-allowed;
}

.sidebar-art {
  position: relative;
  flex: 1;
  min-height: 150px;
  pointer-events: none;
}

.sidebar-art img {
  position: absolute;
  bottom: -10px;
  left: 50%;
  width: 230px;
  max-height: 310px;
  object-fit: contain;
  object-position: bottom;
  transform: translateX(-50%);
  filter: drop-shadow(0 9px 10px rgb(0 0 0 / 35%));
}

.service-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 58px;
  padding: 0 12px;
  color: #7cf1c7;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.04em;
  background: rgb(4 27 26 / 70%);
  border: 1px solid #b69958;
  border-radius: 9px;
  box-shadow: inset 0 0 0 2px rgb(218 189 120 / 18%);
}

.status-orb {
  width: 14px;
  height: 14px;
  background: #6fe3b6;
  border: 3px solid #174b41;
  border-radius: 50%;
  box-shadow: 0 0 0 2px #d8c27d, 0 0 12px rgb(76 231 179 / 68%);
}

@media (max-width: 980px) {
  .sidebar {
    position: relative;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    width: 100%;
    height: auto;
    min-height: 82px;
    padding: 10px 16px;
    border-right: 0;
    border-bottom: 2px solid #b89b5c;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0;
  }

  .brand-mark {
    width: 48px;
    height: 48px;
  }

  .brand-name {
    font-size: 22px;
  }

  .navigation {
    display: flex;
    justify-content: center;
    gap: 6px;
  }

  .nav-item {
    min-height: 46px;
    padding: 0 14px;
    font-size: 15px;
  }

  .nav-item--disabled,
  .sidebar-art {
    display: none;
  }

  .service-status {
    min-height: 44px;
  }
}

@media (max-width: 720px) {
  .sidebar {
    grid-template-columns: 1fr auto;
  }

  .brand-name,
  .service-status {
    display: none;
  }

  .navigation {
    justify-content: flex-end;
  }

  .nav-item span {
    display: none;
  }

  .nav-item {
    padding: 0 16px;
  }
}
</style>
