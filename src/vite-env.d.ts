/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  /** JavaScript API Яндекс.Карт (вкладка GPS у админа). https://developer.tech.yandex.ru/services/ */
  readonly VITE_YANDEX_MAPS_API_KEY?: string;
  /** Отдельный ключ Suggest API для адресных подсказок (`ymaps.suggest`). */
  readonly VITE_YANDEX_SUGGEST_API_KEY?: string;
  /** Через запятую: email администраторов (роль admin при входе) */
  readonly VITE_ADMIN_EMAILS?: string;
  /** Опционально: uid пользователя-админа в Firestore (если контакт не находится по role/email) */
  readonly VITE_PRIMARY_ADMIN_UID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  /** Событие установки PWA (Chrome, Edge, часть Android). */
  interface BeforeInstallPromptEvent extends Event {
    readonly platforms?: string[];
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
  }

  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }

  /** Глобал после загрузки https://api-maps.yandex.ru/2.1/ */
  interface Window {
    ymaps?: {
      ready: (callback: () => void) => void;
      Map: new (
        parentElement: HTMLElement,
        state: Record<string, unknown>,
        options?: Record<string, unknown>
      ) => YandexMapInstance;
      Placemark: new (
        geometry: [number, number],
        properties?: Record<string, unknown>,
        options?: Record<string, unknown>
      ) => unknown;
      Circle: new (
        geometry: [[number, number], number],
        properties?: Record<string, unknown>,
        options?: Record<string, unknown>
      ) => YandexCircleGeo;
      Polyline: new (
        geometry: [number, number][],
        properties?: Record<string, unknown>,
        options?: Record<string, unknown>
      ) => YandexPolylineGeo;
    };
  }

  interface YandexPolylineGeo {
    geometry: { getBounds: () => number[][] | null };
  }

  interface YandexMapInstance {
    destroy: () => void;
    geoObjects: { add: (object: unknown) => void };
    setBounds: (bounds: number[][], options?: Record<string, unknown>) => void;
  }

  interface YandexCircleGeo {
    geometry: { getBounds: () => number[][] };
  }

  /** Badging API (иконка PWA). */
  interface Navigator {
    setAppBadge?: (contents?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  }
}

export {};
