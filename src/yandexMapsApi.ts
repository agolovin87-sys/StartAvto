/** Загрузка JS API 2.1 Яндекс.Карт (один скрипт на вкладку). */
let ymapsReadyPromise: Promise<void> | null = null;

export function hasYandexMapsApiKey(): boolean {
  return Boolean(import.meta.env.VITE_YANDEX_MAPS_API_KEY?.trim());
}

export function getYandexMapsApiKey(): string {
  return (import.meta.env.VITE_YANDEX_MAPS_API_KEY ?? "").trim();
}

export function ensureYandexMapsLoaded(apiKey: string): Promise<void> {
  const key = apiKey.trim();
  if (!key) return Promise.reject(new Error("Пустой ключ Яндекс.Карт"));
  if (typeof window === "undefined") return Promise.resolve();

  if (window.ymaps) {
    return new Promise((resolve) => {
      window.ymaps!.ready(() => resolve());
    });
  }

  if (!ymapsReadyPromise) {
    ymapsReadyPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(key)}&lang=ru_RU`;
      script.async = true;
      script.onload = () => {
        if (!window.ymaps) {
          reject(new Error("ymaps не определён"));
          return;
        }
        window.ymaps.ready(() => resolve());
      };
      script.onerror = () => reject(new Error("Не удалось загрузить api-maps.yandex.ru"));
      document.head.appendChild(script);
    });
  }

  return ymapsReadyPromise;
}
