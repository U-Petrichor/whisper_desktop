<template>
  <div class="login-page">
    <div class="background-shapes">
      <div class="shape shape1"></div>
      <div class="shape shape2"></div>
      <div class="shape shape3"></div>
      <div class="shape shape4"></div>
      <div class="shape shape5"></div>
      <div class="shape shape6"></div>
    </div>
    <div class="login-container">
      <div class="features-panel">
        <div class="app-branding">
          <h1 class="app-title">Whisper</h1>
          <p class="app-subtitle">安全 &middot; 混合 &middot; 智能</p>
        </div>
        <div class="feature-list">
          <div class="feature-item">
            <span class="feature-icon">🔗</span>
            <div class="feature-content">
              <strong>P2P直连</strong>
              <p>在线用户之间直接通信，低延迟高隐私</p>
            </div>
          </div>
          <div class="feature-item">
            <span class="feature-icon">📡</span>
            <div class="feature-content">
              <strong>服务器转发</strong>
              <p>离线用户消息存储转发，确保送达</p>
            </div>
          </div>
          <div class="feature-item">
            <span class="feature-icon">⚡</span>
            <div class="feature-content">
              <strong>智能切换</strong>
              <p>根据网络状况自动选择最优传输方式</p>
            </div>
          </div>
          <div class="feature-item">
            <span class="feature-icon">🔒</span>
            <div class="feature-content">
              <strong>端到端加密</strong>
              <p>消息全程加密保护，保障通信安全</p>
            </div>
          </div>
        </div>
      </div>

      <div class="login-form-wrapper">
        <div class="login-form">
          <h2>欢迎回来！</h2>
          <p class="form-subtitle">“在这里，你的秘密比CEO的年终奖还安全。”</p>
          
          <form @submit.prevent="handleLogin">
            <div class="form-group">
              <input
                id="username"
                v-model="loginForm.username"
                type="text"
                placeholder=" "
                required
                class="form-input"
              />
              <label for="username">用户名</label>
            </div>

            <div class="form-group">
              <input
                id="password"
                v-model="loginForm.password"
                type="password"
                placeholder=" "
                required
                class="form-input"
              />
              <label for="password">密码</label>
            </div>

            <div class="form-options">
              <label class="checkbox-label">
                <input
                  v-model="loginForm.rememberMe"
                  type="checkbox"
                  class="checkbox"
                />
                <span>记住我（不推荐在公共电脑上使用）</span>
              </label>
              <button type="button" @click="showForgotPasswordForm" class="forgot-password-link">
                忘记密码？
              </button>
            </div>

            <button
              type="submit"
              :disabled="isLoading || isBlocked"
              class="login-btn"
            >
              <span v-if="!isLoading && !isBlocked">安全登录</span>
              <span v-else-if="isBlocked">已被锁定</span>
              <div v-else class="loading-spinner"></div>
            </button>

            <div v-if="errorMessage" class="error-message">
              {{ errorMessage }}
            </div>
            <div v-if="successMessage" class="success-message">
              {{ successMessage }}
            </div>
          </form>

          <!-- 忘记密码表单 -->
          <div v-if="showForgotPassword" class="forgot-password-form">
            <h3>{{ forgotPasswordStep === 'email' ? '重置密码' : forgotPasswordStep === 'verify' ? '验证邮箱' : '设置新密码' }}</h3>
            
            <!-- 步骤1: 输入邮箱 -->
            <form v-if="forgotPasswordStep === 'email'" @submit.prevent="sendResetCode" class="form">
              <div class="form-group">
                <input 
                  v-model="resetEmail" 
                  type="email"
                  placeholder=" "
                  required 
                  class="form-input"
                  id="resetEmail"
                />
                <label for="resetEmail">请输入注册邮箱</label>
              </div>
              <button type="submit" class="login-btn" :disabled="isLoading">
                {{ isLoading ? '发送中...' : '发送验证码' }}
              </button>
            </form>
            
            <!-- 步骤2: 验证验证码 -->
            <form v-if="forgotPasswordStep === 'verify'" @submit.prevent="verifyResetCode" class="form">
              <div class="form-group">
                <input 
                  v-model="verificationCode" 
                  placeholder=" "
                  required 
                  maxlength="6"
                  class="form-input"
                  id="verificationCode"
                />
                <label for="verificationCode">请输入6位验证码</label>
              </div>
              <button type="submit" class="login-btn" :disabled="isLoading">
                {{ isLoading ? '验证中...' : '验证验证码' }}
              </button>
              <div class="resend-code">
                <span v-if="countdown > 0">{{ countdown }}秒后可重新发送</span>
                <button v-else @click="sendResetCode" type="button" class="resend-btn">
                  重新发送验证码
                </button>
              </div>
            </form>
            
            <!-- 步骤3: 设置新密码 -->
            <form v-if="forgotPasswordStep === 'reset'" @submit.prevent="resetPassword" class="form">
              <div class="form-group">
                <input 
                  v-model="newPassword" 
                  type="password"
                  placeholder=" "
                  required 
                  class="form-input"
                  id="newPassword"
                />
                <label for="newPassword">请输入新密码</label>
              </div>
              <div class="form-group">
                <input 
                  v-model="confirmPassword" 
                  type="password"
                  placeholder=" "
                  required 
                  class="form-input"
                  id="confirmPassword"
                />
                <label for="confirmPassword">确认新密码</label>
              </div>
              <button type="submit" class="login-btn" :disabled="isLoading">
                {{ isLoading ? '重置中...' : '重置密码' }}
              </button>
            </form>
            
            <div v-if="errorMessage" class="error-message">
              {{ errorMessage }}
            </div>
            <div v-if="successMessage" class="success-message">
              {{ successMessage }}
            </div>
            
            <button @click="backToLogin" class="back-btn">
              返回登录
            </button>
          </div>

          <div v-if="!showForgotPassword" class="login-footer">
            <p>还没有账号？ 
              <router-link to="/register" class="register-link">加入我们，一起保守秘密</router-link>
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { hybridStore } from '../store/hybrid-store';
import { authAPI } from '../api/hybrid-api';
import api from '../api/hybrid-api';
import { initializeUserEncryption, hasCompleteEncryptionKeys, validateUserKeys } from '../utils/encryption-keys';
import { initDatabase } from '../client_db/database';
import { checkUserLoggedInElsewhere, forceLogoutOtherSessions } from '../utils/single-login';
import { extractAuthPayload, extractPayload } from '../utils/api-contract';
import { createLogger } from '@/utils/logger.ts';

