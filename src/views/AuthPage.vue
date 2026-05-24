<template>
  <div class="auth-page">
    <TitleBar variant="login" />

    <div class="auth-content">
      <!-- Login card -->
      <div v-if="!showRegister" class="auth-card">
        <div class="card-decoration"></div>
        <div class="card-header">
          <h1 class="card-title">欢迎回来</h1>
          <p class="card-subtitle">登录以继续使用 Whisper</p>
        </div>

        <form class="auth-form" @submit.prevent="handleLogin">
          <div class="input-group">
            <label for="login-username">用户名</label>
            <input
              id="login-username"
              v-model="loginForm.username"
              type="text"
              placeholder="请输入用户名"
              required
              class="text-input"
            />
          </div>

          <div class="input-group">
            <label for="login-password">密码</label>
            <div class="password-wrapper">
              <input
                id="login-password"
                v-model="loginForm.password"
                :type="showLoginPassword ? 'text' : 'password'"
                placeholder="请输入密码"
                required
                class="text-input"
              />
              <button type="button" class="toggle-visibility" @click="showLoginPassword = !showLoginPassword">
                <span class="material-symbols-outlined">{{ showLoginPassword ? 'visibility' : 'visibility_off' }}</span>
              </button>
            </div>
          </div>

          <div class="form-options">
            <label class="checkbox-label">
              <input v-model="loginForm.rememberMe" type="checkbox" class="checkbox" />
              <span>记住我</span>
            </label>
            <button type="button" @click="showForgotPasswordForm" class="text-link">
              忘记密码？
            </button>
          </div>

          <button type="submit" :disabled="isLoading" class="primary-btn">
            <span v-if="!isLoading">登录</span>
            <div v-else class="loading-spinner"></div>
          </button>

          <div v-if="errorMessage" class="error-message">
            {{ errorMessage }}
          </div>
        </form>

        <div class="form-footer">
          <span>没有账户？</span>
          <button @click="switchToRegister" class="text-link">注册</button>
        </div>
      </div>

      <!-- Register card -->
      <div v-else class="auth-card">
        <div class="card-decoration"></div>
        <div class="card-header">
          <h1 class="card-title">创建账号</h1>
          <p class="card-subtitle">加入 Whisper，开启纯粹的交流空间。</p>
        </div>

        <form class="auth-form" @submit.prevent="handleRegister">
          <div class="input-group">
            <label for="register-username">用户名</label>
            <input
              id="register-username"
              v-model="registerForm.username"
              type="text"
              placeholder="设置你的专属名称"
              required
              class="text-input"
            />
          </div>

          <div class="input-group">
            <label for="register-email">邮箱</label>
            <input
              id="register-email"
              v-model="registerForm.email"
              type="email"
              placeholder="输入常用邮箱地址"
              required
              class="text-input"
            />
          </div>

          <div class="input-group">
            <label for="register-password">密码</label>
            <div class="password-wrapper">
              <input
                id="register-password"
                v-model="registerForm.password"
                :type="showRegPassword ? 'text' : 'password'"
                placeholder="设置安全密码"
                required
                class="text-input"
              />
              <button type="button" class="toggle-visibility" @click="showRegPassword = !showRegPassword">
                <span class="material-symbols-outlined">{{ showRegPassword ? 'visibility' : 'visibility_off' }}</span>
              </button>
            </div>
          </div>

          <div class="input-group">
            <label for="register-confirm-password">确认密码</label>
            <input
              id="register-confirm-password"
              v-model="registerForm.confirmPassword"
              :type="showRegPassword ? 'text' : 'password'"
              placeholder="再次输入密码"
              required
              class="text-input"
            />
          </div>

          <div class="form-options">
            <label class="checkbox-label">
              <input v-model="registerForm.acceptTerms" type="checkbox" class="checkbox" required />
              <span>我已阅读并同意 <a class="text-link" href="#">服务条款</a> 与 <a class="text-link" href="#">隐私政策</a></span>
            </label>
          </div>

          <button type="submit" :disabled="isLoading || !canRegister" class="primary-btn">
            <span v-if="!isLoading">注册</span>
            <div v-else class="loading-spinner"></div>
          </button>

          <div v-if="errorMessage" class="error-message">
            {{ errorMessage }}
          </div>
        </form>

        <div class="form-footer">
          <span>已有账户？</span>
          <button @click="switchToLogin" class="text-link">登录</button>
        </div>
      </div>

      <!-- Forgot password overlay -->
      <div v-if="showForgotPassword" class="forgot-password-overlay">
        <div class="forgot-password-form">
          <h3>{{ forgotPasswordStep === 'email' ? '重置密码' : forgotPasswordStep === 'verify' ? '验证邮箱' : '设置新密码' }}</h3>

          <form v-if="forgotPasswordStep === 'email'" @submit.prevent="sendResetCode" class="form">
            <div class="input-group">
              <label for="resetEmail">邮箱地址</label>
              <input v-model="resetEmail" type="email" placeholder="请输入注册邮箱" required class="text-input" id="resetEmail" />
            </div>
            <button type="submit" class="primary-btn" :disabled="isLoading">
              {{ isLoading ? '发送中...' : '发送验证码' }}
            </button>
          </form>

          <form v-if="forgotPasswordStep === 'verify'" @submit.prevent="verifyResetCode" class="form">
            <div class="input-group">
              <label for="verificationCode">验证码</label>
              <input v-model="verificationCode" placeholder="请输入6位验证码" required maxlength="6" class="text-input" id="verificationCode" />
            </div>
            <button type="submit" class="primary-btn" :disabled="isLoading">
              {{ isLoading ? '验证中...' : '验证验证码' }}
            </button>
            <div class="resend-code">
              <span v-if="countdown > 0">{{ countdown }}秒后可重新发送</span>
              <button v-else @click="sendResetCode" type="button" class="resend-btn">重新发送验证码</button>
            </div>
          </form>

          <form v-if="forgotPasswordStep === 'reset'" @submit.prevent="resetPassword" class="form">
            <div class="input-group">
              <label for="newPassword">新密码</label>
              <input v-model="newPassword" type="password" placeholder="请输入新密码" required class="text-input" id="newPassword" />
            </div>
            <div class="input-group">
              <label for="confirmPassword">确认密码</label>
              <input v-model="confirmPassword" type="password" placeholder="确认新密码" required class="text-input" id="confirmPassword" />
            </div>
            <button type="submit" class="primary-btn" :disabled="isLoading">
              {{ isLoading ? '重置中...' : '重置密码' }}
            </button>
          </form>

          <div v-if="errorMessage" class="error-message">{{ errorMessage }}</div>
          <div v-if="successMessage" class="success-message">{{ successMessage }}</div>

          <button @click="backToLogin" class="back-btn">返回登录</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { hybridStore } from '../store/hybrid-store'
