<template>
  <div v-if="visible" class="modal-overlay" @click.self="handleClose">
    <div class="modal-container">
      <div class="modal-header">
        <h3>添加联系人</h3>
        <button class="close-btn" @click="handleClose">✕</button>
      </div>
      <div class="modal-body">
        <div class="input-group">
          <input
            v-model="searchQuery"
            type="text"
            class="whisper-input"
            placeholder="输入用户名或ID搜索"
            @keyup.enter="handleSearch"
          />
        </div>
        <div v-if="loading" class="loading-spinner">
          <div class="spinner"></div>
          <span>搜索中...</span>
        </div>
        <div v-if="searchResult && !loading" class="search-result">
          <div class="user-card">
            <div class="avatar">{{ searchResult.username.charAt(0).toUpperCase() }}</div>
            <div class="user-info">
              <div class="username">{{ searchResult.username }}</div>
              <div class="user-id">ID: {{ searchResult.userId }}</div>
            </div>
            <button
              class="send-btn"
              :disabled="sending"
              @click="handleSendRequest"
            >
              {{ sending ? '发送中...' : '发送请求' }}
            </button>
          </div>
        </div>
        <div v-if="error && !loading" class="error-message">
          {{ error }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { hybridApi } from '../api/hybrid-api'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'request-sent', userId: number): void
}>()

const searchQuery = ref('')
const searchResult = ref<{ username: string; userId: number } | null>(null)
const loading = ref(false)
const sending = ref(false)
const error = ref('')

async function handleSearch() {
  if (!searchQuery.value.trim()) return
  loading.value = true
  error.value = ''
  searchResult.value = null
  try {
    const result = await hybridApi.searchUser(searchQuery.value.trim())
    searchResult.value = result
  } catch (err: any) {
    error.value = err.message || '搜索失败'
  } finally {
    loading.value = false
  }
}

async function handleSendRequest() {
  if (!searchResult.value) return
  sending.value = true
  error.value = ''
  try {
    await hybridApi.sendFriendRequest(searchResult.value.userId)
    emit('request-sent', searchResult.value.userId)
    handleClose()
  } catch (err: any) {
    error.value = err.message || '发送请求失败'
  } finally {
    sending.value = false
  }
}

function handleClose() {
  searchQuery.value = ''
  searchResult.value = null
  error.value = ''
  loading.value = false
  sending.value = false
  emit('close')
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(14, 14, 14, 0.8);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-container {
  background: var(--whisper-surface-container-high);
  border-radius: var(--whisper-radius-xl);
  width: 420px;
  max-width: 90vw;
  border: 1px solid var(--whisper-outline-variant);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--whisper-lg);
  border-bottom: 1px solid var(--whisper-outline-variant);
}

.modal-header h3 {
  margin: 0;
  font-size: var(--whisper-fs-headline-sm);
  color: var(--whisper-on-surface);
  font-weight: 500;
}

.close-btn {
  background: none;
  border: none;
  color: var(--whisper-on-surface-variant);
  font-size: 18px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--whisper-radius-full);
  transition: background 0.2s, color 0.2s;
}

.close-btn:hover {
  background: var(--whisper-surface-container-highest);
  color: var(--whisper-on-surface);
}

.modal-body {
  padding: var(--whisper-lg);
}

.whisper-input {
  width: 100%;
  background: transparent;
  border: none;
  border-bottom: 2px solid var(--whisper-outline-variant);
  padding: var(--whisper-sm) 0;
  font-size: var(--whisper-fs-body-lg);
  color: var(--whisper-on-surface);
  outline: none;
  transition: border-color 0.3s;
  font-family: inherit;
}

.whisper-input::placeholder {
  color: var(--whisper-on-surface-variant);
  opacity: 0.6;
}

.whisper-input:focus {
  border-bottom-color: var(--whisper-primary);
}

.loading-spinner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--whisper-sm);
  padding: var(--whisper-lg);
  color: var(--whisper-on-surface-variant);
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--whisper-outline);
  border-top-color: var(--whisper-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.search-result {
  margin-top: var(--whisper-md);
}

.user-card {
  display: flex;
  align-items: center;
  gap: var(--whisper-md);
  padding: var(--whisper-md);
  background: var(--whisper-surface-container);
  border-radius: var(--whisper-radius-lg);
  border: 1px solid var(--whisper-outline-variant);
}

.avatar {
  width: 42px;
  height: 42px;
  border-radius: var(--whisper-radius-full);
  background: var(--whisper-primary-fixed);
  color: var(--whisper-on-primary-fixed);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--whisper-fs-title-md);
  font-weight: 500;
  flex-shrink: 0;
}

.user-info {
  flex: 1;
  min-width: 0;
}

.username {
  font-size: var(--whisper-fs-body-lg);
  color: var(--whisper-on-surface);
  font-weight: 500;
}

.user-id {
  font-size: var(--whisper-fs-body-sm);
  color: var(--whisper-on-surface-variant);
  margin-top: 2px;
}

.send-btn {
  background: var(--whisper-primary);
  color: var(--whisper-on-primary);
  border: none;
  padding: 8px 20px;
  border-radius: var(--whisper-radius-full);
  font-size: var(--whisper-fs-label-lg);
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.2s;
  font-family: inherit;
  flex-shrink: 0;
}

.send-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error-message {
  margin-top: var(--whisper-md);
  padding: var(--whisper-sm) var(--whisper-md);
  background: var(--whisper-error-container);
  color: var(--whisper-on-error-container);
  border-radius: var(--whisper-radius-default);
  font-size: var(--whisper-fs-body-sm);
}
</style>
