/**
 * columnPatterns.js — Source unique de vérité pour la détection des types de colonnes
 *
 * Ces patterns sont utilisés partout dans l'application (contexte, composants, stats)
 * pour identifier le rôle d'une colonne par son nom.
 *
 * Règle : toute modification de ces patterns se fait ICI uniquement.
 * Ne pas redéfinir ces listes dans d'autres fichiers.
 */

// ── Colonnes "Nouveau" — prospects entrants, pas encore contactés ─────────────
export const NOUVEAU_PATTERNS = [
    "nouveau",
    "new",
    "prospect",
    "entrant",
    "candidature",
];

// ── Colonnes "Contacté" — lead contacté, en attente de réponse ───────────────
export const CONTACTED_PATTERNS = [
    "contact",
    "appel",
    "relance",
    "call",
];

// ── Colonnes "Rendez-vous" — RDV planifié ────────────────────────────────────
export const MEETING_PATTERNS = [
    "rendez-vous",
    "rendez vous",
    "rdv",
    "meeting",
    "appointment",
];

// ── Colonnes "Gagné" — deal signé / offre acceptée ───────────────────────────
export const WON_PATTERNS = [
    "gagné",
    "gagne",
    "won",
    "signé",
    "signe",
    "closed won",
    "accepté",
    "accepte",
];

// ── Colonnes "Perdu" — deal perdu / candidature refusée ──────────────────────
export const LOST_PATTERNS = [
    "perdu",
    "lost",
    "closed lost",
    "abandon",
    "refusé",
    "refuse",
];

// ── Helpers — retournent true/false pour un nom de colonne donné ─────────────

/** @param {string} name */
export function isNouveauColumn(name = "") {
    const n = name.toLowerCase().trim();
    return NOUVEAU_PATTERNS.some((p) => n.includes(p));
}

/** @param {string} name */
export function isContactedColumn(name = "") {
    const n = name.toLowerCase().trim();
    return CONTACTED_PATTERNS.some((p) => n.includes(p));
}

/** @param {string} name */
export function isMeetingColumn(name = "") {
    const n = name.toLowerCase().trim();
    return MEETING_PATTERNS.some((p) => n.includes(p));
}

/** @param {string} name */
export function isWonColumn(name = "") {
    const n = name.toLowerCase().trim();
    return WON_PATTERNS.some((p) => n.includes(p));
}

/** @param {string} name */
export function isLostColumn(name = "") {
    const n = name.toLowerCase().trim();
    return LOST_PATTERNS.some((p) => n.includes(p));
}

/**
 * Accepte un objet colonne { name: string } ou null/undefined.
 * Même signature que les fonctions locales des composants.
 * @param {{ name: string } | null | undefined} col
 */
export function isWonCol(col) {
    if (!col) return false;
    return isWonColumn(col.name);
}

export function isNouveauCol(col) {
    if (!col) return false;
    return isNouveauColumn(col.name);
}

export function isContactedCol(col) {
    if (!col) return false;
    return isContactedColumn(col.name);
}

export function isMeetingCol(col) {
    if (!col) return false;
    return isMeetingColumn(col.name);
}

export function isLostCol(col) {
    if (!col) return false;
    return isLostColumn(col.name);
}
