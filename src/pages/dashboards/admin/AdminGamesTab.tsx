import { useEffect, useRef, useState } from "react";
import { mountTetris } from "@/games/tetris";
import { mountDurak } from "@/games/durak";

type TetrisHandle = ReturnType<typeof mountTetris>;
type DurakHandle = ReturnType<typeof mountDurak>;
type GameKey = "tetris" | "durak";
const TETRIS_SNAPSHOT_KEY = "tetris_snapshot_v1";

export function AdminGamesTab() {
  const [activeGame, setActiveGame] = useState<GameKey | null>(() => {
    try {
      return localStorage.getItem(TETRIS_SNAPSHOT_KEY) ? "tetris" : null;
    } catch {
      return null;
    }
  });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<TetrisHandle | DurakHandle | null>(null);

  useEffect(() => {
    if (!activeGame || !containerRef.current || gameRef.current) return;
    if (activeGame === "tetris") {
      gameRef.current = mountTetris(containerRef.current, {
        autoStart: true,
        snapshotKey: TETRIS_SNAPSHOT_KEY,
      });
    } else {
      gameRef.current = mountDurak(containerRef.current);
    }
    return () => {
      gameRef.current?.destroy();
      gameRef.current = null;
    };
  }, [activeGame]);

  return (
    <section className="admin-tab admin-home-tab">
      {activeGame ? (
        <button
          type="button"
          onClick={() => {
            if (activeGame === "tetris") {
              gameRef.current?.destroy({ clearSnapshot: true });
            } else {
              gameRef.current?.destroy();
            }
            gameRef.current = null;
            setActiveGame(null);
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
      <h2 className="admin-title">
        {activeGame === "tetris" ? "Tetris" : activeGame === "durak" ? "Durak" : "Игры"}
      </h2>
      {!activeGame ? (
        <div style={{ display: "grid", gap: 10 }}>
          <button
            type="button"
            onClick={() => setActiveGame("tetris")}
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
          <button
            type="button"
            onClick={() => setActiveGame("durak")}
            style={{
              width: "100%",
              minHeight: 52,
              borderRadius: 12,
              border: "1px solid #334155",
              background: "#0f766e",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: 16,
              cursor: "pointer",
            }}
          >
            Durak
          </button>
        </div>
      ) : null}
      <div ref={containerRef} style={{ marginTop: activeGame ? 12 : 0 }} />
    </section>
  );
}
