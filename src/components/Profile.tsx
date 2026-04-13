import { useHaptics } from "@/hooks/useHaptics";
import { isIOS } from "@/utils/haptics";

/**
 * Блок настроек тактильной отдачи (вибрация Android / звуки iOS).
 * Подключается в «Настройки» для всех ролей.
 */
export function HapticFeedbackSettings() {
  const {
    isEnabled,
    toggleEnabled,
    isSoundEnabled,
    toggleSoundEnabled,
  } = useHaptics();

  const ios = isIOS();

  return (
    <div className="admin-settings-policy-block" aria-label="Тактильная отдача">
      <p className="admin-settings-section-desc">
        Лёгкая вибрация при кнопках и переключении вкладок на Android. В Safari на iPhone вибрация из веба
        недоступна — можно включить короткие звуковые имитации вместо неё.
      </p>
      <div className="admin-settings-toggle-row">
        <div className="admin-settings-toggle-label" id="haptic-enabled-label">
          Включить тактильную отдачу
          <span className="admin-settings-toggle-hint">
            Выкл — без вибрации и без звуковых имитаций на iOS.
          </span>
        </div>
        <label className="switch-stay">
          <input
            type="checkbox"
            role="switch"
            checked={isEnabled}
            onChange={toggleEnabled}
            aria-labelledby="haptic-enabled-label"
            aria-checked={isEnabled}
          />
          <span className="switch-stay-slider" aria-hidden />
        </label>
      </div>
      {ios ? (
        <div className="admin-settings-toggle-row">
          <div className="admin-settings-toggle-label" id="haptic-ios-sound-label">
            Звуковые эффекты (iOS)
            <span className="admin-settings-toggle-hint">
              Короткие сигналы вместо вибрации; громкость зависит от системы.
            </span>
          </div>
          <label className="switch-stay">
            <input
              type="checkbox"
              role="switch"
              checked={isSoundEnabled}
              onChange={toggleSoundEnabled}
              aria-labelledby="haptic-ios-sound-label"
              aria-checked={isSoundEnabled}
            />
            <span className="switch-stay-slider" aria-hidden />
          </label>
        </div>
      ) : null}
    </div>
  );
}
