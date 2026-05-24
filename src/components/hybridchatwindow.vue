<template>
  <div class="hybrid-chat-window">
    <div class="chat-header">
      <div v-if="contact" class="contact-info">
        <div class="contact-avatar">
          <img v-if="contact.avatar" :src="getAvatarUrl(contact.avatar)" :alt="contact.username" class="avatar-image" />
          <div v-else class="avatar-placeholder">
            {{ contact.username[0].toUpperCase() }}
          </div>
        </div>
        
        <div class="contact-details">
          <h3>{{ contact.username }}</h3>
          <div class="connection-info">
            <span :class="['status-indicator', { online: contact.online }]"></span>
            <span class="status-text">
              {{ contact.online ? '在线' : '离线' }}
            </span>
            <span v-if="contact.online" class="connection-method">
              {{ getConnectionMethod() }}
            </span>
          </div>
        </div>
      </div>
      
      <!-- 功能按钮 -->
      <div v-if="contact" class="action-buttons">
        <button @click="showHistoryModal" class="action-btn" title="查看历史记录">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 8v4l3 3"/>
            <circle cx="12" cy="12" r="9"/>
          </svg>
        </button>
        <button @click="showCallTypeSelector" :disabled="!contact.online" class="action-btn" title="发起通话">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0118 6.92z"/>
          </svg>
        </button>
        <button @click="resetVoiceCallState" class="action-btn" title="重置通话状态">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 4v6h6"/>
            <path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
          </svg>
        </button>
      </div>
      
      <div v-else class="no-contact">
        <p>请选择一个联系人开始聊天</p>
      </div>
    </div>

    <div v-if="contact" class="messages-container" ref="messagesContainer">
      <div
        v-for="message in messages"
        :key="message.id"
        :class="['message', parseInt(message.from) === parseInt(currentUser.id) ? 'sent' : 'received']"
      >
        <div class="message-content">
          <!-- 文本消息 -->
          <div v-if="!message.messageType || message.messageType === 'text'" class="message-text">{{ message.content }}</div>
          
          <!-- 语音通话记录 -->
          <div v-else-if="message.messageType === 'voice_call'" class="message-voice-call">
            <div class="voice-call-content">
              <div class="voice-call-icon">
                <span v-if="message.callStatus === 'completed'" class="call-icon completed">📞</span>
                <span v-else-if="message.callStatus === 'rejected'" class="call-icon rejected">📵</span>
                <span v-else class="call-icon missed">📞</span>
              </div>
              <div class="voice-call-info">
                <div class="call-status">
                  <span v-if="message.callStatus === 'completed'">语音通话</span>
                  <span v-else-if="message.callStatus === 'rejected'">通话被拒绝</span>
                  <span v-else>未接通话</span>
                </div>
                <div v-if="message.callDuration && message.callStatus === 'completed'" class="call-duration">
                  通话时长：{{ formatCallDuration(message.callDuration) }}
                </div>
              </div>
            </div>
          </div>
          
          <!-- 文件消息（messageType为file） -->
          <div v-else-if="message.messageType === 'file'" class="message-file">
            <div class="file-content">
              <div class="file-icon">
                <span class="icon">📄</span>
              </div>
              <div class="file-info">
                <div class="file-name">{{ message.fileName || message.file_name || (message.file && message.file.name) || '未知文件' }}</div>
                <!-- 调试信息 -->
                <div v-if="debugMode" class="debug-info">
                  <small class="debug-small">
                    filePath: {{ message.filePath || message.file_path || 'null' }}<br>
                    fileName: {{ message.fileName || message.file_name || 'null' }}<br>
                    messageType: {{ message.messageType || 'null' }}
                  </small>
                </div>
              </div>
              <div class="file-actions">
                <button @click="downloadFile(message)" class="download-btn">下载</button>
              </div>
            </div>
          </div>

          <!-- 文件消息（type为file） -->
          <div v-if="message.type === 'file'" class="message-file">
            <div class="file-icon-container">
              <i class="fas fa-file-alt file-icon"></i>
            </div>
            <div class="file-info">
              <div class="file-name">{{ (message.file && message.file.name) || message.fileName || message.file_name || '未知文件' }}</div>
              <!-- 调试信息 -->
              <div v-if="debugMode" class="debug-info">
                <small class="debug-small">
                  filePath: {{ message.filePath || message.file_path || 'null' }}<br>
                  fileName: {{ message.fileName || message.file_name || 'null' }}<br>
                  type: {{ message.type || 'null' }}
                </small>
              </div>
            </div>
            <button @click="downloadFile(message)" class="download-btn">
              <i class="fas fa-download"></i>
            </button>
          </div>

          <!-- 图片消息 -->
          <div v-if="message.messageType === 'image'" class="message-image">
            <div class="image-container" :class="{ 'has-hidden-message': message.hiddenMessage }">
              <img 
                v-if="message.filePath && message.messageType === 'image'" 
                :src="getImageUrl(message.filePath)" 
                :alt="message.fileName || '图片'"
                class="image-content"
                @error="handleImageError"
                @contextmenu="handleImageRightClick(message, $event)"
                @click="openImageModal(message)"
              />
              <div v-else class="image-placeholder">
                <span class="image-icon">📷</span>
                <span class="image-text">{{ message.content }}</span>
              </div>
              
              <!-- 图片文件信息 -->
              <div v-if="message.fileName || message.file_name || message.fileSize || message.file_size" class="image-file-info">
                <div class="image-file-name">{{ message.fileName || message.file_name || '图片' }}</div>
                <div v-if="message.fileSize || message.file_size" class="image-file-size">{{ formatFileSize(message.fileSize || message.file_size) }}</div>
              </div>
              
              <!-- 隐写术提示 -->
              <div v-if="message.hiddenMessage && !message.extractedText" class="steganography-hint">
                <span class="hint-icon">🔐</span>
                <span class="hint-text">此图片包含隐藏信息</span>
              </div>
              
              <!-- 显示提取的隐藏信息 -->
              <div v-if="message.extractedText && !message.decryptHidden" 
                   :class="[
                     'extracted-message',
                     {
                       'extracted-error': message.extractedText.includes('此消息无加密内容') || message.extractedText.includes('解密失败')
                     }
                   ]">
                <div class="extracted-header">
                  <span class="extracted-icon">📝</span>
                  <span class="extracted-label">隐藏信息：</span>
                </div>
                <div class="extracted-content">{{ message.extractedText }}</div>
              </div>
            </div>
          </div>
          
          <div class="message-info">
            <span class="message-time">{{ formatTime(message.timestamp) }}</span>
            <span v-if="message.method" class="message-method">
              {{ message.method === 'P2P' ? 'P2P' : '服务器' }}
            </span>
            <span v-if="message.sending" class="sending-indicator">发送中...</span>
            <!-- 阅后即焚倒计时 -->
            <span v-if="message.destroy_after && getBurnAfterCountdown(message.destroy_after) > 0" class="burn-after-countdown">
              🔥 {{ formatBurnAfterTime(getBurnAfterCountdown(message.destroy_after)) }}
            </span>
            <span v-else-if="message.destroy_after && getBurnAfterCountdown(message.destroy_after) <= 0" class="burn-after-expired">
              🔥 已焚毁
            </span>
          </div>
        </div>
      </div>
      
      <div v-if="messages.length === 0" class="empty-messages">
        <div class="empty-icon">💬</div>
        <p>开始你们的第一次对话吧</p>
      </div>
    </div>

    <div v-if="contact" class="message-input-area">
      <HybridMessageInput
        :contact="contact"
        :connectionStatus="getConnectionStatus()"
        @send="(messageData, callback) => handleMessageSent(messageData, callback)"
      />
    </div>

    <!-- 历史记录模态框 -->
    <div v-if="showHistory" class="history-modal-overlay" @click="closeHistoryModal">
      <div class="history-modal" @click.stop>
        <div class="history-header">
          <h3>与 {{ contact?.username }} 的聊天历史</h3>
          <button @click="closeHistoryModal" class="close-btn">×</button>
        </div>
        
        <!-- 搜索框 -->
        <div class="search-container">
          <input 
            type="text" 
            v-model="searchQuery" 
            placeholder="搜索消息内容..." 
            class="search-input"
          />
          <button 
            v-if="searchQuery" 
            @click="clearSearch" 
            class="clear-search-btn"
            title="清除搜索"
          >
            ×
          </button>
        </div>
        
        <div class="history-content">
          <div v-if="loadingHistory" class="loading">
            <div class="loading-spinner"></div>
            <p>正在加载历史记录...</p>
          </div>
          
          <div v-else-if="filteredHistoryMessages.length === 0 && !searchQuery" class="no-history">
            <p>暂无历史记录</p>
          </div>
          
          <div v-else-if="filteredHistoryMessages.length === 0 && searchQuery" class="no-search-results">
            <p>未找到包含 "{{ searchQuery }}" 的消息</p>
          </div>
          
          <div 
            v-else 
            ref="historyContainer"
            @scroll="handleHistoryScroll"
            class="history-messages"
          >
            <div v-if="loadingHistory && historyMessages.length > 0" class="loading-more">
              <p>加载更多消息...</p>
            </div>
            <div
              v-for="message in filteredHistoryMessages"
              :key="message.id"
              :class="['history-message', parseInt(message.from) === parseInt(currentUser.id) ? 'sent' : 'received']"
            >
              <div class="message-content">
                <!-- 文本消息 -->
                <div v-if="!message.messageType || message.messageType === 'text'" class="message-text">{{ message.content }}</div>
                
                <!-- 语音通话记录 -->
                <div v-else-if="message.messageType === 'voice_call'" class="message-voice-call">
                  <div class="voice-call-content">
                    <div class="voice-call-icon">
                      <span v-if="message.callStatus === 'completed'" class="call-icon completed">📞</span>
                      <span v-else-if="message.callStatus === 'rejected'" class="call-icon rejected">📵</span>
                      <span v-else class="call-icon missed">📞</span>
                    </div>
                    <div class="voice-call-info">
                      <div class="call-status">
                        <span v-if="message.callStatus === 'completed'">语音通话</span>
                        <span v-else-if="message.callStatus === 'rejected'">通话被拒绝</span>
                        <span v-else>未接通话</span>
                      </div>
                      <div v-if="message.callDuration && message.callStatus === 'completed'" class="call-duration">
                        通话时长：{{ formatCallDuration(message.callDuration) }}
                      </div>
                    </div>
                  </div>
                </div>
                
                <!-- 图片消息 -->
                <div v-else-if="message.messageType === 'image'" class="message-image">
                  <img 
                    v-if="message.filePath && message.messageType === 'image'" 
                    :src="getImageUrl(message.filePath)" 
                    :alt="message.fileName || '图片'"
                    class="image-content"
                    @error="handleImageError"
                    @click="openImageModal(message)"
                  />
                  <div v-else class="image-placeholder">
                    <span class="image-icon">📷</span>
                    <span class="image-text">{{ message.content }}</span>
                  </div>
                  
                  <!-- 图片文件信息 -->
                  <div v-if="message.fileName || message.file_name || message.fileSize || message.file_size" class="image-file-info">
                    <div class="image-file-name">{{ message.fileName || message.file_name || '图片' }}</div>
                    <div v-if="message.fileSize || message.file_size" class="image-file-size">{{ formatFileSize(message.fileSize || message.file_size) }}</div>
                  </div>
                </div>
                
                <div class="message-info">
                  <span class="message-time">{{ formatTime(message.timestamp) }}</span>
                  <span v-if="message.method" class="message-method">
                    {{ message.method === 'P2P' ? 'P2P' : '服务器' }}
                  </span>
                  <!-- 阅后即焚倒计时 -->
                  <span v-if="message.destroy_after && getBurnAfterCountdown(message.destroy_after) > 0" class="burn-after-countdown">
                    🔥 {{ formatBurnAfterTime(getBurnAfterCountdown(message.destroy_after)) }}
                  </span>
                  <span v-else-if="message.destroy_after && getBurnAfterCountdown(message.destroy_after) <= 0" class="burn-after-expired">
                    🔥 已焚毁
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          <div class="history-status">
            <span class="status-info">
              已显示 {{ filteredHistoryMessages.length }} / {{ historyPagination.totalCount }} 条消息
              <span v-if="historyPagination.hasMore && !searchQuery">
                · 上滑加载更多
              </span>
              <span v-if="searchQuery">
                · 搜索结果
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 解密提示框 -->
    <div 
      v-if="showDecryptTooltip" 
      class="decrypt-tooltip"
      :style="{
        left: tooltipPosition.x + 'px',
        top: (tooltipPosition.y - 60) + 'px'
      }"
      @click.stop
    >
      <div class="tooltip-content">
        <span class="tooltip-text">尝试进行解密</span>
        <div class="tooltip-buttons">
          <button @click="handleDecryptClick" class="decrypt-btn">解密</button>
          <button @click="handleDecryptCancel" class="cancel-btn">取消</button>
        </div>
      </div>
    </div>

    <!-- 图片右键菜单 -->
    <div 
      v-if="showImageContextMenu" 
      class="image-context-menu"
      :style="{
        left: tooltipPosition.x + 'px',
        top: tooltipPosition.y + 'px'
      }"
      @click.stop
    >
      <div class="context-menu-content">
        <button @click="handleViewLargeImage" class="menu-item">
          <i class="icon-view"></i>
          查看大图
        </button>
        <button @click="handleCopyImage" class="menu-item">
          <i class="icon-copy"></i>
          复制图片
        </button>
        <button @click="handleSaveImage" class="menu-item">
          <i class="icon-save"></i>
          保存图片
        </button>
        <button @click="handleDecryptImage" class="menu-item">
          <i class="icon-decrypt"></i>
          图片解密
        </button>
        <button 
          v-if="currentLongPressMessage && currentLongPressMessage.extractedText && !currentLongPressMessage.extractedText.includes('解密失败') && !currentLongPressMessage.extractedText.includes('此消息无加密内容') && !currentLongPressMessage.decryptHidden"
          @click="handleHideDecryptResult" 
          class="menu-item"
        >
          <i class="icon-hide"></i>
          收回解密
        </button>
      </div>
    </div>

    <!-- 图片放大模态框 -->
    <div v-if="showImageModal" class="image-modal-overlay" @click="closeImageModal">
      <div class="image-modal" @click.stop>
        <div class="image-modal-header">
          <h3>{{ currentImageMessage?.fileName || '图片' }}</h3>
          <button @click="closeImageModal" class="close-btn">×</button>
        </div>
        <div class="image-modal-content">
          <img 
            v-if="currentImageMessage?.filePath" 
            :src="getImageUrl(currentImageMessage.filePath)" 
            :alt="currentImageMessage.fileName || '图片'"
            class="modal-image"
            @error="handleImageError"
          />
          <div v-if="currentImageMessage?.hiddenMessage" class="modal-steganography-hint">
            <span class="hint-icon">🔐</span>
            <span class="hint-text">此图片包含隐藏信息</span>
          </div>
          <div v-if="currentImageMessage?.extractedText && !currentImageMessage?.decryptHidden" class="modal-extracted-message">
            <div class="extracted-header">
              <span class="extracted-icon">📝</span>
              <span class="extracted-label">隐藏信息：</span>
            </div>
            <div class="extracted-content">{{ currentImageMessage.extractedText }}</div>
          </div>
        </div>
        <div class="image-modal-footer">
          <div class="image-info">
            <span class="image-time">{{ formatTime(currentImageMessage?.timestamp) }}</span>
            <span v-if="currentImageMessage?.fileName || currentImageMessage?.file_name" class="image-name">
              {{ currentImageMessage.fileName || currentImageMessage.file_name }}
            </span>
            <span v-if="currentImageMessage?.fileSize || currentImageMessage?.file_size" class="image-size">
              {{ formatFileSize(currentImageMessage.fileSize || currentImageMessage.file_size) }}
            </span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 通话类型选择器 -->
    <CallTypeSelector 
      :show="showCallSelector" 
      :contact="contact"
      @close="closeCallTypeSelector"
      @call-selected="handleCallTypeSelected"
    />
    
    <!-- Toast提示组件 -->
    <div v-if="showToast" class="toast-container" @click="hideToast">
      <div class="toast" :class="toastType">
        <div class="toast-icon">
          <svg v-if="toastType === 'success'" width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M16.667 5L7.5 14.167L3.333 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <svg v-else width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 6v4M10 14h.01M19 10a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <span class="toast-message">{{ toastMessage }}</span>
        <button class="toast-close" @click.stop="hideToast">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { hybridStore } from '../store/hybrid-store';
