import type { CabinetClientKind } from "@/types";

type Props = { kind?: CabinetClientKind };

/** Кружок с иконкой iOS/Android — только для мобильных; веб не показываем. */
export function CabinetClientKindBadge({ kind }: Props) {
  if (kind !== "ios" && kind !== "android") return null;

  const title =
    kind === "ios" ? "Последний вход с iOS" : "Последний вход с Android";

  return (
    <span className="cabinet-client-kind-badge" title={title} aria-label={title}>
      {kind === "ios" ? <IconApple /> : <IconAndroid />}
    </span>
  );
}

function IconApple() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="cabinet-client-kind-badge-svg">
      <path
        fill="currentColor"
        d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
      />
    </svg>
  );
}

function IconAndroid() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="cabinet-client-kind-badge-svg">
      <path
        fill="currentColor"
        d="M17.6 9.48l1.84-2.52c.09-.13.06-.3-.07-.39-.13-.09-.3-.06-.39.07L17.03 9.2c-1.34-.95-2.96-1.5-4.7-1.5-1.74 0-3.36.55-4.7 1.5L5.91 6.64c-.09-.13-.26-.16-.39-.07-.13.09-.16.26-.07.39l1.84 2.52C4.84 11.04 3.5 13.37 3.5 16v1h17v-1c0-2.63-1.34-4.96-3.4-6.52zM7.5 14c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm9 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"
      />
    </svg>
  );
}
