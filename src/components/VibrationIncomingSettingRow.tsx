import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  getNotificationSettings,
  isVibrationApiSupported,
  setNotificationSettings,
  subscribeNotificationSettings,
} from "@/admin/notificationSettings";

/**
 * Переключатель «Вибрация при входящем» (локально в браузере, см. notificationSettings).
 */
export function VibrationIncomingSettingRow() {
  const { user } = useAuth();
  const uid = user?.uid ?? "";
  const [checked, setChecked] = useState(
    DEFAULT_NOTIFICATION_SETTINGS.vibrationIncomingEnabled
  );

  useEffect(() => {
    if (!uid) return;
    setChecked(getNotificationSettings(uid).vibrationIncomingEnabled);
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    return subscribeNotificationSettings(() => {
      setChecked(getNotificationSettings(uid).vibrationIncomingEnabled);
    });
  }, [uid]);

  const toggle = () => {
    if (!uid) return;
    const cur = getNotificationSettings(uid);
    const next = !cur.vibrationIncomingEnabled;
    setNotificationSettings(uid, { vibrationIncomingEnabled: next });
    setChecked(next);
  };

  return (
    <div className="admin-settings-toggle-row">
      <div className="admin-settings-toggle-label" id="notify-vib-incoming-label">
        Вибрация при входящем
        <span className="admin-settings-toggle-hint">
          Короткий сигнал при новом сообщении, если поддерживает браузер (часто Android и PWA).
          {!isVibrationApiSupported() ? (
            <> В этом браузере Vibration API недоступен — на iPhone/Safari вибрация из веба обычно не работает.</>
          ) : null}
        </span>
      </div>
      <label className="switch-stay">
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={toggle}
          disabled={!uid}
          aria-labelledby="notify-vib-incoming-label"
          aria-checked={checked}
        />
        <span className="switch-stay-slider" aria-hidden />
      </label>
    </div>
  );
}
