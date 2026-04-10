/** Приводит ввод к виду +7 и ровно 10 цифр после кода страны (РФ). */
export function normalizeRuPhone(input: string): string | null {
  let d = input.replace(/\D/g, "");
  if (d.length === 11 && (d[0] === "8" || d[0] === "7")) {
    d = "7" + d.slice(1);
  } else if (d.length === 10 && d[0] === "9") {
    d = "7" + d;
  }
  if (d.length === 11 && d[0] === "7") {
    return "+" + d;
  }
  return null;
}

export function isValidRuMobilePhone(normalized: string): boolean {
  return /^\+7\d{10}$/.test(normalized);
}
