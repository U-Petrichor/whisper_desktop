<template>
  <div class="hybrid-chat-main">
    <!-- Embedded Title Bar -->
    <TitleBar variant="chat" />

    <!-- Main 3-column layout -->
    <div class="chat-layout">
      <!-- Column 1: Side Navigation -->
      <SideNavBar
        v-model="activeNavTab"
        @show-profile="showUserProfile = true"
      />

      <!-- Column 2: Contact List / Settings -->
      <div v-if="activeNavTab === 'messages' || activeNavTab === 'contacts'" class="contacts-column">
        <HybridContactList
          @contact-selected="handleContactSelected"
          @show-friend-profile="showFriendProfileInfo"
          ref="contactList"
        />
      </div>

      <div v-if="activeNavTab === 'settings'" class="settings-column">
        <div class="settings-inner">
          <div class="settings-header">
            <span class="settings-username">{{ user?.username }}</span>
            <button @click="showStatsModal = true" class="settings-action" title="统计信息">
              <span class="material-symbols-outlined">analytics</span>
            </button>
            <button @click="showFriendRequestModal = true" class="settings-action" :class="{ 'has-requests': pendingRequestsCount > 0 }" title="好友申请">
              <span class="material-symbols-outlined">person_add</span>
              <span v-if="pendingRequestsCount > 0" class="badge">{{ pendingRequestsCount }}</span>
            </button>
          </div>
          <div class="settings-actions">
            <button @click="logout" class="settings-logout">
              <span class="material-symbols-outlined">logout</span>
              <span>退出登录</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Column 3: Chat Canvas -->
      <div class="chat-canvas">
        <div v-if="selectedContact" class="chat-content">
          <HybridChatWindow
            :contact="selectedContact"
            :key="selectedContact.id"
          />
        </div>

        <!-- Empty state -->
        <div v-else class="empty-chat">
          <div class="empty-content">
            <span class="material-symbols-outlined empty-icon">chat</span>
            <h3>选择一个联系人开始聊天</h3>
          </div>
        </div>
      </div>
    </div>

    <!-- Stats modal -->
    <div v-if="showStatsModal" class="modal-overlay" @click="showStatsModal = false">
      <div class="stats-modal" @click.stop>
        <div class="modal-header">
          <h3>连接与消息统计</h3>
          <button @click="showStatsModal = false" class="close-btn">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <div class="modal-content">
          <div class="stats-section">
            <h4>连接统计</h4>
            <div class="stats-grid">
              <div class="stat-card">
                <span class="material-symbols-outlined stat-icon">link</span>
                <div class="stat-info">
                  <div class="stat-value">{{ connectionStats.p2pConnections }}</div>
                  <div class="stat-label">P2P连接</div>
                </div>
              </div>

              <div class="stat-card">
                <span class="material-symbols-outlined stat-icon">dns</span>
                <div class="stat-info">
                  <div class="stat-value">{{ connectionStats.serverConnections }}</div>
                  <div class="stat-label">服务器转发</div>
                </div>
              </div>

              <div class="stat-card">
                <span class="material-symbols-outlined stat-icon">trending_up</span>
                <div class="stat-info">
                  <div class="stat-value">{{ connectionStats.p2pRatio }}%</div>
                  <div class="stat-label">P2P比例</div>
                </div>
              </div>
            </div>
          </div>

          <div class="stats-section">
            <h4>消息统计</h4>
            <div class="message-stats">
              <div class="message-row">
                <span class="message-label">发送消息:</span>
                <div class="message-breakdown">
                  <span class="message-total">总计 {{ messageStats.totalSent }}</span>
                  <span class="message-p2p">P2P {{ messageStats.p2pSent }}</span>
                  <span class="message-server">服务器 {{ messageStats.serverSent }}</span>
                </div>
              </div>

              <div class="message-row">
                <span class="message-label">接收消息:</span>
                <div class="message-breakdown">
                  <span class="message-total">总计 {{ messageStats.totalReceived }}</span>
                  <span class="message-p2p">P2P {{ messageStats.p2pReceived }}</span>
                  <span class="message-server">服务器 {{ messageStats.serverReceived }}</span>
                </div>
              </div>
            </div>

            <div class="efficiency-chart">
              <h5>传输效率对比</h5>
              <div class="chart-bar">
                <div class="bar-label">P2P传输</div>
                <div class="bar-container">
                  <div class="bar-fill p2p" :style="{ width: p2pEfficiency + '%' }"></div>
                </div>
                <div class="bar-value">{{ p2pEfficiency }}%</div>
              </div>

              <div class="chart-bar">
                <div class="bar-label">服务器转发</div>
                <div class="bar-container">
                  <div class="bar-fill server" :style="{ width: serverEfficiency + '%' }"></div>
                </div>
                <div class="bar-value">{{ serverEfficiency }}%</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Friend request modal -->
    <FriendRequestModal
      :isVisible="showFriendRequestModal"
      @close="showFriendRequestModal = false"
      @request-handled="handleFriendRequestHandled"
    />

    <!-- Connection status notification -->
    <div v-if="connectionNotification" class="connection-notification">
      <div :class="['notification', connectionNotification.type]">
        <span class="notification-icon">{{ connectionNotification.icon }}</span>
        <span class="notification-text">{{ connectionNotification.message }}</span>
      </div>
    </div>

    <!-- Incoming call modal -->
    <div v-if="incomingCall" class="modal-overlay incoming-call-overlay">
      <div class="incoming-call-modal">
        <div class="caller-info">
          <div class="caller-avatar">
            <img v-if="incomingCall.caller.avatar" :src="incomingCall.caller.avatar" :alt="incomingCall.caller.username" />
            <div v-else class="avatar-placeholder">{{ incomingCall.caller.username[0].toUpperCase() }}</div>
          </div>
          <h3 class="caller-name">{{ incomingCall.caller.username }}</h3>
          <p class="call-type">
            {{ incomingCall.callType === 'video' ? '视频通话' : '语音通话' }}呼叫中...
          </p>
        </div>
        <div class="call-actions">
          <button @click="rejectCall" class="action-btn reject-btn">拒接</button>
          <button @click="acceptCall" class="action-btn accept-btn">接听</button>
        </div>
      </div>
    </div>

    <!-- User profile panel -->
    <UserProfile
      v-if="showUserProfile || showFriendProfile"
      :userId="friendProfileUserId"
      @close="closeProfile"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { hybridStore } from '../store/hybrid-store';
