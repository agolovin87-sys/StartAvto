export const THEME_STORAGE_KEY = "startavto_ui_theme";
export const THEME_EVENT = "startavto:theme";

export type ThemeMode = "dark" | "light" | "purple";

export function getTheme(): ThemeMode {
  if (typeof localStorage === "undefined") return "dark";
  const v = localStorage.getItem(THEME_STORAGE_KEY);
  if (v === "light" || v === "purple") return v;
  return "dark";
}

export function setTheme(mode: ThemeMode): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(THEME_STORAGE_KEY, mode);
  applyThemeToDocument(mode);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(THEME_EVENT));
  }
}

export function applyThemeToDocument(mode: ThemeMode): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = mode;
}

/** Вызвать до первого рендера (main.tsx), чтобы не было мигания. */
export function initThemeOnLoad(): void {
  applyThemeToDocument(getTheme());
}

export function subscribeTheme(listener: () => void): () => void {
  const on = () => listener();
  window.addEventListener(THEME_EVENT, on);
  return () => window.removeEventListener(THEME_EVENT, on);
}
