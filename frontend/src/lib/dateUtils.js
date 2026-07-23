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
    return formatShortDateTime(iso);
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
