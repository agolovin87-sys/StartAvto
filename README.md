# StartAvto — веб-приложение автошколы

Адаптивный интерфейс для **Safari**, **Chrome** и других мобильных браузеров на **iOS** и **Android** (открывается как сайт; при необходимости можно добавить PWA).

## Возможности

- **Роли:** администратор, инструктор, курсант.
- **Вход и регистрация** (email и пароль) через **Firebase Authentication**.
- **Профили и роли** хранятся в **Cloud Firestore** (коллекция `users`).
- Роль **администратора** для указанных email задаётся в `.env` (`VITE_ADMIN_EMAILS`).

## Быстрый старт

1. Установите зависимости:

```bash
npm install
```

2. В [Firebase Console](https://console.firebase.google.com/) создайте проект, включите **Authentication** → **Email/Password**, создайте базу **Firestore**.

3. Скопируйте `.env.example` в `.env` и вставьте ключи из **Project settings** → **Your apps** (веб-приложение).

4. В Firestore вставьте правила из файла `firestore.rules` (раздел **Firestore** → **Rules** → **Publish**).

5. Запуск локально:

```bash
npm run dev
```

6. Сборка для выкладки на хостинг:

```bash
npm run build
```

Содержимое папки `dist` загрузите на любой статический хостинг (Firebase Hosting, Netlify, VPS и т.д.).

**Деплой на Firebase, сохранение в GitHub и откат:** см. [docs/ДЕПЛОЙ_И_ОТКАТ.md](docs/ДЕПЛОЙ_И_ОТКАТ.md) (команды `npm run "спаси и сохрани"` и `npm run откат`).

## Администраторы

В `.env` укажите:

```env
VITE_ADMIN_EMAILS=you@mail.com,other@mail.com
```

После входа под этим email пользователь получит роль **admin** (при первом создании документа в Firestore роль подставится из логики приложения).

## Безопасность

Текущие правила Firestore подходят для разработки и демо. Для продакшена рекомендуется назначать роли через **Custom Claims** и **Cloud Functions**, чтобы клиент не мог сам выставить себе `role: admin`.
