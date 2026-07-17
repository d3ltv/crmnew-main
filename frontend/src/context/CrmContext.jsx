import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useReducer,
    useRef,
    useState,
} from "react";
import { inferColumnColor } from "@/lib/columnColors";
import { startAutoBackup, stopAutoBackup, saveBackup } from "@/lib/autoBackup";
import { resolveLogo } from "@/lib/logoUtils";
import {
    isContactedColumn,
    isNouveauColumn,
    isWonColumn,
    isMeetingColumn,
} from "@/constants/columnPatterns";

// ---------- Utilities ----------
const uid = () =>
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const DEFAULT_COLUMNS = [
    "Nouveau",
    "Contacté",
    "Rendez-vous",
    "Proposition",
    "Gagné",
    "Perdu",
];

// shouldPromptNote : même logique que isContactedColumn (colonne de type "contacté")
function shouldPromptNote(name = "") {
    return isContactedColumn(name);
}

/**
 * Compte le nombre de jours ouvrés (lundi–samedi, dimanche exclu) entre
 * une date ISO passée et maintenant.
 */
function businessDaysSince(isoDate) {
    if (!isoDate) return 0;
    const start = new Date(isoDate);
    const end   = new Date();
    if (end <= start) return 0;

    let count = 0;
    const cur = new Date(start);
    cur.setHours(0, 0, 0, 0);
    const endDay = new Date(end);
    endDay.setHours(0, 0, 0, 0);

    while (cur < endDay) {
        if (cur.getDay() !== 0) count++; // 0 = dimanche
        cur.setDate(cur.getDate() + 1);
    }
    return count;
}

/** Nombre de jours ouvrés requis avant qu'un lead soit marqué "stale" */
const STALE_BUSINESS_DAYS = 3;

// ---------- Card fields config ----------
// Each entry: { key, label, visible }
// "key" is either a fixed slot name or an extra/CSV column key prefixed with "extra:"
export const DEFAULT_CARD_FIELDS = [
    { key: "phone",        label: "Téléphone",               visible: true  },
    { key: "website",      label: "Site web",                visible: true  },
    { key: "email",        label: "Email",                   visible: true  },
    { key: "contact",      label: "Contact",                 visible: false },
    { key: "tags",         label: "Tags",                    visible: true  },
    { key: "dealValue",    label: "Prix / Valeur du deal",   visible: true  },
    { key: "lastNote",     label: "Dernière note",           visible: true  },
    { key: "followupBadge",label: "Badge relance auto",      visible: true  },
    { key: "nextAction",   label: "Prochaine action",        visible: true  },
    { key: "statusTime",   label: "Temps dans la colonne",   visible: true  },
    { key: "lastContact",  label: "Dernier contact",         visible: true  },
    { key: "pinnedFields", label: "Champs épinglés",         visible: true  },
    { key: "actionBar",    label: "Barre d'actions rapides", visible: true  },
];

const makeWorkspace = (name, sector = "", template = "crm") => {
    const columns = {};
    const columnOrder = [];

    // Définition des templates
    const TEMPLATES = {
        crm: {
            columns: DEFAULT_COLUMNS,
            cardFields: DEFAULT_CARD_FIELDS,
        },
        jobs: {
            columns: [
                "Candidatures envoyées",
                "Entretien RH",
                "Entretien Technique",
                "Proposition reçue",
                "Accepté 🎉",
                "Refusé",
            ],
            cardFields: [
                { key: "contact",      label: "Recruteur / Contact",  visible: true  },
                { key: "phone",        label: "Téléphone",            visible: false },
                { key: "email",        label: "Email",                visible: true  },
                { key: "website",      label: "Lien offre / Site",    visible: true  },
                { key: "tags",         label: "Tags (Tech, Remote…)", visible: true  },
                { key: "dealValue",    label: "Salaire proposé",      visible: true  },
                { key: "nextAction",   label: "Prochain entretien",   visible: true  },
                { key: "lastContact",  label: "Dernier échange",      visible: true  },
                { key: "followupBadge",label: "Badge relance",        visible: true  },
                { key: "actionBar",    label: "Barre d'actions",      visible: true  },
                { key: "statusTime",   label: "Temps dans l'étape",   visible: false },
                { key: "pinnedFields", label: "Infos épinglées",      visible: true  },
                { key: "lastNote",     label: "Dernière note",        visible: true  },
            ],
        },
    };

    const tpl = TEMPLATES[template] || TEMPLATES.crm;
    const colColors = {
        "Candidatures envoyées": "blue",
        "Entretien RH": "amber",
        "Entretien Technique": "violet",
        "Proposition reçue": "sky",
        "Accepté 🎉": "green",
        "Refusé": "red",
    };

    for (const n of tpl.columns) {
        const id = uid();
        columns[id] = {
            id,
            name: n,
            color: template === "jobs" ? (colColors[n] || "gray") : inferColumnColor(n),
            promptNoteOnEnter: shouldPromptNote(n),
        };
        columnOrder.push(id);
    }
    return {
        id: uid(),
        name: name || "Sans nom",
        sector,
        template, // "crm" | "jobs"
        columns,
        columnOrder,
        leads: {},
        cardFields: tpl.cardFields,
        columnWidth: 340,
        cardScale: 1,
        createdAt: new Date().toISOString(),
    };
};

// ---------- Auto follow-up helpers ----------
const DAY_MS = 24 * 60 * 60 * 1000;

function addDaysISO(days, from = null) {
    const base = from ? new Date(from).getTime() : Date.now();
    return new Date(base + days * DAY_MS).toISOString();
}

function isoToDate(iso) {
    // Returns YYYY-MM-DD (used by <input type="date">)
    if (!iso) return "";
    return new Date(iso).toISOString().slice(0, 10);
}

function followupLabel(stage) {
    if (stage <= 1) return "Relance auto · étape 1/3";
    if (stage === 2) return "Relance auto · étape 2/3 (sans réponse)";
    return "Relance auto · étape 3/3 (à rappeler !)";
}

function makeFollowup(columnId, stage = 1, from = null) {
    const startedAt = from || new Date().toISOString();
    const dueAt = addDaysISO(stage, startedAt);
    return {
        stage,
        dueAt,
        startedAt,
        columnId,
    };
}

// Given a followup, returns the matching nextAction (visible in UI)
function followupToNextAction(fu) {
    if (!fu) return null;
    return {
        date: isoToDate(fu.dueAt),
        dueAt: fu.dueAt,
        label: followupLabel(fu.stage),
        auto: true,
        stage: fu.stage,
    };
}

