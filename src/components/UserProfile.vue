<template>
  <div class="user-profile-container">
    <div class="profile-header">
      <button @click="closeProfile" class="header-btn">
        <span class="material-symbols-outlined">arrow_back</span>
      </button>
      <h2>{{ isViewingFriend ? '好友信息' : '个人信息' }}</h2>
      <button @click="closeProfile" class="header-btn">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>

    <div class="profile-content">
      <form @submit.prevent="saveProfile" class="profile-form">
        <!-- Avatar -->
        <div class="avatar-section">
          <div class="avatar-preview" @click="!isViewingFriend && triggerFileInput()">
            <img v-if="currentUser.avatar" :src="getAvatarUrl(currentUser.avatar)" alt="头像" class="avatar-image" />
            <span v-else class="material-symbols-outlined avatar-placeholder-icon">person</span>
            <div v-if="!isViewingFriend" class="avatar-overlay">
              <span class="material-symbols-outlined">photo_camera</span>
            </div>
          </div>
          <input
            ref="fileInput"
            type="file"
            accept="image/*"
            @change="handleAvatarUpload"
            style="display: none"
            :disabled="isViewingFriend"
          />
          <button v-if="!isViewingFriend && currentUser.avatar" type="button" @click="deleteAvatar" class="delete-avatar-btn" :disabled="uploading">
            <span class="material-symbols-outlined">delete</span>
          </button>
        </div>

        <!-- Display Name -->
        <div class="input-group">
          <label>显示名称</label>
          <input type="text" v-model="profileData.display_name" placeholder="请输入显示名称" class="text-input" :readonly="isViewingFriend" />
        </div>

        <!-- Birthday -->
        <div class="input-group">
          <label>生日</label>
          <input type="date" v-model="profileData.birthday" class="text-input" :readonly="isViewingFriend" />
        </div>

        <!-- Age -->
        <div class="input-group">
          <label>年龄</label>
          <input type="number" v-model.number="profileData.age" placeholder="请输入年龄" min="1" max="150" class="text-input" :readonly="isViewingFriend" />
        </div>

        <!-- Gender -->
        <div class="input-group">
          <label>性别</label>
          <select v-model="profileData.gender" class="text-input" :disabled="isViewingFriend">
            <option value="">请选择</option>
            <option value="male">男</option>
            <option value="female">女</option>
            <option value="other">其他</option>
          </select>
        </div>

        <!-- Hobbies -->
        <div class="input-group">
          <label>爱好</label>
          <textarea v-model="profileData.hobbies" placeholder="用逗号分隔" class="text-input" rows="2" :readonly="isViewingFriend"></textarea>
        </div>

        <!-- Signature -->
        <div class="input-group">
          <label>个性签名</label>
          <textarea v-model="profileData.signature" placeholder="写点什么..." class="text-input" rows="2" :readonly="isViewingFriend"></textarea>
        </div>

        <!-- Actions -->
        <div v-if="!isViewingFriend" class="form-actions">
          <button type="submit" class="primary-btn" :disabled="saving">
            {{ saving ? '保存中...' : '保存' }}
          </button>
          <button type="button" @click="resetForm" class="secondary-btn">重置</button>
        </div>
      </form>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="loading-overlay">
      <div class="loading-spinner"></div>
    </div>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted } from 'vue'
import { hybridApi } from '@/api/hybrid-api'
import { createLogger } from '@/utils/logger'
const log = createLogger('UserProfile')

