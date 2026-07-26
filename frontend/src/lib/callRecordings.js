/**
 * callRecordings.js — Enregistrements d'appel locaux (IndexedDB)
 *
 * - Audio stocké en Blob hors localStorage (pas de plafond 5 Mo)
 * - Lié à un lead via leadId + note.recordingId
 * - Purge auto à 30 jours, sauf si téléchargé (preserved)
 */

const DB_NAME = "crm_call_recordings";
const DB_VERSION = 1;
const STORE_NAME = "recordings";
export const RECORDING_TTL_MS = 30 * 24 * 60 * 60 * 1000;

let _db = null;

function openDb() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
                store.createIndex("leadId", "leadId", { unique: false });
                store.createIndex("createdAt", "createdAt", { unique: false });
            }
        };
        req.onsuccess = (e) => {
            _db = e.target.result;
            resolve(_db);
        };
        req.onerror = (e) => reject(e.target.error);
    });
}

function promisify(req) {
    return new Promise((resolve, reject) => {
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
}

export function pickAudioMimeType() {
    const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
    ];
    if (typeof MediaRecorder === "undefined") return "";
    return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

export function extensionForMime(mime = "") {
    if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) return "m4a";
    if (mime.includes("ogg")) return "ogg";
    return "webm";
}

/**
 * @param {{
 *   id: string,
 *   leadId: string,
 *   workspaceId: string,
 *   blob: Blob,
 *   mimeType?: string,
 *   durationMs?: number,
 *   peaks?: number[],
 * }} rec
 */
export async function saveCallRecording(rec) {
    const db = await openDb();
    const entry = {
        id: rec.id,
        leadId: rec.leadId,
        workspaceId: rec.workspaceId,
        blob: rec.blob,
        mimeType: rec.mimeType || rec.blob.type || "audio/webm",
        durationMs: rec.durationMs || 0,
        size: rec.blob.size || 0,
        peaks: Array.isArray(rec.peaks) ? rec.peaks : [],
        createdAt: new Date().toISOString(),
        preserved: false,
        downloadedAt: null,
    };
    const tx = db.transaction(STORE_NAME, "readwrite");
    await promisify(tx.objectStore(STORE_NAME).put(entry));
    return entry;
}

export async function getCallRecording(id) {
    if (!id) return null;
    try {
        const db = await openDb();
        const tx = db.transaction(STORE_NAME, "readonly");
        return (await promisify(tx.objectStore(STORE_NAME).get(id))) || null;
    } catch {
        return null;
    }
}

export async function listCallRecordingsForLead(leadId) {
    if (!leadId) return [];
    try {
        const db = await openDb();
        const tx = db.transaction(STORE_NAME, "readonly");
        const idx = tx.objectStore(STORE_NAME).index("leadId");
        const all = await promisify(idx.getAll(leadId));
        return (all || []).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    } catch {
        return [];
    }
}

export async function deleteCallRecording(id) {
    if (!id) return;
    try {
        const db = await openDb();
        const tx = db.transaction(STORE_NAME, "readwrite");
        await promisify(tx.objectStore(STORE_NAME).delete(id));
    } catch (err) {
        console.warn("[CallRecordings] delete failed:", err);
    }
}

/** Marque l'enregistrement comme conservé (exempt de la purge 30 j). */
export async function markRecordingPreserved(id) {
    const rec = await getCallRecording(id);
    if (!rec) return null;
    const db = await openDb();
    const updated = {
        ...rec,
        preserved: true,
        downloadedAt: new Date().toISOString(),
    };
    const tx = db.transaction(STORE_NAME, "readwrite");
    await promisify(tx.objectStore(STORE_NAME).put(updated));
    return updated;
}

/**
 * Purge les enregistrements > 30 jours non téléchargés.
 * @returns {Promise<number>} nombre supprimé
 */
export async function purgeExpiredCallRecordings() {
    try {
        const db = await openDb();
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const all = await promisify(store.getAll());
        const cutoff = Date.now() - RECORDING_TTL_MS;
        let removed = 0;
        for (const rec of all || []) {
            if (rec.preserved) continue;
            const ts = Date.parse(rec.createdAt || "");
            if (!Number.isFinite(ts) || ts >= cutoff) continue;
            store.delete(rec.id);
            removed += 1;
        }
        if (removed > 0) {
            console.debug(`[CallRecordings] Purge : ${removed} enregistrement(s) > 30 j`);
        }
        return removed;
    } catch (err) {
        console.warn("[CallRecordings] purge failed:", err);
        return 0;
    }
}

/** Télécharge le fichier et le marque preserved. */
export async function downloadCallRecording(id, filenameBase = "appel") {
    const rec = await getCallRecording(id);
    if (!rec?.blob) throw new Error("Enregistrement introuvable");

    const ext = extensionForMime(rec.mimeType);
    const url = URL.createObjectURL(rec.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filenameBase}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2_000);

    return markRecordingPreserved(id);
}

export function formatDuration(ms = 0) {
    const total = Math.max(0, Math.round(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
}

/** Jours restants avant purge (null si conservé / inconnu). */
export function daysUntilPurge(rec) {
    if (!rec || rec.preserved) return null;
    const ts = Date.parse(rec.createdAt || "");
    if (!Number.isFinite(ts)) return null;
    const left = RECORDING_TTL_MS - (Date.now() - ts);
    return Math.max(0, Math.ceil(left / (24 * 60 * 60 * 1000)));
}
