import React, { useState, memo, useCallback } from "react";
import {
    Phone,
    Globe,
    CheckCircle2,
    CalendarClock,
    CalendarCheck,
    Clock,
    BellRing,
    AlertTriangle,
    X,
    Mail,
    User,
    MessageSquare,
    Trophy,
    ArrowRightLeft,
    ChevronRight,
    Copy,
    Check,
    ExternalLink,
    Star,
} from "lucide-react";import { getColumnColor } from "@/lib/columnColors";
import { formatShortDateTime } from "@/lib/dateUtils";
import { useCrm } from "@/context/CrmContext";
import { DEFAULT_CARD_FIELDS } from "@/context/CrmContext";
import { toast } from "sonner";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LeadAvatar } from "./LeadAvatar";

const TAG_HUES = [
    { bg: "bg-blue-500/10", dot: "bg-blue-500" },
    { bg: "bg-emerald-500/10", dot: "bg-emerald-500" },
    { bg: "bg-amber-500/10", dot: "bg-amber-500" },
    { bg: "bg-rose-500/10", dot: "bg-rose-500" },
    { bg: "bg-violet-500/10", dot: "bg-violet-500" },
    { bg: "bg-teal-500/10", dot: "bg-teal-500" },
];

function hashHue(str = "") {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h << 5) - h + str.charCodeAt(i);
    return TAG_HUES[Math.abs(h) % TAG_HUES.length];
}

function buildVisibleSet(cardFields) {
    const saved = cardFields && cardFields.length > 0 ? cardFields : [];
    const savedMap = new Map(saved.map((f) => [f.key, f]));
    
    // Start with default fields, overridden by saved config
    const merged = DEFAULT_CARD_FIELDS.map((def) =>
        savedMap.has(def.key) ? savedMap.get(def.key) : def
    );
    
    // Add extra fields from saved config that aren't in defaults
    saved.forEach((f) => {
        if (f.key.startsWith("extra:") && !merged.find((m) => m.key === f.key)) {
            merged.push(f);
        }
    });
    
    return new Set(merged.filter((f) => f.visible).map((f) => f.key));
}

// Cache de la visibleSet par référence de tableau cardFields.
// Si cardFields ne change pas (même référence), on réutilise le résultat précédent.
const _visibleSetCache = new WeakMap();
function getVisibleSet(cardFields) {
    if (!cardFields) return buildVisibleSet([]);
    if (_visibleSetCache.has(cardFields)) return _visibleSetCache.get(cardFields);
    const result = buildVisibleSet(cardFields);
    _visibleSetCache.set(cardFields, result);
    return result;
}