export default {
  name: 'UserProfile',
  props: {
    userId: {
      type: String,
      default: null
    }
  },
  emits: ['close', 'avatar-updated'],
  setup(props, { emit }) {
    const loading = ref(false)
    const saving = ref(false)
    const uploading = ref(false)
    const hasExistingProfile = ref(false)
    const fileInput = ref(null)

    const currentUser = reactive({ avatar: null })

    const isViewingFriend = computed(() => props.userId !== null)

    const profileData = reactive({
      display_name: '',
      birthday: '',
      age: null,
      gender: '',
      hobbies: '',
      signature: ''
    })

    const originalData = reactive({})

    const loadProfile = async () => {
      loading.value = true
      try {
        let response
        if (isViewingFriend.value) {
          response = await hybridApi.getUserProfile(props.userId)
          if (response.data) {
            Object.assign(profileData, response.data)
            Object.assign(originalData, response.data)
            currentUser.avatar = response.data.avatar
            hasExistingProfile.value = true
          }
        } else {
          response = await hybridApi.get()
          if (response.data) {
            Object.assign(profileData, response.data)
            Object.assign(originalData, response.data)
            hasExistingProfile.value = true
          }
          const userInfo = await hybridApi.getUserInfo()
          if (userInfo.data?.avatar !== undefined) {
            currentUser.avatar = userInfo.data.avatar
          } else if (userInfo.data?.data?.user?.avatar !== undefined) {
            currentUser.avatar = userInfo.data.data.user.avatar
          }
        }
      } catch (error) {
        if (error.response?.status !== 404) {
          log.error('加载个人信息失败:', error)
        }
      } finally {
        loading.value = false
      }
    }

    const saveProfile = async () => {
      saving.value = true
      try {
        let response
        if (hasExistingProfile.value) {
          response = await hybridApi.put(profileData)
        } else {
          response = await hybridApi.post(profileData)
        }
        if (response.data?.success) {
          alert('保存成功')
          Object.assign(originalData, profileData)
          hasExistingProfile.value = true
        } else {
          throw new Error(response.data?.message || '保存失败')
        }
      } catch (error) {
        log.error('保存个人信息失败:', error)
        alert(error.response?.data?.detail || '保存失败，请稍后重试')
      } finally {
        saving.value = false
      }
    }

    const resetForm = () => { Object.assign(profileData, originalData) }

    const triggerFileInput = () => { fileInput.value?.click() }

    const handleAvatarUpload = async (event) => {
      const file = event.target.files[0]
      if (!file) return
      if (!file.type.startsWith('image/')) { alert('请选择图片文件'); return }
      if (file.size > 5 * 1024 * 1024) { alert('图片大小不能超过5MB'); return }

      uploading.value = true
      try {
        const response = await hybridApi.uploadAvatar(file)
        if (response.data?.data?.avatarUrl) {
          const newAvatarUrl = response.data.data.avatarUrl
          currentUser.avatar = newAvatarUrl
          const { hybridStore } = await import('@/store/hybrid-store')
          if (hybridStore.user && hybridStore.user.id) {
            hybridStore.updateContactAvatar(hybridStore.user.id, newAvatarUrl)
          }
          emit('avatar-updated', newAvatarUrl)
          alert('头像上传成功')
        }
      } catch (error) {
        log.error('头像上传失败:', error)
        alert('头像上传失败，请稍后重试')
      } finally {
        uploading.value = false
        if (fileInput.value) fileInput.value.value = ''
      }
    }

    const deleteAvatar = async () => {
      if (!currentUser.avatar) { alert('没有头像可删除'); return }
      if (!confirm('确定要删除头像吗？')) return

      uploading.value = true
      try {
        await hybridApi.deleteAvatar()
        currentUser.avatar = null
        const { hybridStore } = await import('@/store/hybrid-store')
        if (hybridStore.user && hybridStore.user.id) {
          hybridStore.updateContactAvatar(hybridStore.user.id, null)
        }
        emit('avatar-updated', null)
        alert('头像删除成功')
      } catch (error) {
        log.error('头像删除失败:', error)
        alert('头像删除失败，请稍后重试')
      } finally {
        uploading.value = false
      }
    }

    const getAvatarUrl = (avatarPath) => {
      if (!avatarPath) return ''
      if (avatarPath.startsWith('http')) return avatarPath
      if (avatarPath.startsWith('/api/')) return avatarPath
      return `${avatarPath.startsWith('/') ? '' : '/'}${avatarPath}`
    }

    const closeProfile = () => { emit('close') }

    onMounted(() => { loadProfile() })

    return {
      loading, saving, uploading, profileData, currentUser, fileInput,
      isViewingFriend, saveProfile, resetForm, closeProfile,
      triggerFileInput, handleAvatarUpload, deleteAvatar, getAvatarUrl
    }
  }
}
</script>

<style scoped>
.user-profile-container {
  position: fixed;
  top: 0;
  right: 0;
  width: 340px;
  height: 100vh;
  background: var(--whisper-surface-container-low);
  border-left: 1px solid var(--whisper-outline-variant);
  z-index: 1000;
  display: flex;
  flex-direction: column;
}

.profile-header {
  display: flex;
  align-items: center;
  padding: 0 var(--whisper-sm);
  height: var(--whisper-titlebar-height);
  background: var(--whisper-surface-container-low);
  flex-shrink: 0;
}

.profile-header h2 {
  flex: 1;
  text-align: center;
  margin: 0;
  font-size: var(--whisper-fs-body-lg);
  font-weight: var(--whisper-fw-headline-md);
  color: var(--whisper-on-surface);
}

