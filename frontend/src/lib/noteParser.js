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
    "f\u00e9vrier": 1, fevrier: 1, fev: 1,
    mars: 2, mar: 2,
    avril: 3, avr: 3,
    mai: 4,
    juin: 5,
    juillet: 6, juil: 6,
    "ao\u00fbt": 7, aout: 7,
    septembre: 8, sep: 8, sept: 8,
    octobre: 9, oct: 9,
    novembre: 10, nov: 10,
    "d\u00e9cembre": 11, decembre: 11, dec: 11,
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
 *
 * Gère correctement les phrases mixtes contenant "aujourd'hui" + une date future :
 *   - "pas dispo aujourd'hui, rappeler demain a 9h"  → demain 9h ✓
 *   - "absent aujourd'hui, recontacter lundi a 14h"  → lundi 14h ✓
 *   - "mr dupont pas dispo aujourd'hui, rappeler demain a 9h car absent" → demain 9h ✓
 *
 * Approche : on collecte TOUS les candidats trouvés dans le texte (sans else-if),
 * puis on sélectionne le plus pertinent (priorité + date la plus proche).
 *
 * @param {string} text
 * @param {Date} [now] — date de référence (défaut : maintenant)
 * @returns {{ iso: string, label: string, hasTime: boolean } | null}
 */
