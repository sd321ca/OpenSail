/** Small fetch wrapper for the OpenSail JSON/SSE API. */

import type { UploadedFile } from "./types";

/**
 * Called when an authenticated request comes back 401, so the shell can show
 * the sign-in screen. Login requests themselves are exempt.
 */
let unauthorizedHandler: (() => void) | null = null;

export function onUnauthorized(handler: () => void): void {
  unauthorizedHandler = handler;
}

function checkUnauthorized(path: string, response: Response): void {
  if (response.status === 401 && !path.startsWith("/api/login")) {
    unauthorizedHandler?.();
  }
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Human-readable message for a thrown value (``catch (error)`` is unknown). */
export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? "Unknown error");
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const data: unknown = await response.json();
    if (data && typeof data === "object" && "detail" in data) {
      const detail = (data as { detail: unknown }).detail;
      if (typeof detail === "string") return detail;
      if (detail) return JSON.stringify(detail);
    }
  } catch {
    // Fall through to the status text.
  }
  return response.statusText || `Request failed (${response.status})`;
}

export interface ApiOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

/**
 * Call a JSON endpoint. ``T`` defaults to ``any`` because most handlers still
 * return untyped dicts; pass an explicit type where the payload matters.
 */
export async function api<T = any>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const { method = "GET", body, signal, headers = {} } = options;
  const init: RequestInit = { method, signal, headers: { ...headers } };
  if (body !== undefined) {
    if (body instanceof FormData) {
      init.body = body;
    } else {
      (init.headers as Record<string, string>)["Content-Type"] =
        "application/json";
      init.body = JSON.stringify(body);
    }
  }
  const response = await fetch(path, init);
  if (!response.ok) {
    checkUnauthorized(path, response);
    throw new ApiError(await errorMessage(response), response.status);
  }
  if (response.status === 204) return null as T;
  const type = response.headers.get("content-type") || "";
  if (!type.includes("application/json")) return (await response.text()) as T;
  return (await response.json()) as T;
}

export async function uploadFile(file: File): Promise<UploadedFile> {
  const form = new FormData();
  form.append("file", file, file.name || "upload");
  const response = await fetch("/api/uploads", { method: "POST", body: form });
  if (!response.ok) {
    checkUnauthorized("/api/uploads", response);
    throw new ApiError(await errorMessage(response), response.status);
  }
  return (await response.json()) as UploadedFile;
}

/**
 * POST a JSON body and consume a server-sent-event stream.
 * ``onEvent(event)`` is called for every parsed event object.
 */
export async function stream<T = any>(
  path: string,
  body: unknown,
  onEvent: (event: T) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    checkUnauthorized(path, response);
    throw new ApiError(await errorMessage(response), response.status);
  }
  if (!response.body) throw new ApiError("The server returned an empty stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const flush = (chunk: string): void => {
    for (const block of chunk.split(/\r?\n\r?\n/)) {
      if (!block.trim()) continue;
      const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (!data) continue;
      try {
        onEvent(JSON.parse(data) as T);
      } catch (error) {
        console.error("Could not parse stream event", data, error);
      }
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.search(/\r?\n\r?\n/);
      while (boundary >= 0) {
        const match = buffer.slice(boundary).match(/^\r?\n\r?\n/);
        const size = match ? match[0].length : 2;
        flush(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + size);
        boundary = buffer.search(/\r?\n\r?\n/);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) flush(buffer);
  } finally {
    reader.releaseLock();
  }
}
