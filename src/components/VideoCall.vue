<template>
  <div class="video-call-container">
    <!-- 视频区域 -->
    <div class="video-area">
      <!-- 远程视频 -->
      <div class="remote-video-container">
        <video 
          ref="remoteVideo" 
          class="remote-video" 
          autoplay 
          playsinline
          :class="{ 'hidden': !remoteVideoEnabled }"
        ></video>
        <div v-if="!remoteVideoEnabled" class="video-placeholder">
          <div class="avatar-placeholder">
            <img v-if="contact?.avatar" :src="contact.avatar" :alt="contact.name" />
            <div v-else class="default-avatar">{{ contact?.name?.charAt(0) || 'U' }}</div>
          </div>
          <p>{{ contact?.name || 'Unknown' }} 已关闭摄像头</p>
        </div>
      </div>
      
      <!-- 本地视频 -->
      <div class="local-video-container" :class="{ 'minimized': callStatus === 'active' }">
        <video 
          ref="localVideo" 
          class="local-video" 
          autoplay 
          playsinline 
          muted
          :class="{ 'hidden': !localVideoEnabled }"
        ></video>
        <div v-if="!localVideoEnabled" class="local-video-placeholder">
          <div class="local-avatar">
            <div class="default-avatar">我</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 通话信息覆盖层 -->
    <div class="call-info-overlay">
      <div class="call-status">
        <h2 v-if="callStatus === 'connecting'">正在连接...</h2>
        <h2 v-else-if="callStatus === 'ringing'">正在呼叫...</h2>
        <h2 v-else-if="callStatus === 'incoming'">来电</h2>
        <h2 v-else-if="callStatus === 'active'">通话中</h2>
        <h2 v-else>{{ callStatus }}</h2>
      </div>
      
      <div class="contact-info">
        <div class="contact-avatar">
          <img v-if="contact?.avatar" :src="contact.avatar" :alt="contact.name" />
          <div v-else class="default-avatar">{{ contact?.name?.charAt(0) || 'U' }}</div>
        </div>
        <div class="contact-details">
          <h3>{{ contact?.name || 'Unknown Contact' }}</h3>
          <p v-if="callDuration > 0" class="call-duration">{{ formatDuration(callDuration) }}</p>
        </div>
      </div>
    </div>

    <!-- 控制按钮 -->
    <div class="call-controls">
      <button 
        @click="toggleMute" 
        class="control-btn mute-btn"
        :class="{ 'active': isMuted }"
      >
        <span v-if="isMuted">🔇</span>
        <span v-else>🎤</span>
      </button>
      
      <button 
        @click="toggleVideo" 
        class="control-btn video-btn"
        :class="{ 'active': !localVideoEnabled }"
      >
        <span v-if="localVideoEnabled">📹</span>
        <span v-else>📷</span>
      </button>
      
      <button 
        @click="toggleSpeaker" 
        class="control-btn speaker-btn"
        :class="{ 'active': speakerEnabled }"
      >
        <span v-if="speakerEnabled">🔊</span>
        <span v-else>🔉</span>
      </button>
      
      <button @click="endCall" class="control-btn end-call-btn">
        📞
      </button>
    </div>

    <!-- 接听/拒绝按钮 (仅在来电时显示) -->
    <div v-if="callStatus === 'incoming'" class="incoming-call-controls">
      <button @click="acceptCall" class="accept-btn">
        📞 接听
      </button>
      <button @click="rejectCall" class="reject-btn">
        📞 拒绝
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import hybridStore from '@/store/hybrid-store.ts';

// 路由
const route = useRoute();
const router = useRouter();

// 响应式数据
const callStatus = ref('connecting');
const callDuration = ref(0);
const isMuted = ref(false);
const localVideoEnabled = ref(true);
const remoteVideoEnabled = ref(true);
const speakerEnabled = ref(false);
const contact = ref(null);

// DOM 引用
const localVideo = ref(null);
const remoteVideo = ref(null);

// 定时器
let callTimer = null;
let qualityTimer = null;
let waveformTimer = null;

// 音频上下文
let audioContext = null;
let analyser = null;
let microphone = null;
let dataArray = null;

// 本地媒体流
let localStream = null;

