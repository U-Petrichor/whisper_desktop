<template>
  <div class="register-page">
    <div class="register-container">
      <div class="register-header">
        <h1 class="app-title">安全即时通信</h1>
        <p class="app-subtitle">混合架构 P2P + 服务器转发</p>
      </div>

      <div class="register-form">
        <h2>用户注册</h2>
        
        <form @submit.prevent="handleRegister">
          <div class="form-group">
            <label for="username">用户名</label>
            <input
              id="username"
              v-model="registerForm.username"
              type="text"
              placeholder="请输入用户名"
              required
              class="form-input"
            />
          </div>

          <div class="form-group">
            <label for="email">邮箱</label>
            <input
              id="email"
              v-model="registerForm.email"
              type="email"
              placeholder="请输入邮箱地址"
              required
              class="form-input"
            />
          </div>

          <div class="form-group">
            <label for="password">密码</label>
            <input
              id="password"
              v-model="registerForm.password"
              type="password"
              placeholder="请输入密码"
              required
              class="form-input"
            />
          </div>

          <div class="form-group">
            <label for="confirmPassword">确认密码</label>
            <input
              id="confirmPassword"
              v-model="registerForm.confirmPassword"
              type="password"
              placeholder="请再次输入密码"
              required
              class="form-input"
            />
          </div>

          <div class="form-options">
            <label class="checkbox-label">
              <input
                v-model="registerForm.acceptTerms"
                type="checkbox"
                class="checkbox"
                required
              />
              <span>我同意 <a href="#" class="terms-link">服务条款</a> 和 <a href="#" class="terms-link">隐私政策</a></span>
            </label>
          </div>

          <button
            type="submit"
            :disabled="isLoading || !canRegister"
            class="register-btn"
          >
            <span v-if="!isLoading">注册</span>
            <div v-else class="loading-spinner"></div>
          </button>

          <div v-if="errorMessage" class="error-message">
            {{ errorMessage }}
          </div>
        </form>

        <div class="register-footer">
          <p>已有账号？ 
            <router-link to="/login" class="login-link">立即登录</router-link>
          </p>
        </div>
      </div>

      <!-- 安全特性说明 -->
      <div class="security-panel">
        <h3>安全保障</h3>
        <div class="security-list">
          <div class="security-item">
            <span class="security-icon">🔐</span>
            <div class="security-content">
              <strong>密码安全</strong>
              <p>使用bcrypt加密存储，永不明文保存</p>
            </div>
          </div>
          
          <div class="security-item">
            <span class="security-icon">🔑</span>
            <div class="security-content">
              <strong>密钥生成</strong>
              <p>自动生成RSA密钥对，支持端到端加密</p>
            </div>
          </div>
          
          <div class="security-item">
            <span class="security-icon">🛡️</span>
            <div class="security-content">
              <strong>隐私保护</strong>
              <p>私钥保存在本地，公钥存储在服务器</p>
            </div>
          </div>
          
          <div class="security-item">
            <span class="security-icon">📱</span>
            <div class="security-content">
              <strong>跨平台</strong>
              <p>支持多设备同步，安全传输</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue';
import { useRouter } from 'vue-router';
import { hybridStore } from '../store/hybrid-store';
import { authAPI } from '../api/hybrid-api';
import { initializeUserEncryption } from '../utils/encryption-keys';
import { storeUserKeys } from '../client_db/database';
import { extractAuthPayload, extractUserId } from '../utils/api-contract';

const router = useRouter();

const isLoading = ref(false);
const errorMessage = ref('');

const registerForm = reactive({
  username: '',
  email: '',
  password: '',
  confirmPassword: '',
  acceptTerms: false
});

const canRegister = computed(() => {
  return registerForm.username &&
         registerForm.email &&
         registerForm.password &&
         registerForm.confirmPassword &&
         registerForm.password === registerForm.confirmPassword &&
         registerForm.acceptTerms;
});

