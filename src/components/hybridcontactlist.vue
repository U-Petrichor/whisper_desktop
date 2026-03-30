<template>
  <div class="hybrid-contact-list">
    <div class="list-header">
      <div class="header-left">
        <h3>联系人</h3>
        <button @click="showAddModal" class="add-contact-btn" title="添加联系人">+</button>
      </div>
      <div class="connection-stats">
        <span class="stat">
          <span class="stat-icon p2p">🔗</span>
          {{ connectionStats.p2pConnections }}
        </span>
        <span class="stat">
          <span class="stat-icon server">📡</span>
          {{ connectionStats.serverConnections }}
        </span>
      </div>
    </div>

    <!-- 搜索框 -->
    <div class="search-container">
      <input
        v-model="searchQuery"
        placeholder="搜索联系人..."
        class="search-input"
      />
    </div>

    <!-- 联系人列表 -->
    <div class="contacts-container">
      <div
        v-for="contact in filteredContacts"
        :key="contact.id"
        :class="['contact-item', { 'active': currentContact?.id === contact.id }]"
        @click="selectContact(contact)"
      >
        <div class="contact-avatar" @click.stop="showFriendProfile(contact.id)" title="查看个人信息">
          <img v-if="contact.avatar" :src="getAvatarUrl(contact.avatar)" alt="头像" class="avatar-image" />
          <div v-else class="avatar-placeholder">
            {{ contact.username && contact.username.length > 0 ? contact.username[0].toUpperCase() : '?' }}
          </div>
          <div :class="['online-indicator', { 'online': contact.online }]"></div>
        </div>

        <div class="contact-info">
          <div class="contact-header">
            <h4 class="contact-name">{{ contact.username }}</h4>
            <div class="connection-badges">
              <!-- P2P连接状态 -->
              <span 
                v-if="contact.connectionStatus.canUseP2P" 
                class="connection-badge p2p"
                title="P2P直连"
              >
                🔗
              </span>
              <!-- 服务器转发 -->
              <span 
                v-else-if="contact.online" 
                class="connection-badge server"
                title="服务器转发"
              >
                📡
              </span>
              <!-- 离线 -->
              <span 
                v-else 
                class="connection-badge offline"
                title="离线"
              >
                💤
              </span>
            </div>
          </div>

          <div class="contact-meta">
            <div class="last-message">
              <span v-if="contact.lastMessage" class="message-preview">
                {{ formatLastMessage(contact.lastMessage) }}
              </span>
              <span v-else class="no-messages">暂无消息</span>
            </div>
            
            <div class="contact-status">
              <!-- 连接方式指示 -->
              <span :class="['method-indicator', contact.connectionStatus.preferredMethod.toLowerCase()]">
                {{ getMethodText(contact.connectionStatus.preferredMethod) }}
              </span>
            </div>
          </div>

          <!-- P2P连接进度 -->
          <div 
            v-if="contact.connectionStatus.p2pStatus === 'connecting'" 
            class="connection-progress"
          >
            <div class="progress-bar">
              <div class="progress-fill"></div>
            </div>
            <span class="progress-text">建立P2P连接中...</span>
          </div>
        </div>
        
        <div class="contact-actions">
          <button 
            class="delete-btn" 
            @click.stop="deleteContact(contact.id)"
            title="删除联系人"
          >
            ×
          </button>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="filteredContacts.length === 0" class="empty-state">
        <div class="empty-icon">👥</div>
        <p>{{ searchQuery ? '未找到匹配的联系人' : '暂无联系人' }}</p>
      </div>
    </div>

    <!-- 连接统计面板 -->
    <div v-if="showStats" class="stats-panel">
      <h4>连接统计</h4>
      <div class="stats-grid">
        <div class="stat-item">
          <span class="stat-label">P2P连接</span>
          <span class="stat-value">{{ connectionStats.p2pConnections }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">服务器转发</span>
          <span class="stat-value">{{ connectionStats.serverConnections }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">P2P比例</span>
          <span class="stat-value">{{ connectionStats.p2pRatio }}%</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">总消息数</span>
          <span class="stat-value">{{ messageStats.totalSent + messageStats.totalReceived }}</span>
        </div>
      </div>
    </div>
  </div>
  
  <!-- 添加联系人模态框 -->
  <AddContactModal 
    :isVisible="showAddContactModal" 
    @close="hideAddModal" 
    @contact-added="onContactAdded"
  />
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { hybridStore } from '../store/hybrid-store.ts'
import { hybridApi } from '../api/hybrid-api.ts'
import AddContactModal from './addcontactmodal.vue'

const emit = defineEmits(['contact-selected', 'show-friend-profile']);

const searchQuery = ref('');
const showStats = ref(false);
const showAddContactModal = ref(false);

// 计算属性
const contacts = computed(() => hybridStore.contacts);

const currentContact = computed(() => hybridStore.currentContact);

const filteredContacts = computed(() => {
  if (!searchQuery.value) return contacts.value;
  
  const query = searchQuery.value.toLowerCase();
  return contacts.value.filter(contact =>
    (contact.username && contact.username.toLowerCase().includes(query)) ||
    (contact.email && contact.email.toLowerCase().includes(query))
  );
});

const connectionStats = computed(() => hybridStore.getConnectionStats());

const messageStats = computed(() => hybridStore.messageStats);

// 生命周期
onMounted(async () => {
  await loadContacts();
});

// 监听联系人列表变化，确保头像更新
watch(() => hybridStore.contacts, (newContacts, oldContacts) => {
  // 检查是否有头像变化
  if (oldContacts && newContacts) {
    newContacts.forEach(newContact => {
      const oldContact = oldContacts.find(c => c.id === newContact.id);
      if (oldContact && oldContact.avatar !== newContact.avatar) {
        console.log(`联系人 ${newContact.username} 的头像已更新:`, newContact.avatar);
        // 触发响应式更新
        nextTick();
      }
    });
  }
}, { deep: true });

// 方法
async function loadContacts() {
  try {
    const response = await hybridApi.getContacts();
    // 后端返回格式: {success: true, data: {items: [...], ...}}
    const contactsData = response.data.data.items || [];
    hybridStore.setContacts(contactsData);
    
    // 为在线且支持P2P的联系人自动建立P2P连接
    const hybridMessaging = hybridStore.getHybridMessaging();
    if (hybridMessaging) {
      contactsData.forEach(contact => {
        if (contact.online && contact.connectionStatus?.canUseP2P) {
          console.log(`[联系人加载] 为在线用户 ${contact.id} 建立P2P连接`);
          // 异步建立P2P连接，不阻塞UI
          setTimeout(async () => {
            try {
              await hybridMessaging.preConnectToUser(contact.id);
              console.log(`[联系人加载] 用户 ${contact.id} P2P连接建立成功`);
            } catch (error) {
              console.log(`[联系人加载] 用户 ${contact.id} P2P连接建立失败:`, error.message);
            }
          }, Math.random() * 1000); // 随机延迟0-1秒，避免同时建立过多连接
        }
      });
    }
  } catch (error) {
    console.error('加载联系人失败:', error);
  }
}

async function selectContact(contact) {
  hybridStore.setCurrentContact(contact);
  
  // 如果联系人在线且支持P2P，尝试建立P2P连接
  const hybridMessaging = hybridStore.getHybridMessaging();
  if (hybridMessaging && contact.online && contact.connectionStatus?.canUseP2P) {
    // 检查是否已有P2P连接
    const p2pStatus = hybridMessaging.getP2PConnectionStatus(contact.id);
    if (!p2pStatus.connected) {
      console.log(`[联系人选择] 为用户 ${contact.id} 建立P2P连接`);
      // 异步建立P2P连接
      hybridMessaging.preConnectToUser(contact.id).catch(error => {
        console.log(`[联系人选择] 用户 ${contact.id} P2P连接建立失败:`, error.message);
      });
    }
  }
  
  // 加载该联系人的消息历史
  try {
    const response = await hybridApi.getMessageHistory(contact.id);
    if (response.data && response.data.success) {
      const messages = response.data.data.items || [];
      // 将消息添加到store中
      hybridStore.setMessages(contact.id, messages);
    }
  } catch (error) {
    console.error('加载消息历史失败:', error);
  }
  
  emit('contact-selected', contact);
}

function showAddModal() {
  showAddContactModal.value = true;
}

function hideAddModal() {
  showAddContactModal.value = false;
}

function onContactAdded() {
  hideAddModal();
  loadContacts();
}

async function deleteContact(contactId) {
  if (confirm('确定要删除这个联系人吗？')) {
    try {
      await hybridApi.removeContact(contactId);
      hybridStore.removeContact(contactId);
    } catch (error) {
      console.error('删除联系人失败:', error);
      alert('删除联系人失败，请重试');
    }
  }
}

function showFriendProfile(userId) {
  emit('show-friend-profile', userId);
}

function formatLastMessage(message) {
  if (!message) return '';
  
  let content = message.content;
  if (content.length > 30) {
    content = content.substring(0, 30) + '...';
  }
  
  // 添加发送方式标识
  const methodIcon = message.method === 'P2P' ? '🔗' : '📡';
  
  return `${methodIcon} ${content}`;
}

function getMethodText(method) {
  switch (method) {
    case 'P2P':
      return 'P2P';
    case 'Server':
      return '服务器';
    default:
      return '未知';
  }
}

function toggleStats() {
  showStats.value = !showStats.value;
}

// 获取头像URL
function getAvatarUrl(avatarPath) {
  if (!avatarPath) return ''
  // 如果是绝对路径，直接返回
  if (avatarPath.startsWith('http')) {
    return avatarPath
  }
  // 如果是API相对路径（以/api开头），拼接基础URL
  if (avatarPath.startsWith('/api/')) {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
    return `${baseUrl}${avatarPath}`
  }
  // 其他相对路径，拼接API基础URL
  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
  return `${baseUrl}${avatarPath.startsWith('/') ? '' : '/'}${avatarPath}`
}

// 暴露方法
defineExpose({
  refresh: loadContacts
})
</script>

<style scoped>
.hybrid-contact-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: white;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid #eee;
  background: #f8f9fa;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.list-header h3 {
  margin: 0;
  font-size: 1.2rem;
  color: #333;
}

.add-contact-btn {
  background: #007bff;
  color: white;
  border: none;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  font-size: 1.2rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s;
}

.add-contact-btn:hover {
  background: #0056b3;
}

.connection-stats {
  display: flex;
  gap: 1rem;
  font-size: 0.875rem;
}

.stat {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.stat-icon.p2p {
  color: #28a745;
}

.stat-icon.server {
  color: #ffc107;
}

.search-container {
  padding: 1rem;
  border-bottom: 1px solid #eee;
}

.search-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid #ddd;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  outline: none;
  transition: border-color 0.2s;
}

.search-input:focus {
  border-color: #007bff;
  box-shadow: 0 0 0 0.125rem rgba(0, 123, 255, 0.25);
}

.contacts-container {
  flex: 1;
  overflow-y: auto;
}

.contact-item {
  display: flex;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
  transition: background-color 0.2s;
  position: relative;
}

.contact-item:hover {
  background: #f8f9fa;
}

.contact-item.active {
  background: #e3f2fd;
  border-left: 3px solid #007bff;
}

.contact-item:hover .contact-actions {
  opacity: 1;
}

.contact-actions {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  opacity: 0;
  transition: opacity 0.2s;
}

.delete-btn {
  background: #ff4757;
  color: white;
  border: none;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s;
}

.delete-btn:hover {
  background: #ff3742;
}

.contact-avatar {
  position: relative;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #007bff;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 1.2rem;
  margin-right: 1rem;
  flex-shrink: 0;
  overflow: hidden;
}

.contact-avatar .avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.contact-avatar .avatar-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #007bff;
  color: white;
  font-weight: bold;
  font-size: 1.2rem;
}

