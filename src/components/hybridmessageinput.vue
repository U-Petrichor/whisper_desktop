<template>
  <div class="message-input-area">
    <div class="input-card" :class="{ 'focused': isFocused, 'stego-mode': imageHideMode }">
      <!-- Stego hint -->
      <div v-if="imageHideMode" class="mode-hint">
        <span class="material-symbols-outlined">image</span>
        图像隐藏模式：发送时将选择图片
      </div>

      <!-- Burn-after indicator -->
      <div v-if="burnMode" class="mode-hint burn-hint">
        <span class="material-symbols-outlined">local_fire_department</span>
        阅后即焚 {{ retentionTime }}{{ retentionUnit === 'seconds' ? '秒' : retentionUnit === 'minutes' ? '分钟' : '小时' }}
        <div class="retention-row">
          <input type="number" v-model.number="retentionTime" min="1" max="3600" class="retention-input" />
          <select v-model="retentionUnit" class="retention-select">
            <option value="seconds">秒</option>
            <option value="minutes">分钟</option>
            <option value="hours">小时</option>
          </select>
        </div>
      </div>

      <textarea
        ref="messageInput"
        v-model="message"
        @keydown="handleKeyDown"
        @input="adjustHeight"
        @focus="isFocused = true"
        @blur="isFocused = false"
        :placeholder="getPlaceholder()"
        rows="2"
        class="message-textarea"
        :disabled="sendStatus.sending"
      />

      <div class="toolbar">
        <div class="toolbar-left">
          <button class="toolbar-btn" @click="showEmoji = !showEmoji" title="表情">
            <span class="material-symbols-outlined">sentiment_satisfied</span>
          </button>
          <button class="toolbar-btn" @click="selectFile" :disabled="sendStatus.sending" title="发送文件">
            <span class="material-symbols-outlined">attach_file</span>
          </button>
          <button class="toolbar-btn" @click="selectImage" :disabled="sendStatus.sending" title="发送图片">
            <span class="material-symbols-outlined">image</span>
          </button>
          <button class="toolbar-btn" :class="{ active: imageHideMode }" @click="toggleImageHideMode" title="图像隐藏">
            <span class="material-symbols-outlined">hide_image</span>
          </button>
          <button class="toolbar-btn" :class="{ active: burnMode }" @click="toggleBurnMode" title="阅后即焚">
            <span class="material-symbols-outlined">local_fire_department</span>
          </button>
        </div>

        <button
          class="send-btn"
          :disabled="!canSend"
          @click="onSend"
          :title="getSendButtonTitle()"
        >
          <span v-if="!sendStatus.sending" class="material-symbols-outlined">send</span>
          <div v-else class="spinner-small"></div>
        </button>
      </div>
    </div>

    <!-- Emoji quick actions -->
    <div v-if="showEmoji" class="emoji-bar">
      <button @click="insertQuickText('👍')" class="emoji-btn">👍</button>
      <button @click="insertQuickText('😄')" class="emoji-btn">😄</button>
      <button @click="insertQuickText('❤️')" class="emoji-btn">❤️</button>
      <button @click="insertQuickText('👌')" class="emoji-btn">👌</button>
      <button @click="insertQuickText('🎉')" class="emoji-btn">🎉</button>
      <button @click="insertQuickText('好的')" class="emoji-btn text-emoji">好的</button>
      <button @click="insertQuickText('收到')" class="emoji-btn text-emoji">收到</button>
    </div>

    <!-- Hidden file inputs -->
    <input ref="fileInput" type="file" accept="image/*" @change="handleImageSelect" style="display: none;" />
    <input ref="genericFileInput" type="file" @change="handleFileSelect" style="display: none;" />
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { createLogger } from '../utils/logger'
const log = createLogger('HybridMessageInput')

const props = defineProps({
  contact: { type: Object, required: true },
  connectionStatus: { type: Object, required: true }
})

const emit = defineEmits(['send'])

const messageInput = ref(null)
const fileInput = ref(null)
const genericFileInput = ref(null)
const message = ref('')
const isFocused = ref(false)
const showEmoji = ref(false)

const imageHideMode = ref(false)
const burnMode = ref(false)
const retentionTime = ref(30)
const retentionUnit = ref('seconds')

const sendStatus = ref({ sending: false, lastMethod: null, error: null })

const burnAfterSeconds = computed(() => {
  switch (retentionUnit.value) {
    case 'minutes': return retentionTime.value * 60
    case 'hours': return retentionTime.value * 3600
    default: return retentionTime.value
  }
})

const canSend = computed(() => {
  return message.value.trim().length > 0 && !sendStatus.value.sending && message.value.length <= 2000
})

function getPlaceholder() {
  if (imageHideMode.value) return '输入要隐藏的文本内容...'
  return '输入消息...'
}