// ---------- Persistence ----------
const STORAGE_KEY = "crm_state_v1";
const BACKUP_KEY  = "crm_state_v1_backup";

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        // Validation basique — si la structure est invalide, on ignore
        if (!parsed || typeof parsed !== "object" || !parsed.workspaces) return null;
        // Migrer les anciens workspaces sans columnWidth / cardScale
        if (parsed.workspaces) {
            Object.values(parsed.workspaces).forEach((ws) => {
                if (ws.columnWidth === undefined) ws.columnWidth = 340;
                if (ws.cardScale === undefined) ws.cardScale = 1;
            });
        }
        return parsed;
    } catch {
        // Données principales corrompues — essayer le backup avant d'abandonner
        console.error("[CRM] État principal corrompu, tentative de restauration depuis le backup…");
        try {
            const backup = localStorage.getItem(BACKUP_KEY);
            if (backup) {
                const parsed = JSON.parse(backup);
                if (parsed && typeof parsed === "object" && parsed.workspaces) {
                    console.warn("[CRM] Restauré depuis le backup.");
                    return parsed;
                }
            }
        } catch {}
        // Rien à récupérer — on repart de zéro SANS effacer (on garde les données corrompues pour analyse)
        console.error("[CRM] Impossible de restaurer. Démarrage avec un état vide.");
        return null;
    }
}

// Taille max autorisée en localStorage avant d'avertir l'utilisateur (4MB)
const LS_WARN_BYTES = 4 * 1024 * 1024;

/**
 * Tente de sauvegarder l'état dans localStorage.
 * Retourne true si la sauvegarde a réussi, false si le quota est dépassé.
 *
 * En cas d'échec (QuotaExceededError) :
 *   - Ne lève PAS d'exception (gestion silencieuse côté appelant)
 *   - Déclenche un backup IndexedDB immédiat pour ne rien perdre
 *   - Retourne false pour que le provider puisse afficher une alerte persistante
 */
function saveState(state) {
    try {
        const { lastDeleted: _ld, ...persistent } = state;
        const serialized = JSON.stringify(persistent);

        // Avertir en console si on approche de la limite (5MB typique)
        if (serialized.length > LS_WARN_BYTES) {
            console.warn(
                `[CRM] État volumineux : ${(serialized.length / 1024).toFixed(0)} KB — risque de quota localStorage.`
            );
        }

        // Sauvegarder l'état précédent comme backup localStorage avant d'écraser
        try {
            const current = localStorage.getItem(STORAGE_KEY);
            if (current) localStorage.setItem(BACKUP_KEY, current);
        } catch {}

        localStorage.setItem(STORAGE_KEY, serialized);
        return true; // succès
    } catch (err) {
        // Quota dépassé ou mode privé
        console.error("[CRM] Impossible de sauvegarder dans localStorage :", err);
        // Backup IndexedDB immédiat pour ne pas perdre les données en mémoire
        saveBackup(state).catch(() => {});
        return false; // échec
    }
}

// Référence au timer du debounce — module-level pour persister entre les appels
let _saveDebounceTimer = null;

/**
 * Debounce de saveState — appelle le callback onResult(success: boolean)
 * quand la sauvegarde réelle est effectuée.
 * @param {object} state
 * @param {(success: boolean) => void} [onResult]
 */
function saveStateDebounced(state, onResult) {
    if (_saveDebounceTimer) clearTimeout(_saveDebounceTimer);
    _saveDebounceTimer = setTimeout(() => {
        _saveDebounceTimer = null;
        const ok = saveState(state);
        onResult?.(ok);
    }, 500);
}

// ---------- Actions qui NE sont PAS undoables ----------
// (navigation, checks périodiques, thème)
const NON_UNDOABLE = new Set([
    "CHECK_FOLLOWUPS",
    "SET_THEME",
    "SET_LEAD_PANEL_MODE",
    "SELECT_WORKSPACE",
    "RESTORE_LAST_DELETED",
    "CLEAR_LAST_DELETED",
    "UNDO",
]);

// ---------- Undo/Redo stack — snapshots complets légers ----------
// Chaque entrée stocke { before, after } — les deux états complets (sans lastDeleted).
// Cela évite toute ambiguïté de sens dans les diffs et rend undo/redo parfaitement symétriques.
// Pour limiter la mémoire, on ne clone que les workspaces qui ont changé entre before et after
// (les workspaces inchangés sont partagés par référence).
const MAX_UNDO_STACK = 50;
const MAX_REDO_STACK = 50;

function stripTransient(state) {
    // Retire lastDeleted (buffer temporaire) du snapshot pour ne pas polluer le stack
    const { lastDeleted: _ld, ...clean } = state;
    return clean;
}

function statesAreEqual(a, b) {
    if (a === b) return true;
    if (a.order !== b.order || a.currentId !== b.currentId || a.theme !== b.theme) return false;
    if (a.workspaces === b.workspaces) return true;
    const aIds = Object.keys(a.workspaces);
    const bIds = Object.keys(b.workspaces);
    if (aIds.length !== bIds.length) return false;
    return aIds.every((id) => a.workspaces[id] === b.workspaces[id]);
}

// Chaque entrée du stack = { before, after } — snapshots complets sans lastDeleted.
// Undo restaure `before`, Redo restaure `after`. Symétrique, sans ambiguïté de sens.

// ---------- Initial state ----------
const initialState = {
    workspaces: {},
    order: [],
    currentId: null,
    theme: "light",
    leadPanelMode: "side", // "side" | "modal"
    // undo stack for lead deletions (Gmail-style)
    lastDeleted: null, // { workspaceId, lead }
};

