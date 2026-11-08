/**
 * Journal lock: optional end-to-end encryption for everything a person writes.
 *
 * - A random 256-bit journal key is made in the browser. It never leaves the device unencrypted.
 * - It's stored on the server twice, wrapped (AES-GCM) by keys derived with PBKDF2-SHA256 from
 *   (a) the person's passphrase and (b) a random recovery code shown once. The server can't unwrap either.
 * - From the journal key, HKDF derives an AES-GCM key (encrypts text) and an HMAC key (gives
 *   remembered facts a stable, unreadable id so duplicates still merge).
 * - Unlocked keys are cached per device in IndexedDB as non-extractable CryptoKeys, so a device
 *   stays unlocked until "Lock this device" or signing out.
 *
 * Encrypted values are strings: "enc:v1:" + base64url(iv || ciphertext+tag).
 */
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export const SEALED_PREFIX = "enc:v1:";
const PASSPHRASE_ITERATIONS = 600_000;
const RECOVERY_ITERATIONS = 100_000; // the recovery code already carries 120 random bits
const CHECK_TEXT = "dearme-journal-lock-check";
const TEXT_AAD = utf8("dearme:text:v1");
const WRAP_AAD = utf8("dearme:wrap:v1");
const HKDF_SALT = utf8("dearme-journal-lock");
const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789"; // no 0/O, 1/I/L, U

export type VaultStatus = "unknown" | "off" | "locked" | "unlocked";
type Keys = { enc: CryptoKey; mac: CryptoKey };

export type KeyRecord = {
  user_id: string;
  version: number;
  kdf_iterations: number;
  passphrase_salt: string;
  passphrase_wrapped: string;
  recovery_salt: string;
  recovery_wrapped: string;
  key_check: string;
};

export class VaultLockedError extends Error {
  constructor() {
    super("Your journal is locked on this device. Unlock it to continue.");
    this.name = "VaultLockedError";
  }
}

// --- state, with a tiny subscription so React can follow it -------------------------------------

let state: { userId: string | null; status: VaultStatus; keys: Keys | null; record: KeyRecord | null } = {
  userId: null,
  status: "unknown",
  keys: null,
  record: null,
};
const listeners = new Set<() => void>();

function setState(next: Partial<typeof state>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

export const vault = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  status: () => state.status,
  /** True when new writes must be encrypted. */
  active: () => state.status === "unlocked",
};

// --- encoding helpers -------------------------------------------------------------------------

function utf8(text: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(text) as Uint8Array<ArrayBuffer>;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function isSealed(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(SEALED_PREFIX);
}

// --- key derivation and wrapping --------------------------------------------------------------

async function deriveKeys(raw: Uint8Array<ArrayBuffer>): Promise<Keys> {
  const base = await crypto.subtle.importKey("raw", raw, "HKDF", false, ["deriveKey"]);
  const enc = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: HKDF_SALT, info: utf8("enc") },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  const mac = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: HKDF_SALT, info: utf8("mac") },
    base,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"]
  );
  return { enc, mac };
}

async function wrappingKey(secret: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", utf8(secret.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function wrap(key: CryptoKey, raw: Uint8Array<ArrayBuffer>): Promise<string> {
  const iv = randomBytes(12);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: WRAP_AAD }, key, raw));
  const out = new Uint8Array(iv.length + sealed.length);
  out.set(iv);
  out.set(sealed, iv.length);
  return toBase64Url(out);
}

async function unwrap(key: CryptoKey, wrapped: string): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = fromBase64Url(wrapped);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.slice(0, 12), additionalData: WRAP_AAD },
    key,
    bytes.slice(12)
  );
  return new Uint8Array(plain);
}

async function sealWith(keys: Keys, text: string): Promise<string> {
  const iv = randomBytes(12);
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: TEXT_AAD }, keys.enc, utf8(text))
  );
  const out = new Uint8Array(iv.length + sealed.length);
  out.set(iv);
  out.set(sealed, iv.length);
  return SEALED_PREFIX + toBase64Url(out);
}

