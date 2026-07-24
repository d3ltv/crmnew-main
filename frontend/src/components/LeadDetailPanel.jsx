import React, { useState, useEffect, useRef, useMemo } from "react";
import { useCrm } from "@/context/CrmContext";
import {
    X,
    Phone,
    Globe,
    Mail,
    User,
    Trash2,
    Tag,
    Plus,
    History,
    CheckCircle2,
    Euro,
    Trophy,
    ChevronDown,
    ArrowUp,
    Database,
    MessageSquare,
    Star,
    CalendarClock,
    Sparkles,
    Repeat2,
    MapPin,
    AlertTriangle,
} from "lucide-react";
import { CopyBtn } from "./CopyBtn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getColumnColor } from "@/lib/columnColors";
import {
    ensureWeekday,
    formatDateTimeLong,
    formatFutureRelativeFr,
    toLocalDateKey,
} from "@/lib/dateUtils";
import { telHref, mailtoHref, websiteHref } from "@/lib/actionLinks";
import { parseNote, detectAppointment, diffWithLead, formatDetected } from "@/lib/noteParser";
import { isManualRdv, isSuggestedRelance, makeRdvNextAction } from "@/lib/nextActionUtils";
import { AddToCalendarDialog, ConfirmSuggestedRelanceButton, QuickScheduleButton } from "./AddToCalendarDialog";
import { scheduleLeadNextAction, clearLeadSchedule } from "@/lib/scheduleLead";
import { getBestProspectingSlot } from "@/lib/prospectingSlots";
import { normalizeInconsistencyConfig } from "@/lib/inconsistencyRules";
import { PanelSectionCard, HiddenSectionsMenu, PanelSectionsOrganizer } from "./PanelSectionCard";
import {
    normalizePanelSections,
    visiblePanelSections,
    hiddenPanelSections,
    PANEL_SECTION_META,
    isSectionCollapsed,
    toggleCollapsedSection,
    extractLeadBrief,
    valueAsHref,
    displayUrl,
    reorderPanelSection,
} from "@/lib/panelSections";
import { detectInconsistencies } from "@/lib/inconsistencyRules";
import {
    getAgencySuspicion,
    isAgencyDetectionEnabled,
} from "@/lib/agencyDetection";
import { AgencySuspectBadge, AGENCY_NAME_CLS } from "./AgencySuspectBadge";

const SECTION_ICONS = { Database, User, MessageSquare, Repeat2, Tag, Trophy, History, CalendarClock };

function formatDateTime(iso) {
    return formatDateTimeLong(iso);
}

// ─────────────────────────────────────────────────────────────────────────────
// ── Canaux de relance disponibles ────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
const RELANCE_CANAUX = [
    { value: "Téléphone",  label: "Téléphone",   emoji: "📞" },
    { value: "Email",      label: "Email",        emoji: "✉️"  },
    { value: "SMS",        label: "SMS",          emoji: "💬" },
    { value: "LinkedIn",   label: "LinkedIn",     emoji: "💼" },
    { value: "WhatsApp",   label: "WhatsApp",     emoji: "📱" },
    { value: "Courrier",   label: "Courrier",     emoji: "📮" },
    { value: "Autre",      label: "Autre",        emoji: "🔁" },
];

// Couleurs par numéro de relance (1–7)
const RELANCE_COLORS = [
    { bg: "bg-sky-100 dark:bg-sky-900/40",       text: "text-sky-700 dark:text-sky-300",       dot: "bg-sky-500"     }, // 1
    { bg: "bg-blue-100 dark:bg-blue-900/40",      text: "text-blue-700 dark:text-blue-300",      dot: "bg-blue-500"    }, // 2
    { bg: "bg-violet-100 dark:bg-violet-900/40",  text: "text-violet-700 dark:text-violet-300",  dot: "bg-violet-500"  }, // 3
    { bg: "bg-amber-100 dark:bg-amber-900/40",    text: "text-amber-700 dark:text-amber-300",    dot: "bg-amber-500"   }, // 4
    { bg: "bg-orange-100 dark:bg-orange-900/40",  text: "text-orange-700 dark:text-orange-300",  dot: "bg-orange-500"  }, // 5
    { bg: "bg-rose-100 dark:bg-rose-900/40",      text: "text-rose-700 dark:text-rose-300",      dot: "bg-rose-500"    }, // 6
    { bg: "bg-red-100 dark:bg-red-900/40",        text: "text-red-700 dark:text-red-300",        dot: "bg-red-600"     }, // 7+
];
function getRelanceColor(num) {
    return RELANCE_COLORS[Math.min(num - 1, RELANCE_COLORS.length - 1)];
}

