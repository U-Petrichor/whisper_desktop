<template>
  <div v-if="visible" class="modal-overlay" @click.self="handleClose">
    <div class="modal-container">
      <div class="modal-header">
        <h3>好友请求</h3>
        <button class="close-btn" @click="handleClose">✕</button>
      </div>
      <div class="modal-body">
        <div v-if="loading" class="loading-spinner">
          <div class="spinner"></div>
          <span>加载中...</span>
        </div>
        <div v-else-if="requests.length === 0" class="empty-state">
          暂无好友请求
        </div>
        <div v-else class="request-list">
          <div v-for="request in requests" :key="request.id" class="request-card">
            <div class="avatar">{{ request.username.charAt(0).toUpperCase() }}</div>
            <div class="user-info">
              <div class="username">{{ request.username }}</div>
              <div class="user-id">ID: {{ request.userId }}</div>
            </div>
            <div class="actions">
              <button
                class="accept-btn"
                :disabled="processing[request.id]"
                @click="handleAccept(request)"
              >
                {{ processing[request.id] === 'accept' ? '...' : '接受' }}
              </button>
              <button
                class="reject-btn"
                :disabled="processing[request.id]"
                @click="handleReject(request)"
              >
                {{ processing[request.id] === 'reject' ? '...' : '拒绝' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { hybridApi } from '../api/hybrid-api'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'request-handled'): void
}>()

const requests = ref<{ id: number; username: string; userId: number }[]>([])
const loading = ref(false)
const processing = ref<Record<number, string>>({})

watch(() => props.visible, async (val) => {
  if (val) {
    await fetchRequests()
  }
})

async function fetchRequests() {
  loading.value = true
  try {
    requests.value = await hybridApi.getFriendRequests()
  } catch (err) {
    console.error('Failed to fetch friend requests:', err)
  } finally {
    loading.value = false
  }
}

async function handleAccept(request: { id: number; username: string; userId: number }) {
  processing.value[request.id] = 'accept'
  try {
    await hybridApi.acceptFriendRequest(request.userId)
    requests.value = requests.value.filter(r => r.id !== request.id)
    emit('request-handled')
  } catch (err) {
    console.error('Failed to accept friend request:', err)
  } finally {
    delete processing.value[request.id]
    processing.value = { ...processing.value }
  }
}

async function handleReject(request: { id: number; username: string; userId: number }) {
  processing.value[request.id] = 'reject'
  try {
    await hybridApi.rejectFriendRequest(request.userId)
    requests.value = requests.value.filter(r => r.id !== request.id)
  } catch (err) {
    console.error('Failed to reject friend request:', err)
  } finally {
    delete processing.value[request.id]
    processing.value = { ...processing.value }
  }
}

function handleClose() {
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
  width: 460px;
  max-width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--whisper-outline-variant);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--whisper-lg);
  border-bottom: 1px solid var(--whisper-outline-variant);
  flex-shrink: 0;
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
  overflow-y: auto;
  flex: 1;
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

.empty-state {
  text-align: center;
  padding: var(--whisper-lg);
  color: var(--whisper-on-surface-variant);
  font-size: var(--whisper-fs-body-md);
}

.request-list {
  display: flex;
  flex-direction: column;
  gap: var(--whisper-sm);
}

.request-card {
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

.actions {
  display: flex;
  gap: var(--whisper-sm);
  flex-shrink: 0;
}

.accept-btn {
  background: var(--whisper-primary);
  color: var(--whisper-on-primary);
  border: none;
  padding: 6px 16px;
  border-radius: var(--whisper-radius-full);
  font-size: var(--whisper-fs-label-lg);
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.2s;
  font-family: inherit;
}

.accept-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.reject-btn {
  background: transparent;
  color: var(--whisper-error);
  border: 1px solid var(--whisper-error);
  padding: 6px 16px;
  border-radius: var(--whisper-radius-full);
  font-size: var(--whisper-fs-label-lg);
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.2s;
  font-family: inherit;
}

.reject-btn:hover:not(:disabled) {
  opacity: 0.8;
}

.accept-btn:disabled,
.reject-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
