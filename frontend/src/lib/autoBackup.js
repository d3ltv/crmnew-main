/**
 * autoBackup.js — Sauvegardes automatiques silencieuses dans IndexedDB
 *
 * - Sauvegarde toutes les 5 minutes si des données existent
 * - Garde les 10 derniers snapshots horodatés (rotation automatique)
 * - N'utilise PAS localStorage (pas de quota de 5MB, pas de blocage du thread)
 * - Silencieux : aucun toast, aucun log visible — tout passe en console.debug
 * - Expose getLatestBackup() pour la récupération après crash
 */

const DB_NAME    = "crm_backups";
const DB_VERSION = 1;
const STORE_NAME = "snapshots";
const MAX_BACKUPS = 10;
const BACKUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let _db = null;

/** Ouvre (ou crée) la base IndexedDB — retourne une promesse résolue avec l'instance. */
function openDb() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                // Clé = timestamp (ms) — permet de trier chronologiquement
                db.createObjectStore(STORE_NAME, { keyPath: "ts" });
            }
        };
        req.onsuccess  = (e) => { _db = e.target.result; resolve(_db); };
        req.onerror    = (e) => reject(e.target.error);
    });
}

/** Wraps une IDBRequest dans une Promise. */
function promisify(req) {
    return new Promise((resolve, reject) => {
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror   = (e) => reject(e.target.error);
    });
}

/**
 * Sauvegarde un snapshot de l'état CRM dans IndexedDB.
 * Rotation automatique : supprime les snapshots au-delà de MAX_BACKUPS.
 * @param {object} state — l'état complet du CRM (sans lastDeleted)
 */
export async function saveBackup(state) {
    try {
        const db = await openDb();
        const { lastDeleted: _ld, ...persistent } = state;

        // Sérialiser ici pour mesurer la taille et détecter les erreurs tôt
        const serialized = JSON.stringify(persistent);
        const ts = Date.now();

        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);

        // Écrire le nouveau snapshot
        await promisify(store.put({ ts, data: serialized, size: serialized.length }));

        // Récupérer toutes les clés pour appliquer la rotation
        const allKeys = await promisify(store.getAllKeys());
        allKeys.sort((a, b) => a - b); // ordre chronologique

        // Supprimer les plus anciens si on dépasse MAX_BACKUPS
        const toDelete = allKeys.slice(0, Math.max(0, allKeys.length - MAX_BACKUPS));
        for (const key of toDelete) {
            store.delete(key);
        }

        console.debug(
            `[Backup] Snapshot sauvegardé — ${(serialized.length / 1024).toFixed(0)} KB ` +
            `· ${allKeys.length - toDelete.length + 1} backup(s) conservé(s)`
        );
    } catch (err) {
        // Silencieux — on ne perturbe pas l'utilisateur pour un backup raté
        console.warn("[Backup] Échec silencieux :", err);
    }
}

/**
 * Récupère tous les snapshots disponibles, du plus récent au plus ancien.
 * @returns {Promise<Array<{ ts: number, size: number, data: string }>>}
 */
export async function getAllBackups() {
    try {
        const db = await openDb();
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const all = await promisify(store.getAll());
        return all.sort((a, b) => b.ts - a.ts); // plus récent en premier
    } catch {
        return [];
    }
}

/**
 * Récupère uniquement le backup le plus récent.
 * @returns {Promise<{ ts: number, size: number, data: string } | null>}
 */
export async function getLatestBackup() {
    const all = await getAllBackups();
    return all[0] || null;
}

/**
 * Parse un snapshot sauvegardé et retourne l'état CRM.
 * @param {{ data: string }} snapshot
 * @returns {object | null}
 */
export function parseBackup(snapshot) {
    try {
        const parsed = JSON.parse(snapshot.data);
        if (!parsed || typeof parsed !== "object" || !parsed.workspaces) return null;
        return parsed;
    } catch {
        return null;
    }
}

/**
 * Formate un timestamp en texte lisible.
 * @param {number} ts
 */
export function formatBackupDate(ts) {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60_000);
    const diffH = Math.floor(diffMs / 3_600_000);

    if (diffMin < 1)  return "il y a moins d'une minute";
    if (diffMin < 60) return `il y a ${diffMin} min`;
    if (diffH < 24)   return `il y a ${diffH}h`;

    return d.toLocaleDateString("fr-FR", {
        day: "numeric", month: "long",
        hour: "2-digit", minute: "2-digit",
    });
}

// ── Timer interne — démarré une seule fois ───────────────────────────────────
let _timer = null;
let _getState = null; // fonction qui retourne l'état courant

/**
 * Démarre le backup automatique en arrière-plan.
 * @param {() => object} getStateFn — callback qui retourne l'état CRM courant
 */
export function startAutoBackup(getStateFn) {
    if (_timer) return; // déjà démarré
    _getState = getStateFn;

    // Premier backup immédiat (au démarrage de l'app, après le chargement)
    setTimeout(() => {
        const s = _getState?.();
        if (s && Object.keys(s.workspaces || {}).length > 0) saveBackup(s);
    }, 10_000); // 10s après le démarrage — laisse l'app s'initialiser

    _timer = setInterval(() => {
        const s = _getState?.();
        if (s && Object.keys(s.workspaces || {}).length > 0) {
            saveBackup(s);
        }
    }, BACKUP_INTERVAL_MS);
}

/** Arrête le backup automatique (cleanup à l'unmount). */
export function stopAutoBackup() {
    if (_timer) {
        clearInterval(_timer);
        _timer = null;
    }
    _getState = null;
}
