import { AppBrandIcon } from "@/components/AppBrandIcon";

export function SetupFirebase() {
  return (
    <div className="auth-page">
      <div className="auth-card auth-card-wide">
        <div className="auth-app-icon-wrap">
          <AppBrandIcon size={72} alt="" />
        </div>
        <h1 className="auth-title">Настройка Firebase</h1>
        <p className="auth-lead">
          Создайте проект в{" "}
          <a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer">
            Firebase Console
          </a>
          , включите Authentication (Email/Password) и создайте базу Firestore.
        </p>
        <ol className="setup-list">
          <li>Скопируйте файл <code>.env.example</code> в <code>.env</code> в корне проекта.</li>
          <li>Вставьте значения из настроек проекта Firebase (Project settings → Your apps).</li>
          <li>
            Загрузите правила из <code>firestore.rules</code> в раздел Firestore → Rules.
          </li>
          <li>Перезапустите <code>npm run dev</code>.</li>
        </ol>
      </div>
    </div>
  );
}
