// Server-only client for the NLP service (Render). Never import from client components.
import { z } from "zod";

export type NlpResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "timeout" | "http" | "network" | "invalid"; status?: number };

const baseUrl = () =>
  (process.env.NLP_SERVICE_URL || process.env.NEXT_PUBLIC_NLP_URL || "http://localhost:8000").replace(/\/+$/, "");

const headers = (): Record<string, string> => {
  const result: Record<string, string> = { "Content-Type": "application/json" };
  const token = process.env.NLP_INTERNAL_TOKEN;
  if (token) result["X-Internal-Token"] = token;
  return result;
};

/**
 * POST to the NLP service with a hard timeout, so a sleeping or overloaded instance
 * falls back quickly instead of holding the request until the platform kills it.
 */
export async function callNlp<T>(
  path: string,
  body: unknown,
  timeoutMs: number,
  schema?: z.ZodType<T>
): Promise<NlpResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl()}${path}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      console.warn(`nlp ${path} failed with ${response.status}`);
      return { ok: false, reason: "http", status: response.status };
    }
    const json: unknown = await response.json();
    if (schema) {
      const parsed = schema.safeParse(json);
      if (!parsed.success) {
        console.warn(`nlp ${path} returned an unexpected shape`);
        return { ok: false, reason: "invalid" };
      }
      return { ok: true, data: parsed.data };
    }
    return { ok: true, data: json as T };
  } catch {
    const reason = controller.signal.aborted ? "timeout" : "network";
    console.warn(`nlp ${path} ${reason}`);
    return { ok: false, reason };
  } finally {
    clearTimeout(timer);
  }
}

/** Fire-and-forget wake-up for a sleeping free-tier instance. */
export async function pingNlp(timeoutMs = 2500): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl()}/health`, { signal: controller.signal, cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export const serializeEmbedding = (embedding: unknown): string => {
  if (Array.isArray(embedding)) return `[${embedding.map((item) => Number(item)).join(",")}]`;
  if (typeof embedding === "string") return embedding;
  return "[]";
};

export const parseEmbedding = (value: unknown): number[] => {
  if (Array.isArray(value)) {
    return value.map(Number).filter(Number.isFinite);
  }
  if (typeof value === "string") {
    return value
      .replace(/[[\]()]/g, "")
      .split(",")
      .map((item) => Number(item.trim()))
      .filter(Number.isFinite);
  }
  return [];
};

export const EMBEDDING_DIM = 384;