import { authAPI } from '../api/hybrid-api'
import api from '../api/hybrid-api'
import { initializeUserEncryption } from '../utils/encryption-keys'
import { storeUserKeys } from '../client_db/database'
import { extractAuthPayload } from '../utils/api-contract'
import { createLogger } from '../utils/logger'
import TitleBar from '../components/TitleBar.vue'
const log = createLogger('AuthPage')

const router = useRouter()
const isLoading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const showRegister = ref(false)
const showLoginPassword = ref(false)
const showRegPassword = ref(false)

// Forgot password state
const showForgotPassword = ref(false)
const forgotPasswordStep = ref('email')
const resetEmail = ref('')
const verificationCode = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const countdown = ref(0)
let countdownTimer = null

// Form data
const loginForm = reactive({
  username: '',
  password: '',
  rememberMe: false
})

const registerForm = reactive({
  username: '',
  email: '',
  password: '',
  confirmPassword: '',
  acceptTerms: false
})

// Computed
const canRegister = computed(() => {
  return registerForm.username &&
         registerForm.email &&
         registerForm.password &&
         registerForm.confirmPassword &&
         registerForm.password === registerForm.confirmPassword &&
         registerForm.acceptTerms
})

// Methods
function switchToRegister() {
  showRegister.value = true
  errorMessage.value = ''
}

function switchToLogin() {
  showRegister.value = false
  errorMessage.value = ''
}

