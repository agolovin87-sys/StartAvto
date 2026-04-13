export interface BadgingState {
  supported: boolean;
  currentCount: number;
  platform: "windows" | "mac" | "android" | "ios" | "unknown";
}

export type BadgeUpdateSource = "message" | "booking" | "reminder" | "manual";
