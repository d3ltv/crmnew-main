/**
 * noteParser.js — Détection automatique d'informations dans le texte d'une note
 *
 * Détecte (sans jamais modifier la note) :
 *   - Numéros de téléphone français (02–09, +33, 06/07 mobile…)
 *   - Adresses e-mail
 *   - Adresses postales françaises (code postal + ville)
 *   - Rendez-vous / rappels avec date et heure (absolu et relatif)
 *
 * Règles :
 *   - Ne jamais écraser un champ existant non vide → retourne uniquement
 *     les infos "nouvelles" que le lead ne possède pas déjà
 *   - Peut retourner plusieurs téléphones (stockés en customFields)
 *   - Les notes ne sont JAMAIS modifiées
 */

// ── Téléphone français ────────────────────────────────────────────────────────
// Accepte :
//   0[2-9] XX XX XX XX  (format national)
//   +33 X XX XX XX XX   (format international)
//   Avec ou sans espaces / tirets / points entre les groupes
const PHONE_RE = /(?:(?:\+33\s?|0)(?:[2-9])(?:[\s.\-]?\d{2}){4})/g;

/**
 * Normalise un numéro de téléphone brut en format lisible "0X XX XX XX XX".
 * Préserve le +33 si présent.
 */
function normalizePhone(raw) {
    const digits = raw.replace(/[\s.\-]/g, "");
    if (digits.startsWith("+33")) {
        const local = "0" + digits.slice(3);
        return local.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
    }
    return digits.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
}

// ── E-mail ────────────────────────────────────────────────────────────────────
const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

// ── Adresse postale française ─────────────────────────────────────────────────
// Détecte : numéro + rue + code postal + ville
// Ex : "12 rue de la Paix 75001 Paris", "3 avenue Victor Hugo, 69002 Lyon"
const ADDRESS_RE =
    /\d{1,4}[\s,]+(?:rue|avenue|av\.?|boulevard|bd\.?|impasse|allée|chemin|place|résidence|villa|route)\s+[^,\n]{3,40}[\s,]+\d{5}\s+[A-ZÀ-Ÿa-zà-ÿ\s\-]{2,30}/gi;

// Fallback : juste code postal + ville (moins précis mais courant dans les notes)
const ZIPCODE_CITY_RE = /\b(\d{5})\s+([A-ZÀ-Ÿ][A-ZÀ-Ÿa-zà-ÿ\s\-]{2,25})\b/g;

/**
 * Parse une note et retourne les infos détectées.
 *
 * @param {string} text  — le texte de la note
 * @returns {{
 *   phones: string[],
 *   emails: string[],
 *   addresses: string[],
 * }}
 */
export function parseNote(text) {
    if (!text || !text.trim()) return { phones: [], emails: [], addresses: [] };

    // Téléphones
    const rawPhones = text.match(PHONE_RE) || [];
    const phones = [...new Set(rawPhones.map(normalizePhone))];

    // Emails
    const emails = [...new Set(text.match(EMAIL_RE) || [])];

    // Adresses — essayer le pattern complet d'abord
    let addresses = [...new Set(
        (text.match(ADDRESS_RE) || []).map((a) => a.replace(/\s+/g, " ").trim())
    )];

    // Si rien trouvé, fallback code postal + ville
    if (addresses.length === 0) {
        const matches = [];
        let m;
        const re = new RegExp(ZIPCODE_CITY_RE.source, ZIPCODE_CITY_RE.flags);
        while ((m = re.exec(text)) !== null) {
            matches.push(`${m[1]} ${m[2].trim()}`);
        }
        addresses = [...new Set(matches)];
    }

    return { phones, emails, addresses };
}

/**
 * Compare les infos détectées avec les données existantes du lead,
 * et retourne uniquement les infos "nouvelles" (non présentes dans le lead).
 *
 * @param {{ phones, emails, addresses }} detected
 * @param {object} lead — le lead actuel
 * @returns {{
 *   newPhone: string | null,        — à mettre dans lead.phone si vide
 *   extraPhones: string[],          — téléphones supplémentaires → customFields
 *   newEmail: string | null,        — à mettre dans lead.email si vide
 *   newAddress: string | null,      — adresse → customField "Adresse"
 * }}
 */
