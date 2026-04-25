export interface SharedTargetPayload {
  title?: string;
  text?: string;
  url?: string;
  files?: File[];
  timestamp: number;
}

declare global {
  interface Window {
    __startAvtoSharedData?: SharedTargetPayload | null;
  }
}

export {};
