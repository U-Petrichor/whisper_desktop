<template>
  <div class="settings-page">
    <div class="settings-container">
      <div class="settings-header">
        <h1>系统设置</h1>
        <button @click="goBack" class="back-btn">← 返回聊天</button>
      </div>

      <div class="settings-content">
        <!-- 用户信息设置 -->
        <div class="settings-section">
          <h2>用户信息</h2>
          <div class="setting-item">
            <label>用户名</label>
            <input v-model="userSettings.username" type="text" class="setting-input" />
          </div>
          <div class="setting-item">
            <label>邮箱</label>
            <input v-model="userSettings.email" type="email" class="setting-input" />
          </div>
        </div>

        <!-- 连接设置 -->
        <div class="settings-section">
          <h2>连接设置</h2>
          <div class="setting-item">
            <label class="checkbox-label">
              <input v-model="connectionSettings.preferP2P" type="checkbox" />
              <span>优先使用P2P连接</span>
            </label>
          </div>
          <div class="setting-item">
            <label class="checkbox-label">
              <input v-model="connectionSettings.autoReconnect" type="checkbox" />
              <span>自动重连</span>
            </label>
          </div>
          <div class="setting-item">
            <label>连接超时时间 (秒)</label>
            <input v-model="connectionSettings.timeout" type="number" min="5" max="60" class="setting-input" />
          </div>
        </div>

        <!-- 通知设置 -->
        <div class="settings-section">
          <h2>通知设置</h2>
          <div class="setting-item">
            <label class="checkbox-label">
              <input v-model="notificationSettings.enableDesktop" type="checkbox" />
              <span>桌面通知</span>
            </label>
          </div>
          <div class="setting-item">
            <label class="checkbox-label">
              <input v-model="notificationSettings.enableSound" type="checkbox" />
              <span>声音提醒</span>
            </label>
          </div>
        </div>

        <!-- 安全设置 -->
        <div class="settings-section">
          <h2>安全设置</h2>
          <div class="setting-item">
            <label class="checkbox-label">
              <input v-model="securitySettings.enableE2E" type="checkbox" />
              <span>端到端加密</span>
            </label>
          </div>
          <div class="setting-item">
            <button @click="regenerateKeys" class="action-btn">重新生成密钥对</button>
          </div>
          <div class="setting-item">
            <button @click="exportKeys" class="action-btn">导出公钥</button>
          </div>
          <div class="setting-item">
            <button @click="openSteganography" class="action-btn steganography-btn">🔒 图像隐写术工具</button>
          </div>
        </div>

        <!-- 保存按钮 -->
        <div class="settings-actions">
          <button @click="saveSettings" class="save-btn">保存设置</button>
          <button @click="resetSettings" class="reset-btn">重置设置</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { hybridStore } from '../store/hybrid-store';
import { createLogger } from '../utils/logger';
const log = createLogger('Settings');

const router = useRouter();

const userSettings = reactive({
  username: '',
  email: ''
});

const connectionSettings = reactive({
  preferP2P: true,
  autoReconnect: true,
  timeout: 10
});

const notificationSettings = reactive({
  enableDesktop: true,
  enableSound: true
});

const securitySettings = reactive({
  enableE2E: true
});

onMounted(() => {
  // 检查是否是开发模式
  const isDevMode = window.location.pathname.startsWith('/dev/');
  
  if (isDevMode) {
    // 开发模式：加载模拟数据
    loadMockData();
  } else {
    // 只在非开发模式下检查登录状态
    if (!hybridStore.isLoggedIn) {
      router.push('/login');
      return;
    }
  }
  
  loadSettings();
});

function loadSettings() {
  const user = hybridStore.user;
  if (user) {
    userSettings.username = user.username;
    userSettings.email = user.email;
  }

  // 从本地存储加载设置
  const savedSettings = localStorage.getItem('app-settings');
  if (savedSettings) {
    const settings = JSON.parse(savedSettings);
    Object.assign(connectionSettings, settings.connection || {});
    Object.assign(notificationSettings, settings.notification || {});
    Object.assign(securitySettings, settings.security || {});
  }
}

function openSteganography() {
  router.push('/steganography');
}

function saveSettings() {
  const settings = {
    connection: connectionSettings,
    notification: notificationSettings,
    security: securitySettings
  };

  localStorage.setItem('app-settings', JSON.stringify(settings));
  
  // 这里可以调用API保存到服务器
}

function resetSettings() {
  connectionSettings.preferP2P = true;
  connectionSettings.autoReconnect = true;
  connectionSettings.timeout = 10;
  
  notificationSettings.enableDesktop = true;
  notificationSettings.enableSound = true;
  
  securitySettings.enableE2E = true;
}

function regenerateKeys() {
  // 重新生成密钥对的逻辑
}

function exportKeys() {
  // 导出公钥的逻辑
}

