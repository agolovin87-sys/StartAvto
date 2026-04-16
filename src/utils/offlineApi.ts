/**
 * Обёртка над fetch с кэшем JSON (GET) и очередью мутаций при офлайне.
 * Firestore синхронизируется сам через persistent cache; очередь нужна для REST API.
 */

import {
  cacheData,
  getCachedData,
  getOfflineDataCachingEnabled,
  invalidateCache,
} from "@/utils/offlineCache";

const QUEUE_KEY = "startavto-fetch-mutation-queue";

export type QueuedMutation = {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  enqueuedAt: number;
};

function loadQueue(): QueuedMutation[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as QueuedMutation[]) : [];
  } catch {
    return [];
  }
}

function saveQueue(q: QueuedMutation[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    /* */
  }
}

export function getPendingSyncRequestCount(): number {
  return loadQueue().length;
}

function randomId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Добавить мутацию в очередь (вызывается из apiRequest при офлайне). */
export function enqueueMutation(init: {
  url: string;
  method: string;
  headers?: HeadersInit;
  body?: BodyInit | null;
}): void {
  const headers: Record<string, string> = {};
  if (init.headers) {
    const h = new Headers(init.headers);
    h.forEach((v, k) => {
      headers[k] = v;
    });
  }
  let bodyStr: string | null = null;
  if (typeof init.body === "string") bodyStr = init.body;
  else if (init.body instanceof ArrayBuffer) {
    bodyStr = "[binary]";
  } else if (init.body != null && typeof (init.body as Blob).arrayBuffer === "function") {
    bodyStr = "[blob]";
  }

  const q = loadQueue();
  q.push({
    id: randomId(),
    url: init.url,
    method: init.method.toUpperCase(),
    headers,
    body: bodyStr,
    enqueuedAt: Date.now(),
  });
  saveQueue(q);
}

/** Повторная отправка очереди (после восстановления сети или по кнопке). */
export async function flushMutationQueue(): Promise<{ ok: number; fail: number }> {
  const q = loadQueue();
  if (q.length === 0) return { ok: 0, fail: 0 };
  let ok = 0;
  let fail = 0;
  const remaining: QueuedMutation[] = [];

  for (const item of q) {
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body,
      });
      if (res.ok) ok++;
      else {
        fail++;
        remaining.push(item);
      }
    } catch {
      fail++;
      remaining.push(item);
    }
  }
  saveQueue(remaining);
  return { ok, fail };
}

export type ApiRequestCacheOptions = {
  ttl?: number;
  forceFresh?: boolean;
};

/**
 * Универсальный запрос: GET кэшируется; POST/PUT/PATCH/DELETE при офлайне ставятся в очередь
 * (только если тело — строка или пусто; сложные тела не сериализуем).
 */
export async function apiRequest<T>(
  url: string,
  options?: RequestInit,
  cacheOptions?: ApiRequestCacheOptions
): Promise<T> {
  const { ttl = 5 * 60 * 1000, forceFresh = false } = cacheOptions || {};
  const method = (options?.method ?? "GET").toUpperCase();
  const cacheAllowed = getOfflineDataCachingEnabled();

  if (method === "GET") {
    const cacheKey = `api-get:${url}`;
    if (!forceFresh && typeof navigator !== "undefined" && navigator.onLine === false) {
      const cached = cacheAllowed ? getCachedData<T>(cacheKey) : null;
      if (cached != null) return cached;
    }

    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as T;
      if (cacheAllowed) cacheData(cacheKey, data, ttl, url);
      return data;
    } catch (error) {
      const cached = cacheAllowed ? getCachedData<T>(cacheKey) : null;
      if (cached != null) return cached;
      throw error;
    }
  }

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    const body = options?.body;
    if (
      body === undefined ||
      body === null ||
      typeof body === "string" ||
      body instanceof URLSearchParams
    ) {
      enqueueMutation({
        url,
        method,
        headers: options?.headers,
        body: typeof body === "string" ? body : body instanceof URLSearchParams ? body.toString() : null,
      });
    }
    throw new Error("OFFLINE: Нет соединения с интернетом");
  }

  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const ct = response.headers.get("content-type");
  if (ct?.includes("application/json")) {
    return (await response.json()) as T;
  }
  return (await response.text()) as unknown as T;
}

export function invalidateApiCacheForUrl(url: string): void {
  invalidateCache(`api-get:${url}`);
}