import TitleBar from '../components/TitleBar.vue';
import SideNavBar from '../components/SideNavBar.vue';
import HybridContactList from '../components/hybridcontactlist.vue';
import HybridChatWindow from '../components/hybridchatwindow.vue';
import FriendRequestModal from '../components/FriendRequestModal.vue';
import UserProfile from '../components/UserProfile.vue';
import { transitionToLoginWindow } from '../utils/window-manager';
import HybridMessaging from '../services/hybridmessaging';
import { hybridApi } from '../api/hybrid-api.ts';
import { extractPaginatedItems } from '../utils/api-contract.ts';
import { getMessagesWithFriend } from '@/client_db/database';
import { createLogger } from '@/utils/logger.ts';

const log = createLogger('HybridChatMain');

const router = useRouter();

const activeNavTab = ref('messages');
const selectedContact = ref(null);
const showStatsModal = ref(false);
const showFriendRequestModal = ref(false);
const showUserProfile = ref(false);
const showFriendProfile = ref(false);
const friendProfileUserId = ref(null);
const connectionNotification = ref(null);
const contactList = ref(null);
const messaging = ref(null);
const pendingRequestsCount = ref(0);
const incomingCall = ref(null);

// 计算属性
const user = computed(() => hybridStore.user);
const connectionStats = computed(() => hybridStore.getConnectionStats());
const messageStats = computed(() => hybridStore.messageStats);

const p2pEfficiency = computed(() => {
  const total = messageStats.value.totalSent + messageStats.value.totalReceived;
  const p2pTotal = messageStats.value.p2pSent + messageStats.value.p2pReceived;
  return total > 0 ? Math.round((p2pTotal / total) * 100) : 0;
});

const serverEfficiency = computed(() => {
  return 100 - p2pEfficiency.value;
});

