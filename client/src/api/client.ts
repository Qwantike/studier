export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const NETWORK_ERROR = "Impossible de joindre le serveur. Vérifiez qu'il est lancé (npm run dev).";

/** Émis quand la session est définitivement perdue (refresh refusé) : l'interface revient à la page de connexion. */
export const UNAUTHORIZED_EVENT = "etudes:unauthorized";

// Ces routes renvoient 401 « normalement » (mauvais mot de passe, plus de session) : pas de tentative de refresh.
const NO_REFRESH = ["/auth/login", "/auth/register", "/auth/refresh", "/auth/logout"];

async function send(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`/api${path}`, { headers: { "Content-Type": "application/json" }, ...init });
  } catch {
    throw new ApiError(0, NETWORK_ERROR);
  }
}

type Refresh = "ok" | "denied" | "offline";
let refreshing: Promise<Refresh> | null = null;

// Un seul rafraîchissement à la fois, même si plusieurs requêtes reçoivent un 401 en même temps.
const refresh = (): Promise<Refresh> =>
(refreshing ??= fetch("/api/auth/refresh", { method: "POST" })
  .then((r): Refresh => (r.ok ? "ok" : r.status === 401 ? "denied" : "offline"), (): Refresh => "offline")
  .finally(() => { refreshing = null; }));

// Wrapper fetch : lève une ApiError avec le message JSON renvoyé par l'API (status 0 = serveur injoignable).
// Sur un 401 (JWT d'accès expiré), renouvelle la session une fois puis rejoue la requête.
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res = await send(path, init);
  if (res.status === 401 && !NO_REFRESH.includes(path)) {
    const outcome = await refresh();
    if (outcome === "ok") res = await send(path, init);
    if (res.status === 401 && outcome !== "offline") window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new ApiError(res.status, body?.error?.message ?? `Erreur ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const isNotFound = (err: unknown) => err instanceof ApiError && err.status === 404;