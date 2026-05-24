<script setup lang="ts">
import { ref } from 'vue'

type NavTab = 'messages' | 'contacts' | 'settings'

const props = defineProps<{
  modelValue: NavTab
}>()

const emit = defineEmits<{
  'update:modelValue': [tab: NavTab]
  'show-profile': []
}>()

const tabs: { key: NavTab; icon: string; filledIcon: string; label: string }[] = [
  { key: 'messages', icon: 'chat_bubble', filledIcon: 'chat_bubble', label: '消息' },
  { key: 'contacts', icon: 'person', filledIcon: 'person', label: '联系人' },
  { key: 'settings', icon: 'settings', filledIcon: 'settings', label: '设置' },
]
</script>

<template>
  <nav class="sidenav">
    <button class="sidenav-avatar" @click="emit('show-profile')" title="个人资料">
      <div class="avatar-placeholder">
        <span class="material-symbols-outlined filled">person</span>
      </div>
      <span class="online-dot"></span>
    </button>

    <div class="sidenav-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="sidenav-tab"
        :class="{ 'sidenav-tab--active': modelValue === tab.key }"
        @click="emit('update:modelValue', tab.key)"
        :title="tab.label"
      >
        <span
          class="material-symbols-outlined"
          :class="{ filled: modelValue === tab.key }"
        >{{ tab.icon }}</span>
      </button>
    </div>

    <div class="sidenav-bottom">
      <button
        class="sidenav-tab"
        :class="{ 'sidenav-tab--active': modelValue === 'settings' }"
        @click="emit('update:modelValue', 'settings')"
        title="设置"
      >
        <span
          class="material-symbols-outlined"
          :class="{ filled: modelValue === 'settings' }"
        >settings</span>
      </button>
    </div>
  </nav>
</template>

<style scoped>
.sidenav {
  width: var(--whisper-sidenav-width);
  background: var(--whisper-surface-container);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--whisper-sm) 0;
  border-right: 1px solid var(--whisper-outline-variant);
  flex-shrink: 0;
}

.sidenav-avatar {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: var(--whisper-radius-full);
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0;
  margin-bottom: var(--whisper-lg);
}

.avatar-placeholder {
  width: 100%;
  height: 100%;
  border-radius: var(--whisper-radius-full);
  background: var(--whisper-primary-fixed);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--whisper-on-primary-fixed);
}

.avatar-placeholder .material-symbols-outlined {
  font-size: 20px;
}

.online-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #4caf50;
  border: 2px solid var(--whisper-surface-container);
}

.sidenav-tabs {
  display: flex;
  flex-direction: column;
  gap: var(--whisper-xs);
}

.sidenav-tab {
  width: 48px;
  height: 48px;
  border-radius: var(--whisper-radius-md);
  border: none;
  background: transparent;
  color: var(--whisper-on-surface-variant);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.sidenav-tab:hover {
  background: var(--whisper-surface-container-high);
}

.sidenav-tab--active {
  background: var(--whisper-secondary-container);
  color: var(--whisper-on-secondary-container);
  transform: scale(0.95);
}

.sidenav-tab .material-symbols-outlined {
  font-size: 24px;
}

.sidenav-bottom {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: var(--whisper-xs);
}
</style>