.online-indicator {
  position: absolute;
  bottom: 2px;
  right: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #dc3545;
  border: 2px solid white;
}

.online-indicator.online {
  background: #28a745;
}

.contact-info {
  flex: 1;
  min-width: 0;
}

.contact-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.25rem;
}

.contact-name {
  margin: 0;
  font-size: 1rem;
  font-weight: 500;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.connection-badges {
  display: flex;
  gap: 0.25rem;
}

.connection-badge {
  font-size: 1rem;
  opacity: 0.8;
}

.connection-badge.offline {
  opacity: 0.5;
}

.contact-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.875rem;
}

.last-message {
  flex: 1;
  min-width: 0;
}

.message-preview {
  color: #666;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

.no-messages {
  color: #999;
  font-style: italic;
}

.contact-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.method-indicator {
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-size: 0.625rem;
  font-weight: 500;
  text-transform: uppercase;
}

.method-indicator.p2p {
  background: #d4edda;
  color: #155724;
}

.method-indicator.server {
  background: #fff3cd;
  color: #856404;
}

.connection-progress {
  margin-top: 0.5rem;
}

.progress-bar {
  width: 100%;
  height: 2px;
  background: #e9ecef;
  border-radius: 1px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #007bff;
  width: 0;
  animation: progressAnimation 2s ease-in-out infinite;
}

@keyframes progressAnimation {
  0% {
    width: 0;
    transform: translateX(-100%);
  }
  50% {
    width: 100%;
    transform: translateX(0);
  }
  100% {
    width: 0;
    transform: translateX(100%);
  }
}

.progress-text {
  font-size: 0.75rem;
  color: #666;
  margin-top: 0.125rem;
  display: block;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  color: #666;
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}

.stats-panel {
  background: #f8f9fa;
  border-top: 1px solid #dee2e6;
  padding: 1rem;
}

.stats-panel h4 {
  margin: 0 0 1rem 0;
  font-size: 1rem;
  color: #333;
}

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  background: white;
  border-radius: 0.25rem;
  border: 1px solid #dee2e6;
}

.stat-label {
  font-size: 0.875rem;
  color: #666;
}

.stat-value {
  font-weight: 500;
  color: #333;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .list-header {
    padding: 0.75rem;
  }
  
  .connection-stats {
    font-size: 0.8rem;
  }
  
  .search-container {
    padding: 0.75rem;
  }
  
  .contact-item {
    padding: 0.75rem;
  }
  
  .contact-avatar {
    width: 40px;
    height: 40px;
    font-size: 1rem;
    margin-right: 0.75rem;
  }
  
  .stats-grid {
    grid-template-columns: 1fr;
    gap: 0.5rem;
  }
}
</style>