// 生命周期
onMounted(async () => {
  // 首先从本地存储加载用户信息
  const loadResult = await hybridStore.loadUserFromStorage();
  
  // 等待下一个 tick 确保响应式状态已更新
  await nextTick();
  
  // 检查是否是开发模式
  const isDevMode = window.location.pathname.startsWith('/dev/');
  
  if (!isDevMode) {
    // 只在非开发模式下检查登录状态
    if (!hybridStore.isLoggedIn) {
      log.warn('用户未登录，跳转到登录页面');
      router.push('/login');
      return;
    }
  }

  // 使用重试机制确保用户信息加载
  const maxRetries = 3;
  let retryCount = 0;
  
  while (retryCount < maxRetries) {
    if (hybridStore.user && hybridStore.user.id) {
      await initializeMessaging();
      break;
    }
    
    retryCount++;
    log.warn(`用户信息未加载，重试 ${retryCount}/${maxRetries}`);
    
    if (retryCount < maxRetries) {
      // 等待一段时间后重试
      await new Promise(resolve => setTimeout(resolve, 200));
      // 重新加载用户信息
      await hybridStore.loadUserFromStorage();
      await nextTick();
    } else {
      // 最后一次重试失败，跳转到登录页面
      log.error('用户信息加载失败，跳转到登录页面');
      router.push('/login');
      return;
    }
  }
  
  // 设置连接状态监听
  setupConnectionNotifications();
  
  // 加载好友申请数量
  loadPendingRequestsCount();
});

onUnmounted(() => {
  try {
    if (messaging.value && typeof messaging.value.cleanup === 'function') {
      messaging.value.cleanup();
    }
    
    // 清理所有引用
    messaging.value = null;
    selectedContact.value = null;
    connectionNotification.value = null;
    
    // 清理定时器
    if (window.hybridChatTimers) {
      window.hybridChatTimers.forEach(timer => clearTimeout(timer));
      window.hybridChatTimers = [];
    }
  } catch (error) {
    log.error('组件卸载时出错:', error);
  }
});

// 方法
function handleIncomingCall(callInfo) {
  const caller = hybridStore.getContact(callInfo.fromUserId);
  if (caller) {
    incomingCall.value = {
      ...callInfo,
      caller: caller,
      callType: 'voice'
    };
  } else {
    log.warn(`收到未知联系人 ${callInfo.fromUserId} 的语音来电`);
    log.warn('尝试通过用户ID查找联系人失败，fromUserId类型:', typeof callInfo.fromUserId);
  }
}

function handleIncomingVideoCall(callInfo) {
  const caller = hybridStore.getContact(callInfo.fromUserId);
  if (caller) {
    incomingCall.value = {
      ...callInfo,
      caller: caller,
      callType: 'video'
    };
  } else {
    log.warn(`收到未知联系人 ${callInfo.fromUserId} 的视频来电`);
  }
}

async function acceptCall() {
  if (incomingCall.value) {
    const contactId = incomingCall.value.fromUserId;
    const callInfo = incomingCall.value;
    const callType = incomingCall.value.callType || 'voice';
    
    try {

      // 先设置通话信息到store
      hybridStore.setCurrentCall(callInfo);

      if (callType === 'video') {
        // 接听视频通话
        const result = await messaging.value.acceptVideoCall(contactId, callInfo.offer, callInfo.encryptionKey);

        // 跳转到视频通话页面
        router.push(`/video-call/${contactId}`);
      } else {
        // 接听语音通话
        const result = await messaging.value.acceptVoiceCall(contactId, callInfo.offer);

        // 跳转到语音通话页面
        router.push(`/voice-call/${contactId}`);
      }

      // 延迟清理来电状态，确保通话页面能够正确识别通话状态
      setTimeout(() => {
        incomingCall.value = null;
      }, 1000);

    } catch (error) {
      log.error('接听失败:', error);
      
      // 接听失败时清理状态
      incomingCall.value = null;
      hybridStore.clearCurrentCallInfo();
      
      // 显示错误提示
      showNotification(`接听${callType === 'video' ? '视频' : '语音'}通话失败`, 'error', '❌');
    }
  }
}

async function rejectCall() {
  if (incomingCall.value) {
    const callType = incomingCall.value.callType || 'voice';
    const contactId = incomingCall.value.fromUserId;
    
    try {
      if (callType === 'video') {
        await messaging.value.rejectVideoCall(contactId);
      } else {
        await messaging.value.rejectVoiceCall(contactId);
      }
    } catch (error) {
      log.error('拒绝通话失败:', error);
    }
    
    incomingCall.value = null;
  }
}