// ---------- Reducer ----------
function reducer(state, action) {
    switch (action.type) {
        case "SET_THEME":
            return { ...state, theme: action.theme };

        case "SET_LEAD_PANEL_MODE":
            return { ...state, leadPanelMode: action.mode };

        case "CREATE_WORKSPACE": {
            const ws = makeWorkspace(action.name, action.sector, action.template || "crm");
            return {
                ...state,
                workspaces: { ...state.workspaces, [ws.id]: ws },
                order: [...state.order, ws.id],
                currentId: ws.id,
            };
        }
        case "SELECT_WORKSPACE":
            return { ...state, currentId: action.id };

        case "DELETE_WORKSPACE": {
            const { [action.id]: _removed, ...rest } = state.workspaces;
            const newOrder = state.order.filter((x) => x !== action.id);
            return {
                ...state,
                workspaces: rest,
                order: newOrder,
                currentId:
                    state.currentId === action.id
                        ? newOrder[0] || null
                        : state.currentId,
            };
        }
        case "RENAME_WORKSPACE": {
            const ws = state.workspaces[action.id];
            if (!ws) return state;
            return {
                ...state,
                workspaces: {
                    ...state.workspaces,
                    [action.id]: { ...ws, name: action.name },
                },
            };
        }

        case "ADD_COLUMN": {
            const ws = state.workspaces[action.workspaceId];
            if (!ws) return state;
            const id = uid();
            const name = action.name || "Nouvelle colonne";
            return updateWs(state, ws.id, {
                columns: {
                    ...ws.columns,
                    [id]: { id, name, color: inferColumnColor(name) },
                },
                columnOrder: [...ws.columnOrder, id],
            });
        }
        case "RENAME_COLUMN": {
            const ws = state.workspaces[action.workspaceId];
            if (!ws) return state;
            const col = ws.columns[action.columnId];
            if (!col) return state;
            // Re-infer color if user hasn't set one manually (color === auto)
            const nextColor = col.colorSetByUser
                ? col.color
                : inferColumnColor(action.name);
            return updateWs(state, ws.id, {
                columns: {
                    ...ws.columns,
                    [action.columnId]: {
                        ...col,
                        name: action.name,
                        color: nextColor,
                    },
                },
            });
        }
        case "SET_COLUMN_COLOR": {
            const ws = state.workspaces[action.workspaceId];
            if (!ws) return state;
            const col = ws.columns[action.columnId];
            if (!col) return state;
            return updateWs(state, ws.id, {
                columns: {
                    ...ws.columns,
                    [action.columnId]: {
                        ...col,
                        color: action.color,
                        colorSetByUser: true,
                    },
                },
            });
        }
        case "DELETE_COLUMN": {
            const ws = state.workspaces[action.workspaceId];
            if (!ws) return state;
            const { [action.columnId]: _rm, ...remainingCols } = ws.columns;
            const newOrder = ws.columnOrder.filter((c) => c !== action.columnId);
            // Move orphan leads to first remaining column (or delete if none)
            const fallback = newOrder[0];
            const newLeads = { ...ws.leads };
            Object.values(newLeads).forEach((l) => {
                if (l.columnId === action.columnId) {
                    if (fallback) newLeads[l.id] = { ...l, columnId: fallback };
                    else delete newLeads[l.id];
                }
            });
            return updateWs(state, ws.id, {
                columns: remainingCols,
                columnOrder: newOrder,
                leads: newLeads,
            });
        }
        case "CLEAR_COLUMN": {
            // Supprime tous les leads d'une colonne, garde la colonne elle-même
            const ws = state.workspaces[action.workspaceId];
            if (!ws) return state;
            const newLeads = {};
            Object.values(ws.leads).forEach((l) => {
                if (l.columnId !== action.columnId) newLeads[l.id] = l;
            });
            const newLeadOrder = {
                ...(ws.leadOrder || {}),
                [action.columnId]: [],
            };
            return updateWs(state, ws.id, { leads: newLeads, leadOrder: newLeadOrder });
        }
        case "REORDER_COLUMNS": {
            const ws = state.workspaces[action.workspaceId];
            if (!ws) return state;
            return updateWs(state, ws.id, { columnOrder: action.newOrder });
        }

        case "REORDER_LEADS": {
            // action.workspaceId, action.columnId, action.fromIndex, action.toIndex
            const ws = state.workspaces[action.workspaceId];
            if (!ws) return state;
            // Build current order for the column if not stored yet
            const existingOrder = ws.leadOrder?.[action.columnId];
            const colLeads = Object.values(ws.leads)
                .filter((l) => l.columnId === action.columnId)
                .map((l) => l.id);
            const currentOrder = existingOrder
                ? existingOrder.filter((id) => colLeads.includes(id))
                : colLeads;
            // Add any leads not yet in the stored order (e.g. newly added)
            colLeads.forEach((id) => {
                if (!currentOrder.includes(id)) currentOrder.push(id);
            });
            const reordered = [...currentOrder];
            const [moved] = reordered.splice(action.fromIndex, 1);
            reordered.splice(action.toIndex, 0, moved);
            return updateWs(state, ws.id, {
                leadOrder: {
                    ...(ws.leadOrder || {}),
                    [action.columnId]: reordered,
                },
            });
        }

        case "MOVE_LEAD_ORDERED": {
            // Move lead across columns AND place at a specific index
            // action.workspaceId, action.leadId, action.toColumnId, action.toIndex
            const ws = state.workspaces[action.workspaceId];
            if (!ws) return state;
            const lead = ws.leads[action.leadId];
            if (!lead) return state;
            const now = new Date().toISOString();
            const targetCol = ws.columns[action.toColumnId];
            const autoFollowup = targetCol?.autoFollowup
                ? makeFollowup(action.toColumnId, 1, now)
                : null;
            let nextAction = lead.nextAction;
            // Ne jamais écraser un RDV détecté manuellement ("📅 RDV…")
            const hasManualRdv = lead.nextAction?.label?.startsWith("📅 RDV");
            if (autoFollowup && !hasManualRdv) {
                nextAction = followupToNextAction(autoFollowup);
            } else if (!hasManualRdv && nextAction?.auto) {
                nextAction = null;
            }
            // Update leadOrder for destination column
            const destLeads = Object.values(ws.leads)
                .filter((l) => l.columnId === action.toColumnId && l.id !== action.leadId)
                .map((l) => l.id);
            const destOrder = (ws.leadOrder?.[action.toColumnId] || destLeads)
                .filter((id) => destLeads.includes(id));
            destLeads.forEach((id) => {
                if (!destOrder.includes(id)) destOrder.push(id);
            });
            const newDestOrder = [...destOrder];
            const insertAt = action.toIndex != null
                ? Math.min(action.toIndex, newDestOrder.length)
                : newDestOrder.length;
            newDestOrder.splice(insertAt, 0, action.leadId);
            // Remove from source column order
            const srcOrder = (ws.leadOrder?.[lead.columnId] || [])
                .filter((id) => id !== action.leadId);
            return updateWs(state, ws.id, {
                leads: {
                    ...ws.leads,
                    [action.leadId]: {
                        ...lead,
                        columnId: action.toColumnId,
                        statusHistory: [
                            ...(lead.statusHistory || []),
                            { columnId: action.toColumnId, at: now },
                        ],
                        autoFollowup,
                        nextAction,
                        // Enregistrer l'heure d'entrée si on arrive dans une colonne "contacté"
                        // et effacer le flag stale si on quitte cette colonne
                        contactedColumnEnteredAt: isContactedColumn(targetCol?.name || "")
                            ? (lead.contactedColumnEnteredAt || now) // ne pas écraser si déjà là
                            : null,
                        staleInContacted: isContactedColumn(targetCol?.name || "")
                            ? lead.staleInContacted // conserver si on reste dedans (reorder)
                            : false,               // reset en quittant
                    },
                },
                leadOrder: {
                    ...(ws.leadOrder || {}),
                    [lead.columnId]: srcOrder,
                    [action.toColumnId]: newDestOrder,
                },
            });
        }

        case "ADD_LEAD": {
            const ws = state.workspaces[action.workspaceId];
            if (!ws) return state;
            const id = uid();
            const columnId = action.columnId || ws.columnOrder[0];
            const now = new Date().toISOString();
            const lead = {
                id,
                columnId,
                company: action.lead.company || "Sans nom — à compléter",
                phone: action.lead.phone || "",
                website: action.lead.website || "",
                email: action.lead.email || "",
                contact: action.lead.contact || "",
                tags: action.lead.tags || [],
                notes: action.lead.notes || [],
                nextAction: action.lead.nextAction || null,
                lastContact: action.lead.lastContact || null,
                extra: action.lead.extra || {},
                customFields: action.lead.customFields || [],
                dealValue: action.lead.dealValue ?? null,
                statusHistory: [{ columnId, at: now }],
                createdAt: now,
                archived: false,
            };
            return updateWs(state, ws.id, {
                leads: { ...ws.leads, [id]: lead },
            });
        }
        case "BULK_ADD_LEADS": {
            const ws = state.workspaces[action.workspaceId];
            if (!ws) return state;
            const firstCol = ws.columnOrder[0];
            const newLeads = { ...ws.leads };
            
            // Collect all extra fields from imported leads
            const allExtraKeys = new Set();
            action.leads.forEach((l) => {
                if (l.extra) {
                    Object.keys(l.extra).forEach((key) => {
                        allExtraKeys.add(`extra:${key}`);
                    });
                }
            });
            
            // Update cardFields to include new extra fields (visible by default)
            let updatedCardFields = [...(ws.cardFields || DEFAULT_CARD_FIELDS)];
            const existingFieldKeys = new Set(updatedCardFields.map(f => f.key));
            
            // Add new extra fields to cardFields if they don't exist
            [...allExtraKeys].forEach((extraKey) => {
                if (!existingFieldKeys.has(extraKey)) {
                    const label = extraKey.replace("extra:", "");
                    updatedCardFields.push({
                        key: extraKey,
                        label: label,
                        visible: true // Make imported fields visible by default
                    });
                }
            });
            
            action.leads.forEach((l) => {
                const id = uid();
                const now = new Date().toISOString();
                newLeads[id] = {
                    id,
                    columnId: firstCol,
                    company: l.company || "Sans nom — à compléter",
                    phone: l.phone || "",
                    website: l.website || "",
                    email: l.email || "",
                    contact: l.contact || "",
                    tags: [],
                    notes: [],
                    nextAction: null,
                    lastContact: null,
                    extra: l.extra || {},
                    customFields: [],
                    dealValue: null,
                    logoUrl: l.logoUrl || resolveLogo(l.website, l.email) || null,
                    statusHistory: [{ columnId: firstCol, at: now }],
                    createdAt: now,
                    archived: false,
                };
            });
            
            return updateWs(state, ws.id, { 
                leads: newLeads,
                cardFields: updatedCardFields
            });
        }
        case "UPDATE_LEAD": {
            const ws = state.workspaces[action.workspaceId];
            if (!ws) return state;
            const lead = ws.leads[action.leadId];
            if (!lead) return state;
            const patch = action.patch;
            // Recalculer le logo si website ou email change et qu'on n'a pas de logo fixé
            let logoUrl = lead.logoUrl;
            if ((patch.website !== undefined || patch.email !== undefined) && !lead.logoUrlManual) {
                const newWebsite = patch.website !== undefined ? patch.website : lead.website;
                const newEmail   = patch.email   !== undefined ? patch.email   : lead.email;
                logoUrl = resolveLogo(newWebsite, newEmail) || null;
            }
            return updateWs(state, ws.id, {
                leads: {
                    ...ws.leads,
                    [action.leadId]: { ...lead, ...patch, logoUrl },
                },
            });
        }
        case "MOVE_LEAD": {
            const ws = state.workspaces[action.workspaceId];
            if (!ws) return state;
            const lead = ws.leads[action.leadId];
            if (!lead || lead.columnId === action.toColumnId) return state;
            const now = new Date().toISOString();
            const targetCol = ws.columns[action.toColumnId];
            // Auto-followup: if the target column has it enabled, start a fresh stage 1.
            // Otherwise clear any existing followup.
            const autoFollowup = targetCol?.autoFollowup
                ? makeFollowup(action.toColumnId, 1, now)
                : null;
            // Also set/clear nextAction so the reminder is real (not just visual).
            // Preserve manual nextAction if the target column doesn't have followup
            // AND the existing nextAction is not from a previous auto-followup.
            let nextAction = lead.nextAction;
            if (autoFollowup) {
                nextAction = followupToNextAction(autoFollowup);
            } else if (nextAction?.auto) {
                // Was auto — clear it since we left the auto-followup column
                nextAction = null;
            }
            return updateWs(state, ws.id, {
                leads: {
                    ...ws.leads,
                    [action.leadId]: {
                        ...lead,
                        columnId: action.toColumnId,
                        statusHistory: [
                            ...(lead.statusHistory || []),
                            { columnId: action.toColumnId, at: now },
                        ],
                        autoFollowup,
                        nextAction,
                        contactedColumnEnteredAt: isContactedColumn(targetCol?.name || "")
                            ? (lead.contactedColumnEnteredAt || now)
                            : null,
                        staleInContacted: isContactedColumn(targetCol?.name || "")
                            ? lead.staleInContacted
                            : false,
                    },
                },
            });
        }
        case "SET_COLUMN_PROMPT_NOTE": {
            const ws = state.workspaces[action.workspaceId];
            if (!ws) return state;
            const col = ws.columns[action.columnId];
            if (!col) return state;
            return updateWs(state, ws.id, {
                columns: {
                    ...ws.columns,
                    [action.columnId]: {
                        ...col,
                        promptNoteOnEnter: !!action.enabled,
                    },
                },
            });
        }
        case "SET_COLUMN_AUTO_FOLLOWUP": {
            const ws = state.workspaces[action.workspaceId];
            if (!ws) return state;
            const col = ws.columns[action.columnId];
            if (!col) return state;
            return updateWs(state, ws.id, {
                columns: {
                    ...ws.columns,
                    [action.columnId]: {
                        ...col,
                        autoFollowup: !!action.enabled,
                    },
                },
            });
        }
        case "DISMISS_FOLLOWUP": {
            const ws = state.workspaces[action.workspaceId];
            if (!ws) return state;
            const lead = ws.leads[action.leadId];
            if (!lead) return state;
            return updateWs(state, ws.id, {
                leads: {
                    ...ws.leads,
                    [action.leadId]: {
                        ...lead,
                        autoFollowup: null,
                        // Clear nextAction only if it was auto-generated
                        nextAction: lead.nextAction?.auto
                            ? null
                            : lead.nextAction,
                    },
                },
            });
        }
        case "CHECK_FOLLOWUPS": {
            // Escalate any due followups + détecter les leads stales dans "Contacté".
            const now = Date.now();
            let changed = false;
            const newWorkspaces = { ...state.workspaces };
            for (const wsId of Object.keys(newWorkspaces)) {
                const ws = newWorkspaces[wsId];
                // ── Fast path : skip si aucun lead n'a d'autoFollowup NI de contactedColumnEnteredAt
                const hasAnyFollowup = Object.values(ws.leads).some(
                    (l) => l.autoFollowup || l.contactedColumnEnteredAt
                );
                if (!hasAnyFollowup) continue;

                let newLeads = ws.leads;
                let wsChanged = false;
                for (const leadId of Object.keys(ws.leads)) {
                    const l = ws.leads[leadId];

                    // ── Détection stale "Contacté" ─────────────────────────────
                    // Un lead est stale si :
                    //   1. Il a un contactedColumnEnteredAt (il est dans une colonne "contacté")
                    //   2. 3 jours ouvrés se sont écoulés depuis son entrée
                    //   3. Il n'est pas déjà marqué stale (évite les writes inutiles)
                    if (l.contactedColumnEnteredAt && !l.staleInContacted) {
                        const days = businessDaysSince(l.contactedColumnEnteredAt);
                        if (days >= STALE_BUSINESS_DAYS) {
                            if (!wsChanged) newLeads = { ...newLeads };
                            newLeads[leadId] = { ...l, staleInContacted: true };
                            wsChanged = true;
                            changed = true;
                        }
                    }

                    // ── Escalade auto-followup (logique existante) ─────────────
                    if (!l.autoFollowup) continue;
                    const dueTime = new Date(l.autoFollowup.dueAt).getTime();
                    if (dueTime > now) continue;
                    const stage = l.autoFollowup.stage;
                    // If lead was contacted after followup started, clear it.
                    const startedTime = new Date(
                        l.autoFollowup.startedAt,
                    ).getTime();
                    const contactedTime = l.lastContact
                        ? new Date(l.lastContact).getTime()
                        : 0;
                    if (contactedTime > startedTime) {
                        if (!wsChanged) newLeads = { ...newLeads };
                        newLeads[leadId] = {
                            ...newLeads[leadId],
                            autoFollowup: null,
                            nextAction: l.nextAction?.auto ? null : l.nextAction,
                        };
                        wsChanged = true;
                        changed = true;
                        continue;
                    }
                    if (stage < 3) {
                        const newFu = {
                            ...l.autoFollowup,
                            stage: stage + 1,
                            dueAt: addDaysISO(1, l.autoFollowup.dueAt),
                        };
                        if (!wsChanged) newLeads = { ...newLeads };
                        newLeads[leadId] = {
                            ...newLeads[leadId],
                            autoFollowup: newFu,
                            nextAction: followupToNextAction(newFu),
                        };
                        wsChanged = true;
                        changed = true;
                    } else {
                        if (!l.autoFollowup.overdue) {
                            const newFu = {
                                ...l.autoFollowup,
                                overdue: true,
                            };
                            if (!wsChanged) newLeads = { ...newLeads };
                            newLeads[leadId] = {
                                ...newLeads[leadId],
                                autoFollowup: newFu,
                                nextAction: {
                                    ...(l.nextAction || {}),
                                    date: isoToDate(l.autoFollowup.dueAt),
                                    dueAt: l.autoFollowup.dueAt,
                                    label: "Relance auto · en retard — à rappeler !",
                                    auto: true,
                                    stage: 3,
                                    overdue: true,
                                },
                            };
                            wsChanged = true;
                            changed = true;
                        }
                    }
                }
                if (wsChanged) newWorkspaces[wsId] = { ...ws, leads: newLeads };
            }
            if (!changed) return state;
            return { ...state, workspaces: newWorkspaces };
        }
        case "DELETE_LEAD": {
            const ws = state.workspaces[action.workspaceId];
            if (!ws) return state;
            const lead = ws.leads[action.leadId];
            if (!lead) return state;
            const { [action.leadId]: _rm, ...restLeads } = ws.leads;
            return {
                ...updateWs(state, ws.id, { leads: restLeads }),
                lastDeleted: { workspaceId: ws.id, lead },
            };
        }
        case "RESTORE_LAST_DELETED": {
            if (!state.lastDeleted) return state;
            const { workspaceId, lead } = state.lastDeleted;
            const ws = state.workspaces[workspaceId];
            if (!ws) return { ...state, lastDeleted: null };
            return {
                ...updateWs(state, ws.id, {
                    leads: { ...ws.leads, [lead.id]: lead },
                }),
                lastDeleted: null,
            };
        }
        case "CLEAR_LAST_DELETED":
            return { ...state, lastDeleted: null };

        case "ADD_NOTE": {
            const ws = state.workspaces[action.workspaceId];
            if (!ws) return state;
            const lead = ws.leads[action.leadId];
            if (!lead) return state;
            const note = {
                id: uid(),
                text: action.text,
                at: new Date().toISOString(),
            };
            return updateWs(state, ws.id, {
                leads: {
                    ...ws.leads,
                    [action.leadId]: {
                        ...lead,
                        notes: [note, ...(lead.notes || [])],
                        lastContact: new Date().toISOString(),
                    },
                },
            });
        }
        case "LOG_CONTACT": {
            // Quick "I contacted this lead today" action
            const ws = state.workspaces[action.workspaceId];
            if (!ws) return state;
            const lead = ws.leads[action.leadId];
            if (!lead) return state;
            const now = new Date().toISOString();
            const note = action.text
                ? [
                      {
                          id: uid(),
                          text: action.text,
                          at: now,
                      },
                      ...(lead.notes || []),
                  ]
                : lead.notes || [];

            // Auto-move vers la colonne "Contacté" si elle existe et que le lead n'y est pas déjà.
            // Utilise isContactedColumn (patterns centralisés) au lieu d'une comparaison exacte
            // sur "contacté" — couvre aussi "Appel", "Relance", "Call", etc.
            const contactedColumn = Object.values(ws.columns).find(
                (c) => isContactedColumn(c.name)
            );
            const shouldMove =
                contactedColumn && lead.columnId !== contactedColumn.id;

            let updatedLead = {
                ...lead,
                lastContact: now,
                notes: note,
                // Contact done → clear auto-followup + its auto nextAction
                autoFollowup: null,
                nextAction: lead.nextAction?.auto ? null : lead.nextAction,
            };

            let newLeadOrder = ws.leadOrder || {};

            if (shouldMove) {
                const targetCol = ws.columns[contactedColumn.id];
                const autoFollowup = targetCol?.autoFollowup
                    ? makeFollowup(contactedColumn.id, 1, now)
                    : null;
                updatedLead = {
                    ...updatedLead,
                    columnId: contactedColumn.id,
                    statusHistory: [
                        ...(lead.statusHistory || []),
                        { columnId: contactedColumn.id, at: now },
                    ],
                    autoFollowup,
                    nextAction: (autoFollowup && !lead.nextAction?.label?.startsWith("📅 RDV"))
                        ? followupToNextAction(autoFollowup)
                        : updatedLead.nextAction,
                    // Enregistrer l'entrée dans la colonne "Contacté"
                    contactedColumnEnteredAt: now,
                    staleInContacted: false,
                };
                // Update leadOrder: remove from source, prepend to destination
                const srcOrder = (ws.leadOrder?.[lead.columnId] || [])
                    .filter((id) => id !== action.leadId);
                const destOrder = [
                    action.leadId,
                    ...(ws.leadOrder?.[contactedColumn.id] || [])
                        .filter((id) => id !== action.leadId),
                ];
                newLeadOrder = {
                    ...newLeadOrder,
                    [lead.columnId]: srcOrder,
                    [contactedColumn.id]: destOrder,
                };
            }

            return updateWs(state, ws.id, {
                leads: {
                    ...ws.leads,
                    [action.leadId]: updatedLead,
                },
                leadOrder: newLeadOrder,
            });
        }
        case "SET_NEXT_ACTION": {
            const ws = state.workspaces[action.workspaceId];
            if (!ws) return state;
            const lead = ws.leads[action.leadId];
            if (!lead) return state;
            return updateWs(state, ws.id, {
                leads: {
                    ...ws.leads,
                    [action.leadId]: {
                        ...lead,
                        nextAction: action.nextAction,
                    },
                },
            });
        }
        case "ADD_CUSTOM_FIELD": {
            const ws = state.workspaces[action.workspaceId];
            if (!ws) return state;
            const lead = ws.leads[action.leadId];
            if (!lead) return state;
            const field = {
                id: uid(),
                label: action.label || "Champ",
                value: action.value || "",
                pinned: !!action.pinned,
            };
            return updateWs(state, ws.id, {
                leads: {
                    ...ws.leads,
                    [action.leadId]: {
                        ...lead,
                        customFields: [...(lead.customFields || []), field],
                    },
                },
            });
        }
        case "UPDATE_CUSTOM_FIELD": {
            const ws = state.workspaces[action.workspaceId];
            if (!ws) return state;
            const lead = ws.leads[action.leadId];
            if (!lead) return state;
            return updateWs(state, ws.id, {
                leads: {
                    ...ws.leads,
                    [action.leadId]: {
                        ...lead,
                        customFields: (lead.customFields || []).map((f) =>
                            f.id === action.fieldId ? { ...f, ...action.patch } : f,
                        ),
                    },
                },
            });
        }
        case "REMOVE_CUSTOM_FIELD": {
            const ws = state.workspaces[action.workspaceId];
            if (!ws) return state;
            const lead = ws.leads[action.leadId];
            if (!lead) return state;
            return updateWs(state, ws.id, {
                leads: {
                    ...ws.leads,
                    [action.leadId]: {
                        ...lead,
                        customFields: (lead.customFields || []).filter(
                            (f) => f.id !== action.fieldId,
                        ),
                    },
                },
            });
        }
        case "SET_CARD_FIELDS": {
            // action.fields = full array of { key, label, visible }
            const ws = state.workspaces[action.workspaceId];
            if (!ws) return state;
            return updateWs(state, ws.id, { cardFields: action.fields });
        }
        case "DELETE_EXTRA_FIELD": {
            // action.workspaceId, action.fieldKey (e.g. "extra:ville")
            // Removes the extra field from all leads and from cardFields
            const ws = state.workspaces[action.workspaceId];
            if (!ws) return state;
            const rawKey = action.fieldKey.replace(/^extra:/, "");
            // Strip from every lead's extra object
            const newLeads = {};
            Object.values(ws.leads).forEach((l) => {
                const { [rawKey]: _removed, ...restExtra } = l.extra || {};
                newLeads[l.id] = { ...l, extra: restExtra };
            });
            // Strip from cardFields
            const newCardFields = (ws.cardFields || []).filter(
                (f) => f.key !== action.fieldKey
            );
            return updateWs(state, ws.id, { leads: newLeads, cardFields: newCardFields });
        }
        case "SET_COLUMN_WIDTH": {
            // action.workspaceId, action.width (number 200-600)
            const ws = state.workspaces[action.workspaceId];
            if (!ws) return state;
            const w = Math.min(600, Math.max(200, action.width));
            return updateWs(state, ws.id, { columnWidth: w });
        }
        case "SET_CARD_SCALE": {
            // action.workspaceId, action.scale (number 0.7–1.0)
            const ws = state.workspaces[action.workspaceId];
            if (!ws) return state;
            const s = Math.min(1, Math.max(0.7, action.scale));
            return updateWs(state, ws.id, { cardScale: s });
        }
        case "SET_DEAL_VALUE": {
            // action.workspaceId, action.leadId, action.value (number | null)
            const ws = state.workspaces[action.workspaceId];
            if (!ws) return state;
            const lead = ws.leads[action.leadId];
            if (!lead) return state;
            return updateWs(state, ws.id, {
                leads: {
                    ...ws.leads,
                    [action.leadId]: {
                        ...lead,
                        dealValue: action.value,
                        dealClosedAt: action.value != null ? (lead.dealClosedAt || new Date().toISOString()) : null,
                    },
                },
            });
        }
        case "PROMOTE_EXTRA_FIELD": {
            // Crée un nouveau champ personnalisé avec le nom extraKey
            // pour TOUS les leads du workspace qui ont cette clé dans extra.
            // La valeur est copiée de extra[extraKey] vers customFields[]
            // SANS jamais écraser de données existantes.
            // action: { workspaceId, extraKey }
            const ws = state.workspaces[action.workspaceId];
            if (!ws) return state;

            const updatedLeads = { ...ws.leads };
            Object.values(ws.leads).forEach((lead) => {
                const val = lead.extra?.[action.extraKey];
                if (val == null || val === "") return; // Skip si pas de valeur

                // Vérifier si un custom field avec ce label existe déjà
                const existing = (lead.customFields || []).find(
                    (cf) => cf.label.toLowerCase() === action.extraKey.toLowerCase()
                );

                if (!existing) {
                    // Créer un nouveau custom field
                    updatedLeads[lead.id] = {
                        ...lead,
                        customFields: [
                            ...(lead.customFields || []),
                            {
                                id: uid(),
                                label: action.extraKey,
                                value: val,
                                pinned: false, // Par défaut non épinglé
                            },
                        ],
                    };
                } else if (existing.value === "" || existing.value == null) {
                    // Si le champ existe mais est vide, on peut le remplir
                    updatedLeads[lead.id] = {
                        ...lead,
                        customFields: lead.customFields.map((cf) =>
                            cf.id === existing.id ? { ...cf, value: val } : cf
                        ),
                    };
                }
                // Sinon ne rien faire (ne jamais écraser une valeur existante)
            });
            return updateWs(state, ws.id, { leads: updatedLeads });
        }

        case "HIGHLIGHT_EXTRA_FIELD": {
            // Crée un customField highlight:true depuis un champ extra sur UN seul lead.
            // action: { workspaceId, leadId, extraKey, extraValue }
            const ws = state.workspaces[action.workspaceId];
            if (!ws) return state;
            const lead = ws.leads[action.leadId];
            if (!lead) return state;
            // Ne pas créer en double
            const already = (lead.customFields || []).find(
                (cf) => cf.label === action.extraKey && cf.highlight
            );
            if (already) {
                // toggle off
                return updateWs(state, ws.id, {
                    leads: {
                        ...ws.leads,
                        [action.leadId]: {
                            ...lead,
                            customFields: (lead.customFields || []).map((cf) =>
                                cf.id === already.id ? { ...cf, highlight: false } : cf
                            ),
                        },
                    },
                });
            }
            const field = {
                id: uid(),
                label: action.extraKey,
                value: action.extraValue,
                pinned: false,
                highlight: true,
                fromExtra: true, // marqueur pour savoir que c'est une donnée importée
            };
            return updateWs(state, ws.id, {
                leads: {
                    ...ws.leads,
                    [action.leadId]: {
                        ...lead,
                        customFields: [...(lead.customFields || []), field],
                    },
                },
            });
        }
        case "HIGHLIGHT_FIELD_FOR_COLUMN": {
            // Épingle/désépingle un champ (par label/clé) sur TOUS les leads du workspace.
            // - Pour les champs extra (données importées) : crée un customField highlight:true si absent.
            // - Pour les customFields déjà promus : met à jour highlight sur tous ceux ayant le même label.
            // action: { workspaceId, fieldLabel, currentHighlight }
            // currentHighlight: true → désépingle partout, false → épingle partout
            const ws = state.workspaces[action.workspaceId];
            if (!ws) return state;

            const updatedLeads = { ...ws.leads };
            const newHighlight = !action.currentHighlight;

            Object.values(ws.leads).forEach((lead) => {

                const labelLower = action.fieldLabel.toLowerCase();
                const existing = (lead.customFields || []).find(
                    (cf) => cf.label.toLowerCase() === labelLower
                );

                if (existing) {
                    // Mettre à jour highlight sur le customField existant
                    updatedLeads[lead.id] = {
                        ...lead,
                        customFields: (lead.customFields || []).map((cf) =>
                            cf.label.toLowerCase() === labelLower
                                ? { ...cf, highlight: newHighlight }
                                : cf
                        ),
                    };
                } else if (newHighlight) {
                    // Pas encore de customField pour ce label → en créer un depuis extra si disponible
                    const extraVal = lead.extra?.[action.fieldLabel];
                    if (extraVal == null || extraVal === "") return;
                    updatedLeads[lead.id] = {
                        ...lead,
                        customFields: [
                            ...(lead.customFields || []),
                            {
                                id: uid(),
                                label: action.fieldLabel,
                                value: extraVal,
                                pinned: false,
                                highlight: true,
                                fromExtra: true,
                            },
                        ],
                    };
                }
            });

            return updateWs(state, ws.id, { leads: updatedLeads });
        }

        case "DELETE_LEAD_EXTRA_FIELD": {            // Supprime un champ extra sur TOUS les leads qui ont la même clé + valeur exacte.
            // action: { workspaceId, leadId, extraKey, extraValue }
            const ws = state.workspaces[action.workspaceId];
            if (!ws) return state;
            const sourceLead = ws.leads[action.leadId];
            if (!sourceLead) return state;
            const targetValue = action.extraValue; // valeur à matcher
            const newLeads = {};
            Object.values(ws.leads).forEach((l) => {
                const val = (l.extra || {})[action.extraKey];
                // Supprimer si même clé ET même valeur (ou si c'est le lead source)
                if (val !== undefined && (l.id === action.leadId || val === targetValue)) {
                    const { [action.extraKey]: _removed, ...restExtra } = l.extra || {};
                    newLeads[l.id] = { ...l, extra: restExtra };
                } else {
                    newLeads[l.id] = l;
                }
            });
            return updateWs(state, ws.id, { leads: newLeads });
        }

        case "RESTORE_SNAPSHOT":
            // Full state restore for undo — keep lastDeleted cleared
            return { ...action.snapshot, lastDeleted: null };

        default:
            return state;
    }
}

