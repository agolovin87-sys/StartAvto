import type { CabinetClientKind } from "@/types";

export function detectCabinetClientKind(): CabinetClientKind {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) {
    return "ios";
  }
  return "web";
}

export function normalizeCabinetClientKind(
  raw: unknown
): CabinetClientKind | undefined {
  if (raw === "ios" || raw === "android" || raw === "web" || raw === "unknown") {
    return raw;
  }
  return undefined;
}
