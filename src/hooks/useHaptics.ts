import { useCallback, useEffect, useState } from "react";
import type { HapticSettings } from "@/types/haptics";
import {
  activateHaptics,
  HAPTIC_SETTINGS_EVENT,
  loadHapticSettings,
  saveHapticSettings,
  error as pulseError,
  heavy as pulseHeavy,
  light as pulseLight,
  medium as pulseMedium,
  selection as pulseSelection,
  success as pulseSuccess,
} from "@/utils/haptics";

export function useHaptics() {
  const [settings, setSettings] = useState<HapticSettings>(() => loadHapticSettings());

  useEffect(() => {
    const sync = () => setSettings(loadHapticSettings());
    window.addEventListener(HAPTIC_SETTINGS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(HAPTIC_SETTINGS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const light = useCallback(() => {
    pulseLight({
      masterEnabled: settings.enabled,
      soundEnabled: settings.soundEnabled,
    });
  }, [settings.enabled, settings.soundEnabled]);

  const medium = useCallback(() => {
    pulseMedium({
      masterEnabled: settings.enabled,
      soundEnabled: settings.soundEnabled,
    });
  }, [settings.enabled, settings.soundEnabled]);

  const heavy = useCallback(() => {
    pulseHeavy({
      masterEnabled: settings.enabled,
      soundEnabled: settings.soundEnabled,
    });
  }, [settings.enabled, settings.soundEnabled]);

  const success = useCallback(() => {
    pulseSuccess({
      masterEnabled: settings.enabled,
      soundEnabled: settings.soundEnabled,
    });
  }, [settings.enabled, settings.soundEnabled]);

  const error = useCallback(() => {
    pulseError({
      masterEnabled: settings.enabled,
      soundEnabled: settings.soundEnabled,
    });
  }, [settings.enabled, settings.soundEnabled]);

  const selection = useCallback(() => {
    pulseSelection({
      masterEnabled: settings.enabled,
      soundEnabled: settings.soundEnabled,
    });
  }, [settings.enabled, settings.soundEnabled]);

  const toggleEnabled = useCallback(() => {
    const next: HapticSettings = { ...settings, enabled: !settings.enabled };
    saveHapticSettings(next);
    setSettings(next);
  }, [settings]);

  const toggleSoundEnabled = useCallback(() => {
    const next: HapticSettings = { ...settings, soundEnabled: !settings.soundEnabled };
    saveHapticSettings(next);
    setSettings(next);
  }, [settings]);

  return {
    light,
    medium,
    heavy,
    success,
    error,
    selection,
    isEnabled: settings.enabled,
    toggleEnabled,
    isSoundEnabled: settings.soundEnabled,
    toggleSoundEnabled,
    /** Для iOS: вызвать из обработчика жеста перед первым звуком (опционально). */
    prepareAudio: activateHaptics,
  };
}
