import {
  DEFAULT_NOTIFICATION_SETTINGS,
  getNotificationSettings,
  isInDoNotDisturbPeriod,
} from "@/admin/notificationSettings";

const src = `${import.meta.env.BASE_URL}sounds/smooth-quiet-fast-engine-start.mp3`;

let cached: HTMLAudioElement | null = null;

/**
 * Короткий звук запуска двигателя: после «Начать вождение» у инструктора
 * и после подтверждения начала у курсанта. Громкость из настроек уведомлений.
 */
export function playDriveEngineStartSound(uid?: string): void {
  if (typeof window === "undefined") return;
  const s = uid?.trim() ? getNotificationSettings(uid.trim()) : DEFAULT_NOTIFICATION_SETTINGS;
  if (isInDoNotDisturbPeriod(s)) return;
  const vol = Math.max(0, Math.min(1, s.chatSoundVolume * 0.9));
  if (vol <= 0) return;
  try {
    if (!cached) {
      cached = new Audio(src);
      cached.preload = "auto";
    }
    cached.volume = vol;
    cached.currentTime = 0;
    void cached.play().catch(() => {});
  } catch {
    /* autoplay / разрешения */
  }
}
