/**
 * Ordre, visibilité & collapse des sections de la fiche lead (par workspace).
 * Zone A (brief « Information pertinente ») est fixe — hors de cette liste.
 * « calendar » est une section déplaçable comme les autres.
 */

import { parseNote, detectPersonNames } from "@/lib/noteParser";
import { rankContactNames } from "@/lib/contactRank";

export const PANEL_SECTION_IDS = [
    "imported",
    "calendar",
    "contact",
    "notes",
    "relances",
    "tags",
    "deal",
    "history",
];

export const PANEL_SECTION_META = {
    imported: { label: "Données importées", icon: "Database" },
    calendar: { label: "Calendrier", icon: "CalendarClock" },
    contact:  { label: "Contact & coordonnées", icon: "User" },
    notes:    { label: "Notes", icon: "MessageSquare" },
    relances: { label: "Relances", icon: "Repeat2" },
    tags:     { label: "Tags", icon: "Tag" },
    deal:     { label: "Valeur / Deal", icon: "Trophy" },
    history:  { label: "Historique de statut", icon: "History" },
};

/** Défaut : calendrier juste sous l'import, avant le contact. */
export const DEFAULT_PANEL_SECTIONS = {
    order: ["imported", "calendar", "contact", "notes", "relances", "tags", "deal", "history"],
    hidden: [],
    collapsed: ["imported"],
};

export function normalizePanelSections(raw) {
    const base = DEFAULT_PANEL_SECTIONS;
    if (!raw || typeof raw !== "object") {
        return { order: [...base.order], hidden: [], collapsed: [...base.collapsed] };
    }

    const orderIn = Array.isArray(raw.order) ? raw.order.filter((id) => PANEL_SECTION_IDS.includes(id)) : [];
    const hiddenIn = Array.isArray(raw.hidden) ? raw.hidden.filter((id) => PANEL_SECTION_IDS.includes(id)) : [];
    const collapsedIn = Array.isArray(raw.collapsed)
        ? raw.collapsed.filter((id) => PANEL_SECTION_IDS.includes(id))
        : [...base.collapsed];

    const order = [...orderIn];
    for (const id of PANEL_SECTION_IDS) {
        if (!order.includes(id)) order.push(id);
    }

    const hidden = hiddenIn.filter((id) => order.includes(id));
    const collapsed = collapsedIn.filter((id) => order.includes(id));
    return { order, hidden, collapsed };
}

export function visiblePanelSections(layout) {
    const { order, hidden } = normalizePanelSections(layout);
    const hiddenSet = new Set(hidden);
    return order.filter((id) => !hiddenSet.has(id));
}

export function hiddenPanelSections(layout) {
    const { order, hidden } = normalizePanelSections(layout);
    const hiddenSet = new Set(hidden);
    return order.filter((id) => hiddenSet.has(id));
}

export function isSectionCollapsed(layout, id) {
    return normalizePanelSections(layout).collapsed.includes(id);
}

export function toggleCollapsedSection(layout, id) {
    const next = normalizePanelSections(layout);
    const set = new Set(next.collapsed);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    return { ...next, collapsed: [...set] };
}

/**
 * Déplace une section avant/après une autre (ordre workspace-wide).
 * `place`: "before" | "after"
 */
export function reorderPanelSection(layout, draggedId, targetId, place = "before") {
    const next = normalizePanelSections(layout);
    if (!draggedId || !targetId || draggedId === targetId) return next;
    const order = [...next.order];
    const from = order.indexOf(draggedId);
    const to = order.indexOf(targetId);
    if (from < 0 || to < 0) return next;
    order.splice(from, 1);
    let insertAt = order.indexOf(targetId);
    if (insertAt < 0) return next;
    if (place === "after") insertAt += 1;
    order.splice(insertAt, 0, draggedId);
    return { ...next, order };
}

