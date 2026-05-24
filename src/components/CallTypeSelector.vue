<template>
  <div v-if="show" class="modal-overlay" @click.self="handleOverlayClick">
    <div class="modal-container">
      <div class="modal-header">
        <h3>选择通话类型</h3>
        <button class="close-btn" @click="close">✕</button>
      </div>
      <div class="options">
        <button class="option-card" @click="selectCallType('voice')">
          <span class="material-symbols-outlined option-icon">call</span>
          <div class="option-text">
            <div class="option-title">语音通话</div>
            <div class="option-desc">仅使用麦克风进行通话</div>
          </div>
        </button>
        <button class="option-card" @click="selectCallType('video')">
          <span class="material-symbols-outlined option-icon">videocam</span>
          <div class="option-text">
            <div class="option-title">视频通话</div>
            <div class="option-desc">使用摄像头和麦克风进行通话</div>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  show: { type: Boolean, default: false },
  contact: { type: Object, default: null }
})

const emit = defineEmits(['close', 'call-selected'])

function close() {
  emit('close')
}

function handleOverlayClick() {
  close()
}

function selectCallType(type) {
  emit('call-selected', { type, contact: props.contact })
  close()
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
  animation: slideIn 0.2s ease-out;
}

@keyframes slideIn {
  from { transform: translateY(-12px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
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

.options {
  display: flex;
  flex-direction: column;
  gap: var(--whisper-sm);
  padding: var(--whisper-lg);
}

.option-card {
  display: flex;
  align-items: center;
  gap: var(--whisper-md);
  padding: var(--whisper-md) var(--whisper-lg);
  background: var(--whisper-surface-container);
  border: 1px solid var(--whisper-outline-variant);
  border-radius: var(--whisper-radius-lg);
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
  font-family: inherit;
  color: var(--whisper-on-surface);
}

.option-card:hover {
  background: var(--whisper-surface-container-high);
  border-color: var(--whisper-primary);
}

.option-icon {
  font-size: 28px;
  color: var(--whisper-primary);
  flex-shrink: 0;
}

.option-title {
  font-size: var(--whisper-fs-body-lg);
  font-weight: 500;
  color: var(--whisper-on-surface);
  margin-bottom: 2px;
}

.option-desc {
  font-size: var(--whisper-fs-body-sm);
  color: var(--whisper-on-surface-variant);
}
</style>