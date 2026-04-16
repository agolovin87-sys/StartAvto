import "@/styles/offline.css";

type Props = {
  /** Если true — полноэкранная заглушка (например при ошибке навигации). */
  fullScreen?: boolean;
};

/**
 * Экран «нет сети» для показа внутри приложения (не путать с public/offline.html у SW).
 */
export function OfflinePage({ fullScreen = true }: Props) {
  const wrapClass = fullScreen ? "offline-page offline-page--fullscreen" : "offline-page";

  const goOfflineMode = () => {
    // SPA уже из кэша; перезагрузка поднимает последний precache index + данные Firestore.
    window.location.href = "/app";
  };

  return (
    <div className={wrapClass} role="alert">
      <div className="offline-page-card">
        <div className="offline-page-icon" aria-hidden>
          <svg viewBox="0 0 24 24" width="56" height="56" fill="currentColor">
            <path d="M23.64 7c-.45-.34-4.93-4-11.64-4-1.5 0-2.89.19-4.15.48L18.18 13.8 23.64 7zm-6.6 8.22L3.27 1.44 2 2.72l2.05 2.06C1.91 5.76.59 6.82.36 7l11.63 14.49L12 22l.01-.01-.02-.02L19.35 13.2l2.54 2.54 1.27-1.27L17.03 12.4z" />
          </svg>
        </div>
        <h1 className="offline-page-title">Нет соединения</h1>
        <p className="offline-page-text">Проверьте подключение к интернету и попробуйте снова.</p>
        <div className="offline-page-actions">
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            Повторить
          </button>
          <button type="button" className="btn btn-secondary" onClick={goOfflineMode}>
            Перейти в офлайн-режим
          </button>
        </div>
      </div>
    </div>
  );
}
