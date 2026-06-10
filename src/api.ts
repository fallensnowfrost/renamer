import type { RenamerApi } from "./types";

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }
  return payload;
}

export function getRenamerApi(): RenamerApi {
  if (window.renamerApi) return window.renamerApi;
  return {
    selectFolder: () => post<string | null>("/api/selectFolder", {}),
    scan: (options) => post("/api/scan", options),
    apply: (payload) => post("/api/apply", payload),
    undo: () => post("/api/undo", {}),
    exportLog: (payload) => post("/api/exportLog", payload),
  };
}
