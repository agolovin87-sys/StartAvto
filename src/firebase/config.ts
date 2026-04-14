import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  type Firestore,
} from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

function readEnv() {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };
}

export const isFirebaseConfigured = (() => {
  const e = readEnv();
  return Boolean(
    e.apiKey &&
      e.authDomain &&
      e.projectId &&
      e.storageBucket &&
      e.messagingSenderId &&
      e.appId
  );
})();

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;
let _storage: FirebaseStorage | null = null;

export function getFirebase(): {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
} {
  if (!isFirebaseConfigured) {
    throw new Error(
      "Firebase не настроен. Скопируйте .env.example в .env и заполните ключи."
    );
  }
  if (!_app) {
    const e = readEnv();
    const firebaseConfig = {
      apiKey: e.apiKey!,
      authDomain: e.authDomain!,
      projectId: e.projectId!,
      storageBucket: e.storageBucket!,
      messagingSenderId: e.messagingSenderId!,
      appId: e.appId!,
    };
    /**
     * После HMR модуль пересоздаётся, а Firebase App остаётся в глобальном реестре.
     * Повторный initializeApp / initializeFirestore с теми же опциями падает.
     */
    if (getApps().length === 0) {
      _app = initializeApp(firebaseConfig);
      _auth = getAuth(_app);
      /**
       * Память процесса: быстрее повторное чтение ленты чата без тяжёлого IndexedDB.
       * experimentalForceLongPolling: стабильнее WebChannel в части сред (ca9 на Watch);
       * цена — чуть больше запросов. Не смешивать с experimentalAutoDetectLongPolling.
       */
      _db = initializeFirestore(_app, {
        localCache: memoryLocalCache(),
        experimentalForceLongPolling: true,
        /** Иначе вложенные `undefined` (например в точках GPS) ломают setDoc. */
        ignoreUndefinedProperties: true,
      });
      _storage = getStorage(_app);
    } else {
      _app = getApp();
      _auth = getAuth(_app);
      _db = getFirestore(_app);
      _storage = getStorage(_app);
    }
  }
  return { app: _app, auth: _auth!, db: _db!, storage: _storage! };
}