// 处理视频通话状态变化
function handleVideoCallStatusChange(event) {

  switch (event.type) {
    case 'call_ended_remote':
    case 'call_ended_local':
      // 清理来电状态
      if (incomingCall.value) {
        incomingCall.value = null;
      }
      // 清理当前通话信息
      hybridStore.clearCurrentCallInfo();
      break;

    case 'call_rejected':
      if (incomingCall.value) {
        incomingCall.value = null;
      }
      break;

    default:
      break;
  }
}

// 关闭个人信息面板
function closeProfile() {
  showUserProfile.value = false;
  showFriendProfile.value = false;
  friendProfileUserId.value = null;
}

// 显示好友个人信息
function showFriendProfileInfo(userId) {
      // 确保userId是字符串类型
      userId = String(userId)
  friendProfileUserId.value = userId;
  showFriendProfile.value = true;
}

// 预加载有阅后即焚消息的对话
async function preloadBurnAfterMessages() {
  if (!hybridStore.getHybridMessaging()) {
    log.warn('消息服务未就绪，无法预加载阅后即焚消息。');
    return;
  }
  
  try {
    const contacts = hybridStore.contacts;
    let totalLoadedConversations = 0;
    let totalBurnAfterMessages = 0;
    
    // 遍历所有联系人，检查是否有阅后即焚消息
    for (const contact of contacts) {
      try {
        const result = await getMessagesWithFriend(contact.id, { limit: 50, offset: 0 });
        const messages = result.messages || [];

        // 检查是否有未过期的阅后即焚消息
        const currentTime = Math.floor(Date.now() / 1000);
        const burnAfterMessages = messages.filter(msg =>
          msg.destroy_after && msg.destroy_after > currentTime
        );

        if (burnAfterMessages.length > 0) {
          hybridStore.setMessages(contact.id, messages);
          totalLoadedConversations++;
          totalBurnAfterMessages += burnAfterMessages.length;
        }
      } catch (error) {
        log.warn(`预加载联系人 ${contact.id} 的消息失败:`, error);
      }
    }
    
    if (totalLoadedConversations > 0) {
      // 确保清理定时器正在运行
      hybridStore.startBurnAfterCleanupTimer();
    } else {
    }
  } catch (error) {
    log.error('预加载阅后即焚消息失败:', error);
  }
}

// 初始化消息系统
async function initializeMessaging() {
  if (hybridStore.getHybridMessaging()) {
    return;
  }

  if (!user.value?.id) {
    log.warn('用户信息尚未加载，无法初始化消息系统。');
    return;
  }

  try {
    const hybridMessaging = new HybridMessaging();
    hybridStore.setHybridMessaging(hybridMessaging);

    // 初始化服务
    await hybridMessaging.initialize(user.value.id, hybridStore.token);


    // 预加载阅后即焚消息
    await preloadBurnAfterMessages();

  } catch (error) {
    log.error('初始化消息系统失败:', error);
    // 这里可以添加更详细的用户反馈，例如显示一个错误通知
  }
}

function setupConnectionNotifications() {
  // 监听P2P连接状态变化
  // 这里可以添加更多的连接状态监听逻辑
}

async function handleContactSelected(contact) {
  selectedContact.value = contact;
  hybridStore.setCurrentContact(contact);
  
  // 预连接功能已移除，直接选择联系人即可
  // P2P连接将在发送消息时自动建立
}

function handleUserStatusChange(userId, status) {
  hybridStore.updateOnlineStatus(userId, status === 'online');
  
  // 显示状态变化通知
  const contact = hybridStore.contacts.find(c => c.id === userId);
  if (contact) {
    const statusText = status === 'online' ? '上线' : '离线';
    showNotification(
      `${contact.username} ${statusText}`,
      status === 'online' ? 'success' : 'info',
      status === 'online' ? '🟢' : '🔴'
    );
  }
}

// 开始状态心跳
function startStatusHeartbeat() {
  // 每30秒发送一次心跳
  const heartbeatInterval = setInterval(async () => {
    try {
      await hybridApi.heartbeat();
      // 同时更新联系人在线状态
      await updateContactsOnlineStatus();
    } catch (error) {
      log.error('心跳失败:', error);
    }
  }, 30000);
  
  // 保存定时器引用以便清理
  if (!window.hybridChatTimers) {
    window.hybridChatTimers = [];
  }
  window.hybridChatTimers.push(heartbeatInterval);
}

