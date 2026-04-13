import type { PasskeyRegistration } from "@/types";

/** Демо-хранилище привязок passkey → пользователь (только в браузере). */
const STORAGE_KEY = "startavto_passkey_demo_registrations_v1";

function readRegs(): PasskeyRegistration[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as PasskeyRegistration[]) : [];
  } catch {
    return [];
  }
}

function writeRegs(list: PasskeyRegistration[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function bufferToBase64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64urlToBuffer(s: string): ArrayBuffer {
  const pad = s.length % 4;
  const b64 = (s + "===".slice(pad)).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out.buffer;
}

function rpId(): string {
  return window.location.hostname;
}

export function isPasskeySupported(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      window.isSecureContext === true &&
      typeof navigator !== "undefined" &&
      typeof navigator.credentials?.create === "function" &&
      typeof navigator.credentials?.get === "function" &&
      typeof PublicKeyCredential !== "undefined"
    );
  } catch {
    return false;
  }
}

export function getPasskeyRegistrationsForUser(userId: string): PasskeyRegistration[] {
  const id = userId.trim();
  if (!id) return [];
  return readRegs().filter((r) => r.userId === id);
}

/** Самая свежая запись для пользователя (по ISO-строке registeredAt). */
export function getPrimaryPasskeyForUser(userId: string): PasskeyRegistration | null {
  const list = getPasskeyRegistrationsForUser(userId);
  if (!list.length) return null;
  return [...list].sort((a, b) => b.registeredAt.localeCompare(a.registeredAt))[0] ?? null;
}

export function hasPasskeyForUser(userId: string): boolean {
  return getPrimaryPasskeyForUser(userId) != null;
}

/**
 * Регистрация passkey (WebAuthn create). Публичный ключ в продакшене должен храниться на сервере;
 * здесь в демо сохраняется только метаданные в localStorage.
 */
export async function registerPasskey(
  email: string,
  userId: string
): Promise<PublicKeyCredential> {
  if (!isPasskeySupported()) {
    throw new Error("Браузер или контекст не поддерживают passkey (нужен HTTPS).");
  }
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const uidBytes = new TextEncoder().encode(userId.trim());
  const userHandle = uidBytes.byteLength > 64 ? uidBytes.slice(0, 64) : uidBytes;

  const publicKey: PublicKeyCredentialCreationOptions = {
    challenge,
    rp: { name: "StartAvto", id: rpId() },
    user: {
      id: userHandle,
      name: email.trim(),
      displayName: email.trim(),
    },
    pubKeyCredParams: [
      { type: "public-key", alg: -7 },
      { type: "public-key", alg: -257 },
    ],
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
    timeout: 60_000,
    attestation: "none",
  };

  const cred = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
  if (!cred || cred.type !== "public-key") {
    throw new Error("Регистрация passkey отменена или недоступна.");
  }

  const credentialId = bufferToBase64url(cred.rawId);
  const reg: PasskeyRegistration = {
    credentialId,
    userId: userId.trim(),
    email: email.trim().toLowerCase(),
    registeredAt: new Date().toISOString(),
    deviceInfo: typeof navigator.userAgent === "string" ? navigator.userAgent : undefined,
  };

  const next = readRegs().filter((r) => r.credentialId !== credentialId);
  next.push(reg);
  writeRegs(next);

  return cred;
}

export async function loginWithPasskey(): Promise<{ email: string; credentialId: string }> {
  if (!isPasskeySupported()) {
    throw new Error("Passkey недоступен в этом браузере.");
  }
  const regs = readRegs();
  const allowCredentials: PublicKeyCredentialDescriptor[] = regs.map((r) => ({
    type: "public-key",
    id: base64urlToBuffer(r.credentialId),
    transports: ["internal", "hybrid"] as AuthenticatorTransport[],
  }));

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge,
    rpId: rpId(),
    allowCredentials: allowCredentials.length ? allowCredentials : undefined,
    userVerification: "preferred",
    timeout: 60_000,
  };

  const assertion = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
  if (!assertion) {
    throw new Error("Вход по биометрии отменён.");
  }

  const credentialId = bufferToBase64url(assertion.rawId);
  const found = readRegs().find((r) => r.credentialId === credentialId);
  if (!found) {
    throw new Error(
      "Ключ не сопоставлен с сохранёнными данными на этом устройстве. Войдите по паролю и подключите биометрию снова."
    );
  }
  return { email: found.email, credentialId };
}

export async function deletePasskey(credentialId: string): Promise<void> {
  const next = readRegs().filter((r) => r.credentialId !== credentialId);
  writeRegs(next);
}
