import Database from '@tauri-apps/plugin-sql';
import CryptoJS from 'crypto-js';
import { createLogger } from '../utils/logger.ts';
const log = createLogger('Database');

type SqliteDatabase = Awaited<ReturnType<typeof Database.load>>;
type SqlValue = string | number | null;

type MessageQueryOptions = {
  limit?: number;
  offset?: number;
  search?: string | null;
};

type UserKeyRecord = {
  id: number;
  publicKey: string;
  privateKey: string;
  keyPair: string | null;
  createdAt: string;
  updatedAt?: string | null;
  algorithm?: string | null;
  keySize?: number | null;
};

type UserKeyRow = {
  id: number;
  public_key: string;
  private_key: string;
  key_pair: string | null;
  created_at: string;
  updated_at?: string | null;
  algorithm?: string | null;
  key_size?: number | null;
};

type MessageInput = {
  id?: number;
  from: number;
  to: number;
  content: string;
  timestamp?: string;
  method?: string;
  encrypted?: boolean;
  isRead?: boolean;
  messageType?: string;
  destroyAfter?: number | null;
};

type MessageRow = {
  id: number;
  sender_id: number;
  receiver_id: number;
  content: string;
  timestamp: string;
  method: string;
  encrypted: number;
  is_read: number;
  message_type?: string | null;
  destroy_after?: number | null;
};

type StoredMessage = {
  id: number;
  from: number;
  to: number;
  content: string;
  timestamp: string;
  method: string;
  encrypted: boolean;
  isRead: boolean;
  messageType: string;
  destroyAfter: number | null;
};

type ConversationRow = {
  id: number;
  user_id: number;
  last_message: string | null;
  last_message_time: string | null;
  unread_count: number;
};

type ContactRecord = {
  id: number;
  username?: string | null;
  avatar?: string | null;
  online?: boolean;
  publicKey?: string | null;
  lastSeen?: string | null;
  status?: string | null;
};

type ContactRow = {
  id: number;
  username: string | null;
  avatar: string | null;
  online: number;
  public_key: string | null;
  last_seen: string | null;
  status: string | null;
};

type TableStatus = {
  name: string;
  count: number;
};

type DatabaseStatus = {
  initialized: boolean;
  userId: number;
  storageType: 'SQLite';
  databasePath: string;
  tables: TableStatus[];
};

const CREATE_TABLE_STATEMENTS = [
  `
    CREATE TABLE IF NOT EXISTS user_keys (
      id INTEGER PRIMARY KEY,
      public_key TEXT NOT NULL,
      private_key TEXT NOT NULL,
      key_pair TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      algorithm TEXT,
      key_size INTEGER
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      method TEXT NOT NULL DEFAULT 'P2P',
      encrypted INTEGER NOT NULL DEFAULT 0,
      is_read INTEGER NOT NULL DEFAULT 0,
      message_type TEXT NOT NULL DEFAULT 'text',
      destroy_after INTEGER,
      UNIQUE(sender_id, receiver_id, timestamp)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      last_message TEXT,
      last_message_time TEXT,
      unread_count INTEGER NOT NULL DEFAULT 0
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY,
      username TEXT,
      avatar TEXT,
      online INTEGER NOT NULL DEFAULT 0,
      public_key TEXT,
      last_seen TEXT,
      status TEXT
    )
  `
] as const;

const CREATE_INDEX_STATEMENTS = [
  `CREATE INDEX IF NOT EXISTS idx_messages_sender_receiver ON messages (sender_id, receiver_id)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages (timestamp)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_receiver_sender ON messages (receiver_id, sender_id)`
] as const;

let db: SqliteDatabase | null = null;
let currentDatabasePath: string | null = null;
let currentUserIdForDb: number | null = null;

let dbReadyResolve: (() => void) | null = null;
let dbReadyPromise: Promise<void> = new Promise((resolve) => { dbReadyResolve = resolve; });

export function waitForDatabase(): Promise<void> {
  if (db && currentUserIdForDb) {
    return Promise.resolve();
  }
  return dbReadyPromise;
}

function isTauriEnvironment() {
  if (typeof window === 'undefined') {
    return false;
  }

  const tauriWindow = window as Window & {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  };

  return Boolean(tauriWindow.__TAURI__ || tauriWindow.__TAURI_INTERNALS__);
}