// 更新联系人在线状态
async function updateContactsOnlineStatus() {
  try {
    const response = await hybridApi.getContactsStatus();
    if (response.data && response.data.success) {
      const statusList = response.data.data || [];
      
      statusList.forEach(statusInfo => {
        const isOnline = statusInfo.status === 'online';
        hybridStore.updateOnlineStatus(parseInt(statusInfo.userId), isOnline);
      });
    }
  } catch (error) {
    log.error('更新联系人在线状态失败:', error);
  }
}

function showNotification(message, type, icon) {
  connectionNotification.value = {
    message,
    type,
    icon
  };
  
  // 管理定时器，避免内存泄漏
  if (!window.hybridChatTimers) {
    window.hybridChatTimers = [];
  }
  
  const timer = setTimeout(() => {
    if (connectionNotification.value) {
      connectionNotification.value = null;
    }
  }, 3000);
  
  window.hybridChatTimers.push(timer);
}

async function loadPendingRequestsCount() {
  try {
    const response = await hybridApi.getFriendRequests('received');
    if (response.data && response.data.success) {
      const requests = response.data.data || [];
      pendingRequestsCount.value = requests.filter(req => req.status === 'pending').length;
    }
  } catch (error) {
    log.error('加载好友申请数量失败:', error);
  }
}

async function handleFriendRequestHandled(data) {
  // 更新好友申请数量
  loadPendingRequestsCount();
  
  // 如果同意了申请，刷新联系人列表
  if (contactList.value && contactList.value.refresh) {
    contactList.value.refresh();
  } else {
    // 直接重新加载联系人数据
    try {
      const response = await hybridApi.getContacts();
      const contactsData = extractPaginatedItems(response);
      hybridStore.setContacts(contactsData);
    } catch (error) {
      log.error('刷新联系人列表失败:', error);
    }
  }
  
  // 显示通知
  const message = data.action === 'accept' ? 
    `已同意 ${data.request.from_user_username} 的好友申请` : 
    `已拒绝 ${data.request.from_user_username} 的好友申请`;
  showNotification(message, 'success', '✅');
}

async function logout() {
  try {

    // 1. 设置用户离线状态（这会通知所有好友）
    try {
      await hybridApi.setOnlineStatus('offline');
    } catch (statusError) {
      log.warn('设置离线状态失败:', statusError);
    }
    
    // 2. 清理HybridMessaging服务
    hybridStore.cleanupHybridMessaging();
    
    // 3. 清理消息系统连接
    if (messaging.value && typeof messaging.value.cleanup === 'function') {
      await messaging.value.cleanup();
      messaging.value = null;
    }
    
    // 4. 清理组件状态
    selectedContact.value = null;
    connectionNotification.value = null;
    showStatsModal.value = false;
    showFriendRequestModal.value = false;
    
    // 5. 清理定时器
    if (window.hybridChatTimers) {
      window.hybridChatTimers.forEach(timer => {
        if (typeof timer === 'number') {
          clearInterval(timer);
          clearTimeout(timer);
        }
      });
      window.hybridChatTimers = [];
    }
    
    // 6. 调用后端退出API（如果需要）
    try {
      await hybridApi.logout();
    } catch (apiError) {
      log.warn('后端退出API调用失败:', apiError);
    }
    
    // 7. 清理单点登录资源
    try {
      const { cleanupSingleLogin } = await import('../utils/single-login');
      cleanupSingleLogin();
    } catch (error) {
      log.warn('资源清理失败:', error);
    }
    
    // 8. 清空store状态
    hybridStore.logout();

    // 9. Transition window back to login size
    try {
      await transitionToLoginWindow();
    } catch (e) {
      log.warn('窗口尺寸转换失败:', e);
    }

    // 10. 强制跳转到登录页
    await router.replace('/login');
    
    // 10. 刷新页面确保完全清理
    setTimeout(() => {
      window.location.reload();
    }, 100);
  } catch (error) {
    log.error('退出登录过程中发生错误:', error);
    // 强制清理并跳转
    hybridStore.logout();
    window.location.href = '/login';
  }
}
</script>

<style scoped>
.hybrid-chat-main {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--whisper-bg);
  color: var(--whisper-on-surface);
  overflow: hidden;
}

.chat-layout {
  flex: 1;
  display: flex;
  overflow: hidden;
  height: calc(100vh - var(--whisper-titlebar-height));
}

