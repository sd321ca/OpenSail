/** Small fetch wrapper for the OpenSail JSON/SSE API. */

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function errorMessage(response) {
  try {
    const data = await response.json();
    if (data && typeof data.detail === "string") return data.detail;
    if (data && data.detail) return JSON.stringify(data.detail);
  } catch (_error) {
    // Fall through to the status text.
  }
  return response.statusText || `Request failed (${response.status})`;
}

export async function api(path, options = {}) {
  const { method = "GET", body, signal, headers = {} } = options;
  const init = { method, signal, headers: { ...headers } };
  if (body !== undefined) {
    if (body instanceof FormData) {
      init.body = body;
    } else {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
  }
  const response = await fetch(path, init);
  if (!response.ok) {
    throw new ApiError(await errorMessage(response), response.status);
  }
  if (response.status === 204) return null;
  const type = response.headers.get("content-type") || "";
  if (!type.includes("application/json")) return response.text();
  return response.json();
}

export async function uploadFile(file) {
  const form = new FormData();
  form.append("file", file, file.name || "upload");
  const response = await fetch("/api/uploads", { method: "POST", body: form });
  if (!response.ok) {
    throw new ApiError(await errorMessage(response), response.status);
  }
  return response.json();
}

/**
 * POST a JSON body and consume a server-sent-event stream.
 * `onEvent(event)` is called for every parsed event object.
 */
export async function stream(path, body, onEvent, signal) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    throw new ApiError(await errorMessage(response), response.status);
  }
  if (!response.body) throw new ApiError("The server returned an empty stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const flush = (chunk) => {
    for (const block of chunk.split(/\r?\n\r?\n/)) {
      if (!block.trim()) continue;
      const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (!data) continue;
      try {
        onEvent(JSON.parse(data));
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
