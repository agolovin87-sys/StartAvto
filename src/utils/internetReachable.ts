/**
 * Проверка «есть ли выход в интернет».
 * navigator.onLine бывает true при только Wi‑Fi/LAN без интернета; offline-событие тогда не приходит.
 */
const PROBE_TIMEOUT_MS = 4_500;

/** Только URL, которые отдают 2xx/204 без тела — не корень firebase.googleapis.com (там 404 и шум в консоли). */
const PROBE_URLS = [
  "https://www.gstatic.com/generate_204",
  "https://connectivitycheck.gstatic.com/generate_204",
] as const;

export async function probeInternetReachable(): Promise<boolean> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;

  const ctrl = new AbortController();
  const id = window.setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);

  const opts: RequestInit = {
    method: "GET",
    mode: "no-cors",
    cache: "no-store",
    signal: ctrl.signal,
  };

  try {
    await Promise.any(PROBE_URLS.map((url) => fetch(url, opts)));
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(id);
  }
}