import { createLogger } from '@/utils/logger.ts';
const log = createLogger('HybridChatWindow');
import { getMessagesWithFriend, waitForDatabase } from '@/client_db/database';
import localMessageService from '@/services/localMessageService.ts';
import { hybridApi } from '@/api/hybrid-api';
import HybridMessageInput from './hybridmessageinput.vue';
import CallTypeSelector from './CallTypeSelector.vue';
import { getChinaTimeISO, formatTimestamp as formatChinaTimestamp, generateTempMessageId } from '../utils/timeUtils';

const router = useRouter();

const messagesContainer = ref(null);

// 调试模式（可以通过控制台切换）
const debugMode = ref(false);

// 历史记录相关状态
const showHistory = ref(false);
const loadingHistory = ref(false);
const historyMessages = ref([]);
const filteredHistoryMessages = ref([]);
const searchQuery = ref('');
const historyContainer = ref(null);
const historyPagination = ref({
  offset: 0,
  limit: 50,
  totalCount: 0,
  hasMore: true
});

// 解密提示框相关状态
const showDecryptTooltip = ref(false);
const currentLongPressMessage = ref(null);
const tooltipPosition = ref({ x: 0, y: 0 });

// 图片右键菜单相关状态
const showImageContextMenu = ref(false);

// 图片放大模态框相关状态
const showImageModal = ref(false);
const currentImageMessage = ref(null);

// 阅后即焚倒计时更新变量
const burnAfterUpdateTrigger = ref(0);

// 通话类型选择器相关状态
const showCallSelector = ref(false);

// Toast提示相关状态
const showToast = ref(false);
const toastMessage = ref('');
const toastType = ref('success'); // 'success' | 'error'
let toastTimer = null;

const contact = computed(() => hybridStore.currentContact);
const currentUser = computed(() => hybridStore.user);

const messages = computed(() => {
  if (!contact.value) return [];
  const msgs = hybridStore.getMessages(contact.value.id);
  
  // 调试模式下输出详细的消息信息
  if (debugMode.value && msgs.length > 0) {
    msgs.forEach((msg, index) => {
      if (msg.messageType === 'file' || msg.type === 'file') {
      }
    });
  }
  
  return msgs;
});

function getConnectionStatus() {
  if (!contact.value) {
    return {
      preferredMethod: 'Server',
      p2pStatus: 'disconnected',
      isOnline: false,
      supportsP2P: false
    };
  }
  
  const p2pStatus = hybridStore.getP2PStatus(contact.value.id);
  const isOnline = hybridStore.isUserOnline(contact.value.id);
  
  return {
    preferredMethod: p2pStatus === 'connected' ? 'P2P' : 'Server',
    p2pStatus: p2pStatus,
    isOnline: isOnline,
    supportsP2P: isOnline
  };
}

// 监听联系人变化，加载历史消息并滚动到底部
watch(() => contact.value, async (newContact, oldContact) => {
  if (newContact && (!oldContact || newContact.id !== oldContact.id)) {
    // 当联系人变化时，加载历史消息
    await loadHistoryMessages(newContact.id);
    // 滚动到底部
    scrollToBottom();
    // 启动阅后即焚计时器
    startBurnAfterTimer();
  }
}, { deep: true });

