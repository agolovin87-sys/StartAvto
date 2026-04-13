import { useSearchParams } from "react-router-dom";
import { useBadging } from "@/hooks/useBadging";
import { getBadgingDiagnostics } from "@/utils/badging";

type BadgeDebugProps = {
  computedTotal: number;
};

export function BadgeDebug({ computedTotal }: BadgeDebugProps) {
  const [searchParams] = useSearchParams();
  const debugParam = searchParams.get("debug") === "true";
  const show = !import.meta.env.PROD || debugParam;
  const {
    badgeCount,
    incrementBadge,
    decrementBadge,
    resetBadge,
    supported,
  } = useBadging();
  const diag = getBadgingDiagnostics();

  if (!show) return null;

  return (
    <div
      className="badge-debug-panel"
      role="region"
      aria-label="Отладка App Badge"
    >
      <div className="badge-debug-title">Badge debug</div>
      <div className="badge-debug-row">
        <span>API:</span> {supported ? "да" : "нет"} · платформа: {diag.platform}
      </div>
      <div className="badge-debug-row">
        <span>Зеркало (последнее применённое):</span> {badgeCount}
      </div>
      <div className="badge-debug-row">
        <span>Расчёт уведомлений:</span> {computedTotal}
      </div>
      <div className="badge-debug-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void incrementBadge()}>
          +1
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void decrementBadge()}>
          −1
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void resetBadge()}>
          Сброс
        </button>
      </div>
    </div>
  );
}
