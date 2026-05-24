import { reactive, computed } from 'vue';
import CryptoJS from 'crypto-js';
import { generateTempMessageId } from '../utils/timeUtils.ts';
import { createLogger } from '../utils/logger.ts';
const log = createLogger('HybridStore');

// 创建reactive状态
const state = reactive({
  // 用户信息
  user: null,
  token: null,

  // 联系人列表
  contacts: [],

  // 对话记录 - 简化结构，只保留消息列表和最后一条消息
  conversations: {}, // { userId: { messages: [], lastMessage: {} } }

  // 当前聊天对象
  currentContact: null,

  // P2P连接状态
  p2pConnections: {},

  // 在线状态
  onlineUsers: new Set(),

  // 消息统计
  messageStats: {
    totalSent: 0,
    totalReceived: 0,
    p2pSent: 0,
    p2pReceived: 0,
    serverSent: 0,
    serverReceived: 0
  },

  // HybridMessaging服务实例
  hybridMessaging: null,

  // 语音通话状态
  currentCall: {
    isActive: false,
    contactId: null,
    callId: null,
    startTime: null,
    status: 'idle' // idle, connecting, ringing, active, ended
  },

  // 阅后即焚消息清理定时器
  burnAfterCleanupTimer: null
});

export const hybridStore = {
  // 直接暴露响应式状态
  get user() {
    return state.user;
  },
  get token() {
    return state.token;
  },
  get contacts() {
    return state.contacts;
  },
  get conversations() {
    return state.conversations;
  },
  get currentContact() {
    return state.currentContact;
  },
  get p2pConnections() {
    return state.p2pConnections;
  },
  get onlineUsers() {
    return state.onlineUsers;
  },
  get messageStats() {
    return state.messageStats;
  },
  get currentCall() {
    return state.currentCall;
  },
  
  // 计算属性
  get isLoggedIn() {
    return !!state.token;
  },

  // 设置用户信息
  async setUser(user, token) {
    // 验证输入参数 - 后端返回的用户对象使用 userId 字段
    const userId = user?.id || user?.userId;
    if (!user || !userId || !token) {
      log.error('setUser: 无效的用户信息或token', { user, token });
      return false;
    }
    
    // 标准化用户对象，确保有 id 字段
    const normalizedUser = {
      ...user,
      id: userId
    };
    
    try {
      // 设置状态
      state.user = normalizedUser;
      state.token = token;
      
      // 保存到本地存储
      localStorage.setItem('user', JSON.stringify(normalizedUser));
      localStorage.setItem('token', token);
      
      
      // 登录成功后初始化本地数据库
      try {
        const { initDatabase } = await import('../client_db/database.ts');
        await initDatabase(normalizedUser.id);
      } catch (dbError) {
        log.error('本地数据库初始化失败:', dbError);
      }

      return true;
    } catch (error) {
      log.error('设置用户信息失败:', error);
      return false;
    }
  },

  // 从本地存储加载用户信息
  async loadUserFromStorage() {
    const userStr = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    
    if (userStr && token) {
      try {
        const parsedUser = JSON.parse(userStr);
        // 调用 setUser 来统一处理用户状态设置和数据库初始化
        await this.setUser(parsedUser, token);
        
        // 确保数据库已初始化
        try {
          const { initDatabase } = await import('../client_db/database.ts');
          await initDatabase(parsedUser.id);
        } catch (dbError) {
          log.error('从本地存储恢复会话时初始化数据库失败:', dbError);
        }

        return true;
      } catch (error) {
        log.error('从本地存储加载用户信息失败:', error);
        this.logout(); // 如果加载失败，清理状态
        return false;
      }
    }
    return false;
  },

  // 退出登录
  logout() {
    state.user = null;
    state.token = null;
    state.contacts = [];
    state.conversations = {};
    state.currentContact = null;
    state.p2pConnections = {};
    state.onlineUsers.clear();
    
    // 清除本地存储
    localStorage.removeItem('user');
    localStorage.removeItem('token');
  },

  // 设置联系人列表
  setContacts(contacts) {
    // 确保contacts是数组
    if (!Array.isArray(contacts)) {
      log.error('setContacts: contacts must be an array, received:', typeof contacts);
      state.contacts = [];
      return;
    }
    
    // 标准化联系人数据，确保必要字段存在，并保留现有联系人的头像缓存
    const normalizedContacts = contacts.map(contact => {
      const existingContact = state.contacts.find(c => c.id === contact.id);
      return {
        ...contact,
        username: contact.username || '',
        email: contact.email || '',
        // 优先使用新数据的头像，如果没有则保留现有缓存
        avatar: contact.avatar !== undefined ? contact.avatar : (existingContact?.avatar || null),
        online: contact.online || false,
        connectionStatus: contact.connectionStatus || {
          canUseP2P: false,
          preferredMethod: 'Server',
          p2pStatus: 'disconnected'
        },
        lastMessage: contact.lastMessage || null
      };
    });
    
    state.contacts = normalizedContacts;
    
    // 为每个联系人初始化对话记录
    normalizedContacts.forEach(contact => {
      if (!state.conversations[contact.id]) {
        state.conversations[contact.id] = {
          messages: [],
          lastMessage: {}
        };
      }
    });
  },

  // 设置当前聊天对象
  setCurrentContact(contact) {
    state.currentContact = contact;
  },

  // 设置当前聊天（兼容性方法）
  setCurrentChat(contact) {
    state.currentContact = contact;
  },

  // 添加新联系人
  addContact(contact) {
    if (!state.contacts.find(c => c.id === contact.id)) {
      // 标准化联系人数据
      const normalizedContact = {
        ...contact,
        username: contact.username || '',
        email: contact.email || '',
        avatar: contact.avatar || null,
        online: contact.online || false,
        connectionStatus: contact.connectionStatus || {
          canUseP2P: false,
          preferredMethod: 'Server',
          p2pStatus: 'disconnected'
        },
        lastMessage: contact.lastMessage || null
      };
      
      state.contacts.push(normalizedContact);
      state.conversations[contact.id] = {
        messages: [],
        lastMessage: {}
      };
    }
  },

  removeContact(userId) {
    // 从联系人列表中移除
    const index = state.contacts.findIndex(c => c.id === userId);
    if (index !== -1) {
      state.contacts.splice(index, 1);
    }
    
    // 删除对话记录
    if (state.conversations[userId]) {
      delete state.conversations[userId];
    }
    
    // 清除P2P连接状态
    if (state.p2pConnections[userId]) {
      delete state.p2pConnections[userId];
    }
    
    // 从在线用户列表中移除
    state.onlineUsers.delete(userId);
    
    // 如果当前聊天对象是被删除的联系人，清除当前聊天
    if (state.currentContact?.id === userId) {
      state.currentContact = null;
    }
  },

  // 统一清洗消息的 timestamp 为 number (epoch ms)
  cleanTimestamp(message) {
    let ts = message.timestamp;
    if (!ts) {
      ts = Date.now();
    } else if (typeof ts !== 'number') {
      const parsed = Number(ts);
      ts = Number.isNaN(parsed) ? new Date(ts).getTime() : parsed;
    }
    return { ...message, timestamp: ts };
  },

  // 添加消息到对话
  addMessage(userId, message) {
    const cleaned = this.cleanTimestamp(message);
    if (!state.conversations[userId]) {
      state.conversations[userId] = {
        messages: [],
        lastMessage: {}
      };
    }

    const conversation = state.conversations[userId];

    // 去重：先按ID查找，再按(from, to, timestamp)查找
    const existingIndex = conversation.messages.findIndex(m => m.id === cleaned.id);
    if (existingIndex !== -1) {
      conversation.messages.splice(existingIndex, 1, { ...cleaned });
    } else {
      // 按发送方+接收方+时间戳去重，防止不同路径生成的不同临时ID导致重复
      const dedupIndex = conversation.messages.findIndex(m =>
        String(m.from) === String(cleaned.from)
        && String(m.to) === String(cleaned.to)
        && String(m.timestamp) === String(cleaned.timestamp)
      );
      if (dedupIndex !== -1) {
        conversation.messages.splice(dedupIndex, 1, { ...cleaned });
      } else {
        conversation.messages = [...conversation.messages, { ...cleaned }];
      }
    }

    // 按时间戳重新排序所有消息，确保正确的时间顺序
    conversation.messages.sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));

    // 更新最后一条消息（按时间戳排序后的最后一条）
    if (conversation.messages.length > 0) {
      conversation.lastMessage = { ...conversation.messages[conversation.messages.length - 1] };
    }

    // 更新联系人的最后一条消息
    const contact = state.contacts.find(c => c.id == userId || c.id === parseInt(userId));
    if (contact) {
      contact.lastMessage = { ...conversation.lastMessage };
    }
  },

  // 设置对话消息（用于加载历史消息）
  async setMessages(userId, messages) {
    if (!state.conversations[userId]) {
      state.conversations[userId] = {
        messages: [],
        lastMessage: {}
      };
    }
    
    // 确保messages是数组
    if (!Array.isArray(messages)) {
      log.error('setMessages: messages must be an array');
      return;
    }
    
    // 获取现有消息，用于保留已解密的状态
    const existingMessages = state.conversations[userId].messages || [];
    const existingMessagesMap = new Map();
    
    // 创建现有消息的映射，以便快速查找
    existingMessages.forEach(msg => {
      if (msg.id) {
        existingMessagesMap.set(msg.id, msg);
      }
    });
    // 处理消息，特别是语音通话记录，并保留已解密的状态
    const processedMessages = messages.map(message => {
      const cleaned = this.cleanTimestamp(message);
      // 查找现有消息中是否有相同ID的消息
      const existingMessage = cleaned.id ? existingMessagesMap.get(cleaned.id) : null;

      // 如果找到现有消息，保留其extractedText字段
      if (existingMessage && existingMessage.extractedText) {
        cleaned.extractedText = existingMessage.extractedText;
      }
      
      // 如果是语音通话记录，解析content字段
      if (cleaned.messageType === 'voice_call' && cleaned.content) {
        try {
          const callInfo = JSON.parse(cleaned.content);
          return {
            ...cleaned,
            callDuration: callInfo.duration || 0,
            callStatus: callInfo.status || 'unknown',
            callStartTime: callInfo.startTime || null,
            callEndTime: callInfo.endTime || null
          };
        } catch (error) {
          log.warn('解析语音通话记录失败:', error, cleaned);
          return cleaned;
        }
      }
      return cleaned;
    });
    
    // 按时间戳排序消息
    const sortedMessages = processedMessages.sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
    
    state.conversations[userId].messages = sortedMessages;

    // 更新最后一条消息
    if (sortedMessages.length > 0) {
      state.conversations[userId].lastMessage = sortedMessages[sortedMessages.length - 1];
      
      // 更新联系人的最后一条消息
      const contact = state.contacts.find(c => c.id === userId);
      if (contact) {
        contact.lastMessage = sortedMessages[sortedMessages.length - 1];
      }
    }

  },

  // 获取对话消息
  getMessages(userId) {
    if (!state.conversations[userId]) {
      state.conversations[userId] = {
        messages: [],
        lastMessage: {}
      };
    }
    return state.conversations[userId].messages;
  },

  // 获取联系人信息
  getContact(userId) {
    // 处理字符串和数字类型的ID比较
    return state.contacts.find(c => c.id == userId || c.id === parseInt(userId));
  },

  // 获取所有联系人
  getContacts() {
    return state.contacts;
  },

  // 更新联系人头像
  updateContactAvatar(userId, avatarUrl) {
    const contact = state.contacts.find(c => c.id == userId || c.id === parseInt(userId));
    if (contact) {
      contact.avatar = avatarUrl;
    }
  },

  // 更新当前聊天联系人的头像
  updateCurrentContactAvatar(avatarUrl) {
    if (state.currentContact) {
      state.currentContact.avatar = avatarUrl;
      // 同时更新联系人列表中的头像
      this.updateContactAvatar(state.currentContact.id, avatarUrl);
    }
  },

  // 更新P2P连接状态
  updateP2PConnection(userId, status) {
    state.p2pConnections[userId] = status;
  },

  // 获取P2P连接状态
  getP2PStatus(userId) {
    return state.p2pConnections[userId] || 'disconnected';
  },

  // (Refactored) Handles a list of online friends
  onFriendsStatusReceived(onlineFriends) {
    if (!Array.isArray(onlineFriends)) return;

    const onlineIds = new Set(onlineFriends.map(friend => friend.userId));
    state.onlineUsers = onlineIds;

    state.contacts.forEach(contact => {
      contact.online = onlineIds.has(contact.id);
    });
  },

  updateOnlineStatus(statusUpdate) {
    const { userId, status, lastSeen } = statusUpdate;
    const isOnline = status === 'online';
    
    // 更新在线用户集合
    if (isOnline) {
      state.onlineUsers.add(userId);
    } else {
      state.onlineUsers.delete(userId);
    }
    
    // 更新联系人在线状态
    const contact = state.contacts.find(c => parseInt(c.id) === userId);
    if (contact) {
      contact.online = isOnline;
      if (lastSeen) {
        contact.lastSeen = lastSeen;
      }
    }
  },

  // 检查用户是否在线
  isUserOnline(userId) {
    return state.onlineUsers.has(userId);
  },

  // 加密消息
  encryptMessage(message, publicKey) {
    try {
      // 这里应该使用RSA加密，暂时用AES模拟
      const encrypted = CryptoJS.AES.encrypt(message, publicKey).toString();
      return encrypted;
    } catch (error) {
      log.error('加密失败:', error);
      return message; // 如果加密失败，返回原消息
    }
  },

  // 解密消息
  decryptMessage(encryptedMessage, privateKey) {
    try {
      // 这里应该使用RSA解密，暂时用AES模拟
      const decrypted = CryptoJS.AES.decrypt(encryptedMessage, privateKey).toString(CryptoJS.enc.Utf8);
      return decrypted || encryptedMessage; // 如果解密失败，返回原消息
    } catch (error) {
      log.error('解密失败:', error);
      return encryptedMessage; // 如果解密失败，返回原消息
    }
  },

  // 清空所有对话
  clearAllConversations() {
    Object.keys(state.conversations).forEach(userId => {
      state.conversations[userId] = {
        messages: [],
        lastMessage: {}
      };
    });
  },

  getConnectionStats() {
    return { ...state.messageStats };
  },

  // HybridMessaging服务管理
  setHybridMessaging(hybridMessaging) {
    state.hybridMessaging = hybridMessaging;
    
    // 设置回调
    hybridMessaging.onMessageReceived = (message) => {
      this.handleReceivedMessage(message);
    };
    hybridMessaging.onUserStatusChanged = (statusUpdate) => {
      this.updateOnlineStatus(statusUpdate);
    };
    hybridMessaging.onFriendsStatusReceived = (onlineFriends) => {
      this.onFriendsStatusReceived(onlineFriends);
    };
    hybridMessaging.onP2PStatusChanged = (userId, p2pStatus) => {
      const contact = this.getContact(userId);
      if (contact) {
        contact.connectionStatus.p2pStatus = p2pStatus;
        // ... more logic if needed
      }
    };
  },

  getHybridMessaging() {
    return state.hybridMessaging;
  },

  // 处理接收到的消息
  async handleReceivedMessage(message) {
    // 生成唯一的消息ID，避免重复
    const messageId = message.id || generateTempMessageId();
    
    // 处理阅后即焚时间
    let destroyAfter = null;
    if (message.destroy_after && message.destroy_after > 0) {
      // destroy_after已经是发送方设置的绝对时间戳，直接使用
      destroyAfter = message.destroy_after;
    }
    
    const messageObj = {
      id: messageId,
      from: message.from,
      to: state.user?.id,
      content: message.content,
      timestamp: message.timestamp || Date.now(),
      method: message.method || 'Server',
      encrypted: false,
      // 添加图片消息支持
      messageType: message.messageType || message.message_type || 'text',
      filePath: message.filePath || message.file_path || null,
      fileName: message.fileName || message.file_name || null,
      imageUrl: message.imageUrl || null,
      // 添加阅后即焚支持
      destroy_after: destroyAfter,
      // 添加语音通话记录特殊字段
      callDuration: message.callDuration || null,
      callStatus: message.callStatus || null,
      callStartTime: message.callStartTime || null,
      callEndTime: message.callEndTime || null
    };
    

    // 立即添加到对话记录（UI显示）
    this.addMessage(message.from, messageObj);

    // DB写入已在上游 handleServerMessage 中完成，此处不再重复写入

    // 更新消息统计
    state.messageStats.totalReceived++;
    if (message.method === 'P2P') {
      state.messageStats.p2pReceived++;
    } else {
      state.messageStats.serverReceived++;
    }
    
  },

  // 初始化HybridMessaging服务
  async initializeHybridMessaging() {
    if (!state.user || !state.token) {
      log.error('用户未登录，无法初始化消息服务');
      return false;
    }
    
    try {
      // 动态导入HybridMessaging
      const { default: HybridMessaging } = await import('../services/hybridmessaging.ts');
      
      const hybridMessaging = new HybridMessaging();
      
      // 先设置回调函数，再初始化
      this.setHybridMessaging(hybridMessaging);
      
      // 然后初始化连接
      await hybridMessaging.initialize(state.user.id, state.token);
      
      // 启动阅后即焚消息清理定时器
      this.startBurnAfterCleanupTimer();
      
      return true;
    } catch (error) {
      log.error('初始化HybridMessaging服务失败:', error);
      return false;
    }
  },

  // 清理HybridMessaging服务
  cleanupHybridMessaging() {
    // 停止阅后即焚消息清理定时器
    this.stopBurnAfterCleanupTimer();
    
    if (state.hybridMessaging) {
      state.hybridMessaging.cleanup();
      state.hybridMessaging = null;
    }
  },

  // 语音通话状态管理
  setCurrentCall(callInfo) {
    state.currentCall = { ...state.currentCall, ...callInfo };
  },

  clearCurrentCallInfo() {
    state.currentCall = {
      isActive: false,
      contactId: null,
      callId: null,
      startTime: null,
      status: 'idle'
    };
  },

  // 清理过期的阅后即焚消息
  cleanExpiredBurnAfterMessages() {
    const currentTime = Math.floor(Date.now() / 1000);
    let totalCleaned = 0;
    
    // 检查 state.conversations 是否存在
    if (!state.conversations || typeof state.conversations !== 'object') {
      return 0;
    }

    // 遍历所有联系人的对话
    Object.keys(state.conversations).forEach(contactId => {
      const conversation = state.conversations[contactId];
      if (!conversation || !Array.isArray(conversation.messages)) {
        return; // 跳过无效的对话
      }

      const messages = conversation.messages;
      const originalLength = messages.length;

      // 过滤掉过期的阅后即焚消息
      conversation.messages = messages.filter(message => {
        if (message.destroy_after && message.destroy_after <= currentTime) {
          return false; // 移除过期消息
        }
        return true; // 保留未过期消息
      });

      const cleanedCount = originalLength - conversation.messages.length;
      totalCleaned += cleanedCount;

      if (cleanedCount > 0) {
      }
    });
    
    if (totalCleaned > 0) {
    }
    
    return totalCleaned;
  },

  // 启动定期清理过期消息的定时器
  startBurnAfterCleanupTimer() {
    // 每5秒检查一次过期消息，确保及时清理
    if (state.burnAfterCleanupTimer) {
      clearInterval(state.burnAfterCleanupTimer);
    }
    
    state.burnAfterCleanupTimer = setInterval(() => {
      this.cleanExpiredBurnAfterMessages();
    }, 5000); // 5秒
    
  },

  // 停止清理定时器
  stopBurnAfterCleanupTimer() {
    if (state.burnAfterCleanupTimer) {
      clearInterval(state.burnAfterCleanupTimer);
      state.burnAfterCleanupTimer = null;
    }
  },

  updateCallStatus(status) {
     state.currentCall.status = status;
   },

   getCurrentCallInfo() {
     return state.currentCall;
   },
};

export default hybridStore;
