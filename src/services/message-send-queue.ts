/**
 * 消息发送队列 — 缓存已加密的 envelope，发送失败时重发同一密文包，不重新加密。
 * 纯内存实现，不写磁盘（持久化是后续任务）。
 */

export type EnvelopeStatus = 'pending' | 'sending' | 'failed';

export interface CachedEnvelope {
  tempId: string;
  recipientUserId: string;
  plaintext: string;
  encryptedEnvelope: string;
  messageType: string;
  options: Record<string, unknown>;
  encryptedAt: number;
  attempts: number;
  lastAttemptAt: number | null;
  status: EnvelopeStatus;
}

class MessageSendQueue {
  private queue: Map<string, CachedEnvelope> = new Map();

  private key(recipientUserId: string, tempId: string): string {
    return `${recipientUserId}:${tempId}`;
  }

  add(envelope: CachedEnvelope): void {
    this.queue.set(this.key(envelope.recipientUserId, envelope.tempId), envelope);
  }

  get(recipientUserId: string, tempId: string): CachedEnvelope | undefined {
    return this.queue.get(this.key(recipientUserId, tempId));
  }

  remove(recipientUserId: string, tempId: string): boolean {
    return this.queue.delete(this.key(recipientUserId, tempId));
  }

  markSending(recipientUserId: string, tempId: string): void {
    const entry = this.get(recipientUserId, tempId);
    if (entry) {
      entry.status = 'sending';
      entry.attempts++;
      entry.lastAttemptAt = Date.now();
    }
  }

  markFailed(recipientUserId: string, tempId: string): void {
    const entry = this.get(recipientUserId, tempId);
    if (entry) {
      entry.status = 'failed';
    }
  }

  getPendingForRecipient(recipientUserId: string): CachedEnvelope[] {
    const results: CachedEnvelope[] = [];
    for (const entry of this.queue.values()) {
      if (entry.recipientUserId === recipientUserId && (entry.status === 'pending' || entry.status === 'failed')) {
        results.push(entry);
      }
    }
    return results;
  }

  getAllFailed(): CachedEnvelope[] {
    const results: CachedEnvelope[] = [];
    for (const entry of this.queue.values()) {
      if (entry.status === 'failed') {
        results.push(entry);
      }
    }
    return results;
  }

  clear(): void {
    this.queue.clear();
  }
}

export const sendQueue = new MessageSendQueue();