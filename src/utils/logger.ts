type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';

const LOG_LEVELS: Record<LogLevel, number> = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
};

const CURRENT_LOG_LEVEL: number = import.meta.env.VITE_LOG_LEVEL
  ? LOG_LEVELS[import.meta.env.VITE_LOG_LEVEL.toUpperCase() as LogLevel]
  : LOG_LEVELS.WARN;

class Logger {
  static error(message: string, ...args: unknown[]): void {
    if (CURRENT_LOG_LEVEL >= LOG_LEVELS.ERROR) {
      console.error(message, ...args);
    }
  }

  static warn(message: string, ...args: unknown[]): void {
    if (CURRENT_LOG_LEVEL >= LOG_LEVELS.WARN) {
      console.warn(message, ...args);
    }
  }

  static info(message: string, ...args: unknown[]): void {
    if (CURRENT_LOG_LEVEL >= LOG_LEVELS.INFO) {
      console.log(message, ...args);
    }
  }

  static debug(message: string, ...args: unknown[]): void {
    if (CURRENT_LOG_LEVEL >= LOG_LEVELS.DEBUG) {
      console.log('[DEBUG]', message, ...args);
    }
  }

  static getCurrentLevel(): string {
    return Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key as LogLevel] === CURRENT_LOG_LEVEL) ?? 'WARN';
  }
}

interface ScopedLogger {
  error(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

function createLogger(context: string): ScopedLogger {
  return {
    error: (message: string, ...args: unknown[]) =>
      Logger.error(`[${context}] ${message}`, ...args),
    warn: (message: string, ...args: unknown[]) =>
      Logger.warn(`[${context}] ${message}`, ...args),
    info: (message: string, ...args: unknown[]) =>
      Logger.info(`[${context}] ${message}`, ...args),
    debug: (message: string, ...args: unknown[]) =>
      Logger.debug(`[${context}] ${message}`, ...args),
  };
}

export default Logger;
export { createLogger, LOG_LEVELS };
export type { LogLevel, ScopedLogger };

// ============================================================
// 🔒 CryptoDebug — 加密调试日志（测试阶段专用）
// 测试完成后：改 ENABLED = false 关闭，或删掉此类 + 搜索 CryptoDebug 删除所有引用
// ============================================================
export class CryptoDebug {
  private static ENABLED = true;

  static logPlaintext(recipientUserId: string, plaintext: string) {
    if (!this.ENABLED) return;
    console.group('🔒 [CryptoDebug] 加密流程');
    console.log('  📝 明文:', plaintext);
    console.log('  👤 收件人 ID:', recipientUserId);
  }

  static logEncryptedEnvelope(envelope: { ciphertext: string; header: { dhPubKey: string; n: number; pn: number } }) {
    if (!this.ENABLED) return;
    console.log('  🔑 DH Ratchet Key (dhPubKey):', envelope.header?.dhPubKey);
    console.log('  🔢 发送序号 (n):', envelope.header?.n);
    console.log('  🔢 前一发送序号 (pn):', envelope.header?.pn);
    console.log('  📦 密文 (前80字符):', envelope.ciphertext?.substring(0, 80) + '...');
    console.groupEnd();
  }

  static logTransport(method: 'Server' | 'P2P', contentPreview: string) {
    if (!this.ENABLED) return;
    console.log(`  🚀 发送方式: ${method} | 密文预览: ${contentPreview.substring(0, 60)}...`);
  }
}
