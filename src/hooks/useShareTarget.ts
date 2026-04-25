import { useCallback, useEffect, useState } from "react";
import type { SharedTargetPayload } from "@/types/shareTarget";

const STORAGE_KEY = "startavto_shared_target_payload";
const MAX_AGE_MS = 5 * 60 * 1000;

type ShareToExternalInput = {
  title?: string;
  text?: string;
  url?: string;
  files?: File[];
};

function readStoredPayload(): SharedTargetPayload | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Omit<SharedTargetPayload, "files">;
    if (!parsed || typeof parsed !== "object") return null;
    if (Date.now() - (parsed.timestamp ?? 0) > MAX_AGE_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      title: parsed.title,
      text: parsed.text,
      url: parsed.url,
      timestamp: parsed.timestamp ?? Date.now(),
    };
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function useShareTarget() {
  const [sharedData, setSharedData] = useState<SharedTargetPayload | null>(null);

  useEffect(() => {
    // В приоритете — runtime payload (может содержать File[]).
    if (window.__startAvtoSharedData) {
      setSharedData(window.__startAvtoSharedData);
      return;
    }
    const stored = readStoredPayload();
    if (stored) setSharedData(stored);
  }, []);

  const clearSharedData = useCallback(() => {
    setSharedData(null);
    window.__startAvtoSharedData = null;
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const canShare = useCallback((data?: ShareToExternalInput) => {
    if (!("share" in navigator) || typeof navigator.share !== "function") return false;
    if (data?.files?.length) {
      if (!("canShare" in navigator) || typeof navigator.canShare !== "function") return false;
      return navigator.canShare({ files: data.files });
    }
    return true;
  }, []);

  const shareToExternal = useCallback(async (data: ShareToExternalInput) => {
    if (!canShare(data)) throw new Error("Шеринг не поддерживается на этом устройстве");
    await navigator.share(data);
  }, [canShare]);

  return {
    sharedData,
    hasSharedData: sharedData != null,
    clearSharedData,
    canShare,
    shareToExternal,
  };
}
