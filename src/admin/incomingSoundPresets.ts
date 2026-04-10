/** Встроенные звуки входящего сообщения (файлы в `public/sounds/incoming/`). */

export const INCOMING_SOUND_PRESET_PREFIX = "/sounds/incoming/" as const;

export type IncomingSoundPreset = {
  id: string;
  /** Подпись в настройках */
  label: string;
  /** Имя файла в `public/sounds/incoming/` */
  file: string;
};

export const INCOMING_SOUND_PRESETS: IncomingSoundPreset[] = [
  {
    id: "tamagotchi",
    label: "Тамагочи (лёгкий писк)",
    file: "light-squeak-of-an-old-tamagotchi.mp3",
  },
  {
    id: "error",
    label: "Уведомление об ошибке",
    file: "error-notification.mp3",
  },
  {
    id: "melodic",
    label: "Мелодичный сигнал",
    file: "nice-melodic-sound.mp3",
  },
  {
    id: "odnoklassniki",
    label: "Сообщения (стиль «Одноклассники»)",
    file: "sound-messages-odnoklassniki.mp3",
  },
  {
    id: "pyk-toon",
    label: "Короткий тон",
    file: "pyk-toon-n-n.mp3",
  },
  {
    id: "iphone-sms",
    label: "SMS (стиль iPhone)",
    file: "sms_uvedomlenie_na_iphone.mp3",
  },
];

const ALLOWED_ASSET_PATHS = new Set(
  INCOMING_SOUND_PRESETS.map((p) => `${INCOMING_SOUND_PRESET_PREFIX}${p.file}`)
);

export function incomingSoundPresetAssetPath(p: IncomingSoundPreset): string {
  return `${INCOMING_SOUND_PRESET_PREFIX}${p.file}`;
}

export function isAllowedIncomingSoundAssetPath(path: string): boolean {
  return ALLOWED_ASSET_PATHS.has(path);
}

export function incomingSoundPresetByAssetPath(
  path: string
): IncomingSoundPreset | undefined {
  return INCOMING_SOUND_PRESETS.find((p) => incomingSoundPresetAssetPath(p) === path);
}
