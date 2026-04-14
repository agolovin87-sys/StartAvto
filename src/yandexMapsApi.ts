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

/** Окрестности Туймаз / Туймазинского р-на — приоритет геопоиска адреса. */
const TUYMAZY_SEARCH_BOUNDS: [[number, number], [number, number]] = [
  [54.48, 53.52],
  [54.78, 53.92],
];

const TUYMAZY_REGION_LABEL = "Туймазы, Туймазинский район, Республика Башкортостан";

/** Строка запроса в геокодер с приоритетом Туймазы и района. */
export function buildTuymazyBiasedAddressQuery(userLine: string): string {
  const t = userLine.trim();
  if (!t) return "";
  return `${t}, ${TUYMAZY_REGION_LABEL}, Россия`;
}

/**
 * Геокодирование через JS API 2.1 (`ymaps.geocode`). Нужен тот же ключ, что и для карты.
 * Возвращает WGS84: широта, долгота.
 */
export async function geocodeAddressTuymazyRegion(
  userAddressLine: string
): Promise<{ lat: number; lng: number } | null> {
  const apiKey = getYandexMapsApiKey();
  if (!apiKey || !userAddressLine.trim()) return null;
  await ensureYandexMapsLoaded(apiKey);
  const ymaps = window.ymaps;
  if (!ymaps) return null;

  const query = buildTuymazyBiasedAddressQuery(userAddressLine);
  const geocodeFn = ymaps as unknown as {
    geocode: (
      address: string,
      opts?: Record<string, unknown>
    ) => Promise<{ geoObjects: { get: (index: number) => unknown } }>;
  };

  const res = await geocodeFn.geocode(query, {
    results: 1,
    boundedBy: TUYMAZY_SEARCH_BOUNDS,
    strictBounds: false,
  });

  const first = res.geoObjects.get(0) as
    | { geometry: { getCoordinates: () => number[] } }
    | undefined;
  if (!first) return null;

  const c = first.geometry.getCoordinates();
  if (!Array.isArray(c) || c.length < 2) return null;
  const lat = c[0];
  const lng = c[1];
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export type YandexSuggestItem = {
  title: string;
  subtitle: string;
  value: string;
};

function normalizeSuggestItems(list: Array<Record<string, unknown>>): YandexSuggestItem[] {
  return list
    .map((x) => {
      const value = typeof x.value === "string" ? x.value.trim() : "";
      const titleObj = x.title as Record<string, unknown> | undefined;
      const subtitleObj = x.subtitle as Record<string, unknown> | undefined;
      const title = typeof titleObj?.text === "string" ? titleObj.text.trim() : value;
      const subtitle = typeof subtitleObj?.text === "string" ? subtitleObj.text.trim() : "";
      return { value, title, subtitle };
    })
    .filter((x) => x.value.length > 0);
}

/** Подсказки адреса через геокодер (один стабильный канал). */
export async function suggestAddressTuymazyRegion(
  userAddressLine: string
): Promise<YandexSuggestItem[]> {
  const apiKey = getYandexMapsApiKey();
  const t = userAddressLine.trim();
  if (!apiKey || t.length < 2) return [];
  await ensureYandexMapsLoaded(apiKey);
  const ymaps = window.ymaps as unknown as {
    geocode?: (
      query: string,
      opts?: Record<string, unknown>
    ) => Promise<{ geoObjects: { get: (index: number) => unknown } }>;
  };
  if (!ymaps) return [];
  if (typeof ymaps.geocode !== "function") return [];
  const geo = await ymaps.geocode(buildTuymazyBiasedAddressQuery(t), {
    results: 5,
    boundedBy: TUYMAZY_SEARCH_BOUNDS,
    strictBounds: false,
  });
  const fallbackRaw: Array<Record<string, unknown>> = [];
  for (let i = 0; i < 5; i++) {
    const obj = geo.geoObjects.get(i) as
      | { getAddressLine?: () => string; properties?: { get?: (k: string) => unknown } }
      | undefined;
    if (!obj) break;
    const lineByMethod =
      typeof obj.getAddressLine === "function" ? String(obj.getAddressLine() ?? "").trim() : "";
    const lineByProp =
      typeof obj.properties?.get === "function"
        ? String(obj.properties.get("text") ?? "").trim()
        : "";
    const value = (lineByMethod || lineByProp).trim();
    if (!value) continue;
    fallbackRaw.push({
      value,
      title: { text: value },
      subtitle: { text: "результат геокодера" },
    });
  }
  return normalizeSuggestItems(fallbackRaw);
}

/**
 * Обратное геокодирование: строка адреса по координатам (WGS84).
 */
export async function reverseGeocodeCoordsYandex(lat: number, lng: number): Promise<string | null> {
  const apiKey = getYandexMapsApiKey();
  if (!apiKey || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  await ensureYandexMapsLoaded(apiKey);
  const ymaps = window.ymaps as unknown as {
    geocode: (
      query: string | [number, number],
      opts?: Record<string, unknown>
    ) => Promise<{ geoObjects: { get: (index: number) => unknown } }>;
  };

  const res = await ymaps.geocode([lat, lng], { results: 1 });
  const first = res.geoObjects.get(0) as
    | {
        getAddressLine?: () => string;
        properties?: { get: (k: string) => string };
      }
    | undefined;
  if (!first) return null;
  let line: string | undefined;
  if (typeof first.getAddressLine === "function") {
    line = first.getAddressLine();
  }
  if (!line?.trim() && first.properties) {
    line = first.properties.get("text");
  }
  const t = typeof line === "string" ? line.trim() : "";
  return t || null;
}
