import { useEffect, useRef, useState } from "react";
import { mountTetris } from "@/games/tetris";

type TetrisHandle = ReturnType<typeof mountTetris>;

export function AdminGamesTab() {
  const [isStarted, setIsStarted] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<TetrisHandle | null>(null);

  useEffect(() => {
    if (!isStarted || !containerRef.current || gameRef.current) return;
    gameRef.current = mountTetris(containerRef.current, { autoStart: true });
    return () => {
      gameRef.current?.destroy();
      gameRef.current = null;
    };
  }, [isStarted]);

  return (
    <section className="admin-tab admin-home-tab">
      {isStarted ? (
        <button
          type="button"
          onClick={() => {
            gameRef.current?.destroy();
            gameRef.current = null;
            setIsStarted(false);
          }}
          style={{
            marginBottom: 8,
            minHeight: 38,
            padding: "0 12px",
            borderRadius: 10,
            border: "1px solid #334155",
            background: "#1e293b",
            color: "#e2e8f0",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          ← Назад к играм
        </button>
      ) : null}
      <h2 className="admin-title">{isStarted ? "Tetris" : "Игры"}</h2>
      {!isStarted ? (
        <button
          type="button"
          onClick={() => setIsStarted(true)}
          style={{
            width: "100%",
            minHeight: 52,
            borderRadius: 12,
            border: "1px solid #334155",
            background: "#1d4ed8",
            color: "#ffffff",
            fontWeight: 700,
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          Tetris
        </button>
      ) : null}
      <div ref={containerRef} style={{ marginTop: isStarted ? 12 : 0 }} />
    </section>
  );
}
