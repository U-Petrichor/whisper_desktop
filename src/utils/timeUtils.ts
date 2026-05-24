/**
 * 时间工具
 *
 * 统一使用 Unix 时间戳（毫秒数）传输和存储时间。
 * 显示时通过 formatTimestamp() 转为北京时间字符串。
 *
 * 核心原则：
 * - 存储和传输：number（Date.now()，毫秒级 Unix 时间戳）
 * - 显示：formatTimestamp(timestamp) → "16:40" / "昨天 16:40" / "5月24日 16:40"
 *
 * 兼容旧数据：旧的 getChinaTimeISO() 生成的 ISO 字符串会被 cleanTimestamp()
 * 在进入 store 时统一转为 number，formatTimestamp 不再需要处理 string。
 */

const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * 格式化时间戳为北京时间字符串
 * @param {number} timestamp - 毫秒级 Unix 时间戳
 * @returns {string} 格式化的时间字符串
 */
export function formatTimestamp(timestamp) {
  if (!timestamp) return '';

  const ts = typeof timestamp === 'number' ? timestamp : Number(timestamp);
  if (Number.isNaN(ts) || ts === 0) return '';

  const chinaMs = ts + CHINA_OFFSET_MS;
  const d = new Date(chinaMs);
  const nowChina = Date.now() + CHINA_OFFSET_MS;
  const n = new Date(nowChina);

  const hours = d.getUTCHours().toString().padStart(2, '0');
  const minutes = d.getUTCMinutes().toString().padStart(2, '0');
  const timeStr = `${hours}:${minutes}`;

  const messageDay = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const todayDay = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
  const yesterdayDay = todayDay - 86400000;

  if (messageDay === todayDay) {
    return timeStr;
  } else if (messageDay === yesterdayDay) {
    return `昨天 ${timeStr}`;
  } else if (d.getUTCFullYear() === n.getUTCFullYear()) {
    return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日 ${timeStr}`;
  } else {
    return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日 ${timeStr}`;
  }
}

/**
 * 生成临时消息ID
 * @returns {string}
 */
export function generateTempMessageId() {
  return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
