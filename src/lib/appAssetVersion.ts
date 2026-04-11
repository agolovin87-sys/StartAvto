/**
 * Иконка PWA: при смене картинки скопируйте файл в public с новым именем
 * (например app-icon-v7.png) и обновите APP_ICON_FILE здесь и в index.html + manifest.webmanifest.
 * Уникальное имя файла нужно, т.к. телефоны часто кэшируют /app-icon.png и игнорируют ?v= в манифесте.
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
