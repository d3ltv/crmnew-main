/**
 * importProfiles.js — Profils d'import CSV intelligents
 *
 * Un profil = configuration de mapping sauvegardée :
 *   { id, name, headers, colMapping, createdAt, lastUsedAt, useCount }
 *
 * Matching automatique : quand un nouveau CSV est chargé, on calcule un score
 * de similarité avec chaque profil enregistré. Score = % de colonnes reconnues.
 * Seuil : ≥60% → profil proposé. ≥90% → profil appliqué automatiquement.
 *
 * Évolution de fichier : si un profil est à 60-89%, on applique les colonnes
 * connues et on laisse les nouvelles colonnes en "Extra" pour complétion.
 */

const STORAGE_KEY = "crm_import_profiles_v1";

// Seuils de confiance
export const THRESHOLD_AUTO   = 0.90; // ≥90% → application automatique
export const THRESHOLD_SUGGEST = 0.60; // ≥60% → suggestion à l'utilisateur

// ── CRUD ──────────────────────────────────────────────────────────────────────

/** Charge tous les profils depuis localStorage */
export function loadProfiles() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/** Persiste la liste complète */
function saveProfiles(profiles) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
    } catch (err) {
        console.error("[ImportProfiles] Sauvegarde impossible :", err);
    }
}

/**
 * Crée ou met à jour un profil.
 * Si id est fourni et existe → mise à jour. Sinon → création.
 * @param {{ id?: string, name: string, headers: string[], colMapping: object }} data
 * @returns {object} le profil créé/mis à jour
 */
export function saveProfile({ id, name, headers, colMapping }) {
    const profiles = loadProfiles();
    const now = new Date().toISOString();
    const uid = id || `prof_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

    const existing = profiles.findIndex((p) => p.id === uid);
    const profile = {
        id: uid,
        name: (name || "Profil sans nom").trim(),
        headers: headers.filter(Boolean),
        colMapping,
        createdAt: existing >= 0 ? profiles[existing].createdAt : now,
        lastUsedAt: now,
        useCount: existing >= 0 ? (profiles[existing].useCount || 0) : 0,
    };

    if (existing >= 0) {
        profiles[existing] = profile;
    } else {
        profiles.push(profile);
    }
    saveProfiles(profiles);
    return profile;
}

/** Renomme un profil existant */
export function renameProfile(id, newName) {
    const profiles = loadProfiles();
    const idx = profiles.findIndex((p) => p.id === id);
    if (idx < 0) return;
    profiles[idx] = { ...profiles[idx], name: newName.trim() };
    saveProfiles(profiles);
}

/** Supprime un profil */
export function deleteProfile(id) {
    saveProfiles(loadProfiles().filter((p) => p.id !== id));
}

/** Marque un profil comme utilisé (incrémente useCount + lastUsedAt) */
export function touchProfile(id) {
    const profiles = loadProfiles();
    const idx = profiles.findIndex((p) => p.id === id);
    if (idx < 0) return;
    profiles[idx] = {
        ...profiles[idx],
        lastUsedAt: new Date().toISOString(),
        useCount: (profiles[idx].useCount || 0) + 1,
    };
    saveProfiles(profiles);
}

// ── Matching ──────────────────────────────────────────────────────────────────

/**
 * Normalise un nom de colonne pour la comparaison :
 * minuscules, sans accents, underscores/tirets → espaces.
 */
function normCol(str) {
    return (str || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[_\-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Calcule le score de similarité entre un ensemble de headers CSV
 * et un profil enregistré.
 *
 * Score = (colonnes reconnues) / (max des deux ensembles)
 * Une colonne est "reconnue" si son nom normalisé est présent dans le profil.
 *
 * @param {string[]} headers — colonnes du CSV entrant
 * @param {object}   profile — profil enregistré
 * @returns {{ score: number, matchedHeaders: string[], newHeaders: string[] }}
 */
export function scoreProfile(headers, profile) {
    const incoming  = headers.filter(Boolean).map(normCol);
    const reference = (profile.headers || []).filter(Boolean).map(normCol);

    const matched = incoming.filter((h) => reference.includes(h));
    const maxLen  = Math.max(incoming.length, reference.length, 1);
    const score   = matched.length / maxLen;

    // Headers du CSV qui ne sont pas dans le profil → à compléter
    const newHeaders = headers.filter((h) => h && !reference.includes(normCol(h)));

    return { score, matchedHeaders: matched, newHeaders };
}

/**
 * Trouve le meilleur profil correspondant à un ensemble de headers CSV.
 *
 * @param {string[]} headers
 * @returns {{
 *   profile: object|null,
 *   score: number,
 *   matchedHeaders: string[],
 *   newHeaders: string[],
 *   isAuto: boolean,   — true si score ≥ THRESHOLD_AUTO
 *   isSuggested: boolean — true si score ≥ THRESHOLD_SUGGEST
 * } | null}
 */
export function findBestProfile(headers) {
    const profiles = loadProfiles();
    if (!profiles.length || !headers.length) return null;

    let best = null;
    let bestScore = 0;

    for (const profile of profiles) {
        const { score, matchedHeaders, newHeaders } = scoreProfile(headers, profile);
        if (score > bestScore) {
            bestScore = score;
            best = { profile, score, matchedHeaders, newHeaders };
        }
    }

    if (!best || bestScore < THRESHOLD_SUGGEST) return null;

    return {
        ...best,
        isAuto:       bestScore >= THRESHOLD_AUTO,
        isSuggested:  bestScore >= THRESHOLD_SUGGEST,
    };
}

/**
 * Applique un profil sur un ensemble de headers CSV entrants.
 * - Les colonnes reconnues reçoivent le mapping du profil
 * - Les nouvelles colonnes (absentes du profil) reçoivent EXTRA par défaut
 *
 * @param {string[]} headers
 * @param {object}   profile
 * @returns {object} colMapping résultant { header → target }
 */
export function applyProfile(headers, profile) {
    const result = {};
    const refMapping = profile.colMapping || {};

    headers.forEach((h) => {
        if (!h) return;
        const hn = normCol(h);
        // Chercher dans le mapping du profil par nom normalisé
        const matchKey = Object.keys(refMapping).find((k) => normCol(k) === hn);
        result[h] = matchKey ? refMapping[matchKey] : "__extra__";
    });

    return result;
}

// ── Helpers UI ────────────────────────────────────────────────────────────────

/** Formate une date ISO en texte lisible court */
export function formatProfileDate(iso) {
    if (!iso) return "—";
    const d   = new Date(iso);
    const now = new Date();
    const diffMs  = now - d;
    const diffMin = Math.floor(diffMs / 60_000);
    const diffH   = Math.floor(diffMs / 3_600_000);
    const diffD   = Math.floor(diffMs / 86_400_000);

    if (diffMin < 1)   return "à l'instant";
    if (diffMin < 60)  return `il y a ${diffMin} min`;
    if (diffH   < 24)  return `il y a ${diffH}h`;
    if (diffD   === 1) return "hier";
    if (diffD   < 7)   return `il y a ${diffD} j`;
    if (diffD   < 30)  return `il y a ${Math.floor(diffD / 7)} sem.`;
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

/** Labels lisibles pour les valeurs de mapping */
const CRM_FIELD_LABELS = {
    company: "Entreprise", contact: "Contact", phone: "Téléphone",
    email: "Email", website: "Site web",
    "__extra__": "Extra", "__none__": "Ignoré",
};

export function mappingLabel(target) {
    return CRM_FIELD_LABELS[target] || target;
}
