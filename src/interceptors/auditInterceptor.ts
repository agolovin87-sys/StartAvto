/**
 * Перехват HTTP для аудита.
 *
 * В StartAvto данные изменяются через Firebase SDK (Firestore / Auth), а не через axios/fetch REST.
 * Поэтому axios interceptor здесь не подключается — вместо этого используйте явные вызовы
 * `logAction` / `logAuditAction` из `@/utils/audit` в местах бизнес-логики.
 *
 * Если позже появится REST-слой на axios, раскомментируйте и адаптируйте:
 *
 * ```ts
 * import type { AxiosInstance } from "axios";
 * export function attachAxiosAuditInterceptor(client: AxiosInstance): void {
 *   client.interceptors.response.use(
 *     (res) => { void logHttpSuccess(res); return res; },
 *     (err) => { void logHttpError(err); return Promise.reject(err); }
 *   );
 * }
 * ```
 */

/** Опционально: обёртка над fetch для отладки исходящих запросов (не Firebase). */
export function installFetchAuditInterceptor(): () => void {
  if (typeof globalThis.fetch !== "function") return () => {};

  const original = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    return original(input, init);
  };

  return () => {
    globalThis.fetch = original;
  };
}
