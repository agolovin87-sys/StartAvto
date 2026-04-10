import type { FirebaseError } from "firebase/app";

export function mapFirebaseError(err: unknown): string {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as FirebaseError).code)
      : "";
  if (code.endsWith("/permission-denied") || code === "permission-denied") {
    return "Нет прав на операцию в Firestore. Опубликуйте актуальные правила: firebase deploy --only firestore:rules. Для инструктора в документе users/{uid} должно быть role=instructor, курсант — в поле attachedStudentIds; для админа — role=admin или email в adminEmailsList().";
  }
  if (code.endsWith("/resource-exhausted") || code === "resource-exhausted") {
    return "Превышена дневная квота Firestore (чтения/записи). Откройте Firebase Console → Usage, подождите сброса лимита или подключите тариф Blaze.";
  }
  if (code.endsWith("/unavailable") || code === "unavailable") {
    return "Нет связи с сервером базы данных. Проверьте интернет и попробуйте снова.";
  }
  switch (code) {
    case "auth/email-already-in-use":
      return "Этот email уже зарегистрирован.";
    case "auth/invalid-email":
      return "Некорректный email.";
    case "auth/weak-password":
      return "Пароль слишком простой.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Неверный email или пароль.";
    case "auth/too-many-requests":
      return "Слишком много попыток. Попробуйте позже.";
    case "auth/network-request-failed":
      return "Нет сети. Проверьте подключение.";
    case "not-found":
      return "Документ не найден в базе.";
    default:
      if (err instanceof Error) {
        const m = err.message;
        if (/client is offline/i.test(m) || /Failed to get document.*offline/i.test(m)) {
          return "Нет связи с сервером базы данных. Проверьте интернет и попробуйте снова.";
        }
        return m;
      }
      return "Произошла ошибка. Попробуйте снова.";
  }
}
