import { getLocalKey, saveLocalKey, deleteLocalKey } from '@/utils/key-storage';
import localMessageService from './localMessageService.ts';
import { getChinaTimeISO, generateTempMessageId } from '../utils/timeUtils.ts';
import { extractPayload, extractWsPayload } from '../utils/api-contract.ts';
import {
  parseSignalEnvelope,
  serializeSignalEnvelope,
  SignalTauriRuntime,
  type SignalEnvelope,
  type SignalAccountResult,
} from './signal-runtime.ts';
import { EncryptionError } from '../utils/error-handler.ts';
import { sendQueue } from './message-send-queue.ts';
import Logger, { createLogger } from '@/utils/logger.ts';

const log = createLogger('HybridMessaging');

// 混合消息传递服务
class HybridMessaging {
  // ==========================================
  // 💡 TS 改造：在这里预先声明所有的类成员属性
  // ==========================================
  ws: WebSocket | null;
  p2pConnections: Map<any, RTCDataChannel>;
  peerConnections: Map<any, RTCPeerConnection>;
  currentUserId: string | number | null;
  token: string | null;
  
  // 回调函数声明
  onMessageReceived: Function | null;
  onUserStatusChanged: Function | null;
  onFriendsStatusReceived: Function | null;
  onP2PStatusChanged: Function | null;
  
  // 重连状态
  isReconnecting: boolean;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  
  // 消息处理器与定时器
  messageHandlers: Record<string, Function>;
  healthCheckInterval: any;
  pendingIceCandidates: Map<any, any[]> | null;
  lastHeartbeatTime: number;
  connectionHealthy: boolean;
  signalRuntime: SignalTauriRuntime | null;
  signalReady: boolean;

  // 语音通话相关状态
  voiceCallState: any;
  onVoiceCallReceived: Function | undefined;
  onVoiceCallStatusChanged: Function | undefined;
  voiceConnections: Map<any, RTCPeerConnection>;
  remoteStreams: Map<any, MediaStream>;
  currentVoiceCall: any;
  localStream: MediaStream | null;

  // 视频通话相关状态
  videoCallState: any;
  onVideoCallReceived: Function | undefined;
  onVideoCallStatusChanged: Function | undefined;
  videoConnections: Map<any, RTCPeerConnection>;
  remoteVideoStreams: Map<any, MediaStream>;
  currentVideoCall: any;
  localVideoStream: MediaStream | null;
  // ==========================================

  constructor() {
    this.ws = null;                    // WebSocket连接（C/S信令）
    this.p2pConnections = new Map();   // P2P连接池 { userId: WebRTCDataChannel }
    this.peerConnections = new Map();  // WebRTC连接池
    this.currentUserId = null;
    this.token = null;
    this.onMessageReceived = null;     // 消息接收回调
    this.onUserStatusChanged = null;   // 用户状态变化回调
    this.onFriendsStatusReceived = null; // 好友在线状态列表回调
    this.onP2PStatusChanged = null;    // P2P连接状态变化回调
    this.isReconnecting = false;       // 重连状态标志
    this.reconnectAttempts = 0;        // 重连尝试次数
    this.maxReconnectAttempts = 5;     // 最大重连次数
    this.pendingIceCandidates = null;
    this.lastHeartbeatTime = 0;
    this.connectionHealthy = false;
    this.signalRuntime = null;
    this.signalReady = false;
    
    // 初始化语音通话状态
    this.voiceConnections = new Map();
    this.remoteStreams = new Map();
    this.localStream = null;
    this.initVoiceCallState();
    
    // 初始化视频通话状态
    this.videoConnections = new Map();
    this.remoteVideoStreams = new Map();
    this.localVideoStream = null;
    this.initVideoCallState();
    
    // 消息处理器映射 - 延迟初始化
    this.messageHandlers = {};
  }

  // 初始化混合消息系统
  async initialize(userId: any, token: any) {
    this.currentUserId = userId;
    this.token = token;
    
    
    // 初始化消息处理器映射
    this.initializeMessageHandlers();
    await this.initializeSignalRuntime();
    
    // 建立WebSocket连接用于信令
    await this.connectSignalingServer();
    
    // P2P能力注册功能已移除
    
    // 设置页面关闭时的清理逻辑
    this.setupBeforeUnloadHandler();
    
  }

  // 初始化消息处理器映射
  async initializeSignalRuntime() {
    if (!this.currentUserId) return;

    try {
      const { hybridApi } = await import('../api/hybrid-api.ts');
      this.signalRuntime = new SignalTauriRuntime({ userId: this.currentUserId });
      const account = await this.signalRuntime.createAccount({ opkCount: 20 });
      await hybridApi.uploadKeyBundle(account.keyBundle);
      this.signalReady = true;
    } catch (error) {
      this.signalRuntime = null;
      this.signalReady = false;
      log.warn('Signal runtime unavailable, falling back to legacy plaintext transport:', error);
    }
  }

  initializeMessageHandlers() {
    this.messageHandlers = {
      'p2p_offer': this.handleP2POffer.bind(this),
      'p2p_answer': this.handleP2PAnswer.bind(this),
      'ice_candidate': this.handleIceCandidate.bind(this),
      'user_status_update': this.handleUserStatusUpdate.bind(this),
      'message': this.handleServerMessage.bind(this),
      'voice_call_offer': this.handleVoiceCallOffer.bind(this),
      'voice_call_answer': this.handleVoiceCallAnswer.bind(this),
      'voice_call_ice_candidate': this.handleVoiceCallIceCandidate.bind(this),
      'voice_call_rejected': this.handleVoiceCallRejected.bind(this),
      'voice_call_ended': this.handleVoiceCallEnded.bind(this),
      'video_call_offer': this.handleVideoCallOffer.bind(this),
      'video_call_answer': this.handleVideoCallAnswer.bind(this),
      'video_call_ice_candidate': this.handleVideoCallIceCandidate.bind(this),
      'video_call_rejected': this.handleVideoCallRejected.bind(this),
      'video_call_ended': this.handleVideoCallEnded.bind(this),
      'video_call_toggle': this.handleVideoCallToggle.bind(this)
    };
  }

