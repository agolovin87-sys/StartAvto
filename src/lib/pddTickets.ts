import type { PddQuestion, PddTicketCategory } from "@/types/pdd";

const BASE = import.meta.env.BASE_URL;

/** JSON билета: `public/pdd/tickets/{A_B|C_D}/Билет N.json` */
export function pddTicketJsonUrl(category: PddTicketCategory, ticketNumber: number): string {
  const fname = `Билет ${ticketNumber}.json`;
  return `${BASE}pdd/tickets/${category}/${encodeURIComponent(fname)}`;
}

/** Картинка к вопросу: в JSON путь вида `./images/A_B/....jpg` относительно корня ресурсов. */
export function resolvePddImageUrl(raw: string): string | null {
  if (!raw?.trim() || /no_image/i.test(raw)) return null;
  const path = raw.replace(/^\.\//, "");
  if (!path.startsWith("images/")) return `${BASE}pdd/images/${path}`;
  return `${BASE}pdd/${path}`;
}

export async function fetchPddTicket(
  category: PddTicketCategory,
  ticketNumber: number
): Promise<PddQuestion[]> {
  const res = await fetch(pddTicketJsonUrl(category, ticketNumber));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<PddQuestion[]>;
}