function normalizeUserId(userId: number | string) {
  return String(userId).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function resolveDatabasePath(userId: number | string) {
  return `sqlite:whisper_user_${normalizeUserId(userId)}.db`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object' && 'message' in error && error.message) {
    return String(error.message);
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function toDbBoolean(value: boolean | undefined | null) {
  return value ? 1 : 0;
}

function fromDbBoolean(value: number | boolean | null | undefined) {
  return value === 1 || value === true;
}

function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Please call initDatabase after user login.');
  }

  return db;
}

function getCurrentUserId() {
  const userStr = localStorage.getItem('user');
  if (!userStr) {
    return null;
  }

  try {
    const user = JSON.parse(userStr);
    return Number(user.id || user.userId || 0) || null;
  } catch (error) {
    log.error('解析用户信息失败:', error);
    return null;
  }
}

function encryptContent(content: string, key: string) {
  if (!key) {
    return content;
  }

  try {
    return CryptoJS.AES.encrypt(content, key).toString();
  } catch (error) {
    log.error('加密失败:', error);
    return content;
  }
}

type DecryptResult = {
  content: string;
  decryptionFailed: boolean;
};

function decryptContent(encryptedContent: string, key: string): DecryptResult {
  if (!key) {
    return { content: encryptedContent, decryptionFailed: false };
  }

  try {
    const bytes = CryptoJS.AES.decrypt(encryptedContent, key);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    if (decrypted) {
      return { content: decrypted, decryptionFailed: false };
    }
    return { content: encryptedContent, decryptionFailed: true };
  } catch (error) {
    log.error('解密失败:', error);
    return { content: encryptedContent, decryptionFailed: true };
  }
}

function mapUserKeyRow(row: UserKeyRow | undefined | null): UserKeyRecord | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    publicKey: row.public_key,
    privateKey: row.private_key,
    keyPair: row.key_pair,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? null,
    algorithm: row.algorithm ?? null,
    keySize: row.key_size ?? null
  };
}

function mapMessageRow(row: MessageRow): StoredMessage {
  // timestamp 列是 TEXT，可能存着数字字符串或旧 ISO 字符串，统一转为 number
  let ts: any = row.timestamp;
  if (typeof ts === 'string') {
    const parsed = Number(ts);
    ts = Number.isNaN(parsed) ? new Date(ts).getTime() : parsed;
  }
  return {
    id: row.id,
    from: row.sender_id,
    to: row.receiver_id,
    content: row.content,
    timestamp: ts,
    method: row.method,
    encrypted: fromDbBoolean(row.encrypted),
    isRead: fromDbBoolean(row.is_read),
    messageType: row.message_type || 'text',
    destroyAfter: row.destroy_after ?? null
  };
}

function mapContactRow(row: ContactRow) {
  return {
    id: row.id,
    username: row.username,
    avatar: row.avatar,
    online: fromDbBoolean(row.online),
    publicKey: row.public_key,
    lastSeen: row.last_seen,
    status: row.status
  };
}

async function execute(query: string, values: SqlValue[] = []) {
  return getDb().execute(query, values);
}

async function select<T>(query: string, values: SqlValue[] = []) {
  return getDb().select<T[]>(query, values);
}

async function closeDatabase() {
  if (!db) {
    return;
  }

  await db.close();
  db = null;
  currentDatabasePath = null;
  currentUserIdForDb = null;

  // 关闭后重置 promise，让后续 waitForDatabase 调用等待重新初始化
  dbReadyPromise = new Promise((resolve) => { dbReadyResolve = resolve; });
}

async function initializeSchema() {
  for (const statement of CREATE_TABLE_STATEMENTS) {
    await execute(statement);
  }

  for (const statement of CREATE_INDEX_STATEMENTS) {
    await execute(statement);
  }

  await migrateMessagesUniqueConstraint();
}