.contacts-column {
  width: var(--whisper-contactlist-width);
  border-right: 1px solid var(--whisper-outline-variant);
  flex-shrink: 0;
  background: var(--whisper-surface-container-lowest);
}

.settings-column {
  width: var(--whisper-contactlist-width);
  border-right: 1px solid var(--whisper-outline-variant);
  flex-shrink: 0;
  background: var(--whisper-surface-container-lowest);
}

.settings-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: var(--whisper-md);
}

.settings-header {
  display: flex;
  align-items: center;
  gap: var(--whisper-sm);
  padding-bottom: var(--whisper-md);
  border-bottom: 1px solid var(--whisper-outline-variant);
}

.settings-username {
  font-size: var(--whisper-fs-headline-sm);
  font-weight: var(--whisper-fw-headline-sm);
  color: var(--whisper-on-surface);
  flex: 1;
}

.settings-action {
  width: 36px;
  height: 36px;
  border-radius: var(--whisper-radius-full);
  border: none;
  background: transparent;
  color: var(--whisper-on-surface-variant);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: background 0.15s;
}

.settings-action:hover {
  background: var(--whisper-surface-container-high);
}

.settings-action .material-symbols-outlined {
  font-size: 20px;
}

.settings-action.has-requests {
  color: var(--whisper-primary);
}

.badge {
  position: absolute;
  top: -2px;
  right: -2px;
  min-width: 16px;
  height: 16px;
  background: var(--whisper-error);
  color: var(--whisper-on-error);
  border-radius: var(--whisper-radius-full);
  font-size: 10px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}

.settings-actions {
  margin-top: auto;
}

.settings-logout {
  display: flex;
  align-items: center;
  gap: var(--whisper-sm);
  width: 100%;
  padding: var(--whisper-sm) var(--whisper-md);
  border: none;
  background: transparent;
  color: var(--whisper-error);
  cursor: pointer;
  border-radius: var(--whisper-radius-default);
  font-size: var(--whisper-fs-body-md);
  transition: background 0.15s;
}

.settings-logout:hover {
  background: var(--whisper-error-container);
}

.settings-logout .material-symbols-outlined {
  font-size: 20px;
}

.chat-canvas {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--whisper-surface-bright);
  min-width: 0;
}

.chat-content {
  height: 100%;
}

.empty-chat {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-content {
  text-align: center;
  color: var(--whisper-on-surface-variant);
}

.empty-icon {
  font-size: 48px;
  color: var(--whisper-outline);
  margin-bottom: var(--whisper-md);
}

.empty-content h3 {
  font-size: var(--whisper-fs-headline-sm);
  font-weight: var(--whisper-fw-headline-sm);
  color: var(--whisper-on-surface-variant);
}

/* Modals */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.stats-modal {
  background: var(--whisper-surface-container-lowest);
  border-radius: var(--whisper-radius-xl);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--whisper-md) var(--whisper-lg);
  border-bottom: 1px solid var(--whisper-outline-variant);
}

.modal-header h3 {
  font-size: var(--whisper-fs-headline-sm);
  font-weight: var(--whisper-fw-headline-sm);
  color: var(--whisper-on-surface);
}

.close-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--whisper-on-surface-variant);
  padding: var(--whisper-xs);
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn .material-symbols-outlined {
  font-size: 20px;
}

.close-btn:hover {
  color: var(--whisper-on-surface);
}

.modal-content {
  padding: var(--whisper-lg);
}

.stats-section {
  margin-bottom: var(--whisper-xl);
}

.stats-section h4 {
  font-size: var(--whisper-fs-body-lg);
  font-weight: 500;
  color: var(--whisper-on-surface);
  margin-bottom: var(--whisper-md);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--whisper-md);
}

.stat-card {
  display: flex;
  align-items: center;
  gap: var(--whisper-md);
  padding: var(--whisper-md);
  border-radius: var(--whisper-radius-default);
  background: var(--whisper-surface-container);
}

.stat-icon {
  font-size: 24px;
}

.stat-value {
  font-size: var(--whisper-fs-headline-sm);
  font-weight: 500;
  color: var(--whisper-on-surface);
}

.stat-label {
  font-size: var(--whisper-fs-label-md);
  color: var(--whisper-on-surface-variant);
}

.message-stats {
  margin-bottom: var(--whisper-lg);
}

