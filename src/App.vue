<template>
  <div id="app">
    <div v-if="loading" class="loading-screen">
      <div class="loading-spinner"></div>
      <p>正在加载应用...</p>
    </div>
    <router-view v-else />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { createLogger } from './utils/logger';
const log = createLogger('App');

// 💡 预留提示：如果你之后需要让前端调用 Python 的加解密引擎，
// 就可以在这里或者其他组件里引入下面这行 Tauri 的原生 API。
// import { invoke } from "@tauri-apps/api/core";

const loading = ref(true);

onMounted(async () => {
  try {
    // 简单的延迟，确保所有组件都加载完成
    await new Promise(resolve => setTimeout(resolve, 500));
    loading.value = false;
  } catch (error) {
    log.error('应用初始化失败:', error);
    loading.value = false;
  }
});
</script>

<style>
:root {
  font-family: var(--whisper-font-family);
  font-size: var(--whisper-fs-body-md);
  line-height: var(--whisper-lh-body-md);
  color: var(--whisper-on-surface);
  background-color: var(--whisper-bg);
  color-scheme: dark;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  overflow: hidden;
  background: transparent;
}

html {
  background: transparent;
  border-radius: 12px;
}

#app {
  height: 100vh;
  overflow: hidden;
  border-radius: 12px;
  background: var(--whisper-bg);
}

.loading-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: var(--whisper-bg);
  color: var(--whisper-on-surface-variant);
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--whisper-outline-variant);
  border-radius: 50%;
  border-top-color: var(--whisper-primary);
  animation: spin 0.8s linear infinite;
  margin-bottom: var(--whisper-md);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Custom scrollbar */
::-webkit-scrollbar {
  width: var(--whisper-scrollbar-width);
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--whisper-scrollbar-thumb);
  border-radius: var(--whisper-radius-full);
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(115, 120, 116, 0.5);
}

/* Material Symbols config */
.material-symbols-outlined {
  font-variation-settings:
    'FILL' 0,
    'wght' 300,
    'GRAD' 0,
    'opsz' 24;
  user-select: none;
}

.material-symbols-outlined.filled {
  font-variation-settings:
    'FILL' 1,
    'wght' 300,
    'GRAD' 0,
    'opsz' 24;
}
</style>