export function diffWithLead(detected, lead) {
    const { phones, emails, addresses } = detected;

    // ── Téléphones ─────────────────────────────────────────────────────────────
    const existingPhones = new Set();
    if (lead.phone) existingPhones.add(normalizePhone(lead.phone));
    // Aussi vérifier les customFields qui contiennent un téléphone
    (lead.customFields || []).forEach((cf) => {
        if (cf.value && PHONE_RE.test(cf.value)) existingPhones.add(normalizePhone(cf.value));
    });
    // Reset lastIndex du regex global
    PHONE_RE.lastIndex = 0;

    const newPhones = phones.filter((p) => !existingPhones.has(p));
    const newPhone = !lead.phone && newPhones.length > 0 ? newPhones[0] : null;
    const extraPhones = newPhone
        ? newPhones.slice(1)   // premier → lead.phone, reste → customFields
        : newPhones;           // lead.phone existe déjà → tout en customFields

    // ── E-mails ────────────────────────────────────────────────────────────────
    const existingEmails = new Set();
    if (lead.email) existingEmails.add(lead.email.toLowerCase());
    const newEmail = !lead.email && emails.length > 0
        ? emails[0]
        : null;

    // ── Adresses ───────────────────────────────────────────────────────────────
    // Vérifie si un customField "Adresse" existe déjà et est non vide
    const addressFieldExists = (lead.customFields || []).some(
        (cf) =>
            cf.label.toLowerCase().includes("adresse") ||
            cf.label.toLowerCase().includes("address")
    );
    const newAddress = !addressFieldExists && addresses.length > 0
        ? addresses[0]
        : null;

    return { newPhone, extraPhones, newEmail, newAddress };
}

/**
 * Retourne un résumé lisible des infos détectées pour l'affichage dans le modal.
 * @param {{ phones, emails, addresses }} detected
 * @returns {Array<{ type: string, icon: string, value: string }>}
 */