async function handleLogin() {
  if (isLoading.value) return

  if (!loginForm.username || !loginForm.password) {
    errorMessage.value = '请输入用户名和密码'
    return
  }

  isLoading.value = true
  errorMessage.value = ''

  try {
    const response = await authAPI.login({
      username: loginForm.username,
      password: loginForm.password
    })
    const authPayload = extractAuthPayload(response)

    await hybridStore.setUser(authPayload.user, authPayload.token)

    router.push('/login-transition')

  } catch (error) {
    log.error('登录失败:', error)

    if (error.response) {
      const status = error.response.status
      if (status === 401) {
        errorMessage.value = '用户名或密码错误，请重试'
      } else if (status === 500) {
        errorMessage.value = '服务器开小差了，请稍后重试'
      } else {
        errorMessage.value = error.response.data?.message || '登录失败，请重试'
      }
    } else {
      errorMessage.value = '网络连接失败，请检查网络'
    }
  } finally {
    isLoading.value = false
  }
}

async function handleRegister() {
  if (isLoading.value || !canRegister.value) return

  if (registerForm.password !== registerForm.confirmPassword) {
    errorMessage.value = '两次输入的密码不一致'
    return
  }

  isLoading.value = true
  errorMessage.value = ''

  try {
    const response = await authAPI.register({
      username: registerForm.username,
      email: registerForm.email,
      password: registerForm.password
    })

    const authPayload = extractAuthPayload(response)
    await hybridStore.setUser(authPayload.user, authPayload.token)

    if (authPayload.keys) {
      await storeUserKeys(authPayload.keys)
    }

    router.push('/login-transition')

  } catch (error) {
    log.error('注册失败:', error)

    if (error.response) {
      errorMessage.value = error.response.data?.message || '注册失败，请重试'
    } else {
      errorMessage.value = '网络连接失败，请检查网络'
    }
  } finally {
    isLoading.value = false
  }
}

// Forgot password methods
function showForgotPasswordForm() {
  showForgotPassword.value = true
  forgotPasswordStep.value = 'email'
  resetForm()
}

function backToLogin() {
  showForgotPassword.value = false
  forgotPasswordStep.value = 'email'
  resetForm()
}

function resetForm() {
  resetEmail.value = ''
  verificationCode.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
  errorMessage.value = ''
  successMessage.value = ''
  stopCountdown()
}

function startCountdown() {
  countdown.value = 60
  countdownTimer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      stopCountdown()
    }
  }, 1000)
}

function stopCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
  countdown.value = 0
}

async function sendResetCode() {
  if (!resetEmail.value) {
    errorMessage.value = '请输入邮箱地址'
    return
  }

  isLoading.value = true
  errorMessage.value = ''

  try {
    const response = await api.post('/v1/auth/forgot-password', {
      email: resetEmail.value
    })

    if (response.data.success) {
      errorMessage.value = ''
      forgotPasswordStep.value = 'verify'
      startCountdown()
    }
  } catch (e) {
    log.error('发送验证码失败:', e)
    if (e.response?.data?.message) {
      errorMessage.value = e.response.data.message
    } else if (e.response?.data?.detail) {
      errorMessage.value = e.response.data.detail
    } else {
      errorMessage.value = '发送验证码失败，请稍后重试'
    }
  } finally {
    isLoading.value = false
  }
}

async function verifyResetCode() {
  if (!verificationCode.value || verificationCode.value.length !== 6) {
    errorMessage.value = '请输入6位验证码'
    return
  }

  isLoading.value = true
  errorMessage.value = ''

  try {
    const response = await api.post('/v1/auth/verify-reset-code', {
      email: resetEmail.value,
      code: verificationCode.value
    })

    if (response.data.success) {
      errorMessage.value = ''
      forgotPasswordStep.value = 'reset'
      stopCountdown()
    }
  } catch (e) {
    log.error('验证码验证失败:', e)
    if (e.response?.data?.message) {
      errorMessage.value = e.response.data.message
    } else if (e.response?.data?.detail) {
      errorMessage.value = e.response.data.detail
    } else {
      errorMessage.value = '验证码验证失败，请重试'
    }
  } finally {
    isLoading.value = false
  }
}