// 监听联系人头像变化，确保头像实时更新
watch(() => contact.value?.avatar, (newAvatar, oldAvatar) => {
  if (newAvatar !== oldAvatar) {
    // 触发响应式更新
    nextTick();
  }
}, { deep: true });

// 监听消息变化，滚动到底部
watch(messages, async () => {
  await nextTick();
  scrollToBottom();
}, { deep: true });

onMounted(async () => {
  // The watch effect above is sufficient to load messages when a contact is selected.
  // Calling it here creates a race condition with database initialization.
  // We only need to ensure the view scrolls down if messages are already present.
  scrollToBottom();
  
  // 启动阅后即焚倒计时
  startBurnAfterTimer();
});

onUnmounted(() => {
  // 清理定时器
  stopBurnAfterTimer();
});

async function loadHistoryMessages(friendId) {
  if (!currentUser.value) return;
  // 清空内存中的消息，避免与 DB 加载的数据合并时产生重复
  hybridStore.setMessages(friendId, []);
  try {
    await waitForDatabase();
    const result = await getMessagesWithFriend(friendId, { limit: 50, offset: 0 });
    if (result && Array.isArray(result.messages)) {
      hybridStore.setMessages(friendId, result.messages);

      // 检查是否有阅后即焚消息，如果有则重新启动清理定时器
      const hasDestroyAfterMessages = result.messages.some(msg => msg.destroy_after && msg.destroy_after > Math.floor(Date.now() / 1000));
      if (hasDestroyAfterMessages) {
        hybridStore.startBurnAfterCleanupTimer();
      }
    } else {
       log.warn('getMessagesWithFriend did not return a valid result object');
       hybridStore.setMessages(friendId, []); // Set empty array to avoid errors
    }
  } catch (error) {
    log.error('从本地数据库加载历史消息失败:', error);
    // 如果本地数据库加载失败，尝试从服务器加载
    try {
      const response = await hybridApi.getMessageHistory(friendId);
      if (response.data && response.data.messages) {
        const messages = response.data.messages || [];
        hybridStore.setMessages(friendId, messages);
        
        // 检查是否有阅后即焚消息，如果有则重新启动清理定时器
        const hasDestroyAfterMessages = messages.some(msg => msg.destroy_after && msg.destroy_after > Math.floor(Date.now() / 1000));
        if (hasDestroyAfterMessages) {
          hybridStore.startBurnAfterCleanupTimer();
        }
      }
    } catch (serverError) {
      log.error('从服务器加载历史消息也失败:', serverError);
    }
  }
}

function getConnectionMethod() {
  if (!contact.value?.online) return '';
  
  const p2pStatus = hybridStore.getP2PStatus(contact.value.id);
  return p2pStatus === 'connected' ? '(P2P直连)' : '(服务器转发)';
}

function formatTime(timestamp) {
  return formatChinaTimestamp(timestamp);
}

function formatCallDuration(seconds) {
  if (!seconds || seconds < 0) {
    return '0秒';
  }
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  
  if (hours > 0) {
    return `${hours}小时${minutes}分钟${remainingSeconds}秒`;
  } else if (minutes > 0) {
    return `${minutes}分钟${remainingSeconds}秒`;
  } else {
    return `${remainingSeconds}秒`;
  }
}

function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  }
}

// 阅后即焚相关函数
function getBurnAfterCountdown(destroyAfter) {
  if (!destroyAfter) return 0;
  // 使用触发器来确保响应式更新
  burnAfterUpdateTrigger.value;
  const currentTime = Math.floor(Date.now() / 1000);
  return destroyAfter - currentTime;
}

function formatBurnAfterTime(seconds) {
  if (seconds <= 0) return '已过期';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  
  if (hours > 0) {
    return `${hours}时${minutes}分${remainingSeconds}秒`;
  } else if (minutes > 0) {
    return `${minutes}分${remainingSeconds}秒`;
  } else {
    return `${remainingSeconds}秒`;
  }
}

// 定时器用于更新倒计时
const burnAfterTimer = ref(null);

// 启动阅后即焚倒计时更新
function startBurnAfterTimer() {
  if (burnAfterTimer.value) {
    clearInterval(burnAfterTimer.value);
  }
  
  burnAfterTimer.value = setInterval(() => {
    // 强制更新组件以刷新倒计时显示
    // 通过修改响应式变量来触发重新渲染
    const currentTime = Date.now();
    // 检查是否有阅后即焚消息需要更新
    const allMessages = hybridStore.getMessages(contact.value?.id);
    if (allMessages && allMessages.some(msg => msg.destroy_after && msg.destroy_after > Math.floor(currentTime / 1000))) {
      // 更新触发器来强制重新计算倒计时
      burnAfterUpdateTrigger.value++;
    }
  }, 1000);
}

// 停止倒计时定时器
function stopBurnAfterTimer() {
  if (burnAfterTimer.value) {
    clearInterval(burnAfterTimer.value);
    burnAfterTimer.value = null;
  }
}



async function handleMessageSent(messageData, callback) {
  // 在函数开始就定义tempMessage，确保在所有块中都能访问
  let tempMessage = null;

  // 根据连接状态决定发送方式
  const connectionStatus = getConnectionStatus();

  // 创建临时消息对象用于立即显示
  tempMessage = {
    id: generateTempMessageId(),
    from: currentUser.value.id,
    to: contact.value.id,
    content: messageData.content,
    timestamp: getChinaTimeISO(),
    method: 'Server',
    encrypted: false,
    sending: true
  };
  
  try {
    
    // 处理文件消息
    if (messageData.type === 'file') {
      const result = await handleFileSent(messageData);
      if (callback) callback(result);
      return result;
    }

    // 处理图片消息
    if (messageData.type === 'image') {
      const result = await handleImageSent(messageData);
      if (callback) callback(result);
      return result;
    }
    
    // 处理隐写术消息
    if (messageData.type === 'steganography') {
      const result = await handleSteganographySent(messageData);
      if (callback) callback(result);
      return result;
    }
    
    // 使用HybridMessaging服务发送消息
    const hybridMessaging = hybridStore.getHybridMessaging();
    if (!hybridMessaging) {
      throw new Error('消息服务未初始化');
    }
    
    // 处理阅后即焚时间
    let destroyAfter = null;
    if (messageData.burnAfter && messageData.burnAfter > 0) {
      // 计算过期时间戳（当前时间 + burnAfter秒）
      destroyAfter = Math.floor(Date.now() / 1000) + messageData.burnAfter;
    }
    
    // 先创建本地消息对象（立即显示）
    tempMessage = {
      id: generateTempMessageId(),
      from: currentUser.value.id,
      to: contact.value.id,
      content: messageData.content,
      timestamp: getChinaTimeISO(),
      method: 'Server',
      encrypted: false,
      sending: true,
      destroy_after: destroyAfter
    };
    
    // 立即添加到本地显示
    hybridStore.addMessage(contact.value.id, tempMessage);
    
    // 滚动到底部
    await nextTick();
    scrollToBottom();
    
    // 发送消息到服务器
    const options = {};
    if (messageData.burnAfter && messageData.burnAfter > 0) {
      options.burnAfter = messageData.burnAfter;
    }
    const result = await hybridMessaging.sendMessage(contact.value.id, messageData.content, options);
    
    if (result.success) {
      // 更新消息状态
      const finalMessage = {
        ...tempMessage,
        id: result.id || tempMessage.id,
        method: result.method || 'Server',
        timestamp: result.timestamp || tempMessage.timestamp,
        sending: false,
        destroy_after: destroyAfter
      };
      
      // 更新store中的消息
      const messages = hybridStore.getMessages(contact.value.id);
      const messageIndex = messages.findIndex(m => m.id === tempMessage.id);
      if (messageIndex !== -1) {
        messages[messageIndex] = finalMessage;
      }
      
      // 注意：消息存储到数据库由HybridMessaging服务自动处理，这里不需要重复存储
      
      const successResult = { success: true, method: finalMessage.method };
      if (callback) callback(successResult);
      return successResult;
    } else {
      // 发送失败，移除临时消息
      const messages = hybridStore.getMessages(contact.value.id);
      const messageIndex = messages.findIndex(m => m.id === tempMessage.id);
      if (messageIndex !== -1) {
        messages.splice(messageIndex, 1);
      }
      log.error('发送消息失败:', result.error || '发送失败');
      const errorResult = { success: false, error: result.error || '发送失败' };
      if (callback) callback(errorResult);
      return errorResult;
    }
  } catch (error) {
    log.error('发送消息失败:', error);
    // 发送失败，移除临时消息（如果存在）
    if (tempMessage) {
      const messages = hybridStore.getMessages(contact.value.id);
      const messageIndex = messages.findIndex(m => m.id === tempMessage.id);
      if (messageIndex !== -1) {
        messages.splice(messageIndex, 1);
      }
    }
    const errorResult = { success: false, error: error.message };
    if (callback) callback(errorResult);
    return errorResult;
  }
}