// 计算属性
const formatDuration = computed(() => {
  return (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
});

// 生命周期
onMounted(async () => {
  console.log('VideoCall mounted, route params:', route.params);
  
  // 从路由参数获取联系人信息
  if (route.params.contactId) {
    contact.value = {
      id: route.params.contactId,
      name: route.params.contactName || 'Unknown Contact',
      avatar: route.params.contactAvatar || null
    };
  }
  
  await initializeCall();
});

onUnmounted(() => {
  cleanup();
});

// 监听通话状态变化
watch(callStatus, (newStatus) => {
  console.log('Video call status changed to:', newStatus);
  
  if (newStatus === 'active') {
    startTimers();
  } else if (newStatus === 'ended' || newStatus === 'rejected') {
    cleanup();
    router.push('/chat');
  }
});

// 方法
async function initializeCall() {
  try {
    console.log('Initializing video call...');
    
    if (!contact.value || !contact.value.id) {
      console.error('No contact information available');
      callStatus.value = 'error';
      return;
    }
    
    // 获取 HybridMessaging 实例
    const hybridMessaging = hybridStore.getHybridMessaging();
    if (!hybridMessaging) {
      console.error('HybridMessaging service not available');
      callStatus.value = 'error';
      return;
    }
    
    // 检查 WebSocket 连接
    if (!hybridMessaging.ws || hybridMessaging.ws.readyState !== WebSocket.OPEN) {
      console.log('WebSocket not connected, waiting...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      if (!hybridMessaging.ws || hybridMessaging.ws.readyState !== WebSocket.OPEN) {
        console.error('WebSocket connection not available');
        callStatus.value = 'error';
        return;
      }
    }
    
    // 设置视频通话状态变化回调
    hybridMessaging.onVideoCallStatusChanged = handleVideoCallStatusChange;
    
    // 设置通话接收回调
    hybridMessaging.onVideoCallReceived = (callData) => {
      console.log('Video call received:', callData);
      if (callData.rejected) {
        console.log('Video call was rejected');
        callStatus.value = 'rejected';
      }
    };
    
    // 请求摄像头和麦克风权限
    await requestMediaPermissions();
    
    // 检查是否有现有的视频通话连接
    if (hybridMessaging.videoCallState && hybridMessaging.videoCallState.isInCall) {
      console.log('Found existing video call');
      callStatus.value = 'active';
      return;
    }
    
    // 发起新的视频通话
    console.log('Starting new video call to:', contact.value);
    callStatus.value = 'ringing';
    
    try {
      const success = await hybridMessaging.initiateVideoCall(contact.value.id);
      
      if (!success) {
        console.error('Failed to start video call');
        callStatus.value = 'error';
      }
    } catch (error) {
      console.error('Error starting video call:', error);
      callStatus.value = 'error';
    }
    
  } catch (error) {
    console.error('Error initializing video call:', error);
    callStatus.value = 'error';
  }
}

async function requestMediaPermissions() {
  try {
    console.log('Requesting camera and microphone permissions...');
    
    localStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 }
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    
    // 设置本地视频
    if (localVideo.value) {
      localVideo.value.srcObject = localStream;
    }
    
    // 初始化音频上下文
    await initializeAudioContext();
    
    console.log('Media permissions granted and stream initialized');
    
  } catch (error) {
    console.error('Error requesting media permissions:', error);
    
    if (error.name === 'NotAllowedError') {
      alert('需要摄像头和麦克风权限才能进行视频通话');
    } else if (error.name === 'NotFoundError') {
      alert('未找到摄像头或麦克风设备');
    } else {
      alert('无法访问摄像头或麦克风: ' + error.message);
    }
    
    callStatus.value = 'error';
  }
}

async function initializeAudioContext() {
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    
    if (localStream) {
      microphone = audioContext.createMediaStreamSource(localStream);
      microphone.connect(analyser);
      
      analyser.fftSize = 256;
      const bufferLength = analyser.frequencyBinCount;
      dataArray = new Uint8Array(bufferLength);
    }
  } catch (error) {
    console.error('Error initializing audio context:', error);
  }
}