async function migrateMessagesUniqueConstraint() {
  try {
    const rows = await select<{ sql: string }>(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name='messages'`
    );
    const schema = rows[0]?.sql || '';
    if (schema.includes('UNIQUE(sender_id, receiver_id, timestamp)')) {
      return;
    }
    log.info('Migrating messages table: adding UNIQUE constraint');
    await execute(`DROP TABLE IF EXISTS messages`);
    await execute(CREATE_TABLE_STATEMENTS[1]);
    for (const stmt of CREATE_INDEX_STATEMENTS) {
      await execute(stmt);
    }
  } catch (error) {
    log.error('messages表迁移失败:', error);
  }
}

async function countTable(tableName: string) {
  const rows = await select<{ count: number }>(`SELECT COUNT(*) AS count FROM ${tableName}`);
  return Number(rows[0]?.count || 0);
}

async function getUserKeysById(userId: number) {
  const rows = await select<UserKeyRow>(
    `
      SELECT id, public_key, private_key, key_pair, created_at, updated_at, algorithm, key_size
      FROM user_keys
      WHERE id = $1
      LIMIT 1
    `,
    [userId]
  );

  return mapUserKeyRow(rows[0]);
}

async function upsertConversation(userId: number, lastMessage: string, timestamp: string | number) {
  await execute(
    `
      INSERT INTO conversations (user_id, last_message, last_message_time, unread_count)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT(user_id) DO UPDATE SET
        last_message = excluded.last_message,
        last_message_time = excluded.last_message_time,
        unread_count = conversations.unread_count + 1
    `,
    [userId, lastMessage, timestamp, 1]
  );
}

async function generateUserKeyPair(userId: number) {
  const createdAt = Date.now();
  const keyPair = {
    publicKey: `pub_${userId}_${Date.now()}`,
    privateKey: `priv_${userId}_${Date.now()}`
  };

  await execute(
    `
      INSERT INTO user_keys (id, public_key, private_key, key_pair, created_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT(id) DO UPDATE SET
        public_key = excluded.public_key,
        private_key = excluded.private_key,
        key_pair = excluded.key_pair,
        created_at = excluded.created_at
    `,
    [userId, keyPair.publicKey, keyPair.privateKey, JSON.stringify(keyPair), createdAt]
  );
}

/**
 * 初始化当前用户的 SQLite 数据库，并在首次使用时自动建表建索引。
 */
export const initDatabase = async (userId: number) => {
  if (!userId) {
    throw new Error('User ID is required to initialize the database');
  }

  if (!isTauriEnvironment()) {
    throw new Error('SQLite 本地数据库仅支持在 Tauri 环境中运行');
  }

  try {
    const nextDatabasePath = resolveDatabasePath(userId);

    if (db && currentDatabasePath === nextDatabasePath && currentUserIdForDb === userId) {
      return true;
    }

    await closeDatabase();

    db = await Database.load(nextDatabasePath);
    currentDatabasePath = nextDatabasePath;
    currentUserIdForDb = userId;

    await initializeSchema();

    const userKeys = await getUserKeysById(userId);
    if (!userKeys) {
      await generateUserKeyPair(userId);
    }


    // 通知所有等待数据库初始化的调用方
    if (dbReadyResolve) {
      dbReadyResolve();
    }

    return true;
  } catch (error) {
    log.error('数据库初始化失败:', getErrorMessage(error), error);

    // 初始化失败时重置 promise，以便下次重试
    dbReadyPromise = new Promise((resolve) => { dbReadyResolve = resolve; });

    throw error;
  }
};

/**
 * 返回当前已初始化的数据库连接实例。
 */
export { getDb };

/**
 * 写入消息；若消息标记为加密，则使用当前用户 private_key 再进行一次本地加密后入库。
 */
export const addMessage = async (message: MessageInput) => {
  const userId = getCurrentUserId();
  if (!userId) {
    throw new Error('User not logged in');
  }

  try {
    const userKeys = await getUserKeysById(userId);
    const symmetricKey = userKeys?.privateKey;

    if (message.encrypted && !symmetricKey) {
      throw new Error('User key not available for encryption.');
    }

    const storedContent = message.encrypted && symmetricKey
      ? encryptContent(message.content, symmetricKey)
      : message.content;
    const timestamp = message.timestamp || Date.now();

    const result = await execute(
      `
        INSERT OR IGNORE INTO messages (
          sender_id,
          receiver_id,
          content,
          timestamp,
          method,
          encrypted,
          is_read,
          message_type,
          destroy_after
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        message.from,
        message.to,
        storedContent,
        timestamp,
        message.method || 'P2P',
        toDbBoolean(message.encrypted),
        toDbBoolean(message.isRead),
        message.messageType || 'text',
        message.destroyAfter ?? null
      ]
    );

    const conversationUserId = message.from === userId ? message.to : message.from;
    await upsertConversation(conversationUserId, message.content, timestamp);

    return result.lastInsertId;
  } catch (error) {
    log.error('保存消息失败:', getErrorMessage(error), error);
    throw error;
  }
};

/**
 * 查询与指定好友的历史消息，出库时将 0/1 转回 Boolean，并对密文内容执行解密。
 */
export const getMessagesWithFriend = async (friendId: number, options: MessageQueryOptions = {}) => {
  const userId = getCurrentUserId();
  const { limit = 50, offset = 0, search = null } = options;

  if (!userId) {
    return {
      messages: [],
      total: 0,
      totalCount: 0,
      count: 0,
      limit,
      offset,
      hasMore: false
    };
  }

  try {
    const rows = await select<MessageRow>(
      `
        SELECT
          id,
          sender_id,
          receiver_id,
          content,
          timestamp,
          method,
          encrypted,
          is_read,
          message_type,
          destroy_after
        FROM messages
        WHERE
          (sender_id = $1 AND receiver_id = $2)
          OR
          (sender_id = $3 AND receiver_id = $4)
        ORDER BY timestamp DESC, id DESC
      `,
      [userId, friendId, friendId, userId]
    );

    const userKeys = await getUserKeysById(userId);
    const decryptionKey = userKeys?.privateKey || '';

    const allMessages = rows.map((row) => {
      const mapped = mapMessageRow(row);
      if (mapped.encrypted && decryptionKey) {
        const result = decryptContent(mapped.content, decryptionKey);
        return {
          ...mapped,
          content: result.content,
          decryptionFailed: result.decryptionFailed
        };
      }
      return {
        ...mapped,
        decryptionFailed: false
      };
    });

    const normalizedSearch = typeof search === 'string' ? search.trim().toLowerCase() : '';
    const filteredMessages = normalizedSearch
      ? allMessages.filter((message) => (message.content || '').toLowerCase().includes(normalizedSearch))
      : allMessages;

    const paginatedMessages = filteredMessages.slice(offset, offset + limit);
    const total = filteredMessages.length;

    return {
      messages: paginatedMessages,
      total,
      totalCount: total,
      count: paginatedMessages.length,
      limit,
      offset,
      hasMore: offset + paginatedMessages.length < total
    };
  } catch (error) {
    log.error('获取消息失败:', getErrorMessage(error), error);
    return {
      messages: [],
      total: 0,
      totalCount: 0,
      count: 0,
      limit,
      offset,
      hasMore: false
    };
  }
};

/**
 * 检查数据库表状态，便于调试 Tauri 端 SQLite 初始化结果。
 */
export const checkDatabaseStatus = async () => {
  try {
    const userId = getCurrentUserId();
    if (!userId || !db || !currentDatabasePath) {
      return { success: false, error: '用户未登录或数据库未初始化' };
    }

    const tables: TableStatus[] = [
      { name: 'user_keys', count: await countTable('user_keys') },
      { name: 'messages', count: await countTable('messages') },
      { name: 'conversations', count: await countTable('conversations') },
      { name: 'contacts', count: await countTable('contacts') }
    ];

    const status: DatabaseStatus = {
      initialized: true,
      userId,
      storageType: 'SQLite',
      databasePath: currentDatabasePath,
      tables
    };

    return {
      success: true,
      ...status
    };
  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error)
    };
  }
};