async function handleFileSent(messageData) {
  const tempMessage = {
    id: generateTempMessageId(),
    from: currentUser.value.id,
    to: contact.value.id,
    content: `[文件: ${messageData.fileName}]`,
    messageType: 'file',
    fileName: messageData.fileName,
    fileSize: messageData.fileSize,
    timestamp: getChinaTimeISO(),
    method: 'Server',
    sending: true
  };

  try {
    hybridStore.addMessage(contact.value.id, tempMessage);
    await nextTick();
    scrollToBottom();

    const response = await hybridApi.uploadFile(messageData.file);
    const result = response.data;

    if (result && result.id) {
      const finalMessage = {
        ...tempMessage,
        id: result.id,
        content: result.content,
        filePath: result.filePath,
        fileName: result.fileName,
        fileSize: result.fileSize,
        messageType: result.messageType,
        timestamp: result.timestamp,
        sending: false
      };

      const messages = hybridStore.getMessages(contact.value.id);
      const messageIndex = messages.findIndex(m => m.id === tempMessage.id);
      if (messageIndex !== -1) {
        messages[messageIndex] = finalMessage;
      }

      try {
        await localMessageService.sendMessage(finalMessage);
      } catch (dbError) {
        log.warn('保存文件消息到本地数据库失败:', dbError);
      }

      return { success: true, method: finalMessage.method };
    } else {
      const messages = hybridStore.getMessages(contact.value.id);
      const messageIndex = messages.findIndex(m => m.id === tempMessage.id);
      if (messageIndex !== -1) {
        messages.splice(messageIndex, 1);
      }
      return { success: false, error: '发送失败：响应格式不正确' };
    }
  } catch (error) {
    const messages = hybridStore.getMessages(contact.value.id);
    const messageIndex = messages.findIndex(m => m.id === tempMessage.id);
    if (messageIndex !== -1) {
      messages.splice(messageIndex, 1);
    }
    return { success: false, error: error.message };
  }
}

async function handleImageSent(messageData) {
  // 在函数开始就定义tempMessage，确保在所有块中都能访问
  const tempMessage = {
    id: generateTempMessageId(),
    from: currentUser.value.id,
    to: contact.value.id,
    content: messageData.hiddenMessage ? 
      `[隐写图片: ${messageData.originalText || '包含隐藏信息'}]` : 
      `[图片: ${messageData.fileName}]`,
    messageType: 'image',
    fileName: messageData.fileName,
    hiddenMessage: messageData.hiddenMessage || false,
    originalText: messageData.originalText || null,
    timestamp: getChinaTimeISO(),
    method: 'Server',
    encrypted: false,
    sending: true
  };
  
  try {
    
    // 立即添加到本地显示
    hybridStore.addMessage(contact.value.id, tempMessage);
    
    // 滚动到底部
    await nextTick();
    scrollToBottom();
    
    // 上传图片到服务器
    const response = await hybridApi.uploadImage(messageData.file);
    const result = response.data;
    
    // 后端直接返回Message对象，不是包装在success字段中
    if (result && result.id) {
      // 更新消息状态
      const finalMessage = {
        ...tempMessage,
        id: result.id || tempMessage.id,
        content: result.content,
        filePath: result.filePath,
        fileName: result.fileName,
        messageType: result.messageType,
        hiddenMessage: result.hiddenMessage || messageData.hiddenMessage || false,
        originalText: messageData.originalText || null,
        timestamp: result.timestamp || tempMessage.timestamp,
        sending: false
      };
      
      // 更新store中的消息
      const messages = hybridStore.getMessages(contact.value.id);
      const messageIndex = messages.findIndex(m => m.id === tempMessage.id);
      if (messageIndex !== -1) {
        messages[messageIndex] = finalMessage;
      }
      
      // 保存图片消息到本地数据库
      try {
        await localMessageService.sendMessage({
          from: finalMessage.from,
          to: finalMessage.to,
          content: finalMessage.content,
          messageType: finalMessage.messageType,
          filePath: finalMessage.filePath,
          fileName: finalMessage.fileName,
          hiddenMessage: finalMessage.hiddenMessage || false,
          originalText: finalMessage.originalText || null,
          method: finalMessage.method,
          encrypted: finalMessage.encrypted || false,
          timestamp: finalMessage.timestamp
        });
      } catch (dbError) {
        log.warn('保存图片消息到本地数据库失败:', dbError);
      }
      
      return { success: true, method: finalMessage.method };
    } else {
      // 发送失败，移除临时消息
      const messages = hybridStore.getMessages(contact.value.id);
      const messageIndex = messages.findIndex(m => m.id === tempMessage.id);
      if (messageIndex !== -1) {
        messages.splice(messageIndex, 1);
      }
      log.error('发送图片失败: 响应格式不正确', result);
      return { success: false, error: '发送失败：响应格式不正确' };
    }
  } catch (error) {
    log.error('发送图片失败:', error);
    // 发送失败，移除临时消息
    const messages = hybridStore.getMessages(contact.value.id);
    const messageIndex = messages.findIndex(m => m.id === tempMessage.id);
    if (messageIndex !== -1) {
      messages.splice(messageIndex, 1);
    }
    return { success: false, error: error.message };
  }
}

async function handleSteganographySent(messageData) {
  let tempMessage = null;
  
  // 创建临时消息对象用于立即显示
  tempMessage = {
    id: generateTempMessageId(),
    from: currentUser.value.id,
    to: contact.value.id,
    content: messageData.content,
    imageUrl: messageData.imageUrl,
    filePath: messageData.filePath || messageData.imageUrl,
    messageType: 'image',
    fileName: messageData.fileName,
    hiddenMessage: true,
    originalText: messageData.originalText || null,
    timestamp: getChinaTimeISO(),
    method: 'Server',
    encrypted: false,
    sending: true
  };
  
  try {
    
    // 立即添加到本地显示
    hybridStore.addMessage(contact.value.id, tempMessage);
    
    // 滚动到底部
    await nextTick();
    scrollToBottom();
    
    // 通过HybridMessaging发送隐写术消息给接收方
    const result = await hybridStore.hybridMessaging.sendMessage({
      to: contact.value.id,
      content: messageData.content,
      messageType: 'steganography',
      imageUrl: messageData.imageUrl,
      fileName: messageData.fileName
    });
    
    if (result && result.success) {
      // 发送成功，更新消息状态
      const finalMessage = {
        ...tempMessage,
        sending: false,
        method: result.method || 'Server'
      };
      
      // 更新store中的消息
      const messages = hybridStore.getMessages(contact.value.id);
      const messageIndex = messages.findIndex(m => m.id === tempMessage.id);
      if (messageIndex !== -1) {
        messages[messageIndex] = finalMessage;
      }
    } else {
      // 发送失败，移除临时消息
      const messages = hybridStore.getMessages(contact.value.id);
      const messageIndex = messages.findIndex(m => m.id === tempMessage.id);
      if (messageIndex !== -1) {
        messages.splice(messageIndex, 1);
      }
      log.error('发送隐写术消息失败:', result?.error || '未知错误');
      return { success: false, error: result?.error || '发送失败' };
    }
    
    const finalMessage = {
      ...tempMessage,
      sending: false,
      method: result.method || 'Server'
    };
    
    // 保存隐写术消息到本地数据库
    try {
      await localMessageService.sendMessage({
        from: finalMessage.from,
        to: finalMessage.to,
        content: finalMessage.content,
        messageType: finalMessage.messageType,
        filePath: finalMessage.filePath,
        fileName: finalMessage.fileName,
        hiddenMessage: finalMessage.hiddenMessage || false,
        originalText: finalMessage.originalText || null,
        method: finalMessage.method,
        encrypted: finalMessage.encrypted || false,
        timestamp: finalMessage.timestamp
      });
    } catch (dbError) {
      log.warn('保存隐写术消息到本地数据库失败:', dbError);
    }
    
    return { success: true, method: finalMessage.method };
  } catch (error) {
    log.error('发送隐写术消息失败:', error);
    // 发送失败，移除临时消息
    const messages = hybridStore.getMessages(contact.value.id);
    const messageIndex = messages.findIndex(m => m.id === tempMessage.id);
    if (messageIndex !== -1) {
      messages.splice(messageIndex, 1);
    }
    return { success: false, error: error.message };
  }
}

// 显示通话类型选择器
function showCallTypeSelector() {
  if (!contact.value || !contact.value.online) {
    alert('联系人不在线，无法发起通话');
    return;
  }
  showCallSelector.value = true;
}

// 关闭通话类型选择器
function closeCallTypeSelector() {
  showCallSelector.value = false;
}

// 处理通话类型选择
async function handleCallTypeSelected(data) {
  const { type, contact: selectedContact } = data;
  
  if (type === 'voice') {
    await startVoiceCall();
  } else if (type === 'video') {
    await startVideoCall();
  }
}

// 发起语音通话
async function startVoiceCall() {
  if (!contact.value || !contact.value.online) {
    alert('联系人不在线，无法发起语音通话');
    return;
  }
  
  try {
    const hybridMessaging = hybridStore.getHybridMessaging();
    if (!hybridMessaging) {
      alert('消息服务未初始化，无法发起语音通话');
      return;
    }
    
    
    // 发起语音通话
    const result = await hybridMessaging.initiateVoiceCall(contact.value.id);
    
    
    // 如果成功，跳转到语音通话页面
    if (result && result.success !== false) {
      router.push(`/voice-call/${contact.value.id}`);
    } else {
      alert(`发起语音通话失败: ${result?.error || '未知错误'}`);
    }
  } catch (error) {
    log.error('发起语音通话失败:', error);
    
    // 根据错误类型提供更具体的错误信息
    let errorMessage = '发起语音通话失败';
    if (error.message.includes('WebSocket') || error.message.includes('网络')) {
      errorMessage = '网络连接异常，请检查网络后重试';
    } else if (error.message.includes('麦克风')) {
      errorMessage = '麦克风访问失败，请检查麦克风权限';
    } else if (error.message.includes('消息服务')) {
      errorMessage = '服务未就绪，请稍后重试';
    } else {
      errorMessage = `发起语音通话失败: ${error.message}`;
    }
    
    alert(errorMessage);
  }
}

