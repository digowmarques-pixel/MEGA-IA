"use client";

export class ApiError extends Error {
  constructor(public status: number, message: string, public data?: unknown) {
    super(message);
  }
}

export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: json !== undefined ? { "Content-Type": "application/json", ...(rest.headers || {}) } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("json") ? await res.json() : await res.text();
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !url.includes("/auth/")) window.location.href = "/login";
    const msg = (data && typeof data === "object" && "error" in data && (data as { error?: string }).error) || `Erro ${res.status}`;
    throw new ApiError(res.status, String(msg), data);
  }
  return data as T;
}

export const fmtCredits = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: 2, minimumFractionDigits: n % 1 ? 2 : 0 });
export const fmtUsd = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: n < 1 && n > 0 ? 3 : 2 });
export const fmtBrl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const fmtDate = (s: string) => new Date(s.replace(" ", "T") + (s.includes("Z") ? "" : "Z")).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

/** Upload com progresso real (XHR) — usado no arrastar-e-soltar. */
export function uploadFiles(files: File[], target: { projectId?: number | null; scenarioId?: number | null; sceneId?: number | null }, onProgress?: (pct: number) => void) {
  return new Promise<{ assets: import("./assets").AssetView[]; rejected: { name: string; reason: string }[] }>((resolve, reject) => {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    if (target.projectId) form.append("projectId", String(target.projectId));
    if (target.scenarioId) form.append("scenarioId", String(target.scenarioId));
    if (target.sceneId) form.append("sceneId", String(target.sceneId));
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/uploads");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 400) reject(new ApiError(xhr.status, data.error || "Falha no upload"));
        else resolve(data);
      } catch {
        reject(new ApiError(xhr.status, "Falha no upload"));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, "Falha de rede no upload"));
    xhr.send(form);
  });
}

/** Baixa um ZIP pelo endpoint de download em lote. */
export async function downloadZip(body: Record<string, unknown>) {
  const res = await fetch("/api/download", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new ApiError(res.status, j.error || "Falha no download");
  }
  const blob = await res.blob();
  const name = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] || "download.zip";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return Number(res.headers.get("X-File-Errors") || 0);
}

/** Tipo MIME usado para arrastar assets do Hub entre painéis. */
export const ASSET_MIME = "application/x-mega-asset";
export function readDraggedAssets(e: React.DragEvent): number[] {
  const raw = e.dataTransfer.getData(ASSET_MIME);
  if (!raw) return [];
  try {
    return (JSON.parse(raw) as number[]).filter(Number.isFinite);
  } catch {
    return [];
  }
}
export const isFileDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
export const isAssetDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes(ASSET_MIME);
