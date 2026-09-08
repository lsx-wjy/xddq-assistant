<script setup lang="ts">
const model = defineModel<boolean>({ required: true })

defineProps<{
  label: string
  disabled?: boolean
}>()
</script>

<template>
  <button
    class="toggle"
    :class="{ 'toggle--active': model, 'toggle--disabled': disabled }"
    type="button"
    role="switch"
    :aria-checked="model"
    :aria-label="label"
    :disabled="disabled"
    @click="model = !model"
  >
    <span class="toggle-thumb"></span>
  </button>
</template>

<style scoped>
.toggle {
  position: relative;
  flex: 0 0 auto;
  width: 48px;
  height: 27px;
  padding: 3px;
  background: #c8c3b7;
  border: 1px solid #aaa394;
  border-radius: 999px;
  box-shadow: inset 0 2px 4px rgb(54 47 34 / 18%);
  cursor: pointer;
  transition: background 160ms ease, border-color 160ms ease;
}

.toggle-thumb {
  display: block;
  width: 19px;
  height: 19px;
  background: #fffdf5;
  border: 1px solid rgb(93 77 44 / 18%);
  border-radius: 50%;
  box-shadow: 0 2px 5px rgb(25 43 35 / 25%);
  transition: transform 180ms ease;
}

.toggle--active {
  background: linear-gradient(180deg, #4fac8f, #207b68);
  border-color: #296e60;
}

.toggle--active .toggle-thumb {
  transform: translateX(20px);
}

.toggle:focus-visible {
  outline: 3px solid rgb(45 146 119 / 28%);
  outline-offset: 3px;
}

.toggle--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