// 发起视频通话
async function startVideoCall() {
  if (!contact.value || !contact.value.online) {
    alert('联系人不在线，无法发起视频通话');
    return;
  }
  
  try {
    const hybridMessaging = hybridStore.getHybridMessaging();
    if (!hybridMessaging) {
      alert('消息服务未初始化，无法发起视频通话');
      return;
    }
    
    
    // 发起视频通话
    const result = await hybridMessaging.initiateVideoCall(contact.value.id);
    
    
    // 如果成功，跳转到视频通话页面
    if (result && result.success !== false) {
      router.push(`/video-call/${contact.value.id}`);
    } else {
      alert(`发起视频通话失败: ${result?.error || '未知错误'}`);
    }
  } catch (error) {
    log.error('发起视频通话失败:', error);
    
    // 根据错误类型提供更具体的错误信息
    let errorMessage = '发起视频通话失败';
    if (error.message.includes('WebSocket') || error.message.includes('网络')) {
      errorMessage = '网络连接异常，请检查网络后重试';
    } else if (error.message.includes('摄像头') || error.message.includes('麦克风')) {
      errorMessage = '摄像头或麦克风访问失败，请检查设备权限';
    } else if (error.message.includes('消息服务')) {
      errorMessage = '服务未就绪，请稍后重试';
    } else {
      errorMessage = `发起视频通话失败: ${error.message}`;
    }
    
    alert(errorMessage);
  }
}

// 重置语音通话状态
function resetVoiceCallState() {
  try {
    const hybridMessaging = hybridStore.getHybridMessaging();
    if (!hybridMessaging) {
      alert('消息服务未初始化');
      return;
    }
    
    const result = hybridMessaging.forceResetVoiceCallState();
    if (result.success) {
      alert('通话状态已重置');
    }
  } catch (error) {
    log.error('重置通话状态失败:', error);
    alert(`重置失败: ${error.message}`);
  }
}

// 历史记录相关方法
function showHistoryModal() {
  showHistory.value = true;
  resetHistoryState();
  loadLocalHistory();
}

function closeHistoryModal() {
  showHistory.value = false;
  resetHistoryState();
}

function resetHistoryState() {
  historyMessages.value = [];
  filteredHistoryMessages.value = [];
  searchQuery.value = '';
  historyPagination.value = {
    offset: 0,
    limit: 50,
    totalCount: 0,
    hasMore: true
  };
}

async function loadLocalHistory(append = false) {
  if (!contact.value || !currentUser.value) return;
  
  loadingHistory.value = true;
  try {
    const options = {
      limit: historyPagination.value.limit,
      offset: append ? historyPagination.value.offset : 0,
      search: searchQuery.value || null
    };
    
    const result = await getMessagesWithFriend(contact.value.id, options);
    
    if (append) {
      // 追加到现有消息
      historyMessages.value = [...historyMessages.value, ...result.messages];
    } else {
      // 替换现有消息
      historyMessages.value = result.messages;
    }
    
    // 更新分页信息
    historyPagination.value = {
      offset: result.offset + result.count,
      limit: result.limit,
      totalCount: result.totalCount,
      hasMore: result.hasMore
    };
    
    // 更新过滤后的消息列表
    filterMessages();
    
  } catch (error) {
    log.error('加载本地历史记录失败:', error);
    if (!append) {
      historyMessages.value = [];
      filteredHistoryMessages.value = [];
    }
  } finally {
    loadingHistory.value = false;
  }
}

// 过滤消息函数（用于前端实时过滤）
function filterMessages() {
  if (!searchQuery.value.trim()) {
    // 如果没有搜索词，显示所有消息
    filteredHistoryMessages.value = historyMessages.value;
  } else {
    // 根据搜索词过滤消息，支持中文搜索
    const query = searchQuery.value.toLowerCase().trim();
    filteredHistoryMessages.value = historyMessages.value.filter(message => {
      // 搜索消息内容
      const content = message.content ? message.content.toLowerCase() : '';
      return content.includes(query);
    });
  }
}

// 清除搜索
function clearSearch() {
  searchQuery.value = '';
  // 清除搜索时重新加载所有历史记录
  loadLocalHistory();
}

// 执行搜索（数据库层面搜索）
async function performSearch() {
  if (!contact.value || !currentUser.value) return;
  
  loadingHistory.value = true;
  try {
    const options = {
      limit: 200, // 搜索时加载更多消息
      offset: 0,
      search: searchQuery.value.trim() || null
    };
    
    const result = await getMessagesWithFriend(contact.value.id, options);
    
    // 替换现有消息
    historyMessages.value = result.messages;
    
    // 更新分页信息
    historyPagination.value = {
      offset: result.offset + result.count,
      limit: result.limit,
      totalCount: result.totalCount,
      hasMore: result.hasMore && !searchQuery.value.trim() // 搜索模式下不支持分页加载
    };
    
    // 直接设置过滤后的消息（数据库已经过滤过了）
    filteredHistoryMessages.value = historyMessages.value;
    
  } catch (error) {
    log.error('搜索历史记录失败:', error);
    historyMessages.value = [];
    filteredHistoryMessages.value = [];
  } finally {
    loadingHistory.value = false;
  }
}

// 监听搜索词变化
watch(searchQuery, async (newQuery, oldQuery) => {
  // 防止重复触发
  if (newQuery === oldQuery) return;
  
  // 使用防抖，避免频繁搜索
  clearTimeout(searchQuery._debounceTimer);
  searchQuery._debounceTimer = setTimeout(async () => {
    if (newQuery.trim()) {
      // 有搜索词时，执行数据库搜索
      await performSearch();
    } else {
      // 没有搜索词时，重新加载所有历史记录
      await loadLocalHistory();
    }
  }, 300); // 300ms防抖
});

// 上滑加载更多
function handleHistoryScroll() {
  // 搜索模式下不支持分页加载
  if (searchQuery.value.trim()) return;
  
  if (!historyContainer.value || loadingHistory.value || !historyPagination.value.hasMore) return;
  
  const { scrollTop, scrollHeight, clientHeight } = historyContainer.value;
  
  // 当滚动到顶部附近时加载更多
  if (scrollTop < 100) {
    loadLocalHistory(true);
  }
}

// 处理图片加载错误
function handleImageError(event) {
  log.error('图片加载失败:', event.target.src);
  event.target.style.display = 'none';
}

// 右键点击事件处理
function handleImageRightClick(message, event) {
  event.preventDefault(); // 阻止默认右键菜单
  
  currentLongPressMessage.value = message;
  
  // 设置右键菜单位置
  tooltipPosition.value = {
    x: event.clientX,
    y: event.clientY
  };
  
  // 显示右键菜单
  showImageContextMenu.value = true;
}

// 这些长按相关的函数已不再需要，因为改为右键点击直接显示

// 点击解密按钮
function handleDecryptClick() {
  if (currentLongPressMessage.value) {
    extractHiddenMessage(currentLongPressMessage.value);
    showDecryptTooltip.value = false;
    currentLongPressMessage.value = null;
  }
}

// 处理解密取消
function handleDecryptCancel() {
  showDecryptTooltip.value = false;
  currentLongPressMessage.value = null;
}

// 右键菜单功能处理函数
function handleViewLargeImage() {
  if (currentLongPressMessage.value) {
    openImageModal(currentLongPressMessage.value);
  }
  showImageContextMenu.value = false;
}

async function handleCopyImage() {
  if (!currentLongPressMessage.value) {
    showImageContextMenu.value = false;
    return;
  }

  try {
    const imageUrl = getImageUrl(currentLongPressMessage.value.filePath);
    
    // 检查浏览器是否支持剪贴板API
    if (!navigator.clipboard || !navigator.clipboard.write) {
      throw new Error('浏览器不支持剪贴板API');
    }
    
    // 获取图片数据
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`获取图片失败: ${response.status}`);
    }
    
    const blob = await response.blob();
    
    // 定义剪贴板支持的图片格式
    const supportedTypes = ['image/png'];
    let mimeType = blob.type;
    let finalBlob = blob;
    
    // 如果不是PNG格式，直接转换为PNG
    if (mimeType !== 'image/png') {
      
      try {
        // 创建一个临时的Image对象
        const img = new Image();
        
        // 创建一个Promise来处理图片加载
        const imageLoadPromise = new Promise((resolve, reject) => {
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('图片加载失败'));
          
          // 使用blob URL避免跨域问题
          const blobUrl = URL.createObjectURL(blob);
          img.src = blobUrl;
        });
        
        const loadedImg = await imageLoadPromise;
        
        // 创建canvas并转换为PNG
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = loadedImg.naturalWidth;
        canvas.height = loadedImg.naturalHeight;
        
        // 绘制图片
        ctx.drawImage(loadedImg, 0, 0);
        
        // 转换为PNG blob
        finalBlob = await new Promise((resolve, reject) => {
          canvas.toBlob((pngBlob) => {
            if (pngBlob) {
              resolve(pngBlob);
            } else {
              reject(new Error('PNG转换失败'));
            }
          }, 'image/png', 1.0);
        });
        
        mimeType = 'image/png';
        
        // 清理blob URL
        URL.revokeObjectURL(img.src);
        
      } catch (conversionError) {
        log.warn('图片格式转换失败:', conversionError);
        
        // 如果转换失败，尝试直接使用原始blob，但强制设置为PNG类型
        if (blob.type.startsWith('image/')) {
          // 创建一个新的blob，强制设置为PNG类型
          finalBlob = new Blob([blob], { type: 'image/png' });
          mimeType = 'image/png';
        } else {
          throw new Error('无法处理的图片格式');
        }
      }
    }
    
    // 创建ClipboardItem，只使用PNG格式
    const clipboardItem = new ClipboardItem({
      'image/png': finalBlob
    });
    
    // 写入剪贴板
    await navigator.clipboard.write([clipboardItem]);
    
    
    // 显示成功提示
    showSuccessToast('图片已复制到剪贴板，可使用 Cmd+V 粘贴');
    
  } catch (error) {
    log.error('复制图片失败:', error);
    
    // 显示错误提示
    let errorMessage = '复制图片失败';
    if (error.message.includes('不支持剪贴板API')) {
      errorMessage = '您的浏览器不支持图片复制功能，请使用较新版本的Chrome、Firefox或Safari';
    } else if (error.message.includes('获取图片失败')) {
      errorMessage = '无法获取图片，请检查网络连接';
    } else if (error.name === 'NotAllowedError') {
      errorMessage = '复制图片被浏览器阻止，请检查浏览器权限设置';
    } else if (error.name === 'SecurityError') {
      errorMessage = '图片复制受到安全限制，请尝试保存图片后手动复制';
    } else if (error.message.includes('无法处理的图片格式')) {
      errorMessage = '图片格式不支持复制，请尝试保存图片后手动复制';
    } else {
      errorMessage = `复制失败: ${error.message}`;
    }
    
    showErrorToast(errorMessage);
  }
  
  showImageContextMenu.value = false;
}