export function formatDetected(detected) {
    const items = [];
    detected.phones.forEach((p) => items.push({ type: "phone", icon: "📞", value: p }));
    detected.emails.forEach((e) => items.push({ type: "email", icon: "✉️", value: e }));
    detected.addresses.forEach((a) => items.push({ type: "address", icon: "📍", value: a }));
    return items;
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Détection de rendez-vous / rappels ────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

const MONTHS_FR = {
    janvier: 0, jan: 0,
    février: 1, fevrier: 1, fev: 1,
    mars: 2, mar: 2,
    avril: 3, avr: 3,
    mai: 4,
    juin: 5,
    juillet: 6, juil: 6,
    août: 7, aout: 7,
    septembre: 8, sep: 8, sept: 8,
    octobre: 9, oct: 9,
    novembre: 10, nov: 10,
    décembre: 11, decembre: 11, dec: 11,
};

const DAYS_FR = {
    lundi: 1, mardi: 2, mercredi: 3, jeudi: 4,
    vendredi: 5, samedi: 6, dimanche: 0,
};

/**
 * Parse une heure depuis un fragment de texte.
 * Accepte : "11h15", "11h", "14:30", "9h00", "9h30", "à 11h"
 * Retourne { hours, minutes } ou null.
 */
function parseTime(str) {
    if (!str) return null;
    // Format "11h15" ou "11h"
    const mH = str.match(/\b(\d{1,2})h(\d{2})?\b/i);
    if (mH) return { hours: parseInt(mH[1], 10), minutes: parseInt(mH[2] || "0", 10) };
    // Format "11:15" ou "11:00"
    const mC = str.match(/\b(\d{1,2}):(\d{2})\b/);
    if (mC) return { hours: parseInt(mC[1], 10), minutes: parseInt(mC[2], 10) };
    return null;
}

/**
 * Calcule la date du prochain <jour de semaine> à partir de `from`.
 * Si `next` = true, on cherche vraiment la semaine prochaine (pas aujourd'hui même).
 */
function nextWeekday(from, targetDay, next = false) {
    const d = new Date(from);
    const current = d.getDay();
    let diff = targetDay - current;
    if (diff <= 0 || next) diff += 7;
    d.setDate(d.getDate() + diff);
    return d;
}

/**
 * Détecte un rendez-vous ou rappel dans le texte d'une note.
 * Comprend :
 *   - "demain à 11h15"
 *   - "après-demain à 14h"
 *   - "lundi prochain à 9h30"
 *   - "mardi à 15h" (prochain mardi)
 *   - "le 20 juillet à 11h"
 *   - "20/07 à 14h30"
 *   - "20-07 à 11h"
 *   - "le 20 à 11h" (ce mois-ci)
 *   - "+2j" / "dans 2 jours"
 *   - sans heure → heure non définie (null)
 *
 * @param {string} text
 * @param {Date} [now] — date de référence (défaut : maintenant)
 * @returns {{ iso: string, label: string, hasTime: boolean } | null}
 */
export function detectAppointment(text, now = new Date()) {
    if (!text || !text.trim()) return null;

    const t = text.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // strip accents
        .replace(/['']/g, "'");

    let date = null;
    let timeStr = null;

    // ── Helpers ───────────────────────────────────────────────────────────────
    const clone = (d) => new Date(d.getTime());
    const addDays = (d, n) => { const r = clone(d); r.setDate(r.getDate() + n); return r; };

    // Chercher une heure dans le texte complet (après la date trouvée)
    const extractTime = (fragment) => {
        const m = fragment.match(/(?:a\s+)?(\d{1,2}h\d{0,2}|\d{1,2}:\d{2})/i);
        return m ? m[1] : null;
    };

    // ── Mots-clés de rappel / rendez-vous ─────────────────────────────────────
    const TRIGGER_RE = /(?:rappel(?:er|ler|le)?|rappel|rdv|rendez-?vous|recontact(?:er)?|relance(?:r)?|call(?:er)?|joindre|r[ée]appeler)/;
    // Le texte doit contenir un mot déclencheur OU une date explicite
    const hasTrigger = TRIGGER_RE.test(t);

    // ── 1. Aujourd'hui (avec heure obligatoire) ───────────────────────────────
    if (/\baujourd'?hui\b/.test(t)) {
        date = clone(now);
        timeStr = extractTime(t.split(/aujourd'?hui/)[1] || "");
        // Sans heure, "aujourd'hui" seul ne constitue pas un RDV pertinent
        if (!timeStr) date = null;
    }

    // ── 2. Demain ─────────────────────────────────────────────────────────────
    else if (/\bdemain\b/.test(t)) {
        date = addDays(now, 1);
        timeStr = extractTime(t.split("demain")[1] || "");
    }

    // ── 3. Après-demain ───────────────────────────────────────────────────────
    else if (/\bapr[eè]s[\s-]?demain\b/.test(t)) {
        date = addDays(now, 2);
        timeStr = extractTime(t.replace(/.*apr[eè]s[\s-]?demain/, ""));
    }

    // ── 4. "dans X jours" / "+Xj" ─────────────────────────────────────────────
    else if (/\bdans\s+(\d+)\s+jours?\b/.test(t)) {
        const m = t.match(/\bdans\s+(\d+)\s+jours?\b/);
        date = addDays(now, parseInt(m[1], 10));
        timeStr = extractTime(t.split(m[0])[1] || "");
    }
    else if (/\+(\d+)j\b/.test(t)) {
        const m = t.match(/\+(\d+)j\b/);
        date = addDays(now, parseInt(m[1], 10));
        timeStr = extractTime(t.split(m[0])[1] || "");
    }

    // ── 5. Jour de semaine + "prochain" ou seul ───────────────────────────────
    else if (/\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/.test(t)) {
        const m = t.match(/\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/);
        const targetDay = DAYS_FR[m[1]];
        const isNext = /prochain/.test(t.slice(t.indexOf(m[1])));
        date = nextWeekday(now, targetDay, isNext);
        timeStr = extractTime(t.slice(t.indexOf(m[0]) + m[0].length));
    }

    // ── 6. Date absolue : "20 juillet", "20 juillet 2026" ────────────────────
    else if (/\b(\d{1,2})\s+(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[eé]cembre)\b/.test(t)) {
        const m = t.match(/\b(\d{1,2})\s+(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[eé]cembre)(?:\s+(\d{4}))?\b/);
        const day = parseInt(m[1], 10);
        const monthKey = m[2].normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const month = MONTHS_FR[monthKey];
        const year = m[3] ? parseInt(m[3], 10) : now.getFullYear();
        if (month !== undefined) {
            date = new Date(year, month, day);
            // Si la date est déjà passée cette année, aller à l'an prochain
            if (date < now && !m[3]) date.setFullYear(year + 1);
            timeStr = extractTime(t.slice(t.indexOf(m[0]) + m[0].length));
        }
    }

    // ── 7. Format numérique : "20/07", "20-07", "20/07/2026" ─────────────────
    else if (/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}))?\b/.test(t)) {
        const m = t.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}))?\b/);
        const day = parseInt(m[1], 10);
        const month = parseInt(m[2], 10) - 1;
        const year = m[3] ? parseInt(m[3], 10) : now.getFullYear();
        if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
            date = new Date(year, month, day);
            if (date < now && !m[3]) date.setFullYear(year + 1);
            timeStr = extractTime(t.slice(t.indexOf(m[0]) + m[0].length));
        }
    }
    // ── 8. "le Xème" / "le X" (ce mois-ci) ──────────────────────────────────
    else if (hasTrigger && /\ble\s+(\d{1,2})(?:er|ème|e)?\b/.test(t)) {
        const m = t.match(/\ble\s+(\d{1,2})(?:er|[eè]me|e)?\b/);
        const day = parseInt(m[1], 10);
        if (day >= 1 && day <= 31) {
            date = new Date(now.getFullYear(), now.getMonth(), day);
            if (date <= now) date.setMonth(date.getMonth() + 1);
            timeStr = extractTime(t.slice(t.indexOf(m[0]) + m[0].length));
        }
    }

    // Aucune date trouvée
    if (!date) return null;

    // Doit avoir un déclencheur OU une date explicite (format court ou long avec heure)
    // Une date courte XX/XX ou XX-XX est suffisamment explicite sans mot déclencheur
    const time = timeStr ? parseTime(timeStr) : null;
    const isExplicitDate = /\b\d{1,2}[\/\-]\d{1,2}\b/.test(t) || /\b\d{1,2}\s+(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[eé]cembre)\b/.test(t);
    if (!hasTrigger && !time && !isExplicitDate) return null;

    // Appliquer l'heure si détectée
    if (time) {
        date.setHours(time.hours, time.minutes, 0, 0);
    } else {
        date.setHours(9, 0, 0, 0); // défaut 9h00
    }

    // Vérifier que la date est dans le futur (tolérance : -5 min)
    if (date.getTime() < Date.now() - 5 * 60 * 1000) return null;

    // Formater le label lisible
    const dayNames = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");

    const isToday = date.toDateString() === now.toDateString();
    const isTomorrow = date.toDateString() === addDays(now, 1).toDateString();
    const dayLabel = isToday ? "Aujourd'hui"
        : isTomorrow ? "Demain"
        : `${dayNames[date.getDay()]} ${dd}/${mm}`;

    const label = time
        ? `${dayLabel} à ${hh}h${min !== "00" ? min : ""}`
        : dayLabel;

    return {
        iso: date.toISOString(),
        label,
        hasTime: !!time,
    };
}