function getSendButtonTitle() {
  return imageHideMode.value ? '选择图片并隐藏文本' : '发送消息'
}

function toggleImageHideMode() {
  imageHideMode.value = !imageHideMode.value
  if (imageHideMode.value && burnMode.value) burnMode.value = false
}

function toggleBurnMode() {
  burnMode.value = !burnMode.value
  if (burnMode.value && imageHideMode.value) imageHideMode.value = false
}

function onSend() {
  if (imageHideMode.value && message.value.trim()) {
    fileInput.value?.click()
  } else {
    sendMessage()
  }
}

async function sendMessage() {
  if (!canSend.value) return

  sendStatus.value.sending = true
  sendStatus.value.error = null

  try {
    const messageData = {
      content: message.value.trim(),
      type: 'text',
      timestamp: Date.now()
    }

    if (burnMode.value) {
      messageData.burnAfter = burnAfterSeconds.value
    }

    const result = await new Promise((resolve) => {
      emit('send', messageData, resolve)
    })

    if (!result.success) throw new Error(result.error || '发送失败')

    resetInput()
    sendStatus.value.lastMethod = props.connectionStatus.preferredMethod
    nextTick(() => messageInput.value?.focus())
  } catch (error) {
    sendStatus.value.error = error.message || '发送失败'
    log.error('发送消息失败:', error)
  } finally {
    sendStatus.value.sending = false
  }
}

async function handleSteganographyUpload(file) {
  sendStatus.value.sending = true
  sendStatus.value.error = null

  try {
    const formData = new FormData()
    formData.append('image', file)
    formData.append('secret_message', message.value.trim())
    formData.append('password', 'default_password')

    const API_BASE_URL = '/api'
    const response = await fetch(`${API_BASE_URL}/steganography/embed`, {
      method: 'POST',
      body: formData
    })

    if (!response.ok) throw new Error('隐写术处理失败')

    const blob = await response.blob()
    const steganographyFile = new File([blob], `stego_${file.name}`, { type: blob.type || 'image/png' })

    const uploadFormData = new FormData()
    uploadFormData.append('file', steganographyFile)
    uploadFormData.append('to_id', props.contact.id)
    uploadFormData.append('hidding_message', 'true')

    const messageData = {
      type: 'image',
      file: uploadFormData,
      fileName: steganographyFile.name,
      hiddenMessage: true,
      originalText: message.value.trim(),
      timestamp: Date.now()
    }

    if (burnMode.value) messageData.burnAfter = burnAfterSeconds.value

    const result = await new Promise((resolve) => {
      emit('send', messageData, resolve)
    })

    if (!result.success) throw new Error(result.error || '发送失败')

    resetInput()
    imageHideMode.value = false
    if (fileInput.value) fileInput.value.value = ''
    nextTick(() => messageInput.value?.focus())
  } catch (error) {
    sendStatus.value.error = error.message || '隐写术发送失败'
    log.error('隐写术发送失败:', error)
  } finally {
    sendStatus.value.sending = false
  }
}

function handleKeyDown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    sendMessage()
  }
}

function adjustHeight() {
  const textarea = messageInput.value
  if (textarea) {
    textarea.style.height = 'auto'
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px'
  }
}

function resetInput() {
  message.value = ''
  adjustHeight()
  showEmoji.value = false
}

function insertQuickText(text) {
  message.value += text
  nextTick(() => {
    adjustHeight()
    messageInput.value?.focus()
  })
}

function selectImage() {
  fileInput.value?.click()
}

function selectFile() {
  genericFileInput.value?.click()
}

async function handleImageSelect(event) {
  const file = event.target.files[0]
  if (!file) return

  if (!file.type.startsWith('image/')) { alert('请选择图片文件'); return }
  if (file.size > 5 * 1024 * 1024) { alert('图片大小不能超过5MB'); return }

  if (imageHideMode.value && message.value.trim()) {
    await handleSteganographyUpload(file)
    return
  }

  sendStatus.value.sending = true
  try {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('to_id', props.contact.id)
    formData.append('message_type', 'image')

    const result = await new Promise((resolve) => {
      emit('send', { type: 'image', file: formData, fileName: file.name }, resolve)
    })
    if (!result.success) throw new Error(result.error || '发送失败')
    event.target.value = ''
  } catch (error) {
    log.error('发送图片失败:', error)
  } finally {
    sendStatus.value.sending = false
  }
}

