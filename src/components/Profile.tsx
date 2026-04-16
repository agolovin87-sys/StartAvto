import { useCallback, useEffect, useState } from "react";
import { useHaptics } from "@/hooks/useHaptics";
import { precacheMapArea } from "@/utils/mapCache";
import {
  clearAllStartavtoClientCaches,
  estimateStartavtoCachesBytes,
  formatBytesMb,
  getCacheSize,
  getLastSyncTimeMs,
  getOfflineDataCachingEnabled,
  setLastSyncTimeMs,
  setOfflineDataCachingEnabled,
} from "@/utils/offlineCache";
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

/** Окрестности Туймазы — для предзагрузки тайлов (см. геопоиск в приложении). */
const TUYMAZY_OFFLINE_BOUNDS: [[number, number], [number, number]] = [
  [54.48, 53.52],
  [54.78, 53.92],
];

/**
 * Кэш приложения, офлайн-предпочтения и предзагрузка карты района.
 * Подключается в «Настройки» для всех ролей.
 */
export function OfflineModeSettings() {
  const [cachingEnabled, setCachingEnabled] = useState(getOfflineDataCachingEnabled);
  const [jsonBytes, setJsonBytes] = useState(() => getCacheSize());
  const [swBytes, setSwBytes] = useState<number | null>(null);
  const [precacheBusy, setPrecacheBusy] = useState(false);
  const [precacheProgress, setPrecacheProgress] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<number | null>(() => getLastSyncTimeMs());

  const refreshSizes = useCallback(async () => {
    setJsonBytes(getCacheSize());
    const w = await estimateStartavtoCachesBytes();
    setSwBytes(w);
  }, []);

  useEffect(() => {
    void refreshSizes();
  }, [refreshSizes]);

  const totalMb =
    swBytes != null ? formatBytesMb(jsonBytes + swBytes) : formatBytesMb(jsonBytes);

  const toggleCaching = () => {
    const next = !cachingEnabled;
    setOfflineDataCachingEnabled(next);
    setCachingEnabled(next);
  };

  const onClear = async () => {
    if (!window.confirm("Очистить локальный кэш приложения на этом устройстве?")) return;
    await clearAllStartavtoClientCaches();
    setLastSync(getLastSyncTimeMs());
    await refreshSizes();
  };

  const onPrecacheMap = async () => {
    setPrecacheBusy(true);
    setPrecacheProgress("Загрузка тайлов…");
    try {
      const { fetched, skipped } = await precacheMapArea(TUYMAZY_OFFLINE_BOUNDS, 14, (done, total) => {
        setPrecacheProgress(`Тайлы: ${done} / ${total}`);
      });
      setPrecacheProgress(`Готово: сохранено ${fetched}, пропущено ${skipped} (сеть/CORS).`);
      const now = Date.now();
      setLastSyncTimeMs(now);
      setLastSync(now);
      await refreshSizes();
    } catch (e) {
      setPrecacheProgress(e instanceof Error ? e.message : "Ошибка предзагрузки");
    } finally {
      setPrecacheBusy(false);
    }
  };

  const lastSyncLabel =
    lastSync != null
      ? new Date(lastSync).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "medium" })
      : "ещё не было";

  return (
    <div className="admin-settings-policy-block" aria-label="Офлайн-режим">
      <p className="admin-settings-section-desc">
        Кэш страницы и данных на устройстве: работа в метро, на трассе и в зонах без связи. Firestore
        синхронизируется при появлении сети.
      </p>
      <div className="admin-settings-toggle-row">
        <div className="admin-settings-toggle-label" id="offline-cache-label">
          Кэшировать данные для офлайн-режима
          <span className="admin-settings-toggle-hint">
            JSON-ответы REST и локальный слой; отключите, если нужна только сеть.
          </span>
        </div>
        <label className="switch-stay">
          <input
            type="checkbox"
            role="switch"
            checked={cachingEnabled}
            onChange={toggleCaching}
            aria-labelledby="offline-cache-label"
            aria-checked={cachingEnabled}
          />
          <span className="switch-stay-slider" aria-hidden />
        </label>
      </div>
      <p className="offline-settings-size">
        Размер кэша (приблизительно): <strong>{totalMb}</strong>
        {swBytes != null ? (
          <>
            {" "}
            (данные JSON: {formatBytesMb(jsonBytes)}, SW/тайлы: {formatBytesMb(swBytes)})
          </>
        ) : null}
      </p>
      <p className="offline-settings-size">Последняя синхронизация / обновление кэша: {lastSyncLabel}</p>
      <div className="offline-settings-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void onClear()}>
          Очистить кэш
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={precacheBusy}
          onClick={() => void onPrecacheMap()}
        >
          {precacheBusy ? "Загрузка…" : "Предзагрузить карту района"}
        </button>
      </div>
      {precacheProgress ? <p className="offline-settings-progress">{precacheProgress}</p> : null}
    </div>
  );
}
