import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api } from "../api/client";
import ThemeToggle from "../components/ThemeToggle";
import { useAuth } from "../hooks/useAuth";

const field =
    "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900";

export default function LoginPage() {
    const { login, register } = useAuth();
    const config = useQuery({ queryKey: ["auth-config"], queryFn: () => api<{ allow_signup: boolean }>("/auth/config") });
    const canRegister = config.data?.allow_signup === true;

    const [mode, setMode] = useState<"login" | "register">("login");
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            if (mode === "login") await login(email, password);
            else await register(email, password, name.trim());
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erreur inconnue");
            setBusy(false);
        }
    };

    const isRegister = mode === "register";

    return (
        <div className="relative grid min-h-dvh place-items-center bg-zinc-50 px-4 dark:bg-zinc-950">
            <div className="absolute right-3 top-3"><ThemeToggle /></div>
            <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
                <div className="mb-5 flex items-center gap-2">
                    <img src="/favicon.svg" alt="" className="h-6 w-6" />
                    <h1 className="text-lg font-semibold tracking-tight">{isRegister ? "Créer un compte" : "Connexion"}</h1>
                </div>

                <form onSubmit={(e) => void submit(e)} className="space-y-3">
                    {isRegister && (
                        <div>
                            <label htmlFor="name" className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Nom (facultatif)</label>
                            <input id="name" className={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoComplete="name" />
                        </div>
                    )}
                    <div>
                        <label htmlFor="email" className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Email</label>
                        <input id="email" type="email" required autoFocus className={field} value={email}
                            onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                    </div>
                    <div>
                        <label htmlFor="password" className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Mot de passe</label>
                        <input id="password" type="password" required minLength={isRegister ? 10 : 1} className={field} value={password}
                            onChange={(e) => setPassword(e.target.value)} autoComplete={isRegister ? "new-password" : "current-password"} />
                        {isRegister && <p className="mt-1 text-xs text-zinc-500">10 caractères minimum.</p>}
                    </div>

                    {error && (
                        <p role="alert" className="rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>
                    )}

                    <button type="submit" disabled={busy}
                        className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60">
                        {busy ? "Patientez…" : isRegister ? "Créer le compte" : "Se connecter"}
                    </button>
                </form>

                {canRegister && (
                    <p className="mt-4 text-center text-xs text-zinc-500">
                        {isRegister ? "Déjà un compte ?" : "Pas encore de compte ?"}{" "}
                        <button type="button" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                            onClick={() => { setMode(isRegister ? "login" : "register"); setError(null); }}>
                            {isRegister ? "Se connecter" : "Créer un compte"}
                        </button>
                    </p>
                )}
            </div>
        </div>
    );
}