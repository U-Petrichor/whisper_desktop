<template>
  <div class="login-transition">
    <div class="smoke-stage">
      <h1 class="whisper-text" :class="{ 'show': showText, 'disperse': fadeOut }">
        <span v-for="i in 7" :key="i" class="letter" :style="{ animationDelay: `${(7 - i) * 0.04}s` }">
          {{ 'Whisper'[i - 1] }}
        </span>
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
  // 0.5s: text entrance animation
  setTimeout(() => {
    showText.value = true
  }, 500)

  // 1.5s: start animated window resize
  setTimeout(async () => {
    try {
      await transitionToChatWindow()
    } catch (e) {
      log.error('窗口变换失败:', e)
    }
  }, 1500)

  // 2.5s: trigger smoke dispersal
  setTimeout(() => {
    fadeOut.value = true
  }, 2500)

  // 4.5s: navigate to chat
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

/* Contrast+blur trick: the full-screen background matches var(--whisper-bg),
   so contrast(20) on this container won't create a visible box —
   the blended edges merge seamlessly with the page background */
.smoke-stage {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  filter: contrast(20);
  background: var(--whisper-bg);
}

.whisper-text {
  display: flex;
  font-family: 'DM Sans', sans-serif;
  font-size: 6rem;
  font-weight: 500;
  letter-spacing: -0.02em;
  color: var(--whisper-primary);
  filter: blur(0.01px);
  opacity: 0;
  transform: scale(0.3) translateY(100px) rotate(-10deg);
  transition: all 1.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.whisper-text.show {
  opacity: 1;
  transform: scale(1) translateY(0) rotate(0deg);
}

.whisper-text.show.disperse {
  transition: none;
}

.letter {
  display: inline-block;
  filter: blur(0.01px);
  will-change: transform, opacity, filter;
}

/* Each letter drifts in a different direction when dispersing */
.letter:nth-child(1) { --dx: -80px; --dy: -60px; --s: 2.5; --r: -15deg; }
.letter:nth-child(2) { --dx: -40px; --dy: -90px; --s: 2;   --r: 10deg;  }
.letter:nth-child(3) { --dx: 10px;  --dy: -70px; --s: 2.8; --r: -8deg;  }
.letter:nth-child(4) { --dx: 50px;  --dy: -50px; --s: 2.2; --r: 12deg;  }
.letter:nth-child(5) { --dx: 30px;  --dy: -85px; --s: 2.6; --r: -6deg;  }
.letter:nth-child(6) { --dx: 70px;  --dy: -40px; --s: 2;   --r: 8deg;   }
.letter:nth-child(7) { --dx: 90px;  --dy: -65px; --s: 2.4; --r: -10deg; }

.whisper-text.disperse .letter {
  animation: smoke-disperse 2s ease-out forwards;
}

@keyframes smoke-disperse {
  0% {
    transform: translate(0, 0) scale(1) rotate(0deg);
    filter: blur(0.01px);
    opacity: 1;
  }
  30% {
    filter: blur(4px);
    opacity: 0.7;
  }
  60% {
    filter: blur(12px);
    opacity: 0.35;
  }
  100% {
    transform: translate(var(--dx), var(--dy)) scale(var(--s)) rotate(var(--r));
    filter: blur(25px);
    opacity: 0;
  }
}
</style>