const log = createLogger('Login');
const router = useRouter();

const isLoading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
const loginAttempts = ref(0);
const maxAttempts = 3;
const isBlocked = ref(false);

const loginForm = reactive({
  username: '',
  password: '',
  rememberMe: false
});

// 忘记密码相关状态
const showForgotPassword = ref(false);
const forgotPasswordStep = ref('email'); // 'email', 'verify', 'reset'
const resetEmail = ref('');
const verificationCode = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const countdown = ref(0);
let countdownTimer = null;

async function handleLogin() {
  if (isLoading.value) return;

  if (isBlocked.value) {
    errorMessage.value = `登录失败次数过多，请刷新页面重试`;
    return;
  }

  if (!loginForm.username || !loginForm.password) {
    errorMessage.value = '请输入用户名和密码';
    return;
  }

  isLoading.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  try {
    const response = await authAPI.login({
      username: loginForm.username,
      password: loginForm.password
    });

    // 获取用户ID
    const authPayload = extractAuthPayload(response);
    const userId = authPayload.user?.id || authPayload.user?.userId;
    
    // 检查用户是否已在其他页面登录
    const isLoggedInElsewhere = await checkUserLoggedInElsewhere(userId);
    
    if (isLoggedInElsewhere) {
      // 显示提示信息
      successMessage.value = '检测到您已在其他页面登录，正在强制登出其他会话...';
      // 强制登出其他会话
      forceLogoutOtherSessions(userId);
      // 等待一小段时间，确保其他会话已登出
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 设置用户信息到store（现在是异步方法）
    const setUserSuccess = await hybridStore.setUser(authPayload.user, authPayload.token);
    
    if (!setUserSuccess) {
      errorMessage.value = '用户信息设置失败，请重试';
      return;
    }
    
    // 验证用户信息是否正确设置
    if (!hybridStore.user || !hybridStore.user.id) {
      errorMessage.value = '用户信息验证失败，请重试';
      return;
    }
    
    // 检查用户是否拥有完整的加密密钥
    const hasKeys = hasCompleteEncryptionKeys(hybridStore.user.id);
    
    if (!hasKeys) {
      try {
        // 从服务器获取用户的公钥和私钥
        const keyResponse = await authAPI.getUserKeys(hybridStore.user.id);
        const keyPayload = extractPayload(keyResponse);
        if (keyPayload && keyPayload.public_key) {
          // 初始化用户加密环境
          await initializeUserEncryption(
            hybridStore.user.id,
            {
              public_key: keyPayload.public_key,
              registration_id: keyPayload.registration_id || hybridStore.user.id,
              prekey_bundle: keyPayload.prekey_bundle
            }
          );
        } else {
          log.warn('服务器未返回有效的密钥信息');
        }
      } catch (keyError) {
        log.error('获取用户密钥失败:', keyError);
        // 密钥获取失败不阻止登录，但会记录警告
      }
    } else {
      // 验证现有密钥的有效性
      const isValid = validateUserKeys(hybridStore.user.id);
      if (!isValid) {
        log.warn('本地密钥验证失败，可能需要重新获取');
      } else {
      }
      
      // 确保数据库已初始化
      try {
        await initDatabase();
      } catch (dbError) {
        log.error('数据库初始化失败:', dbError);
      }
    }
    
    // 跳转到过渡页面
    router.push('/login-transition');

  } catch (error) {
    log.error('登录失败:', error);
    
    // 增加失败次数
    loginAttempts.value++;
    
    if (error.response) {
      // 服务器返回了错误响应
      const status = error.response.status;
      if (status === 401) {
        const remainingAttempts = maxAttempts - loginAttempts.value;
        if (remainingAttempts > 0) {
          errorMessage.value = `用户名或密码错误，还有 ${remainingAttempts} 次机会`;
        } else {
          errorMessage.value = '用户名或密码错误，已达到最大尝试次数';
          isBlocked.value = true;
        }
      } else if (status === 500) {
        errorMessage.value = '服务器内部错误，请稍后重试';
      } else {
        errorMessage.value = error.response.data?.message || '登录失败，请重试';
      }
    } else if (error.request) {
      // 网络错误
      errorMessage.value = '无法连接到服务器，请检查网络连接';
    } else {
      // 其他错误
      errorMessage.value = '登录失败，请重试';
    }
    
    // 检查是否达到最大尝试次数
    if (loginAttempts.value >= maxAttempts && !isBlocked.value) {
      isBlocked.value = true;
      errorMessage.value = '登录失败次数过多，请刷新页面重试';
    }
  } finally {
    isLoading.value = false;
  }
}

// 忘记密码相关方法
function showForgotPasswordForm() {
  showForgotPassword.value = true;
  forgotPasswordStep.value = 'email';
  resetForm();
}

function backToLogin() {
  showForgotPassword.value = false;
  forgotPasswordStep.value = 'email';
  resetForm();
}

function resetForm() {
  resetEmail.value = '';
  verificationCode.value = '';
  newPassword.value = '';
  confirmPassword.value = '';
  errorMessage.value = '';
  successMessage.value = '';
  stopCountdown();
}

function startCountdown() {
  countdown.value = 60;
  countdownTimer = setInterval(() => {
    countdown.value--;
    if (countdown.value <= 0) {
      stopCountdown();
    }
  }, 1000);
}

function stopCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  countdown.value = 0;
}

