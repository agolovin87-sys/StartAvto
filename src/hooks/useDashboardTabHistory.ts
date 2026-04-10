import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const STATE_KEY = "stavtoDashTab";

function mergeLocationState(
  existing: unknown,
  patch: Record<string, unknown>
): Record<string, unknown> {
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return { ...(existing as Record<string, unknown>), ...patch };
  }
  return { ...patch };
}

/** Читает сохранённую вкладку из history.state (учёт вложенности, как у React Router). */
function readStoredTab(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const direct = r[STATE_KEY];
  if (typeof direct === "string") return direct;
  const usr = r.usr;
  if (usr && typeof usr === "object" && !Array.isArray(usr)) {
    const u = (usr as Record<string, unknown>)[STATE_KEY];
    if (typeof u === "string") return u;
  }
  return undefined;
}

/**
 * Синхронизирует активную вкладку кабинета с History API: на Android кнопка «Назад»
 * возвращает к предыдущей вкладке (последовательность переходов, как в браузере).
 *
 * Важно: в BrowserRouter `navigate` из useNavigate() меняет ссылку при каждом
 * изменении location. Если положить `navigate` в зависимости useEffect вместе с вызовом
 * navigate() внутри эффекта, получается цикл: navigate → новый location → новый navigate
 * → эффект снова → снова navigate → приложение ломается. Поэтому navigate держим в ref,
 * а эффект зависит только от `tab`.
 */
export function useDashboardTabHistory<T extends string>(
  tab: T,
  setTab: Dispatch<SetStateAction<T>>,
  validTabs: readonly T[]
): void {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const location = useLocation();
  const locationRef = useRef(location);
  locationRef.current = location;

  const skipPush = useRef(false);
  const initialSync = useRef(true);
  const validTabsRef = useRef(validTabs);
  validTabsRef.current = validTabs;

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const t = readStoredTab(e.state);
      const allowed = validTabsRef.current as readonly string[];
      if (typeof t === "string" && allowed.includes(t)) {
        skipPush.current = true;
        setTab(t as T);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [setTab]);

  useEffect(() => {
    if (skipPush.current) {
      skipPush.current = false;
      return;
    }
    const loc = locationRef.current;
    const next = mergeLocationState(loc.state, { [STATE_KEY]: tab });
    const to = {
      pathname: loc.pathname,
      search: loc.search,
      hash: loc.hash,
      state: next,
    };
    if (initialSync.current) {
      initialSync.current = false;
      void navigateRef.current(to, {
        replace: true,
        preventScrollReset: true,
      });
      return;
    }
    void navigateRef.current(to, {
      preventScrollReset: true,
    });
  }, [tab]);
}
