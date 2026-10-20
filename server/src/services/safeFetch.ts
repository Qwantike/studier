import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { env } from "../config.js";

const TIMEOUT_MS = 20_000;
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const ALLOWED_PORTS = new Set([80, 443]);

/** Erreur dont le message est écrit pour être affiché à l'utilisateur (les autres sont réduites à un message générique). */
export class FetchError extends Error { }

// Adresses qu'un utilisateur ne doit jamais pouvoir faire contacter par le serveur (réseau local, métadonnées cloud…).
const blocked = new net.BlockList();
for (const [addr, prefix] of [
    ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
    ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(addr, prefix, "ipv4");
blocked.addAddress("::", "ipv6");
blocked.addAddress("::1", "ipv6");
// Pas de règle ::ffff:0:0/96 : dans Node elle bloquerait TOUTES les adresses IPv4. Les règles IPv4 ci-dessus
// s'appliquent déjà aux adresses IPv4 mappées en IPv6 (::ffff:10.0.0.1).
for (const [addr, prefix] of [
    ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["64:ff9b::", 96],
] as const) blocked.addSubnet(addr, prefix, "ipv6");

function isBlocked(address: string): boolean {
    if (env.CALENDAR_ALLOW_PRIVATE_URLS) return false;
    const family = net.isIP(address);
    if (family === 0) return true;
    return blocked.check(address, family === 4 ? "ipv4" : "ipv6");
}

// Vérifie l'adresse réellement utilisée pour se connecter (au moment de la connexion : pas de « DNS rebinding »).
function safeLookup(
    hostname: string,
    options: dns.LookupOptions,
    cb: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void,
): void {
    dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
        if (err) return cb(err, "", 0);
        const list = addrs as dns.LookupAddress[];
        if (list.length === 0 || list.some((a) => isBlocked(a.address))) {
            return cb(new FetchError("adresse non autorisée") as NodeJS.ErrnoException, "", 0);
        }
        if (options.all) return cb(null, list);
        const first = list[0]!;
        cb(null, first.address, first.family);
    });
}

function get(url: URL, redirects: number, signal: AbortSignal): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        if (url.protocol !== "http:" && url.protocol !== "https:") return reject(new FetchError("protocole non autorisé"));
        const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
        if (!ALLOWED_PORTS.has(port) && !env.CALENDAR_ALLOW_PRIVATE_URLS) return reject(new FetchError("port non autorisé"));
        // Une adresse IP écrite directement dans l'URL ne passe pas par la résolution DNS : on la vérifie ici.
        const host = url.hostname.replace(/^\[|\]$/g, "");
        if (net.isIP(host) && isBlocked(host)) return reject(new FetchError("adresse non autorisée"));

        const mod = url.protocol === "https:" ? https : http;
        const req = mod.request(url, {
            method: "GET", signal,
            headers: { Accept: "text/calendar, text/plain, */*", "User-Agent": "Studier-Calendar-Sync" },
            lookup: safeLookup as unknown as net.LookupFunction,
        }, (res) => {
            const status = res.statusCode ?? 0;
            if (status >= 300 && status < 400 && res.headers.location) {
                res.resume();
                if (redirects >= MAX_REDIRECTS) return reject(new FetchError("trop de redirections"));
                let next: URL;
                try { next = new URL(res.headers.location, url); } catch { return reject(new FetchError("redirection invalide")); }
                return resolve(get(next, redirects + 1, signal)); // chaque saut repasse par les mêmes vérifications
            }
            if (status < 200 || status >= 300) { res.resume(); return reject(new FetchError(`le serveur a répondu ${status}`)); }

            const chunks: Buffer[] = [];
            let size = 0;
            res.on("data", (c: Buffer) => {
                size += c.length;
                if (size > MAX_BYTES) { req.destroy(new FetchError("calendrier trop volumineux (5 Mo maximum)")); return; }
                chunks.push(c);
            });
            res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
            res.on("error", reject);
        });
        req.on("error", reject);
        req.end();
    });
}

/** GET http(s) protégé contre le SSRF : IP privées refusées, ports 80/443 seulement, redirections revérifiées, taille et durée bornées. */
export function safeFetchText(rawUrl: string): Promise<string> {
    let url: URL;
    try { url = new URL(rawUrl); } catch { return Promise.reject(new FetchError("URL invalide")); }
    return get(url, 0, AbortSignal.timeout(TIMEOUT_MS)); // délai total, redirections comprises
}