async function handleSaveImage() {
  if (!currentLongPressMessage.value) {
    showImageContextMenu.value = false;
    return;
  }

  try {
    const message = currentLongPressMessage.value;
    const imageUrl = getImageUrl(message.filePath);
    
    
    // 显示保存开始提示
    showSuccessToast('正在保存图片...');
    
    // 获取图片数据
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`获取图片失败: ${response.status}`);
    }
    
    const blob = await response.blob();
    
    // 生成合适的文件名
    let fileName = message.fileName || 'image';
    
    // 如果文件名没有扩展名，根据blob类型添加
    if (!fileName.includes('.')) {
      const mimeType = blob.type;
      if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
        fileName += '.jpg';
      } else if (mimeType === 'image/png') {
        fileName += '.png';
      } else if (mimeType === 'image/gif') {
        fileName += '.gif';
      } else if (mimeType === 'image/webp') {
        fileName += '.webp';
      } else if (mimeType === 'image/bmp') {
        fileName += '.bmp';
      } else {
        fileName += '.png'; // 默认使用png扩展名
      }
    }
    
    // 添加时间戳避免文件名冲突
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'));
    const extension = fileName.substring(fileName.lastIndexOf('.'));
    const finalFileName = `${nameWithoutExt}_${timestamp}${extension}`;
    
    // 创建blob URL
    const blobUrl = URL.createObjectURL(blob);
    
    // 创建下载链接
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = finalFileName;
    link.style.display = 'none';
    
    // 添加到DOM并触发下载
    document.body.appendChild(link);
    link.click();
    
    // 清理资源
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    }, 100);
    
    
    // 显示成功提示
    showSuccessToast(`图片已保存: ${finalFileName}`);
    
  } catch (error) {
    log.error('保存图片失败:', error);
    
    // 显示错误提示
    let errorMessage = '保存图片失败';
    if (error.message.includes('获取图片失败')) {
      errorMessage = '无法获取图片，请检查网络连接';
    } else if (error.name === 'SecurityError') {
      errorMessage = '图片保存受到安全限制，请尝试右键另存为';
    } else if (error.message.includes('网络')) {
      errorMessage = '网络连接异常，请稍后重试';
    } else {
      errorMessage = `保存失败: ${error.message}`;
    }
    
    showErrorToast(errorMessage);
  }
  
  showImageContextMenu.value = false;
}

function handleDecryptImage() {
  if (currentLongPressMessage.value) {
    const message = currentLongPressMessage.value;
    
    // 检查是否为图片消息或隐写术消息
    if (message.messageType !== 'image' && message.messageType !== 'steganography') {
      showImageContextMenu.value = false;
      return;
    }
    
    // 每次都允许重新解密，不检查之前的解密结果
    
    // 对于图片消息，总是尝试解密，不依赖hiddenMessage字段
    // 因为该字段可能在数据库中没有正确设置
    extractHiddenMessage(message);
  }
  showImageContextMenu.value = false;
}

async function handleHideDecryptResult() {
  if (currentLongPressMessage.value) {
    const message = currentLongPressMessage.value;
    
    // 清除解密结果，隐藏解密信息
    message.extractedText = null;
    message.decryptHidden = true; // 标记用户主动收回了解密
    
    // 保存收回解密状态到数据库
    try {
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
      await fetch(`${API_BASE_URL}/v1/local-storage/messages/${message.id}/field`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          field_name: 'decrypt_hidden',
          field_value: 'true'
        })
      });
    } catch (error) {
      log.warn('保存收回解密状态失败:', error);
    }
    
  }
  showImageContextMenu.value = false;
}

function handleContextMenuCancel() {
  showImageContextMenu.value = false;
  currentLongPressMessage.value = null;
}

// 点击其他区域隐藏提示框和右键菜单
function handleDocumentClick(event) {
  if (showDecryptTooltip.value) {
    const tooltip = document.querySelector('.decrypt-tooltip');
    if (tooltip && !tooltip.contains(event.target)) {
      showDecryptTooltip.value = false;
      currentLongPressMessage.value = null;
    }
  }
  if (showImageContextMenu.value) {
    const contextMenu = document.querySelector('.image-context-menu');
    if (contextMenu && !contextMenu.contains(event.target)) {
      showImageContextMenu.value = false;
      currentLongPressMessage.value = null;
    }
  }
}

// 监听文档点击事件
watch([showDecryptTooltip, showImageContextMenu], ([newDecryptValue, newContextValue]) => {
  if (newDecryptValue || newContextValue) {
    // 延迟添加点击监听，避免立即触发
    setTimeout(() => {
      document.addEventListener('click', handleDocumentClick);
    }, 100);
  } else {
    document.removeEventListener('click', handleDocumentClick);
  }
});

// 组件卸载时清理事件监听
onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick);
});

// 提取隐写术隐藏信息
async function extractHiddenMessage(message) {
  // 每次都重新解密，不检查之前的结果
  
  if (!message.filePath) {
    log.error('无法提取隐藏信息：缺少图片文件路径');
    message.extractedText = '解密失败：缺少图片文件路径';
    return;
  }
  
  try {
    // 获取图片文件
    const imageUrl = getImageUrl(message.filePath);
    const response = await fetch(imageUrl);
    
    if (!response.ok) {
      throw new Error('获取图片失败');
    }
    
    const blob = await response.blob();
    
    // 创建FormData用于发送到隐写术提取API
    const formData = new FormData();
    formData.append('image', blob, message.fileName || 'steganography.png');
    formData.append('password', 'default_password'); // 使用默认密码
    
    // 调用隐写术提取API
    const API_BASE_URL = '/api';
        const extractResponse = await fetch(`${API_BASE_URL}/steganography/extract`, {
      method: 'POST',
      body: formData
    });
    
    if (!extractResponse.ok) {
      const errorText = await extractResponse.text();
      log.error('API错误:', errorText);
      throw new Error(`提取隐藏信息失败 (${extractResponse.status})`);
    }
    
    const result = await extractResponse.json();
    
    if (result.secret_message) {
      // 更新消息对象，添加提取的文本
      message.extractedText = result.secret_message;
      
      // 同时更新hiddenMessage字段，确保下次能正确识别
      message.hiddenMessage = true;
      
      // 清除收回解密状态，因为用户重新解密了
      message.decryptHidden = false;
      
      // 更新数据库中的收回解密状态
      try {
        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
        await fetch(`${API_BASE_URL}/v1/local-storage/messages/${message.id}/field`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({
            field_name: 'decrypt_hidden',
            field_value: 'false'
          })
        });
      } catch (error) {
        log.warn('清除收回解密状态失败:', error);
      }
      
      // 解密结果只保存在内存中，不持久化到数据库
    } else {
      // 如果API返回成功但没有找到隐藏信息
      message.extractedText = '此消息无加密内容';
    }
    
  } catch (error) {
     log.error('提取隐藏信息失败:', error);
     // 设置解密失败的提示信息
     message.extractedText = '解密失败：' + error.message;
     
     // 解密失败信息只保存在内存中，不持久化到数据库
   }
 }

// 修复图片路径处理 - 修正API路径
function getImageUrl(filePath) {
  if (!filePath) {
    log.warn('getImageUrl: filePath为空');
    return '';
  }
  
  // 处理新格式：user_id/filename 或旧格式：filename
  let imageParam;
  if (filePath.includes('/')) {
    // 新格式：包含用户ID的路径，直接使用
    imageParam = filePath;
  } else {
    // 旧格式：只有文件名，兼容处理
    imageParam = filePath;
  }
  
  // 使用完整的后端URL：通过upload路由的images端点访问图片
  const API_BASE_URL = '/api/v1';
  const finalUrl = `${API_BASE_URL}/images/${imageParam}?t=${Date.now()}`;
  
  return finalUrl;
}

// 图片放大模态框相关函数
function openImageModal(message) {
  currentImageMessage.value = message;
  showImageModal.value = true;
}

function closeImageModal() {
  showImageModal.value = false;
  currentImageMessage.value = null;
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0 || isNaN(bytes)) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getAvatarUrl(avatarPath) {
  if (!avatarPath) return '';
  
  // 如果是绝对路径（以http开头），直接返回
  if (avatarPath.startsWith('http')) {
    return avatarPath;
  }
  
  // 如果是API相对路径（以/api开头），拼接基础URL
  if (avatarPath.startsWith('/api/')) {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
    return `${baseUrl}${avatarPath}`;
  }
  
  // 其他相对路径，拼接API基础URL
  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
  return `${baseUrl}${avatarPath.startsWith('/') ? '' : '/'}${avatarPath}`;
}

function downloadFile(message) {
  
  // 兼容性处理：支持多种字段格式
  const filePath = message.filePath || message.file_path;
  const fileName = message.fileName || message.file_name || 'download';
  
  if (!filePath) {
    log.error('文件路径为空，无法下载文件');
    alert('文件路径为空，无法下载文件。请检查文件是否正确上传。');
    return;
  }
  
  
  const API_BASE_URL = '/api/v1';
  const url = `${API_BASE_URL}/files/${filePath}`;
  
  
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
}