function handleVideoCallStatusChange(status, data) {
  console.log('Video call status change:', status, data);
  
  switch (status.type || status) {
    case 'remote_stream_received':
      if (status.stream && remoteVideo.value) {
        remoteVideo.value.srcObject = status.stream;
        remoteVideoEnabled.value = status.stream.getVideoTracks().length > 0 && 
                                   status.stream.getVideoTracks()[0].enabled;
      }
      break;
      
    case 'connected':
      callStatus.value = 'active';
      break;
      
    case 'accepted':
      callStatus.value = 'active';
      break;
      
    case 'rejected':
      callStatus.value = 'rejected';
      break;
      
    case 'ended_locally':
    case 'ended_remotely':
    case 'call_ended_remote':
    case 'call_ended_local':
      callStatus.value = 'ended';
      break;
      
    case 'connection_state_change':
      if (status.state === 'connected') {
        activateCall();
      } else if (status.state === 'disconnected' || status.state === 'failed') {
        callStatus.value = 'ended';
      }
      break;
      
    case 'remote_video_toggle':
    case 'media_toggle':
      if (status.type === 'media_toggle' && status.toggleType === 'video') {
        remoteVideoEnabled.value = status.enabled;
      } else if (status.enabled !== undefined) {
        remoteVideoEnabled.value = status.enabled;
      }
      break;
  }
}

function activateCall() {
  callStatus.value = 'active';
  startTimers();
}

function startTimers() {
  // 开始通话计时
  startCallTimer();
  
  // 开始音频波形和质量检查
  if (audioContext && analyser) {
    startWaveformTimer();
    startQualityTimer();
  }
}

function startCallTimer() {
  callTimer = setInterval(() => {
    callDuration.value++;
  }, 1000);
}

function startWaveformTimer() {
  waveformTimer = setInterval(() => {
    if (analyser && dataArray) {
      analyser.getByteFrequencyData(dataArray);
      // 这里可以添加音频可视化逻辑
    }
  }, 100);
}

function startQualityTimer() {
  qualityTimer = setInterval(() => {
    // 这里可以添加通话质量检查逻辑
  }, 5000);
}

function toggleMute() {
  isMuted.value = !isMuted.value;
  
  if (localStream) {
    const audioTracks = localStream.getAudioTracks();
    audioTracks.forEach(track => {
      track.enabled = !isMuted.value;
    });
  }
  
  console.log('Mute toggled:', isMuted.value);
}

function toggleVideo() {
  localVideoEnabled.value = !localVideoEnabled.value;
  
  if (localStream) {
    const videoTracks = localStream.getVideoTracks();
    videoTracks.forEach(track => {
      track.enabled = localVideoEnabled.value;
    });
  }
  
  // 通知远程用户视频状态变化
  const hybridMessaging = hybridStore.getHybridMessaging();
  if (hybridMessaging) {
    hybridMessaging.toggleVideo();
  }
  
  console.log('Video toggled:', localVideoEnabled.value);
}

function toggleSpeaker() {
  speakerEnabled.value = !speakerEnabled.value;
  
  if (remoteVideo.value) {
    remoteVideo.value.volume = speakerEnabled.value ? 1.0 : 0.5;
  }
  
  console.log('Speaker toggled:', speakerEnabled.value);
}

async function acceptCall() {
  try {
    console.log('Accepting video call...');
    
    // 请求媒体权限（如果还没有）
    if (!localStream) {
      await requestMediaPermissions();
    }
    
    const hybridMessaging = hybridStore.getHybridMessaging();
    if (hybridMessaging) {
      const success = await hybridMessaging.acceptVideoCall();
      if (success) {
        callStatus.value = 'active';
      } else {
        console.error('Failed to accept video call');
        callStatus.value = 'error';
      }
    } else {
      console.error('HybridMessaging service not available');
      callStatus.value = 'error';
    }
  } catch (error) {
    console.error('Error accepting video call:', error);
    callStatus.value = 'error';
  }
}

function rejectCall() {
  console.log('Rejecting video call...');
  const hybridMessaging = hybridStore.getHybridMessaging();
  if (hybridMessaging) {
    hybridMessaging.rejectVideoCall();
  }
  callStatus.value = 'rejected';
}

function endCall() {
  console.log('Ending video call...');
  const hybridMessaging = hybridStore.getHybridMessaging();
  if (hybridMessaging) {
    hybridMessaging.endVideoCall();
  }
  callStatus.value = 'ended';
}

