import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAppUpdate } from "@/hooks/useAppUpdate";

interface PullToRefreshProps {
  children: ReactNode;
  onRefreshData?: () => Promise<void>;
  pullDistance?: number;
  backgroundColor?: string;
  spinnerColor?: string;
}

export function PullToRefresh({
  children,
  onRefreshData,
  pullDistance = 80,
  backgroundColor = "transparent",
  spinnerColor = "#3d5afe",
}: PullToRefreshProps) {
  const {
    checkForUpdates,
    forceUpdate,
    isUpdating,
    updateAvailable,
    showManualHint,
    dismissManualHint,
  } = useAppUpdate();

  const [startY, setStartY] = useState(0);
  const [pullProgress, setPullProgress] = useState(0);
  const [isRefreshingLocal, setIsRefreshingLocal] = useState(false);
  const [hintVisible, setHintVisible] = useState(showManualHint);

  const containerRef = useRef<HTMLDivElement>(null);
  const isTouching = useRef(false);
  const isAtTop = useRef(true);
  const refreshTriggered = useRef(false);

  useEffect(() => {
    setHintVisible(showManualHint);
  }, [showManualHint]);

  const handleRefresh = async () => {
    if (isRefreshingLocal || isUpdating) return;
    setIsRefreshingLocal(true);
    setPullProgress(1);
    try {
      if (hintVisible) {
        setHintVisible(false);
        dismissManualHint();
      }

      // 1) Сначала пытаемся обновить именно версию приложения.
      const hasAppUpdate = await checkForUpdates(false);
      if (hasAppUpdate) {
        await forceUpdate();
        return;
      }

      // 2) Если версии нет — обновляем данные экрана.
      if (onRefreshData) await onRefreshData();
    } catch (error) {
      console.error("Ошибка обновления:", error);
    } finally {
      refreshTriggered.current = false;
      setIsRefreshingLocal(false);
      setPullProgress(0);
    }
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    isAtTop.current = containerRef.current.scrollTop <= 0;
    if (isAtTop.current && !isUpdating && !isRefreshingLocal) {
      refreshTriggered.current = false;
      setStartY(e.touches[0]?.clientY ?? 0);
      isTouching.current = true;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isTouching.current || !isAtTop.current) return;
    const currentY = e.touches[0]?.clientY ?? 0;
    const diff = currentY - startY;
    if (diff <= 0 || isUpdating || isRefreshingLocal) return;

    e.preventDefault();
    const progress = Math.min(diff / pullDistance, 1);
    setPullProgress(progress);

    if (diff >= pullDistance && !refreshTriggered.current) {
      refreshTriggered.current = true;
      void handleRefresh();
    }
  };

  const handleTouchEnd = () => {
    isTouching.current = false;
    if (!isUpdating && !isRefreshingLocal) setPullProgress(0);
  };

  return (
    <div
      ref={containerRef}
      className="pull-refresh-root"
      style={{ backgroundColor }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <div
        className="pull-refresh-indicator"
        style={{ height: `${pullProgress * pullDistance}px` }}
      >
        <div
          className="pull-refresh-spinner"
          style={{
            borderColor: spinnerColor,
            transform: `rotate(${pullProgress * 360}deg)`,
            opacity: pullProgress > 0 ? 1 : 0,
            animation:
              (isUpdating || isRefreshingLocal) && pullProgress === 1
                ? "pull-refresh-spin 0.8s linear infinite"
                : "none",
          }}
        />

        {hintVisible && pullProgress === 0 ? (
          <div className="pull-refresh-hint">Потяните вниз, чтобы обновить</div>
        ) : null}

        {updateAvailable && pullProgress === 0 && !isRefreshingLocal ? (
          <div className="pull-refresh-update-tip">Есть обновление! Потяните вниз</div>
        ) : null}
      </div>

      {children}
    </div>
  );
}

