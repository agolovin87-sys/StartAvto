/**
 * Иконка PWA: положите мастер в `public/app-icon-source.png`, затем
 * `powershell -File scripts/generate-pwa-icons.ps1` — соберётся 192 / v6 (512) / maskable.
 * При смене имени файла в публичной ссылке обновите APP_ICON_FILE и manifest + index.html.
 */
export const APP_ASSET_VERSION = "6";

/** Имя файла в public/ (без query — надёжнее для Android/iOS). */
export const APP_ICON_FILE = "app-icon-v6.png";

export function appIconUrl(): string {
  return `/${APP_ICON_FILE}`;
}

export function webManifestUrl(): string {
  return "/manifest.webmanifest";
}
