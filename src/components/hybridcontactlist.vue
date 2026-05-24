<template>
  <div class="hybrid-contact-list">
    <!-- 搜索栏 -->
    <div class="search-bar">
      <span class="material-symbols-outlined search-icon">search</span>
      <input
        v-model="searchQuery"
        placeholder="搜索联系人..."
        class="search-input"
      />
      <button @click="showAddModal" class="add-btn" title="添加联系人">
        <span class="material-symbols-outlined">person_add</span>
      </button>
    </div>

    <!-- 联系人列表 -->
    <div class="contacts-container">
      <div
        v-for="contact in filteredContacts"
        :key="contact.id"
        :class="['contact-item', { 'contact-item--active': currentContact?.id === contact.id }]"
        @click="selectContact(contact)"
      >
        <div class="contact-avatar" @click.stop="showFriendProfile(contact.id)" title="查看个人信息">
          <img v-if="contact.avatar" :src="getAvatarUrl(contact.avatar)" alt="头像" class="avatar-image" />
          <div v-else class="avatar-placeholder">
            {{ contact.username && contact.username.length > 0 ? contact.username[0].toUpperCase() : '?' }}
          </div>
          <div :class="['online-dot', { 'online-dot--online': contact.online }]"></div>
        </div>

        <div class="contact-info">
          <div class="contact-name">{{ contact.username }}</div>
          <div class="contact-last-message">
            <span v-if="contact.lastMessage">{{ formatLastMessage(contact.lastMessage) }}</span>
            <span v-else class="no-messages">暂无消息</span>
          </div>
        </div>

        <div class="contact-time">
          <span v-if="contact.lastMessage">{{ formatTimestamp(contact.lastMessage) }}</span>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="filteredContacts.length === 0" class="empty-state">
        <span class="material-symbols-outlined empty-icon">group_off</span>
        <p>{{ searchQuery ? '未找到匹配的联系人' : '暂无联系人' }}</p>
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
import { extractPaginatedItems } from '../utils/api-contract.ts'
import { waitForDatabase, getMessagesWithFriend } from '../client_db/database.ts'
import AddContactModal from './addcontactmodal.vue'
import { createLogger } from '../utils/logger'
const log = createLogger('HybridContactList')

const emit = defineEmits(['contact-selected', 'show-friend-profile']);

const searchQuery = ref('');
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

// 格式化时间戳
function formatTimestamp(message) {
  if (!message?.timestamp) return ''
  const date = new Date(message.timestamp)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  if (isToday) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

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
    const contactsData = extractPaginatedItems(response);
    hybridStore.setContacts(contactsData);
    
    // 为在线且支持P2P的联系人自动建立P2P连接
    const hybridMessaging = hybridStore.getHybridMessaging();
    if (hybridMessaging) {
      contactsData.forEach(contact => {
        if (contact.online && contact.connectionStatus?.canUseP2P) {
          // 异步建立P2P连接，不阻塞UI
          setTimeout(async () => {
            try {
              await hybridMessaging.preConnectToUser(contact.id);
            } catch (error) {
            }
          }, Math.random() * 1000); // 随机延迟0-1秒，避免同时建立过多连接
        }
      });
    }
  } catch (error) {
    log.error('加载联系人失败:', error);
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
      // 异步建立P2P连接
      hybridMessaging.preConnectToUser(contact.id).catch(error => {
      });
    }
  }
  
  // 加载该联系人的消息历史：SQLite 优先，服务器 fallback
  try {
    await waitForDatabase();
    const result = await getMessagesWithFriend(contact.id, { limit: 50, offset: 0 });
    if (result && Array.isArray(result.messages) && result.messages.length > 0) {
      hybridStore.setMessages(contact.id, result.messages);
    } else {
      // 本地无数据，从服务器加载
      const response = await hybridApi.getMessageHistory(contact.id);
      if (response.data) {
        const messages = extractPaginatedItems(response);
        hybridStore.setMessages(contact.id, messages);
      }
    }
  } catch (error) {
    log.error('从本地数据库加载消息历史失败:', error);
    // fallback 到服务器
    try {
      const response = await hybridApi.getMessageHistory(contact.id);
      if (response.data) {
        const messages = extractPaginatedItems(response);
        hybridStore.setMessages(contact.id, messages);
      }
    } catch (serverError) {
      log.error('从服务器加载消息历史也失败:', serverError);
    }
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

function showFriendProfile(userId) {
  emit('show-friend-profile', userId);
}

function formatLastMessage(message) {
  if (!message) return '';
  if (!message.content) return '';

  let content = message.content;
  if (content.length > 30) {
    content = content.substring(0, 30) + '...';
  }

  return content;
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
  background: var(--whisper-surface);
}

/* 搜索栏 */
.search-bar {
  display: flex;
  align-items: center;
  gap: var(--whisper-sm);
  padding: var(--whisper-md) var(--whisper-md);
  background: var(--whisper-surface-container-low);
  border-bottom: 1px solid var(--whisper-outline-variant);
}

.search-bar .search-icon {
  font-size: 20px;
  color: var(--whisper-on-surface-variant);
}

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 14px;
  line-height: 1.6;
  color: var(--whisper-on-surface);
}

.search-input::placeholder {
  color: var(--whisper-on-surface-variant);
  opacity: 0.6;
}

.add-btn {
  background: transparent;
  border: none;
  color: var(--whisper-on-surface-variant);
  cursor: pointer;
  padding: 4px;
  border-radius: var(--whisper-radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.add-btn:hover {
  background: var(--whisper-surface-container-high);
  color: var(--whisper-primary);
}

.add-btn .material-symbols-outlined {
  font-size: 22px;
}

/* 联系人列表 */
.contacts-container {
  flex: 1;
  overflow-y: auto;
}

.contact-item {
  display: flex;
  align-items: center;
  padding: var(--whisper-sm) var(--whisper-md);
  margin: 2px var(--whisper-sm);
  border-radius: var(--whisper-radius-lg);
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.contact-item:hover {
  background: var(--whisper-surface-container-high);
}

.contact-item--active {
  background: var(--whisper-surface-container-high);
}

/* 头像 */
.contact-avatar {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: var(--whisper-radius-full);
  flex-shrink: 0;
  margin-right: var(--whisper-md);
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
  background: var(--whisper-primary-fixed);
  color: var(--whisper-on-primary-fixed);
  font-weight: 500;
  font-size: 16px;
}

.online-dot {
  position: absolute;
  bottom: 1px;
  right: 1px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--whisper-outline);
  border: 2px solid var(--whisper-surface);
}

.online-dot--online {
  background: #4caf50;
}

/* 联系人信息 */
.contact-info {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.contact-name {
  font-size: 14px;
  line-height: 1.4;
  font-weight: 500;
  color: var(--whisper-on-surface);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.contact-last-message {
  font-size: 13px;
  line-height: 1.4;
  color: var(--whisper-on-surface-variant);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}

.no-messages {
  font-style: italic;
  opacity: 0.6;
}

/* 时间戳 */
.contact-time {
  font-size: 11px;
  color: var(--whisper-on-surface-variant);
  opacity: 0.7;
  flex-shrink: 0;
  margin-left: var(--whisper-sm);
  align-self: flex-start;
  margin-top: 2px;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px var(--whisper-md);
  color: var(--whisper-on-surface-variant);
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  opacity: 0.4;
  margin-bottom: var(--whisper-md);
}

.empty-state p {
  margin: 0;
  font-size: 14px;
}
</style>