function cleanup() {
  console.log('Cleaning up video call...');
  
  // 清除定时器
  if (callTimer) {
    clearInterval(callTimer);
    callTimer = null;
  }
  
  if (qualityTimer) {
    clearInterval(qualityTimer);
    qualityTimer = null;
  }
  
  if (waveformTimer) {
    clearInterval(waveformTimer);
    waveformTimer = null;
  }
  
  // 停止本地媒体流
  if (localStream) {
    localStream.getTracks().forEach(track => {
      track.stop();
    });
    localStream = null;
  }
  
  // 清理音频上下文
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  
  // 清理视频元素
  if (localVideo.value) {
    localVideo.value.srcObject = null;
  }
  
  if (remoteVideo.value) {
    remoteVideo.value.srcObject = null;
  }
  
  // 清除回调
  const hybridMessaging = hybridStore.getHybridMessaging();
  if (hybridMessaging) {
    hybridMessaging.onVideoCallStatusChanged = null;
    hybridMessaging.onVideoCallReceived = null;
  }
}
</script>

<style scoped>
.video-call-container {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: #000;
  display: flex;
  flex-direction: column;
  z-index: 1000;
}

.video-area {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.remote-video-container {
  width: 100%;
  height: 100%;
  position: relative;
  background: #1a1a1a;
  display: flex;
  align-items: center;
  justify-content: center;
}

.remote-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.remote-video.hidden {
  display: none;
}

.video-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: white;
  text-align: center;
}

.avatar-placeholder {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  margin-bottom: 1rem;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-placeholder img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.default-avatar {
  width: 100%;
  height: 100%;
  background: #007bff;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 3rem;
  font-weight: bold;
}

.local-video-container {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 200px;
  height: 150px;
  border-radius: 12px;
  overflow: hidden;
  background: #333;
  border: 2px solid #fff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  transition: all 0.3s ease;
}

.local-video-container.minimized {
  width: 120px;
  height: 90px;
}

.local-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.local-video.hidden {
  display: none;
}

.local-video-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #333;
}

.local-avatar {
  width: 60px;
  height: 60px;
  border-radius: 50%;
}

.local-avatar .default-avatar {
  font-size: 1.5rem;
}

.call-info-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.7), transparent);
  padding: 2rem;
  color: white;
  pointer-events: none;
}

.call-status h2 {
  margin: 0 0 1rem 0;
  font-size: 1.5rem;
  font-weight: 300;
}

.contact-info {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.contact-avatar {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  overflow: hidden;
}

.contact-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.contact-avatar .default-avatar {
  font-size: 1.5rem;
}

.contact-details h3 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.call-duration {
  margin: 0.25rem 0 0 0;
  font-size: 1rem;
  opacity: 0.8;
}

.call-controls {
  position: absolute;
  bottom: 40px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 1rem;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 50px;
  backdrop-filter: blur(10px);
}

.control-btn {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  font-size: 1.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.control-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: scale(1.1);
}

.control-btn.active {
  background: #dc3545;
}

.end-call-btn {
  background: #dc3545;
}

.end-call-btn:hover {
  background: #c82333;
}

.incoming-call-controls {
  position: absolute;
  bottom: 40px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 2rem;
}

.accept-btn,
.reject-btn {
  padding: 1rem 2rem;
  border: none;
  border-radius: 50px;
  font-size: 1.1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 120px;
}

.accept-btn {
  background: #28a745;
  color: white;
}

.accept-btn:hover {
  background: #218838;
  transform: scale(1.05);
}

.reject-btn {
  background: #dc3545;
  color: white;
}

.reject-btn:hover {
  background: #c82333;
  transform: scale(1.05);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .local-video-container {
    width: 120px;
    height: 90px;
    top: 10px;
    right: 10px;
  }
  
  .local-video-container.minimized {
    width: 80px;
    height: 60px;
  }
  
  .call-info-overlay {
    padding: 1rem;
  }
  
  .call-status h2 {
    font-size: 1.25rem;
  }
  
  .contact-avatar {
    width: 50px;
    height: 50px;
  }
  
  .contact-details h3 {
    font-size: 1.1rem;
  }
  
  .control-btn {
    width: 50px;
    height: 50px;
    font-size: 1.25rem;
  }
  
  .call-controls {
    gap: 0.75rem;
    bottom: 20px;
  }
  
  .incoming-call-controls {
    gap: 1rem;
    bottom: 20px;
  }
  
  .accept-btn,
  .reject-btn {
    padding: 0.75rem 1.5rem;
    font-size: 1rem;
    min-width: 100px;
  }
}
</style>