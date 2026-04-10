/** Стабильный цвет по uid и инициалы «Ф» + «И» из полного ФИО */
export function avatarHueFromUid(uid: string): number {
  let h = 0;
  for (let i = 0; i < uid.length; i++) {
    h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

export function initialsFromFullName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const a = (parts[0][0] ?? "?").toUpperCase();
  if (parts.length >= 2) {
    return `${a}${(parts[1][0] ?? "?").toUpperCase()}`;
  }
  return `${a}${(parts[0][1] ?? "?").toUpperCase()}`;
}
