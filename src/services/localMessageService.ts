import { 
  getDb,
  addMessage, 
  getMessagesWithFriend, 
  checkDatabaseStatus,
  clearAllMessages,
  storeUserKeys,
  getUserKeys as dbGetUserKeys,
  clearUserKeys,
  validateUserKeys,
  addContact as dbAddContact,
  getContacts as dbGetContacts,
  markMessageAsRead,
  deleteMessage
} from '../client_db/database.ts';
import CryptoJS from 'crypto-js';
import { getChinaTimeISO } from '../utils/timeUtils.ts';

/**
 * A stateless service for handling local message encryption, decryption, and storage.
 * It relies on an initialized database instance provided by `getDb()`.
 */
class LocalMessageService {
  encryptionEnabled: boolean;

  constructor() {
    this.encryptionEnabled = true;
  }

  /**
   * Helper to get the current user ID from localStorage.
   */
  _getCurrentUserId() {
    const userStr = localStorage.getItem('user');
    if (!userStr) return null;
    try {
      const user = JSON.parse(userStr);
      return user.id || user.userId;
    } catch (error) {
      console.error('Failed to parse user info:', error);
      return null;
    }
  }

  /**
   * 生成用户密钥对
   */
  async generateUserKeys() {
    try {
      // 使用Web Crypto API生成RSA密钥对
      const keyPair = await window.crypto.subtle.generateKey(
        {
          name: 'RSA-OAEP',
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: 'SHA-256'
        },
        true,
        ['encrypt', 'decrypt']
      );
      
      // 导出密钥
      const publicKey = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
      const privateKey = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
      
      // 转换为Base64字符串
      const publicKeyBase64 = this.arrayBufferToBase64(publicKey);
      const privateKeyBase64 = this.arrayBufferToBase64(privateKey);
      
      // 存储密钥
      const keyData = {
        publicKey: publicKeyBase64,
        privateKey: privateKeyBase64,
        algorithm: 'RSA-OAEP',
        keySize: 2048,
        createdAt: getChinaTimeISO()
      };
      
      await storeUserKeys(keyData);
      console.log('✅ 用户密钥对生成并保存成功');
      
      return keyData;
    } catch (error) {
      console.error('❌ 生成密钥对失败:', error);
      // 如果Web Crypto API不可用，使用简化的密钥生成
      const fallbackKeys = {
        publicKey: `pub_${this._getCurrentUserId()}_${Date.now()}`,
        privateKey: `priv_${this._getCurrentUserId()}_${Date.now()}`,
        algorithm: 'AES-256',
        keySize: 256,
        createdAt: getChinaTimeISO()
      };
      
      await storeUserKeys(fallbackKeys);
      console.log('✅ 使用备用方案生成密钥对');
      return fallbackKeys;
    }
  }

  /**
   * ArrayBuffer转Base64
   */
  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  /**
   * Base64转ArrayBuffer
   */
  base64ToArrayBuffer(base64) {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * 加密消息内容
   */
  async encryptMessage(content, recipientPublicKey = null) {
    try {
      if (!this.encryptionEnabled) {
        return { content, encrypted: false };
      }
      
      // 使用AES加密消息内容（更快）
      const key = CryptoJS.lib.WordArray.random(256/8);
      const iv = CryptoJS.lib.WordArray.random(128/8);
      
      const encrypted = CryptoJS.AES.encrypt(content, key, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      });
      
      return {
        content: encrypted.toString(),
        encrypted: true,
        key: key.toString(),
        iv: iv.toString(),
        algorithm: 'AES-256-CBC'
      };
    } catch (error) {
      console.error('❌ 消息加密失败:', error);
      return { content, encrypted: false };
    }
  }

