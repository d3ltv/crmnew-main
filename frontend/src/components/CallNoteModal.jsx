import React, { useEffect, useState, useMemo } from "react";
import { Phone, PhoneOff, Save, X, Sparkles, CalendarClock, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCrm } from "@/context/CrmContext";
import { formatDateTimeLong, toLocalDateKey, addDaysSkippingWeekend, addDaysSkippingWeekendIso, formatFutureRelativeFr } from "@/lib/dateUtils";
import { parseNote, diffWithLead, formatDetected, detectAppointment } from "@/lib/noteParser";
import { isMeetingColumn } from "@/constants/columnPatterns";
import { makeRdvNextAction } from "@/lib/nextActionUtils";
import { normalizeInconsistencyConfig } from "@/lib/inconsistencyRules";

const RELANCE_DAY_CHIPS = [1, 2, 3, 4, 5, 6, 7];

export const CallNoteModal = ({
    open,
    workspace,
    lead,
    onClose,
    onAutoMoved,
    /** Si fourni (mode rapide) : déplacer vers cette colonne uniquement à l'enregistrement, pas à l'ouverture */
    pendingMoveToColumnId = null,
}) => {
    const { dispatch } = useCrm();
    const [text, setText] = useState("");
    const [outcome, setOutcome] = useState(null); // 'reached' | 'noanswer' | null
    const [outcomeManual, setOutcomeManual] = useState(false);
    const [suggestRelance, setSuggestRelance] = useState(true);
    const [relanceDays, setRelanceDays] = useState(2);

    const defaultRelanceDays = useMemo(() => {
        const cfg = normalizeInconsistencyConfig(workspace?.inconsistencyConfig);
        return cfg.thresholds?.noAnswerDays || 2;
    }, [workspace?.inconsistencyConfig]);

    useEffect(() => {
        if (open) {
            setText("");
            setOutcome(null);
            setOutcomeManual(false);
            setSuggestRelance(true);
            setRelanceDays(defaultRelanceDays);
        }
    }, [open, lead?.id, defaultRelanceDays]);

    const handleTextChange = (e) => {
        const val = e.target.value;
        setText(val);
        if (!outcomeManual) {
            setOutcome(val.trim().length > 0 ? "reached" : null);
        }
    };

    const handleOutcomeClick = (value) => {
        setOutcome(value);
        setOutcomeManual(true);
        if (value === "noanswer") {
            setSuggestRelance(true);
            setRelanceDays(defaultRelanceDays);
        } else if (value === "reached") {
            setSuggestRelance(true);
            setRelanceDays(defaultRelanceDays);
        }
    };

    const detected = useMemo(() => parseNote(text), [text]);
    const diff = useMemo(
        () => (lead
            ? diffWithLead(detected, lead)
            : {
                newPhone: null,
                extraPhones: [],
                newEmail: null,
                newAddress: null,
                newContact: null,
                extraContacts: [],
                willAddPersons: [],
            }),
        [detected, lead]
    );
    const detectedItems = useMemo(() => formatDetected(detected), [detected]);
    const appointment = useMemo(() => detectAppointment(text), [text]);

    const hasNewInfo = !!(
        diff.newPhone
        || diff.extraPhones.length > 0
        || diff.newEmail
        || diff.newAddress
        || diff.newContact
        || (diff.extraContacts || []).length > 0
    );

    const effectiveOutcome = outcome ?? (text.trim() ? "reached" : "noanswer");
    const showRelanceSuggest = !appointment && (
        effectiveOutcome === "noanswer" || effectiveOutcome === "reached"
    );

    const save = () => {
        if (!lead || !open) return;
        const finalOutcome = outcome ?? "noanswer";
        const content = text.trim();

        let effectiveColumnId = lead.columnId;
        if (pendingMoveToColumnId && lead.columnId !== pendingMoveToColumnId) {
            onAutoMoved?.(lead.id);
            dispatch({
                type: "MOVE_LEAD_ORDERED",
                workspaceId: workspace.id,
                leadId: lead.id,
                toColumnId: pendingMoveToColumnId,
                toIndex: null,
            });
            effectiveColumnId = pendingMoveToColumnId;
        }

        const noteText = finalOutcome === "reached"
            ? (content ? `📞 Joint · ${content}` : "📞 Joint")
            : (content ? `📵 Pas de réponse · ${content}` : "📵 Pas de réponse");

        if (finalOutcome === "reached") {
            dispatch({
                type: "LOG_CONTACT",
                workspaceId: workspace.id,
                leadId: lead.id,
                text: noteText,
            });
        } else {
            dispatch({
                type: "ADD_NOTE",
                workspaceId: workspace.id,
                leadId: lead.id,
                text: noteText,
            });
        }

        const meetingColumn = workspace.columnOrder
            .map((cid) => workspace.columns[cid])
            .find((c) => c && isMeetingColumn(c.name));

        const autoFollowupColumn = workspace.columnOrder
            .map((cid) => workspace.columns[cid])
            .find((c) => c.autoFollowup);

        const shouldMoveToMeeting =
            !!appointment && meetingColumn && effectiveColumnId !== meetingColumn.id;
        const shouldMoveToFollowup =
            !appointment
            && finalOutcome === "noanswer"
            && outcomeManual
            && autoFollowupColumn
            && effectiveColumnId !== autoFollowupColumn.id;

        if (shouldMoveToMeeting) {
            onAutoMoved?.(lead.id);
            dispatch({
                type: "MOVE_LEAD_ORDERED",
                workspaceId: workspace.id,
                leadId: lead.id,
                toColumnId: meetingColumn.id,
                toIndex: null,
            });
            effectiveColumnId = meetingColumn.id;
        } else if (shouldMoveToFollowup) {
            onAutoMoved?.(lead.id);
            dispatch({
                type: "MOVE_LEAD_ORDERED",
                workspaceId: workspace.id,
                leadId: lead.id,
                toColumnId: autoFollowupColumn.id,
                toIndex: null,
            });
            effectiveColumnId = autoFollowupColumn.id;
        }

        const patch = {};
        if (diff.newPhone) patch.phone = diff.newPhone;
        if (diff.newEmail) patch.email = diff.newEmail;
        if (diff.newContact) patch.contact = diff.newContact;

        if (appointment) {
            patch.nextAction = makeRdvNextAction({
                date: toLocalDateKey(appointment.iso),
                dueAt: appointment.iso,
                label: `RDV détecté · ${appointment.label}`,
            });
        } else if (suggestRelance && !appointment) {
            const days = Math.min(Math.max(1, Number(relanceDays) || 1), 7);
            const dueDate = addDaysSkippingWeekend(days);
            dueDate.setHours(9, 0, 0, 0);
            const dueAt = dueDate.toISOString();
            const dateKey = toLocalDateKey(dueDate);
            const relative = formatFutureRelativeFr(dueDate);

            if (finalOutcome === "noanswer") {
                const currentStage = lead.autoFollowup?.stage ?? 0;
                const nextStage = Math.min(Math.max(currentStage + 1, Math.min(days, 3)), 3);
                const now = new Date().toISOString();
                patch.autoFollowup = {
                    stage: nextStage,
                    dueAt,
                    startedAt: lead.autoFollowup?.startedAt || now,
                    columnId: effectiveColumnId,
                    overdue: false,
                };
                patch.nextAction = {
                    date: dateKey,
                    dueAt,
                    label: `📵 Pas de réponse · rappel ${relative}`,
                    auto: true,
                    stage: nextStage,
                };
            } else if (finalOutcome === "reached") {
                patch.nextAction = {
                    date: dateKey,
                    dueAt,
                    label: `🔁 Relance suggérée · ${relative}`,
                    auto: false,
                    calendarReminder: true,
                    suggestedDays: days,
                };
            }
        }

        if (Object.keys(patch).length > 0) {
            dispatch({
                type: "UPDATE_LEAD",
                workspaceId: workspace.id,
                leadId: lead.id,
                patch,
            });
        }

        diff.extraPhones.forEach((phone) => {
            dispatch({
                type: "ADD_CUSTOM_FIELD",
                workspaceId: workspace.id,
                leadId: lead.id,
                label: "Téléphone",
                value: phone,
                pinned: false,
            });
        });

        (diff.extraContacts || []).forEach((person) => {
            dispatch({
                type: "ADD_CUSTOM_FIELD",
                workspaceId: workspace.id,
                leadId: lead.id,
                label: "Contact",
                value: person,
                pinned: false,
                highlight: true,
            });
        });

        if (diff.newAddress) {
            dispatch({
                type: "ADD_CUSTOM_FIELD",
                workspaceId: workspace.id,
                leadId: lead.id,
                label: "Adresse",
                value: diff.newAddress,
                pinned: false,
            });
        }

        onClose();
    };

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "Escape" && open) onClose();
            if (e.key === "Enter" && open) {
                if (e.target.tagName === "TEXTAREA") {
                    if (e.metaKey || e.ctrlKey) save();
                } else {
                    save();
                }
            }
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, text, outcome, pendingMoveToColumnId, suggestRelance, relanceDays]);

    if (!open || !lead) return null;

    const columnName = workspace.columns[lead.columnId]?.name;
    const isMac = /iPhone|iPad|Macintosh/.test(navigator.userAgent);
    const relanceDueDate = addDaysSkippingWeekendIso(relanceDays);
    const relanceDueLabel = new Date(relanceDueDate).toLocaleDateString("fr-FR", {
        weekday: "short",
        day: "numeric",
        month: "short",
    });

    const skip = () => onClose();

    return (
        <>
            <div
                className="fixed inset-0 z-[60] bg-foreground/20 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={skip}
                data-testid="call-note-backdrop"
            />
            <div
                data-testid="call-note-modal"
                className="fixed z-[70] left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-[480px] bg-card rounded-2xl shadow-panel border border-border overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
                style={{
                    top: "50%",
                    transform: "translate(-50%, -50%)",
                    maxHeight: "calc(100dvh - 2rem)",
                }}
            >
                <div className="px-5 pt-5 pb-3">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="text-[11px] uppercase tracking-wider text-primary font-semibold">
                                {columnName}
                            </div>
                            <h3 className="text-lg font-semibold tracking-tight truncate mt-0.5">
                                Note d&apos;appel · {lead.company}
                            </h3>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {formatDateTimeLong(new Date().toISOString())}
                            </p>
                        </div>
                        <button
                            onClick={skip}
                            data-testid="call-note-close"
                            aria-label="Fermer"
                            className="w-9 h-9 rounded-full hover:bg-secondary text-muted-foreground shrink-0 flex items-center justify-center"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    <div className="mt-4 flex gap-2">
                        <button
                            data-testid="call-outcome-reached"
                            onClick={() => handleOutcomeClick("reached")}
                            className={`flex-1 h-16 rounded-xl text-sm font-medium flex flex-col items-center justify-center gap-1 transition-all ${
                                outcome === "reached"
                                    ? "bg-emerald-500 text-white shadow-lg scale-[1.02]"
                                    : "bg-secondary text-foreground hover:bg-emerald-500/10"
                            }`}
                        >
                            <Phone size={24} strokeWidth={2} />
                            <span className="text-xs">Contacté</span>
                        </button>
                        <button
                            data-testid="call-outcome-noanswer"
                            onClick={() => handleOutcomeClick("noanswer")}
                            className={`flex-1 h-16 rounded-xl text-sm font-medium flex flex-col items-center justify-center gap-1 transition-all ${
                                outcome === "noanswer"
                                    ? "bg-rose-500 text-white shadow-lg scale-[1.02]"
                                    : "bg-secondary text-foreground hover:bg-rose-500/10"
                            }`}
                        >
                            <PhoneOff size={24} strokeWidth={2} />
                            <span className="text-xs">Pas de réponse</span>
                        </button>
                    </div>

                    <Textarea
                        data-testid="call-note-text"
                        value={text}
                        onChange={handleTextChange}
                        placeholder="Note d'appel… Ex : « Rappeler M. Dupont mardi 14h »"
                        autoFocus
                        className="mt-3 min-h-[100px] resize-none rounded-xl text-sm"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-2 flex-wrap">
                        <span>
                            <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono text-[10px]">Entrée</kbd>
                            {" "}→ enregistrer
                        </span>
                        <span className="opacity-50">·</span>
                        <span>
                            <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono text-[10px]">{isMac ? "⌘" : "Ctrl"}+Entrée</kbd>
                            {" "}dans la note
                        </span>
                    </p>

                    {appointment && (
                        <div className="mt-3 rounded-xl border border-primary/30 bg-primary/8 p-3 flex items-center gap-3">
                            <CalendarClock size={16} className="text-primary shrink-0" />
                            <div className="flex-1 min-w-0">
                                <div className="text-[11px] font-semibold text-primary uppercase tracking-wider">
                                    Rendez-vous détecté
                                </div>
                                <div className="text-sm font-semibold text-foreground mt-0.5">
                                    {appointment.label}
                                </div>
                            </div>
                            <span className="text-[10px] text-muted-foreground shrink-0">
                                sera enregistré
                            </span>
                        </div>
                    )}

                    {showRelanceSuggest && (
                        <div
                            className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/8 p-3 space-y-2.5"
                            data-testid="call-relance-suggest"
                        >
                            <label className="flex items-start gap-2.5 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={suggestRelance}
                                    onChange={(e) => setSuggestRelance(e.target.checked)}
                                    className="mt-0.5 rounded border-border"
                                    data-testid="call-relance-toggle"
                                />
                                <span className="min-w-0">
                                    <span className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-800 dark:text-amber-300">
                                        <BellRing size={13} strokeWidth={2.25} />
                                        {effectiveOutcome === "noanswer"
                                            ? "Programmer un rappel"
                                            : "Suggérer une relance"}
                                    </span>
                                    <span className="block text-[11px] text-muted-foreground mt-0.5">
                                        {suggestRelance
                                            ? `Prévu le ${relanceDueLabel} (hors week-end)`
                                            : "Aucune relance ne sera créée"}
                                    </span>
                                </span>
                            </label>
                            {suggestRelance && (
                                <div className="flex flex-wrap gap-1.5 pl-6">
                                    {RELANCE_DAY_CHIPS.map((d) => (
                                        <button
                                            key={d}
                                            type="button"
                                            data-testid={`call-relance-days-${d}`}
                                            onClick={() => setRelanceDays(d)}
                                            className={`h-7 px-2.5 rounded-full text-[11px] font-medium transition-colors ${
                                                relanceDays === d
                                                    ? "bg-amber-600 text-white"
                                                    : "bg-background border border-border text-muted-foreground hover:text-foreground"
                                            }`}
                                        >
                                            +{d} j
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {detectedItems.length > 0 && (
                        <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
                            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-primary uppercase tracking-wider">
                                <Sparkles size={11} />
                                Infos détectées — seront ajoutées à la fiche
                            </div>
                            <div className="space-y-1">
                                {detectedItems.map((item, i) => {
                                    const willAddPerson = item.type === "person"
                                        && (diff.willAddPersons || []).includes(item.value);
                                    const isNew =
                                        willAddPerson
                                        || (item.type === "phone" && (diff.newPhone === item.value || diff.extraPhones.includes(item.value)))
                                        || (item.type === "email" && diff.newEmail === item.value)
                                        || (item.type === "address" && diff.newAddress === item.value);
                                    const personOnFile = item.type === "person"
                                        && !willAddPerson
                                        && (
                                            (lead.contact || "").trim().toLowerCase() === item.value.trim().toLowerCase()
                                            || (lead.customFields || []).some(
                                                (cf) => /contact|interlocuteur|personne|nom/i.test(cf.label || "")
                                                    && (cf.value || "").trim().toLowerCase() === item.value.trim().toLowerCase()
                                            )
                                        );

                                    return (
                                        <div
                                            key={i}
                                            className={`flex items-center gap-2 text-[12px] rounded-lg px-2 py-1 ${
                                                isNew
                                                    ? "text-foreground"
                                                    : personOnFile
                                                        ? "text-muted-foreground"
                                                        : "text-muted-foreground line-through opacity-50"
                                            }`}
                                        >
                                            <span className="text-base leading-none shrink-0">{item.icon}</span>
                                            <span className="truncate font-medium">{item.value}</span>
                                            {isNew && item.type === "person" && (
                                                <span className="ml-auto text-[10px] shrink-0 text-primary">sera ajouté</span>
                                            )}
                                            {personOnFile && (
                                                <span className="ml-auto text-[10px] shrink-0 opacity-70">sur la fiche</span>
                                            )}
                                            {!isNew && !personOnFile && (
                                                <span className="ml-auto text-[10px] shrink-0 opacity-70">déjà présent</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                <div className="px-5 py-3 border-t border-border/60 flex items-center justify-between gap-2 bg-secondary/30">
                    <div className="text-[11px] text-muted-foreground min-w-0">
                        {hasNewInfo && (
                            <span className="text-primary font-medium">
                                ✓ Fiche mise à jour automatiquement
                            </span>
                        )}
                        {!hasNewInfo && appointment && (
                            <span className="text-primary font-medium">RDV sera enregistré</span>
                        )}
                        {!hasNewInfo && !appointment && suggestRelance && showRelanceSuggest && (
                            <span className="text-amber-600 dark:text-amber-400 font-medium truncate block">
                                Relance · {relanceDueLabel}
                            </span>
                        )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                        <Button
                            variant="ghost"
                            onClick={skip}
                            data-testid="call-note-skip"
                            className="h-10 rounded-full"
                        >
                            Passer
                        </Button>
                        <Button
                            onClick={save}
                            data-testid="call-note-save"
                            className="h-10 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground"
                        >
                            <Save size={14} className="mr-1.5" />
                            Enregistrer
                        </Button>
                    </div>
                </div>
            </div>
        </>
    );
};