// ─────────────────────────────────────────────────────────────────────────────
// ── RelancesWidget (compact) ──────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
const RelancesWidget = ({ lead, workspace, dispatch }) => {
    const [canal, setCanal] = useState("Téléphone");
    const [note, setNote] = useState("");
    const [adding, setAdding] = useState(false);

    const relances = lead.relances || [];
    const nextNum = relances.length + 1;
    const maxRelances = 7;
    const atMax = relances.length >= maxRelances;

    const handleLog = () => {
        if (atMax) return;
        dispatch({
            type: "LOG_RELANCE",
            workspaceId: workspace.id,
            leadId: lead.id,
            canal,
            note: note.trim(),
        });
        toast.success(`Relance #${nextNum} · ${canal}`);
        setNote("");
        setAdding(false);
    };

    const handleDelete = (relanceId) => {
        dispatch({
            type: "DELETE_RELANCE",
            workspaceId: workspace.id,
            leadId: lead.id,
            relanceId,
        });
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2">
                {/* Pastilles compactes */}
                <div className="flex items-center gap-1 flex-1 min-w-0">
                    {Array.from({ length: maxRelances }, (_, i) => {
                        const num = i + 1;
                        const done = num <= relances.length;
                        const color = getRelanceColor(num);
                        const entry = relances[i];
                        return (
                            <div
                                key={num}
                                title={done && entry
                                    ? `#${num} · ${entry.canal} · ${new Date(entry.at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`
                                    : `Relance ${num}`}
                                className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-semibold tabular-nums select-none ${
                                    done
                                        ? `${color.bg} ${color.text}`
                                        : "bg-muted/50 text-muted-foreground/35"
                                }`}
                            >
                                {num}
                            </div>
                        );
                    })}
                    {relances.length > 0 && (
                        <span className="text-[11px] text-muted-foreground ml-1 tabular-nums">
                            {relances.length}/{maxRelances}
                        </span>
                    )}
                </div>
                {!atMax ? (
                    <button
                        type="button"
                        onClick={() => setAdding((v) => !v)}
                        className={`h-6 px-2 rounded-md text-[11px] font-medium transition-colors ${
                            adding
                                ? "bg-secondary text-foreground"
                                : "bg-primary/10 text-primary hover:bg-primary/15"
                        }`}
                    >
                        {adding ? "Annuler" : `+ #${nextNum}`}
                    </button>
                ) : (
                    <span className="text-[10px] text-muted-foreground">Max</span>
                )}
            </div>

            {adding && !atMax && (
                <div className="rounded-lg border border-border bg-muted/20 p-2.5 space-y-2">
                    <div className="flex flex-wrap gap-1">
                        {RELANCE_CANAUX.map((c) => (
                            <button
                                key={c.value}
                                type="button"
                                onClick={() => setCanal(c.value)}
                                className={`h-6 px-2 rounded-md text-[11px] transition-colors ${
                                    canal === c.value
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-card border border-border text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                {c.label}
                            </button>
                        ))}
                    </div>
                    <div className="flex gap-1.5">
                        <input
                            type="text"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleLog()}
                            placeholder="Note (optionnel)"
                            className="flex-1 h-7 px-2 rounded-md border border-border bg-background text-[12px] focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <button
                            type="button"
                            onClick={handleLog}
                            className="h-7 px-2.5 rounded-md text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                            OK
                        </button>
                    </div>
                </div>
            )}

            {relances.length > 0 && (
                <ul className="space-y-0.5">
                    {[...relances].reverse().map((r) => (
                        <li
                            key={r.id}
                            className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-muted/40 group text-[12px]"
                        >
                            <span className={`w-4 h-4 rounded flex items-center justify-center text-[9px] font-bold shrink-0 ${getRelanceColor(r.num).bg} ${getRelanceColor(r.num).text}`}>
                                {r.num}
                            </span>
                            <span className="font-medium text-foreground truncate">{r.canal}</span>
                            {r.note && (
                                <span className="text-muted-foreground truncate">· {r.note}</span>
                            )}
                            <span className="ml-auto text-[10px] text-muted-foreground shrink-0 tabular-nums">
                                {new Date(r.at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                            </span>
                            <button
                                type="button"
                                onClick={() => handleDelete(r.id)}
                                className="opacity-0 group-hover:opacity-70 hover:!opacity-100 text-muted-foreground hover:text-rose-500"
                                title="Supprimer"
                            >
                                <X size={11} />
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {relances.length === 0 && !adding && (
                <p className="text-[11px] text-muted-foreground/70 py-0.5">
                    Aucune relance — ajoutez la #1.
                </p>
            )}
        </div>
    );
};

export const LeadDetailPanel = ({ open, lead, workspace, onClose }) => {
    const { dispatch, state } = useCrm();
    const panelMode = state.leadPanelMode || "side";
    const [noteDraft, setNoteDraft] = useState("");
    const [tagDraft, setTagDraft] = useState("");
    const [cfLabel, setCfLabel] = useState("");
    const [cfValue, setCfValue] = useState("");
    const [lastAddedFieldLabel, setLastAddedFieldLabel] = useState(null);
    // RDV / calendrier
    const [calendarDialogOpen, setCalendarDialogOpen] = useState(false);
    const [calendarHint, setCalendarHint] = useState("");
    const [calendarDefaultLabel, setCalendarDefaultLabel] = useState("");
    // Sections réordonnables (zone B)
    const [dragSectionId, setDragSectionId] = useState(null);
    const [dragOverId, setDragOverId] = useState(null);
    const [dropPlace, setDropPlace] = useState(null); // "before" | "after"
    const panelRef = useRef(null);
    // Use the live lead from props directly — parent computes it from state.
    const local = lead;

    // Infos détectées dans l'ensemble des notes du lead
    const detectedFromNotes = useMemo(() => {
        if (!local) return [];
        const allText = (local.notes || []).map((n) => n.text).join("\n");
        if (!allText.trim()) return [];
        const { phones, emails, addresses } = parseNote(allText);
        return [
            ...phones.map((v) => ({ icon: "📞", value: v })),
            ...emails.map((v) => ({ icon: "✉️", value: v })),
            ...addresses.map((v) => ({ icon: "📍", value: v })),
        ];
    }, [local?.notes]);

    // Détection en temps réel dans le draft de note
    const draftDetected = useMemo(() => parseNote(noteDraft), [noteDraft]);
    const draftDiff = useMemo(
        () => local ? diffWithLead(draftDetected, local) : {
            newPhone: null, extraPhones: [], newEmail: null, newAddress: null,
            newContact: null, extraContacts: [], willAddPersons: [],
        },
        [draftDetected, local]
    );
    const draftDetectedItems = useMemo(() => formatDetected(draftDetected), [draftDetected]);
    const draftAppointment = useMemo(() => detectAppointment(noteDraft), [noteDraft]);

    const inconsistencies = useMemo(
        () => (local
            ? detectInconsistencies(local, workspace.columns, workspace.inconsistencyConfig)
            : []),
        [local, workspace.columns, workspace.inconsistencyConfig]
    );

    const agencySuspect = useMemo(
        () => (local
            ? getAgencySuspicion(local, isAgencyDetectionEnabled(workspace))
            : null),
        [local, workspace.agencyDetectionEnabled]
    );

    useEffect(() => {
        // Reset drafts when switching to a different lead
        setNoteDraft("");
        setTagDraft("");
        setCfLabel("");
        setCfValue("");
        setRdvDate("");
        setRdvTime("");
        setRdvLabel("");
    }, [lead?.id]);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "Escape" && open) onClose();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!open || !local) return null;

    const isJobs = workspace.template === "jobs";

    // ── Zone B : sections réordonnables (persistées par workspace) ──
    const layout = normalizePanelSections(workspace.panelSections);
    const persistLayout = (next) =>
        dispatch({ type: "SET_PANEL_SECTIONS", workspaceId: workspace.id, panelSections: next });

    const reorderSections = (draggedId, targetId, place = "before") => {
        if (!draggedId || !targetId) return;
        persistLayout(reorderPanelSection(layout, draggedId, targetId, place));
    };

    const hideSection = (sid) => {
        if (layout.hidden.includes(sid)) return;
        persistLayout({ ...layout, hidden: [...layout.hidden, sid] });
    };

    const restoreSection = (sid) => {
        persistLayout({ ...layout, hidden: layout.hidden.filter((id) => id !== sid) });
    };

    const sectionTitle = (id) => {
        switch (id) {
            case "contact":
                return isJobs ? "Entreprise & Recruteur" : "Contact & coordonnées";
            case "imported":
                return "Données importées";
            case "deal":
                return isJobs ? "Salaire proposé" : "Valeur du deal";
            case "relances":
                return "Relances";
            case "calendar":
                return "Calendrier";
            default:
                return PANEL_SECTION_META[id]?.label || id;
        }
    };

    const toggleCollapse = (sid) => {
        persistLayout(toggleCollapsedSection(layout, sid));
    };

    // ── Zone A : brief fixe ──
    const brief = extractLeadBrief(local);
    const showBrief = brief.hasBrief || inconsistencies.length > 0;

    const scheduleOverdue = useMemo(() => {
        if (!local?.nextAction?.dueAt && !local?.nextAction?.date) return false;
        const due = new Date(local.nextAction.dueAt || `${local.nextAction.date}T09:00:00`);
        return !Number.isNaN(due.getTime()) && due.getTime() < Date.now() - 60000;
    }, [local?.nextAction]);

    const prospectSlot = useMemo(() => {
        const allWs = (state.order || [])
            .map((id) => state.workspaces?.[id])
            .filter(Boolean);
        return getBestProspectingSlot(allWs);
    }, [state.workspaces, state.order]);

    const defaultRelanceDays = useMemo(() => {
        const cfg = normalizeInconsistencyConfig(workspace?.inconsistencyConfig);
        return cfg.thresholds?.noAnswerDays || 2;
    }, [workspace?.inconsistencyConfig]);

    const needsCalendarNudge = useMemo(() => {
        if (!local) return false;
        const watchAsks = inconsistencies.some(
            (i) => i.action?.type === "plan_rdv"
                || ["rdv_overdue", "no_answer_gap", "no_answer", "contact_gap", "stale_contact"].includes(i.id)
                || /rappel|relance|rdv|contact/i.test(`${i.title || ""} ${i.message || ""}`)
        );
        const fuOverdue = !!(local.autoFollowup && (
            local.autoFollowup.overdue
            || (local.autoFollowup.dueAt && new Date(local.autoFollowup.dueAt).getTime() <= Date.now())
        ));
        // Pas de prochain créneau futur → on propose d'en poser un
        const noFutureSlot = !local.nextAction || scheduleOverdue;
        return noFutureSlot && (watchAsks || fuOverdue || scheduleOverdue);
    }, [local, inconsistencies, scheduleOverdue]);

    const dismissInconsistency = (fingerprint) => {
        dispatch({
            type: "DISMISS_INCONSISTENCY",
            workspaceId: workspace.id,
            leadId: local.id,
            fingerprint,
        });
    };

    const patch = (p) => {
        dispatch({
            type: "UPDATE_LEAD",
            workspaceId: workspace.id,
            leadId: local.id,
            patch: p,
        });
    };

    const openCalendarScheduler = ({ hint = "", label = "" } = {}) => {
        setCalendarHint(hint);
        setCalendarDefaultLabel(label);
        setCalendarDialogOpen(true);
    };

    const applyCalendarReminder = (nextAction) => {
        const result = scheduleLeadNextAction(dispatch, {
            workspace,
            leadId: local.id,
            nextAction,
            move: true,
        });
        toast.success("Ajouté au calendrier", {
            description: result.moved && result.toColumnName
                ? `${nextAction.label} · déplacé vers « ${result.toColumnName} »`
                : nextAction.label,
        });
    };

    const clearSchedule = () => {
        clearLeadSchedule(dispatch, {
            workspaceId: workspace.id,
            leadId: local.id,
            dismissFollowup: true,
        });
        toast.success("Rendez-vous / rappel supprimé");
    };

    const runInconsistencyAction = (item) => {
        const action = item?.action;
        if (!action) return;
        if (action.type === "plan_rdv") {
            openCalendarScheduler({
                hint: item.message || "RDV / relance suggéré par la vigilance.",
                label: action.label || `Rappeler ${local.company || ""}`.trim(),
            });
            return;
        }
        if (action.type === "apply_field" && action.applyKey && action.value) {
            patch({ [action.applyKey]: action.value });
            toast.success("Enregistré", { description: String(action.value) });
        }
    };

    const changeStatus = (toColumnId) => {
        // Use MOVE_LEAD so statusHistory is updated
        dispatch({
            type: "MOVE_LEAD",
            workspaceId: workspace.id,
            leadId: local.id,
            toColumnId,
        });
    };

    const addNote = () => {
        if (!noteDraft.trim()) return;
        dispatch({
            type: "ADD_NOTE",
            workspaceId: workspace.id,
            leadId: local.id,
            text: noteDraft.trim(),
        });

        // Appliquer les infos détectées
        const nextPatch = {};
        if (draftDiff.newPhone) nextPatch.phone = draftDiff.newPhone;
        if (draftDiff.newEmail) nextPatch.email = draftDiff.newEmail;
        if (draftDiff.newContact) nextPatch.contact = draftDiff.newContact;

        // RDV détecté → nextAction (ne pas écraser un RDV existant plus récent)
        if (draftAppointment) {
            const existing = local.nextAction?.dueAt;
            const incomingTime = new Date(draftAppointment.iso).getTime();
            if (!existing || incomingTime < new Date(existing).getTime()) {
                nextPatch.nextAction = makeRdvNextAction({
                    date: toLocalDateKey(draftAppointment.iso),
                    dueAt: draftAppointment.iso,
                    label: `RDV détecté · ${draftAppointment.label}`,
                });
            }
        }

        if (Object.keys(nextPatch).length > 0) {
            dispatch({ type: "UPDATE_LEAD", workspaceId: workspace.id, leadId: local.id, patch: nextPatch });
        }

        // Téléphones supplémentaires → customFields
        draftDiff.extraPhones.forEach((phone) => {
            dispatch({ type: "ADD_CUSTOM_FIELD", workspaceId: workspace.id, leadId: local.id, label: "Téléphone", value: phone, pinned: false });
        });
        (draftDiff.extraContacts || []).forEach((person) => {
            dispatch({
                type: "ADD_CUSTOM_FIELD",
                workspaceId: workspace.id,
                leadId: local.id,
                label: "Contact",
                value: person,
                pinned: false,
                highlight: true,
            });
        });
        if (draftDiff.newAddress) {
            dispatch({ type: "ADD_CUSTOM_FIELD", workspaceId: workspace.id, leadId: local.id, label: "Adresse", value: draftDiff.newAddress, pinned: false });
        }

        const noteText = noteDraft.trim();
        setNoteDraft("");

        if (draftAppointment) {
            toast.success("Note + RDV au calendrier", {
                description: draftAppointment.label,
            });
        } else if (/pas\s*de\s*r[eé]ponse|ne\s*r[eé]pond|rappeler|relancer|📵|📞/i.test(noteText)) {
            toast.message("Note enregistrée", {
                description: "Placez un rappel calendrier ?",
                action: {
                    label: "Calendrier",
                    onClick: () => openCalendarScheduler({
                        hint: "Suite à votre note — choisissez quand rappeler.",
                        label: `Rappeler ${local.company || ""}`.trim(),
                    }),
                },
            });
        }
    };

    const addTag = () => {
        const clean = tagDraft.trim();
        if (!clean) return;
        if ((local.tags || []).includes(clean)) {
            setTagDraft("");
            return;
        }
        patch({ tags: [...(local.tags || []), clean] });
        setTagDraft("");
    };

    const removeTag = (t) => {
        patch({ tags: (local.tags || []).filter((x) => x !== t) });
    };

    const addCustomField = () => {
        const l = cfLabel.trim();
        if (!l) return;
        dispatch({
            type: "ADD_CUSTOM_FIELD",
            workspaceId: workspace.id,
            leadId: local.id,
            label: l,
            value: cfValue.trim(),
            pinned: false,
        });
        setCfLabel("");
        setCfValue("");
    };

    const updateCustomField = (fieldId, patch) => {
        dispatch({
            type: "UPDATE_CUSTOM_FIELD",
            workspaceId: workspace.id,
            leadId: local.id,
            fieldId,
            patch,
        });
    };

    const toggleHighlightCustomField = (fieldId, current, fieldLabel) => {
        // Épingle/désépingle sur TOUS les leads du workspace ayant ce label
        dispatch({
            type: "HIGHLIGHT_FIELD_FOR_COLUMN",
            workspaceId: workspace.id,
            fieldLabel,
            currentHighlight: current,
        });
    };

    const highlightExtraField = (extraKey, extraValue) => {
        // Vérifie l'état actuel : y a-t-il déjà un customField highlight pour cette clé ?
        const currentHighlight = !!(local.customFields || []).find(
            (cf) => cf.label === extraKey && cf.highlight
        );
        // Épingle/désépingle sur TOUS les leads du workspace ayant cette clé
        dispatch({
            type: "HIGHLIGHT_FIELD_FOR_COLUMN",
            workspaceId: workspace.id,
            fieldLabel: extraKey,
            currentHighlight,
        });
    };

    const removeCustomField = (fieldId) => {
        dispatch({
            type: "REMOVE_CUSTOM_FIELD",
            workspaceId: workspace.id,
            leadId: local.id,
            fieldId,
        });
    };

    const logContactToday = () => {
        dispatch({
            type: "LOG_CONTACT",
            workspaceId: workspace.id,
            leadId: local.id,
            text: `Contact enregistré depuis « ${workspace.columns[local.columnId]?.name} »`,
        });
        toast.success("Contact du jour enregistré");
    };

    const deleteLead = () => {
        dispatch({
            type: "DELETE_LEAD",
            workspaceId: workspace.id,
            leadId: local.id,
        });
        toast("Lead supprimé", {
            description: local.company,
            action: {
                label: "Annuler",
                onClick: () => dispatch({ type: "RESTORE_LAST_DELETED" }),
            },
            duration: 6000,
        });
        onClose();
    };

    // Promouvoir un champ importé (extra) vers un champ personnalisé
    // et mettre à jour TOUS les leads du workspace qui ont cette clé extra.
    // Ne jamais écraser une donnée existante.
    const promoteExtraField = (extraKey) => {
        dispatch({
            type: "PROMOTE_EXTRA_FIELD",
            workspaceId: workspace.id,
            extraKey,
        });
        const affectedCount = Object.values(workspace.leads).filter(
            (l) => l.extra?.[extraKey] && !(l.customFields || []).find(
                (cf) => cf.label.toLowerCase() === extraKey.toLowerCase() && cf.value
            )
        ).length;
        toast.success(`« ${extraKey} » ajouté aux infos`, {
            description: `${affectedCount} lead${affectedCount > 1 ? "s" : ""} mis à jour · données existantes préservées`,
        });
    };

    // Supprimer un champ extra sur tous les leads ayant la même clé + valeur exacte
    const deleteLeadExtraField = (extraKey, extraValue) => {
        const affectedCount = Object.values(workspace.leads).filter(
            (l) => (l.extra || {})[extraKey] === extraValue
        ).length;
        dispatch({
            type: "DELETE_LEAD_EXTRA_FIELD",
            workspaceId: workspace.id,
            leadId: local.id,
            extraKey,
            extraValue,
        });
        toast.success(`« ${extraKey} » supprimé`, {
            description: affectedCount > 1
                ? `${affectedCount} leads mis à jour (valeur identique)`
                : "Supprimé sur ce lead",
        });
    };

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-[3px] animate-in fade-in duration-200"
                onClick={onClose}
                data-testid="lead-panel-backdrop"
            />
            {/* Panel — floating sheet on desktop, full-screen on mobile */}
            <aside
                ref={panelRef}
                data-testid="lead-detail-panel"
                className={panelMode === "modal"
                    ? "fixed z-50 flex flex-col inset-0 sm:inset-auto sm:top-[3%] sm:bottom-[3%] sm:left-1/2 sm:-translate-x-1/2 w-full sm:w-[780px] bg-card sm:rounded-xl sm:border border-border shadow-panel animate-in fade-in zoom-in-95 duration-200"
                    : "fixed z-50 flex flex-col inset-0 sm:inset-auto sm:top-4 sm:bottom-4 sm:right-4 w-full sm:w-[560px] bg-card sm:rounded-xl sm:border border-border shadow-panel animate-in slide-in-from-right duration-300"}
            >
                <div className="border-b border-border bg-card px-5 py-4 flex items-start justify-between gap-3 rounded-t-xl shrink-0">
                    <div className="min-w-0 flex-1">
                        <input
                            data-testid="lead-company-input"
                            value={local.company || ""}
                            onChange={(e) => patch({ company: e.target.value })}
                            className={`w-full bg-transparent text-xl sm:text-2xl font-semibold tracking-tight outline-none focus:ring-2 focus:ring-primary rounded px-1 -mx-1 ${
                                agencySuspect ? AGENCY_NAME_CLS : ""
                            }`}
                            placeholder={isJobs ? "Nom de l'entreprise / Poste" : "Nom de l'entreprise"}
                        />
                        {agencySuspect && (
                            <div
                                className="mt-2 flex flex-wrap items-center gap-2"
                                data-testid="lead-agency-suspect-banner"
                            >
                                <AgencySuspectBadge
                                    score={agencySuspect.score}
                                    label={agencySuspect.label}
                                />
                                <span className="text-[12px] text-orange-700/90 dark:text-orange-300/90">
                                    {agencySuspect.label}
                                </span>
                            </div>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <span
                                className={`w-2 h-2 rounded-full ${getColumnColor(workspace.columns[local.columnId]).dot} shrink-0`}
                                aria-hidden
                            />
                            <Select
                                value={local.columnId}
                                onValueChange={(v) => changeStatus(v)}
                            >
                                <SelectTrigger
                                    data-testid="lead-status-select"
                                    className="h-8 w-auto text-xs rounded-full bg-secondary border-0 px-3 gap-1.5"
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {workspace.columnOrder.map((cid) => {
                                        const c = workspace.columns[cid];
                                        const cc = getColumnColor(c);
                                        return (
                                            <SelectItem key={cid} value={cid}>
                                                <span className="flex items-center gap-2">
                                                    <span
                                                        className={`w-2 h-2 rounded-full ${cc.dot}`}
                                                    />
                                                    {c.name}
                                                </span>
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>
                            <Button
                                onClick={logContactToday}
                                data-testid="lead-log-today-btn"
                                variant="ghost"
                                className="h-8 rounded-full px-2 sm:px-3 text-xs text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                            >
                                <CheckCircle2 size={13} className="mr-1" />
                                <span className="hidden xs:inline">{isJobs ? "Relancé aujourd'hui" : "Contacté aujourd'hui"}</span>
                                <span className="xs:hidden">{isJobs ? "Relancé" : "Contacté"}</span>
                            </Button>                        </div>
                    </div>
                    <button
                        data-testid="lead-panel-close-btn"
                        onClick={onClose}
                        aria-label="Fermer"
                        className="w-11 h-11 shrink-0 rounded-full hover:bg-secondary flex items-center justify-center text-muted-foreground"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-muted/30">
                    {/* ═══════════ ZONE A — fixe : Information pertinente + prochaine action ═══════════ */}

                    {/* 🧾 Brief interactif — personnalisé par lead (import + notes) */}
                    {showBrief && (
                        <div
                            className="rounded-xl border border-border bg-card p-3.5 space-y-2.5 shadow-sm"
                            data-testid="lead-brief-strip"
                        >
                            {/* Badge info pertinente */}
                            {(brief.hasPertinent || inconsistencies.length > 0) && (
                                <div className="flex items-center gap-1.5 text-[11px] font-medium text-primary">
                                    <Sparkles size={12} strokeWidth={2} className="sparkle-icon shrink-0" />
                                    <span>Information pertinente</span>
                                    {brief.insights.some((i) => i.source === "note") && (
                                        <span className="text-muted-foreground font-normal">· notes</span>
                                    )}
                                    {brief.insights.some((i) => i.source === "import") && (
                                        <span className="text-muted-foreground font-normal">· import</span>
                                    )}
                                </div>
                            )}

                            {brief.jobTitle && (
                                <div className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
                                    {brief.jobTitle}
                                </div>
                            )}

                            {(brief.location || brief.contract) && (
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                                    {brief.location && (
                                        <span className="inline-flex items-center gap-1">
                                            <MapPin size={11} className="shrink-0" />
                                            {brief.location}
                                        </span>
                                    )}
                                    {brief.location && brief.contract && <span>·</span>}
                                    {brief.contract && <span>{brief.contract}</span>}
                                </div>
                            )}

                            {/* Contact / tél / email — interactifs + copiables */}
                            {(brief.contact || brief.phone || brief.email) && (
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-foreground">
                                    {brief.contact && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (!local.contact && brief.contact) {
                                                    patch({ contact: brief.contact });
                                                    toast.success("Contact enregistré", { description: brief.contact });
                                                }
                                            }}
                                            className="inline-flex items-center gap-1 group/row rounded-md hover:bg-muted/60 px-1 -mx-1 py-0.5 transition-colors text-left"
                                            title={local.contact ? "Contact du lead" : "Cliquer pour enregistrer comme contact"}
                                        >
                                            <User size={11} className="text-muted-foreground shrink-0" />
                                            <span className="font-semibold">{brief.contact}</span>
                                            {brief.contactSource === "note" && !local.contact && (
                                                <span className="text-[9px] text-primary font-medium">noter</span>
                                            )}
                                            <CopyBtn value={brief.contact} className="opacity-0 group-hover/row:opacity-100" />
                                        </button>
                                    )}
                                    {brief.phone && (
                                        <span className="inline-flex items-center gap-1 group/row">
                                            <Phone size={11} className="text-muted-foreground shrink-0" />
                                            <a
                                                href={telHref(brief.phone) || undefined}
                                                className="font-medium hover:text-primary tabular-nums"
                                            >
                                                {brief.phone}
                                            </a>
                                            {!local.phone && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        patch({ phone: brief.phone });
                                                        toast.success("Téléphone enregistré");
                                                    }}
                                                    className="text-[9px] text-primary font-medium hover:underline"
                                                >
                                                    noter
                                                </button>
                                            )}
                                            <CopyBtn value={brief.phone} className="opacity-0 group-hover/row:opacity-100" />
                                        </span>
                                    )}
                                    {brief.email && (
                                        <span className="inline-flex items-center gap-1 group/row min-w-0">
                                            <Mail size={11} className="text-muted-foreground shrink-0" />
                                            <a
                                                href={mailtoHref(brief.email) || undefined}
                                                className="font-medium hover:text-primary truncate max-w-[180px]"
                                            >
                                                {brief.email}
                                            </a>
                                            {!local.email && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        patch({ email: brief.email });
                                                        toast.success("Email enregistré");
                                                    }}
                                                    className="text-[9px] text-primary font-medium hover:underline"
                                                >
                                                    noter
                                                </button>
                                            )}
                                            <CopyBtn value={brief.email} className="opacity-0 group-hover/row:opacity-100" />
                                        </span>
                                    )}
                                </div>
                            )}

                            {/* Insights actionnables */}
                            {brief.insights.filter((i) => i.actionable).length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {brief.insights.filter((i) => i.actionable).map((ins) => (
                                        <button
                                            key={`${ins.type}-${ins.value}`}
                                            type="button"
                                            onClick={() => {
                                                if (!ins.applyKey) return;
                                                patch({ [ins.applyKey]: ins.value });
                                                toast.success(`${ins.label} enregistré`, { description: ins.value });
                                            }}
                                            className="inline-flex items-center gap-1 max-w-full h-6 px-2 rounded-md text-[11px] bg-primary/8 text-primary border border-primary/15 hover:bg-primary/15 transition-colors"
                                            title={`Enregistrer comme ${ins.applyKey}`}
                                        >
                                            <Sparkles size={10} className="sparkle-icon shrink-0" />
                                            <span className="truncate">{ins.value}</span>
                                            <span className="opacity-70 shrink-0">+</span>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Liens — empilés verticalement, lisibles */}
                            {brief.links.length > 0 && (
                                <div className="flex flex-col gap-0.5 min-w-0">
                                    {brief.links.map((l) => (
                                        <a
                                            key={l.href}
                                            href={l.href}
                                            target="_blank"
                                            rel="noreferrer noopener"
                                            className="text-[12px] text-primary hover:underline truncate block"
                                            title={l.href}
                                        >
                                            {l.display || displayUrl(l.href)}
                                        </a>
                                    ))}
                                </div>
                            )}

                            {/* À surveiller — uniquement si pertinent, sous les infos / sites */}
                            {inconsistencies.length > 0 && (
                                <div
                                    className="pt-2 mt-0.5 border-t border-border/70 space-y-1.5"
                                    data-testid="lead-inconsistency-strip"
                                >
                                    <div className="flex items-center gap-2 text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                                        <AlertTriangle size={12} strokeWidth={2.25} className="shrink-0" />
                                        <span>À surveiller</span>
                                        <span className="tabular-nums text-rose-600/80 dark:text-rose-400/80 font-bold">
                                            · {inconsistencies.length}
                                        </span>
                                    </div>
                                    <ul className="space-y-1.5">
                                        {inconsistencies.map((item) => {
                                            const isCrit = item.severity === "critical";
                                            const isWarn = item.severity === "warning";
                                            return (
                                                <li
                                                    key={item.fingerprint}
                                                    className={`flex items-start gap-2 rounded-lg px-2.5 py-2 text-[12.5px] leading-snug ${
                                                        isCrit
                                                            ? "bg-rose-500/12 text-rose-800 dark:text-rose-200"
                                                            : isWarn
                                                                ? "bg-amber-500/10 text-amber-900 dark:text-amber-100"
                                                                : "bg-muted/60 text-foreground/80"
                                                    }`}
                                                    data-testid={`lead-inconsistency-${item.id}`}
                                                >
                                                    <span
                                                        className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                                                            isCrit ? "bg-rose-500" : isWarn ? "bg-amber-500" : "bg-muted-foreground/50"
                                                        }`}
                                                        aria-hidden
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-semibold text-[12px]">{item.title}</div>
                                                        <div className="text-[12px] opacity-90 mt-0.5">{item.message}</div>
                                                    </div>
                                                    {item.action && item.action.type !== "plan_rdv" && (
                                                        <button
                                                            type="button"
                                                            onClick={() => runInconsistencyAction(item)}
                                                            className="shrink-0 h-7 px-2 rounded-md text-[11px] font-semibold bg-background/80 border border-border/80 hover:bg-background text-foreground"
                                                            data-testid={`inconsistency-action-${item.id}`}
                                                        >
                                                            Enregistrer
                                                        </button>
                                                    )}
                                                    {item.dismissible !== false && (
                                                        <button
                                                            type="button"
                                                            onClick={() => dismissInconsistency(item.fingerprint)}
                                                            title="Ignorer cette alerte"
                                                            aria-label="Ignorer"
                                                            className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-background/60"
                                                            data-testid={`dismiss-inconsistency-${item.id}`}
                                                        >
                                                            <X size={13} strokeWidth={2} />
                                                        </button>
                                                    )}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}

                    {needsCalendarNudge && (
                        <div
                            className="flex items-center gap-2.5 rounded-xl border border-violet-500/30 bg-violet-500/[0.08] px-3 py-2.5"
                            data-testid="lead-calendar-nudge"
                        >
                            <div className="min-w-0 flex-1">
                                <p className="text-[12px] font-semibold text-violet-800 dark:text-violet-200 leading-snug">
                                    Bloquez un moment pour rappeler
                                </p>
                                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                                    {scheduleOverdue
                                        ? "Le rappel en cours est dépassé — choisissez un nouveau créneau."
                                        : "Prenez un créneau dans votre journée pour rappeler ce prospect."}
                                </p>
                            </div>
                            <QuickScheduleButton
                                company={local.company || ""}
                                defaultLabel={`Rappeler ${local.company || ""}`.trim()}
                                hint="Choisissez quand rappeler ce prospect."
                                size="sm"
                                testId="lead-watch-schedule-btn"
                                onConfirm={applyCalendarReminder}
                                className="border-violet-500/40 bg-violet-500/15 text-violet-700 dark:text-violet-300 hover:bg-violet-500/25"
                            />
                        </div>
                    )}

                    {/* ═══════════ ZONE B — sections réordonnables ═══════════ */}
                    <div className="flex items-center justify-between gap-2 -mb-1">
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                            Sections
                        </p>
                        <PanelSectionsOrganizer
                            layout={layout}
                            onChange={persistLayout}
                            getTitle={sectionTitle}
                        />
                    </div>
                    {visiblePanelSections(layout).map((id) => {
                        if (id === "imported" && !(local.extra && Object.keys(local.extra).length > 0)) return null;
                        if (id === "history" && (local.statusHistory || []).length === 0) return null;

                        const sectionProps = {
                            key: id,
                            id,
                            title: sectionTitle(id),
                            icon: SECTION_ICONS[PANEL_SECTION_META[id]?.icon],
                            onHide: hideSection,
                            onDragStart: (sid) => {
                                setDragSectionId(sid);
                                if (!sid) {
                                    setDragOverId(null);
                                    setDropPlace(null);
                                }
                            },
                            onDragOver: (sid, place) => {
                                setDragOverId(sid);
                                setDropPlace(place);
                            },
                            onDrop: (targetId, place) => {
                                reorderSections(dragSectionId, targetId, place);
                                setDragOverId(null);
                                setDropPlace(null);
                                setDragSectionId(null);
                            },
                            dragOver: dragOverId === id && dragSectionId && dragSectionId !== id,
                            dropPlace: dragOverId === id ? dropPlace : null,
                            isDragging: dragSectionId === id,
                            collapsed: isSectionCollapsed(layout, id),
                            onToggleCollapse: toggleCollapse,
                            badge: id === "imported" && local.extra
                                ? Object.keys(local.extra).length
                                : id === "relances" && (local.relances || []).length > 0
                                    ? (local.relances || []).length
                                    : undefined,
                        };

                        switch (id) {
                            case "imported": {
                                return (
                                    <PanelSectionCard {...sectionProps}>
                                        <div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
                                            {Object.entries(local.extra).map(([k, v]) => {
                                                const alreadyPromoted = (local.customFields || []).some(
                                                    (cf) => cf.label.toLowerCase() === k.toLowerCase() && cf.value
                                                );
                                                const isHighlighted = (local.customFields || []).some(
                                                    (cf) => cf.label === k && cf.highlight
                                                );
                                                const href = valueAsHref(v);
                                                return (
                                                    <div
                                                        key={k}
                                                        className="flex items-start gap-2 px-3 py-2 hover:bg-muted/30 transition-colors group"
                                                    >
                                                        <div className="flex-1 min-w-0 grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-2 text-sm">
                                                            <span className="text-muted-foreground truncate text-[11px] font-medium pt-0.5">{k}</span>
                                                            <span className="min-w-0 flex items-start gap-1 group/row">
                                                                {href ? (
                                                                    <a
                                                                        href={href}
                                                                        target="_blank"
                                                                        rel="noreferrer noopener"
                                                                        className="text-[12px] text-primary hover:underline break-all leading-snug"
                                                                    >
                                                                        {displayUrl(href)}
                                                                    </a>
                                                                ) : (
                                                                    <span className="text-[12px] break-words leading-snug">{String(v)}</span>
                                                                )}
                                                                <CopyBtn value={String(v)} className="opacity-0 group-hover/row:opacity-100 mt-0.5" />
                                                            </span>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => highlightExtraField(k, v)}
                                                            title={isHighlighted ? "Retirer de la carte Kanban" : "Afficher sur la carte Kanban"}
                                                            className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center transition-colors ${
                                                                isHighlighted
                                                                    ? "text-amber-500 bg-amber-500/10"
                                                                    : "text-muted-foreground/40 hover:text-amber-500 hover:bg-amber-500/10 opacity-0 group-hover:opacity-100"
                                                            }`}
                                                        >
                                                            <Star size={11} strokeWidth={2} className={isHighlighted ? "fill-amber-500" : ""} />
                                                        </button>
                                                        {alreadyPromoted ? (
                                                            <span className="shrink-0 text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center mt-1">
                                                                <CheckCircle2 size={11} />
                                                            </span>
                                                        ) : (
                                                            <ExtraPromoteButton
                                                                extraKey={k}
                                                                value={v}
                                                                onPromote={promoteExtraField}
                                                            />
                                                        )}
                                                        <ExtraDeleteButton
                                                            extraKey={k}
                                                            extraValue={v}
                                                            onDelete={deleteLeadExtraField}
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <p className="text-[11px] text-muted-foreground px-0.5">
                                            ↑ Ajoute le champ sur <strong>tous les leads</strong> sans écraser.
                                        </p>
                                    </PanelSectionCard>
                                );
                            }

                            case "contact": {
                                return (
                                    <PanelSectionCard {...sectionProps}>
                                        <div className="space-y-2.5">
                                            <FieldGroup
                                                icon={User}
                                                label={isJobs ? "Recruteur / Contact RH" : "Contact"}
                                                baseLabel={isJobs ? "Contact RH" : "Contact"}
                                                value={local.contact}
                                                onChange={(v) => patch({ contact: v })}
                                                testId="lead-contact-input"
                                                customFields={local.customFields || []}
                                                lastAddedFieldLabel={lastAddedFieldLabel}
                                                onClearLastAdded={() => setLastAddedFieldLabel(null)}
                                                onAdd={(label) => { dispatch({ type: "ADD_CUSTOM_FIELD", workspaceId: workspace.id, leadId: local.id, label, value: "", pinned: false, isMainDuplicate: true }); setLastAddedFieldLabel(label); }}
                                                onUpdateCf={(cid, v) => updateCustomField(cid, { value: v })}
                                                onDeleteCf={(cid) => dispatch({ type: "REMOVE_CUSTOM_FIELD", workspaceId: workspace.id, leadId: local.id, fieldId: cid })}
                                            />
                                            <FieldGroup
                                                icon={Phone}
                                                label="Téléphone"
                                                baseLabel="Téléphone"
                                                value={local.phone}
                                                onChange={(v) => patch({ phone: v })}
                                                testId="lead-phone-input"
                                                type="tel"
                                                linkHref={telHref(local.phone)}
                                                customFields={local.customFields || []}
                                                lastAddedFieldLabel={lastAddedFieldLabel}
                                                onClearLastAdded={() => setLastAddedFieldLabel(null)}
                                                onAdd={(label) => { dispatch({ type: "ADD_CUSTOM_FIELD", workspaceId: workspace.id, leadId: local.id, label, value: "", pinned: false, isMainDuplicate: true }); setLastAddedFieldLabel(label); }}
                                                onUpdateCf={(cid, v) => updateCustomField(cid, { value: v })}
                                                onDeleteCf={(cid) => dispatch({ type: "REMOVE_CUSTOM_FIELD", workspaceId: workspace.id, leadId: local.id, fieldId: cid })}
                                            />
                                            <FieldGroup
                                                icon={Mail}
                                                label="Email"
                                                baseLabel="Email"
                                                value={local.email}
                                                onChange={(v) => patch({ email: v })}
                                                testId="lead-email-input"
                                                type="email"
                                                linkHref={mailtoHref(local.email)}
                                                customFields={local.customFields || []}
                                                lastAddedFieldLabel={lastAddedFieldLabel}
                                                onClearLastAdded={() => setLastAddedFieldLabel(null)}
                                                onAdd={(label) => { dispatch({ type: "ADD_CUSTOM_FIELD", workspaceId: workspace.id, leadId: local.id, label, value: "", pinned: false, isMainDuplicate: true }); setLastAddedFieldLabel(label); }}
                                                onUpdateCf={(cid, v) => updateCustomField(cid, { value: v })}
                                                onDeleteCf={(cid) => dispatch({ type: "REMOVE_CUSTOM_FIELD", workspaceId: workspace.id, leadId: local.id, fieldId: cid })}
                                            />
                                            <FieldGroup
                                                icon={Globe}
                                                label={isJobs ? "Lien offre / Site entreprise" : "Site web"}
                                                baseLabel={isJobs ? "Site" : "Site web"}
                                                value={local.website}
                                                onChange={(v) => patch({ website: v })}
                                                testId="lead-website-input"
                                                linkHref={websiteHref(local.website)}
                                                linkIsExternal
                                                customFields={local.customFields || []}
                                                lastAddedFieldLabel={lastAddedFieldLabel}
                                                onClearLastAdded={() => setLastAddedFieldLabel(null)}
                                                onAdd={(label) => { dispatch({ type: "ADD_CUSTOM_FIELD", workspaceId: workspace.id, leadId: local.id, label, value: "", pinned: false, isMainDuplicate: true }); setLastAddedFieldLabel(label); }}
                                                onUpdateCf={(cid, v) => updateCustomField(cid, { value: v })}
                                                onDeleteCf={(cid) => dispatch({ type: "REMOVE_CUSTOM_FIELD", workspaceId: workspace.id, leadId: local.id, fieldId: cid })}
                                            />

                                            {(local.customFields || []).filter((f) => !isMainFieldDuplicate(f.label)).length > 0 && (
                                                <>
                                                    <div className="h-px bg-border/60 -mx-1" />
                                                    <div className="space-y-2">
                                                        {(local.customFields || []).filter((f) => !isMainFieldDuplicate(f.label)).map((f) => {
                                                            const val = f.value || "";
                                                            const href = valueAsHref(val)
                                                                || (/^[+\d\s.\-()]{7,}$/.test(val) && val.replace(/\D/g, "").length >= 7
                                                                    ? `tel:${val.replace(/[^+\d]/g, "")}`
                                                                    : null)
                                                                || (val.includes("@") && val.includes(".") ? `mailto:${val.trim()}` : null);
                                                            const isLong = val.length > 60;
                                                            return (
                                                                <ExpandableCustomField
                                                                    key={f.id}
                                                                    field={f}
                                                                    isLong={isLong}
                                                                    actionHref={href}
                                                                    autoFocus={false}
                                                                    onFocused={() => {}}
                                                                    onUpdate={(v) => updateCustomField(f.id, { value: v })}
                                                                    onToggleHighlight={() => toggleHighlightCustomField(f.id, f.highlight, f.label)}
                                                                />
                                                            );
                                                        })}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </PanelSectionCard>
                                );
                            }

                            case "calendar": {
                                const na = local.nextAction;
                                const overdue = scheduleOverdue;
                                const suggested = isSuggestedRelance(na);
                                const rawDue = na?.dueAt || (na?.date ? `${na.date}T09:00:00` : null);
                                const displayDue = rawDue ? ensureWeekday(new Date(rawDue)) : null;
                                const displayLabel = suggested && displayDue
                                    ? `🔁 Relance suggérée · ${formatFutureRelativeFr(displayDue)}`
                                    : isManualRdv(na)
                                        ? (na.label || "").replace(/^📅\s*RDV détecté\s*·\s*/i, "")
                                        : (na?.label || "Rappel");
                                return (
                                    <PanelSectionCard {...sectionProps}>
                                        <div className="space-y-3" data-testid="lead-next-action-card">
                                            <div className="flex items-center justify-end gap-1 -mt-1">
                                                <QuickScheduleButton
                                                    company={local.company || ""}
                                                    defaultLabel={`Rappeler ${local.company || ""}`.trim()}
                                                    hint="Date et heure du rappel ou RDV."
                                                    size="sm"
                                                    testId="lead-add-to-calendar-btn"
                                                    onConfirm={applyCalendarReminder}
                                                    className="border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted/60"
                                                />
                                                {na && (
                                                    <button
                                                        type="button"
                                                        onClick={clearSchedule}
                                                        title="Supprimer du calendrier"
                                                        aria-label="Supprimer"
                                                        data-testid="lead-clear-next-action"
                                                        className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                )}
                                            </div>

                                            {na ? (
                                                <div
                                                    className={cn(
                                                        "rounded-xl border px-3 py-2.5",
                                                        overdue
                                                            ? "bg-rose-500/10 border-rose-500/25 text-rose-800 dark:text-rose-300"
                                                            : isManualRdv(na)
                                                                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-300"
                                                                : "bg-violet-500/10 border-violet-500/20 text-violet-800 dark:text-violet-300"
                                                    )}
                                                >
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        {na.auto && (
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-background/60 font-medium">
                                                                auto {na.stage || 1}/3
                                                            </span>
                                                        )}
                                                        {overdue && (
                                                            <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                                                                en retard
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-start gap-2 mt-1">
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-[12px] font-semibold truncate">
                                                                {displayLabel}
                                                            </p>
                                                            {displayDue && !Number.isNaN(displayDue.getTime()) && (
                                                                <p className="text-[11px] opacity-80 mt-0.5">
                                                                    {displayDue.toLocaleString("fr-FR", {
                                                                        weekday: "short",
                                                                        day: "numeric",
                                                                        month: "short",
                                                                        hour: "2-digit",
                                                                        minute: "2-digit",
                                                                    })}
                                                                </p>
                                                            )}
                                                        </div>
                                                        {suggested && (
                                                            <ConfirmSuggestedRelanceButton
                                                                company={local.company || ""}
                                                                nextAction={na}
                                                                defaultDays={defaultRelanceDays}
                                                                bestDay={prospectSlot?.bestDay || null}
                                                                bestHour={prospectSlot?.bestHour || null}
                                                                onConfirm={applyCalendarReminder}
                                                            />
                                                        )}
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="text-[12px] text-muted-foreground">
                                                    Aucun créneau — utilisez l&apos;icône pour en ajouter un.
                                                </p>
                                            )}
                                        </div>
                                    </PanelSectionCard>
                                );
                            }

                            case "notes": {
                                return (
                                    <PanelSectionCard {...sectionProps}>
                                        <Textarea
                                            data-testid="lead-note-input"
                                            value={noteDraft}
                                            onChange={(e) => setNoteDraft(e.target.value)}
                                            placeholder="Ajouter une note… Ex : « RDV demain à 14h » ou « 06 12 34 56 78 »"
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                                                    e.preventDefault();
                                                    addNote();
                                                }
                                            }}
                                            className="min-h-[70px] resize-none text-sm"
                                        />

                                        {/* ── Détection en temps réel ── */}
                                        {(draftAppointment
                                            || draftDetectedItems.length > 0
                                            || /pas\s*de\s*r[eé]ponse|rappeler|relancer|📵/i.test(noteDraft)
                                        ) && (
                                            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
                                                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-primary uppercase tracking-wider">
                                                    <Sparkles size={11} />
                                                    {draftAppointment || draftDetectedItems.length > 0
                                                        ? "Détecté — sera appliqué"
                                                        : "Suggestion calendrier"}
                                                </div>
                                                {draftAppointment && (
                                                    <div className="flex items-center justify-between gap-2 text-[12px] text-foreground font-medium">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <CalendarClock size={12} className="text-primary shrink-0" />
                                                            <span className="truncate">RDV → calendrier · {draftAppointment.label}</span>
                                                        </div>
                                                    </div>
                                                )}
                                                {!draftAppointment && /pas\s*de\s*r[eé]ponse|rappeler|relancer|📵/i.test(noteDraft) && (
                                                    <p className="text-[12px] text-muted-foreground">
                                                        Astuce : après la note, utilisez l&apos;icône calendrier pour un rappel.
                                                    </p>
                                                )}
                                                {draftDetectedItems.map((item, i) => {
                                                    const willAddPerson = item.type === "person"
                                                        && (draftDiff.willAddPersons || []).includes(item.value);
                                                    const isNew =
                                                        willAddPerson
                                                        || (item.type === "phone" && (draftDiff.newPhone === item.value || draftDiff.extraPhones.includes(item.value)))
                                                        || (item.type === "email" && draftDiff.newEmail === item.value)
                                                        || (item.type === "address" && draftDiff.newAddress === item.value);
                                                    return (
                                                        <div key={i} className={`flex items-center gap-2 text-[12px] rounded-lg px-2 py-0.5 ${isNew ? "text-foreground" : "text-muted-foreground opacity-70"}`}>
                                                            <span className="text-base leading-none shrink-0">{item.icon}</span>
                                                            <span className="font-medium">{item.value}</span>
                                                            {willAddPerson && (
                                                                <span className="ml-auto text-[10px] text-primary">sera ajouté</span>
                                                            )}
                                                            {!isNew && item.type === "person" && (
                                                                <span className="ml-auto text-[10px] opacity-70">sur la fiche</span>
                                                            )}
                                                            {!isNew && item.type !== "person" && (
                                                                <span className="ml-auto text-[10px] opacity-70">déjà présent</span>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        <div className="flex justify-end">
                                            <Button
                                                onClick={addNote}
                                                disabled={!noteDraft.trim()}
                                                data-testid="lead-add-note-btn"
                                                className="h-9 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-xs"
                                            >
                                                Ajouter
                                            </Button>
                                        </div>
                                        <div className="space-y-2 pt-2">
                                            {(local.notes || []).map((n) => (
                                                <div
                                                    key={n.id}
                                                    className="rounded-lg border border-border/60 p-3 bg-muted/30"
                                                    data-testid={`lead-note-${n.id}`}
                                                >
                                                    <div className="text-[10px] text-muted-foreground mb-1 font-medium">
                                                        {formatDateTime(n.at)}
                                                    </div>
                                                    <div className="text-sm whitespace-pre-wrap leading-relaxed">
                                                        {n.text}
                                                    </div>
                                                </div>
                                            ))}
                                            {(!local.notes || local.notes.length === 0) && (
                                                <p className="text-xs text-muted-foreground/70 italic text-center py-4">
                                                    Aucune note pour l'instant.
                                                </p>
                                            )}
                                        </div>

                                        {/* 💡 Infos détectées dans l'ensemble des notes */}
                                        {detectedFromNotes.length > 0 && (
                                            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-1.5">
                                                <h4 className="text-[11px] uppercase tracking-wider text-primary font-semibold flex items-center gap-1.5">
                                                    <span>✦</span> Détectés dans les notes
                                                </h4>
                                                <div className="space-y-1">
                                                    {detectedFromNotes.map((item, i) => (
                                                        <div key={i} className="flex items-center gap-2 text-[12.5px]">
                                                            <span className="text-sm shrink-0">{item.icon}</span>
                                                            <span className="text-foreground font-medium truncate">{item.value}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </PanelSectionCard>
                                );
                            }

                            case "relances": {
                                return (
                                    <PanelSectionCard {...sectionProps}>
                                        <RelancesWidget lead={local} workspace={workspace} dispatch={dispatch} />
                                    </PanelSectionCard>
                                );
                            }

                            case "tags": {
                                return (
                                    <PanelSectionCard {...sectionProps}>
                                        <div className="flex flex-wrap gap-1.5">
                                            {(local.tags || []).map((t) => (
                                                <span
                                                    key={t}
                                                    data-testid={`lead-tag-${t}`}
                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-secondary"
                                                >
                                                    {t}
                                                    <button
                                                        onClick={() => removeTag(t)}
                                                        aria-label={`Supprimer le tag ${t}`}
                                                        className="text-muted-foreground hover:text-destructive"
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                        <div className="flex gap-2">
                                            <Input
                                                data-testid="lead-tag-input"
                                                value={tagDraft}
                                                onChange={(e) => setTagDraft(e.target.value)}
                                                onKeyDown={(e) => e.key === "Enter" && addTag()}
                                                placeholder="Ajouter un tag (Entrée)"
                                                className="h-9 text-sm"
                                            />
                                            <Button
                                                onClick={addTag}
                                                variant="secondary"
                                                className="h-9 rounded-lg shrink-0"
                                                data-testid="lead-add-tag-btn"
                                            >
                                                <Plus size={14} />
                                            </Button>
                                        </div>
                                    </PanelSectionCard>
                                );
                            }

                            case "deal": {
                                return (
                                    <PanelSectionCard {...sectionProps}>
                                        <div className={`rounded-lg p-3 space-y-3 ${isJobs ? "bg-violet-500/5" : "bg-emerald-500/5"}`}>
                                            <div className="relative">
                                                <Euro size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                                                <Input
                                                    data-testid="lead-deal-value-input"
                                                    type="text"
                                                    inputMode="decimal"
                                                    placeholder={isJobs ? "ex. 45000 (annuel brut)" : "Montant du deal (ex. 2500)"}
                                                    value={local.dealValue != null ? String(local.dealValue) : ""}
                                                    onChange={(e) => {
                                                        const raw = e.target.value.replace(/[^0-9.,]/g, "").replace(",", ".");
                                                        const num = raw === "" ? null : parseFloat(raw);
                                                        dispatch({
                                                            type: "SET_DEAL_VALUE",
                                                            workspaceId: workspace.id,
                                                            leadId: local.id,
                                                            value: num != null && !isNaN(num) ? num : null,
                                                        });
                                                    }}
                                                    className="pl-8 h-10"
                                                />
                                            </div>
                                            {local.dealValue != null && (
                                                <p className={`text-lg font-semibold ${isJobs ? "text-violet-600 dark:text-violet-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                                                    {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(local.dealValue)}
                                                    {isJobs && <span className="ml-1 text-sm font-normal text-muted-foreground">/an brut</span>}
                                                    {!isJobs && local.dealClosedAt && (
                                                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                                                            · closé le {new Date(local.dealClosedAt).toLocaleDateString("fr-FR")}
                                                        </span>
                                                    )}
                                                </p>
                                            )}
                                        </div>
                                    </PanelSectionCard>
                                );
                            }

                            case "history": {
                                return (
                                    <PanelSectionCard {...sectionProps}>
                                        <div className="space-y-1.5">
                                            {[...local.statusHistory]
                                                .reverse()
                                                .map((entry, idx) => {
                                                    const col = workspace.columns[entry.columnId];
                                                    if (!col) return null;
                                                    const cc = getColumnColor(col);
                                                    const isCurrent = idx === 0;
                                                    return (
                                                        <div
                                                            key={idx}
                                                            className={`flex items-center gap-2.5 text-xs ${isCurrent ? "opacity-100" : "opacity-50"}`}
                                                            data-testid={`status-history-${idx}`}
                                                        >
                                                            <span className={`w-2 h-2 rounded-full ${cc.dot} shrink-0`} />
                                                            <span className="font-medium">{col.name}</span>
                                                            <span className="text-muted-foreground text-[11px]">
                                                                · {formatDateTime(entry.at)}
                                                            </span>
                                                            {isCurrent && (
                                                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary ml-auto uppercase tracking-wide font-semibold">
                                                                    actuel
                                                                </span>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                    </PanelSectionCard>
                                );
                            }

                            default:
                                return null;
                        }
                    })}

                    {/* ═══════════ ZONE C — sections masquées ═══════════ */}
                    <HiddenSectionsMenu
                        items={hiddenPanelSections(layout).map((id) => ({
                            id,
                            label: sectionTitle(id),
                            Icon: SECTION_ICONS[PANEL_SECTION_META[id]?.icon],
                        }))}
                        onRestore={restoreSection}
                    />
                </div>

                <div className="border-t border-border px-5 py-3 flex items-center justify-between bg-card rounded-b-xl shrink-0">
                    <div className="text-xs text-muted-foreground">
                        Créé le {formatDateTime(local.createdAt)}
                    </div>
                    <Button
                        variant="ghost"
                        onClick={deleteLead}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 h-10 rounded-full px-4"
                        data-testid="lead-delete-btn"
                    >
                        <Trash2 size={15} className="mr-1.5" />
                        Supprimer
                    </Button>
                </div>
            </aside>

            <AddToCalendarDialog
                open={calendarDialogOpen}
                onOpenChange={setCalendarDialogOpen}
                company={local.company || ""}
                defaultLabel={calendarDefaultLabel}
                hint={calendarHint}
                onConfirm={applyCalendarReminder}
            />
        </>
    );
};

const ExtraPromoteButton = ({ extraKey, value, onPromote }) => {
    if (!value) return null;

    return (
        <button
            onClick={() => onPromote(extraKey)}
            title={`Ajouter « ${extraKey} » comme champ personnalisé pour tous les leads (sans écraser)`}
            className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-primary hover:bg-primary/10 transition-colors"
            aria-label={`Promouvoir ${extraKey}`}
        >
            <ArrowUp size={13} strokeWidth={2.5} />
        </button>
    );
};

const ExtraDeleteButton = ({ extraKey, extraValue, onDelete }) => {
    const [confirm, setConfirm] = useState(false);

    if (confirm) {
        return (
            <div className="flex items-center gap-1 shrink-0">
                <button
                    onClick={() => setConfirm(false)}
                    className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded transition-colors"
                >
                    Non
                </button>
                <button
                    onClick={() => { onDelete(extraKey, extraValue); setConfirm(false); }}
                    className="text-[10px] font-medium text-white bg-rose-500 hover:bg-rose-600 px-1.5 py-0.5 rounded transition-colors"
                >
                    Oui
                </button>
            </div>
        );
    }

    return (
        <button
            onClick={() => setConfirm(true)}
            title={`Supprimer « ${extraKey} » de ce lead et tous ceux avec la même valeur`}
            className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/40 hover:text-rose-500 hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100"
            aria-label={`Supprimer ${extraKey}`}
        >
            <Trash2 size={12} strokeWidth={2} />
        </button>
    );
};

/**
 * Retourne true si le label d'un customField correspond à un doublon
 * de champ principal (ex: "Téléphone 2", "Email 3", "Contact 2", "Site web 2"…)
 * Ces champs sont affichés dans FieldGroup, pas dans la section "Infos complémentaires".
 */
function isMainFieldDuplicate(label) {
    const MAIN_BASES = ["téléphone", "telephone", "email", "contact", "contact rh", "site web", "site", "lien offre"];
    const normalized = label.toLowerCase().trim();
    return MAIN_BASES.some((base) =>
        new RegExp("^" + base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\d+$").test(normalized)
    );
}

const ExpandableCustomField = ({ field: f, isLong, actionHref, onUpdate, onToggleHighlight, autoFocus = false, onFocused }) => {
    const [expanded, setExpanded] = useState(false);
    const inputRef = useRef(null);
    const val = f.value || "";
    const isExternal = actionHref && !actionHref.startsWith("tel:") && !actionHref.startsWith("mailto:");

    useEffect(() => {
        if (autoFocus && inputRef.current) {
            inputRef.current.focus();
            onFocused?.();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoFocus]);

    return (
        <div
            className="flex items-start gap-2 group/cf"
            data-testid={`custom-field-display-${f.id}`}
        >
            <Label className="text-[11px] text-muted-foreground w-2/5 truncate shrink-0 font-medium flex items-center gap-1 mt-2">
                {f.highlight && <Star size={9} className="text-amber-500 fill-amber-500 shrink-0" />}
                {f.label}
            </Label>
            <div className="flex-1 min-w-0 space-y-1">
                {expanded ? (
                    <textarea
                        value={f.value}
                        onChange={(e) => onUpdate(e.target.value)}
                        placeholder="—"
                        rows={3}
                        className="w-full text-sm rounded-md border border-input bg-background px-3 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                ) : (
                    <Input
                        ref={inputRef}
                        value={f.value}
                        onChange={(e) => onUpdate(e.target.value)}
                        placeholder="—"
                        className={`h-8 text-sm transition-all ${autoFocus ? "ring-2 ring-primary border-primary" : ""}`}
                    />
                )}
                {actionHref && val && (
                    <a
                        href={actionHref}
                        target={isExternal ? "_blank" : undefined}
                        rel={isExternal ? "noreferrer noopener" : undefined}
                        className="inline-block text-[11px] text-primary hover:underline break-all leading-snug"
                    >
                        {isExternal ? displayUrl(actionHref) : val}
                    </a>
                )}
            </div>
            {val && <CopyBtn value={val} className="mt-2 opacity-0 group-hover/cf:opacity-100" />}
            {isLong && (
                <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    title={expanded ? "Réduire" : "Déplier"}
                    className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground/40 hover:text-primary hover:bg-primary/10"
                >
                    <ChevronDown
                        size={13}
                        strokeWidth={2}
                        className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
                    />
                </button>
            )}
            <button
                type="button"
                onClick={onToggleHighlight}
                title={f.highlight ? "Retirer de la carte Kanban" : "Afficher sur la carte Kanban"}
                className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                    f.highlight
                        ? "text-amber-500 bg-amber-500/10"
                        : "text-muted-foreground/30 hover:text-amber-500 hover:bg-amber-500/10 opacity-0 group-hover/cf:opacity-100"
                }`}
            >
                <Star size={13} strokeWidth={2} className={f.highlight ? "fill-amber-500" : ""} />
            </button>
        </div>
    );
};

const FieldGroup = ({
    icon: Icon,
    label,
    baseLabel,
    value,
    onChange,
    testId,
    type = "text",
    linkHref,
    linkIsExternal = false,
    customFields,
    lastAddedFieldLabel,
    onClearLastAdded,
    onAdd,
    onUpdateCf,
    onDeleteCf,
}) => {
    const base = baseLabel.toLowerCase();
    const dupes = (customFields || []).filter((f) =>
        f.label.toLowerCase().match(
            new RegExp("^" + base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\d+$")
        )
    );
    const nextNum = dupes.length + 2;

    const resolveHref = (val) => {
        if (!val) return null;
        if (/^[+\d\s.\-()]{7,}$/.test(val) && val.replace(/\D/g, "").length >= 7) {
            return "tel:" + val.replace(/[^+\d]/g, "");
        }
        if (val.includes("@") && val.includes(".")) return "mailto:" + val.trim();
        return valueAsHref(val);
    };

    return (
        <div className="space-y-1.5">
            <div>
                <div className="flex items-center gap-1 mb-1">
                    <Label className="text-xs text-muted-foreground flex-1">{label}</Label>
                    <button
                        type="button"
                        onClick={() => onAdd(baseLabel + " " + nextNum)}
                        title={"Ajouter " + baseLabel + " " + nextNum}
                        className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground/40 hover:text-primary hover:bg-primary/10 transition-colors"
                    >
                        <Plus size={12} strokeWidth={2.5} />
                    </button>
                </div>
                <div className="relative flex items-center gap-1.5 group/row">
                    <div className="relative flex-1">
                        <Icon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        <Input
                            data-testid={testId}
                            type={type}
                            value={value || ""}
                            onChange={(e) => onChange(e.target.value)}
                            className="pl-9 h-10"
                        />
                    </div>
                    {value && <CopyBtn value={value} className="opacity-0 group-hover/row:opacity-100" />}
                </div>
                {linkHref && value && (
                    <a
                        href={linkHref}
                        target={linkIsExternal ? "_blank" : undefined}
                        rel={linkIsExternal ? "noreferrer noopener" : undefined}
                        className="inline-block mt-1 text-[11px] text-primary hover:underline break-all"
                    >
                        {linkIsExternal ? displayUrl(linkHref) : value}
                    </a>
                )}
            </div>

            {dupes.map((f) => (
                <DupeField
                    key={f.id}
                    icon={Icon}
                    field={f}
                    type={type}
                    linkHref={resolveHref(f.value)}
                    autoFocus={lastAddedFieldLabel === f.label}
                    onFocused={onClearLastAdded}
                    onUpdate={(v) => onUpdateCf(f.id, v)}
                    onDelete={() => onDeleteCf(f.id)}
                />
            ))}
        </div>
    );
};

/** Ligne dupliquée — même rendu que Field, + bouton X au hover pour supprimer */
const DupeField = ({ icon: Icon, field: f, type = "text", linkHref, autoFocus, onFocused, onUpdate, onDelete }) => {
    const inputRef = useRef(null);
    const isExternal = linkHref && !linkHref.startsWith("tel:") && !linkHref.startsWith("mailto:");

    useEffect(() => {
        if (autoFocus && inputRef.current) {
            inputRef.current.focus();
            onFocused && onFocused();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoFocus]);

    return (
        <div className="group/dupe">
            <Label className="text-xs text-muted-foreground mb-1 block">{f.label}</Label>
            <div className="relative flex items-center gap-1.5 group/row">
                <div className="relative flex-1">
                    <Icon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <Input
                        ref={inputRef}
                        type={type}
                        value={f.value || ""}
                        onChange={(e) => onUpdate(e.target.value)}
                        placeholder="—"
                        className={"pl-9 h-10" + (autoFocus ? " ring-2 ring-primary" : "")}
                    />
                </div>
                {f.value && <CopyBtn value={f.value} className="opacity-0 group-hover/row:opacity-100" />}
                <button
                    type="button"
                    onClick={onDelete}
                    title={"Supprimer " + f.label}
                    className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground/20 hover:text-rose-500 hover:bg-rose-500/10 transition-colors opacity-0 group-hover/dupe:opacity-100"
                >
                    <X size={13} strokeWidth={2} />
                </button>
            </div>
            {linkHref && f.value && (
                <a
                    href={linkHref}
                    target={isExternal ? "_blank" : undefined}
                    rel={isExternal ? "noreferrer noopener" : undefined}
                    className="inline-block mt-1 text-[11px] text-primary hover:underline break-all"
                >
                    {isExternal ? displayUrl(linkHref) : f.value}
                </a>
            )}
        </div>
    );
};
