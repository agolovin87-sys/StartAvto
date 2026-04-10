/** «Иванов Иван Иванович» → «Иванов И.И.» */
export function formatShortFio(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0];
  const surname = parts[0];
  const initials = parts
    .slice(1)
    .map((p) => `${(p[0] ?? "?").toUpperCase()}.`)
    .join("");
  return `${surname} ${initials}`;
}