/** Monte / descend d’un cran (−1 = haut, +1 = bas). */
export function movePanelSectionBy(layout, id, delta) {
    const next = normalizePanelSections(layout);
    const order = [...next.order];
    const from = order.indexOf(id);
    if (from < 0) return next;
    const to = from + delta;
    if (to < 0 || to >= order.length) return next;
    const [moved] = order.splice(from, 1);
    order.splice(to, 0, moved);
    return { ...next, order };
}

/** Réordonne par indices dans la liste visible (organisateur). */
export function reorderPanelSectionIndex(layout, fromIdx, toIdx, visibleIds) {
    const next = normalizePanelSections(layout);
    if (
        fromIdx == null ||
        toIdx == null ||
        fromIdx === toIdx ||
        fromIdx < 0 ||
        toIdx < 0 ||
        fromIdx >= visibleIds.length ||
        toIdx >= visibleIds.length
    ) {
        return next;
    }
    const draggedId = visibleIds[fromIdx];
    const targetId = visibleIds[toIdx];
    const place = fromIdx < toIdx ? "after" : "before";
    return reorderPanelSection(next, draggedId, targetId, place);
}

/** Champs clés affichés dans le brief fixe (haut de fiche) */
export const BRIEF_FIELD_RES = {
    jobTitle: /poste|intitul|titre|job|fonction|r[oô]le|position|emploi/i,
    location: /localisation|ville|city|location|commune/i,
    contract: /contrat|contract|cdi|cdd|type.?de.?contrat/i,
    contact:  /^(contact|recruteur|rh|nom|interlocuteur|personne|manager|responsable)/i,
};