.message-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--whisper-sm);
  padding: var(--whisper-sm) var(--whisper-md);
  background: var(--whisper-surface-container);
  border-radius: var(--whisper-radius-default);
}

.message-label {
  font-weight: 500;
  color: var(--whisper-on-surface);
}

.message-breakdown {
  display: flex;
  gap: var(--whisper-md);
  font-size: var(--whisper-fs-label-md);
}

.message-total {
  font-weight: 500;
  color: var(--whisper-on-surface);
}

.message-p2p {
  color: var(--whisper-primary);
}

.message-server {
  color: var(--whisper-tertiary);
}

.efficiency-chart h5 {
  font-size: var(--whisper-fs-body-md);
  font-weight: 500;
  color: var(--whisper-on-surface);
  margin-bottom: var(--whisper-md);
}

.chart-bar {
  display: flex;
  align-items: center;
  gap: var(--whisper-md);
  margin-bottom: var(--whisper-sm);
}

.bar-label {
  width: 100px;
  font-size: var(--whisper-fs-label-md);
  color: var(--whisper-on-surface-variant);
}

.bar-container {
  flex: 1;
  height: 20px;
  background: var(--whisper-surface-container);
  border-radius: var(--whisper-radius-full);
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: var(--whisper-radius-full);
  transition: width 0.3s ease;
}

.bar-fill.p2p {
  background: var(--whisper-primary);
}

.bar-fill.server {
  background: var(--whisper-tertiary);
}

.bar-value {
  width: 50px;
  text-align: right;
  font-size: var(--whisper-fs-label-md);
  font-weight: 500;
  color: var(--whisper-on-surface);
}

/* Notification */
.connection-notification {
  position: fixed;
  top: var(--whisper-md);
  right: var(--whisper-md);
  z-index: 1001;
}

.notification {
  display: flex;
  align-items: center;
  gap: var(--whisper-sm);
  padding: var(--whisper-sm) var(--whisper-md);
  border-radius: var(--whisper-radius-md);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  font-size: var(--whisper-fs-body-md);
  font-weight: 500;
  animation: slideIn 0.3s ease-out;
}

.notification.success {
  background: var(--whisper-primary-fixed);
  color: var(--whisper-on-primary-fixed);
}

.notification.info {
  background: var(--whisper-surface-container-high);
  color: var(--whisper-on-surface);
}

.notification.error {
  background: var(--whisper-error-container);
  color: var(--whisper-on-error-container);
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

/* Incoming call */
.modal-overlay.incoming-call-overlay {
  background: rgba(0, 0, 0, 0.4);
  z-index: 1001;
}

.incoming-call-modal {
  background: var(--whisper-inverse-surface);
  color: var(--whisper-inverse-on-surface);
  border-radius: var(--whisper-radius-xl);
  padding: var(--whisper-xl);
  width: 320px;
  text-align: center;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  animation: fadeIn 0.3s ease-out;
}

.caller-info {
  margin-bottom: var(--whisper-xl);
}

.caller-avatar {
  width: 80px;
  height: 80px;
  border-radius: var(--whisper-radius-full);
  margin: 0 auto var(--whisper-lg);
  overflow: hidden;
  background: var(--whisper-primary-container);
  display: flex;
  justify-content: center;
  align-items: center;
}

.caller-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  font-size: 32px;
  color: var(--whisper-on-primary-container);
  font-weight: 500;
}

.caller-name {
  font-size: var(--whisper-fs-headline-md);
  font-weight: 500;
  color: var(--whisper-inverse-on-surface);
}

.call-type {
  font-size: var(--whisper-fs-body-md);
  color: var(--whisper-inverse-on-surface);
  opacity: 0.7;
  margin-top: var(--whisper-xs);
}

.call-actions {
  display: flex;
  justify-content: space-around;
}

.action-btn {
  width: 60px;
  height: 60px;
  border-radius: var(--whisper-radius-full);
  border: none;
  cursor: pointer;
  color: white;
  font-size: var(--whisper-fs-body-md);
  display: flex;
  justify-content: center;
  align-items: center;
  transition: all 0.2s ease;
}

.reject-btn {
  background: var(--whisper-error);
}

.reject-btn:hover {
  opacity: 0.9;
  transform: translateY(-2px);
}

.accept-btn {
  background: var(--whisper-primary);
}

.accept-btn:hover {
  opacity: 0.9;
  transform: translateY(-2px);
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