async function sendResetCode() {
  if (!resetEmail.value) {
    errorMessage.value = '请输入邮箱地址';
    return;
  }
  
  isLoading.value = true;
  errorMessage.value = '';
  
  try {
    const response = await api.post('/v1/auth/forgot-password', {
      email: resetEmail.value
    });
    
    if (response.data.success) {
      errorMessage.value = '';
      forgotPasswordStep.value = 'verify';
      startCountdown();
    }
  } catch (e) {
    log.error('发送验证码失败:', e);
    if (e.response?.data?.message) {
      errorMessage.value = e.response.data.message;
    } else if (e.response?.data?.detail) {
      errorMessage.value = e.response.data.detail;
    } else {
      errorMessage.value = '发送验证码失败，请稍后重试';
    }
  } finally {
    isLoading.value = false;
  }
}

async function verifyResetCode() {
  if (!verificationCode.value || verificationCode.value.length !== 6) {
    errorMessage.value = '请输入6位验证码';
    return;
  }
  
  isLoading.value = true;
  errorMessage.value = '';
  
  try {
    const response = await api.post('/v1/auth/verify-reset-code', {
      email: resetEmail.value,
      code: verificationCode.value
    });
    
    if (response.data.success) {
      errorMessage.value = '';
      forgotPasswordStep.value = 'reset';
      stopCountdown();
    }
  } catch (e) {
    log.error('验证码验证失败:', e);
    if (e.response?.data?.message) {
      errorMessage.value = e.response.data.message;
    } else if (e.response?.data?.detail) {
      errorMessage.value = e.response.data.detail;
    } else {
      errorMessage.value = '验证码验证失败，请重试';
    }
  } finally {
    isLoading.value = false;
  }
}

