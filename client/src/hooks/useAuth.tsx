import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { ApiError, UNAUTHORIZED_EVENT, api } from "../api/client";
import { setStorageScope } from "../lib/persistedStore";

export interface AuthUser { id: string; email: string; display_name: string; created_at: string }
type Status = "loading" | "error" | "anonymous" | "authenticated";

interface AuthContextValue {
    status: Status;
    user: AuthUser | null;
    retry: () => void;
    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string, displayName?: string) => Promise<void>;
    logout: () => Promise<void>;
    /** Met à jour l'utilisateur en mémoire (après modification du profil). */
    setUser: (user: AuthUser) => void;
    /** Efface la session locale (après suppression du compte ou déconnexion de tous les appareils). */
    endSession: () => void;
}

const ME_KEY = ["me"] as const;
const AuthContext = createContext<AuthContextValue | null>(null);

// Retire du cache tout ce qui dépend d'un utilisateur (arbre, chapitres, évaluations…), sauf l'identité.
const dropUserData = (qc: QueryClient) => qc.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] });

async function fetchMe(): Promise<AuthUser | null> {
    try { return await api<AuthUser>("/auth/me"); } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err; // serveur injoignable : on propose de réessayer plutôt que d'afficher la connexion
    }
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const qc = useQueryClient();
    const me = useQuery({ queryKey: ME_KEY, queryFn: fetchMe, staleTime: Infinity, retry: false });
    const user = me.data ?? null;

    // Les stores d'interface sont propres à l'utilisateur ; réglé avant le rendu des écrans connectés.
    setStorageScope(user?.id ?? "");

    const endSession = useCallback(() => {
        qc.setQueryData(ME_KEY, null);
        dropUserData(qc);
    }, [qc]);

    // Session perdue (refresh refusé, autre onglet déconnecté…) : retour à la page de connexion.
    useEffect(() => {
        window.addEventListener(UNAUTHORIZED_EVENT, endSession);
        return () => window.removeEventListener(UNAUTHORIZED_EVENT, endSession);
    }, [endSession]);

    const login = useCallback(async (email: string, password: string) => {
        const u = await api<AuthUser>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
        dropUserData(qc);
        qc.setQueryData(ME_KEY, u);
    }, [qc]);

    const register = useCallback(async (email: string, password: string, displayName?: string) => {
        const u = await api<AuthUser>("/auth/register", {
            method: "POST", body: JSON.stringify({ email, password, display_name: displayName || undefined }),
        });
        dropUserData(qc);
        qc.setQueryData(ME_KEY, u);
    }, [qc]);

    const logout = useCallback(async () => {
        // L'interface repasse d'abord en « déconnecté » : le chapitre ouvert envoie sa dernière sauvegarde au démontage,
        // pendant que la requête de déconnexion est encore en vol.
        qc.setQueryData(ME_KEY, null);
        await api("/auth/logout", { method: "POST" }).catch(() => undefined);
        dropUserData(qc);
    }, [qc]);

    const setUser = useCallback((u: AuthUser) => { qc.setQueryData(ME_KEY, u); }, [qc]);

    const value = useMemo<AuthContextValue>(() => ({
        status: me.isPending ? "loading" : me.isError ? "error" : user ? "authenticated" : "anonymous",
        user, retry: () => void me.refetch(), login, register, logout, setUser, endSession,
    }), [me.isPending, me.isError, me.refetch, user, login, register, logout, setUser, endSession]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth doit être utilisé dans <AuthProvider>");
    return ctx;
}