export function detectAppointment(text, now = new Date()) {
    if (!text || !text.trim()) return null;

    // Normaliser : minuscules + strip accents + normaliser apostrophes
    const t = text.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/['']/g, "'");

    // ── Helpers ───────────────────────────────────────────────────────────────
    const clone = (d) => new Date(d.getTime());
    const addDays = (d, n) => { const r = clone(d); r.setDate(r.getDate() + n); return r; };

    // Extraire une heure dans un fragment de texte
    const extractTime = (fragment) => {
        if (!fragment) return null;
        const m = fragment.match(/(?:a\s+)?(\d{1,2}h\d{0,2}|\d{1,2}:\d{2})/i);
        return m ? m[1] : null;
    };

    // ── Mots-clés déclencheurs ────────────────────────────────────────────────
    const TRIGGER_RE = /(?:rappel(?:er|ler|le)?|rappel|rdv|rendez-?vous|recontact(?:er)?|relance(?:r)?|call(?:er)?|joindre|reappeler)/;
    const hasTrigger = TRIGGER_RE.test(t);

    // ── Collecte de tous les candidats ───────────────────────────────────────
    // priority : 3 = très fiable (demain, après-demain), 2 = fiable, 1 = faible
    const candidates = [];

    const addCandidate = (date, timeStr, priority) => {
        if (!date) return;
        const d = clone(date);
        const time = timeStr ? parseTime(timeStr) : null;
        if (time) {
            d.setHours(time.hours, time.minutes, 0, 0);
        } else {
            d.setHours(9, 0, 0, 0);
        }
        // Ignorer les dates passées (tolérance -5 min)
        if (d.getTime() < Date.now() - 5 * 60 * 1000) return;
        candidates.push({ date: d, hasTime: !!time, priority });
    };

    // ── 1. Aujourd'hui — heure obligatoire pour être pertinent ───────────────
    // On ne l'ignore PAS si présent, mais on ne l'accepte QUE avec une heure.
    // Cela évite de bloquer "aujourd'hui ... demain" via l'ancien else-if.
    const huiIdx = t.indexOf("aujourd'hui");
    if (huiIdx !== -1) {
        const after = t.slice(huiIdx + "aujourd'hui".length);
        const ts = extractTime(after);
        if (ts) {
            // Heure trouvée après "aujourd'hui" → candidat valide
            addCandidate(clone(now), ts, 2);
        }
        // Pas d'heure → on ignore "aujourd'hui" mais on continue l'analyse
    }

    // ── 2. Demain ─────────────────────────────────────────────────────────────
    const demainRe = /\bdemain\b/g;
    let mD;
    while ((mD = demainRe.exec(t)) !== null) {
        const after = t.slice(mD.index + mD[0].length);
        addCandidate(addDays(now, 1), extractTime(after), 3);
    }

    // ── 3. Après-demain ───────────────────────────────────────────────────────
    const apresRe = /\bapr[e\u00e8]s[\s-]?demain\b/g;
    let mAD;
    while ((mAD = apresRe.exec(t)) !== null) {
        const after = t.slice(mAD.index + mAD[0].length);
        addCandidate(addDays(now, 2), extractTime(after), 3);
    }

    // ── 4. "dans X jours" / "+Xj" ─────────────────────────────────────────────
    const dansRe = /\bdans\s+(\d+)\s+jours?\b/g;
    let mDans;
    while ((mDans = dansRe.exec(t)) !== null) {
        const after = t.slice(mDans.index + mDans[0].length);
        addCandidate(addDays(now, parseInt(mDans[1], 10)), extractTime(after), 2);
    }
    const plusJRe = /\+(\d+)j\b/g;
    let mPJ;
    while ((mPJ = plusJRe.exec(t)) !== null) {
        const after = t.slice(mPJ.index + mPJ[0].length);
        addCandidate(addDays(now, parseInt(mPJ[1], 10)), extractTime(after), 2);
    }

    // ── 5. Jour de semaine ────────────────────────────────────────────────────
    const joursRe = /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/g;
    let mJour;
    while ((mJour = joursRe.exec(t)) !== null) {
        const targetDay = DAYS_FR[mJour[1]];
        const afterJour = t.slice(mJour.index + mJour[0].length);
        const isNext = /prochain/.test(afterJour.slice(0, 15));
        addCandidate(nextWeekday(now, targetDay, isNext), extractTime(afterJour), 2);
    }

    // ── 6. Date absolue : "20 juillet", "20 juillet 2026" ────────────────────
    const moisRe = /\b(\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)(?:\s+(\d{4}))?\b/g;
    let mMois;
    while ((mMois = moisRe.exec(t)) !== null) {
        const day = parseInt(mMois[1], 10);
        const month = MONTHS_FR[mMois[2]];
        const year = mMois[3] ? parseInt(mMois[3], 10) : now.getFullYear();
        if (month !== undefined) {
            const d = new Date(year, month, day);
            if (d < now && !mMois[3]) d.setFullYear(year + 1);
            addCandidate(d, extractTime(t.slice(mMois.index + mMois[0].length)), 2);
        }
    }

    // ── 7. Format numérique : "20/07", "20-07", "20/07/2026" ─────────────────
    const numRe = /\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}))?\b/g;
    let mNum;
    while ((mNum = numRe.exec(t)) !== null) {
        const day = parseInt(mNum[1], 10);
        const month = parseInt(mNum[2], 10) - 1;
        const year = mNum[3] ? parseInt(mNum[3], 10) : now.getFullYear();
        if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
            const d = new Date(year, month, day);
            if (d < now && !mNum[3]) d.setFullYear(year + 1);
            addCandidate(d, extractTime(t.slice(mNum.index + mNum[0].length)), 2);
        }
    }

    // ── 8. "le X" / "le Xème" (ce mois-ci) — seulement avec déclencheur ─────
    if (hasTrigger) {
        const leRe = /\ble\s+(\d{1,2})(?:er|[e\u00e8]me|e)?\b/g;
        let mLe;
        while ((mLe = leRe.exec(t)) !== null) {
            const day = parseInt(mLe[1], 10);
            if (day >= 1 && day <= 31) {
                const d = new Date(now.getFullYear(), now.getMonth(), day);
                if (d <= now) d.setMonth(d.getMonth() + 1);
                addCandidate(d, extractTime(t.slice(mLe.index + mLe[0].length)), 1);
            }
        }
    }

    // ── Sélection du meilleur candidat ───────────────────────────────────────
    if (candidates.length === 0) return null;

    // Filtre : besoin d'un déclencheur OU d'une date explicite/heure pour valider
    const isExplicitDate =
        /\b\d{1,2}[\/\-]\d{1,2}\b/.test(t) ||
        /\b\d{1,2}\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b/.test(t);

    const valid = candidates.filter((c) => hasTrigger || isExplicitDate || c.hasTime);

    if (valid.length === 0) return null;

    // Trier : priorité décroissante, puis date croissante (la plus proche en premier)
    valid.sort((a, b) =>
        b.priority !== a.priority
            ? b.priority - a.priority
            : a.date.getTime() - b.date.getTime()
    );

    const best = valid[0];
    const date = best.date;

    // ── Formatage du label ────────────────────────────────────────────────────
    const dayNames = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");

    const isToday    = date.toDateString() === now.toDateString();
    const isTomorrow = date.toDateString() === addDays(now, 1).toDateString();
    const dayLabel   = isToday    ? "Aujourd'hui"
                     : isTomorrow ? "Demain"
                     : `${dayNames[date.getDay()]} ${dd}/${mm}`;

    const label = best.hasTime
        ? `${dayLabel} \u00e0 ${hh}h${min !== "00" ? min : ""}`
        : dayLabel;

    return {
        iso: date.toISOString(),
        label,
        hasTime: best.hasTime,
    };
}
