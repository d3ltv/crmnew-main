// Small date/time helpers — French, concise, no external lib.

/**
 * Clé calendaire locale YYYY-MM-DD (évite le décalage UTC de toISOString().slice).
 * @param {Date | string | number | null | undefined} value
 * @returns {string}
 */
export function toLocalDateKey(value) {
    if (value == null || value === "") return "";
    // Déjà une clé date pure
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

export function formatShortDateTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${day}/${month} ${hh}:${mm}`;
}

export function formatRelative(iso) {
    if (!iso) return "";
    const now = new Date();
    const d = new Date(iso);
    const diffMs = now - d;
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return "à l'instant";
    if (min < 60) return `il y a ${min} min`;
    const hours = Math.floor(min / 60);
    if (hours < 24) return `il y a ${hours} h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `il y a ${days} j`;
    return d.toLocaleDateString("fr-FR");
}

/**
 * Décale samedi → lundi et dimanche → lundi (relances en semaine uniquement).
 * @param {Date} date
 * @returns {Date}
 */
export function ensureWeekday(date) {
    const d = date instanceof Date ? new Date(date.getTime()) : new Date(date);
    if (Number.isNaN(d.getTime())) return d;
    const wd = d.getDay();
    if (wd === 6) d.setDate(d.getDate() + 2);
    else if (wd === 0) d.setDate(d.getDate() + 1);
    return d;
}

/**
 * Ajoute N jours calendaires, puis décale samedi → lundi et dimanche → lundi.
 * (Les relances commerciales se font rarement le week-end.)
 * @param {number} days
 * @param {Date} [from]
 * @returns {Date}
 */
export function addDaysSkippingWeekend(days, from = new Date()) {
    const n = Math.max(0, Math.floor(Number(days) || 0));
    const d = new Date(from);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + n);
    return ensureWeekday(d);
}

/** @param {number} days @param {Date} [from] @returns {string} ISO */
export function addDaysSkippingWeekendIso(days, from = new Date()) {
    return addDaysSkippingWeekend(days, from).toISOString();
}

/**
 * Libellé relatif futur FR : « demain », « dans 2 jours »…
 * @param {Date | string | number} isoOrDate
 * @returns {string}
 */
export function formatFutureRelativeFr(isoOrDate) {
    const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
    if (Number.isNaN(d.getTime())) return "";
    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);
    const startTarget = new Date(d);
    startTarget.setHours(0, 0, 0, 0);
    const diffDays = Math.round((startTarget - startToday) / 86400000);
    if (diffDays <= 0) return "aujourd'hui";
    if (diffDays === 1) return "demain";
    return `dans ${diffDays} jours`;
}

/**
 * Plus petit décalage J+n (1–7) qui tombe un jour de semaine donné (0=dim…6=sam).
 * Ignore samedi/dimanche comme cibles (retourne le 1er jour ouvré utile).
 * @param {number} targetDow
 * @param {Date} [from]
 * @returns {number}
 */
export function daysUntilWeekday(targetDow, from = new Date()) {
    const target = Number(targetDow);
    if (!Number.isFinite(target) || target < 1 || target > 5) {
        return 2;
    }
    for (let n = 1; n <= 7; n += 1) {
        if (addDaysSkippingWeekend(n, from).getDay() === target) return n;
    }
    return 2;
}

export function formatDateTimeLong(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleString("fr-FR", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    });
}