// ---------- Move-to-column popover ----------
const MoveColumnButton = ({ lead, workspace, currentColumnId, dispatch }) => {
    const [open, setOpen] = useState(false);

    // All columns except the one the lead is currently in, in display order
    const otherColumns = workspace.columnOrder
        .filter((cid) => cid !== currentColumnId)
        .map((cid) => workspace.columns[cid])
        .filter(Boolean);

    const moveTo = (targetColumnId) => {
        const targetName = workspace.columns[targetColumnId]?.name ?? "";
        dispatch({
            type: "MOVE_LEAD_ORDERED",
            workspaceId: workspace.id,
            leadId: lead.id,
            toColumnId: targetColumnId,
            toIndex: null, // append at end
        });
        toast.success(`Déplacé vers « ${targetName} »`, {
            description: lead.company,
        });
        setOpen(false);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    data-testid={`quick-move-${lead.id}`}
                    onClick={(e) => e.stopPropagation()}
                    title="Changer de colonne"
                    className="h-8 w-8 rounded-xl flex items-center justify-center bg-muted text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors shrink-0"
                >
                    <ArrowRightLeft size={13} strokeWidth={2} />
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="end"
                sideOffset={8}
                className="w-56 p-1.5 rounded-xl shadow-panel"
                onClick={(e) => e.stopPropagation()}
            >
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1.5">
                    Changer de statut
                </p>
                {/* Current column indicator */}
                <div className="px-2 py-1.5 mb-1 flex items-center gap-2 rounded-lg bg-muted/40">
                    <span
                        className={`w-2 h-2 rounded-full shrink-0 ${getColumnColor(workspace.columns[currentColumnId]).dot}`}
                        aria-hidden
                    />
                    <span className="flex-1 truncate text-[12px] text-muted-foreground">
                        Actuellement : <span className="font-medium text-foreground">{workspace.columns[currentColumnId]?.name}</span>
                    </span>
                </div>
                <div className="h-px bg-border my-1" />
                <div className="space-y-0.5">
                    {otherColumns.map((col) => {
                        const colColor = getColumnColor(col);
                        return (
                            <button
                                key={col.id}
                                data-testid={`move-to-${col.id}-${lead.id}`}
                                onClick={() => moveTo(col.id)}
                                className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-[13px] text-left hover:bg-muted/70 transition-colors group"
                            >
                                <span
                                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${colColor.dot}`}
                                    aria-hidden
                                />
                                <span className="flex-1 truncate font-medium">
                                    {col.name}
                                </span>
                                <ChevronRight
                                    size={13}
                                    className="shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors"
                                />
                            </button>
                        );
                    })}
                    {otherColumns.length === 0 && (
                        <p className="text-[12px] text-muted-foreground/70 px-2 py-2 italic">
                            Aucune autre colonne
                        </p>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
};

// ---------- Main card ----------
// Format last contact as "ajd à 14h32", "hier à 09h15", "12/06 à 11h00"
function formatLastContact(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    const now = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const timeStr = `${hh}h${mm}`;

    const todayStr = now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === todayStr) return `ajd à ${timeStr}`;
    if (d.toDateString() === yesterday.toDateString()) return `hier à ${timeStr}`;

    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    return `${day}/${month} à ${timeStr}`;
}

export const LeadCard = memo(({
    lead,
    column,
    workspace,
    onOpen,
    onDragStart,
    onDragEnd,
    dragging,
    quickFocused,
}) => {
    const { dispatch } = useCrm();
    const visible = getVisibleSet(workspace.cardFields);
    const isJobs = workspace.template === "jobs";
    
    // Get field order from workspace cardFields
    const fieldOrder = workspace.cardFields && workspace.cardFields.length > 0
        ? workspace.cardFields.filter(f => f.visible).map(f => f.key)
        : [];

    const firstTag = lead.tags?.[0];
    const tagHue = firstTag ? hashHue(firstTag) : null;
    const colColor = getColumnColor(column);
    const [reminderOpen, setReminderOpen] = useState(false);
    const [reminderDate, setReminderDate] = useState(lead.nextAction?.date || "");
    const [reminderLabel, setReminderLabel] = useState(lead.nextAction?.label || "");
    const [justLogged, setJustLogged] = useState(false);

    const currentEntry = [...(lead.statusHistory || [])]
        .reverse()
        .find((e) => e.columnId === lead.columnId);

    const pinned = (lead.customFields || []).filter((f) => f.pinned && f.value);
    const highlighted = (lead.customFields || []).filter((f) => f.highlight && f.value);

    const followup = lead.autoFollowup;
    const now = Date.now();
    const followupDue = followup
        ? new Date(followup.dueAt).getTime() <= now || followup.overdue
        : false;
    const followupIsOverdue = followup && (followup.overdue || followup.stage >= 3);

    // ── Rendez-vous détecté dans les notes ────────────────────────────────────
    const rdv = lead.nextAction?.label?.startsWith("📅 RDV")
        ? lead.nextAction
        : null;
    const rdvDate = rdv ? new Date(rdv.dueAt || rdv.date) : null;
    const rdvIsToday = rdvDate
        ? rdvDate.toDateString() === new Date().toDateString()
        : false;
    const rdvIsPast = rdvDate ? rdvDate.getTime() < Date.now() - 60000 : false;
    const rdvIsSoon = rdvDate && !rdvIsPast
        ? rdvDate.getTime() - Date.now() < 24 * 3600 * 1000
        : false;

    // ── Priorité "Contacté stale" (3 jours ouvrés sans mouvement) ────────────
    const isStale = !!lead.staleInContacted;

    // Labels adaptés selon le template
    const contactedLabel = isJobs ? "Relancé" : "Contacté";
    const contactedAction = isJobs ? "Relance enregistrée" : "Contact enregistré";
    const reminderPlaceholder = isJobs ? "ex. Entretien, Relance…" : "ex. Relance téléphonique";

    const logToday = (e) => {
        e.stopPropagation();
        
        // Pour jobs : pas de déplacement auto vers "Contacté"
        const contactedColumn = isJobs ? null : Object.values(workspace.columns).find(
            (c) => c.name.toLowerCase() === "contacté"
        );
        const willMove = contactedColumn && lead.columnId !== contactedColumn.id;

        dispatch({
            type: "LOG_CONTACT",
            workspaceId: workspace.id,
            leadId: lead.id,
            text: isJobs
                ? `Relance depuis « ${column.name} »`
                : `Contact enregistré depuis « ${column.name} »`,
        });
        setJustLogged(true);
        setTimeout(() => setJustLogged(false), 2500);
        
        const now = new Date().toISOString();
        toast.success(contactedAction, {
            description: willMove 
                ? `${lead.company} — déplacé vers « ${contactedColumn.name} »`
                : `${lead.company} — ${formatLastContact(now)}`,
        });
    };

    const saveReminder = (e) => {
        e?.stopPropagation();
        dispatch({
            type: "SET_NEXT_ACTION",
            workspaceId: workspace.id,
            leadId: lead.id,
            nextAction:
                reminderDate || reminderLabel
                    ? { date: reminderDate, label: reminderLabel }
                    : null,
        });
        setReminderOpen(false);
        if (reminderDate || reminderLabel)
            toast.success("Rappel enregistré", { description: lead.company });
    };

    const dismissFollowup = (e) => {
        e.stopPropagation();
        dispatch({
            type: "DISMISS_FOLLOWUP",
            workspaceId: workspace.id,
            leadId: lead.id,
        });
    };

    // Détecte le type d'une valeur et retourne le href approprié
    const getHref = (value) => {
        if (!value) return null;
        const v = String(value).trim();
        if (/^https?:\/\//i.test(v) || /^www\./i.test(v))
            return v.startsWith("http") ? v : `https://${v}`;
        if (v.includes("@") && v.includes("."))
            return `mailto:${v}`;
        if (/^[+\d\s.\-()]{7,}$/.test(v) && v.replace(/\D/g, "").length >= 7)
            return `tel:${v.replace(/[^+\d]/g, "")}`;
        return null;
    };

    // Bouton action : ouvre le lien si détecté, sinon copie
    const ActionBtn = ({ value, forceType, forceCopy }) => {
        const [copied, setCopied] = useState(false);

        const v = String(value).trim();
        // Détecter si c'est un numéro de téléphone
        const isPhoneValue = /^[+\d\s.\-()]{7,}$/.test(v) && v.replace(/\D/g, "").length >= 7;
        // Détecter si c'est une URL
        const isUrlValue = /^https?:\/\//i.test(v) || /^www\./i.test(v);

        // forceCopy explicite OU valeur de type téléphone → toujours copier
        const shouldCopy = forceCopy || isPhoneValue;

        const href = shouldCopy ? null : forceType === "website" || isUrlValue
            ? (v.startsWith("http") ? v : `https://${v}`)
            : null;

        if (href) {
            return (
                <a
                    href={href}
                    target="_blank"
                    rel="noreferrer noopener"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    title={`Ouvrir ${v}`}
                    className="shrink-0 w-5 h-5 rounded flex items-center justify-center transition-colors text-primary/50 hover:text-primary"
                >
                    <ExternalLink size={10} strokeWidth={2} />
                </a>
            );
        }

        // Copier
        return (
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(v).then(() => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                    });
                }}
                onMouseDown={(e) => e.stopPropagation()}
                title="Copier"
                className={`shrink-0 w-5 h-5 rounded flex items-center justify-center transition-colors ${
                    copied ? "text-emerald-500" : "text-muted-foreground/30 hover:text-muted-foreground"
                }`}
            >
                {copied ? <Check size={10} strokeWidth={2.5} /> : <Copy size={10} strokeWidth={1.75} />}
            </button>
        );
    };

    // Render contact fields
    const renderContactFields = () => {
        const fieldRenderers = {
            phone: () => visible.has("phone") && lead.phone && (
                <div key="phone" className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                    <ActionBtn value={lead.phone} forceCopy />
                    <Phone size={10} strokeWidth={1.75} className="shrink-0 text-muted-foreground/40" />
                    <span className="truncate">{lead.phone}</span>
                </div>
            ),
            email: () => visible.has("email") && lead.email && (
                <div key="email" className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                    <ActionBtn value={lead.email} forceCopy />
                    <Mail size={10} strokeWidth={1.75} className="shrink-0 text-muted-foreground/40" />
                    <span className="truncate">{lead.email}</span>
                </div>
            ),
            website: () => visible.has("website") && lead.website && (
                <div key="website" className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                    <ActionBtn value={lead.website} forceType="website" />
                    <Globe size={10} strokeWidth={1.75} className="shrink-0 text-muted-foreground/40" />
                    <span className="truncate">{lead.website}</span>
                </div>
            ),
        };
        const renderedFields = [];
        if (fieldOrder.length > 0) {
            fieldOrder.forEach((fieldKey) => {
                if (fieldRenderers[fieldKey]) {
                    const f = fieldRenderers[fieldKey]();
                    if (f) renderedFields.push(f);
                } else if (fieldKey.startsWith("extra:")) {
                    const ek = fieldKey.replace("extra:", "");
                    if (lead.extra?.[ek] && visible.has(fieldKey)) {
                        renderedFields.push(
                            <div key={fieldKey} className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground truncate">
                                <ActionBtn value={String(lead.extra[ek])} />
                                <span className="truncate">{lead.extra[ek]}</span>
                            </div>
                        );
                    }
                }
            });
        } else {
            DEFAULT_CARD_FIELDS.forEach(({ key }) => {
                if (fieldRenderers[key]) { const f = fieldRenderers[key](); if (f) renderedFields.push(f); }
            });
            if (lead.extra) {
                Object.entries(lead.extra).forEach(([k, v]) => {
                    if (v && visible.has(`extra:${k}`)) {
                        renderedFields.push(
                            <div key={`extra:${k}`} className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground truncate">
                                <ActionBtn value={String(v)} />
                                <span className="truncate">{v}</span>
                            </div>
                        );
                    }
                });
            }
        }
        return renderedFields.length > 0 ? (
            <div className="mt-1 space-y-0.5">{renderedFields}</div>
        ) : null;
    };

    return (
        <div
            data-testid={`lead-card-${lead.id}`}
            draggable
            onDragStart={(e) => onDragStart(e, lead)}
            onDragEnd={onDragEnd}
            onClick={(e) => {
                const tag = e.target.closest("a, button, input, textarea, [data-no-open]");
                if (tag) return;
                onOpen(lead);
            }}
            className={`lead-card ${dragging ? "dragging" : ""} relative bg-card border rounded-2xl px-3 py-3 cursor-grab active:cursor-grabbing mb-2 transition-all ${
                quickFocused
                    ? "ring-2 ring-primary border-primary shadow-lg shadow-primary/30 scale-[1.01]"
                    : rdv && rdvIsPast
                        ? "border-rose-500/80 shadow-[inset_0_0_0_1px] shadow-rose-500/30"
                        : rdv && rdvIsSoon
                            ? "border-amber-400/80 shadow-[inset_0_0_0_1px] shadow-amber-400/20"
                            : rdv
                                ? "border-primary/50 shadow-[inset_0_0_0_1px] shadow-primary/10"
                                : isStale
                                    ? "border-rose-500/70 bg-rose-500/[0.03] dark:bg-rose-500/[0.06]"
                                    : followupIsOverdue ? "border-rose-400/50"
                                    : followupDue ? "border-amber-400/50"
                                    : "border-border"
            }`}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && onOpen(lead)}
        >
            {/* Row 1 : Avatar + Nom + badges */}
            <div className="flex items-center gap-2 mb-1">
                {quickFocused && (
                    <span className="absolute -left-1 top-1/2 -translate-y-1/2 w-1.5 h-8 rounded-full bg-primary" aria-hidden />
                )}
                <LeadAvatar lead={lead} card />
                <h4
                    className={`flex-1 font-semibold text-[13.5px] leading-snug text-foreground truncate ${
                        lead.company?.startsWith("Sans nom") ? "opacity-40 italic font-normal" : ""
                    }`}
                    title={lead.company}
                >
                    {lead.company}
                </h4>
                {visible.has("followupBadge") && followup && (
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                            followupIsOverdue ? "bg-rose-100 text-rose-700"
                            : followupDue ? "bg-amber-100 text-amber-700"
                            : "bg-blue-50 text-blue-700"
                        }`}
                    >
                        {followupIsOverdue ? <AlertTriangle size={9} strokeWidth={2.5} /> : <BellRing size={9} strokeWidth={2} />}
                        <span className="ml-0.5">{followupIsOverdue ? "retard" : followupDue ? "ajd" : `+${Math.max(1, Math.ceil((new Date(followup.dueAt).getTime() - now) / 86400000))}j`}</span>
                        <button onClick={dismissFollowup} aria-label="Ignorer" className="ml-1 opacity-50 hover:opacity-100" data-testid={`lead-followup-badge-${lead.id}`}>
                            <X size={8} strokeWidth={3} />
                        </button>
                    </div>
                )}
                {isStale && (
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold shrink-0 bg-rose-600 text-white"
                        title="Dans 'Contacté' depuis plus de 3 jours ouvrés"
                        data-testid={`lead-stale-badge-${lead.id}`}
                    >
                        <AlertTriangle size={9} strokeWidth={2.5} />
                        <span>3j+</span>
                    </div>
                )}
            </div>

            {/* Contact / Recruteur */}
            {visible.has("contact") && lead.contact && (
                <div className="flex items-center gap-1.5 mb-0.5">
                    <User size={10} strokeWidth={1.75} className="shrink-0 text-muted-foreground/50" />
                    <span className="text-[12.5px] text-muted-foreground truncate">
                        {lead.contact}
                    </span>
                </div>
            )}

            {/* RDV détecté — priorité max, juste sous le nom */}
            {rdv && rdvDate && (
                <div className={`flex items-center gap-1.5 mb-1 px-2 py-1 rounded-lg text-[12px] font-semibold ${
                    rdvIsPast
                        ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                        : rdvIsSoon
                            ? "bg-amber-400/10 text-amber-700 dark:text-amber-400"
                            : "bg-primary/8 text-primary"
                }`}>
                    <CalendarClock size={11} strokeWidth={2.5} className="shrink-0" />
                    <span className="truncate">
                        {rdvIsPast ? "⚠️ RDV dépassé · " : rdvIsToday ? "Aujourd'hui · " : "RDV · "}
                        {rdvDate.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
                        {rdv.hasTime !== false && ` à ${String(rdvDate.getHours()).padStart(2,"0")}h${String(rdvDate.getMinutes()).padStart(2,"0") !== "00" ? String(rdvDate.getMinutes()).padStart(2,"0") : ""}`}
                    </span>
                </div>
            )}

            {/* Champs highlight — haute priorité, juste sous le nom */}
            {highlighted.length > 0 && (
                <div className="flex flex-col gap-0.5 mb-0.5">
                    {highlighted.map((f) => (
                        <div key={f.id} className="flex items-center gap-1.5">
                            <Star size={9} className="shrink-0 text-amber-500 fill-amber-500" />
                            <span className="text-[12px] font-medium text-foreground/80 truncate">
                                <span className="text-muted-foreground font-normal">{f.label} · </span>
                                {f.value}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* Téléphone / Email / Site web / Champs extra */}
            {renderContactFields()}

            {/* Tags */}
            {visible.has("tags") && lead.tags && lead.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                    {lead.tags.map((tag) => {
                        const hue = hashHue(tag);
                        return (
                            <span key={tag} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11.5px] font-medium ${hue.bg} text-foreground/80`}>
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${hue.dot}`} />
                                {tag}
                            </span>
                        );
                    })}
                </div>
            )}

            {/* Deal value / Salaire */}
            {visible.has("dealValue") && lead.dealValue != null && (
                <div className="mt-1.5">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[12px] font-semibold ${
                        isJobs
                            ? "bg-violet-500/10 text-violet-700 dark:text-violet-400"
                            : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    }`}>
                        <Trophy size={11} strokeWidth={2} />
                        {isJobs ? "💰 " : ""}
                        {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(lead.dealValue)}
                        {isJobs ? " /an" : ""}
                    </span>
                </div>
            )}

            {/* Champs épinglés */}
            {visible.has("pinnedFields") && pinned.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                    {pinned.map((f) => (
                        <span key={f.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-[11.5px] text-foreground/80" data-testid={`lead-pinned-${f.id}`}>
                            <span className="font-medium">{f.value}</span>
                        </span>
                    ))}
                </div>
            )}

            {/* ══════════ BARRE D'ACTIONS ══════════ */}
            {visible.has("actionBar") && (
                <div className="mt-3 pt-3 border-t border-border/60 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <button
                        data-testid={`quick-log-${lead.id}`}
                        onClick={logToday}
                        title={contactedLabel}
                        className={`flex-1 h-8 rounded-xl text-[12px] font-medium flex items-center justify-center gap-1.5 transition-all ${
                            justLogged
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                : "bg-muted text-muted-foreground hover:bg-emerald-500/15 hover:text-emerald-700 dark:hover:text-emerald-400"
                        }`}
                    >
                        <CheckCircle2 size={13} strokeWidth={justLogged ? 2.5 : 2} />
                        <span>{contactedLabel}</span>
                    </button>

                    <Popover open={reminderOpen} onOpenChange={setReminderOpen}>
                        <PopoverTrigger asChild>
                            <button
                                data-testid={`quick-reminder-${lead.id}`}
                                onClick={(e) => e.stopPropagation()}
                                title={isJobs ? "Planifier un entretien" : "Planifier une action"}
                                className="flex-1 h-8 rounded-xl text-[12px] font-medium flex items-center justify-center gap-1.5 bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                            >
                                <CalendarClock size={13} strokeWidth={2} />
                                <span>{isJobs ? "Entretien" : "Rappel"}</span>
                            </button>
                        </PopoverTrigger>
                        <PopoverContent align="end" sideOffset={8} className="w-64 p-3 rounded-xl" onClick={(e) => e.stopPropagation()}>
                            <div className="space-y-2">
                                <div className="text-xs font-semibold text-foreground">
                                    {isJobs ? "Prochain entretien / rappel" : "Prochaine action"}
                                </div>
                                <Input type="date" value={reminderDate} onChange={(e) => setReminderDate(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveReminder(e)} data-testid={`quick-reminder-date-${lead.id}`} className="h-9" />
                                <Input placeholder={reminderPlaceholder} value={reminderLabel} onChange={(e) => setReminderLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveReminder(e)} data-testid={`quick-reminder-label-${lead.id}`} className="h-9" />
                                <div className="flex justify-end gap-1.5 pt-1">
                                    <Button variant="ghost" size="sm" className="h-8 rounded-lg text-xs" onClick={() => { setReminderDate(""); setReminderLabel(""); }}>Effacer</Button>
                                    <Button size="sm" onClick={saveReminder} data-testid={`quick-reminder-save-${lead.id}`} className="h-8 rounded-lg text-xs bg-primary hover:bg-primary/90 text-primary-foreground">Enregistrer</Button>
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>

                    <MoveColumnButton lead={lead} workspace={workspace} currentColumnId={lead.columnId} dispatch={dispatch} />
                </div>
            )}

            {/* ══════════ ÉVÉNEMENTS (sous les boutons) ══════════ */}
            {(lead.lastContact || (lead.notes && lead.notes.length > 0) || (visible.has("nextAction") && lead.nextAction?.date) || (visible.has("statusTime") && currentEntry)) && (
                <div className="mt-2.5 pt-2.5 border-t border-border/60 space-y-1.5">

                    {/* Dernier contact */}
                    {lead.lastContact && (
                        <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground" data-testid={`lead-event-contact-${lead.id}`}>
                            <CheckCircle2 size={11} strokeWidth={2} className="text-emerald-500 shrink-0" />
                            <span>Contacté {formatLastContact(lead.lastContact)}</span>
                        </div>
                    )}

                    {/* Dernière note — toujours visible si stale OU si lastNote est activé */}
                    {lead.notes && lead.notes.length > 0 && (visible.has("lastNote") || isStale) && (
                        <div
                            className={`flex items-start gap-2 text-[11.5px] ${
                                isStale
                                    ? "text-rose-700 dark:text-rose-400 font-medium"
                                    : "text-muted-foreground"
                            }`}
                            data-testid={`lead-event-note-${lead.id}`}
                        >
                            <MessageSquare
                                size={11}
                                strokeWidth={isStale ? 2 : 1.5}
                                className={`shrink-0 mt-0.5 ${isStale ? "text-rose-500" : "text-muted-foreground/60"}`}
                            />
                            <span className="line-clamp-2 leading-relaxed">{lead.notes[0].text}</span>
                        </div>
                    )}

                    {/* Prochaine action */}
                    {visible.has("nextAction") && lead.nextAction?.date && (() => {
                        const na = lead.nextAction;
                        const dueTime = na.dueAt ? new Date(na.dueAt).getTime() : new Date(na.date + "T09:00:00").getTime();
                        const isPast = dueTime <= now;
                        const isToday = new Date(na.dueAt || na.date).toDateString() === new Date().toDateString();
                        const isMeeting = !!na.meeting;

                        // RDV → toujours vert (sauf passé → rouge)
                        const cls = isMeeting
                            ? isPast
                                ? "text-rose-600 dark:text-rose-400"
                                : "text-emerald-600 dark:text-emerald-400"
                            : isPast || na.overdue
                                ? "text-rose-600 dark:text-rose-400"
                                : isToday
                                    ? "text-amber-600 dark:text-amber-400"
                                    : "text-muted-foreground";

                        const bgCls = isMeeting && !isPast
                            ? "bg-emerald-500/10 rounded-lg px-2 py-0.5"
                            : "";

                        const dateStr = new Date(na.dueAt || na.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
                        // Ajouter l'heure si le RDV en a une et que ce n'est pas 09:00 (valeur par défaut)
                        const dueDate = na.dueAt ? new Date(na.dueAt) : null;
                        const timeStr = dueDate && !(dueDate.getHours() === 9 && dueDate.getMinutes() === 0)
                            ? ` à ${String(dueDate.getHours()).padStart(2, "0")}h${String(dueDate.getMinutes()).padStart(2, "0")}`
                            : "";
                        const labelToShow = na.auto ? null : na.label;
                        const icon = isMeeting
                            ? <CalendarCheck size={11} strokeWidth={2} className="shrink-0" />
                            : <BellRing size={11} strokeWidth={2} className="shrink-0" />;

                        return (
                            <div className={`flex items-center gap-2 text-[11.5px] font-medium ${cls} ${bgCls}`} data-testid={`lead-next-action-badge-${lead.id}`}>
                                {icon}
                                <span className="truncate">{dateStr}{timeStr}{labelToShow ? ` · ${labelToShow}` : ""}</span>
                            </div>
                        );
                    })()}

                    {/* Temps dans la colonne */}
                    {visible.has("statusTime") && currentEntry && (
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60" data-testid={`lead-status-time-${lead.id}`}>
                            <Clock size={10} strokeWidth={1.5} className="shrink-0" />
                            <span>{formatShortDateTime(currentEntry.at)}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}, (prev, next) => {
    // Comparateur personnalisé pour memo :
    // re-render uniquement si lead, colonne, état drag ou cardFields ont changé.
    return (
        prev.lead === next.lead &&
        prev.column === next.column &&
        prev.dragging === next.dragging &&
        prev.workspace.cardFields === next.workspace.cardFields &&
        prev.workspace.columnWidth === next.workspace.columnWidth
    );
});