async function resetPassword() {
  if (!newPassword.value || newPassword.value.length < 6) {
    errorMessage.value = '密码长度至少6位';
    return;
  }
  
  if (newPassword.value !== confirmPassword.value) {
    errorMessage.value = '两次输入的密码不一致';
    return;
  }
  
  isLoading.value = true;
  errorMessage.value = '';
  
  try {
    const response = await api.post('/v1/auth/reset-password', {
      email: resetEmail.value,
      code: verificationCode.value,
      new_password: newPassword.value
    });
    
    if (response.data.success) {
      errorMessage.value = '';
      successMessage.value = '密码重置成功！2秒后返回登录页面';
      setTimeout(() => {
        backToLogin();
      }, 2000);
    }
  } catch (e) {
    log.error('密码重置失败:', e);
    if (e.response?.data?.message) {
      errorMessage.value = e.response.data.message;
    } else if (e.response?.data?.detail) {
      errorMessage.value = e.response.data.detail;
    } else {
      errorMessage.value = '密码重置失败，请重试';
    }
  } finally {
    isLoading.value = false;
  }
}

// 组件卸载时清理定时器
onUnmounted(() => {
  stopCountdown();
});
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  background-color: #f0f2f5;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  overflow: hidden;
  position: relative;
}

.background-shapes {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
}

.shape {
  position: absolute;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.15), rgba(118, 75, 162, 0.15));
  animation: float 20s infinite ease-in-out;
}

.shape1 { width: 220px; height: 220px; top: 10%; left: 15%; animation-duration: 25s; }
.shape2 { width: 100px; height: 100px; top: 70%; left: 30%; animation-duration: 18s; animation-delay: 3s; }
.shape3 { width: 150px; height: 150px; top: 30%; left: 80%; animation-duration: 22s; animation-delay: 5s; }
.shape4 { width: 50px; height: 50px; top: 80%; left: 60%; animation-duration: 15s; animation-delay: 1s; }
.shape5 { width: 90px; height: 90px; top: 50%; left: 50%; animation-duration: 28s; animation-delay: 4s; }
.shape6 { width: 60px; height: 60px; top: 15%; left: 40%; animation-duration: 16s; animation-delay: 7s; }


@keyframes float {
  0% { transform: translateY(0px) rotate(0deg) scale(1); }
  50% { transform: translateY(-30px) rotate(180deg) scale(1.05); }
  100% { transform: translateY(0px) rotate(360deg) scale(1); }
}

