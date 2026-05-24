<script setup lang="ts">
import { minimizeWindow, toggleMaximize, closeWindow } from '../utils/window-manager'

defineProps<{
  variant?: 'login' | 'chat'
}>()
</script>

<template>
  <div class="titlebar" :class="{ 'titlebar--login': variant === 'login' }">
    <div class="titlebar-drag">
      <span class="titlebar-title">Whisper</span>
    </div>
    <div class="titlebar-controls">
      <button class="titlebar-btn" @click="minimizeWindow()" title="最小化">
        <span class="material-symbols-outlined">minimize</span>
      </button>
      <button v-if="variant !== 'login'" class="titlebar-btn" @click="toggleMaximize()" title="最大化">
        <span class="material-symbols-outlined">crop_square</span>
      </button>
      <button class="titlebar-btn titlebar-btn--close" @click="closeWindow()" title="关闭">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.titlebar {
  height: var(--whisper-titlebar-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--whisper-bg);
  flex-shrink: 0;
}

.titlebar--login {
  background: transparent;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
}

.titlebar-drag {
  flex: 1;
  height: 100%;
  display: flex;
  align-items: center;
  padding-left: var(--whisper-md);
  -webkit-app-region: drag;
}

.titlebar-title {
  font-size: var(--whisper-fs-label-md);
  font-weight: 500;
  color: var(--whisper-on-surface-variant);
  letter-spacing: var(--whisper-ls-label-md);
}

.titlebar-controls {
  display: flex;
  height: 100%;
  -webkit-app-region: no-drag;
}

.titlebar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 100%;
  border: none;
  background: transparent;
  color: var(--whisper-on-surface-variant);
  cursor: pointer;
  transition: background 0.15s;
}

.titlebar-btn:hover {
  background: var(--whisper-surface-container-high);
}

.titlebar-btn--close:hover {
  background: var(--whisper-error);
  color: var(--whisper-on-error);
}

.titlebar-btn .material-symbols-outlined {
  font-size: 18px;
}
</style>
