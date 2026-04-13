import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import {
  hapticHeavy,
  hapticLight,
  hapticMedium,
  hapticSelection,
} from "@/utils/haptics";

export interface HapticButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  hapticType?: "light" | "medium" | "heavy" | "selection";
  children?: ReactNode;
}

function fireHaptic(type: NonNullable<HapticButtonProps["hapticType"]>): void {
  /** Не вызывать AudioContext до вибрации: на Android иначе жест может «сорваться» и vibrate не сработает. */
  switch (type) {
    case "medium":
      hapticMedium();
      break;
    case "heavy":
      hapticHeavy();
      break;
    case "selection":
      hapticSelection();
      break;
    default:
      hapticLight();
  }
}

export const HapticButton = forwardRef<HTMLButtonElement, HapticButtonProps>(
  function HapticButton(
    { hapticType = "light", onClick, type = "button", disabled, children, ...rest },
    ref
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled}
        {...rest}
        onClick={(e) => {
          if (!disabled) {
            fireHaptic(hapticType);
          }
          onClick?.(e);
        }}
      >
        {children}
      </button>
    );
  }
);
