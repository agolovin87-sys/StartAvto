/** Разрешение использовать геолокацию для встреч на вождении (локально в браузере). */

export const MEETING_GEOLOCATION_SETTINGS_EVENT = "startavto:meeting-geolocation-settings";

function storageKey(uid: string): string {
  return `startavto_meeting_geo_${uid}`;
}

export type MeetingGeolocationSettings = {
  /** Использовать геолокацию для места встречи и связанных функций */
  enabled: boolean;
};

export const DEFAULT_MEETING_GEOLOCATION_SETTINGS: MeetingGeolocationSettings = {
  /** Без сохранённого значения — как раньше: функции геолокации доступны */
  enabled: true,
};

export function getMeetingGeolocationSettings(uid: string): MeetingGeolocationSettings {
  if (!uid) return { ...DEFAULT_MEETING_GEOLOCATION_SETTINGS };
  try {
    const raw = localStorage.getItem(storageKey(uid));
    if (!raw) return { ...DEFAULT_MEETING_GEOLOCATION_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<MeetingGeolocationSettings>;
    const merged = { ...DEFAULT_MEETING_GEOLOCATION_SETTINGS, ...parsed };
    merged.enabled =
      typeof merged.enabled === "boolean"
        ? merged.enabled
        : DEFAULT_MEETING_GEOLOCATION_SETTINGS.enabled;
    return merged;
  } catch {
    return { ...DEFAULT_MEETING_GEOLOCATION_SETTINGS };
  }
}

export function getMeetingGeolocationEnabled(uid: string): boolean {
  return getMeetingGeolocationSettings(uid).enabled;
}

export function setMeetingGeolocationSettings(
  uid: string,
  patch: Partial<MeetingGeolocationSettings>
): void {
  if (!uid) return;
  const next = { ...getMeetingGeolocationSettings(uid), ...patch };
  localStorage.setItem(storageKey(uid), JSON.stringify(next));
  window.dispatchEvent(new Event(MEETING_GEOLOCATION_SETTINGS_EVENT));
}

export function setMeetingGeolocationEnabled(uid: string, enabled: boolean): void {
  setMeetingGeolocationSettings(uid, { enabled });
}

export function subscribeMeetingGeolocationSettings(listener: () => void): () => void {
  const on = () => listener();
  window.addEventListener(MEETING_GEOLOCATION_SETTINGS_EVENT, on);
  window.addEventListener("storage", on);
  return () => {
    window.removeEventListener(MEETING_GEOLOCATION_SETTINGS_EVENT, on);
    window.removeEventListener("storage", on);
  };
}

export type BrowserGeolocationPermissionLabel =
  | "granted"
  | "denied"
  | "prompt"
  | "unsupported";

export function browserGeolocationPermissionRu(
  p: BrowserGeolocationPermissionLabel
): string {
  switch (p) {
    case "granted":
      return "разрешено";
    case "denied":
      return "запрещено";
    case "prompt":
      return "не задано";
    default:
      return "недоступно";
  }
}

export async function detectBrowserGeolocationPermission(): Promise<BrowserGeolocationPermissionLabel> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return "unsupported";
  try {
    if (navigator.permissions?.query) {
      const st = await navigator.permissions.query({
        name: "geolocation" as PermissionName,
      });
      if (st.state === "granted" || st.state === "denied" || st.state === "prompt") {
        return st.state;
      }
    }
  } catch {
    /* Safari и др. */
  }
  return "prompt";
}

export function meetingGeolocationRequiresSecureContext(): boolean {
  if (typeof window === "undefined") return true;
  return window.isSecureContext;
}