.login-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  max-width: 980px;
  width: 100%;
  background: rgba(255, 255, 255, 0.85);
  border-radius: 1.5rem;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  z-index: 1;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.features-panel {
  padding: 4rem;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.app-branding {
  margin-bottom: 3rem;
}

.app-title {
  font-size: 3rem;
  font-weight: 700;
  margin: 0 0 0.5rem 0;
}

.app-subtitle {
  font-size: 1.25rem;
  opacity: 0.8;
  margin: 0;
}

.feature-list {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.feature-icon {
  font-size: 2rem;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 50%;
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.feature-content strong {
  display: block;
  font-size: 1.1rem;
  margin-bottom: 0.25rem;
}

.feature-content p {
  margin: 0;
  opacity: 0.8;
  font-size: 0.9rem;
}

.login-form-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3rem;
}

.login-form {
  width: 100%;
  max-width: 400px;
}

.login-form h2 {
  font-size: 2rem;
  font-weight: 600;
  color: #333;
  margin: 0 0 0.5rem 0;
}

.form-subtitle {
  color: #666;
  margin: 0 0 2.5rem 0;
}

.form-group {
  margin-bottom: 1.5rem;
  position: relative;
}

.form-input {
  width: 100%;
  padding: 1rem;
  border: 1px solid #ddd;
  border-radius: 0.5rem;
  font-size: 1rem;
  transition: border-color 0.2s;
  background-color: white;
}

.form-input:focus {
  outline: none;
  border-color: #667eea;
}

.form-group label {
  position: absolute;
  top: 50%;
  left: 1rem;
  transform: translateY(-50%);
  color: #999;
  padding: 0 0.25rem;
  transition: all 0.2s ease-in-out;
  pointer-events: none;
  background-color: white;
}

.form-input:focus + label,
.form-input:not(:placeholder-shown) + label {
  top: 0;
  font-size: 0.75rem;
  color: #667eea;
}

.form-options {
  margin-bottom: 2rem;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 0.875rem;
  color: #666;
}

.checkbox {
  width: 1rem;
  height: 1rem;
  accent-color: #667eea;
}

.login-btn {
  width: 100%;
  padding: 1rem;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border: none;
  border-radius: 0.5rem;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 50px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
}

.login-btn:hover:not(:disabled) {
  transform: translateY(-3px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
}

.login-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid transparent;
  border-top: 2px solid white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error-message {
  margin-top: 1rem;
  padding: 0.75rem;
  background: #ffeded;
  color: #d93025;
  border: 1px solid #f8d7da;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  text-align: center;
}

.success-message {
  margin-top: 1rem;
  padding: 0.75rem;
  background: #e8f5e8;
  color: #2e7d32;
  border: 1px solid #c8e6c9;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  text-align: center;
}

.login-footer {
  text-align: center;
  margin-top: 2rem;
  color: #666;
  font-size: 0.9rem;
}

.register-link {
  color: #667eea;
  text-decoration: none;
  font-weight: 500;
}

.register-link:hover {
  text-decoration: underline;
}

/* 忘记密码样式 */
.forgot-password-form {
  width: 100%;
}

.forgot-password-form h3 {
  text-align: center;
  margin-bottom: 30px;
  color: #333;
  font-size: 24px;
  font-weight: 600;
}

.resend-code {
  text-align: center;
  margin-top: 15px;
  font-size: 14px;
  color: #666;
}

.resend-btn {
  background: none;
  border: none;
  color: #667eea;
  cursor: pointer;
  text-decoration: underline;
  font-size: 14px;
  padding: 0;
}

.resend-btn:hover {
  color: #764ba2;
}

.back-btn {
  width: 100%;
  padding: 12px;
  margin-top: 20px;
  background: transparent;
  border: 2px solid #667eea;
  color: #667eea;
  border-radius: 0.5rem;
  cursor: pointer;
  font-size: 16px;
  font-weight: 500;
  transition: all 0.3s ease;
}

.back-btn:hover {
  background: #667eea;
  color: white;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.forgot-password-link {
  background: none;
  border: none;
  color: #667eea;
  cursor: pointer;
  text-decoration: none;
  font-size: 0.875rem;
  padding: 0;
  margin-left: auto;
}

.forgot-password-link:hover {
  text-decoration: underline;
}

/* 响应式设计 */
@media (max-width: 992px) {
  .login-container {
    grid-template-columns: 1fr;
    max-width: 450px;
  }
  .features-panel {
    display: none;
  }
  .login-form-wrapper {
    padding: 2rem;
  }
}

@media (max-width: 480px) {
  .login-page { padding: 1rem; }
  .login-form-wrapper { padding: 1.5rem; }
  .login-form h2 { font-size: 1.5rem; }
  .form-subtitle { font-size: 0.9rem; margin-bottom: 2rem; }
}
</style>