/**
 * 清空消息与会话列表。
 */
export const clearAllMessages = async () => {
  try {
    await execute('DELETE FROM messages');
    await execute('DELETE FROM conversations');
    return true;
  } catch (error) {
    log.error('清除消息失败:', getErrorMessage(error), error);
    return false;
  }
};

/**
 * 存储或更新当前用户的密钥。
 */
export const storeUserKeys = async (keyData: Partial<UserKeyRecord>) => {
  try {
    const userId = getCurrentUserId();
    if (!userId) {
      throw new Error('用户未登录，无法存储密钥');
    }

    const existingKeys = await getUserKeysById(userId);
    const publicKey = keyData.publicKey || existingKeys?.publicKey;
    const privateKey = keyData.privateKey || existingKeys?.privateKey;

    if (!publicKey || !privateKey) {
      throw new Error('公钥或私钥缺失，无法存储');
    }

    const keyPair = keyData.keyPair ?? existingKeys?.keyPair ?? JSON.stringify({
      publicKey,
      privateKey
    });
    const createdAt = existingKeys?.createdAt || keyData.createdAt || Date.now();
    const updatedAt = keyData.updatedAt || Date.now();

    await execute(
      `
        INSERT INTO user_keys (
          id,
          public_key,
          private_key,
          key_pair,
          created_at,
          updated_at,
          algorithm,
          key_size
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT(id) DO UPDATE SET
          public_key = excluded.public_key,
          private_key = excluded.private_key,
          key_pair = excluded.key_pair,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          algorithm = excluded.algorithm,
          key_size = excluded.key_size
      `,
      [
        userId,
        publicKey,
        privateKey,
        keyPair,
        createdAt,
        updatedAt,
        keyData.algorithm ?? existingKeys?.algorithm ?? null,
        keyData.keySize ?? existingKeys?.keySize ?? null
      ]
    );

    return true;
  } catch (error) {
    log.error('存储用户密钥失败:', getErrorMessage(error), error);
    return false;
  }
};

