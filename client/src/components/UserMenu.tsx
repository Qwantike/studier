import { LogOut } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

// Pied de la barre latérale : accès au profil et déconnexion.
export default function UserMenu() {
    const { user, logout } = useAuth();
    if (!user) return null;
    const name = user.display_name || user.email;
    return (
        <div className="flex items-center gap-1 border-t border-zinc-200 px-3 py-2 dark:border-zinc-800">
            <NavLink
                to="/profil" title="Profil"
                className={({ isActive }) =>
                    `flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 ${isActive ? "font-medium text-indigo-600 dark:text-indigo-400" : "text-zinc-600 dark:text-zinc-300"}`}
            >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-indigo-100 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                    {name[0]?.toUpperCase()}
                </span>
                <span className="truncate text-sm">{name}</span>
            </NavLink>
            <button
                onClick={() => void logout()} title="Se déconnecter" aria-label="Se déconnecter"
                className="rounded p-1.5 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
            ><LogOut size={16} /></button>
        </div>
    );
}