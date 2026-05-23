import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

import { SignalHttpRuntime } from '../src/services/signal-runtime.ts';

function waitForRuntime(baseUrl: string): Promise<void> {
  const deadline = Date.now() + 10_000;

  return new Promise((resolveReady, rejectReady) => {
    const check = async () => {
      try {
        const response = await fetch(`${baseUrl}/health`);
        if (response.ok) {
          resolveReady();
          return;
        }
      } catch {
        // Keep polling until the bridge is ready or the deadline expires.
      }

      if (Date.now() > deadline) {
        rejectReady(new Error('Signal bridge did not become ready'));
        return;
      }
      setTimeout(check, 100);
    };

    check();
  });
}

test('Signal runtime encrypts and decrypts messages with persisted sessions', async (t) => {
  const stateDir = mkdtempSync(join(tmpdir(), 'whisper-signal-runtime-'));
  const port = 18765 + Math.floor(Math.random() * 1000);
  const baseUrl = `http://127.0.0.1:${port}`;
  const bridgePath = resolve(process.cwd(), 'scripts/signal_bridge.py');
  const python = process.env.SIGNAL_BRIDGE_PYTHON || 'python';

  const bridge = spawn(
    python,
    [bridgePath, 'serve', '--host', '127.0.0.1', '--port', String(port), '--state-dir', stateDir],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PYTHONPATH: resolve(process.cwd(), '..', 'whisper_encryption'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  t.after(() => bridge.kill());

  let stderr = '';
  bridge.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  await waitForRuntime(baseUrl).catch((error) => {
    throw new Error(`${error.message}\n${stderr}`);
  });

  const aliceRuntime = new SignalHttpRuntime({ baseUrl, userId: 1 });
  const bobRuntime = new SignalHttpRuntime({ baseUrl, userId: 2 });

  const aliceAccount = await aliceRuntime.createAccount({ opkCount: 2 });
  const bobAccount = await bobRuntime.createAccount({ opkCount: 2 });

  assert.equal(aliceAccount.userId, 1);
  assert.equal(bobAccount.userId, 2);
  assert.ok(bobAccount.keyBundle.identityPublicKey);
  assert.equal(bobAccount.keyBundle.oneTimePreKeys.length, 2);

  const firstEnvelope = await aliceRuntime.encryptMessage({
    toUserId: 2,
    plaintext: 'hello bob through signal',
    recipientBundle: {
      ...bobAccount.keyBundle,
      oneTimePreKey: bobAccount.keyBundle.oneTimePreKeys[0],
    },
  });

  assert.equal(firstEnvelope.type, 'signal_message');
  assert.notEqual(firstEnvelope.ciphertext, 'hello bob through signal');

  const firstPlaintext = await bobRuntime.decryptMessage({
    fromUserId: 1,
    envelope: firstEnvelope,
  });
  assert.equal(firstPlaintext, 'hello bob through signal');

  const secondEnvelope = await aliceRuntime.encryptMessage({
    toUserId: 2,
    plaintext: 'second ratchet step',
    recipientBundle: {
      ...bobAccount.keyBundle,
      oneTimePreKey: null,
    },
  });

  const restartedBobRuntime = new SignalHttpRuntime({ baseUrl, userId: 2 });
  const secondPlaintext = await restartedBobRuntime.decryptMessage({
    fromUserId: 1,
    envelope: secondEnvelope,
  });
  assert.equal(secondPlaintext, 'second ratchet step');
});
