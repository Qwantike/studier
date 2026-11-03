import { apiResponse } from "../api/client";

/** Même renouvellement de session et mêmes erreurs que les appels JSON. */
export async function downloadExport(path: string, body?: unknown): Promise<void> {
  const response = await apiResponse(path, body === undefined ? undefined : { method: "POST", body: JSON.stringify(body) });
  const blob = await response.blob();
  const filename = /filename="([a-zA-Z0-9_.-]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "studier-export.zip";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
