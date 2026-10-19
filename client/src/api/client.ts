export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const NETWORK_ERROR = "Impossible de joindre le serveur. Vérifiez qu'il est lancé (npm run dev).";

// Wrapper fetch : lève une ApiError avec le message JSON renvoyé par l'API (status 0 = serveur injoignable).
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { headers: { "Content-Type": "application/json" }, ...init });
  } catch {
    throw new ApiError(0, NETWORK_ERROR);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new ApiError(res.status, body?.error?.message ?? `Erreur ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const isNotFound = (err: unknown) => err instanceof ApiError && err.status === 404;
