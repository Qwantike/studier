import { pool } from "./pool.js";
import { LEGACY_USER_ID, hashPassword } from "../services/auth.js";

// Rattache les données existantes (user_id = 00000000-...-0001) à un vrai compte.
// Usage (depuis server/) : npm run user:claim -- email@exemple.fr "mot de passe" "Nom affiché"
async function main(): Promise<void> {
    const [rawEmail, password, name] = process.argv.slice(2);
    const email = rawEmail?.trim().toLowerCase();
    if (!email || !/^\S+@\S+\.\S+$/.test(email) || !password || password.length < 10) {
        throw new Error('Usage : npm run user:claim -- email "mot de passe (10 caractères min.)" ["Nom"]');
    }
    const { rowCount } = await pool.query(
        `UPDATE users SET email = $1, password_hash = $2, display_name = $3
     WHERE id = $4 AND password_hash IS NULL`,
        [email, await hashPassword(password), name ?? "", LEGACY_USER_ID]);
    if (!rowCount) throw new Error("Le compte hérité a déjà été réclamé (ou n'existe pas).");
    console.log(`✔ Données existantes rattachées à ${email}`);
}

main().catch((err) => { console.error((err as Error).message); process.exitCode = 1; }).finally(() => pool.end());