import { getLocalKey, saveLocalKey, deleteLocalKey } from '@/utils/key-storage';
import localMessageService from './localMessageService.ts';
import { getChinaTimeISO, generateTempMessageId } from '../utils/timeUtils.ts';

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
    
    console.log(`[初始化] 开始初始化混合消息系统，用户ID: ${userId}`);
    
    // 初始化消息处理器映射
    this.initializeMessageHandlers();
    
    // 建立WebSocket连接用于信令
    await this.connectSignalingServer();
    console.log('[初始化] WebSocket连接已建立');
    
    // P2P能力注册功能已移除
    console.log('[初始化] P2P能力注册功能已移除');
    
    // 设置页面关闭时的清理逻辑
    this.setupBeforeUnloadHandler();
    
    console.log('[初始化] 混合消息系统初始化完成');
  }

  // 初始化消息处理器映射
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
        console.log('信令服务器连接成功');
        
        // 设置信令处理器
        this.setupSignalingHandlers();
        
        // 重置重连状态
        this.isReconnecting = false;
        this.reconnectAttempts = 0;
        
        // 启动连接健康检查
        this.startConnectionHealthCheck();
        
        // 在线状态同步功能已移除
        console.log('[状态同步] 在线状态同步功能已移除');
        
        resolve();
      };
      
      this.ws.onerror = async (error) => {
          console.error('WebSocket连接错误:', error);
          const config = await import('../config/config.ts');
          console.error('WebSocket URL:', `${config.default.WS_BASE_URL}/ws/${this.currentUserId}?token=${this.token}`);
        console.error('Token存在:', !!this.token);
        console.error('Token长度:', this.token ? this.token.length : 0);
        reject(error);
      };
      this.ws.onclose = async (event) => {
        console.log('信令服务器连接断开', { code: event.code, reason: event.reason });
        
        // 详细的错误代码分析
        if (event.code === 1008) {
          console.error('❌ WebSocket认证失败 (错误代码1008)');
          console.error('可能原因: Token无效、过期或用户ID不匹配');
          console.error('当前Token:', this.token ? `${this.token.substring(0, 20)}...` : 'null');
          console.error('当前用户ID:', this.currentUserId);
        } else if (event.code === 1006) {
          console.error('❌ WebSocket异常关闭 (错误代码1006)');
          console.error('可能原因: 网络连接问题或服务器无响应');
        } else {
          console.log(`WebSocket关闭代码: ${event.code}, 原因: ${event.reason || '未知'}`);
        }
        
        // 清理所有P2P连接
        this.p2pConnections.forEach((connection, userId) => {
          try {
            connection.close();
          } catch (error) {
            console.warn(`[P2P] 关闭与用户 ${userId} 的P2P连接失败:`, error);
          }
        });
        this.p2pConnections.clear();
        
        this.peerConnections.forEach((peerConnection, userId) => {
          try {
            peerConnection.close();
          } catch (error) {
            console.warn(`[P2P] 关闭与用户 ${userId} 的WebRTC连接失败:`, error);
          }
        });
        this.peerConnections.clear();
        
        // 离线状态同步功能已移除
        console.log('[状态同步] 离线状态同步功能已移除');
        
        // 智能重连逻辑
        if (!this.isReconnecting && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.isReconnecting = true;
          this.reconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 10000); // 指数退避，最大10秒
          
          setTimeout(async () => {
            try {
              await this.connectSignalingServer();
              this.reconnectAttempts = 0; // 重连成功，重置计数器
              console.log('WebSocket重连成功');
            } catch (error) {
              console.error('WebSocket重连失败:', error);
            } finally {
              this.isReconnecting = false;
            }
          }, delay);
        } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          console.error('WebSocket重连次数已达上限，停止重连');
        }
      };
    });
  }

  // 设置信令处理
  setupSignalingHandlers() {
    if(!this.ws) return;
    this.ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      console.log('[WebSocket] 收到消息:', data.type, data);

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
            this.onFriendsStatusReceived(data.payload.onlineFriends);
          }
          break;

        case 'user_status_change':
          if (this.onUserStatusChanged) {
            this.onUserStatusChanged(data.payload);
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
          console.log('未知消息类型:', data.type, data);
          break;
      }
    };

    this.ws.onclose = (event) => {
      console.log('WebSocket连接关闭:', event.code, event.reason);
      
      if (!this.isReconnecting && this.reconnectAttempts < this.maxReconnectAttempts) {
        console.log(`开始重连，尝试次数: ${this.reconnectAttempts + 1}`);
        this.isReconnecting = true;
        
        setTimeout(() => {
          this.reconnectAttempts++;
          this.connectSignalingServer().catch(error => {
            console.error('重连失败:', error);
            this.isReconnecting = false;
          });
        }, 2000 * this.reconnectAttempts); // 递增延迟
      } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('达到最大重连次数，停止重连');
        this.isReconnecting = false;
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket错误:', error);
    };
  }

  // P2P能力注册功能已移除
  async registerP2PCapability() {
    console.log('[P2P] P2P能力注册功能已移除');
  }

  // 预连接功能已删除
  
  // 智能发送消息（自动选择P2P或C/S）
  async sendMessage(toUserId: any, content: any, options: any = {}) {
    try {
      console.log(`[发送消息] 开始发送消息给用户 ${toUserId}`);
      
      // 优先使用已建立的P2P连接
      if (this.p2pConnections.has(toUserId)) {
        console.log(`[发送消息] 使用已建立的P2P连接`);
        try {
          const p2pResult: any = await this.sendP2PMessage(toUserId, content, options);
          if (p2pResult.success) {
            console.log(`[发送消息] P2P发送成功:`, p2pResult);
            return { success: true, method: 'P2P', ...p2pResult };
          }
        } catch (p2pError) {
          console.warn(`[发送消息] P2P发送失败，移除连接并降级到服务器转发:`, p2pError);
          // 清理失效的连接
          this.p2pConnections.delete(toUserId);
          if (this.peerConnections.has(toUserId)) {
            this.peerConnections.get(toUserId)?.close();
            this.peerConnections.delete(toUserId);
          }
        }
      }
      
      // 检查用户状态并尝试即时P2P连接
      const userStatus = await this.checkUserStatus(toUserId);
      console.log(`[发送消息] 用户状态:`, userStatus);
      
      if (userStatus.online && userStatus.supportsP2P) {
        console.log(`[发送消息] 用户在线且支持P2P，尝试即时P2P连接`);
        try {
          const p2pResult: any = await this.sendP2PMessage(toUserId, content, options);
          if (p2pResult.success) {
            console.log(`[发送消息] P2P发送成功:`, p2pResult);
            return { success: true, method: 'P2P', ...p2pResult };
          }
        } catch (p2pError: any) {
          console.warn('P2P发送失败，回退到服务器模式:', p2pError.message);
          // P2P失败时不抛出错误，继续使用服务器转发
        }
      } else {
        console.log(`[发送消息] 用户离线或不支持P2P，使用服务器转发`);
      }
      
      // P2P失败或用户离线，使用服务器转发
      console.log(`[发送消息] 使用服务器转发模式`);
      const serverResult = await this.sendServerMessage(toUserId, content, options);
      console.log(`[发送消息] 服务器转发结果:`, serverResult);
      return serverResult;
      
    } catch (error: any) {
      console.error('发送消息失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 检查用户状态（C/S API）
  async checkUserStatus(userId: any) {
    try {
      console.log(`[状态检查] 开始检查用户 ${userId} 的状态`);
      const { hybridApi } = await import('../api/hybrid-api.ts');
      const response = await hybridApi.getUserStatus(userId);
      
      // 后端返回格式是 {success: true, data: {...}}
      const userStatus = response.data?.data;
      console.log(`[状态检查] API响应:`, response.data);
      console.log(`[状态检查] 用户 ${userId} 状态:`, userStatus);
      
      if (!userStatus) {
        console.warn(`[状态检查] 用户 ${userId} 状态数据为空`);
        return { online: false, supportsP2P: false };
      }
      
      // 根据后端返回的字段判断用户状态
      const isOnline = userStatus.status === 'online' && userStatus.hasConnection;
      const supportsP2P = isOnline; // 如果用户在线且有连接，则支持P2P
      
      console.log(`[状态检查] 详细字段检查:`, {
        'userStatus.status': userStatus.status,
        'userStatus.hasConnection': userStatus.hasConnection,
        'userStatus.lastSeen': userStatus.lastSeen,
        'userStatus.lastHeartbeat': userStatus.lastHeartbeat
      });
      
      // 确保返回标准化的状态格式
      const normalizedStatus = {
        online: isOnline,
        supportsP2P: supportsP2P,
        lastSeen: userStatus.lastSeen,
        websocketConnected: userStatus.hasConnection,
        lastHeartbeat: userStatus.lastHeartbeat
      };
      
      console.log(`[状态检查] 标准化后的用户 ${userId} 状态:`, normalizedStatus);
      return normalizedStatus;
      
    } catch (error) {
      console.warn(`[状态检查] 检查用户 ${userId} 状态失败，假设离线:`, error);
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
        console.log('发送的P2P消息已存储到本地数据库');
      } catch (error) {
        console.error('存储P2P消息到本地数据库失败:', error);
      }
      
      return { 
        success: true, 
        method: 'P2P',
        id: generateTempMessageId(),
        timestamp: message.timestamp 
      };
      
    } catch (error: any) {
      console.warn('P2P发送失败:', error);
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
          console.log(`[P2P] 连接状态变化: ${peerConnection.connectionState}`);
          if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'closed') {
            safeReject(new Error(`P2P连接失败: 连接状态=${peerConnection.connectionState}`));
          }
        };
        
        peerConnection.oniceconnectionstatechange = () => {
          console.log(`[P2P] ICE连接状态变化: ${peerConnection.iceConnectionState}`);
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
          console.log(`P2P连接已建立: ${toUserId}`);
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
              console.warn('保存P2P消息到本地数据库失败:', dbError);
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
          console.warn(`[P2P] 数据通道错误 (用户 ${toUserId}):`, error.error?.message || error.type || '连接异常');
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
              console.warn(`[P2P] WebSocket连接不可用，无法发送ICE候选到用户 ${toUserId}`);
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
          console.error(`[P2P] WebSocket连接不可用，无法发送Offer到用户 ${toUserId}`);
          safeReject(new Error('WebSocket连接断开，无法发送Offer'));
          return;
        }

        // 保存连接
        this.peerConnections.set(toUserId, peerConnection);

        // 设置连接超时
        timeout = setTimeout(() => {
          console.warn(`[P2P] 连接超时，当前状态: 连接=${peerConnection.connectionState}, ICE=${peerConnection.iceConnectionState}`);
          try {
            peerConnection.close();
          } catch (error) {
            console.warn(`[P2P] 关闭超时连接失败:`, error);
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
        console.log(`[P2P] 接收方连接状态变化: ${peerConnection.connectionState}`);
        if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'closed') {
          console.warn(`[P2P] 接收方连接失败: ${peerConnection.connectionState}`);
          this.p2pConnections.delete(fromUserId);
          if (this.peerConnections.has(fromUserId)) {
            this.peerConnections.delete(fromUserId);
          }
        }
      };
      
      peerConnection.oniceconnectionstatechange = () => {
        console.log(`[P2P] 接收方ICE连接状态变化: ${peerConnection.iceConnectionState}`);
      };

      // 设置远程描述
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));

      // 监听数据通道
      peerConnection.ondatachannel = (event) => {
        const dataChannel = event.channel;
        
        dataChannel.onopen = () => {
          console.log(`P2P连接已接受: ${fromUserId}`);
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
              console.log('P2P消息已保存到本地数据库');
            } catch (dbError) {
              console.warn('保存P2P消息到本地数据库失败:', dbError);
            }
            
            this.onMessageReceived(msgData);
          }
        };
        
        dataChannel.onclose = () => {
          console.log(`[P2P] 数据通道关闭: ${fromUserId}`);
          this.p2pConnections.delete(fromUserId);
          if (this.onP2PStatusChanged) {
            this.onP2PStatusChanged(fromUserId, 'disconnected');
          }
        };
        
        dataChannel.onerror = (error: any) => {
          console.warn(`[P2P] 接收方数据通道错误 (来自用户 ${fromUserId}):`, error.error?.message || error.type || '连接异常');
          this.p2pConnections.delete(fromUserId);
          if (this.onP2PStatusChanged) {
            this.onP2PStatusChanged(fromUserId, 'disconnected');
          }
        };
      };

      // ICE候选事件
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          console.log(`[P2P] 接收方发送ICE候选到 ${fromUserId}`);
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
              type: 'webrtc_ice_candidate',
              to_id: fromUserId,
              payload: event.candidate
            }));
          } else {
            console.warn(`[P2P] WebSocket连接不可用，无法发送ICE候选到用户 ${fromUserId}`);
          }
        }
      };

      // 创建Answer
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      // 发送Answer
      console.log(`[P2P] 发送Answer到 ${fromUserId}`);
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'webrtc_answer',
          to_id: fromUserId,
          payload: { type: answer.type, sdp: answer.sdp }
        }));
      } else {
        console.error(`[P2P] WebSocket连接不可用，无法发送Answer到用户 ${fromUserId}`);
        peerConnection.close();
        return;
      }

      this.peerConnections.set(fromUserId, peerConnection);
      
      setTimeout(() => {
        if (this.peerConnections.has(fromUserId) && 
            peerConnection.connectionState !== 'connected' && 
            peerConnection.connectionState !== 'closed') {
          console.warn(`[P2P] 接收方连接超时: ${fromUserId}`);
          peerConnection.close();
          this.peerConnections.delete(fromUserId);
          this.p2pConnections.delete(fromUserId);
        }
      }, 15000);

    } catch (error) {
      console.error('处理P2P Offer失败:', error);
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
    console.log(`[P2P] 收到来自 ${data.from} 的Answer`);
    try {
      const fromUserId = data.from;
      const peerConnection = this.peerConnections.get(fromUserId);
      if (!peerConnection) {
        console.warn(`[P2P] 未找到与 ${fromUserId} 的连接`);
        return;
      }
      
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
      console.log(`[P2P] 已为 ${fromUserId} 设置远程描述`);
      
    } catch (error) {
      const fromUserId = data.from;
      console.error(`[P2P] 处理来自 ${fromUserId} 的Answer失败:`, error);
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
    console.log(`[P2P] 收到来自 ${data.from} 的ICE候选`);
    try {
      const fromUserId = data.from;
      const peerConnection = this.peerConnections.get(fromUserId);
      if (!peerConnection) {
        console.warn(`[P2P] 未找到与 ${fromUserId} 的连接`);
        return;
      }
      
      if (peerConnection.connectionState === 'closed') {
        console.warn(`[P2P] 与 ${fromUserId} 的连接已关闭，忽略ICE候选`);
        this.peerConnections.delete(fromUserId);
        return;
      }
      
      if (!data.candidate) {
        console.log(`[P2P] 收到来自 ${fromUserId} 的空ICE候选（连接完成信号）`);
        return;
      }
      
      if (peerConnection.remoteDescription) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        console.log(`[P2P] 已为 ${fromUserId} 添加ICE候选`);
      } else {
        console.warn(`[P2P] 收到来自 ${fromUserId} 的ICE候选，但远程描述尚未设置`);
        if (!this.pendingIceCandidates) {
          this.pendingIceCandidates = new Map();
        }
        if (!this.pendingIceCandidates.has(fromUserId)) {
          this.pendingIceCandidates.set(fromUserId, []);
        }
        this.pendingIceCandidates.get(fromUserId)?.push(data.candidate);
      }
      
    } catch (error) {
      console.error(`[P2P] 处理来自 ${data.from} 的ICE候选失败:`, error);
    }
  }

  // 服务器转发消息（C/S模式）
  async sendServerMessage(toUserId: any, content: any, options: any = {}) {
    try {
      console.log('发送服务器消息:', { toUserId, content, options });
      
      const messageData: any = {
        to: toUserId,
        encryptedContent: content,
        messageType: options.messageType || 'text'
      };
      
      if (options.burnAfter && options.burnAfter > 0) {
        messageData.destroy_after = options.burnAfter;
      }
      
      const { hybridApi } = await import('../api/hybrid-api.ts');
      const response = await hybridApi.sendMessage(messageData);

      const result = response.data;
      console.log('服务器响应结果:', result);
      
      try {
        const sentMsgData: any = {
          from: this.currentUserId,
          to: toUserId,
          content: content,
          timestamp: result.timestamp || getChinaTimeISO(),
          method: 'Server',
          messageType: 'text',
          encrypted: false
        };
        
        if (options.burnAfter && options.burnAfter > 0) {
          sentMsgData.destroyAfter = Math.floor(Date.now() / 1000) + options.burnAfter;
        }
        
        await localMessageService.sendMessage(sentMsgData);
        console.log('发送的服务器消息已保存到本地数据库');
      } catch (dbError) {
        console.warn('保存发送的服务器消息到本地数据库失败:', dbError);
      }
      
      return { 
        success: true, 
        method: 'Server',
        id: result.id || result.message_id,
        timestamp: result.timestamp
      };

    } catch (error: any) {
      console.error('sendServerMessage错误:', error);
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
    
    const msgData: any = {
      id: data.id || generateTempMessageId(),
      from: data.from,
      to: this.currentUserId,
      content: data.content,
      timestamp: data.timestamp,
      method: 'Server',
      messageType: data.messageType || data.message_type || 'text',
      filePath: data.filePath || data.file_path || null,
      fileName: data.fileName || data.file_name || null,
      hiddenMessage: data.hiddenMessage || data.hidden_message || null
    };
    
    if (data.destroy_after && data.destroy_after > 0) {
      msgData.destroyAfter = Math.floor(Date.now() / 1000) + data.destroy_after;
    }
    
    try {
      await localMessageService.receiveMessage(msgData);
      console.log('服务器消息已保存到本地数据库');
    } catch (dbError) {
      console.error('保存服务器消息到数据库失败:', dbError);
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
      console.error('获取消息历史失败:', error);
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
          console.log(`[P2P] 关闭与用户 ${userId} 的数据通道`);
        } else {
          console.log(`[P2P] 用户 ${userId} 的数据通道已关闭，跳过关闭操作`);
        }
      } catch (error) {
        console.warn(`[P2P] 关闭用户 ${userId} 的数据通道失败:`, error);
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
      console.log('[离线] 离线状态发送功能已移除');
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
      console.log('[连接健康检查] 开始检查连接状态');
      
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({
            type: 'heartbeat',
            timestamp: getChinaTimeISO()
          }));
          console.log('[心跳] 已发送WebSocket心跳');
        } catch (error) {
          console.error('[心跳] 发送WebSocket心跳失败:', error);
        }
      }
      
      const toRemove: any[] = [];
      this.p2pConnections.forEach((connection, userId) => {
        if (connection.readyState === 'closed' || connection.readyState === 'closing') {
          console.log(`[连接健康检查] 发现无效连接，用户 ${userId}，状态: ${connection.readyState}`);
          toRemove.push(userId);
        }
      });
      
      toRemove.forEach(userId => {
        this.p2pConnections.delete(userId);
        if (this.peerConnections.has(userId)) {
          try {
            this.peerConnections.get(userId)?.close();
          } catch (error) {
            console.warn(`[连接健康检查] 关闭WebRTC连接失败:`, error);
          }
          this.peerConnections.delete(userId);
        }
        console.log(`[连接健康检查] 已清理用户 ${userId} 的无效连接`);
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
    console.log('清理HybridMessaging资源');
    
    this.stopConnectionHealthCheck();
    
    this.p2pConnections.forEach((connection, userId) => {
      try {
        if (connection.readyState === 'open' || connection.readyState === 'connecting') {
          connection.close();
          console.log(`已关闭与用户 ${userId} 的P2P连接`);
        } else {
          console.log(`用户 ${userId} 的P2P连接已关闭，跳过关闭操作`);
        }
      } catch (error) {
        console.warn(`关闭与用户 ${userId} 的P2P连接失败:`, error);
      }
    });
    this.p2pConnections.clear();
    
    this.peerConnections.forEach((peerConnection, userId) => {
      try {
        peerConnection.close();
        console.log(`已关闭与用户 ${userId} 的WebRTC连接`);
      } catch (error) {
        console.warn(`关闭与用户 ${userId} 的WebRTC连接失败:`, error);
      }
    });
    this.peerConnections.clear();
    
    if (this.pendingIceCandidates) {
      this.pendingIceCandidates.clear();
      console.log('已清理暂存的ICE候选');
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
  
  async setOfflineStatus() {
    console.log('[离线] 离线状态设置功能已移除');
  }

  // ==================== 语音通话功能 ====================
  
  initVoiceCallState() {
    const existingOnVoiceCallReceived = this.onVoiceCallReceived;
    const existingOnVoiceCallStatusChanged = this.onVoiceCallStatusChanged;
    
    if (this.voiceCallState) {
      if (this.voiceCallState.localStream) {
        this.voiceCallState.localStream.getTracks().forEach((track: any) => {
          track.stop();
          console.log('[语音通话] 停止音频轨道:', track.kind);
        });
      }
      if (this.voiceCallState.peerConnection) {
        this.voiceCallState.peerConnection.close();
        console.log('[语音通话] 关闭WebRTC连接');
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
          console.log('[视频通话] 停止媒体轨道:', track.kind);
        });
      }
      if (this.videoCallState.peerConnection) {
        this.videoCallState.peerConnection.close();
        console.log('[视频通话] 关闭WebRTC连接');
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
      console.log('[视频加密] 加密系统初始化完成');
    } catch (error) {
      console.error('[视频加密] 初始化失败:', error);
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
      console.log('[音频加密] 加密系统初始化完成');
    } catch (error) {
      console.error('[音频加密] 初始化失败:', error);
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
      console.log(`[语音通话] 开始发起通话给用户 ${toUserId}`);
      
      if (this.voiceCallState && this.voiceCallState.isInCall) {
        console.log('[语音通话] 当前已在通话中，先结束现有通话');
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
      
      console.log('[语音通话] 本地音频流获取成功');
      
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
        console.log('[视频通话] 数据通道已打开');
      };
      
      dataChannel.onclose = () => {
        console.log('[视频通话] 数据通道已关闭');
      };
      
      dataChannel.onerror = (error: any) => {
        if (error.error && error.error.name === 'OperationError' && 
            error.error.message.includes('User-Initiated Abort')) {
          console.log('[视频通话] 数据通道正常关闭');
          return;
        }
        console.warn('[视频通话] 数据通道错误:', error);
      };
      
      dataChannel.onmessage = (event) => {
        console.log('[视频通话] 收到数据通道消息:', event.data);
      };
      
      peerConnection.ondatachannel = (event) => {
        const channel = event.channel;
        console.log('[视频通话] 收到数据通道:', channel.label);
        
        channel.onopen = () => {
          console.log('[视频通话] 接收数据通道已打开');
        };
        
        channel.onclose = () => {
          console.log('[视频通话] 接收数据通道已关闭');
        };
        
        channel.onerror = (error: any) => {
          if (error.error && error.error.name === 'OperationError' && 
              error.error.message.includes('User-Initiated Abort')) {
            console.log('[视频通话] 接收数据通道正常关闭');
            return;
          }
          console.warn('[视频通话] 接收数据通道错误:', error);
        };
      };
      
      localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
      });
      
      peerConnection.ontrack = (event) => {
        console.log('[语音通话] 收到远程音频流');
        const remoteStream = event.streams[0];
        
        if (this.voiceCallState.encryptionEnabled && this.voiceCallState.encryptionKey) {
          console.log('[音频加密] 对远程音频流进行解密处理');
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
        console.log(`[语音通话] 连接状态: ${peerConnection.connectionState}`);
        if (this.onVoiceCallStatusChanged) {
          this.onVoiceCallStatusChanged({
            type: 'connection_state_changed',
            state: peerConnection.connectionState
          });
        }
        
        if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
          console.log('[语音通话] 连接失败，自动清理资源');
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
        console.log('[语音通话] 发送通话邀请消息（含加密密钥）');
        this.ws.send(JSON.stringify(message));
        console.log('[语音通话] 通话邀请消息已发送到服务器');
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
      
      console.log('[语音通话] 通话邀请已发送，加密已启用');
      
      return {
        success: true,
        callId: callId,
        localStream: localStream,
        encryptionEnabled: this.voiceCallState.encryptionEnabled
      };
      
    } catch (error) {
      console.error('[语音通话] 发起通话失败:', error);
      await this.forceResetVoiceCallState();
      throw error;
    }
  }
  
  async initiateVideoCall(toUserId: any) {
    try {
      console.log(`[视频通话] 开始发起通话给用户 ${toUserId}`);
      
      if (this.videoCallState && this.videoCallState.isInCall) {
        console.log('[视频通话] 当前已在通话中，先结束现有通话');
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
      
      console.log('[视频通话] 本地媒体流获取成功');
      
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
        console.log('[视频通话] 数据通道已打开');
      };
      
      dataChannel.onclose = () => {
        console.log('[视频通话] 数据通道已关闭');
      };
      
      dataChannel.onerror = (error: any) => {
        console.warn('[视频通话] 数据通道错误:', error);
      };
      
      dataChannel.onmessage = (event) => {
        console.log('[视频通话] 收到数据通道消息:', event.data);
      };
      
      peerConnection.ondatachannel = (event) => {
        const channel = event.channel;
        console.log('[视频通话] 收到数据通道:', channel.label);
        
        channel.onopen = () => {
          console.log('[视频通话] 接收数据通道已打开');
        };
        
        channel.onclose = () => {
          console.log('[视频通话] 接收数据通道已关闭');
        };
        
        channel.onerror = (error: any) => {
          console.warn('[视频通话] 接收数据通道错误:', error);
        };
        
        channel.onmessage = (event) => {
          console.log('[视频通话] 收到数据通道消息:', event.data);
        };
      };
      
      localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
      });
      
      peerConnection.ontrack = (event) => {
        console.log('[视频通话] 收到远程媒体流');
        const remoteStream = event.streams[0];
        
        if (this.videoCallState.encryptionEnabled && this.videoCallState.encryptionKey) {
          console.log('[视频加密] 对远程媒体流进行解密处理');
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
        console.log(`[视频通话] 连接状态: ${peerConnection.connectionState}`);
        if (this.onVideoCallStatusChanged) {
          this.onVideoCallStatusChanged({
            type: 'connection_state_changed',
            state: peerConnection.connectionState
          });
        }
        
        if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
          console.log('[视频通话] 连接失败，自动清理资源');
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
        console.log('[视频通话] 发送通话邀请消息（含加密密钥）');
        this.ws.send(JSON.stringify(message));
        console.log('[视频通话] 通话邀请消息已发送到服务器');
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
      
      console.log('[视频通话] 通话邀请已发送，加密已启用');
      
      return {
        success: true,
        callId: callId,
        localStream: localStream,
        encryptionEnabled: this.videoCallState.encryptionEnabled
      };
      
    } catch (error) {
      console.error('[视频通话] 发起通话失败:', error);
      await this.forceResetVideoCallState();
      throw error;
    }
  }
  
  async acceptVoiceCall(fromUserId: any, offer: any, encryptionKey: any = null) {
    try {
      console.log(`[语音通话] 接听来自用户 ${fromUserId} 的通话`);
      
      await this.forceResetVoiceCallState();
      
      if (encryptionKey && Array.isArray(encryptionKey)) {
        this.voiceCallState.encryptionKey = new Uint8Array(encryptionKey);
        console.log('[音频加密] 接收到加密密钥，启用加密通话');
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
      
      console.log('[语音通话] 本地音频流获取成功');
      
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
        console.log('[视频通话] 收到数据通道:', channel.label);
        
        channel.onopen = () => {
          console.log('[视频通话] 接收数据通道已打开');
        };
        
        channel.onclose = () => {
          console.log('[视频通话] 接收数据通道已关闭');
        };
        
        channel.onerror = (error: any) => {
          console.warn('[视频通话] 接收数据通道错误:', error);
        };
        
        channel.onmessage = (event) => {
          console.log('[视频通话] 收到数据通道消息:', event.data);
        };
      };
      
      localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
      });
      
      peerConnection.ontrack = (event) => {
        console.log('[语音通话] 收到远程音频流');
        const remoteStream = event.streams[0];
        
        if (this.voiceCallState.encryptionEnabled && this.voiceCallState.encryptionKey) {
          console.log('[音频加密] 对远程音频流进行解密处理');
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
        console.log(`[语音通话] 连接状态: ${peerConnection.connectionState}`);
        if (this.onVoiceCallStatusChanged) {
          this.onVoiceCallStatusChanged({
            type: 'connection_state_changed',
            state: peerConnection.connectionState
          });
        }
        
        if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
          console.log('[语音通话] 连接失败，自动清理资源');
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
        console.log('[语音通话] 发送应答消息（含加密确认）');
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
      
      console.log('[语音通话] 通话已接听，加密状态:', this.voiceCallState.encryptionEnabled);
      
      return {
        success: true,
        localStream: localStream,
        encryptionEnabled: this.voiceCallState.encryptionEnabled
      };
      
    } catch (error) {
      console.error('[语音通话] 接听通话失败:', error);
      await this.forceResetVoiceCallState();
      throw error;
    }
  }
  
  async rejectVoiceCall(fromUserId: any) {
    try {
      console.log(`[语音通话] 拒绝来自用户 ${fromUserId} 的通话`);
      
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
      
      console.log('[语音通话] 拒绝通话处理完成');
      
      return { success: true };
      
    } catch (error) {
      console.error('[语音通话] 拒绝通话失败:', error);
      throw error;
    }
  }
  
  async acceptVideoCall(fromUserId: any, offer: any, encryptionKey: any = null) {
    try {
      console.log(`[视频通话] 接听来自用户 ${fromUserId} 的通话`);
      
      await this.forceResetVideoCallState();
      
      if (encryptionKey && Array.isArray(encryptionKey)) {
        this.videoCallState.encryptionKey = new Uint8Array(encryptionKey);
        console.log('[视频加密] 接收到加密密钥，启用加密通话');
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
      
      console.log('[视频通话] 本地媒体流获取成功');
      
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
        console.log('[视频通话] 收到远程媒体流');
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
        console.log(`[视频通话] 连接状态: ${peerConnection.connectionState}`);
        if (this.onVideoCallStatusChanged) {
          this.onVideoCallStatusChanged({
            type: 'connection_state_changed',
            state: peerConnection.connectionState
          });
        }
        
        if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
          console.log('[视频通话] 连接失败，自动清理资源');
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
        console.log('[视频通话] 发送应答消息');
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
      
      console.log('[视频通话] 通话已接听');
      
      return {
        success: true,
        localStream: localStream,
        encryptionEnabled: this.videoCallState.encryptionEnabled
      };
      
    } catch (error) {
      console.error('[视频通话] 接听通话失败:', error);
      await this.forceResetVideoCallState();
      throw error;
    }
  }
  
  async rejectVideoCall(fromUserId: any) {
    try {
      console.log(`[视频通话] 拒绝来自用户 ${fromUserId} 的通话`);
      
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
      
      console.log('[视频通话] 拒绝通话处理完成');
      
      return { success: true };
      
    } catch (error) {
      console.error('[视频通话] 拒绝通话失败:', error);
      throw error;
    }
  }
  
  async endVideoCall(userId: any) {
    try {
      console.log(`[视频通话] 结束与用户 ${userId} 的通话`);
      
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
      
      console.log('[视频通话] 通话结束处理完成');
      
      return { success: true };
      
    } catch (error) {
      console.error('[视频通话] 结束通话失败:', error);
      throw error;
    }
  }

  async endVoiceCall(userId: any) {
    try {
      console.log(`[语音通话] 结束与用户 ${userId} 的通话`);
      
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
      
      console.log('[语音通话] 通话结束处理完成');
      
      return { success: true };
      
    } catch (error) {
      console.error('[语音通话] 结束通话失败:', error);
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
      console.log('[语音通话] 强制重置语音通话状态');
      
      if (this.voiceCallState) {
        if (this.voiceCallState.localStream) {
          this.voiceCallState.localStream.getTracks().forEach((track: any) => {
            track.stop();
            console.log('[语音通话] 强制停止音频轨道:', track.kind);
          });
        }
        if (this.voiceCallState.peerConnection) {
          this.voiceCallState.peerConnection.close();
          console.log('[语音通话] 强制关闭WebRTC连接');
        }
        if (this.voiceCallState.audioContext) {
          try {
            await this.voiceCallState.audioContext.close();
            console.log('[语音通话] 强制关闭音频上下文');
          } catch (error) {
            console.warn('[语音通话] 关闭音频上下文失败:', error);
          }
        }
      }
      
      if (this.voiceConnections) {
        this.voiceConnections.forEach((connection, userId) => {
          try {
            connection.close();
            console.log(`[语音通话] 强制关闭与用户 ${userId} 的连接`);
          } catch (error) {
            console.warn(`[语音通话] 关闭与用户 ${userId} 的连接失败:`, error);
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
      
      console.log('[语音通话] 强制重置完成');
      
      return { success: true };
      
    } catch (error: any) {
      console.error('[语音通话] 强制重置状态失败:', error);
      return { success: false, error: error.message };
    }
  }
  
  async forceResetVideoCallState() {
    try {
      console.log('[视频通话] 强制重置视频通话状态');
      
      if (this.videoCallState) {
        if (this.videoCallState.localStream) {
          this.videoCallState.localStream.getTracks().forEach((track: any) => {
            track.stop();
            console.log('[视频通话] 强制停止媒体轨道:', track.kind);
          });
        }
        if (this.videoCallState.dataChannel) {
          try {
            if (this.videoCallState.dataChannel.readyState === 'open' || 
                this.videoCallState.dataChannel.readyState === 'connecting') {
              this.videoCallState.dataChannel.close();
              console.log('[视频通话] 强制关闭数据通道');
            } else {
              console.log('[视频通话] 数据通道已关闭，跳过关闭操作');
            }
          } catch (error) {
            console.warn('[视频通话] 关闭数据通道失败:', error);
          }
        }
        if (this.videoCallState.peerConnection) {
          this.videoCallState.peerConnection.close();
          console.log('[视频通话] 强制关闭WebRTC连接');
        }
        if (this.videoCallState.audioContext) {
          try {
            await this.videoCallState.audioContext.close();
            console.log('[视频通话] 强制关闭音频上下文');
          } catch (error) {
            console.warn('[视频通话] 关闭音频上下文失败:', error);
          }
        }
      }
      
      if (this.videoConnections) {
        this.videoConnections.forEach((connection, userId) => {
          try {
            connection.close();
            console.log(`[视频通话] 强制关闭与用户 ${userId} 的连接`);
          } catch (error) {
            console.warn(`[视频通话] 关闭与用户 ${userId} 的连接失败:`, error);
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
      
      console.log('[视频通话] 强制重置完成');
      
      return { success: true };
      
    } catch (error: any) {
      console.error('[视频通话] 强制重置状态失败:', error);
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
         console.warn('[语音通话] 缺少通话开始时间，使用当前时间作为开始时间');
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
      
      console.log('[语音通话] 保存通话记录:', callRecord);
      
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
          console.log('[语音通话] 通话记录保存成功');
        } else {
          console.error('[语音通话] 保存通话记录失败:', response.statusText);
        }
      } catch (fetchError) {
        console.error('[语音通话] 保存通话记录网络错误:', fetchError);
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
        
        console.log('[语音通话] 通知前端添加通话记录:', messageForUI);
        this.onMessageReceived(messageForUI);
      }
      
    } catch (error) {
      console.error('[语音通话] 保存通话记录异常:', error);
    }
  }
  
  async handleVoiceCallOffer(data: any) {
    try {
      console.log(`[语音通话] 收到来自用户 ${data.from_id} 的通话邀请`);
      
      let encryptionKey = null;
      if (data.encryption_key && Array.isArray(data.encryption_key)) {
        encryptionKey = data.encryption_key;
        console.log('[音频加密] 收到加密密钥，将启用加密通话');
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
      console.error('[语音通话] 处理通话邀请失败:', error);
    }
  }
  
  async handleVoiceCallAnswer(data: any) {
    try {
      console.log(`[语音通话] 收到来自用户 ${data.from_id} 的通话应答`);
      
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
      console.error('[语音通话] 处理通话应答失败:', error);
    }
  }
  
  async handleVoiceCallIceCandidate(data: any) {
    try {
      console.log(`[语音通话] 收到来自用户 ${data.from_id} 的ICE候选`);
      
      if (this.voiceCallState && this.voiceCallState.peerConnection) {
        await this.voiceCallState.peerConnection.addIceCandidate(
          new RTCIceCandidate(data.payload)
        );
      }
      
    } catch (error) {
      console.error('[语音通话] 处理ICE候选失败:', error);
    }
  }
  
  async handleVoiceCallRejected(data: any) {
    try {
      console.log(`[语音通话] 用户 ${data.from_id} 拒绝了通话`);
      
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
      
      console.log('[语音通话] 通话拒绝处理完成');
      
    } catch (error) {
      console.error('[语音通话] 处理通话拒绝失败:', error);
    }
  }
  
  async handleVoiceCallEnded(data: any) {
    try {
      console.log(`[语音通话] 用户 ${data.from_id} 结束了通话`);
      
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
      
      console.log('[语音通话] 远程通话结束处理完成');
      
    } catch (error) {
      console.error('[语音通话] 处理通话结束失败:', error);
    }
  }
  
  handleHeartbeatResponse() {
    console.log('[心跳] 收到服务器心跳响应');
    this.lastHeartbeatTime = Date.now();
    this.connectionHealthy = true;
  }

  handleUserStatusUpdate(data: any) {
    console.log('[用户状态] 收到用户状态更新:', data);
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
      console.log(`[视频通话] 收到来自用户 ${data.from_id} 的通话邀请`);
      
      let encryptionKey = null;
      if (data.encryption_key && Array.isArray(data.encryption_key)) {
        encryptionKey = data.encryption_key;
        console.log('[视频加密] 收到加密密钥，将启用加密通话');
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
      console.error('[视频通话] 处理通话邀请失败:', error);
    }
  }
  
  async handleVideoCallAnswer(data: any) {
    try {
      console.log(`[视频通话] 收到来自用户 ${data.from_id} 的通话应答`);
      
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
      console.error('[视频通话] 处理通话应答失败:', error);
    }
  }
  
  async handleVideoCallIceCandidate(data: any) {
    try {
      console.log(`[视频通话] 收到来自用户 ${data.from_id} 的ICE候选`);
      
      if (this.videoCallState && this.videoCallState.peerConnection) {
        await this.videoCallState.peerConnection.addIceCandidate(
          new RTCIceCandidate(data.payload)
        );
      }
      
    } catch (error) {
      console.error('[视频通话] 处理ICE候选失败:', error);
    }
  }
  
  async handleVideoCallRejected(data: any) {
    try {
      console.log(`[视频通话] 用户 ${data.from_id} 拒绝了通话`);
      
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
      
      console.log('[视频通话] 通话拒绝处理完成');
      
    } catch (error) {
      console.error('[视频通话] 处理通话拒绝失败:', error);
    }
  }
  
  async handleVideoCallEnded(data: any) {
    try {
      console.log(`[视频通话] 用户 ${data.from_id} 结束了通话`);
      
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
      
      console.log('[视频通话] 远程通话结束处理完成');
      
    } catch (error) {
      console.error('[视频通话] 处理通话结束失败:', error);
    }
  }
  
  async handleVideoCallToggle(data: any) {
    try {
      console.log(`[视频通话] 用户 ${data.from_id} 切换了媒体状态:`, data.payload);
      
      if (this.onVideoCallStatusChanged) {
        this.onVideoCallStatusChanged({
          type: 'media_toggle',
          fromUserId: data.from_id,
          toggleType: data.payload.type,
          enabled: data.payload.enabled
        });
      }
      
    } catch (error) {
      console.error('[视频通话] 处理媒体切换失败:', error);
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
        console.warn('[视频通话] 缺少通话开始时间，使用当前时间作为开始时间');
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
     
     console.log('[视频通话] 保存通话记录:', callRecord);
     
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
         console.log('[视频通话] 通话记录保存成功');
       } else {
         console.error('[视频通话] 保存通话记录失败:', response.statusText);
       }
     } catch (fetchError) {
       console.error('[视频通话] 保存通话记录网络错误:', fetchError);
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
       
       console.log('[视频通话] 通知前端添加通话记录:', messageForUI);
       this.onMessageReceived(messageForUI);
     }
     
   } catch (error) {
     console.error('[视频通话] 保存通话记录异常:', error);
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
        console.log(`[视频通话] 摄像头${!currentEnabled ? '已开启' : '已关闭'}`);
        
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
        console.log(`[视频通话] 麦克风${!currentEnabled ? '已开启' : '已静音'}`);
        
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