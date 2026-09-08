<script setup lang="ts">
import { X } from '@lucide/vue'

defineProps<{
  open: boolean
  labelledBy: string
  size?: 'default' | 'wide'
}>()

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <div v-if="open" class="drawer-layer" @keydown.esc="emit('close')">
    <button class="drawer-backdrop" type="button" aria-label="关闭抽屉" @click="emit('close')"></button>
    <aside class="drawer" :class="{ 'drawer--wide': size === 'wide' }" role="dialog" aria-modal="true" :aria-labelledby="labelledBy">
      <div class="drawer-rail drawer-rail--top"></div>
      <button class="drawer-close" type="button" aria-label="关闭" @click="emit('close')">
        <X :size="26" :stroke-width="1.8" />
      </button>
      <div class="drawer-body">
        <slot></slot>
      </div>
      <div class="drawer-rail drawer-rail--bottom"></div>
    </aside>
  </div>
</template>

<style scoped>
.drawer-layer {
  position: fixed;
  inset: 0;
  z-index: 100;
}

.drawer-backdrop {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  background: rgb(14 25 22 / 58%);
  border: 0;
  backdrop-filter: blur(1.5px);
  cursor: default;
  animation: fade-in 160ms ease both;
}

.drawer {
  position: absolute;
  top: 12px;
  right: 12px;
  bottom: 12px;
  width: min(520px, calc(100vw - 24px));
  color: var(--text-strong);
  background:
    linear-gradient(rgb(251 246 230 / 94%), rgb(247 239 218 / 96%)),
    radial-gradient(circle at 20% 10%, #fffdf5, transparent 28%);
  border: 1px solid #bda66a;
  border-radius: 10px;
  box-shadow:
    inset 0 0 0 4px rgb(255 254 244 / 48%),
    inset 0 0 0 5px rgb(151 120 57 / 18%),
    -15px 0 40px rgb(12 26 22 / 35%);
  animation: slide-in 220ms cubic-bezier(.2,.78,.22,1) both;
}

.drawer::before {
  position: absolute;
  inset: 10px;
  z-index: 0;
  content: '';
  pointer-events: none;
  border: 1px solid rgb(173 139 69 / 28%);
  border-radius: 6px;
}

.drawer--wide {
  width: min(940px, calc(100vw - 24px));
}

.drawer-body {
  position: relative;
  z-index: 1;
  height: 100%;
  padding: 54px 34px 28px;
  overflow: auto;
}

.drawer-close {
  position: absolute;
  top: 34px;
  right: 32px;
  z-index: 3;
  display: grid;
  width: 38px;
  height: 38px;
  color: #5e4930;
  background: transparent;
  border: 0;
  border-radius: 50%;
  place-items: center;
  cursor: pointer;
}

.drawer-close:hover {
  background: rgb(126 92 38 / 10%);
}

.drawer-rail {
  position: absolute;
  right: -7px;
  left: -7px;
  z-index: 2;
  height: 16px;
  background: linear-gradient(180deg, #7ec0a9 0%, #2f7d6d 42%, #174b43 48%, #ba9d5e 53%, #e8d899 72%, #8a6d35 100%);
  border: 1px solid #7a5c28;
  border-radius: 999px;
  box-shadow: 0 3px 6px rgb(0 0 0 / 22%);
}

.drawer-rail::before,
.drawer-rail::after {
  position: absolute;
  top: 50%;
  width: 25px;
  height: 25px;
  content: '';
  background: radial-gradient(circle, #e2cb86 0 18%, #84652c 22% 40%, #d4b86f 44% 60%, #5e461d 64% 100%);
  border-radius: 50%;
  transform: translateY(-50%);
}

.drawer-rail::before { left: -8px; }
.drawer-rail::after { right: -8px; }
.drawer-rail--top { top: -2px; }
.drawer-rail--bottom { bottom: -2px; }

@keyframes fade-in {
  from { opacity: 0; }
}

@keyframes slide-in {
  from { opacity: 0; transform: translateX(36px); }
}

@media (max-width: 620px) {
  .drawer {
    inset: 0;
    width: 100%;
    border-radius: 0;
  }

  .drawer-body {
    padding: 42px 20px 22px;
  }

  .drawer-close {
    top: 24px;
    right: 20px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .drawer,
  .drawer-backdrop {
    animation: none;
  }
}
</style>
