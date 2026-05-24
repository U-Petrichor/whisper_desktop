<template>
  <div class="login-transition">
    <div class="whisper-container">
      <h1 class="whisper-text" :class="{ 'show': showText, 'hide': fadeOut }">
        Whisper
      </h1>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { transitionToChatWindow } from '../utils/window-manager'
import { createLogger } from '../utils/logger'
const log = createLogger('LoginTransition')

const router = useRouter()
const showText = ref(false)
const fadeOut = ref(false)

onMounted(() => {

  // 延迟显示文字
  setTimeout(() => {
    showText.value = true
  }, 500)

  // 2秒时触发窗口变换
  setTimeout(async () => {
    try {
      await transitionToChatWindow()
    } catch (e) {
      log.error('窗口变换失败:', e)
    }
  }, 2000)

  // 3秒后开始淡出
  setTimeout(() => {
    fadeOut.value = true
  }, 3500)

  // 4.5秒后跳转到聊天页面
  setTimeout(() => {
    router.push('/chat')
  }, 4500)
})
</script>

<style scoped>
.login-transition {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: var(--whisper-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.whisper-container {
  text-align: center;
}

.whisper-text {
  font-family: 'DM Sans', sans-serif;
  font-size: 6rem;
  font-weight: 500;
  letter-spacing: -0.02em;
  color: var(--whisper-primary);
  opacity: 0;
  transform: scale(0.3) translateY(100px) rotate(-10deg);
  transition: all 2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.whisper-text.show {
  opacity: 1;
  transform: scale(1) translateY(0) rotate(0deg);
}

.whisper-text.hide {
  opacity: 0;
  transform: scale(1.3) translateY(-50px) rotate(5deg);
  transition: all 1.5s ease-in;
}

@media (max-width: 768px) {
  .whisper-text {
    font-size: 4rem;
  }
}

@media (max-width: 480px) {
  .whisper-text {
    font-size: 3rem;
  }
}
</style>