async function handleRegister() {
  if (isLoading.value || !canRegister.value) return;

  if (registerForm.password !== registerForm.confirmPassword) {
    errorMessage.value = '两次输入的密码不一致';
    return;
  }

  isLoading.value = true;
  errorMessage.value = '';

  try {
    const response = await authAPI.register({
      username: registerForm.username,
      email: registerForm.email,
      password: registerForm.password
    });
    const authPayload = extractAuthPayload(response);

    // 注册成功，设置用户信息（异步方法）
    await hybridStore.setUser(authPayload.user, authPayload.token);

    // 存储用户密钥到客户端本地存储
    try {
      if (authPayload.keys) {
        await storeUserKeys(authPayload.keys);
        console.log('✅ 用户密钥已存储到客户端本地存储');
      } else {
        console.warn('⚠️  注册响应中未包含密钥信息');
      }
    } catch (keyStorageError) {
      console.error('❌ 存储密钥到客户端失败:', keyStorageError);
      // 密钥存储失败不阻止注册流程，但会记录错误
    }

    // 初始化用户加密环境
    try {
      const userId = extractUserId(authPayload.user);
      await initializeUserEncryption(userId, {
        public_key: authPayload.publicKey || authPayload.keys?.public_key || authPayload.keys?.publicKey,
        registration_id: authPayload.registrationId || userId,
        prekey_bundle: authPayload.keys?.prekey_bundle || authPayload.keys?.prekeyBundle
      });
      console.log('用户加密环境初始化完成');
    } catch (encryptionError) {
      console.error('加密环境初始化失败:', encryptionError);
      // 加密初始化失败不阻止注册流程，但会记录错误
    }

    // 跳转到聊天页面
    router.push('/chat');

  } catch (error) {
    console.error('注册失败:', error);
    
    if (error.response) {
      // 服务器返回了错误响应
      const status = error.response.status;
      if (status === 409) {
        errorMessage.value = '用户名或邮箱已存在';
      } else if (status === 400) {
        errorMessage.value = error.response.data?.message || '输入信息有误，请检查';
      } else if (status === 500) {
        errorMessage.value = '服务器内部错误，请稍后重试';
      } else {
        errorMessage.value = error.response.data?.message || '注册失败，请重试';
      }
    } else if (error.request) {
      // 网络错误
      errorMessage.value = '无法连接到服务器，请检查网络连接';
    } else {
      // 其他错误
      errorMessage.value = '注册失败，请重试';
    }
  } finally {
    isLoading.value = false;
  }
}
</script>

<style scoped>
.register-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.register-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3rem;
  max-width: 1000px;
  width: 100%;
  background: white;
  border-radius: 1rem;
  box-shadow: 0 20px 40px rgba(0,0,0,0.1);
  overflow: hidden;
}

.register-header {
  grid-column: span 2;
  text-align: center;
  padding: 2rem 2rem 0;
}

.app-title {
  margin: 0 0 0.5rem 0;
  font-size: 2rem;
  font-weight: 700;
  color: #333;
}

.app-subtitle {
  margin: 0;
  color: #666;
  font-size: 1rem;
}

.register-form {
  padding: 0 2rem 2rem;
}

.register-form h2 {
  margin: 0 0 2rem 0;
  font-size: 1.5rem;
  color: #333;
  text-align: center;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #333;
}

.form-input {
  width: 100%;
  padding: 0.75rem 1rem;
  border: 2px solid #e1e5e9;
  border-radius: 0.5rem;
  font-size: 1rem;
  transition: border-color 0.2s;
}

.form-input:focus {
  outline: none;
  border-color: #764ba2;
  box-shadow: 0 0 0 3px rgba(118, 75, 162, 0.1);
}

.form-options {
  margin-bottom: 2rem;
}

.checkbox-label {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 0.875rem;
  color: #666;
  line-height: 1.4;
}

.checkbox {
  width: 1rem;
  height: 1rem;
  margin-top: 0.125rem;
  flex-shrink: 0;
}

.terms-link {
  color: #764ba2;
  text-decoration: none;
}

.terms-link:hover {
  text-decoration: underline;
}

.register-btn {
  width: 100%;
  padding: 0.875rem;
  background: linear-gradient(135deg, #764ba2, #667eea);
  color: white;
  border: none;
  border-radius: 0.5rem;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 50px;
}

.register-btn:hover:not(:disabled) {
  transform: translateY(-2px);
}

.register-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
  transform: none;
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
  background: #fee;
  color: #c33;
  border: 1px solid #fcc;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  text-align: center;
}

.register-footer {
  text-align: center;
  margin-top: 2rem;
  color: #666;
}

.login-link {
  color: #764ba2;
  text-decoration: none;
  font-weight: 500;
}

.login-link:hover {
  text-decoration: underline;
}

.security-panel {
  padding: 2rem;
  background: #f8f9fa;
}

.security-panel h3 {
  margin: 0 0 1.5rem 0;
  font-size: 1.25rem;
  color: #333;
  text-align: center;
}

.security-list {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.security-item {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
}

.security-icon {
  font-size: 2rem;
  flex-shrink: 0;
}

.security-content strong {
  display: block;
  margin-bottom: 0.25rem;
  color: #333;
  font-size: 1rem;
}

.security-content p {
  margin: 0;
  color: #666;
  font-size: 0.875rem;
  line-height: 1.4;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .register-page {
    padding: 1rem;
  }
  
  .register-container {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }
  
  .register-header {
    grid-column: span 1;
    padding: 1.5rem 1.5rem 0;
  }
  
  .app-title {
    font-size: 1.5rem;
  }
  
  .register-form, .security-panel {
    padding: 0 1.5rem 1.5rem;
  }
  
  .security-list {
    gap: 1rem;
  }
  
  .security-item {
    gap: 0.75rem;
  }
  
  .security-icon {
    font-size: 1.5rem;
  }
}
</style>