async function resetPassword() {
  if (!newPassword.value || newPassword.value.length < 6) {
    errorMessage.value = '密码长度至少6位'
    return
  }

  if (newPassword.value !== confirmPassword.value) {
    errorMessage.value = '两次输入的密码不一致'
    return
  }

  isLoading.value = true
  errorMessage.value = ''

  try {
    const response = await api.post('/v1/auth/reset-password', {
      email: resetEmail.value,
      code: verificationCode.value,
      new_password: newPassword.value
    })

    if (response.data.success) {
      errorMessage.value = ''
      successMessage.value = '密码重置成功！2秒后返回登录页面'
      setTimeout(() => {
        backToLogin()
      }, 2000)
    }
  } catch (e) {
    log.error('密码重置失败:', e)
    if (e.response?.data?.message) {
      errorMessage.value = e.response.data.message
    } else if (e.response?.data?.detail) {
      errorMessage.value = e.response.data.detail
    } else {
      errorMessage.value = '密码重置失败，请重试'
    }
  } finally {
    isLoading.value = false
  }
}

onUnmounted(() => {
  stopCountdown()
})
</script>

<style scoped>
.auth-page {
  height: 100vh;
  background: var(--whisper-bg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.auth-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--whisper-gutter);
  padding-top: calc(var(--whisper-titlebar-height) + var(--whisper-sm));
  overflow-y: auto;
}

.auth-card {
  width: 100%;
  max-width: 380px;
  background: var(--whisper-surface-container-lowest);
  border-radius: var(--whisper-radius-xl);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  padding: var(--whisper-xl);
  position: relative;
  overflow: hidden;
}

.auth-card::before {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 200px;
  height: 200px;
  background: var(--whisper-primary-fixed);
  opacity: 0.08;
  border-radius: 50%;
  filter: blur(80px);
  pointer-events: none;
  transform: translate(50%, -50%);
}

.card-header {
  margin-bottom: var(--whisper-lg);
  text-align: center;
}

.card-header .card-title {
  margin: 0;
  font-size: var(--whisper-fs-display-lg);
  line-height: var(--whisper-lh-display-lg);
  letter-spacing: var(--whisper-ls-display-lg);
  font-weight: var(--whisper-fw-display-lg);
  color: var(--whisper-on-surface);
}

.card-header .card-subtitle {
  margin: 4px 0 0;
  font-size: var(--whisper-fs-body-md);
  line-height: var(--whisper-lh-body-md);
  color: var(--whisper-on-surface-variant);
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: var(--whisper-lg);
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: var(--whisper-xs);
}

.input-group label {
  font-size: var(--whisper-fs-label-md);
  line-height: var(--whisper-lh-label-md);
  letter-spacing: var(--whisper-ls-label-md);
  font-weight: var(--whisper-fw-label-md);
  color: var(--whisper-on-surface-variant);
  transition: color 0.2s;
}

.input-group:focus-within label {
  color: var(--whisper-primary);
}

.text-input {
  width: 100%;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--whisper-outline-variant);
  padding: var(--whisper-sm) 0;
  font-size: var(--whisper-fs-body-lg);
  line-height: var(--whisper-lh-body-lg);
  color: var(--whisper-on-surface);
  outline: none;
  transition: border-color 0.2s;
}

.text-input::placeholder {
  color: var(--whisper-outline);
  opacity: 0.5;
}

.text-input:focus {
  border-bottom: 2px solid var(--whisper-primary);
}

.text-input:-webkit-autofill,
.text-input:-webkit-autofill:hover,
.text-input:-webkit-autofill:focus {
  -webkit-box-shadow: 0 0 0 1000px var(--whisper-surface-container) inset;
  -webkit-text-fill-color: var(--whisper-on-surface);
  caret-color: var(--whisper-on-surface);
  transition: background-color 9999s ease-in-out 0s;
}

.password-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.password-wrapper .text-input {
  flex: 1;
  padding-right: 36px;
}

.toggle-visibility {
  position: absolute;
  right: 0;
  background: none;
  border: none;
  color: var(--whisper-on-surface-variant);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
}

.toggle-visibility .material-symbols-outlined {
  font-size: 20px;
}