  /**
   * 解密消息内容
   */
  async decryptMessage(encryptedData) {
    try {
      if (!encryptedData.encrypted) {
        return encryptedData.content;
      }
      
      const key = CryptoJS.enc.Hex.parse(encryptedData.key);
      const iv = CryptoJS.enc.Hex.parse(encryptedData.iv);
      
      const decrypted = CryptoJS.AES.decrypt(encryptedData.content, key, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      });
      
      return decrypted.toString(CryptoJS.enc.Utf8);
    } catch (error) {
      console.error('❌ 消息解密失败:', error);
      return encryptedData.content;
    }
  }

  /**
   * 发送消息（加密并存储到本地）
   */
  async sendMessage(messageData) {
    try {
      const currentUserId = this._getCurrentUserId();
      if (!currentUserId) {
        throw new Error("User not logged in, cannot send message.");
      }

      const encryptedData = await this.encryptMessage(messageData.content);
      
      const message = {
        from: currentUserId,
        to: messageData.to,
        content: encryptedData.content,
        timestamp: getChinaTimeISO(),
        method: messageData.method || 'P2P',
        encrypted: encryptedData.encrypted,
        messageType: messageData.messageType || 'text',
        destroyAfter: messageData.destroyAfter || null,
        encryptionKey: encryptedData.key,
        encryptionIv: encryptedData.iv,
        algorithm: encryptedData.algorithm
      };
      
      // The addMessage function from database.js will use getDb() internally
      const messageId = await addMessage(message);
      
      console.log('✅ Message encrypted and saved locally with ID:', messageId);
      
      return {
        success: true,
        messageId: messageId,
        message: message
      };
    } catch (error) {
      console.error('❌ Failed to send message:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 接收消息（解密并存储到本地）
   */
  async receiveMessage(messageData) {
    try {
      const decryptedContent = await this.decryptMessage(messageData);
      
      const message = {
        ...messageData,
        content: decryptedContent,
        isRead: false
      };
      
      const messageId = await addMessage(message);
      
      console.log('✅ Received message saved locally with ID:', messageId);
      
      return {
        success: true,
        messageId: messageId,
        message: message
      };
    } catch (error) {
      console.error('❌ Failed to receive message:', error);
       return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 获取与好友的聊天记录
   */
  async getChatHistory(friendId, options = {}) {
    try {
      const result = await getMessagesWithFriend(friendId, options);
      
      console.log(`📖 获取到与用户 ${friendId} 的 ${result.messages.length} 条聊天记录`);
      
      return {
        success: true,
        messages: result.messages,
        count: result.total
      };
    } catch (error) {
      console.error('❌ 获取聊天记录失败:', error);
      return {
        success: false,
        error: error.message,
        messages: []
      };
    }
  }

  /**
   * 获取本地存储状态
   */
  async getStorageStatus() {
    try {
      const status = await checkDatabaseStatus();
      return status;
    } catch (error) {
      console.error('❌ 获取存储状态失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 清空所有消息
   */
  async clearAllMessages() {
    try {
      const result = await clearAllMessages();
      return { success: result };
    } catch (error) {
      console.error('❌ 清空消息失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 添加联系人
   */
  async addContact(contactData) {
    try {
      const contactId = await dbAddContact(contactData);
      return { success: true, contactId: contactId };
    } catch (error) {
      console.error('❌ 添加联系人失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取所有联系人
   */
  async getContacts() {
    try {
      const contacts = await dbGetContacts();
      return { success: true, contacts: contacts };
    } catch (error) {
      console.error('❌ 获取联系人失败:', error);
      return { success: false, error: error.message, contacts: [] };
    }
  }

  /**
   * 标记消息为已读
   */
  async markAsRead(messageId) {
    try {
      const result = await markMessageAsRead(messageId);
      return { success: result };
    } catch (error) {
      console.error('❌ 标记消息失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 删除消息
   */
  async deleteMessage(messageId) {
    try {
      const result = await deleteMessage(messageId);
      return { success: result };
    } catch (error) {
      console.error('❌ 删除消息失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取用户密钥
   */
  async getUserKeys() {
    try {
      const keys = await dbGetUserKeys();
      return { success: true, keys: keys };
    } catch (error) {
      console.error('❌ 获取密钥失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 验证密钥完整性
   */
  async validateKeys() {
    try {
      const validation = await validateUserKeys();
      return validation;
    } catch (error) {
      console.error('❌ 验证密钥失败:', error);
      return { valid: false, error: error.message };
    }
  }

  /**
   * 启用/禁用加密
   */
  setEncryption(enabled) {
    this.encryptionEnabled = enabled;
    console.log(`🔐 消息加密已${enabled ? '启用' : '禁用'}`);
  }

  /**
   * 检查服务是否已初始化
   */
  isReady() {
    return true; // This service is always ready as it relies on getDb()
  }

  async initialize() {
    return this.isReady();
  }
}

// Export a single instance of the service
const localMessageService = new LocalMessageService();

// 在浏览器控制台中暴露调试函数
if (typeof window !== 'undefined') {
  window.whisperMessageService = localMessageService;
  window.initWhisperMessageService = () => localMessageService.initialize();
  window.getWhisperMessageServiceStatus = () => localMessageService.getStorageStatus();
  window.clearWhisperMessages = () => localMessageService.clearAllMessages();
  
  console.log('💡 Whisper 消息服务调试命令:');
  console.log('  - whisperMessageService 访问服务实例');
  console.log('  - initWhisperMessageService() 初始化服务');
  console.log('  - getWhisperMessageServiceStatus() 查看存储状态');
  console.log('  - clearWhisperMessages() 清空所有消息');
}

export default localMessageService;
