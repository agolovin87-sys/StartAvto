/** Префикс черновиков чата в localStorage (совпадает с AdminChatTab). */
const CHAT_DRAFTS_PREFIX = "startavto.chatDrafts.";

export type ClearAppClientCacheResult = {
  removedDraftKeys: number;
  clearedSessionStorage: boolean;
  clearedCacheStorage: number;
};

/**
 * Локальная очистка «кэша» без выхода из аккаунта: черновики чата, sessionStorage, Cache Storage.
 * Настройки (тема, уведомления, приватность чата) и сессия Firebase Auth не трогаются.
 */
export async function clearAppClientCache(): Promise<ClearAppClientCacheResult> {
  let removedDraftKeys = 0;
  if (typeof localStorage !== "undefined") {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CHAT_DRAFTS_PREFIX)) toRemove.push(k);
    }
    for (const k of toRemove) {
      localStorage.removeItem(k);
      removedDraftKeys += 1;
    }
  }

  let clearedSessionStorage = false;
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.clear();
    clearedSessionStorage = true;
  }

  let clearedCacheStorage = 0;
  if (typeof caches !== "undefined" && typeof caches.keys === "function") {
    const keys = await caches.keys();
    for (const key of keys) {
      if (await caches.delete(key)) clearedCacheStorage += 1;
    }
  }

  return { removedDraftKeys, clearedSessionStorage, clearedCacheStorage };
}
