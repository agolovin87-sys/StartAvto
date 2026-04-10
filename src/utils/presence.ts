import type { UserProfile } from "@/types";

/**
 * Если heartbeat старше — считаем пользователя не в сети.
 * Интервал heartbeat в приложении ~45 с; фоновые вкладки и сеть могут задерживать запись —
 * 3 мин дают запас, чтобы не мигал «не в сети» между тиками.
 */
export const PRESENCE_HEARTBEAT_STALE_MS = 180_000;

export function isPresenceEffectivelyOnline(
  presence: UserProfile["presence"] | undefined,
  options?: { ignoreHeartbeatStale?: boolean }
): boolean {
  if (!presence || presence.state !== "online") return false;
  if (options?.ignoreHeartbeatStale) return true;
  const hb = presence.heartbeatAt;
  if (typeof hb !== "number") return false;
  return Date.now() - hb < PRESENCE_HEARTBEAT_STALE_MS;
}