  // 连接信令服务器（C/S）
  async connectSignalingServer() {
    return new Promise<void>(async (resolve, reject) => {
      const config = await import('../config/config.ts');
      this.ws = new WebSocket(`${config.default.WS_BASE_URL}/ws/${this.currentUserId}?token=${this.token}`);
      
      this.ws.onopen = async () => {
        
        // 设置信令处理器
        this.setupSignalingHandlers();
        
        // 重置重连状态
        this.isReconnecting = false;
        this.reconnectAttempts = 0;
        
        // 启动连接健康检查
        this.startConnectionHealthCheck();
        
        // 在线状态同步功能已移除
        
        resolve();
      };
      
      this.ws.onerror = async (error) => {
          log.error('WebSocket连接错误:', error);
          reject(error);
      };
      this.ws.onclose = async (event) => {
        
        // 详细的错误代码分析
        if (event.code === 1008) {
          log.error('WebSocket认证失败 (错误代码1008)');
          log.error('可能原因: Token无效、过期或用户ID不匹配');
          log.error('当前用户ID:', this.currentUserId);
        } else if (event.code === 1006) {
          log.error('WebSocket异常关闭 (错误代码1006)');
          log.error('可能原因: 网络连接问题或服务器无响应');
        } else {
        }
        
        // 清理所有P2P连接
        this.p2pConnections.forEach((connection, userId) => {
          try {
            connection.close();
          } catch (error) {
            log.warn(`关闭与用户 ${userId} 的P2P连接失败:`, error);
          }
        });
        this.p2pConnections.clear();
        
        this.peerConnections.forEach((peerConnection, userId) => {
          try {
            peerConnection.close();
          } catch (error) {
            log.warn(`关闭与用户 ${userId} 的WebRTC连接失败:`, error);
          }
        });
        this.peerConnections.clear();
        
        // 离线状态同步功能已移除
        
        // 智能重连逻辑
        if (!this.isReconnecting && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.isReconnecting = true;
          this.reconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 10000); // 指数退避，最大10秒
          
          setTimeout(async () => {
            try {
              await this.connectSignalingServer();
              this.reconnectAttempts = 0; // 重连成功，重置计数器
            } catch (error) {
              log.error('WebSocket重连失败:', error);
            } finally {
              this.isReconnecting = false;
            }
          }, delay);
        } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          log.error('WebSocket重连次数已达上限，停止重连');
        }
      };
    });
  }

  // 设置信令处理
  setupSignalingHandlers() {
    if(!this.ws) return;
    this.ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'webrtc_offer':
          await this.handleP2POffer({
            from: data.from_id,
            offer: data.payload
          });
          break;

        case 'webrtc_answer':
          await this.handleP2PAnswer({
            from: data.from_id,
            answer: data.payload
          });
          break;

        case 'webrtc_ice_candidate':
          await this.handleIceCandidate({
            from: data.from_id,
            candidate: data.payload
          });
          break;
        
        case 'friends_status':
          if (this.onFriendsStatusReceived) {
            const payload = extractWsPayload(data);
            this.onFriendsStatusReceived(payload.onlineFriends || payload.online_friends || []);
          }
          break;

        case 'user_status':
        case 'user_status_change':
          if (this.onUserStatusChanged) {
            this.onUserStatusChanged(extractWsPayload(data));
          }
          break;

        case 'message':
          await this.handleServerMessage(data);
          break;
          
        // 语音通话相关消息处理
        case 'voice_call_offer':
        case 'voice_call_answer':
        case 'voice_call_ice_candidate':
        case 'voice_call_rejected':
        case 'voice_call_ended':
        // 视频通话相关消息处理
        case 'video_call_offer':
        case 'video_call_answer':
        case 'video_call_ice_candidate':
        case 'video_call_rejected':
        case 'video_call_ended':
        case 'video_call_toggle':
          const handler = this.messageHandlers[data.type];
          if (handler) {
            await handler(data);
          }
          break;

        case 'heartbeat_response':
          this.handleHeartbeatResponse();
          break;

        default:
          break;
      }
    };
  }

  // P2P能力注册功能已移除
  async registerP2PCapability() {
  }

  // 预连接功能已删除
  
  // 智能发送消息（自动选择P2P或C/S）
  async sendMessage(toUserId: any, content: any, options: any = {}) {
    try {
      
      // 优先使用已建立的P2P连接
      if (this.p2pConnections.has(toUserId)) {
        try {
          const p2pResult: any = await this.sendP2PMessage(toUserId, content, options);
          if (p2pResult.success) {
            return { success: true, method: 'P2P', ...p2pResult };
          }
        } catch (p2pError) {
          log.warn(`P2P发送失败，移除连接并降级到服务器转发:`, p2pError);
          // 清理失效的连接
          this.p2pConnections.delete(toUserId);
          if (this.peerConnections.has(toUserId)) {
            this.peerConnections.get(toUserId)?.close();
            this.peerConnections.delete(toUserId);
          }
        }
      }
      
      // P2P暂时禁用，固定使用服务器转发
      // const userStatus = await this.checkUserStatus(toUserId);
      // if (userStatus.online && userStatus.supportsP2P) {
      //   try {
      //     const p2pResult: any = await this.sendP2PMessage(toUserId, content, options);
      //     if (p2pResult.success) {
      //       return { success: true, method: 'P2P', ...p2pResult };
      //     }
      //   } catch (p2pError: any) {
      //     log.warn('P2P发送失败，回退到服务器模式:', p2pError.message);
      //     this.p2pConnections.delete(toUserId);
      //     if (this.peerConnections.has(toUserId)) {
      //       this.peerConnections.get(toUserId)?.close();
      //       this.peerConnections.delete(toUserId);
      //     }
      //   }
      // }

      const serverResult = await this.sendServerMessage(toUserId, content, options);
      return serverResult;
      
    } catch (error: any) {
      log.error('发送消息失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 检查用户状态（C/S API）
  async checkUserStatus(userId: any) {
    try {
      const { hybridApi } = await import('../api/hybrid-api.ts');
      const response = await hybridApi.getUserStatus(userId);
      
      // 后端返回格式是 {success: true, data: {...}}
      const userStatus = response.data?.data;
      
      if (!userStatus) {
        log.warn(`用户 ${userId} 状态数据为空`);
        return { online: false, supportsP2P: false };
      }
      
      // 根据后端返回的字段判断用户状态
      const isOnline = userStatus.status === 'online' && userStatus.hasConnection;
      const supportsP2P = isOnline; // 如果用户在线且有连接，则支持P2P
      
      
      // 确保返回标准化的状态格式
      const normalizedStatus = {
        online: isOnline,
        supportsP2P: supportsP2P,
        lastSeen: userStatus.lastSeen,
        websocketConnected: userStatus.hasConnection,
        lastHeartbeat: userStatus.lastHeartbeat
      };
      
      return normalizedStatus;
      
    } catch (error) {
      log.warn(`检查用户 ${userId} 状态失败，假设离线:`, error);
      return { online: false, supportsP2P: false };
    }
  }

  // P2P直连发送消息
  async sendP2PMessage(toUserId: any, content: any, options: any = {}) {
    try {
      let dataChannel: any = this.p2pConnections.get(toUserId);
      
      if (!dataChannel || dataChannel.readyState !== 'open') {
        // 建立新的P2P连接
        dataChannel = await this.establishP2PConnection(toUserId);
      }
      
      // 发送消息
      const message: any = {
        type: 'direct_message',
        from: this.currentUserId,
        content: content,
        timestamp: getChinaTimeISO()
      };
      
      // 添加阅后即焚支持
      if (options.burnAfter && options.burnAfter > 0) {
        message.destroy_after = options.burnAfter;
      }
      
      dataChannel.send(JSON.stringify(message));
      
      // 存储发送的P2P消息到本地数据库
      try {
        const dbMessage: any = {
          from: this.currentUserId,
          to: toUserId,
          content: content,
          timestamp: message.timestamp,
          method: 'P2P',
          encrypted: false,
          messageType: 'text'
        };
        
        // 添加阅后即焚字段
        if (options.burnAfter && options.burnAfter > 0) {
          dbMessage.destroyAfter = Math.floor(Date.now() / 1000) + options.burnAfter;
        }
        
        await localMessageService.sendMessage(dbMessage);
      } catch (error) {
        log.error('存储P2P消息到本地数据库失败:', error);
      }
      
      return { 
        success: true, 
        method: 'P2P',
        id: generateTempMessageId(),
        timestamp: message.timestamp 
      };
      
    } catch (error: any) {
      log.warn('P2P发送失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 建立P2P连接
  async establishP2PConnection(toUserId: any) {
    return new Promise(async (resolve, reject) => {
      let timeout: any;
      let isResolved = false;
      
      const cleanup = () => {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
        // 不能清空整个map，只要有连接建立成功就不清除
      };
      
      const safeResolve = (result: any) => {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          resolve(result);
        }
      };
      
      const safeReject = (error: any) => {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          reject(error);
        }
      };
      
      try {
        // 创建WebRTC连接
        const peerConnection = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        });

        // 监听连接状态变化
        peerConnection.onconnectionstatechange = () => {
          if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'closed') {
            safeReject(new Error(`P2P连接失败: 连接状态=${peerConnection.connectionState}`));
          }
        };
        
        peerConnection.oniceconnectionstatechange = () => {
          if (peerConnection.iceConnectionState === 'failed' || peerConnection.iceConnectionState === 'closed') {
            safeReject(new Error(`P2P连接失败: ICE状态=${peerConnection.iceConnectionState}`));
          }
        };

        // 创建数据通道
        const dataChannel = peerConnection.createDataChannel('messages', {
          ordered: true
        });

        // 数据通道事件处理
        dataChannel.onopen = () => {
          this.p2pConnections.set(toUserId, dataChannel);
          
          // 通知store更新P2P连接状态
          if (this.onP2PStatusChanged) {
            this.onP2PStatusChanged(toUserId, 'connected');
          }
          
          safeResolve(dataChannel);
        };

        dataChannel.onmessage = async (event) => {
          const message = JSON.parse(event.data);
          if (message.type === 'direct_message' && this.onMessageReceived) {
            const msgData: any = {
              from: message.from,
              to: this.currentUserId,
              content: message.content,
              timestamp: message.timestamp,
              method: 'P2P',
              messageType: message.messageType || 'text',
              filePath: message.filePath || null,
              fileName: message.fileName || null,
              hiddenMessage: message.hiddenMessage || null
            };
            
            // 添加阅后即焚支持
            if (message.destroy_after && message.destroy_after > 0) {
              msgData.destroyAfter = message.destroy_after;
            }
            
            try {
              await localMessageService.receiveMessage(msgData);
            } catch (dbError) {
              log.warn('保存P2P消息到本地数据库失败:', dbError);
            }
            
            this.onMessageReceived(msgData);
          }
        };
        
        dataChannel.onclose = () => {
          this.p2pConnections.delete(toUserId);
          if (this.onP2PStatusChanged) {
            this.onP2PStatusChanged(toUserId, 'disconnected');
          }
        };

        dataChannel.onerror = (error: any) => {
          log.warn(`数据通道错误 (用户 ${toUserId}):`, error.error?.message || error.type || '连接异常');
          this.p2pConnections.delete(toUserId);
          if (this.onP2PStatusChanged) {
            this.onP2PStatusChanged(toUserId, 'disconnected');
          }
          safeReject(error);
        };

        // ICE候选事件
        peerConnection.onicecandidate = (event) => {
          if (event.candidate) {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
              this.ws.send(JSON.stringify({
                type: 'webrtc_ice_candidate',
                to_id: toUserId,
                payload: event.candidate
              }));
            } else {
              log.warn(`WebSocket连接不可用，无法发送ICE候选到用户 ${toUserId}`);
              safeReject(new Error('WebSocket连接断开，P2P连接失败'));
            }
          }
        };

        // 创建Offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        // 发送Offer给对方
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            type: 'webrtc_offer',
            to_id: toUserId,
            payload: { type: offer.type, sdp: offer.sdp }
          }));
        } else {
          log.error(`WebSocket连接不可用，无法发送Offer到用户 ${toUserId}`);
          safeReject(new Error('WebSocket连接断开，无法发送Offer'));
          return;
        }

        // 保存连接
        this.peerConnections.set(toUserId, peerConnection);

        // 设置连接超时
        timeout = setTimeout(() => {
          log.warn(`连接超时，当前状态: 连接=${peerConnection.connectionState}, ICE=${peerConnection.iceConnectionState}`);
          try {
            peerConnection.close();
          } catch (error) {
            log.warn(`关闭超时连接失败:`, error);
          }
          safeReject(new Error(`P2P连接超时: 连接状态=${peerConnection.connectionState}, ICE状态=${peerConnection.iceConnectionState}`));
        }, 15000);

      } catch (error) {
        safeReject(error);
      }
    });
  }

  // 处理P2P Offer
  async handleP2POffer(data: any) {
    try {
      const fromUserId = data.from;
      const peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });
      this.peerConnections.set(fromUserId, peerConnection);

      // 监听连接状态变化
      peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'closed') {
          log.warn(`接收方连接失败: ${peerConnection.connectionState}`);
          this.p2pConnections.delete(fromUserId);
          if (this.peerConnections.has(fromUserId)) {
            this.peerConnections.delete(fromUserId);
          }
        }
      };
      
      peerConnection.oniceconnectionstatechange = () => {
        if (peerConnection.iceConnectionState === 'failed' || peerConnection.iceConnectionState === 'closed') {
          log.warn(`接收方ICE连接失败: ${peerConnection.iceConnectionState}`);
          this.p2pConnections.delete(fromUserId);
          if (this.peerConnections.has(fromUserId)) {
            this.peerConnections.delete(fromUserId);
          }
          try { peerConnection.close(); } catch {}
        }
      };

      // 设置远程描述
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));

      // 监听数据通道
      peerConnection.ondatachannel = (event) => {
        const dataChannel = event.channel;
        
        dataChannel.onopen = () => {
          this.p2pConnections.set(fromUserId, dataChannel);
          
          if (this.onP2PStatusChanged) {
            this.onP2PStatusChanged(fromUserId, 'connected');
          }
        };

        dataChannel.onmessage = async (event) => {
          const message = JSON.parse(event.data);
          if (message.type === 'direct_message' && this.onMessageReceived) {
            const msgData: any = {
              from: message.from,
              to: this.currentUserId,
              content: message.content,
              timestamp: message.timestamp,
              method: 'P2P',
              messageType: message.messageType || 'text',
              filePath: message.filePath || null,
              fileName: message.fileName || null,
              hiddenMessage: message.hiddenMessage || null
            };
            
            if (message.destroy_after && message.destroy_after > 0) {
              msgData.destroyAfter = Math.floor(Date.now() / 1000) + message.destroy_after;
            }
            
            try {
              await localMessageService.receiveMessage(msgData);
            } catch (dbError) {
              log.warn('保存P2P消息到本地数据库失败:', dbError);
            }
            
            this.onMessageReceived(msgData);
          }
        };
        
        dataChannel.onclose = () => {
          this.p2pConnections.delete(fromUserId);
          if (this.onP2PStatusChanged) {
            this.onP2PStatusChanged(fromUserId, 'disconnected');
          }
        };
        
        dataChannel.onerror = (error: any) => {
          log.warn(`接收方数据通道错误 (来自用户 ${fromUserId}):`, error.error?.message || error.type || '连接异常');
          this.p2pConnections.delete(fromUserId);
          if (this.onP2PStatusChanged) {
            this.onP2PStatusChanged(fromUserId, 'disconnected');
          }
        };
      };

      // ICE候选事件
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
              type: 'webrtc_ice_candidate',
              to_id: fromUserId,
              payload: event.candidate
            }));
          } else {
            log.warn(`WebSocket连接不可用，无法发送ICE候选到用户 ${fromUserId}`);
          }
        }
      };

      // 创建Answer
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      // 发送Answer
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'webrtc_answer',
          to_id: fromUserId,
          payload: { type: answer.type, sdp: answer.sdp }
        }));
      } else {
        log.error(`WebSocket连接不可用，无法发送Answer到用户 ${fromUserId}`);
        peerConnection.close();
        return;
      }

      this.peerConnections.set(fromUserId, peerConnection);
      
      setTimeout(() => {
        if (this.peerConnections.has(fromUserId) && 
            peerConnection.connectionState !== 'connected' && 
            peerConnection.connectionState !== 'closed') {
          log.warn(`接收方连接超时: ${fromUserId}`);
          peerConnection.close();
          this.peerConnections.delete(fromUserId);
          this.p2pConnections.delete(fromUserId);
        }
      }, 15000);

    } catch (error) {
      log.error('处理P2P Offer失败:', error);
      const fromUserId = data.from;
      if (this.peerConnections.has(fromUserId)) {
        const pc = this.peerConnections.get(fromUserId);
        pc?.close();
        this.peerConnections.delete(fromUserId);
      }
      this.p2pConnections.delete(fromUserId);
    }
  }

  // 处理P2P Answer
  async handleP2PAnswer(data: any) {
    try {
      const fromUserId = data.from;
      const peerConnection = this.peerConnections.get(fromUserId);
      if (!peerConnection) {
        log.warn(`未找到与 ${fromUserId} 的连接`);
        return;
      }
      
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));

      // 回放缓冲的ICE候选
      const pending = this.pendingIceCandidates?.get(fromUserId);
      if (pending && pending.length > 0) {
        for (const candidate of pending) {
          try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            log.warn(`回放ICE候选失败:`, e);
          }
        }
        this.pendingIceCandidates.delete(fromUserId);
      }

    } catch (error) {
      const fromUserId = data.from;
      log.error(`处理来自 ${fromUserId} 的Answer失败:`, error);
      if (this.peerConnections.has(fromUserId)) {
        const pc = this.peerConnections.get(fromUserId);
        pc?.close();
        this.peerConnections.delete(fromUserId);
      }
      this.p2pConnections.delete(fromUserId);
    }
  }

  // 处理ICE候选
  async handleIceCandidate(data: any) {
    try {
      const fromUserId = data.from;
      const peerConnection = this.peerConnections.get(fromUserId);
      if (!peerConnection) {
        log.warn(`未找到与 ${fromUserId} 的连接`);
        return;
      }
      
      if (peerConnection.connectionState === 'closed') {
        log.warn(`与 ${fromUserId} 的连接已关闭，忽略ICE候选`);
        this.peerConnections.delete(fromUserId);
        return;
      }
      
      if (!data.candidate) {
        return;
      }
      
      if (peerConnection.remoteDescription) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      } else {
        log.warn(`收到来自 ${fromUserId} 的ICE候选，但远程描述尚未设置`);
        if (!this.pendingIceCandidates) {
          this.pendingIceCandidates = new Map();
        }
        if (!this.pendingIceCandidates.has(fromUserId)) {
          this.pendingIceCandidates.set(fromUserId, []);
        }
        this.pendingIceCandidates.get(fromUserId)?.push(data.candidate);
      }
      
    } catch (error) {
      log.error(`处理来自 ${data.from} 的ICE候选失败:`, error);
    }
  }

  // 服务器转发消息（C/S模式）
  async encryptForServerTransport(toUserId: any, content: any, messageType = 'text') {
    if (!this.signalReady || !this.signalRuntime || messageType !== 'text' || typeof content !== 'string') {
      return { content, encrypted: false };
    }

    try {
      const { hybridApi } = await import('../api/hybrid-api.ts');
      const bundleResponse = await hybridApi.getPreKeyBundle(toUserId, true);
      const recipientBundle = extractPayload(bundleResponse);
      const envelope: SignalEnvelope = await this.signalRuntime.encryptMessage({
        toUserId,
        plaintext: content,
        recipientBundle,
      });

      return {
        content: serializeSignalEnvelope(envelope),
        encrypted: true,
        envelope,
      };
    } catch (error) {
      log.warn('Failed to encrypt server message, falling back to plaintext transport:', error);
      return { content, encrypted: false };
    }
  }

  async decryptFromServerTransport(fromUserId: any, content: any) {
    const envelope = parseSignalEnvelope(String(content ?? ''));
    if (!envelope) {
      return { content, encrypted: false };
    }

    if (!this.signalRuntime) {
      this.signalRuntime = new SignalTauriRuntime({ userId: this.currentUserId as any });
    }

    try {
      const plaintext = await this.signalRuntime.decryptMessage({
        fromUserId,
        envelope,
      });
      this.signalReady = true;
      return { content: plaintext, encrypted: true, envelope };
    } catch (error) {
      log.error('Failed to decrypt server message:', error);
      return { content: '[Signal message could not be decrypted]', encrypted: true, envelope, error };
    }
  }

  async sendServerMessage(toUserId: any, content: any, options: any = {}) {
    try {
      
      const messageType = options.messageType || 'text';
      const transportMessage = await this.encryptForServerTransport(toUserId, content, messageType);

      const messageData: any = {
        to: toUserId,
        encryptedContent: transportMessage.content,
        messageType
      };
      
      if (options.burnAfter && options.burnAfter > 0) {
        messageData.destroy_after = options.burnAfter;
      }
      
      const { hybridApi } = await import('../api/hybrid-api.ts');
      const response = await hybridApi.sendMessage(messageData);

      const result = response.data;
      
      try {
        const sentMsgData: any = {
          from: this.currentUserId,
          to: toUserId,
          content: content,
          timestamp: result.timestamp || getChinaTimeISO(),
          method: 'Server',
          messageType,
          encrypted: false,
          signalEncrypted: transportMessage.encrypted
        };
        
        if (options.burnAfter && options.burnAfter > 0) {
          sentMsgData.destroyAfter = Math.floor(Date.now() / 1000) + options.burnAfter;
        }
        
        await localMessageService.sendMessage(sentMsgData);
      } catch (dbError) {
        log.warn('保存发送的服务器消息到本地数据库失败:', dbError);
      }
      
      return { 
        success: true, 
        method: 'Server',
        id: result.id || result.message_id,
        timestamp: result.timestamp
      };

    } catch (error: any) {
      log.error('sendServerMessage错误:', error);
      return { success: false, error: error.message };
    }
  }

  // 处理服务器转发的消息
  async handleServerMessage(data: any) {
    const voiceCallMessageTypes = [
      'voice_call_offer',
      'voice_call_answer', 
      'voice_call_ice_candidate',
      'voice_call_rejected',
      'voice_call_ended'
    ];
    
    if (voiceCallMessageTypes.includes(data.type)) {
      const handler = this.messageHandlers[data.type];
      if (handler) {
        await handler(data);
      }
      return;
    }
    
    const payload = extractWsPayload(data);
    const fromUserId = payload.fromId || payload.from_id || payload.from;
    const encryptedContent = payload.encryptedContent || payload.encrypted_content || payload.content || '';
    const transportMessage = await this.decryptFromServerTransport(fromUserId, encryptedContent);

    const msgData: any = {
      id: payload.id || generateTempMessageId(),
      from: fromUserId,
      to: this.currentUserId,
      content: transportMessage.content,
      timestamp: payload.timestamp,
      method: 'Server',
      messageType: payload.messageType || payload.message_type || 'text',
      filePath: payload.filePath || payload.file_path || null,
      fileName: payload.fileName || payload.file_name || null,
      hiddenMessage: payload.hiddenMessage || payload.hidden_message || null,
      encrypted: false,
      signalEncrypted: transportMessage.encrypted
    };
    
    if (payload.destroy_after && payload.destroy_after > 0) {
      msgData.destroyAfter = Math.floor(Date.now() / 1000) + payload.destroy_after;
    }
    
    try {
      await localMessageService.receiveMessage(msgData);
    } catch (dbError) {
      log.error('保存服务器消息到数据库失败:', dbError);
    }
    
    if (this.onMessageReceived) {
      this.onMessageReceived(msgData);
    }
  }

  // 获取消息历史（C/S API）
  async getMessageHistory(userId: any) {
    try {
      const { hybridApi } = await import('../api/hybrid-api.ts');
      const response = await hybridApi.getMessageHistory(userId);
      return response.data;
    } catch (error) {
      log.error('获取消息历史失败:', error);
      return [];
    }
  }

  // 关闭P2P连接
  closeP2PConnection(userId: any) {
    const dataChannel = this.p2pConnections.get(userId);
    const peerConnection = this.peerConnections.get(userId);

    if (dataChannel) {
      try {
        if (dataChannel.readyState === 'open' || dataChannel.readyState === 'connecting') {
          dataChannel.close();
        } else {
        }
      } catch (error) {
        log.warn(`关闭用户 ${userId} 的数据通道失败:`, error);
      }
      this.p2pConnections.delete(userId);
    }

    if (peerConnection) {
      peerConnection.close();
      this.peerConnections.delete(userId);
    }
    
    if (this.onP2PStatusChanged) {
      this.onP2PStatusChanged(userId, 'disconnected');
    }
  }

  // 设置页面关闭时的处理逻辑
  setupBeforeUnloadHandler() {
    window.addEventListener('beforeunload', (event) => {
    });
  }
  
  // 获取P2P连接状态
  getP2PConnectionStatus(userId: any) {
    const connection = this.p2pConnections.get(userId);
    if (!connection) {
      return { connected: false, status: 'disconnected' };
    }
    
    return {
      connected: connection.readyState === 'open',
      status: connection.readyState,
      bufferedAmount: connection.bufferedAmount || 0
    };
  }
  
  // 获取所有P2P连接状态
  getAllP2PConnectionStatus() {
    const status: any = {};
    this.p2pConnections.forEach((connection, userId) => {
      status[userId] = this.getP2PConnectionStatus(userId);
    });
    return status;
  }
  
  // 定期清理无效连接
  startConnectionHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    this.healthCheckInterval = setInterval(() => {
      
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({
            type: 'heartbeat',
            timestamp: getChinaTimeISO()
          }));
        } catch (error) {
          log.error('发送WebSocket心跳失败:', error);
        }
      }
      
      const toRemove: any[] = [];
      this.p2pConnections.forEach((connection, userId) => {
        if (connection.readyState === 'closed' || connection.readyState === 'closing') {
          toRemove.push(userId);
        }
      });
      
      toRemove.forEach(userId => {
        this.p2pConnections.delete(userId);
        if (this.peerConnections.has(userId)) {
          try {
            this.peerConnections.get(userId)?.close();
          } catch (error) {
            log.warn(`关闭WebRTC连接失败:`, error);
          }
          this.peerConnections.delete(userId);
        }
      });
      
    }, 60000); 
  }
  
  // 停止连接健康检查
  stopConnectionHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }
  
  // 清理资源
  cleanup() {
    
    this.stopConnectionHealthCheck();
    
    this.p2pConnections.forEach((connection, userId) => {
      try {
        if (connection.readyState === 'open' || connection.readyState === 'connecting') {
          connection.close();
        } else {
        }
      } catch (error) {
        log.warn(`关闭与用户 ${userId} 的P2P连接失败:`, error);
      }
    });
    this.p2pConnections.clear();
    
    this.peerConnections.forEach((peerConnection, userId) => {
      try {
        peerConnection.close();
      } catch (error) {
        log.warn(`关闭与用户 ${userId} 的WebRTC连接失败:`, error);
      }
    });
    this.peerConnections.clear();
    
    if (this.pendingIceCandidates) {
      this.pendingIceCandidates.clear();
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
  
  async setOfflineStatus() {
  }

  // ==================== 语音通话功能 ====================
  
  initVoiceCallState() {
    const existingOnVoiceCallReceived = this.onVoiceCallReceived;
    const existingOnVoiceCallStatusChanged = this.onVoiceCallStatusChanged;
    
    if (this.voiceCallState) {
      if (this.voiceCallState.localStream) {
        this.voiceCallState.localStream.getTracks().forEach((track: any) => {
          track.stop();
        });
      }
      if (this.voiceCallState.peerConnection) {
        this.voiceCallState.peerConnection.close();
      }
    }
    
    this.voiceCallState = {
      isInCall: false,
      currentCallId: null,
      localStream: null,
      remoteStream: null,
      peerConnection: null,
      callType: null,
      targetUserId: null,
      callStartTime: null,
      encryptionKey: null,
      audioContext: null,
      encryptionEnabled: true
    };
    
    if (existingOnVoiceCallReceived !== undefined) {
      this.onVoiceCallReceived = existingOnVoiceCallReceived;
    }
    if (existingOnVoiceCallStatusChanged !== undefined) {
      this.onVoiceCallStatusChanged = existingOnVoiceCallStatusChanged;
    }
    
    this.voiceConnections = new Map();
    this.remoteStreams = new Map();
    this.currentVoiceCall = null;
    this.localStream = null;
    
    this.initAudioEncryption();
  }
  
  initVideoCallState() {
    const existingOnVideoCallReceived = this.onVideoCallReceived;
    const existingOnVideoCallStatusChanged = this.onVideoCallStatusChanged;
    
    if (this.videoCallState) {
      if (this.videoCallState.localStream) {
        this.videoCallState.localStream.getTracks().forEach((track: any) => {
          track.stop();
        });
      }
      if (this.videoCallState.peerConnection) {
        this.videoCallState.peerConnection.close();
      }
    }
    
    this.videoCallState = {
      isInCall: false,
      currentCallId: null,
      localStream: null,
      remoteStream: null,
      peerConnection: null,
      callType: null,
      targetUserId: null,
      callStartTime: null,
      encryptionKey: null,
      audioContext: null,
      encryptionEnabled: true,
      isVideoEnabled: true,
      isAudioEnabled: true
    };
    
    if (existingOnVideoCallReceived !== undefined) {
      this.onVideoCallReceived = existingOnVideoCallReceived;
    }
    if (existingOnVideoCallStatusChanged !== undefined) {
      this.onVideoCallStatusChanged = existingOnVideoCallStatusChanged;
    }
    
    this.videoConnections = new Map();
    this.remoteVideoStreams = new Map();
    this.currentVideoCall = null;
    this.localVideoStream = null;
    
    this.initVideoEncryption();
  }
  
  initVideoEncryption() {
    try {
      this.generateVideoEncryptionKey();
    } catch (error) {
      log.error('初始化失败:', error);
    }
  }
  
  generateVideoEncryptionKey() {
    const key = new Uint8Array(32);
    crypto.getRandomValues(key);
    this.videoCallState.encryptionKey = key;
    return key;
  }
  
  initAudioEncryption() {
    try {
      this.generateEncryptionKey();
    } catch (error) {
      log.error('初始化失败:', error);
    }
  }
  
  generateEncryptionKey() {
    const key = new Uint8Array(32);
    crypto.getRandomValues(key);
    this.voiceCallState.encryptionKey = key;
    return key;
  }
  
  encryptAudioData(audioData: any, key: any) {
    if (!key || !this.voiceCallState.encryptionEnabled) {
      return audioData;
    }
    
    const encrypted = new Uint8Array(audioData.length);
    for (let i = 0; i < audioData.length; i++) {
      encrypted[i] = audioData[i] ^ key[i % key.length];
    }
    return encrypted;
  }
  
  decryptAudioData(encryptedData: any, key: any) {
    return this.encryptAudioData(encryptedData, key);
  }

  async initiateVoiceCall(toUserId: any) {
    try {
      
      if (this.voiceCallState && this.voiceCallState.isInCall) {
        await this.forceResetVoiceCallState();
      }
      
      await this.forceResetVoiceCallState();
      
      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000
        },
        video: false
      });
      
      
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      this.voiceCallState.audioContext = audioContext;
      
      const peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }
        ],
        iceCandidatePoolSize: 10
      });
      
      const dataChannel = peerConnection.createDataChannel('videoCall', {
        ordered: true
      });
      
      dataChannel.onopen = () => {
      };
      
      dataChannel.onclose = () => {
      };
      
      dataChannel.onerror = (error: any) => {
        if (error.error && error.error.name === 'OperationError' && 
            error.error.message.includes('User-Initiated Abort')) {
          return;
        }
        log.warn('数据通道错误:', error);
      };
      
      dataChannel.onmessage = (event) => {
      };
      
      peerConnection.ondatachannel = (event) => {
        const channel = event.channel;
        
        channel.onopen = () => {
        };
        
        channel.onclose = () => {
        };
        
        channel.onerror = (error: any) => {
          if (error.error && error.error.name === 'OperationError' && 
              error.error.message.includes('User-Initiated Abort')) {
            return;
          }
          log.warn('接收数据通道错误:', error);
        };
      };
      
      localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
      });
      
      peerConnection.ontrack = (event) => {
        const remoteStream = event.streams[0];
        
        if (this.voiceCallState.encryptionEnabled && this.voiceCallState.encryptionKey) {
        }
        
        this.voiceCallState.remoteStream = remoteStream;
        this.remoteStreams.set(toUserId, remoteStream);
        
        if (this.onVoiceCallStatusChanged) {
          this.onVoiceCallStatusChanged({
            type: 'remote_stream_received',
            stream: remoteStream
          });
        }
      };
      
      peerConnection.onconnectionstatechange = () => {
        if (this.onVoiceCallStatusChanged) {
          this.onVoiceCallStatusChanged({
            type: 'connection_state_changed',
            state: peerConnection.connectionState
          });
        }
        
        if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
          setTimeout(() => {
            this.forceResetVoiceCallState();
          }, 1000);
        }
      };
      
      peerConnection.onicecandidate = (event) => {
        if (event.candidate && this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            type: 'voice_call_ice_candidate',
            to_id: toUserId,
            payload: event.candidate
          }));
        }
      };
      
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      });
      await peerConnection.setLocalDescription(offer);
      
      const callId = generateTempMessageId();
      
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const message = {
          type: 'voice_call_offer',
          to_id: toUserId,
          call_id: callId,
          payload: offer,
          encryption_key: this.voiceCallState.encryptionEnabled ? 
            Array.from(this.voiceCallState.encryptionKey) : null
        };
        this.ws.send(JSON.stringify(message));
      } else {
        throw new Error('WebSocket连接不可用，无法发起语音通话');
      }
      
      this.voiceCallState.isInCall = true;
      this.voiceCallState.currentCallId = callId;
      this.voiceCallState.localStream = localStream;
      this.voiceCallState.peerConnection = peerConnection;
      this.voiceCallState.callType = 'outgoing';
      this.voiceCallState.targetUserId = toUserId;
      this.voiceCallState.callStartTime = getChinaTimeISO();
      
      this.localStream = localStream;
      this.currentVoiceCall = {
        userId: toUserId,
        type: 'outgoing',
        status: 'connecting'
      };
      this.voiceConnections.set(toUserId, peerConnection);
      
      
      return {
        success: true,
        callId: callId,
        localStream: localStream,
        encryptionEnabled: this.voiceCallState.encryptionEnabled
      };
      
    } catch (error) {
      log.error('发起通话失败:', error);
      await this.forceResetVoiceCallState();
      throw error;
    }
  }
  
  async initiateVideoCall(toUserId: any) {
    try {
      
      if (this.videoCallState && this.videoCallState.isInCall) {
        await this.forceResetVideoCallState();
      }
      
      await this.forceResetVideoCallState();
      
      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000
        },
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        }
      });
      
      
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      this.videoCallState.audioContext = audioContext;
      
      const peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }
        ],
        iceCandidatePoolSize: 10
      });
      
      const dataChannel = peerConnection.createDataChannel('videoCall', {
        ordered: true
      });
      
      dataChannel.onopen = () => {
      };
      
      dataChannel.onclose = () => {
      };
      
      dataChannel.onerror = (error: any) => {
        log.warn('数据通道错误:', error);
      };
      
      dataChannel.onmessage = (event) => {
      };
      
      peerConnection.ondatachannel = (event) => {
        const channel = event.channel;
        
        channel.onopen = () => {
        };
        
        channel.onclose = () => {
        };
        
        channel.onerror = (error: any) => {
          log.warn('接收数据通道错误:', error);
        };
        
        channel.onmessage = (event) => {
        };
      };
      
      localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
      });
      
      peerConnection.ontrack = (event) => {
        const remoteStream = event.streams[0];
        
        if (this.videoCallState.encryptionEnabled && this.videoCallState.encryptionKey) {
        }
        
        this.videoCallState.remoteStream = remoteStream;
        this.remoteVideoStreams.set(toUserId, remoteStream);
        
        if (this.onVideoCallStatusChanged) {
          this.onVideoCallStatusChanged({
            type: 'remote_stream_received',
            stream: remoteStream
          });
        }
      };
      
      peerConnection.onconnectionstatechange = () => {
        if (this.onVideoCallStatusChanged) {
          this.onVideoCallStatusChanged({
            type: 'connection_state_changed',
            state: peerConnection.connectionState
          });
        }
        
        if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
          setTimeout(() => {
            this.forceResetVideoCallState();
          }, 1000);
        }
      };
      
      peerConnection.onicecandidate = (event) => {
        if (event.candidate && this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            type: 'video_call_ice_candidate',
            to_id: toUserId,
            payload: event.candidate
          }));
        }
      };
      
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await peerConnection.setLocalDescription(offer);
      
      const callId = generateTempMessageId();
      
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const message = {
          type: 'video_call_offer',
          to_id: toUserId,
          call_id: callId,
          payload: offer,
          encryption_key: this.videoCallState.encryptionEnabled ? 
            Array.from(this.videoCallState.encryptionKey) : null
        };
        this.ws.send(JSON.stringify(message));
      } else {
        throw new Error('WebSocket连接不可用，无法发起视频通话');
      }
      
      this.videoCallState.isInCall = true;
      this.videoCallState.currentCallId = callId;
      this.videoCallState.localStream = localStream;
      this.videoCallState.peerConnection = peerConnection;
      this.videoCallState.dataChannel = dataChannel;
      this.videoCallState.callType = 'outgoing';
      this.videoCallState.targetUserId = toUserId;
      this.videoCallState.callStartTime = getChinaTimeISO();
      
      this.localVideoStream = localStream;
      this.currentVideoCall = {
        userId: toUserId,
        type: 'outgoing',
        status: 'connecting'
      };
      this.videoConnections.set(toUserId, peerConnection);
      
      
      return {
        success: true,
        callId: callId,
        localStream: localStream,
        encryptionEnabled: this.videoCallState.encryptionEnabled
      };
      
    } catch (error) {
      log.error('发起通话失败:', error);
      await this.forceResetVideoCallState();
      throw error;
    }
  }
  
  async acceptVoiceCall(fromUserId: any, offer: any, encryptionKey: any = null) {
    try {
      
      await this.forceResetVoiceCallState();
      
      if (encryptionKey && Array.isArray(encryptionKey)) {
        this.voiceCallState.encryptionKey = new Uint8Array(encryptionKey);
      }
      
      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000
        },
        video: false
      });
      
      
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      this.voiceCallState.audioContext = audioContext;
      
      const peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }
        ],
        iceCandidatePoolSize: 10
      });
      
      peerConnection.ondatachannel = (event) => {
        const channel = event.channel;
        
        channel.onopen = () => {
        };
        
        channel.onclose = () => {
        };
        
        channel.onerror = (error: any) => {
          log.warn('接收数据通道错误:', error);
        };
        
        channel.onmessage = (event) => {
        };
      };
      
      localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
      });
      
      peerConnection.ontrack = (event) => {
        const remoteStream = event.streams[0];
        
        if (this.voiceCallState.encryptionEnabled && this.voiceCallState.encryptionKey) {
        }
        
        this.voiceCallState.remoteStream = remoteStream;
        this.remoteStreams.set(fromUserId, remoteStream);
        
        if (this.onVoiceCallStatusChanged) {
          this.onVoiceCallStatusChanged({
            type: 'remote_stream_received',
            stream: remoteStream
          });
        }
      };
      
      peerConnection.onconnectionstatechange = () => {
        if (this.onVoiceCallStatusChanged) {
          this.onVoiceCallStatusChanged({
            type: 'connection_state_changed',
            state: peerConnection.connectionState
          });
        }
        
        if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
          setTimeout(() => {
            this.forceResetVoiceCallState();
          }, 1000);
        }
      };
      
      peerConnection.onicecandidate = (event) => {
        if (event.candidate && this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            type: 'voice_call_ice_candidate',
            to_id: fromUserId,
            payload: event.candidate
          }));
        }
      };
      
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      
      const answer = await peerConnection.createAnswer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      });
      await peerConnection.setLocalDescription(answer);
      
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'voice_call_answer',
          to_id: fromUserId,
          payload: {
            type: answer.type,
            sdp: answer.sdp
          },
          encryption_confirmed: this.voiceCallState.encryptionEnabled && !!this.voiceCallState.encryptionKey
        }));
      } else {
        throw new Error('WebSocket连接不可用，无法接听语音通话');
      }
      
      this.voiceCallState.isInCall = true;
      this.voiceCallState.currentCallId = generateTempMessageId();
      this.voiceCallState.localStream = localStream;
      this.voiceCallState.peerConnection = peerConnection;
      this.voiceCallState.callType = 'incoming';
      this.voiceCallState.targetUserId = fromUserId;
      this.voiceCallState.callStartTime = getChinaTimeISO();
      
      this.localStream = localStream;
      this.currentVoiceCall = {
        userId: fromUserId,
        type: 'incoming',
        status: 'active'
      };
      this.voiceConnections.set(fromUserId, peerConnection);
      
      
      return {
        success: true,
        localStream: localStream,
        encryptionEnabled: this.voiceCallState.encryptionEnabled
      };
      
    } catch (error) {
      log.error('接听通话失败:', error);
      await this.forceResetVoiceCallState();
      throw error;
    }
  }
  
  async rejectVoiceCall(fromUserId: any) {
    try {
      
      await this.saveVoiceCallRecord(fromUserId, 'rejected');
      
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'voice_call_rejected',
          to_id: fromUserId
        }));
      }
      
      const existingOnVoiceCallReceived = this.onVoiceCallReceived;
      const existingOnVoiceCallStatusChanged = this.onVoiceCallStatusChanged;
      
      await this.forceResetVoiceCallState();
      
      this.onVoiceCallReceived = existingOnVoiceCallReceived;
      this.onVoiceCallStatusChanged = existingOnVoiceCallStatusChanged;
      
      
      return { success: true };
      
    } catch (error) {
      log.error('拒绝通话失败:', error);
      throw error;
    }
  }
  
  async acceptVideoCall(fromUserId: any, offer: any, encryptionKey: any = null) {
    try {
      
      await this.forceResetVideoCallState();
      
      if (encryptionKey && Array.isArray(encryptionKey)) {
        this.videoCallState.encryptionKey = new Uint8Array(encryptionKey);
      }
      
      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000
        },
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        }
      });
      
      
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      this.videoCallState.audioContext = audioContext;
      
      const peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }
        ],
        iceCandidatePoolSize: 10
      });
      
      localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
      });
      
      peerConnection.ontrack = (event) => {
        const remoteStream = event.streams[0];
        
        this.videoCallState.remoteStream = remoteStream;
        this.remoteVideoStreams.set(fromUserId, remoteStream);
        
        if (this.onVideoCallStatusChanged) {
          this.onVideoCallStatusChanged({
            type: 'remote_stream_received',
            stream: remoteStream
          });
        }
      };
      
      peerConnection.onconnectionstatechange = () => {
        if (this.onVideoCallStatusChanged) {
          this.onVideoCallStatusChanged({
            type: 'connection_state_changed',
            state: peerConnection.connectionState
          });
        }
        
        if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
          setTimeout(() => {
            this.forceResetVideoCallState();
          }, 1000);
        }
      };
      
      peerConnection.onicecandidate = (event) => {
        if (event.candidate && this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            type: 'video_call_ice_candidate',
            to_id: fromUserId,
            payload: event.candidate
          }));
        }
      };
      
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      
      const answer = await peerConnection.createAnswer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await peerConnection.setLocalDescription(answer);
      
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'video_call_answer',
          to_id: fromUserId,
          payload: {
            type: answer.type,
            sdp: answer.sdp
          },
          encryption_confirmed: this.videoCallState.encryptionEnabled && !!this.videoCallState.encryptionKey
        }));
      } else {
        throw new Error('WebSocket连接不可用，无法接听视频通话');
      }
      
      this.videoCallState.isInCall = true;
      this.videoCallState.currentCallId = generateTempMessageId();
      this.videoCallState.localStream = localStream;
      this.videoCallState.peerConnection = peerConnection;
      this.videoCallState.callType = 'incoming';
      this.videoCallState.targetUserId = fromUserId;
      this.videoCallState.callStartTime = getChinaTimeISO();
      
      this.localVideoStream = localStream;
      this.currentVideoCall = {
        userId: fromUserId,
        type: 'incoming',
        status: 'active'
      };
      this.videoConnections.set(fromUserId, peerConnection);
      
      
      return {
        success: true,
        localStream: localStream,
        encryptionEnabled: this.videoCallState.encryptionEnabled
      };
      
    } catch (error) {
      log.error('接听通话失败:', error);
      await this.forceResetVideoCallState();
      throw error;
    }
  }
  
  async rejectVideoCall(fromUserId: any) {
    try {
      
      await this.saveVideoCallRecord(fromUserId, 'rejected');
      
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'video_call_rejected',
          to_id: fromUserId
        }));
      }
      
      const existingOnVideoCallReceived = this.onVideoCallReceived;
      const existingOnVideoCallStatusChanged = this.onVideoCallStatusChanged;
      
      await this.forceResetVideoCallState();
      
      this.onVideoCallReceived = existingOnVideoCallReceived;
      this.onVideoCallStatusChanged = existingOnVideoCallStatusChanged;
      
      
      return { success: true };
      
    } catch (error) {
      log.error('拒绝通话失败:', error);
      throw error;
    }
  }
  
  async endVideoCall(userId: any) {
    try {
      
      if (this.videoCallState && this.videoCallState.callStartTime) {
        await this.saveVideoCallRecord(userId, 'completed');
      }
      
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'video_call_ended',
          to_id: userId
        }));
      }
      
      const existingOnVideoCallReceived = this.onVideoCallReceived;
      const existingOnVideoCallStatusChanged = this.onVideoCallStatusChanged;
      
      await this.forceResetVideoCallState();
      
      this.onVideoCallReceived = existingOnVideoCallReceived;
      this.onVideoCallStatusChanged = existingOnVideoCallStatusChanged;
      
      if (this.onVideoCallStatusChanged) {
        this.onVideoCallStatusChanged({
          type: 'call_ended_local',
          userId: userId
        });
      }
      
      
      return { success: true };
      
    } catch (error) {
      log.error('结束通话失败:', error);
      throw error;
    }
  }

  async endVoiceCall(userId: any) {
    try {
      
      if (this.voiceCallState && this.voiceCallState.callStartTime) {
        await this.saveVoiceCallRecord(userId, 'completed');
      }
      
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'voice_call_ended',
          to_id: userId
        }));
      }
      
      const existingOnVoiceCallReceived = this.onVoiceCallReceived;
      const existingOnVoiceCallStatusChanged = this.onVoiceCallStatusChanged;
      
      await this.forceResetVoiceCallState();
      
      this.onVoiceCallReceived = existingOnVoiceCallReceived;
      this.onVoiceCallStatusChanged = existingOnVoiceCallStatusChanged;
      
      if (this.onVoiceCallStatusChanged) {
        this.onVoiceCallStatusChanged({
          type: 'call_ended_local',
          userId: userId
        });
      }
      
      
      return { success: true };
      
    } catch (error) {
      log.error('结束通话失败:', error);
      throw error;
    }
  }
  
  toggleMute() {
    if (this.voiceCallState && this.voiceCallState.localStream) {
      const audioTracks = this.voiceCallState.localStream.getAudioTracks();
      audioTracks.forEach((track: any) => {
        track.enabled = !track.enabled;
      });
      return !audioTracks[0]?.enabled;
    }
    return false;
  }
  
  async forceResetVoiceCallState() {
    try {
      
      if (this.voiceCallState) {
        if (this.voiceCallState.localStream) {
          this.voiceCallState.localStream.getTracks().forEach((track: any) => {
            track.stop();
          });
        }
        if (this.voiceCallState.peerConnection) {
          this.voiceCallState.peerConnection.close();
        }
        if (this.voiceCallState.audioContext) {
          try {
            await this.voiceCallState.audioContext.close();
          } catch (error) {
            log.warn('关闭音频上下文失败:', error);
          }
        }
      }
      
      if (this.voiceConnections) {
        this.voiceConnections.forEach((connection, userId) => {
          try {
            connection.close();
          } catch (error) {
            log.warn(`关闭与用户 ${userId} 的连接失败:`, error);
          }
        });
        this.voiceConnections.clear();
      }
      
      if (this.remoteStreams) {
        this.remoteStreams.clear();
      }
      
      this.localStream = null;
      this.currentVoiceCall = null;
      
      this.initVoiceCallState();
      
      
      return { success: true };
      
    } catch (error: any) {
      log.error('强制重置状态失败:', error);
      return { success: false, error: error.message };
    }
  }
  
  async forceResetVideoCallState() {
    try {
      
      if (this.videoCallState) {
        if (this.videoCallState.localStream) {
          this.videoCallState.localStream.getTracks().forEach((track: any) => {
            track.stop();
          });
        }
        if (this.videoCallState.dataChannel) {
          try {
            if (this.videoCallState.dataChannel.readyState === 'open' || 
                this.videoCallState.dataChannel.readyState === 'connecting') {
              this.videoCallState.dataChannel.close();
            } else {
            }
          } catch (error) {
            log.warn('关闭数据通道失败:', error);
          }
        }
        if (this.videoCallState.peerConnection) {
          this.videoCallState.peerConnection.close();
        }
        if (this.videoCallState.audioContext) {
          try {
            await this.videoCallState.audioContext.close();
          } catch (error) {
            log.warn('关闭音频上下文失败:', error);
          }
        }
      }
      
      if (this.videoConnections) {
        this.videoConnections.forEach((connection, userId) => {
          try {
            connection.close();
          } catch (error) {
            log.warn(`关闭与用户 ${userId} 的连接失败:`, error);
          }
        });
        this.videoConnections.clear();
      }
      
      if (this.remoteVideoStreams) {
        this.remoteVideoStreams.clear();
      }
      
      this.localVideoStream = null;
      this.currentVideoCall = null;
      
      this.initVideoCallState();
      
      
      return { success: true };
      
    } catch (error: any) {
      log.error('强制重置状态失败:', error);
      return { success: false, error: error.message };
    }
  }
  
   async saveVoiceCallRecord(userId: any, callStatus: any) {
     try {
       const callEndTime = getChinaTimeISO();
       let callStartTime = callEndTime;
       let duration = 0;
       
       if (this.voiceCallState && this.voiceCallState.callStartTime) {
         callStartTime = this.voiceCallState.callStartTime;
         const startTime: any = new Date(callStartTime);
         const endTime: any = new Date(callEndTime);
         duration = Math.floor((endTime - startTime) / 1000);
       } else {
         log.warn('缺少通话开始时间，使用当前时间作为开始时间');
       }
      
      const callInfo = {
        type: 'voice_call',
        status: callStatus,
        duration: duration,
        startTime: callStartTime,
        endTime: callEndTime
      };
      
      const callRecord = {
         to: userId,
         content: JSON.stringify(callInfo),
         messageType: 'voice_call',
         method: 'Server',
         encrypted: false
       };
      
      
      try {
        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
        const response = await fetch(`${API_BASE_URL}/v1/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify(callRecord)
        });
        
        if (response.ok) {
        } else {
          log.error('保存通话记录失败:', response.statusText);
        }
      } catch (fetchError) {
        log.error('保存通话记录网络错误:', fetchError);
      }
      
      if (this.onMessageReceived) {
        const messageForUI = {
          id: generateTempMessageId(),
          from: this.currentUserId,
          to: userId,
          content: `语音通话 - ${callStatus === 'completed' ? '已完成' : callStatus === 'rejected' ? '被拒绝' : callStatus}`,
          messageType: 'voice_call',
          callDuration: duration,
          callStatus: callStatus,
          callStartTime: callStartTime,
          callEndTime: callEndTime,
          timestamp: callEndTime,
          method: 'Server'
        };
        
        this.onMessageReceived(messageForUI);
      }
      
    } catch (error) {
      log.error('保存通话记录异常:', error);
    }
  }
  
  async handleVoiceCallOffer(data: any) {
    try {
      
      let encryptionKey = null;
      if (data.encryption_key && Array.isArray(data.encryption_key)) {
        encryptionKey = data.encryption_key;
      }
      
      if (this.onVoiceCallReceived) {
        this.onVoiceCallReceived({
          type: 'incoming_call',
          fromUserId: data.from_id,
          callId: data.call_id,
          offer: data.payload,
          encryptionKey: encryptionKey
        });
      }
      
    } catch (error) {
      log.error('处理通话邀请失败:', error);
    }
  }
  
  async handleVoiceCallAnswer(data: any) {
    try {
      
      if (this.voiceCallState && this.voiceCallState.peerConnection) {
        await this.voiceCallState.peerConnection.setRemoteDescription(
          new RTCSessionDescription(data.payload)
        );
        
        if (this.onVoiceCallStatusChanged) {
          this.onVoiceCallStatusChanged({
            type: 'call_answered',
            fromUserId: data.from_id
          });
        }
      }
      
    } catch (error) {
      log.error('处理通话应答失败:', error);
    }
  }
  
  async handleVoiceCallIceCandidate(data: any) {
    try {
      
      if (this.voiceCallState && this.voiceCallState.peerConnection) {
        await this.voiceCallState.peerConnection.addIceCandidate(
          new RTCIceCandidate(data.payload)
        );
      }
      
    } catch (error) {
      log.error('处理ICE候选失败:', error);
    }
  }
  
  async handleVoiceCallRejected(data: any) {
    try {
      
      await this.saveVoiceCallRecord(data.from_id, 'rejected');
      
      const existingOnVoiceCallReceived = this.onVoiceCallReceived;
      const existingOnVoiceCallStatusChanged = this.onVoiceCallStatusChanged;
      
      await this.forceResetVoiceCallState();
      
      this.onVoiceCallReceived = existingOnVoiceCallReceived;
      this.onVoiceCallStatusChanged = existingOnVoiceCallStatusChanged;
      
      if (this.onVoiceCallStatusChanged) {
        this.onVoiceCallStatusChanged({
          type: 'call_rejected',
          fromUserId: data.from_id
        });
      }
      
      
    } catch (error) {
      log.error('处理通话拒绝失败:', error);
    }
  }
  
  async handleVoiceCallEnded(data: any) {
    try {
      
      if (this.voiceCallState && this.voiceCallState.callStartTime) {
        await this.saveVoiceCallRecord(data.from_id, 'completed');
      }
      
      const existingOnVoiceCallReceived = this.onVoiceCallReceived;
      const existingOnVoiceCallStatusChanged = this.onVoiceCallStatusChanged;
      
      await this.forceResetVoiceCallState();
      
      this.onVoiceCallReceived = existingOnVoiceCallReceived;
      this.onVoiceCallStatusChanged = existingOnVoiceCallStatusChanged;
      
      if (this.onVoiceCallStatusChanged) {
        this.onVoiceCallStatusChanged({
          type: 'call_ended_remote',
          fromUserId: data.from_id
        });
      }
      
      
    } catch (error) {
      log.error('处理通话结束失败:', error);
    }
  }
  
  handleHeartbeatResponse() {
    this.lastHeartbeatTime = Date.now();
    this.connectionHealthy = true;
  }

  handleUserStatusUpdate(data: any) {
    if (this.onUserStatusChanged) {
      this.onUserStatusChanged({
        userId: data.user_id,
        status: data.status,
        lastSeen: data.last_seen
      });
    }
  }

  async handleVideoCallOffer(data: any) {
    try {
      
      let encryptionKey = null;
      if (data.encryption_key && Array.isArray(data.encryption_key)) {
        encryptionKey = data.encryption_key;
      }
      
      if (this.onVideoCallReceived) {
        this.onVideoCallReceived({
          type: 'incoming_call',
          fromUserId: data.from_id,
          callId: data.call_id,
          offer: data.payload,
          encryptionKey: encryptionKey
        });
      }
      
    } catch (error) {
      log.error('处理通话邀请失败:', error);
    }
  }
  
  async handleVideoCallAnswer(data: any) {
    try {
      
      if (this.videoCallState && this.videoCallState.peerConnection) {
        await this.videoCallState.peerConnection.setRemoteDescription(
          new RTCSessionDescription(data.payload)
        );
        
        if (this.onVideoCallStatusChanged) {
          this.onVideoCallStatusChanged({
            type: 'call_answered',
            fromUserId: data.from_id
          });
        }
      }
      
    } catch (error) {
      log.error('处理通话应答失败:', error);
    }
  }
  
  async handleVideoCallIceCandidate(data: any) {
    try {
      
      if (this.videoCallState && this.videoCallState.peerConnection) {
        await this.videoCallState.peerConnection.addIceCandidate(
          new RTCIceCandidate(data.payload)
        );
      }
      
    } catch (error) {
      log.error('处理ICE候选失败:', error);
    }
  }
  
  async handleVideoCallRejected(data: any) {
    try {
      
      await this.saveVideoCallRecord(data.from_id, 'rejected');
      
      const existingOnVideoCallReceived = this.onVideoCallReceived;
      const existingOnVideoCallStatusChanged = this.onVideoCallStatusChanged;
      
      await this.forceResetVideoCallState();
      
      this.onVideoCallReceived = existingOnVideoCallReceived;
      this.onVideoCallStatusChanged = existingOnVideoCallStatusChanged;
      
      if (this.onVideoCallStatusChanged) {
        this.onVideoCallStatusChanged({
          type: 'call_rejected',
          fromUserId: data.from_id
        });
      }
      
      
    } catch (error) {
      log.error('处理通话拒绝失败:', error);
    }
  }
  
  async handleVideoCallEnded(data: any) {
    try {
      
      if (this.videoCallState && this.videoCallState.callStartTime) {
        await this.saveVideoCallRecord(data.from_id, 'completed');
      }
      
      const existingOnVideoCallReceived = this.onVideoCallReceived;
      const existingOnVideoCallStatusChanged = this.onVideoCallStatusChanged;
      
      await this.forceResetVideoCallState();
      
      this.onVideoCallReceived = existingOnVideoCallReceived;
      this.onVideoCallStatusChanged = existingOnVideoCallStatusChanged;
      
      if (this.onVideoCallStatusChanged) {
        this.onVideoCallStatusChanged({
          type: 'call_ended_remote',
          fromUserId: data.from_id
        });
      }
      
      
    } catch (error) {
      log.error('处理通话结束失败:', error);
    }
  }
  
  async handleVideoCallToggle(data: any) {
    try {
      
      if (this.onVideoCallStatusChanged) {
        this.onVideoCallStatusChanged({
          type: 'media_toggle',
          fromUserId: data.from_id,
          toggleType: data.payload.type,
          enabled: data.payload.enabled
        });
      }
      
    } catch (error) {
      log.error('处理媒体切换失败:', error);
    }
  }
  
  async saveVideoCallRecord(userId: any, callStatus: any) {
    try {
      const callEndTime = getChinaTimeISO();
      let callStartTime = callEndTime;
      let duration = 0;
      
      if (this.videoCallState && this.videoCallState.callStartTime) {
        callStartTime = this.videoCallState.callStartTime;
        const startTime: any = new Date(callStartTime);
        const endTime: any = new Date(callEndTime);
        duration = Math.floor((endTime - startTime) / 1000);
      } else {
        log.warn('缺少通话开始时间，使用当前时间作为开始时间');
      }
     
     const callInfo = {
       type: 'video_call',
       status: callStatus,
       duration: duration,
       startTime: callStartTime,
       endTime: callEndTime
     };
     
     const callRecord = {
        to: userId,
        content: JSON.stringify(callInfo),
        messageType: 'video_call',
        method: 'Server',
        encrypted: false
      };
     
     
     try {
       const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
       const response = await fetch(`${API_BASE_URL}/v1/messages`, {
         method: 'POST',
         headers: {
           'Content-Type': 'application/json',
           'Authorization': `Bearer ${localStorage.getItem('token')}`
         },
         body: JSON.stringify(callRecord)
       });
       
       if (response.ok) {
       } else {
         log.error('保存通话记录失败:', response.statusText);
       }
     } catch (fetchError) {
       log.error('保存通话记录网络错误:', fetchError);
     }
     
     if (this.onMessageReceived) {
       const messageForUI = {
         id: generateTempMessageId(),
         from: this.currentUserId,
         to: userId,
         content: `视频通话 - ${callStatus === 'completed' ? '已完成' : callStatus === 'rejected' ? '被拒绝' : callStatus}`,
         messageType: 'video_call',
         callDuration: duration,
         callStatus: callStatus,
         callStartTime: callStartTime,
         callEndTime: callEndTime,
         timestamp: callEndTime,
         method: 'Server'
       };
       
       this.onMessageReceived(messageForUI);
     }
     
   } catch (error) {
     log.error('保存通话记录异常:', error);
   }
 }
  
  toggleVideo() {
    if (this.localVideoStream || this.videoCallState?.localStream) {
      const stream = this.localVideoStream || this.videoCallState.localStream;
      const videoTracks = stream.getVideoTracks();
      if (videoTracks.length > 0) {
        const currentEnabled = videoTracks[0].enabled;
        videoTracks.forEach((track: any) => {
          track.enabled = !currentEnabled;
        });
        
        if (this.videoCallState?.targetUserId && this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            type: 'video_call_toggle',
            to_id: this.videoCallState.targetUserId,
            payload: {
              type: 'video',
              enabled: !currentEnabled
            }
          }));
        }
        
        return !currentEnabled;
      }
    }
    return false;
  }
  
  toggleVideoAudio() {
    if (this.localVideoStream || this.videoCallState?.localStream) {
      const stream = this.localVideoStream || this.videoCallState.localStream;
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        const currentEnabled = audioTracks[0].enabled;
        audioTracks.forEach((track: any) => {
          track.enabled = !currentEnabled;
        });
        
        if (this.videoCallState?.targetUserId && this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            type: 'video_call_toggle',
            to_id: this.videoCallState.targetUserId,
            payload: {
              type: 'audio',
              enabled: !currentEnabled
            }
          }));
        }
        
        return !currentEnabled;
      }
    }
    return false;
  }
}

export default HybridMessaging;