// Toast提示函数
function showSuccessToast(message) {
  toastMessage.value = message;
  toastType.value = 'success';
  showToast.value = true;
  
  // 清除之前的定时器
  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  
  // 3秒后自动隐藏
  toastTimer = setTimeout(() => {
    showToast.value = false;
  }, 3000);
}

function showErrorToast(message) {
  toastMessage.value = message;
  toastType.value = 'error';
  showToast.value = true;
  
  // 清除之前的定时器
  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  
  // 5秒后自动隐藏（错误信息显示时间稍长）
  toastTimer = setTimeout(() => {
    showToast.value = false;
  }, 5000);
}

function hideToast() {
  showToast.value = false;
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
}

</script>

<style scoped>
.hybrid-chat-window {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--whisper-surface-bright);
  position: relative;
}

.chat-header {
  height: var(--whisper-chatheader-height);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 var(--whisper-lg);
  background: var(--whisper-surface-bright);
  border-bottom: 1px solid var(--whisper-outline-variant);
  position: relative;
  z-index: 1;
}

.contact-info {
  display: flex;
  align-items: center;
  gap: var(--whisper-sm);
}

.contact-avatar {
  width: 40px;
  height: 40px;
  border-radius: var(--whisper-radius-full);
  overflow: hidden;
  flex-shrink: 0;
}

.contact-avatar .avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: var(--whisper-radius-full);
}

.avatar-placeholder {
  width: 40px;
  height: 40px;
  border-radius: var(--whisper-radius-full);
  background: var(--whisper-primary-fixed);
  color: var(--whisper-on-primary-fixed);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 1.4rem;
}

.contact-details h3 {
  margin: 0 0 2px 0;
  font-size: var(--whisper-fs-body-lg);
  font-weight: var(--whisper-fw-headline-md);
  color: var(--whisper-on-surface);
}

.connection-info {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--whisper-fs-label-md);
  color: var(--whisper-on-surface-variant);
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 4px;
}

.action-btn {
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
  transition: background 0.15s, color 0.15s;
}

.action-btn:hover:not(:disabled) {
  background: var(--whisper-surface-variant);
  color: var(--whisper-primary);
}

.action-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--whisper-outline);
}

.status-indicator.online {
  background: var(--whisper-online, #4caf50);
}

.status-text {
  font-size: var(--whisper-fs-label-md);
  color: var(--whisper-on-surface-variant);
}

.connection-method {
  padding: 2px 6px;
  border-radius: var(--whisper-radius-full);
  font-size: var(--whisper-fs-label-md);
  background: rgba(186, 202, 201, 0.12);
  color: var(--whisper-primary);
}

.no-contact {
  text-align: center;
  padding: 1rem;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
  position: relative;
  z-index: 1;
}

.message {
  margin-bottom: 1.5rem;
  display: flex;
  animation: messageSlideIn 0.3s ease-out;
}

@keyframes messageSlideIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message.sent {
  justify-content: flex-end;
}

.message.received {
  justify-content: flex-start;
}

.message-content {
  max-width: 70%;
  padding: 0.75rem 1rem;
  border-radius: 1.5rem;
  background: var(--whisper-bubble-incoming);
  border: 1px solid rgba(0, 0, 0, 0.05);
  position: relative;
}

.message.received .message-content {
  border-bottom-left-radius: 0.25rem;
}

.message.sent .message-content {
  background: var(--whisper-bubble-outgoing);
  color: var(--whisper-on-surface);
  border-bottom-right-radius: 0.25rem;
}

.message-text {
  margin-bottom: 0.5rem;
  line-height: 1.4;
}

.message-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  opacity: 0.8;
}

.message-time {
  font-weight: 500;
}

.message-method {
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-size: 0.625rem;
  font-weight: 500;
  text-transform: uppercase;
}

.sending-indicator {
  color: var(--whisper-warning, #ffc107);
  font-size: 0.625rem;
  font-weight: 500;
}

.message-image {
  margin-bottom: 0.5rem;
}

.image-content {
  max-width: 200px;
  height: auto;
  border-radius: 8px;
  cursor: pointer;
  transition: transform 0.2s;
}

.image-content:hover {
  transform: scale(1.02);
}

.image-file-info {
  margin-top: 0.5rem;
  padding: 0.5rem;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 6px;
  font-size: 0.875rem;
}

.image-file-name {
  font-weight: 600;
  color: var(--whisper-on-surface);
  margin-bottom: 0.25rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.image-file-size {
  color: var(--whisper-on-surface-variant);
  font-size: 0.8rem;
}

/* 文件消息样式 */
.message-file {
  margin-bottom: 0.5rem;
}

.file-content {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: var(--whisper-surface-container);
  border-radius: 8px;
  max-width: 300px;
}

.message.sent .file-content {
  background: var(--whisper-surface-container-high);
}

.file-icon .icon {
  font-size: 2rem;
  color: var(--whisper-primary);
}

.file-info {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-weight: 600;
  word-wrap: break-word;
  word-break: break-all;
  white-space: normal;
  line-height: 1.4;
}

.file-meta {
  font-size: 0.875rem;
  color: var(--whisper-on-surface-variant);
}

.download-btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: var(--whisper-radius-full);
  background: var(--whisper-primary);
  color: var(--whisper-on-primary);
  cursor: pointer;
  transition: opacity 0.2s;
}

.download-btn:hover {
  opacity: 0.9;
}

/* 文件消息样式 */
.message-file {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: var(--whisper-surface-container);
  border-radius: 8px;
  max-width: 300px;
}

.message.sent .message-file {
  background: var(--whisper-bubble-outgoing);
}

.file-icon-container {
  font-size: 2rem;
  color: var(--whisper-primary);
}

.file-info {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-weight: 600;
  word-wrap: break-word;
  word-break: break-all;
  white-space: normal;
  line-height: 1.4;
}

.file-meta {
  font-size: 0.875rem;
  color: var(--whisper-on-surface-variant);
}

.download-btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: var(--whisper-radius-full);
  background: var(--whisper-primary);
  color: var(--whisper-on-primary);
  cursor: pointer;
  transition: opacity 0.2s;
}

.download-btn:hover {
  opacity: 0.9;
}

/* 图片放大模态框样式 */
.image-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(14, 14, 14, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
  backdrop-filter: blur(8px);
}

.image-modal {
  background: var(--whisper-surface-container-high);
  border-radius: var(--whisper-radius-xl);
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.image-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--whisper-outline-variant);
  background: var(--whisper-surface-container-high);
}

.image-modal-header h3 {
  margin: 0;
  font-size: 1.1rem;
  color: var(--whisper-on-surface);
  font-weight: 500;
}

.image-modal-content {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  max-height: calc(90vh - 120px);
  overflow: auto;
}

.modal-image {
  max-width: 100%;
  max-height: 70vh;
  height: auto;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.modal-steganography-hint {
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  background: rgba(186, 202, 201, 0.08);
  border: 1px solid var(--whisper-outline-variant);
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: var(--whisper-primary);
}

.modal-extracted-message {
  margin-top: 1rem;
  padding: 1rem;
  background: rgba(186, 202, 201, 0.06);
  border: 1px solid var(--whisper-outline-variant);
  border-radius: 8px;
  width: 100%;
  max-width: 500px;
}

.image-modal-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--whisper-outline-variant);
  background: var(--whisper-surface-container-high);
  text-align: center;
}

.image-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.875rem;
  color: var(--whisper-on-surface-variant);
}

.image-time {
  font-weight: 500;
}

.image-name {
  font-weight: 600;
  color: var(--whisper-on-surface);
}

.image-size {
  color: var(--whisper-on-surface-variant);
  font-size: 0.8rem;
}

.image-placeholder {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  background: var(--whisper-surface-container);
  border-radius: 0.5rem;
  color: var(--whisper-on-surface-variant);
}

.image-icon {
  font-size: 1.5rem;
}

.image-text {
  font-size: 0.875rem;
}

.empty-messages {
  text-align: center;
  padding: 3rem 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  background: var(--whisper-surface-container);
  border-radius: 20px;
  margin: 2rem;
  backdrop-filter: blur(10px);
  border: 1px solid var(--whisper-outline-variant);
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
  color: var(--whisper-primary);
  animation: emptyIconFloat 3s ease-in-out infinite;
}

@keyframes emptyIconFloat {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-10px); }
}

.empty-messages p {
  font-size: 1.1rem;
  color: var(--whisper-on-surface-variant);
  font-weight: 500;
  margin: 0;
}

.message-input-area {
  padding: var(--whisper-md);
  background: var(--whisper-surface-bright);
  border-top: 1px solid var(--whisper-outline-variant);
  position: relative;
  z-index: 1;
}

/* 历史记录模态框样式 */
.history-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(14, 14, 14, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(8px);
}

.history-modal {
  background: var(--whisper-surface-container-high);
  border-radius: var(--whisper-radius-xl);
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--whisper-outline-variant);
  background: var(--whisper-surface-container-high);
  border-radius: 12px 12px 0 0;
}

.history-header h3 {
  margin: 0;
  color: var(--whisper-on-surface);
  font-size: 1.2rem;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--whisper-on-surface-variant);
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: var(--whisper-surface-container-highest);
  color: var(--whisper-on-surface);
}

.history-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  color: var(--whisper-on-surface-variant);
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--whisper-outline-variant);
  border-top: 3px solid var(--whisper-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.search-container {
  position: relative;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--whisper-outline-variant);
  background: var(--whisper-surface-container-high);
}

.search-input {
  width: 100%;
  padding: 0.75rem 1rem;
  border: none;
  border-bottom: 1px solid var(--whisper-outline-variant);
  border-radius: 0;
  font-size: 0.875rem;
  outline: none;
  transition: border-color 0.2s ease;
}

.search-input:focus {
  border-bottom-color: var(--whisper-primary);
  box-shadow: none;
}