.form-options {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: var(--whisper-fs-body-md);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: var(--whisper-sm);
  cursor: pointer;
  color: var(--whisper-on-surface-variant);
  font-size: var(--whisper-fs-body-md);
}

.checkbox {
  width: 16px;
  height: 16px;
  appearance: none;
  border: 1px solid var(--whisper-outline);
  border-radius: 2px;
  background: transparent;
  cursor: pointer;
  position: relative;
  flex-shrink: 0;
  transition: all 0.2s;
}

.checkbox:checked {
  background: var(--whisper-primary);
  border-color: var(--whisper-primary);
}

.checkbox:checked::after {
  content: '';
  position: absolute;
  left: 4px;
  top: 1px;
  width: 5px;
  height: 9px;
  border: solid var(--whisper-on-primary);
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.text-link {
  background: none;
  border: none;
  color: var(--whisper-primary);
  cursor: pointer;
  font-size: var(--whisper-fs-label-md);
  line-height: var(--whisper-lh-label-md);
  letter-spacing: var(--whisper-ls-label-md);
  font-weight: var(--whisper-fw-label-md);
  transition: opacity 0.2s;
  text-decoration: none;
}

.text-link:hover {
  opacity: 0.85;
  text-decoration: underline;
}

.primary-btn {
  width: 100%;
  background: var(--whisper-primary);
  color: var(--whisper-on-primary);
  border: none;
  border-radius: var(--whisper-radius-full);
  padding: 12px;
  font-size: var(--whisper-fs-label-md);
  line-height: var(--whisper-lh-label-md);
  letter-spacing: var(--whisper-ls-label-md);
  font-weight: var(--whisper-fw-label-md);
  cursor: pointer;
  transition: all 0.2s;
}

.primary-btn:hover:not(:disabled) {
  opacity: 0.9;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.primary-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.primary-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.loading-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(37, 51, 51, 0.3);
  border-top: 2px solid var(--whisper-on-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-message {
  color: var(--whisper-error);
  text-align: center;
  padding: 8px;
  background: var(--whisper-error-container);
  border-radius: var(--whisper-radius-default);
  font-size: 13px;
}

.success-message {
  color: #81c784;
  text-align: center;
  padding: 8px;
  background: rgba(129, 199, 132, 0.1);
  border-radius: var(--whisper-radius-default);
  font-size: 13px;
}

.form-footer {
  text-align: center;
  margin-top: var(--whisper-md);
  font-size: var(--whisper-fs-body-md);
  color: var(--whisper-on-surface-variant);
}

/* Forgot password overlay */
.forgot-password-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(14, 14, 14, 0.95);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  backdrop-filter: blur(8px);
  border-radius: var(--whisper-radius-xl);
}

.forgot-password-form {
  padding: var(--whisper-xl);
  width: 100%;
  text-align: center;
}

.forgot-password-form h3 {
  color: var(--whisper-on-surface);
  margin-bottom: var(--whisper-lg);
  font-size: var(--whisper-fs-headline-sm);
  font-weight: 500;
}

.forgot-password-form .input-group {
  text-align: left;
}

.forgot-password-form .primary-btn {
  margin-bottom: var(--whisper-md);
}

.resend-code {
  text-align: center;
  margin-top: 12px;
  font-size: 13px;
  color: var(--whisper-on-surface-variant);
}

.resend-btn {
  background: none;
  border: none;
  color: var(--whisper-primary);
  cursor: pointer;
  font-size: var(--whisper-fs-label-md);
  font-weight: var(--whisper-fw-label-md);
  letter-spacing: var(--whisper-ls-label-md);
}

.resend-btn:hover {
  opacity: 0.85;
}

.back-btn {
  background: none;
  border: 1px solid var(--whisper-outline-variant);
  color: var(--whisper-on-surface-variant);
  padding: 8px 16px;
  border-radius: var(--whisper-radius-full);
  cursor: pointer;
  transition: all 0.2s;
  font-size: 13px;
}

.back-btn:hover {
  background: var(--whisper-surface-container-high);
  border-color: var(--whisper-primary);
  color: var(--whisper-primary);
}
</style>