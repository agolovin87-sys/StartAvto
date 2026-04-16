/**
 * Клиентский кэш данных в localStorage с TTL (для офлайн-доступа к JSON и метаданным).
 * Крупные бинарные данные (тайлы карт) — см. mapCache.ts и Cache Storage API.
 */

const STORAGE_PREFIX = "startavto-ls-cache:";

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  url?: string;
}

function keyFor(id: string): string {
  return `${STORAGE_PREFIX}${id}`;
}

/** Сохранить значение с TTL в миллисекундах. */
export function cacheData<T>(key: string, data: T, ttl: number, url?: string): void {
  try {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl,
      url,
    };
    localStorage.setItem(keyFor(key), JSON.stringify(entry));
  } catch {
    /* квота / приватный режим */
  }
}

/** Прочитать значение; при истечении TTL — удалить и вернуть null. */
export function getCachedData<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(keyFor(key));
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (!entry || typeof entry.timestamp !== "number" || typeof entry.ttl !== "number") {
      localStorage.removeItem(keyFor(key));
      return null;
    }
    if (Date.now() - entry.timestamp > entry.ttl) {
      localStorage.removeItem(keyFor(key));
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

export function invalidateCache(key: string): void {
  try {
    localStorage.removeItem(keyFor(key));
  } catch {
    /* */
  }
}

/** Приблизительный размер записей с префиксом (в байтах UTF-16). */
export function getCacheSize(): number {
  let n = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(STORAGE_PREFIX)) {
        const v = localStorage.getItem(k);
        if (v) n += k.length + v.length;
      }
    }
  } catch {
    /* */
  }
  return n * 2;
}

/** Удалить просроченные записи с нашим префиксом. */
export function clearExpiredCache(): number {
  let removed = 0;
  const now = Date.now();
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(STORAGE_PREFIX)) keys.push(k);
    }
    for (const k of keys) {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      try {
        const entry = JSON.parse(raw) as CacheEntry<unknown>;
        if (
          entry &&
          typeof entry.timestamp === "number" &&
          typeof entry.ttl === "number" &&
          now - entry.timestamp > entry.ttl
        ) {
          localStorage.removeItem(k);
          removed++;
        }
      } catch {
        localStorage.removeItem(k);
        removed++;
      }
    }
  } catch {
    /* */
  }
  return removed;
}

const PREF_KEY = "startavto-offline-cache-pref";

/** Пользовательская настройка: кэшировать данные для офлайна (JSON и метаданные). */
export function getOfflineDataCachingEnabled(): boolean {
  try {
    const v = localStorage.getItem(PREF_KEY);
    if (v === null) return true;
    return v === "1";
  } catch {
    return true;
  }
}

export function setOfflineDataCachingEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(PREF_KEY, enabled ? "1" : "0");
  } catch {
    /* */
  }
}

const LAST_SYNC_KEY = "startavto-last-sync-ms";

export function getLastSyncTimeMs(): number | null {
  try {
    const v = localStorage.getItem(LAST_SYNC_KEY);
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function setLastSyncTimeMs(ms: number): void {
  try {
    localStorage.setItem(LAST_SYNC_KEY, String(ms));
  } catch {
    /* */
  }
}

/** Оценка размера кэшей Cache API с именами startavto-* (байты). */
export async function estimateStartavtoCachesBytes(): Promise<number> {
  if (typeof caches === "undefined") return 0;
  let total = 0;
  try {
    const names = await caches.keys();
    for (const name of names) {
      if (!name.toLowerCase().includes("startavto")) continue;
      const c = await caches.open(name);
      const keys = await c.keys();
      for (const req of keys) {
        const res = await c.match(req);
        if (!res) continue;
        const b = await res.clone().blob();
        total += b.size;
      }
    }
  } catch {
    /* */
  }
  return total;
}

/** Удаляет кэши startavto-* и записи localStorage с префиксом кэша. */
export async function clearAllStartavtoClientCaches(): Promise<void> {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(STORAGE_PREFIX)) toRemove.push(k);
    }
    for (const k of toRemove) localStorage.removeItem(k);
    localStorage.removeItem("startavto-fetch-mutation-queue");
    localStorage.removeItem(LAST_SYNC_KEY);
  } catch {
    /* */
  }
  if (typeof caches === "undefined") return;
  try {
    const names = await caches.keys();
    await Promise.all(
      names.filter((n) => n.toLowerCase().includes("startavto")).map((n) => caches.delete(n))
    );
  } catch {
    /* */
  }
}

export function formatBytesMb(bytes: number, fractionDigits = 2): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 МБ";
  return `${(bytes / (1024 * 1024)).toFixed(fractionDigits)} МБ`;
}