async function handleFileSelect(event) {
  const file = event.target.files[0]
  if (!file) return

  if (file.size > 20 * 1024 * 1024) { alert('文件大小不能超过20MB'); return }

  const forbidden = ['.exe', '.bat', '.cmd', '.sh', '.php', '.asp', '.aspx', '.js', '.vbs', '.ps1']
  const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'))
  if (forbidden.includes(ext)) { alert('不允许上传可执行文件或脚本文件'); return }

  sendStatus.value.sending = true
  try {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('to_id', props.contact.id)
    formData.append('message_type', 'file')

    const result = await new Promise((resolve) => {
      emit('send', { type: 'file', file: formData, fileName: file.name, fileSize: file.size, fileType: file.type, messageType: 'file' }, resolve)
    })
    if (!result.success) throw new Error(result.error || '发送失败')
    event.target.value = ''
  } catch (error) {
    log.error('发送文件失败:', error)
  } finally {
    sendStatus.value.sending = false
  }
}

defineExpose({
  focus: () => messageInput.value?.focus(),
  clear: () => { message.value = ''; adjustHeight() }
})
</script>

<style scoped>
.message-input-area {
  padding: var(--whisper-md);
  flex-shrink: 0;
  background: var(--whisper-surface-bright);
}

.input-card {
  background: var(--whisper-surface-container-lowest);
  border-radius: var(--whisper-radius-xl);
  border: 1px solid rgba(66, 72, 72, 0.3);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  transition: all 0.15s;
}

.input-card.focused {
  border-color: var(--whisper-primary);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04), 0 0 0 1px var(--whisper-primary);
}

.input-card.stego-mode {
  border-color: var(--whisper-tertiary);
}

.mode-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--whisper-fs-label-md);
  color: var(--whisper-primary);
  padding: 8px 16px 0;
}

.mode-hint .material-symbols-outlined {
  font-size: 16px;
}

.mode-hint.burn-hint {
  color: var(--whisper-tertiary);
  flex-wrap: wrap;
}

.mode-hint.burn-hint .retention-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.retention-input {
  width: 48px;
  padding: 2px 4px;
  border: 1px solid var(--whisper-outline-variant);
  border-radius: var(--whisper-radius-sm);
  background: var(--whisper-surface-container);
  color: var(--whisper-on-surface);
  font-size: var(--whisper-fs-label-md);
  text-align: center;
}

.retention-select {
  padding: 2px 4px;
  border: 1px solid var(--whisper-outline-variant);
  border-radius: var(--whisper-radius-sm);
  background: var(--whisper-surface-container);
  color: var(--whisper-on-surface);
  font-size: var(--whisper-fs-label-md);
}

.message-textarea {
  width: 100%;
  background: transparent;
  border: none;
  font-size: var(--whisper-fs-body-lg);
  line-height: var(--whisper-lh-body-lg);
  color: var(--whisper-on-surface);
  resize: none;
  outline: none;
  padding: 16px 16px 8px;
  font-family: var(--whisper-font-family);
  min-height: 48px;
  max-height: 120px;
}

.message-textarea::placeholder {
  color: var(--whisper-on-surface-variant);
  opacity: 0.5;
}

.message-textarea:disabled {
  color: var(--whisper-on-surface-variant);
}

.message-textarea:-webkit-autofill {
  -webkit-box-shadow: 0 0 0 1000px var(--whisper-surface-container-lowest) inset;
  -webkit-text-fill-color: var(--whisper-on-surface);
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 8px 8px;
}

.toolbar-left {
  display: flex;
  gap: 4px;
  color: var(--whisper-on-surface-variant);
}

.toolbar-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--whisper-radius-full);
  border: none;
  background: transparent;
  color: var(--whisper-on-surface-variant);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}

.toolbar-btn:hover:not(:disabled) {
  background: var(--whisper-surface-variant);
}

.toolbar-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.toolbar-btn.active {
  color: var(--whisper-primary);
  background: rgba(186, 202, 201, 0.12);
}

.toolbar-btn .material-symbols-outlined {
  font-size: 20px;
}

.send-btn {
  width: 40px;
  height: 40px;
  border-radius: var(--whisper-radius-full);
  border: none;
  background: var(--whisper-send-button);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, opacity 0.15s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  margin-right: 4px;
}

.send-btn .material-symbols-outlined {
  font-size: 20px;
  margin-left: 2px;
}

.send-btn:hover:not(:disabled) {
  background: var(--whisper-primary);
}

.send-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.spinner-small {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top: 2px solid white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Emoji bar */
.emoji-bar {
  display: flex;
  gap: 4px;
  padding: 8px 12px;
  flex-wrap: wrap;
}

.emoji-btn {
  padding: 6px 10px;
  border: none;
  border-radius: var(--whisper-radius-full);
  background: var(--whisper-surface-container);
  cursor: pointer;
  font-size: 18px;
  transition: background 0.15s;
}

.emoji-btn:hover {
  background: var(--whisper-surface-container-high);
}

.emoji-btn.text-emoji {
  font-size: var(--whisper-fs-label-md);
  color: var(--whisper-on-surface-variant);
}
</style>