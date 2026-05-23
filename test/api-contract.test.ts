import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as apiContract from '../src/utils/api-contract.ts';
import {
  extractAuthPayload,
  extractPaginatedItems,
  extractUserId,
  extractWsPayload,
} from '../src/utils/api-contract.ts';

test('extractAuthPayload reads wrapped auth responses', () => {
  const payload = extractAuthPayload({
    data: {
      success: true,
      data: {
        token: 'token-value',
        user: { userId: 7, username: 'alice' },
      },
    },
  });

  assert.equal(payload.token, 'token-value');
  assert.deepEqual(payload.user, { userId: 7, username: 'alice' });
});

test('extractAuthPayload still accepts legacy flat auth responses', () => {
  const payload = extractAuthPayload({
    data: {
      token: 'legacy-token',
      user: { id: 3, username: 'bob' },
      keys: { identity: 'local-only' },
    },
  });

  assert.equal(payload.token, 'legacy-token');
  assert.deepEqual(payload.user, { id: 3, username: 'bob' });
  assert.deepEqual(payload.keys, { identity: 'local-only' });
});

test('extractPaginatedItems reads wrapped and direct paginated responses', () => {
  assert.deepEqual(
    extractPaginatedItems({ data: { data: { items: [{ id: 1 }] } } }),
    [{ id: 1 }],
  );
  assert.deepEqual(
    extractPaginatedItems({ data: { items: [{ id: 2 }] } }),
    [{ id: 2 }],
  );
});

test('extractWsPayload accepts both payload and data websocket shapes', () => {
  assert.deepEqual(extractWsPayload({ payload: { userId: 1 } }), { userId: 1 });
  assert.deepEqual(extractWsPayload({ data: { userId: 2 } }), { userId: 2 });
});

test('extractUserId accepts camelCase and legacy id fields', () => {
  assert.equal(extractUserId({ userId: 7 }), 7);
  assert.equal(extractUserId({ id: '8' }), 8);
  assert.equal(extractUserId(null), null);
});

test('frontend API wrappers do not call removed backend routes', () => {
  const checkedFiles = [
    'src/api/hybrid-api.ts',
    'src/api/index.ts',
    'src/components/LoginRegister.vue',
    'src/views/login.vue',
  ];
  const removedRoutes = [
    '/v1/keys/public',
    '/v1/encryption/my-keys',
    '/v1/messages/send',
    '/v1/contacts/add',
    '/v1/keys/exchange',
    '/v1/keys/fingerprint',
  ];

  const offenders = [];
  for (const file of checkedFiles) {
    const source = readFileSync(join(process.cwd(), file), 'utf8');
    for (const route of removedRoutes) {
      if (source.includes(route)) offenders.push(`${file}: ${route}`);
    }
  }

  assert.deepEqual(offenders, []);
});

test('desktop key API wrappers use current E2EE routes', () => {
  const source = readFileSync(join(process.cwd(), 'src/api/hybrid-api.ts'), 'utf8');

  assert.match(source, /uploadKeyBundle:[\s\S]*post\('\/v1\/e2ee\/key-bundle'/);
  assert.match(source, /getPreKeyBundle:[\s\S]*get\(`\/v1\/e2ee\/key-bundle\/\$\{userId\}`/);
  assert.match(source, /getMyKeyBundleStatus:[\s\S]*get\('\/v1\/e2ee\/key-bundle\/me'/);
});

test('extractPendingSentRequestUserIds keeps only pending sent targets', () => {
  assert.equal(typeof apiContract.extractPendingSentRequestUserIds, 'function');

  const ids = apiContract.extractPendingSentRequestUserIds({
    data: {
      success: true,
      data: [
        { to_user_id: 10, status: 'pending' },
        { toUserId: '11', status: 'pending' },
        { to_user_id: 12, status: 'accepted' },
        { to_user_id: 13, status: 'rejected' },
      ],
    },
  });

  assert.deepEqual(ids, new Set([10, 11]));
});

test('auth views pass normalized ids and encryption data into encryption initialization', () => {
  const checkedFiles = [
    'src/components/LoginRegister.vue',
    'src/views/login.vue',
    'src/views/register.vue',
  ];
  const forbiddenSnippets = [
    'parseInt(user.id)',
    'initializeUserEncryption(\r\n        authPayload.user',
    'initializeUserEncryption(\n        authPayload.user',
    'initializeUserEncryption(\r\n            hybridStore.user,',
    'initializeUserEncryption(\n            hybridStore.user,',
  ];

  const offenders = [];
  for (const file of checkedFiles) {
    const source = readFileSync(join(process.cwd(), file), 'utf8');
    for (const snippet of forbiddenSnippets) {
      if (source.includes(snippet)) offenders.push(`${file}: ${snippet.replace(/\s+/g, ' ')}`);
    }
  }

  assert.deepEqual(offenders, []);
});
