import { useCallback, useEffect, useState } from "react";
import { fetchPddTicket, resolvePddImageUrl } from "@/lib/pddTickets";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  clearAllTicketStats,
  getTicketResults,
  isTicketAllCorrect,
  loadAllTicketStats,
  writeQuestionResult,
  type PddQuestionResult,
} from "@/lib/pddTicketStats";
import type { PddQuestion, PddTicketCategory } from "@/types/pdd";

const TICKET_NUMBERS = Array.from({ length: 40 }, (_, i) => i + 1);
const GRID_INDICES = Array.from({ length: 20 }, (_, i) => i);

const CATEGORY_OPTIONS: { id: PddTicketCategory; label: string }[] = [
  { id: "A_B", label: "Категории A, B" },
  { id: "C_D", label: "Категории C, D" },
];

function cellClass(r: PddQuestionResult): string {
  let c = "pdd-exam-tickets-cell";
  if (r === "correct") c += " pdd-exam-tickets-cell--ok";
  else if (r === "wrong") c += " pdd-exam-tickets-cell--bad";
  else c += " pdd-exam-tickets-cell--empty";
  return c;
}

export function PddExamTicketsTab() {
  const [category, setCategory] = useState<PddTicketCategory>("A_B");
  const [ticketNum, setTicketNum] = useState(1);
  const [questions, setQuestions] = useState<PddQuestion[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);
  const [tipOpen, setTipOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const [allStats, setAllStats] = useState(loadAllTicketStats);
  const [cellResults, setCellResults] = useState<PddQuestionResult[]>(() =>
    getTicketResults(loadAllTicketStats(), "A_B", 1)
  );

  useEffect(() => {
    const all = loadAllTicketStats();
    setAllStats(all);
    setCellResults(getTicketResults(all, category, ticketNum));
    setPickedIdx(null);
    setTipOpen(false);
  }, [category, ticketNum]);

  const loadTicket = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setPickedIdx(null);
    setTipOpen(false);
    try {
      const data = await fetchPddTicket(category, ticketNum);
      setQuestions(data);
      setQIndex(0);
    } catch {
      setQuestions([]);
      setErr("Не удалось загрузить билет. Проверьте, что файлы есть в public/pdd.");
    } finally {
      setLoading(false);
    }
  }, [category, ticketNum]);

  useEffect(() => {
    void loadTicket();
  }, [loadTicket]);

  const q = questions[qIndex];
  const total = questions.length;
  const imageSrc = q ? resolvePddImageUrl(q.image) : null;

  const isPerfectTicket = isTicketAllCorrect(cellResults);

  function handlePickAnswer(i: number) {
    if (!q || pickedIdx !== null) return;
    const ok = q.answers[i]?.is_correct === true;
    setAllStats((prev) => {
      const { nextAll, results } = writeQuestionResult(
        prev,
        category,
        ticketNum,
        qIndex,
        ok ? "correct" : "wrong"
      );
      setCellResults(results);
      return nextAll;
    });

    if (ok) {
      if (qIndex < total - 1) {
        setPickedIdx(null);
        setTipOpen(false);
        setQIndex((n) => n + 1);
      }
    } else {
      setPickedIdx(i);
      setTipOpen(true);
    }
  }

  function goQuestion(target: number) {
    if (target < 0 || target >= total) return;
    setPickedIdx(null);
    setTipOpen(false);
    setQIndex(target);
  }

  return (
    <div className="pdd-exam-tickets">
      <p className="field-hint pdd-exam-tickets-intro">
        Экзаменационные билеты ПДД РФ: выберите категорию и номер билета. Прогресс по вопросам сохраняется на
        этом устройстве.
      </p>

      <div className="pdd-exam-tickets-toolbar glossy-panel">
        <label className="pdd-exam-tickets-field">
          <span className="pdd-exam-tickets-field-label">Категория</span>
          <select
            className="pdd-exam-tickets-select"
            value={category}
            onChange={(e) => setCategory(e.target.value as PddTicketCategory)}
            aria-label="Категория прав"
          >
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <div className="pdd-exam-tickets-ticket-with-reset">
          <label
            className={`pdd-exam-tickets-field pdd-exam-tickets-field--ticket${isPerfectTicket ? " pdd-exam-tickets-field--perfect" : ""}`}
          >
            <span className="pdd-exam-tickets-field-label">Билет</span>
            <select
              className="pdd-exam-tickets-select"
              value={ticketNum}
              onChange={(e) => setTicketNum(Number(e.target.value))}
              aria-label="Номер билета"
            >
              {TICKET_NUMBERS.map((n) => {
                const perfect = isTicketAllCorrect(getTicketResults(allStats, category, n));
                return (
                  <option key={n} value={n}>
                    {perfect ? "✓ " : ""}Билет {n}
                  </option>
                );
              })}
            </select>
          </label>
          <button
            type="button"
            className="pdd-exam-tickets-reset-btn"
            title="Обнулить статистику по билетам"
            aria-label="Обнулить статистику по билетам"
            onClick={() => setResetConfirmOpen(true)}
          >
            <svg
              className="pdd-exam-tickets-reset-ico"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden
            >
              <path
                d="M4 12a8 8 0 0 1 8-8 8 8 0 0 1 7.74 6M20 12a8 8 0 0 1-8 8 8 8 0 0 1-7.74-6"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
              <path
                d="M21 5v4h-4M3 19v-4h4"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={resetConfirmOpen}
        title="Подтверждение"
        message="Вы уверены, что хотите обнулить статистику?"
        confirmLabel="Да"
        cancelLabel="Нет"
        onConfirm={() => {
          const next = clearAllTicketStats();
          setAllStats(next);
          setCellResults(getTicketResults(next, category, ticketNum));
          setResetConfirmOpen(false);
        }}
        onCancel={() => setResetConfirmOpen(false)}
      />

      <div className="pdd-exam-tickets-grid-wrap" aria-hidden={false}>
        <p className="pdd-exam-tickets-grid-caption">Номера задач билета</p>
        <div className="pdd-exam-tickets-grid">
          {GRID_INDICES.map((i) => (
            <button
              key={i}
              type="button"
              className={`${cellClass(cellResults[i] ?? null)}${i === qIndex ? " pdd-exam-tickets-cell--current" : ""}`}
              onClick={() => {
                if (total > 0) goQuestion(i);
              }}
              disabled={total === 0}
              title={`Задача ${i + 1}`}
              aria-label={`Задача ${i + 1}${cellResults[i] === "correct" ? ", верно" : cellResults[i] === "wrong" ? ", неверно" : ", не решена"}`}
              aria-current={i === qIndex ? "true" : undefined}
            >
              <span className="pdd-exam-tickets-cell-num">{i + 1}</span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="instructor-history-loading-hint" aria-live="polite">
          Загрузка билета…
        </p>
      ) : null}
      {err ? (
        <div className="form-error" role="alert">
          {err}
        </div>
      ) : null}

      {!loading && !err && q && total > 0 ? (
        <article className="pdd-exam-tickets-card glossy-panel">
          <header className="pdd-exam-tickets-card-head">
            <span className="pdd-exam-tickets-meta">
              {q.ticket_number} · {q.title}
            </span>
            <span className="pdd-exam-tickets-progress">
              Вопрос {qIndex + 1} из {total}
            </span>
          </header>
          {q.topic?.length ? (
            <p className="pdd-exam-tickets-topic">{q.topic.join(", ")}</p>
          ) : null}

          {imageSrc ? (
            <div className="pdd-exam-tickets-image-wrap">
              <img
                className="pdd-exam-tickets-image"
                src={imageSrc}
                alt=""
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          ) : null}

          <p className="pdd-exam-tickets-question">{q.question}</p>

          <ul className="pdd-exam-tickets-answers" role="list">
            {q.answers.map((a, i) => {
              const showResult = pickedIdx !== null;
              const isPicked = pickedIdx === i;
              const correct = a.is_correct;
              let cls = "pdd-exam-tickets-answer-btn";
              if (showResult) {
                if (correct) cls += " is-correct";
                else if (isPicked) cls += " is-wrong";
              }
              return (
                <li key={i}>
                  <button
                    type="button"
                    className={cls}
                    disabled={showResult}
                    onClick={() => handlePickAnswer(i)}
                  >
                    <span className="pdd-exam-tickets-answer-num">{i + 1}.</span> {a.answer_text}
                  </button>
                </li>
              );
            })}
          </ul>

          {pickedIdx !== null ? (
            <div className="pdd-exam-tickets-feedback">
              <p className="pdd-exam-tickets-correct-line">{q.correct_answer}</p>
              <button
                type="button"
                className="btn btn-ghost pdd-exam-tickets-tip-toggle"
                onClick={() => setTipOpen((o) => !o)}
                aria-expanded={tipOpen}
              >
                {tipOpen ? "Скрыть пояснение" : "Показать пояснение"}
              </button>
              {tipOpen ? <p className="pdd-exam-tickets-tip">{q.answer_tip}</p> : null}
            </div>
          ) : null}

          <div className="pdd-exam-tickets-nav">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={qIndex <= 0}
              onClick={() => goQuestion(qIndex - 1)}
            >
              ← Предыдущий
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={qIndex >= total - 1}
              onClick={() => goQuestion(qIndex + 1)}
            >
              Следующий →
            </button>
          </div>
        </article>
      ) : !loading && !err ? (
        <p className="admin-empty">Нет вопросов в этом билете.</p>
      ) : null}
    </div>
  );
}