function asHref(v) {
    const s = String(v || "").trim();
    if (/^https?:\/\//i.test(s)) return s;
    if (/^www\./i.test(s)) return `https://${s}`;
    if (/^[a-z0-9][\w.-]*\.[a-z]{2,}([/?#].*)?$/i.test(s) && !/\s/.test(s) && !s.includes("@")) {
        return `https://${s}`;
    }
    return null;
}

/** Affichage court d’une URL (sans protocole) */
export function displayUrl(href) {
    if (!href) return "";
    return String(href).replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

/**
 * Brief personnalisé par lead : import CSV + notes + champs principaux.
 * `insights` = infos « pertinentes » détectées (noms dans notes, champs import…)
 * prêtes à être appliquées / mises en avant dans le panneau interactif.
 */
export function extractLeadBrief(lead) {
    const entries = [];
    for (const f of lead?.customFields || []) {
        if (f?.value) {
            entries.push({
                label: f.label || "",
                value: String(f.value).trim(),
                highlight: !!f.highlight,
                source: "field",
            });
        }
    }
    for (const [k, v] of Object.entries(lead?.extra || {})) {
        if (v) {
            entries.push({
                label: k,
                value: String(v).trim(),
                highlight: false,
                source: "import",
            });
        }
    }

    const pick = (re) => {
        const hl = entries.find((e) => e.highlight && re.test(e.label));
        if (hl) return hl.value;
        const hit = entries.find((e) => re.test(e.label) && e.value.length <= 120 && !asHref(e.value));
        return hit?.value || null;
    };

    const jobTitle = pick(BRIEF_FIELD_RES.jobTitle);
    const location = pick(BRIEF_FIELD_RES.location);
    const contract = pick(BRIEF_FIELD_RES.contract);
    const contactFromImport = pick(BRIEF_FIELD_RES.contact);

    let notePersons = [];
    let notePhones = [];
    let noteEmails = [];
    const allNotes = (lead?.notes || []).map((n) => n.text).filter(Boolean).join("\n");
    const noteList = lead?.notes || [];
    if (allNotes.trim()) {
        const detected = parseNote(allNotes);
        notePersons = detected.persons || detectPersonNames(allNotes);
        notePhones = detected.phones || [];
        noteEmails = detected.emails || [];
    }

    const rankedContacts = rankContactNames(
        [
            ...(lead?.contact ? [{ name: lead.contact, source: "lead", frequency: 1, lastNoteIndex: 0 }] : []),
            ...(contactFromImport ? [{ name: contactFromImport, source: "import", frequency: 1, lastNoteIndex: 99 }] : []),
            ...noteList.flatMap((n, idx) =>
                detectPersonNames(n?.text || "").map((p) => ({
                    name: p,
                    source: "note",
                    frequency: 1,
                    lastNoteIndex: idx,
                }))
            ),
            ...(lead?.customFields || [])
                .filter((cf) => cf?.value && /contact|interlocuteur|personne|nom/i.test(cf.label || ""))
                .map((cf) => ({ name: cf.value, source: "note", frequency: 1, lastNoteIndex: 40 })),
        ],
        { leadContact: lead?.contact, totalNotes: noteList.length || 1 }
    );

    const contact =
        (lead?.contact || "").trim()
        || rankedContacts[0]?.name
        || contactFromImport
        || notePersons[0]
        || null;

    const contactSource = lead?.contact
        ? "lead"
        : rankedContacts[0]?.source || (contactFromImport ? "import" : notePersons[0] ? "note" : null);

    const phone = lead?.phone || notePhones[0] || null;
    const email = lead?.email || noteEmails[0] || null;

    const links = [];
    const pushLink = (href, label) => {
        if (!href || links.some((l) => l.href === href)) return;
        links.push({ href, display: displayUrl(href), label: label || null });
    };

    if (lead?.website) {
        pushLink(
            asHref(lead.website) || (lead.website.startsWith("http") ? lead.website : `https://${lead.website}`),
            "Site"
        );
    }
    for (const e of entries) {
        const href = asHref(e.value);
        if (href) pushLink(href, e.label);
    }

    const insights = [];
    const pushInsight = (item) => {
        if (!item?.value) return;
        if (insights.some((i) => i.type === item.type && i.value === item.value)) return;
        insights.push(item);
    };

    for (const ranked of rankedContacts.slice(0, 8)) {
        const p = ranked.name;
        const isPrimary = lead?.contact
            && lead.contact.trim().toLowerCase() === p.trim().toLowerCase();
        pushInsight({
            type: "person",
            value: p,
            label: isPrimary
                ? "Contact principal"
                : ranked.source === "import"
                    ? "Contact importé"
                    : "Contact détecté",
            actionable: !isPrimary,
            applyKey: isPrimary ? null : "contact",
            source: ranked.source || "note",
            score: ranked.score,
        });
    }
    for (const p of notePhones) {
        if (lead?.phone && normalizeLoose(lead.phone) === normalizeLoose(p)) continue;
        pushInsight({
            type: "phone",
            value: p,
            label: "Tél. détecté",
            actionable: !lead?.phone,
            applyKey: "phone",
            source: "note",
        });
    }
    for (const e of noteEmails) {
        if (lead?.email && lead.email.toLowerCase() === e.toLowerCase()) continue;
        pushInsight({
            type: "email",
            value: e,
            label: "Email détecté",
            actionable: !lead?.email,
            applyKey: "email",
            source: "note",
        });
    }

    for (const e of entries.filter((x) => x.highlight && x.value && !asHref(x.value))) {
        if (/poste|intitul|titre|job/i.test(e.label)) continue;
        pushInsight({
            type: "field",
            value: e.value,
            label: e.label,
            actionable: false,
            source: "import",
        });
    }

    return {
        jobTitle,
        location,
        contract,
        phone,
        email,
        contact,
        contactSource,
        website: lead?.website || null,
        links: links.slice(0, 8),
        insights: insights.slice(0, 6),
        hasPertinent: insights.length > 0,
        hasBrief: !!(
            jobTitle || location || contract || phone || email || contact || links.length || insights.length
        ),
    };
}

function normalizeLoose(s) {
    return String(s || "").replace(/\D/g, "");
}

/** Détecte si une valeur extra/custom est une URL cliquable */
export function valueAsHref(v) {
    return asHref(v);
}