async function openWith(keys: Keys, value: string): Promise<string> {
  const bytes = fromBase64Url(value.slice(SEALED_PREFIX.length));
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.slice(0, 12), additionalData: TEXT_AAD },
    keys.enc,
    bytes.slice(12)
  );
  return new TextDecoder().decode(plain);
}

/** 24 characters from an unambiguous alphabet, grouped "ABCD-EFGH-...": about 118 random bits. */
export function newRecoveryCode(): string {
  const bytes = randomBytes(24);
  const chars = Array.from(bytes, (byte) => RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length]).join("");
  return chars.match(/.{4}/g)!.join("-");
}

export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
}

// --- device cache (IndexedDB) -----------------------------------------------------------------

const DB_NAME = "dearme-vault";
const STORE = "keys";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function cacheKeys(userId: string, keys: Keys | null): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      if (keys) tx.objectStore(STORE).put(keys, userId);
      else tx.objectStore(STORE).delete(userId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Private windows can block IndexedDB: the journal then unlocks for this tab only.
  }
}

async function cachedKeys(userId: string): Promise<Keys | null> {
  try {
    const db = await openDb();
    const keys = await new Promise<Keys | null>((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(userId);
      request.onsuccess = () => resolve((request.result as Keys | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return keys;
  } catch {
    return null;
  }
}

// --- lifecycle --------------------------------------------------------------------------------

export function isMissingTable(error: { code?: string; message?: string }): boolean {
  return error.code === "PGRST205" || error.code === "42P01" || /journal_keys/.test(error.message ?? "") && /not find|does not exist/.test(error.message ?? "");
}

/** Where wrapped keys live: the journal_keys table (swappable in tests). */
type KeyStore = {
  load(userId: string): Promise<KeyRecord | null>;
  insert(record: KeyRecord): Promise<boolean>;
  update(userId: string, patch: Partial<KeyRecord>): Promise<boolean>;
  remove(userId: string): Promise<boolean>;
};

const supabaseStore: KeyStore = {
  async load(userId) {
    const { data, error } = await getSupabaseBrowserClient()
      .from("journal_keys")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      // Before the phase 10 migration the table doesn't exist: journal lock is simply unavailable.
      if (isMissingTable(error)) return null;
      // Anything else (offline, timeout) must not be mistaken for "journal lock is off".
      throw new Error("We couldn't check your journal's privacy settings. Check your connection and try again.");
    }
    return (data as KeyRecord | null) ?? null;
  },
  async insert(record) {
    const { error } = await getSupabaseBrowserClient().from("journal_keys").insert(record);
    return !error;
  },
  async update(userId, patch) {
    const { error } = await getSupabaseBrowserClient().from("journal_keys").update(patch).eq("user_id", userId);
    return !error;
  },
  async remove(userId) {
    const { error } = await getSupabaseBrowserClient().from("journal_keys").delete().eq("user_id", userId);
    return !error;
  },
};

let store: KeyStore = supabaseStore;

const loadRecord = (userId: string) => store.load(userId);

async function verify(keys: Keys, record: KeyRecord): Promise<boolean> {
  try {
    return (await openWith(keys, record.key_check)) === CHECK_TEXT;
  } catch {
    return false;
  }
}

/** Work out whether this person uses journal lock, and whether this device is unlocked. */
export async function initVault(userId: string): Promise<VaultStatus> {
  if (state.userId === userId && state.status !== "unknown") return state.status;
  const record = await loadRecord(userId);
  if (!record) {
    setState({ userId, status: "off", keys: null, record: null });
    return "off";
  }
  const keys = await cachedKeys(userId);
  if (keys && (await verify(keys, record))) {
    setState({ userId, status: "unlocked", keys, record });
    return "unlocked";
  }
  if (keys) await cacheKeys(userId, null); // keys from an older lock: no longer valid
  setState({ userId, status: "locked", keys: null, record });
  return "locked";
}

async function unlockWith(secret: string, salt: string, wrapped: string, iterations: number): Promise<boolean> {
  const { userId, record } = state;
  if (!userId || !record) return false;
  try {
    const raw = await unwrap(await wrappingKey(secret, fromBase64Url(salt), iterations), wrapped);
    const keys = await deriveKeys(raw);
    raw.fill(0);
    if (!(await verify(keys, record))) return false;
    await cacheKeys(userId, keys);
    setState({ status: "unlocked", keys });
    return true;
  } catch {
    return false;
  }
}

export function unlockWithPassphrase(passphrase: string): Promise<boolean> {
  const record = state.record;
  if (!record) return Promise.resolve(false);
  return unlockWith(passphrase, record.passphrase_salt, record.passphrase_wrapped, record.kdf_iterations);
}

export function unlockWithRecoveryCode(code: string): Promise<boolean> {
  const record = state.record;
  if (!record) return Promise.resolve(false);
  return unlockWith(normalizeRecoveryCode(code), record.recovery_salt, record.recovery_wrapped, RECOVERY_ITERATIONS);
}

/** Turn journal lock on: make the key, store it wrapped twice, and unlock this device. */
export async function enableVault(userId: string, passphrase: string): Promise<{ recoveryCode: string } | { error: string }> {
  const raw = randomBytes(32);
  const recoveryCode = newRecoveryCode();
  const passphraseSalt = randomBytes(16);
  const recoverySalt = randomBytes(16);
  const keys = await deriveKeys(raw);
  const record: KeyRecord = {
    user_id: userId,
    version: 1,
    kdf_iterations: PASSPHRASE_ITERATIONS,
    passphrase_salt: toBase64Url(passphraseSalt),
    passphrase_wrapped: await wrap(await wrappingKey(passphrase, passphraseSalt, PASSPHRASE_ITERATIONS), raw),
    recovery_salt: toBase64Url(recoverySalt),
    recovery_wrapped: await wrap(
      await wrappingKey(normalizeRecoveryCode(recoveryCode), recoverySalt, RECOVERY_ITERATIONS),
      raw
    ),
    key_check: await sealWith(keys, CHECK_TEXT),
  };
  raw.fill(0);
  if (!(await store.insert(record))) return { error: "We couldn't turn on journal lock. Nothing was changed." };
  await cacheKeys(userId, keys);
  setState({ userId, status: "unlocked", keys, record });
  return { recoveryCode };
}

/** Set a new passphrase using the current passphrase or the recovery code. */
export async function changePassphrase(
  current: { passphrase: string } | { recoveryCode: string },
  next: string
): Promise<boolean> {
  const record = state.record;
  if (!record) return false;
  try {
    const raw =
      "passphrase" in current
        ? await unwrap(await wrappingKey(current.passphrase, fromBase64Url(record.passphrase_salt), record.kdf_iterations), record.passphrase_wrapped)
        : await unwrap(
            await wrappingKey(normalizeRecoveryCode(current.recoveryCode), fromBase64Url(record.recovery_salt), RECOVERY_ITERATIONS),
            record.recovery_wrapped
          );
    const salt = randomBytes(16);
    const update = {
      kdf_iterations: PASSPHRASE_ITERATIONS,
      passphrase_salt: toBase64Url(salt),
      passphrase_wrapped: await wrap(await wrappingKey(next, salt, PASSPHRASE_ITERATIONS), raw),
    };
    const keys = await deriveKeys(raw);
    raw.fill(0);
    if (!(await verify(keys, record))) return false;
    if (!(await store.update(record.user_id, update))) return false;
    await cacheKeys(record.user_id, keys);
    setState({ status: "unlocked", keys, record: { ...record, ...update } });
    return true;
  } catch {
    return false;
  }
}

/** Check a passphrase without changing anything (before turning journal lock off). */
export async function checkPassphrase(passphrase: string): Promise<boolean> {
  const record = state.record;
  if (!record) return false;
  try {
    const raw = await unwrap(
      await wrappingKey(passphrase, fromBase64Url(record.passphrase_salt), record.kdf_iterations),
      record.passphrase_wrapped
    );
    raw.fill(0);
    return true;
  } catch {
    return false;
  }
}

/** Forget the key on this device. The journal stays encrypted and needs the passphrase again. */
export async function lockDevice(): Promise<void> {
  if (state.userId) await cacheKeys(state.userId, null);
  setState({ status: state.record ? "locked" : "off", keys: null });
}

/** After everything has been decrypted: remove the wrapped key and go back to normal storage. */
export async function removeVault(): Promise<boolean> {
  const { userId } = state;
  if (!userId) return false;
  if (!(await store.remove(userId))) return false;
  await cacheKeys(userId, null);
  setState({ status: "off", keys: null, record: null });
  return true;
}

/** After "Delete my data" removed the wrapped key on the server: go back to normal storage here too. */
export async function vaultDeleted(): Promise<void> {
  if (state.userId) await cacheKeys(state.userId, null);
  setState({ status: "off", keys: null, record: null });
}

/** Signing out forgets this device's key; the next sign-in asks for the passphrase again. */
export async function forgetVaultOnDevice(): Promise<void> {
  if (state.userId) await cacheKeys(state.userId, null);
  setState({ userId: null, status: "unknown", keys: null, record: null });
}

// --- sealing values ---------------------------------------------------------------------------

/** Encrypt text when journal lock is on; otherwise return it unchanged. */
export async function sealText(text: string): Promise<string>;
export async function sealText(text: string | null): Promise<string | null>;
export async function sealText(text: string | null): Promise<string | null> {
  if (text === null || state.status === "off") return text;
  if (!state.keys) throw new VaultLockedError();
  if (isSealed(text)) return text;
  return sealWith(state.keys, text);
}

/** Decrypt a value if it's encrypted; plain values pass through. */
export async function openText(value: string): Promise<string>;
export async function openText(value: string | null): Promise<string | null>;
export async function openText(value: string | null): Promise<string | null> {
  if (!isSealed(value)) return value;
  if (!state.keys) throw new VaultLockedError();
  try {
    return await openWith(state.keys, value);
  } catch {
    return "[This text couldn't be decrypted.]";
  }
}

/** Decrypt or throw: for migrations, where a placeholder must never replace real ciphertext. */
export async function openTextStrict(value: string): Promise<string> {
  if (!isSealed(value)) return value;
  if (!state.keys) throw new VaultLockedError();
  return openWith(state.keys, value);
}

/** Encrypt any JSON value (stored as a JSON string) when journal lock is on. */
export async function sealJson<T>(value: T): Promise<T | string> {
  if (state.status === "off") return value;
  if (!state.keys) throw new VaultLockedError();
  return sealWith(state.keys, JSON.stringify(value));
}

export async function openJson<T>(value: unknown, fallback: T): Promise<T> {
  if (!isSealed(value)) return (value as T) ?? fallback;
  if (!state.keys) throw new VaultLockedError();
  try {
    return JSON.parse(await openWith(state.keys, value)) as T;
  } catch {
    return fallback;
  }
}

/** A stable id for a remembered fact that reveals nothing about it (only when journal lock is on). */
export async function factKey(key: string): Promise<string> {
  if (!state.keys) return key;
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", state.keys.mac, utf8(key.toLowerCase())));
  return `h:${Array.from(signature.slice(0, 24), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

// Exposed for tests only.
export const __test = {
  useStore(next: KeyStore | null) {
    store = next ?? supabaseStore;
    state = { userId: null, status: "unknown", keys: null, record: null };
  },
};
