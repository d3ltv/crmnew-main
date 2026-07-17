import React, { useState, useEffect, useRef, useMemo } from "react";
import { useCrm } from "@/context/CrmContext";
import {
    X,
    Phone,
    Globe,
    Mail,
    User,
    Calendar,
    Trash2,
    Tag,
    Plus,
    Pin,
    PinOff,
    History,
    CheckCircle2,
    ArrowRight,
    Euro,
    Trophy,
    ChevronDown,
    ArrowUp,
    Database,
    MessageSquare,
    PhoneCall,
    ExternalLink,
    Star,
    CalendarClock,
    Sparkles,
    RefreshCw,
    Mail as MailIcon,
    Linkedin,
    MessageCircle,
    Repeat2,
} from "lucide-react";
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
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import { getColumnColor } from "@/lib/columnColors";
import { formatDateTimeLong } from "@/lib/dateUtils";
import { telHref, mailtoHref, websiteHref } from "@/lib/actionLinks";
import { parseNote, detectAppointment, diffWithLead, formatDetected } from "@/lib/noteParser";

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
// ── RelancesWidget ────────────────────────────────────────────────────────────
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
        toast.success(`Relance #${nextNum} enregistrée`, {
            description: `${canal}${note.trim() ? ` · ${note.trim()}` : ""}`,
        });
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
        <div className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                    <Repeat2 size={13} strokeWidth={2.5} />
                    Suivi des relances
                    {relances.length > 0 && (
                        <span className="ml-1 text-[10px] font-bold text-foreground bg-secondary rounded-full px-1.5 py-0.5">
                            {relances.length}/{maxRelances}
                        </span>
                    )}
                </h3>
                {!atMax && (
                    <button
                        onClick={() => setAdding((v) => !v)}
                        className={`h-7 px-2.5 rounded-full text-[11px] font-medium flex items-center gap-1 transition-colors ${
                            adding
                                ? "bg-secondary text-foreground"
                                : "bg-primary text-primary-foreground hover:bg-primary/90"
                        }`}
                    >
                        <Repeat2 size={11} strokeWidth={2} />
                        {adding ? "Annuler" : `Relance #${nextNum}`}
                    </button>
                )}
                {atMax && (
                    <span className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">Max 7 relances</span>
                )}
            </div>

            {/* Badges visuels 1–7 */}
            <div className="flex items-center gap-1.5 flex-wrap">
                {Array.from({ length: maxRelances }, (_, i) => {
                    const num = i + 1;
                    const done = num <= relances.length;
                    const color = getRelanceColor(num);
                    const entry = relances[i];
                    return (
                        <div
                            key={num}
                            title={done && entry ? `${entry.canal} · ${new Date(entry.at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}${entry.note ? ` · ${entry.note}` : ""}` : `Relance ${num}`}
                            className={`relative w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold transition-all select-none
                                ${done
                                    ? `${color.bg} ${color.text} shadow-sm ring-1 ring-inset ring-current/20`
                                    : "bg-muted/60 text-muted-foreground/40 border border-dashed border-border"
                                }`}
                        >
                            {num}
                            {done && (
                                <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ${color.dot} ring-1 ring-background`} />
                            )}
                        </div>
                    );
                })}
                {relances.length > 0 && (
                    <span className="text-[11px] text-muted-foreground ml-1">
                        {relances.length === 1 ? "1 relance" : `${relances.length} relances`}
                    </span>
                )}
            </div>

            {/* Formulaire d'ajout */}
            {adding && !atMax && (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-150">
                    <p className="text-[11px] font-semibold text-primary uppercase tracking-wider">
                        Relance #{nextNum} — Canal utilisé
                    </p>
                    {/* Sélecteur canal en chips */}
                    <div className="flex flex-wrap gap-1.5">
                        {RELANCE_CANAUX.map((c) => (
                            <button
                                key={c.value}
                                onClick={() => setCanal(c.value)}
                                className={`h-7 px-2.5 rounded-full text-[11.5px] font-medium flex items-center gap-1 transition-all border ${
                                    canal === c.value
                                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                        : "bg-card text-foreground/70 border-border hover:border-primary/50 hover:text-foreground"
                                }`}
                            >
                                <span>{c.emoji}</span>
                                <span>{c.label}</span>
                            </button>
                        ))}
                    </div>
                    {/* Note optionnelle */}
                    <input
                        type="text"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleLog()}
                        placeholder="Note optionnelle… ex : messagerie, rappel demandé"
                        className="w-full h-8 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <div className="flex justify-end gap-2">
                        <button
                            onClick={() => { setAdding(false); setNote(""); }}
                            className="h-8 px-3 rounded-full text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                        >
                            Annuler
                        </button>
                        <button
                            onClick={handleLog}
                            className="h-8 px-4 rounded-full text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1.5"
                        >
                            <Repeat2 size={11} />
                            Enregistrer la relance #{nextNum}
                        </button>
                    </div>
                </div>
            )}

            {/* Historique des relances */}
            {relances.length > 0 && (
                <div className="space-y-1.5">
                    {[...relances].reverse().map((r) => {
                        const color = getRelanceColor(r.num);
                        const canal = RELANCE_CANAUX.find((c) => c.value === r.canal);
                        return (
                            <div
                                key={r.id}
                                className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 bg-muted/40 border border-border/50 group"
                            >
                                {/* Badge numéro */}
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${color.bg} ${color.text}`}>
                                    {r.num}
                                </div>
                                {/* Canal + note */}
                                <div className="flex-1 min-w-0">
                                    <span className="text-[12px] font-medium text-foreground">
                                        {canal?.emoji} {r.canal}
                                    </span>
                                    {r.note && (
                                        <span className="text-[11px] text-muted-foreground ml-1.5">· {r.note}</span>
                                    )}
                                </div>
                                {/* Date */}
                                <span className="text-[10px] text-muted-foreground shrink-0">
                                    {new Date(r.at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                                </span>
                                {/* Supprimer */}
                                <button
                                    onClick={() => handleDelete(r.id)}
                                    className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity text-muted-foreground hover:text-rose-500"
                                    title="Supprimer cette relance"
                                >
                                    <X size={12} />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            {relances.length === 0 && !adding && (
                <p className="text-xs text-muted-foreground/60 italic text-center py-2">
                    Aucune relance enregistrée. Cliquez sur "Relance #1" pour commencer le suivi.
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
    const [extraOpen, setExtraOpen] = useState(false);
    const [lastAddedFieldLabel, setLastAddedFieldLabel] = useState(null);
    // RDV direct (sans passer par la note)
    const [rdvDate, setRdvDate] = useState("");
    const [rdvTime, setRdvTime] = useState("");
    const [rdvLabel, setRdvLabel] = useState("");
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
        () => local ? diffWithLead(draftDetected, local) : { newPhone: null, extraPhones: [], newEmail: null, newAddress: null },
        [draftDetected, local]
    );
    const draftDetectedItems = useMemo(() => formatDetected(draftDetected), [draftDetected]);
    const draftAppointment = useMemo(() => detectAppointment(noteDraft), [noteDraft]);

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

    const patch = (p) => {
        dispatch({
            type: "UPDATE_LEAD",
            workspaceId: workspace.id,
            leadId: local.id,
            patch: p,
        });
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
        const patch = {};
        if (draftDiff.newPhone) patch.phone = draftDiff.newPhone;
        if (draftDiff.newEmail) patch.email = draftDiff.newEmail;

        // RDV détecté → nextAction (ne pas écraser un RDV existant plus récent)
        if (draftAppointment) {
            const existing = local.nextAction?.dueAt;
            const incomingTime = new Date(draftAppointment.iso).getTime();
            if (!existing || incomingTime < new Date(existing).getTime()) {
                patch.nextAction = {
                    date: draftAppointment.iso.slice(0, 10),
                    dueAt: draftAppointment.iso,
                    label: `📅 RDV détecté · ${draftAppointment.label}`,
                    auto: false,
                };
            }
        }

        if (Object.keys(patch).length > 0) {
            dispatch({ type: "UPDATE_LEAD", workspaceId: workspace.id, leadId: local.id, patch });
        }

        // Téléphones supplémentaires → customFields
        draftDiff.extraPhones.forEach((phone) => {
            dispatch({ type: "ADD_CUSTOM_FIELD", workspaceId: workspace.id, leadId: local.id, label: "Téléphone", value: phone, pinned: false });
        });
        if (draftDiff.newAddress) {
            dispatch({ type: "ADD_CUSTOM_FIELD", workspaceId: workspace.id, leadId: local.id, label: "Adresse", value: draftDiff.newAddress, pinned: false });
        }

        setNoteDraft("");
    };

    const saveRdvDirect = () => {
        if (!rdvDate) return;
        const iso = rdvTime ? new Date(`${rdvDate}T${rdvTime}`).toISOString() : new Date(`${rdvDate}T09:00`).toISOString();
        const d = new Date(iso);
        const label = rdvLabel.trim() || `RDV ${d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}${rdvTime ? ` à ${rdvTime.replace(":", "h")}` : ""}`;
        dispatch({
            type: "UPDATE_LEAD",
            workspaceId: workspace.id,
            leadId: local.id,
            patch: {
                nextAction: {
                    date: rdvDate,
                    dueAt: iso,
                    label: `📅 RDV détecté · ${label}`,
                    auto: false,
                },
            },
        });
        toast.success("RDV enregistré", { description: label });
        setRdvDate("");
        setRdvTime("");
        setRdvLabel("");
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
                    ? "fixed z-50 flex flex-col inset-0 sm:inset-auto sm:top-[3%] sm:bottom-[3%] sm:left-1/2 sm:-translate-x-1/2 w-full sm:w-[780px] bg-card sm:rounded-2xl sm:border border-border shadow-2xl animate-in fade-in zoom-in-95 duration-200"
                    : "fixed z-50 flex flex-col inset-0 sm:inset-auto sm:top-4 sm:bottom-4 sm:right-4 w-full sm:w-[560px] bg-card sm:rounded-2xl sm:border border-border shadow-2xl animate-in slide-in-from-right duration-300"}
            >
                <div className="glass border-b border-border px-5 py-4 flex items-start justify-between gap-3 rounded-t-2xl shrink-0">
                    <div className="min-w-0 flex-1">
                        <input
                            data-testid="lead-company-input"
                            value={local.company || ""}
                            onChange={(e) => patch({ company: e.target.value })}
                            className="w-full bg-transparent text-xl sm:text-2xl font-semibold tracking-tight outline-none focus:ring-2 focus:ring-primary rounded px-1 -mx-1"
                            placeholder={isJobs ? "Nom de l'entreprise / Poste" : "Nom de l'entreprise"}
                        />
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
                    {/* 📇 Coordonnées + Infos complémentaires */}
                    <div className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-sm">
                        <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                            <User size={13} strokeWidth={2.5} />
                            {isJobs ? "Entreprise & Recruteur" : "Contact & Coordonnées"}
                        </h3>
                        <div className="space-y-2.5">
                            {/* ── Contact ── */}
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
                                onUpdateCf={(id, v) => updateCustomField(id, { value: v })}
                                onDeleteCf={(id) => dispatch({ type: "REMOVE_CUSTOM_FIELD", workspaceId: workspace.id, leadId: local.id, fieldId: id })}
                            />
                            {/* ── Téléphone ── */}
                            <FieldGroup
                                icon={Phone}
                                label="Téléphone"
                                baseLabel="Téléphone"
                                value={local.phone}
                                onChange={(v) => patch({ phone: v })}
                                testId="lead-phone-input"
                                type="tel"
                                customFields={local.customFields || []}
                                lastAddedFieldLabel={lastAddedFieldLabel}
                                onClearLastAdded={() => setLastAddedFieldLabel(null)}
                                onAdd={(label) => { dispatch({ type: "ADD_CUSTOM_FIELD", workspaceId: workspace.id, leadId: local.id, label, value: "", pinned: false, isMainDuplicate: true }); setLastAddedFieldLabel(label); }}
                                onUpdateCf={(id, v) => updateCustomField(id, { value: v })}
                                onDeleteCf={(id) => dispatch({ type: "REMOVE_CUSTOM_FIELD", workspaceId: workspace.id, leadId: local.id, fieldId: id })}
                                action={
                                    telHref(local.phone)
                                        ? { href: telHref(local.phone), label: `Appeler ${local.phone}`, icon: <PhoneCall size={15} />, testId: "lead-phone-action" }
                                        : null
                                }
                            />
                            {/* ── Email ── */}
                            <FieldGroup
                                icon={Mail}
                                label="Email"
                                baseLabel="Email"
                                value={local.email}
                                onChange={(v) => patch({ email: v })}
                                testId="lead-email-input"
                                type="email"
                                customFields={local.customFields || []}
                                lastAddedFieldLabel={lastAddedFieldLabel}
                                onClearLastAdded={() => setLastAddedFieldLabel(null)}
                                onAdd={(label) => { dispatch({ type: "ADD_CUSTOM_FIELD", workspaceId: workspace.id, leadId: local.id, label, value: "", pinned: false, isMainDuplicate: true }); setLastAddedFieldLabel(label); }}
                                onUpdateCf={(id, v) => updateCustomField(id, { value: v })}
                                onDeleteCf={(id) => dispatch({ type: "REMOVE_CUSTOM_FIELD", workspaceId: workspace.id, leadId: local.id, fieldId: id })}
                                action={
                                    mailtoHref(local.email)
                                        ? { href: mailtoHref(local.email), label: `Envoyer un email`, icon: <ExternalLink size={15} />, testId: "lead-email-action" }
                                        : null
                                }
                            />
                            {/* ── Site web ── */}
                            <FieldGroup
                                icon={Globe}
                                label={isJobs ? "Lien offre / Site entreprise" : "Site web"}
                                baseLabel={isJobs ? "Site" : "Site web"}
                                value={local.website}
                                onChange={(v) => patch({ website: v })}
                                testId="lead-website-input"
                                customFields={local.customFields || []}
                                lastAddedFieldLabel={lastAddedFieldLabel}
                                onClearLastAdded={() => setLastAddedFieldLabel(null)}
                                onAdd={(label) => { dispatch({ type: "ADD_CUSTOM_FIELD", workspaceId: workspace.id, leadId: local.id, label, value: "", pinned: false, isMainDuplicate: true }); setLastAddedFieldLabel(label); }}
                                onUpdateCf={(id, v) => updateCustomField(id, { value: v })}
                                onDeleteCf={(id) => dispatch({ type: "REMOVE_CUSTOM_FIELD", workspaceId: workspace.id, leadId: local.id, fieldId: id })}
                                action={
                                    websiteHref(local.website)
                                        ? { href: websiteHref(local.website), target: "_blank", label: `Ouvrir le site`, icon: <ExternalLink size={15} />, testId: "lead-website-action" }
                                        : null
                                }
                            />
                        </div>

                        {/* Infos complémentaires (customFields) — exclure les doublons gérés par FieldGroup */}
                        {(local.customFields || []).filter((f) => !isMainFieldDuplicate(f.label)).length > 0 && (
                            <>
                                <div className="h-px bg-border/60 -mx-1" />
                                <div className="space-y-2">
                                    {(local.customFields || []).filter((f) => !isMainFieldDuplicate(f.label)).map((f) => {
                                        const val = f.value || "";
                                        const isPhone = /^[+\d\s.\-()]{7,}$/.test(val) && val.replace(/\D/g, "").length >= 7;
                                        const isEmail = val.includes("@") && val.includes(".");
                                        const isUrl = /^https?:\/\//i.test(val) || /^www\./i.test(val);
                                        const actionHref = isPhone
                                            ? `tel:${val.replace(/[^+\d]/g, "")}`
                                            : isEmail ? `mailto:${val.trim()}`
                                            : isUrl ? (val.startsWith("http") ? val : `https://${val}`)
                                            : null;
                                        const actionIcon = isPhone ? <PhoneCall size={14} /> : <ExternalLink size={14} />;
                                        const isLong = val.length > 60;
                                        return (
                                            <ExpandableCustomField
                                                key={f.id}
                                                field={f}
                                                isLong={isLong}
                                                actionHref={actionHref}
                                                actionIcon={actionIcon}
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

                    {/* 🔁 Suivi des relances */}
                    <RelancesWidget
                        lead={local}
                        workspace={workspace}
                        dispatch={dispatch}
                    />

                    {/* 💬 Notes & Historique — Grande card */}
                    <div className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-sm">
                        <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                            <MessageSquare size={13} strokeWidth={2.5} /> Notes & Historique
                        </h3>

                        {/* ── Ajout RDV direct ── */}
                        <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
                            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                <CalendarClock size={11} /> Planifier un RDV
                            </p>
                            <div className="flex gap-2">
                                <input
                                    type="date"
                                    value={rdvDate}
                                    onChange={(e) => setRdvDate(e.target.value)}
                                    className="flex-1 h-8 px-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                                <input
                                    type="time"
                                    value={rdvTime}
                                    onChange={(e) => setRdvTime(e.target.value)}
                                    className="w-24 h-8 px-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                            </div>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={rdvLabel}
                                    onChange={(e) => setRdvLabel(e.target.value)}
                                    placeholder="Objet du RDV (optionnel)"
                                    onKeyDown={(e) => e.key === "Enter" && saveRdvDirect()}
                                    className="flex-1 h-8 px-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                                <Button
                                    onClick={saveRdvDirect}
                                    disabled={!rdvDate}
                                    className="h-8 px-3 rounded-lg text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                                >
                                    Enregistrer
                                </Button>
                            </div>
                            {/* RDV existant */}
                            {local.nextAction?.label?.startsWith("📅 RDV") && (
                                <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5 text-[12px] text-emerald-700 dark:text-emerald-400">
                                    <div className="flex items-center gap-1.5">
                                        <CalendarClock size={12} strokeWidth={2.5} />
                                        <span className="font-medium">{local.nextAction.label.replace("📅 RDV détecté · ", "")}</span>
                                    </div>
                                    <button
                                        onClick={() => patch({ nextAction: null })}
                                        className="opacity-50 hover:opacity-100 transition-opacity"
                                        title="Supprimer le RDV"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            )}
                        </div>

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
                        {(draftAppointment || draftDetectedItems.length > 0) && (
                            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
                                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-primary uppercase tracking-wider">
                                    <Sparkles size={11} /> Détecté — sera appliqué
                                </div>
                                {draftAppointment && (
                                    <div className="flex items-center gap-2 text-[12px] text-foreground font-medium">
                                        <CalendarClock size={12} className="text-primary shrink-0" />
                                        <span>RDV · {draftAppointment.label}</span>
                                    </div>
                                )}
                                {draftDetectedItems.map((item, i) => {
                                    const isNew =
                                        (item.type === "phone" && (draftDiff.newPhone === item.value || draftDiff.extraPhones.includes(item.value))) ||
                                        (item.type === "email" && draftDiff.newEmail === item.value) ||
                                        (item.type === "address" && draftDiff.newAddress === item.value);
                                    return (
                                        <div key={i} className={`flex items-center gap-2 text-[12px] rounded-lg px-2 py-0.5 ${isNew ? "text-foreground" : "text-muted-foreground line-through opacity-50"}`}>
                                            <span className="text-base leading-none shrink-0">{item.icon}</span>
                                            <span className="font-medium">{item.value}</span>
                                            {!isNew && <span className="ml-auto text-[10px] opacity-70">déjà présent</span>}
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
                    </div>

                    {/* 💡 Infos détectées dans les notes */}
                    {detectedFromNotes.length > 0 && (
                        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-1.5">
                            <h3 className="text-[11px] uppercase tracking-wider text-primary font-semibold flex items-center gap-1.5">
                                <span>✦</span> Détectés dans les notes
                            </h3>
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

                    {/* 🏷 Tags — Card */}
                    <div className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-sm">
                        <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                            <Tag size={13} strokeWidth={2.5} /> Tags
                        </h3>
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
                    </div>

                    {/* 📅 Prochaine action — Card */}
                    <div className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-sm">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                                <Calendar size={13} strokeWidth={2.5} />
                                {isJobs ? "Prochain entretien / rappel" : "Prochaine action"}
                                {local.nextAction?.auto && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium normal-case tracking-normal ml-1">
                                        auto {local.nextAction.stage || 1}/3
                                    </span>
                                )}
                            </h3>
                            {local.nextAction && (
                                <button
                                    onClick={() => {
                                        patch({ nextAction: null });
                                        if (local.autoFollowup) {
                                            dispatch({
                                                type: "DISMISS_FOLLOWUP",
                                                workspaceId: workspace.id,
                                                leadId: local.id,
                                            });
                                        }
                                    }}
                                    data-testid="lead-clear-next-action"
                                    className="text-[11px] text-muted-foreground hover:text-destructive"
                                >
                                    Effacer
                                </button>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <Input
                                data-testid="lead-next-action-date"
                                type="date"
                                value={local.nextAction?.date || ""}
                                onChange={(e) =>
                                    patch({
                                        nextAction: {
                                            ...(local.nextAction || {}),
                                            date: e.target.value,
                                            auto: false,
                                        },
                                    })
                                }
                                className="h-9"
                            />
                            <Input
                                data-testid="lead-next-action-label"
                                placeholder="ex. Relance"
                                value={local.nextAction?.label || ""}
                                onChange={(e) =>
                                    patch({
                                        nextAction: {
                                            ...(local.nextAction || {}),
                                            label: e.target.value,
                                            auto: false,
                                        },
                                    })
                                }
                                className="h-9"
                            />
                        </div>
                    </div>

                    {/* 💰 Valeur du deal / Salaire */}
                    <div className={`rounded-xl border p-4 space-y-3 shadow-sm ${
                        isJobs
                            ? "border-violet-500/20 bg-violet-500/5"
                            : "border-emerald-500/20 bg-emerald-500/5"
                    }`}>
                        <h3 className={`text-xs uppercase tracking-wider font-semibold flex items-center gap-1.5 ${
                            isJobs
                                ? "text-violet-700 dark:text-violet-400"
                                : "text-emerald-700 dark:text-emerald-400"
                        }`}>
                            <Trophy size={13} strokeWidth={2.5} />
                            {isJobs ? "💰 Salaire proposé" : "Valeur du deal"}
                        </h3>
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

                    {/* 📦 Données importées — Collapsible */}
                    {local.extra && Object.keys(local.extra).length > 0 && (
                        <Collapsible open={extraOpen} onOpenChange={setExtraOpen}>
                            <CollapsibleTrigger asChild>
                                <button className="w-full rounded-xl border border-border bg-card p-3 hover:bg-muted/30 transition-colors flex items-center justify-between group">
                                    <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                                        <Database size={13} strokeWidth={2.5} />
                                        Données importées
                                        <span className="normal-case tracking-normal text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-normal">
                                            {Object.keys(local.extra).length}
                                        </span>
                                    </h3>
                                    <ChevronDown
                                        size={14}
                                        className={`text-muted-foreground transition-transform duration-200 ${extraOpen ? "rotate-180" : ""}`}
                                    />
                                </button>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                                <div className="mt-2 rounded-xl border border-border bg-card overflow-hidden">
                                    {Object.entries(local.extra).map(([k, v]) => {
                                        const alreadyPromoted = (local.customFields || []).some(
                                            (cf) => cf.label.toLowerCase() === k.toLowerCase() && cf.value
                                        );
                                        const isHighlighted = (local.customFields || []).some(
                                            (cf) => cf.label === k && cf.highlight
                                        );
                                        return (
                                            <div
                                                key={k}
                                                className="flex items-center gap-2 px-3 py-2 border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors group"
                                            >
                                                <div className="flex-1 min-w-0 grid grid-cols-2 gap-2 text-sm">
                                                    <span className="text-muted-foreground truncate text-xs font-medium">{k}</span>
                                                    <span className="truncate text-xs">{v}</span>
                                                </div>
                                                {/* Bouton highlight ⭐ */}
                                                <button
                                                    onClick={() => highlightExtraField(k, v)}
                                                    title={isHighlighted ? "Retirer de l'aperçu carte" : "Afficher sous le nom sur la carte"}
                                                    className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                                                        isHighlighted
                                                            ? "text-amber-500 bg-amber-500/10"
                                                            : "text-muted-foreground/40 hover:text-amber-500 hover:bg-amber-500/10 opacity-0 group-hover:opacity-100"
                                                    }`}
                                                >
                                                    <Star size={12} strokeWidth={2} className={isHighlighted ? "fill-amber-500" : ""} />
                                                </button>
                                                {alreadyPromoted ? (
                                                    <span className="shrink-0 text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
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
                                <p className="text-[11px] text-muted-foreground mt-2 px-1">
                                    ↑ Ajoute le champ sur <strong>tous les leads</strong> sans écraser.
                                </p>
                            </CollapsibleContent>
                        </Collapsible>
                    )}

                    {/* 📈 Historique de statut — Card conditionnelle */}
                    {(local.statusHistory || []).length > 0 && (
                        <div className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-sm">
                            <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                                <History size={13} strokeWidth={2.5} /> Historique de statut
                            </h3>
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
                        </div>
                    )}

                </div>

                <div className="border-t border-border px-5 py-3 flex items-center justify-between glass rounded-b-2xl shrink-0">
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

const ExpandableCustomField = ({ field: f, isLong, actionHref, actionIcon, onUpdate, onToggleHighlight, autoFocus = false, onFocused }) => {
    const [expanded, setExpanded] = useState(false);
    const inputRef = useRef(null);
    const val = f.value || "";
    const isPhone = actionHref?.startsWith("tel:");

    // Auto-focus quand le champ vient d'être créé via le bouton "+"
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
            <div className="flex-1 min-w-0">
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
            </div>
            {/* Bouton déplier — uniquement si valeur longue */}
            {isLong && (
                <button
                    onClick={() => setExpanded((v) => !v)}
                    title={expanded ? "Réduire" : "Déplier pour lire en entier"}
                    className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors text-muted-foreground/40 hover:text-primary hover:bg-primary/10"
                >
                    <ChevronDown
                        size={13}
                        strokeWidth={2}
                        className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
                    />
                </button>
            )}
            <button
                onClick={onToggleHighlight}
                title={f.highlight ? "Retirer de l'aperçu carte" : "Afficher sous le nom sur la carte"}
                className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                    f.highlight
                        ? "text-amber-500 bg-amber-500/10"
                        : "text-muted-foreground/30 hover:text-amber-500 hover:bg-amber-500/10 opacity-0 group-hover/cf:opacity-100"
                }`}
            >
                <Star size={13} strokeWidth={2} className={f.highlight ? "fill-amber-500" : ""} />
            </button>
            {actionHref && val && (
                <a
                    href={actionHref}
                    target={isPhone ? undefined : "_blank"}
                    rel={isPhone ? undefined : "noreferrer noopener"}
                    title={isPhone ? `Appeler ${val}` : `Ouvrir ${val}`}
                    className="shrink-0 w-8 h-8 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 flex items-center justify-center transition-colors"
                >
                    {actionIcon}
                </a>
            )}
        </div>
    );
};

const Field = ({
    icon: Icon,
    label,
    value,
    onChange,
    testId,
    type = "text",
    action,
}) => (
    <div>
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <div className="relative mt-1 flex items-center gap-1.5">
            <div className="relative flex-1">
                <Icon
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                />
                <Input
                    data-testid={testId}
                    type={type}
                    value={value || ""}
                    onChange={(e) => onChange(e.target.value)}
                    className="pl-9 h-10"
                />
            </div>
            {action && value && (
                <a
                    href={action.href}
                    target={action.target}
                    rel={action.target === "_blank" ? "noreferrer noopener" : undefined}
                    data-testid={action.testId}
                    aria-label={action.label}
                    title={action.label}
                    className="shrink-0 w-10 h-10 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 flex items-center justify-center transition-colors"
                >
                    {action.icon}
                </a>
            )}
        </div>
    </div>
);

/**
 * FieldGroup — champ principal + ses doublons (Téléphone 2, Email 2…)
 * affichés comme des Field normaux juste en dessous.
 * Un icône "+" discret à côté du label permet d'en ajouter un.
 */
const FieldGroup = ({
    icon: Icon,
    label,
    baseLabel,
    value,
    onChange,
    testId,
    type = "text",
    action,
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

    const getAction = (val) => {
        if (!val) return null;
        const isPhone = /^[+\d\s.\-()]{7,}$/.test(val) && val.replace(/\D/g, "").length >= 7;
        const isEmail = val.includes("@") && val.includes(".");
        const isUrl = /^https?:\/\//i.test(val) || /^www\./i.test(val);
        if (isPhone) return { href: "tel:" + val.replace(/[^+\d]/g, ""), icon: <PhoneCall size={15} /> };
        if (isEmail) return { href: "mailto:" + val.trim(), icon: <ExternalLink size={15} /> };
        if (isUrl) return { href: val.startsWith("http") ? val : "https://" + val, target: "_blank", icon: <ExternalLink size={15} /> };
        return null;
    };

    return (
        <div className="space-y-1.5">
            {/* Champ principal */}
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
                <div className="relative flex items-center gap-1.5">
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
                    {action && value && (
                        <a
                            href={action.href}
                            target={action.target}
                            rel={action.target === "_blank" ? "noreferrer noopener" : undefined}
                            data-testid={action.testId}
                            aria-label={action.label}
                            title={action.label}
                            className="shrink-0 w-10 h-10 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 flex items-center justify-center transition-colors"
                        >
                            {action.icon}
                        </a>
                    )}
                </div>
            </div>

            {/* Champs dupliqués — même look qu'un Field normal */}
            {dupes.map((f) => (
                <DupeField
                    key={f.id}
                    icon={Icon}
                    field={f}
                    type={type}
                    action={getAction(f.value)}
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
const DupeField = ({ icon: Icon, field: f, type = "text", action, autoFocus, onFocused, onUpdate, onDelete }) => {
    const inputRef = useRef(null);

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
            <div className="relative flex items-center gap-1.5">
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
                {action && f.value && (
                    <a
                        href={action.href}
                        target={action.target}
                        rel={action.target === "_blank" ? "noreferrer noopener" : undefined}
                        className="shrink-0 w-10 h-10 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 flex items-center justify-center transition-colors"
                    >
                        {action.icon}
                    </a>
                )}
                <button
                    type="button"
                    onClick={onDelete}
                    title={"Supprimer " + f.label}
                    className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground/20 hover:text-rose-500 hover:bg-rose-500/10 transition-colors opacity-0 group-hover/dupe:opacity-100"
                >
                    <X size={13} strokeWidth={2} />
                </button>
            </div>
        </div>
    );
};