.clear-search-btn {
  position: absolute;
  right: 2rem;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  font-size: 1.2rem;
  color: var(--whisper-on-surface-variant);
  cursor: pointer;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.clear-search-btn:hover {
  background: var(--whisper-surface-container-highest);
  color: var(--whisper-on-surface);
}

.no-history,
.no-search-results {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  color: var(--whisper-on-surface-variant);
  font-style: italic;
}

.history-messages {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  max-height: 400px;
}

.history-message {
  margin-bottom: 1rem;
  display: flex;
}

.history-message.sent {
  justify-content: flex-end;
}

.history-message.received {
  justify-content: flex-start;
}

.history-message .message-content {
  max-width: 70%;
  padding: 0.75rem 1rem;
  border-radius: 12px;
  background: var(--whisper-surface-container);
  position: relative;
}

.history-message.sent .message-content {
  background: var(--whisper-bubble-outgoing);
  color: var(--whisper-on-surface);
}

.history-message .message-text {
  margin-bottom: 0.25rem;
  word-wrap: break-word;
}

.history-message .message-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
  opacity: 0.7;
  margin-top: 0.25rem;
}

.history-status {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: 15px;
  padding: 10px;
  border-top: 1px solid var(--whisper-outline-variant);
}

.status-info {
  font-size: 14px;
  color: var(--whisper-on-surface-variant);
  text-align: center;
}

.loading-more {
  text-align: center;
  padding: 10px;
  color: var(--whisper-on-surface-variant);
  font-size: 14px;
  border-bottom: 1px solid var(--whisper-outline-variant);
}

.loading-more p {
  margin: 0;
}

/* 解密提示框样式 */
.decrypt-tooltip {
  position: fixed;
  z-index: 9999;
  background: var(--whisper-surface-container-high);
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  animation: fadeIn 0.3s ease-out;
  pointer-events: auto;
  min-width: 160px;
  backdrop-filter: blur(4px);
  border: 1px solid var(--whisper-outline-variant);
}

.tooltip-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.tooltip-text {
  color: var(--whisper-on-surface);
  font-size: 14px;
  white-space: nowrap;
  margin-bottom: 4px;
}

.tooltip-buttons {
  display: flex;
  gap: 8px;
}

.decrypt-btn, .cancel-btn {
  padding: 10px 16px;
  border: none;
  border-radius: var(--whisper-radius-full);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 60px;
  user-select: none;
}

.decrypt-btn {
  background: var(--whisper-primary);
  color: var(--whisper-on-primary);
}

.decrypt-btn:hover {
  opacity: 0.9;
}

.cancel-btn {
  background: transparent;
  color: var(--whisper-on-surface-variant);
  border: 1px solid var(--whisper-outline-variant);
}

.cancel-btn:hover {
  background: var(--whisper-surface-container-highest);
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* 图片右键菜单样式 */
.image-context-menu {
  position: fixed;
  z-index: 9999;
  background: var(--whisper-surface-container-high);
  border-radius: var(--whisper-radius-lg);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  animation: fadeIn 0.2s ease-out;
  pointer-events: auto;
  min-width: 140px;
  border: 1px solid var(--whisper-outline-variant);
  overflow: hidden;
}

.context-menu-content {
  display: flex;
  flex-direction: column;
}

.menu-item {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border: none;
  background: var(--whisper-surface-container-high);
  color: var(--whisper-on-surface);
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.2s;
  text-align: left;
  gap: 8px;
  border-bottom: 1px solid var(--whisper-outline-variant);
}

.menu-item:last-child {
  border-bottom: none;
}

.menu-item:hover {
  background-color: var(--whisper-surface-container-highest);
}

.menu-item:active {
  background-color: var(--whisper-surface-container-high);
}

/* 图标样式 */
.icon-view::before {
  content: '👁';
  font-size: 16px;
}

.icon-copy::before {
  content: '📋';
  font-size: 16px;
}

.icon-save::before {
  content: '💾';
  font-size: 16px;
}

.icon-decrypt::before {
  content: '🔓';
  font-size: 16px;
}

.icon-hide::before {
  content: '👁‍🗨';
  font-size: 16px;
}

/* 隐写术消息样式 */
.message-steganography {
  position: relative;
  max-width: 300px;
  border: 2px solid var(--whisper-primary);
  border-radius: var(--whisper-radius-lg);
  padding: 8px;
  background: rgba(186, 202, 201, 0.08);
}

.steganography-content {
  width: 100%;
  border-radius: 8px;
  cursor: pointer;
  transition: transform 0.2s;
}

.steganography-content:hover {
  transform: scale(1.02);
}

.steganography-placeholder {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  background: var(--whisper-surface-container);
  border-radius: var(--whisper-radius-lg);
  color: var(--whisper-on-surface-variant);
}

.steganography-icon {
  font-size: 1.5rem;
}

.steganography-text {
  font-style: italic;
}

.steganography-hint {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
  padding: 0.5rem;
  background: rgba(186, 202, 201, 0.08);
  border-radius: 6px;
  font-size: 0.85rem;
  color: var(--whisper-primary);
}

.hint-icon {
  font-size: 1rem;
}

.hint-text {
  font-weight: 500;
}

.extracted-message {
  margin-top: 0.75rem;
  padding: 0.75rem;
  background: rgba(186, 202, 201, 0.06);
  border: 1px solid var(--whisper-outline-variant);
  border-radius: 8px;
}

.extracted-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
  color: var(--whisper-primary);
  font-weight: 600;
}

.extracted-icon {
  font-size: 1rem;
}

.extracted-label {
  font-weight: 600;
}

.extracted-content {
  padding: 0.5rem;
  background: var(--whisper-surface-container);
  border-radius: 6px;
  border: 1px solid var(--whisper-outline-variant);
  font-size: 0.9rem;
  line-height: 1.4;
  color: var(--whisper-on-surface);
  word-wrap: break-word;
}

/* 错误提示样式 */
.extracted-error {
  background: var(--whisper-error-container) !important;
  border: 1px solid var(--whisper-error) !important;
}

.extracted-error .extracted-header {
  color: var(--whisper-error) !important;
}

.extracted-error .extracted-content {
  background: var(--whisper-error-container) !important;
  border: 1px solid var(--whisper-error) !important;
  color: var(--whisper-error) !important;
  font-style: italic;
}

/* 语音通话记录样式 */
.message-voice-call {
  max-width: 280px;
  margin-bottom: 0.5rem;
}

.voice-call-content {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(186, 202, 201, 0.08);
  border: 1px solid var(--whisper-outline-variant);
  border-radius: 12px;
  transition: all 0.2s ease;
}

.voice-call-content:hover {
  background: rgba(186, 202, 201, 0.12);
  border-color: var(--whisper-primary);
}

.voice-call-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(186, 202, 201, 0.12);
}

.call-icon {
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.call-icon.completed {
  color: var(--whisper-primary);
}

.call-icon.rejected {
  color: var(--whisper-error);
}

.call-icon.missed {
  color: var(--whisper-warning, #ffc107);
}

.voice-call-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.call-status {
  font-weight: 600;
  font-size: 14px;
  color: var(--whisper-on-surface);
}

.call-duration {
  font-size: 12px;
  color: var(--whisper-on-surface-variant);
  font-weight: 500;
}

/* 发送的通话记录样式调整 */
.message.sent .voice-call-content {
  background: rgba(186, 202, 201, 0.15);
  border-color: rgba(186, 202, 201, 0.08);
}

.message.sent .voice-call-content:hover {
  background: rgba(186, 202, 201, 0.08);
  border-color: var(--whisper-primary);
}

.message.sent .call-status {
  color: var(--whisper-on-surface);
}

.message.sent .call-duration {
  color: var(--whisper-on-surface-variant);
}

/* 阅后即焚倒计时样式 */
.burn-after-countdown {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 6px;
  background: var(--whisper-error);
  color: var(--whisper-on-error);
  border-radius: var(--whisper-radius-full);
  font-size: 0.7rem;
  font-weight: 600;
  text-shadow: none;
  box-shadow: none;
  animation: burnAfterPulse 2s infinite;
}

.burn-after-expired {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 6px;
  background: var(--whisper-surface-container-high);
  color: var(--whisper-on-surface-variant);
  border-radius: 10px;
  font-size: 0.7rem;
  font-weight: 600;
  text-shadow: none;
  opacity: 0.7;
}

@keyframes burnAfterPulse {
  0%, 100% {
    transform: scale(1);
    box-shadow: 0 0 4px rgba(186, 202, 201, 0.3);
  }
  50% {
    transform: scale(1.05);
    box-shadow: 0 0 4px rgba(186, 202, 201, 0.3);
  }
}

/* 历史记录中的阅后即焚样式 */
.history-message .burn-after-countdown,
.history-message .burn-after-expired {
  font-size: 0.65rem;
  padding: 1px 4px;
}

/* Toast提示样式 */
.toast-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 10000;
  pointer-events: auto;
}

.toast {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--whisper-surface-container-high);
  border-radius: var(--whisper-radius-lg);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  border-left: 4px solid;
  min-width: 300px;
  max-width: 400px;
  animation: toastSlideIn 0.3s ease-out;
  cursor: pointer;
  transition: all 0.2s ease;
}

.toast:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
}

.toast.success {
  border-left-color: var(--whisper-primary);
}

.toast.error {
  border-left-color: var(--whisper-error);
}

.toast-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.toast.success .toast-icon {
  color: var(--whisper-primary);
}

.toast.error .toast-icon {
  color: var(--whisper-error);
}

.toast-message {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  color: var(--whisper-on-surface);
  line-height: 1.4;
}

.toast-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--whisper-on-surface-variant);
  border-radius: var(--whisper-radius-default);
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.toast-close:hover {
  background: var(--whisper-surface-container-highest);
  color: var(--whisper-on-surface);
}

@keyframes toastSlideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.debug-small {
  color: var(--whisper-on-surface-variant);
  font-size: 10px;
}

</style>