function updateWs(state, wsId, patch) {
    return {
        ...state,
        workspaces: {
            ...state.workspaces,
            [wsId]: { ...state.workspaces[wsId], ...patch },
        },
    };
}

// ---------- Context ----------
const CrmContext = createContext(null);

export function CrmProvider({ children }) {
    const [state, rawDispatch] = useReducer(reducer, initialState, (base) => {
        const saved = loadState();
        return saved ? { ...base, ...saved, lastDeleted: null } : base;
    });

    // storageError : true si le dernier saveState a échoué (quota dépassé).
    // Exposé dans le contexte pour permettre l'affichage d'une alerte persistante.
    const [storageError, setStorageError] = useState(false);

    // Undo stack — diffs légers (workspaces modifiés uniquement)
    // Chaque entrée = { changedWsIds, snapshots, topLevel } produit par makeDiff()
    const undoStackRef = useRef([]); // Array<diff>
    const redoStackRef = useRef([]); // Array<diff> — forward diffs pour redo
    const stateRef = useRef(state);
    stateRef.current = state;

    // Wrapped dispatch: pousse { before, after } sur le undo stack de façon synchrone
    const dispatch = useCallback(
        (action) => {
            if (!NON_UNDOABLE.has(action.type)) {
                const before = stripTransient(stateRef.current);
                const after  = stripTransient(reducer(stateRef.current, action));
                if (!statesAreEqual(before, after)) {
                    undoStackRef.current = [
                        ...undoStackRef.current.slice(-(MAX_UNDO_STACK - 1)),
                        { before, after },
                    ];
                    redoStackRef.current = [];
                }
            }
            rawDispatch(action);
        },
        [rawDispatch],
    );

    // Undo: restaure `before`, pousse l'entrée sur le redo stack
    const undo = useCallback(() => {
        const stack = undoStackRef.current;
        if (stack.length === 0) return false;
        const entry = stack[stack.length - 1];
        undoStackRef.current = stack.slice(0, -1);
        redoStackRef.current = [
            ...redoStackRef.current.slice(-(MAX_REDO_STACK - 1)),
            entry,
        ];
        rawDispatch({ type: "RESTORE_SNAPSHOT", snapshot: entry.before });
        return true;
    }, [rawDispatch]);

    // Redo: restaure `after`, remet l'entrée sur le undo stack
    const redo = useCallback(() => {
        const stack = redoStackRef.current;
        if (stack.length === 0) return false;
        const entry = stack[stack.length - 1];
        redoStackRef.current = stack.slice(0, -1);
        undoStackRef.current = [
            ...undoStackRef.current.slice(-(MAX_UNDO_STACK - 1)),
            entry,
        ];
        rawDispatch({ type: "RESTORE_SNAPSHOT", snapshot: entry.after });
        return true;
    }, [rawDispatch]);

    // batchDispatch : groupe plusieurs actions en UNE SEULE entrée undo/redo
    const batchDispatch = useCallback(
        (actions) => {
            if (!actions || actions.length === 0) return;
            const before = stripTransient(stateRef.current);
            let intermediate = stateRef.current;
            actions.forEach((action) => {
                intermediate = reducer(intermediate, action);
            });
            const after = stripTransient(intermediate);
            if (!statesAreEqual(before, after)) {
                undoStackRef.current = [
                    ...undoStackRef.current.slice(-(MAX_UNDO_STACK - 1)),
                    { before, after },
                ];
                redoStackRef.current = [];
            }
            actions.forEach((action) => rawDispatch(action));
        },
        [rawDispatch],
    );

    // Keyboard shortcut — Cmd+Z / Ctrl+Z  (undo)
    //                     Cmd+Shift+Z / Ctrl+Shift+Z  (redo)
    useEffect(() => {
        const onKey = (e) => {
            const isMac = navigator.platform.toUpperCase().includes("MAC");
            const modifier = isMac ? e.metaKey : e.ctrlKey;
            if (!modifier || e.key.toLowerCase() !== "z") return;

            // Don't intercept if focus is inside an input/textarea
            const tag = document.activeElement?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA") return;

            e.preventDefault();

            if (e.shiftKey) {
                // Redo
                const didRedo = redo();
                if (didRedo) {
                    import("sonner").then(({ toast }) =>
                        toast("Action rétablie", { duration: 2000 }),
                    );
                }
            } else {
                // Undo
                const didUndo = undo();
                if (didUndo) {
                    import("sonner").then(({ toast }) =>
                        toast("Action annulée", { duration: 2000 }),
                    );
                }
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [undo, redo]);

    // Persist to localStorage — debounce 500ms pour éviter de bloquer le thread
    // principal à chaque dispatch (JSON.stringify sur 300+ leads est coûteux).
    // onResult reçoit true si la sauvegarde a réussi, false si quota dépassé.
    useEffect(() => {
        saveStateDebounced(state, (ok) => {
            setStorageError(!ok);
        });
    }, [state]);

    // Flush immédiat avant que la page se ferme — garantit que rien n'est perdu
    useEffect(() => {
        const onUnload = () => {
            if (_saveDebounceTimer) {
                clearTimeout(_saveDebounceTimer);
                _saveDebounceTimer = null;
            }
            saveState(stateRef.current);
            // Backup final synchrone dans IndexedDB avant fermeture
            // (best-effort — les navigateurs accordent ~50ms aux handlers beforeunload)
            saveBackup(stateRef.current);
        };
        window.addEventListener("beforeunload", onUnload);
        return () => window.removeEventListener("beforeunload", onUnload);
    }, []);

    // Backup automatique en arrière-plan — toutes les 5 minutes, silencieux
    useEffect(() => {
        // On passe une fonction qui lit toujours l'état le plus récent via stateRef
        startAutoBackup(() => stateRef.current);
        return () => stopAutoBackup();
    }, []);

    // Apply theme class on <html>
    useEffect(() => {
        const root = document.documentElement;
        if (state.theme === "dark") root.classList.add("dark");
        else root.classList.remove("dark");
    }, [state.theme]);

    // Periodic follow-up check — toutes les 60s + à la mise au premier plan.
    // On throttle les appels focus à 10s min pour éviter les scans répétés
    // quand l'utilisateur change d'onglet rapidement.
    useEffect(() => {
        let lastCheck = 0;
        const run = () => {
            const now = Date.now();
            if (now - lastCheck < 10_000) return; // throttle : min 10s entre deux checks
            lastCheck = now;
            rawDispatch({ type: "CHECK_FOLLOWUPS" });
        };
        run(); // premier appel immédiat au montage
        const interval = setInterval(run, 60_000); // réduit de 30s → 60s
        const onFocus = () => run();
        window.addEventListener("focus", onFocus);
        return () => {
            clearInterval(interval);
            window.removeEventListener("focus", onFocus);
        };
    }, []);

    // Helpers stables (ne dépendent pas de state directement — lisent via stateRef)
    // Séparés de l'objet principal pour éviter que tout l'arbre re-render à chaque dispatch.
    const stableApi = useMemo(
        () => ({
            dispatch,
            batchDispatch,
            undo,
            redo,
            canUndo: () => undoStackRef.current.length > 0,
            canRedo: () => redoStackRef.current.length > 0,
            currentWorkspace: () =>
                stateRef.current.currentId
                    ? stateRef.current.workspaces[stateRef.current.currentId]
                    : null,
            exportBackup: () => {
                try {
                    const { lastDeleted: _ld, ...persistent } = stateRef.current;
                    const blob = new Blob([JSON.stringify(persistent, null, 2)], {
                        type: "application/json",
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    const date = new Date().toISOString().slice(0, 10);
                    a.href = url;
                    a.download = `crm-backup-${date}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    import("sonner").then(({ toast }) =>
                        toast.success("Backup exporté avec succès", { duration: 3000 })
                    );
                } catch (err) {
                    console.error("[CRM] Export échoué :", err);
                }
            },
            importBackup: (jsonString) => {
                try {
                    const parsed = JSON.parse(jsonString);
                    if (!parsed || !parsed.workspaces) throw new Error("Format invalide");
                    rawDispatch({ type: "RESTORE_SNAPSHOT", snapshot: parsed });
                    import("sonner").then(({ toast }) =>
                        toast.success("Backup restauré avec succès", { duration: 3000 })
                    );
                } catch {
                    import("sonner").then(({ toast }) =>
                        toast.error("Fichier de backup invalide", { duration: 4000 })
                    );
                }
            },
        }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [dispatch, batchDispatch, undo, redo], // rawDispatch est stable, dispatch/undo/redo aussi → ce memo ne se recrée jamais
    );

    // Objet final du contexte — state change à chaque dispatch, mais stableApi reste identique
    const api = useMemo(
        () => ({ state, storageError, ...stableApi }),
        [state, storageError, stableApi],
    );

    return <CrmContext.Provider value={api}>{children}</CrmContext.Provider>;
}

export function useCrm() {
    const ctx = useContext(CrmContext);
    if (!ctx) throw new Error("useCrm must be used within CrmProvider");
    return ctx;
}
