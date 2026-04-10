/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  /** Через запятую: email администраторов (роль admin при входе) */
  readonly VITE_ADMIN_EMAILS?: string;
  /** Опционально: uid пользователя-админа в Firestore (если контакт не находится по role/email) */
  readonly VITE_PRIMARY_ADMIN_UID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
