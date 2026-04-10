import type { PddTicketCategory } from "@/types/pdd";

const STORAGE_KEY = "startavto.pdd.ticketStats.v1";

export type PddQuestionResult = "correct" | "wrong" | null;

export type PddTicketStored = {
  /** 20 ячеек: верно / неверно / ещё не решали */
  results: PddQuestionResult[];
};

export function statsStorageKey(category: PddTicketCategory, ticketNum: number): string {
  return `${category}:${ticketNum}`;
}

export function loadAllTicketStats(): Record<string, PddTicketStored> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as Record<string, PddTicketStored>;
    return p && typeof p === "object" ? p : {};
  } catch {
    return {};
  }
}

export function saveAllTicketStats(all: Record<string, PddTicketStored>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* квота или приватный режим */
  }
}

/** Удаляет всю сохранённую статистику по экзаменационным билетам ПДД. */
export function clearAllTicketStats(): Record<string, PddTicketStored> {
  const next: Record<string, PddTicketStored> = {};
  saveAllTicketStats(next);
  return next;
}

const EMPTY_20 = (): PddQuestionResult[] => Array<PddQuestionResult>(20).fill(null);

export function getTicketResults(
  all: Record<string, PddTicketStored>,
  category: PddTicketCategory,
  ticketNum: number
): PddQuestionResult[] {
  const k = statsStorageKey(category, ticketNum);
  const r = all[k]?.results;
  const out = EMPTY_20();
  if (!r?.length) return out;
  for (let i = 0; i < 20; i++) {
    const v = r[i];
    out[i] = v === "correct" || v === "wrong" ? v : null;
  }
  return out;
}

export function isTicketAllCorrect(results: PddQuestionResult[]): boolean {
  return results.length >= 20 && results.slice(0, 20).every((r) => r === "correct");
}

export function writeQuestionResult(
  all: Record<string, PddTicketStored>,
  category: PddTicketCategory,
  ticketNum: number,
  questionIndex: number,
  result: "correct" | "wrong"
): { nextAll: Record<string, PddTicketStored>; results: PddQuestionResult[] } {
  const k = statsStorageKey(category, ticketNum);
  const results = [...getTicketResults(all, category, ticketNum)];
  if (questionIndex >= 0 && questionIndex < 20) {
    results[questionIndex] = result;
  }
  const nextAll = { ...all, [k]: { results } };
  saveAllTicketStats(nextAll);
  return { nextAll, results };
}