/**
 * 获取指定用户或当前用户的密钥信息。
 */
export const getUserKeys = async (userId: number | null = null) => {
  try {
    const targetUserId = userId || getCurrentUserId();
    if (!targetUserId) {
      throw new Error('未指定用户ID');
    }

    return await getUserKeysById(targetUserId);
  } catch (error) {
    log.error('获取用户密钥失败:', getErrorMessage(error), error);
    return null;
  }
};

/**
 * 清除指定用户或当前用户的密钥信息。
 */
export const clearUserKeys = async (userId: number | null = null) => {
  try {
    const targetUserId = userId || getCurrentUserId();
    if (!targetUserId) {
      throw new Error('未指定用户ID');
    }

    await execute('DELETE FROM user_keys WHERE id = $1', [targetUserId]);
    return true;
  } catch (error) {
    log.error('清除用户密钥失败:', getErrorMessage(error), error);
    return false;
  }
};

/**
 * 校验当前用户密钥是否完整。
 */
export const validateUserKeys = async () => {
  try {
    const userId = getCurrentUserId();
    if (!userId) {
      return { valid: false, error: '用户未登录' };
    }

    const keys = await getUserKeysById(userId);
    if (!keys) {
      return { valid: false, error: '未找到用户密钥' };
    }

    const requiredFields = ['publicKey', 'privateKey'] as const;
    const missingFields = requiredFields.filter((field) => !keys[field]);

    if (missingFields.length > 0) {
      return {
        valid: false,
        error: `密钥不完整，缺少字段: ${missingFields.join(', ')}`,
        keys: {
          id: keys.id,
          hasPublicKey: Boolean(keys.publicKey),
          hasPrivateKey: Boolean(keys.privateKey),
          createdAt: keys.createdAt
        }
      };
    }

    return {
      valid: true,
      keys: {
        id: keys.id,
        hasPublicKey: true,
        hasPrivateKey: true,
        createdAt: keys.createdAt,
        updatedAt: keys.updatedAt
      }
    };
  } catch (error) {
    log.error('验证用户密钥失败:', getErrorMessage(error), error);
    return { valid: false, error: getErrorMessage(error) };
  }
};

/**
 * 兼容现有业务，继续提供联系人本地缓存能力。
 */
export const addContact = async (contact: ContactRecord) => {
  try {
    await execute(
      `
        INSERT INTO contacts (id, username, avatar, online, public_key, last_seen, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT(id) DO UPDATE SET
          username = excluded.username,
          avatar = excluded.avatar,
          online = excluded.online,
          public_key = excluded.public_key,
          last_seen = excluded.last_seen,
          status = excluded.status
      `,
      [
        contact.id,
        contact.username ?? null,
        contact.avatar ?? null,
        toDbBoolean(contact.online),
        contact.publicKey ?? null,
        contact.lastSeen ?? null,
        contact.status ?? null
      ]
    );

    return contact.id;
  } catch (error) {
    log.error('添加联系人失败:', getErrorMessage(error), error);
    throw error;
  }
};

/**
 * 获取本地联系人列表。
 */
export const getContacts = async () => {
  try {
    const rows = await select<ContactRow>(
      `
        SELECT id, username, avatar, online, public_key, last_seen, status
        FROM contacts
        ORDER BY username ASC, id ASC
      `
    );

    return rows.map(mapContactRow);
  } catch (error) {
    log.error('获取联系人列表失败:', getErrorMessage(error), error);
    return [];
  }
};

/**
 * 标记消息为已读。
 */
export const markMessageAsRead = async (messageId: number | string) => {
  try {
    await execute('UPDATE messages SET is_read = $1 WHERE id = $2', [1, Number(messageId)]);
    return true;
  } catch (error) {
    log.error('标记消息为已读失败:', getErrorMessage(error), error);
    return false;
  }
};

/**
 * 删除指定消息。
 */
export const deleteMessage = async (messageId: number | string) => {
  try {
    await execute('DELETE FROM messages WHERE id = $1', [Number(messageId)]);
    return true;
  } catch (error) {
    log.error('删除消息失败:', getErrorMessage(error), error);
    return false;
  }
};

export default {
  name: 'WhisperLocalDatabase',
  type: 'SQLite (Tauri Plugin SQL)',
  version: '4.0.0',
  encrypted: true,
  db
};
