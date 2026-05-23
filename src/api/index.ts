import axios from 'axios';
import config from '../config/config.ts';

const api = axios.create({
  baseURL: config.API_BASE_URL + '/api',
});

const authHeaders = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

// 用户注册
export function register(data) {
  // 后端实现：用户注册
  return api.post('/v1/auth/register', data);
}

// 用户登录
export function login(data) {
  // 后端实现：用户登录，返回token
  return api.post('/v1/auth/login', data);
}

// 获取联系人列表
export function getContacts(token) {
  // 后端实现：返回当前用户的联系人
  return api.get('/v1/contacts', authHeaders(token));
}

// 添加好友
export function addContact(token, friendId) {
  // 后端实现：发送好友申请
  return api.post('/v1/contacts/request', { to_user_id: friendId }, authHeaders(token));
}

// 获取公钥
export function getPublicKey(token, userId) {
  return api.get(`/v1/e2ee/key-bundle/${userId}`, authHeaders(token));
}

// 上传公钥
export function uploadPublicKey(token, keyBundle) {
  return api.post('/v1/e2ee/key-bundle', keyBundle, authHeaders(token));
}

// 获取密钥指纹
export function getFingerprint(token) {
  return api.get('/v1/e2ee/key-bundle/me', authHeaders(token));
}

// 获取消息历史
export function getMessageHistory(token, peerId, page = 1, limit = 50) {
  return api.get(`/v1/messages/history/${peerId}?page=${page}&limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// 发送消息
export function sendMessage(token, data) {
  return api.post('/v1/messages', data, authHeaders(token));
}
