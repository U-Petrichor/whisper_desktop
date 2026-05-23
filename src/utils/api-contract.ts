export function extractResponseBody(response: any): any {
  return response?.data ?? response;
}

export function extractPayload(response: any): any {
  const body = extractResponseBody(response);
  if (!body || typeof body !== 'object') return body;

  if (Object.prototype.hasOwnProperty.call(body, 'data')) {
    return body.data;
  }

  return body;
}

export function extractAuthPayload(response: any): any {
  const body = extractResponseBody(response);
  const payload = body?.data && (body.data.user || body.data.token || body.data.keys)
    ? body.data
    : body;

  return {
    user: payload?.user ?? null,
    token: payload?.token ?? null,
    keys: payload?.keys ?? null,
    publicKey: payload?.public_key ?? payload?.publicKey ?? null,
    registrationId: payload?.registration_id ?? payload?.registrationId ?? payload?.user?.id ?? payload?.user?.userId ?? null,
  };
}

export function extractUserId(user: any): number | null {
  const rawId = user?.id ?? user?.userId;
  if (rawId === null || rawId === undefined || rawId === '') return null;

  const numericId = Number(rawId);
  return Number.isFinite(numericId) ? numericId : null;
}

export function extractPaginatedItems(response: any): any[] {
  const body = extractResponseBody(response);

  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.items)) return body.items;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.data?.items)) return body.data.items;

  return [];
}

export function extractWsPayload(message: any): any {
  if (!message || typeof message !== 'object') return message;
  return message.payload ?? message.data ?? message;
}

export function extractPendingSentRequestUserIds(response: any): Set<number> {
  const payload = extractPayload(response);
  const requests = Array.isArray(payload)
    ? payload
    : extractPaginatedItems(response);

  const ids = requests
    .filter((request: any) => request?.status === 'pending')
    .map((request: any) => Number(request?.to_user_id ?? request?.toUserId))
    .filter((id: number) => Number.isFinite(id));

  return new Set(ids);
}
