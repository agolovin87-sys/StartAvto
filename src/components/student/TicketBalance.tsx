import { useMemo } from "react";
import type { StudentBalance } from "@/types/studentCabinet";

type TicketBalanceProps = {
  balance: StudentBalance;
  onReplenish: () => void;
};

/** Круговой индикатор: доля использованных талонов от общего числа. */
function TicketsRing({ usedFrac }: { usedFrac: number }) {
  const pct = Math.max(0, Math.min(1, usedFrac));
  const dash = `${pct * 100} ${100 - pct * 100}`;
  return (
    <svg className="student-cabinet-ring" viewBox="0 0 36 36" aria-hidden>
      <circle className="student-cabinet-ring-bg" cx="18" cy="18" r="15.915" fill="none" strokeWidth="3" />
      <circle
        className="student-cabinet-ring-fg"
        cx="18"
        cy="18"
        r="15.915"
        fill="none"
        strokeWidth="3"
        strokeDasharray={dash}
        transform="rotate(-90 18 18)"
      />
    </svg>
  );
}

/**
 * Карточка баланса талонов: остаток, кольцо прогресса, история операций, кнопка пополнения.
 */
export function TicketBalance({ balance, onReplenish }: TicketBalanceProps) {
  const usedFrac = useMemo(() => {
    if (balance.totalTickets <= 0) return 0;
    return balance.usedTickets / balance.totalTickets;
  }, [balance.totalTickets, balance.usedTickets]);

  const low = balance.remainingTickets <= 2;

  return (
    <section className="student-cabinet-card" aria-labelledby="student-cabinet-tickets-title">
      <h2 id="student-cabinet-tickets-title" className="student-cabinet-card__title">
        Баланс талонов
      </h2>
      <div className="student-cabinet-tickets-hero">
        <TicketsRing usedFrac={usedFrac} />
        <div className="student-cabinet-tickets-hero-text">
          <p className="student-cabinet-tickets-big">
            Осталось: <strong>{balance.remainingTickets}</strong> из {balance.totalTickets}
          </p>
          <p className="student-cabinet-tickets-sub">Использовано занятий: {balance.usedTickets}</p>
        </div>
      </div>
      {low ? (
        <p className="student-cabinet-alert" role="status">
          Осталось мало занятий — пополните баланс талонов.
        </p>
      ) : null}
      <button type="button" className="btn btn-primary student-cabinet-btn" onClick={onReplenish}>
        Пополнить баланс
      </button>
      <h3 className="student-cabinet-subtitle">История</h3>
      <div className="student-cabinet-table-wrap">
        <table className="admin-schedule-table student-cabinet-table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Тип</th>
              <th>Кол-во</th>
              <th>Описание</th>
            </tr>
          </thead>
          <tbody>
            {balance.ticketsHistory.length === 0 ? (
              <tr>
                <td colSpan={4} className="admin-schedule-table-empty">
                  Записей пока нет — после пополнения и занятий появятся автоматически.
                </td>
              </tr>
            ) : (
              balance.ticketsHistory.slice(0, 12).map((t) => (
                <tr key={t.id}>
                  <td>{new Date(t.date).toLocaleString("ru-RU")}</td>
                  <td>
                    {t.type === "purchase" ? "Пополнение" : t.type === "use" ? "Списание" : "Возврат"}
                  </td>
                  <td>{t.amount > 0 ? `+${t.amount}` : t.amount}</td>
                  <td>{t.description}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