async function loadMockData() {
  // 模拟用户数据
  const mockUser = {
    id: 'dev-user-001',
    username: '开发测试用户',
    email: 'dev@example.com'
  };
  
  // 设置模拟用户到store（异步方法）
  await hybridStore.setUser(mockUser, 'dev-mock-token');
  
}

function goBack() {
  // 在开发模式下返回到开发聊天页面
  const isDevMode = window.location.pathname.startsWith('/dev/');
  if (isDevMode) {
    router.push('/dev/chat');
  } else {
    router.push('/chat');
  }
}
</script>

<style scoped>
.settings-page {
  min-height: 100vh;
  background: var(--whisper-bg);
  padding: var(--whisper-lg);
  display: flex;
  align-items: flex-start;
  justify-content: center;
}

.settings-container {
  max-width: 800px;
  width: 100%;
  background: var(--whisper-surface-container);
  border-radius: var(--whisper-radius-xl);
  border: 1px solid var(--whisper-outline-variant);
  overflow: hidden;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--whisper-lg);
  background: var(--whisper-surface-container-high);
  border-bottom: 1px solid var(--whisper-outline-variant);
}

.settings-header h1 {
  margin: 0;
  font-size: var(--whisper-fs-headline-sm);
  color: var(--whisper-on-surface);
  font-weight: 500;
}

.back-btn {
  padding: 8px 16px;
  background: transparent;
  color: var(--whisper-on-surface-variant);
  border: 1px solid var(--whisper-outline-variant);
  border-radius: var(--whisper-radius-full);
  cursor: pointer;
  transition: all 0.2s;
  font-size: var(--whisper-fs-label-lg);
  font-family: inherit;
}

.back-btn:hover {
  background: var(--whisper-surface-container-high);
  border-color: var(--whisper-primary);
  color: var(--whisper-primary);
}

.settings-content {
  padding: var(--whisper-lg);
}

.settings-section {
  margin-bottom: var(--whisper-lg);
  padding-bottom: var(--whisper-lg);
  border-bottom: 1px solid var(--whisper-outline-variant);
}

.settings-section:last-child {
  border-bottom: none;
  margin-bottom: 0;
}

.settings-section h2 {
  margin: 0 0 var(--whisper-md) 0;
  font-size: var(--whisper-fs-headline-sm);
  color: var(--whisper-on-surface);
  font-weight: 500;
}

.setting-item {
  margin-bottom: var(--whisper-md);
}

.setting-item label {
  display: block;
  margin-bottom: var(--whisper-sm);
  font-weight: 500;
  color: var(--whisper-on-surface);
  font-size: var(--whisper-fs-body-md);
}

.checkbox-label {
  display: flex !important;
  align-items: center;
  gap: var(--whisper-sm);
  cursor: pointer;
  color: var(--whisper-on-surface);
}

.checkbox-label input[type="checkbox"] {
  accent-color: var(--whisper-primary);
}

.setting-input {
  width: 100%;
  max-width: 300px;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--whisper-outline-variant);
  padding: var(--whisper-sm) 0;
  font-size: var(--whisper-fs-body-lg);
  color: var(--whisper-on-surface);
  outline: none;
  transition: border-color 0.3s;
  font-family: inherit;
}

.setting-input:focus {
  border-bottom: 2px solid var(--whisper-primary);
}

.action-btn {
  padding: 8px 16px;
  background: var(--whisper-surface-container);
  color: var(--whisper-on-surface);
  border: 1px solid var(--whisper-outline-variant);
  border-radius: var(--whisper-radius-default);
  cursor: pointer;
  transition: all 0.2s;
  font-size: var(--whisper-fs-label-lg);
  font-family: inherit;
}

.action-btn:hover {
  background: var(--whisper-surface-container-high);
  border-color: var(--whisper-primary);
}

.steganography-btn {
  background: var(--whisper-primary);
  color: var(--whisper-on-primary);
  border: none;
  border-radius: var(--whisper-radius-full);
  font-weight: 500;
}

.steganography-btn:hover {
  opacity: 0.9;
}

.settings-actions {
  display: flex;
  gap: var(--whisper-md);
  margin-top: var(--whisper-lg);
  padding-top: var(--whisper-lg);
  border-top: 1px solid var(--whisper-outline-variant);
}

.save-btn, .reset-btn {
  padding: 10px 24px;
  border: none;
  border-radius: var(--whisper-radius-full);
  font-weight: 500;
  font-size: var(--whisper-fs-label-lg);
  cursor: pointer;
  transition: opacity 0.2s;
  font-family: inherit;
}

.save-btn {
  background: var(--whisper-primary);
  color: var(--whisper-on-primary);
}

.save-btn:hover {
  opacity: 0.9;
}

.reset-btn {
  background: transparent;
  color: var(--whisper-on-surface-variant);
  border: 1px solid var(--whisper-outline-variant);
}

.reset-btn:hover {
  background: var(--whisper-surface-container-high);
  border-color: var(--whisper-primary);
  color: var(--whisper-primary);
}
</style>