.header-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: var(--whisper-radius-full);
  background: transparent;
  color: var(--whisper-on-surface-variant);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}

.header-btn:hover {
  background: var(--whisper-surface-container-high);
}

.header-btn .material-symbols-outlined {
  font-size: 20px;
}

.profile-content {
  flex: 1;
  padding: var(--whisper-md);
  overflow-y: auto;
}

.profile-form {
  display: flex;
  flex-direction: column;
  gap: var(--whisper-md);
}

/* Avatar */
.avatar-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--whisper-sm);
}

.avatar-preview {
  position: relative;
  width: 72px;
  height: 72px;
  border-radius: var(--whisper-radius-full);
  overflow: hidden;
  cursor: pointer;
  border: 2px solid var(--whisper-outline-variant);
  background: var(--whisper-surface-container);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.15s;
}

.avatar-preview:hover {
  border-color: var(--whisper-primary);
}

.avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder-icon {
  font-size: 32px;
  color: var(--whisper-on-surface-variant);
}

.avatar-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  opacity: 0;
  transition: opacity 0.15s;
}

.avatar-overlay .material-symbols-outlined {
  font-size: 20px;
}

.avatar-preview:hover .avatar-overlay {
  opacity: 1;
}

.delete-avatar-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--whisper-radius-full);
  background: var(--whisper-error-container);
  color: var(--whisper-error);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}

.delete-avatar-btn .material-symbols-outlined {
  font-size: 16px;
}

.delete-avatar-btn:hover:not(:disabled) {
  background: var(--whisper-error);
  color: var(--whisper-on-error);
}

.delete-avatar-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Input groups */
.input-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.input-group label {
  font-size: var(--whisper-fs-label-md);
  font-weight: var(--whisper-fw-label-md);
  color: var(--whisper-on-surface-variant);
  letter-spacing: var(--whisper-ls-label-md);
}

.text-input {
  width: 100%;
  padding: var(--whisper-sm) 0;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--whisper-outline-variant);
  color: var(--whisper-on-surface);
  font-size: var(--whisper-fs-body-md);
  font-family: var(--whisper-font-family);
  outline: none;
  transition: border-color 0.15s;
}

.text-input:focus {
  border-bottom: 2px solid var(--whisper-primary);
}

.text-input::placeholder {
  color: var(--whisper-on-surface-variant);
  opacity: 0.5;
}

.text-input:read-only {
  color: var(--whisper-on-surface-variant);
  cursor: default;
  border-bottom-style: dashed;
}

select.text-input:disabled {
  color: var(--whisper-on-surface-variant);
  cursor: not-allowed;
  border-bottom-style: dashed;
}

textarea.text-input {
  resize: vertical;
  min-height: 40px;
}

.text-input:-webkit-autofill,
.text-input:-webkit-autofill:hover,
.text-input:-webkit-autofill:focus {
  -webkit-box-shadow: 0 0 0 1000px var(--whisper-surface-container) inset;
  -webkit-text-fill-color: var(--whisper-on-surface);
  caret-color: var(--whisper-on-surface);
  transition: background-color 9999s ease-in-out 0s;
}

/* Actions */
.form-actions {
  display: flex;
  gap: var(--whisper-sm);
  margin-top: var(--whisper-sm);
}

.primary-btn {
  flex: 1;
  padding: 10px 0;
  border: none;
  border-radius: var(--whisper-radius-full);
  background: var(--whisper-primary);
  color: var(--whisper-on-primary);
  font-size: var(--whisper-fs-label-md);
  font-weight: var(--whisper-fw-label-md);
  cursor: pointer;
  transition: background 0.15s;
}

.primary-btn:hover:not(:disabled) {
  background: var(--whisper-primary-hover, #a8b8b7);
}

.primary-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.secondary-btn {
  flex: 1;
  padding: 10px 0;
  border: none;
  border-radius: var(--whisper-radius-full);
  background: var(--whisper-surface-container-high);
  color: var(--whisper-on-surface-variant);
  font-size: var(--whisper-fs-label-md);
  font-weight: var(--whisper-fw-label-md);
  cursor: pointer;
  transition: background 0.15s;
}

.secondary-btn:hover {
  background: var(--whisper-surface-container-highest);
}

/* Loading */
.loading-overlay {
  position: absolute;
  inset: 0;
  background: rgba(14, 14, 14, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--whisper-outline-variant);
  border-radius: 50%;
  border-top-color: var(--whisper-primary);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 768px) {
  .user-profile-container {
    width: 100vw;
  }
}
</style>
