import type { BadgingState } from "@/types/badging";

const LS_BADGE_ENABLED = "startavto_app_badge_enabled";
const SS_LAST_BADGE = "startavto_badge_last_count";

export const BADGE_PREF_CHANGED_EVENT = "startavto-badge-pref-changed";

export function notifyBadgePreferenceChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(BADGE_PREF_CHANGED_EVENT));
}

function readUa(): string {
  return typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
}

export function detectBadgePlatform(): BadgingState["platform"] {
  const ua = readUa();
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Mac OS X|Macintosh/i.test(ua)) return "mac";
  if (/Windows/i.test(ua)) return "windows";
  return "unknown";
}

export function isSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  if (typeof window !== "undefined" && window.isSecureContext !== true) return false;
  return (
    typeof navigator.setAppBadge === "function" &&
    typeof navigator.clearAppBadge === "function"
  );
}

export function isBadgePreferenceEnabled(): boolean {
  try {
    const v = localStorage.getItem(LS_BADGE_ENABLED);
    if (v === "0") return false;
    return true;
  } catch {
    return true;
  }
}

export function setBadgePreferenceEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(LS_BADGE_ENABLED, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
  if (!enabled) {
    void clearAppBadgeSafe();
  }
}

let lastMirror = 0;

const mirrorListeners = new Set<() => void>();

export function subscribeAppBadgeMirror(listener: () => void): () => void {
  mirrorListeners.add(listener);
  return () => {
    mirrorListeners.delete(listener);
  };
}

function notifyAppBadgeMirror(): void {
  mirrorListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

function mirrorCount(n: number): void {
  lastMirror = Math.max(0, Math.floor(n));
  try {
    sessionStorage.setItem(SS_LAST_BADGE, String(lastMirror));
  } catch {
    /* ignore */
  }
  notifyAppBadgeMirror();
}

/** Текущее применённое значение (зеркало; браузер не всегда отдаёт обратно). */
export function getCurrentBadge(): number {
  try {
    const s = sessionStorage.getItem(SS_LAST_BADGE);
    if (s != null) {
      const n = parseInt(s, 10);
      if (!Number.isNaN(n)) return n;
    }
  } catch {
    /* ignore */
  }
  return lastMirror;
}

async function clearAppBadgeSafe(): Promise<void> {
  mirrorCount(0);
  try {
    await navigator.clearAppBadge?.();
  } catch {
    /* ignore */
  }
}

/**
 * Установить число на иконке приложения (PWA). 0 — снять бейдж.
 * Без поддержки API или при выключенной настройке — тихий no-op / очистка.
 */
export async function setBadge(count: number): Promise<void> {
  if (!isSupported()) return;
  if (!isBadgePreferenceEnabled()) {
    await clearAppBadgeSafe();
    return;
  }

  const n = Math.max(0, Math.floor(count));
  mirrorCount(n);

  try {
    if (n === 0) {
      await navigator.clearAppBadge?.();
    } else {
      await navigator.setAppBadge?.(n);
    }
  } catch {
    /* iOS / ограничения — без сообщений пользователю */
  }
}

export async function clearBadge(): Promise<void> {
  await setBadge(0);
}

export function getBadgingDiagnostics(): BadgingState {
  return {
    supported: isSupported(),
    currentCount: getCurrentBadge(),
    platform: detectBadgePlatform(),
  };
}
