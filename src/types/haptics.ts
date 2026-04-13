export type HapticType = "light" | "medium" | "heavy" | "success" | "error" | "selection";

export interface HapticSettings {
  enabled: boolean;
  /** Только для iOS: короткие звуки вместо вибрации */
  soundEnabled: boolean;
}
