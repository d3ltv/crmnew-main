import React, { useEffect, useState, useMemo } from "react";
import { Phone, PhoneOff, Save, X, Sparkles, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCrm } from "@/context/CrmContext";
import { formatDateTimeLong } from "@/lib/dateUtils";
import { parseNote, diffWithLead, formatDetected, detectAppointment } from "@/lib/noteParser";

export const CallNoteModal = ({ open, workspace, lead, onClose, onAutoMoved }) => {
    const { dispatch } = useCrm();
    const [text, setText] = useState("");
    const [outcome, setOutcome] = useState(null); // 'reached' | 'noanswer' | null

    useEffect(() => {
        if (open) {
            setText("");
            setOutcome(null);
        }
    }, [open, lead?.id]);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "Escape" && open) onClose();
            if (e.key === "Enter" && open && outcome) {
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
    }, [open, text, outcome]);

    // ── Analyse du texte en temps réel ───────────────────────────────────────
    const detected = useMemo(() => parseNote(text), [text]);
    const diff = useMemo(
        () => lead ? diffWithLead(detected, lead) : { newPhone: null, extraPhones: [], newEmail: null, newAddress: null },
        [detected, lead]
    );
    const detectedItems = useMemo(() => formatDetected(detected), [detected]);
    const appointment = useMemo(() => detectAppointment(text), [text]);

    const hasNewInfo = diff.newPhone || diff.extraPhones.length > 0 || diff.newEmail || diff.newAddress;

    if (!open || !lead) return null;

    const columnName = workspace.columns[lead.columnId]?.name;

    const autoFollowupColumn = workspace.columnOrder
        .map((cid) => workspace.columns[cid])
        .find((c) => c.autoFollowup);

    const save = () => {
        if (!outcome) return;
        const content = text.trim();

        // ── 1. Sauvegarder la note telle quelle (jamais modifiée) ──────────
        const noteText = outcome === "reached"
            ? (content ? `📞 Joint · ${content}` : "📞 Joint")
            : (content ? `📵 Pas de réponse · ${content}` : "📵 Pas de réponse");

        if (outcome === "reached") {
            dispatch({
                type: "LOG_CONTACT",
                workspaceId: workspace.id,
                leadId: lead.id,
                text: noteText,
            });
        } else if (outcome === "noanswer") {
            dispatch({
                type: "ADD_NOTE",
                workspaceId: workspace.id,
                leadId: lead.id,
                text: noteText,
            });
        }

        // ── 1b. Déplacement vers la colonne de rappel ─────────────────────
        // Si RDV détecté → toujours déplacer vers la colonne autoFollowup
        // Si pas de réponse sans RDV → même logique (comportement existant)
        const shouldMove = appointment
            ? (autoFollowupColumn && lead.columnId !== autoFollowupColumn.id)
            : (outcome === "noanswer" && autoFollowupColumn && lead.columnId !== autoFollowupColumn.id);

        if (shouldMove) {
            // Signaler à WorkspacePage que ce déplacement est automatique
            // → pas besoin d'ouvrir un nouveau modal pour ce lead
            onAutoMoved?.(lead.id);
            dispatch({
                type: "MOVE_LEAD_ORDERED",
                workspaceId: workspace.id,
                leadId: lead.id,
                toColumnId: autoFollowupColumn.id,
                toIndex: null,
            });
        }

        // ── 2. Injecter les infos détectées dans le lead ─────────────────
        const patch = {};
        if (diff.newPhone) patch.phone = diff.newPhone;
        if (diff.newEmail) patch.email = diff.newEmail;

        // Rendez-vous détecté → nextAction
        if (appointment) {
            patch.nextAction = {
                date: appointment.iso.slice(0, 10),
                dueAt: appointment.iso,
                label: `📅 RDV détecté · ${appointment.label}`,
                auto: false,
            };
        }

        if (Object.keys(patch).length > 0) {
            dispatch({
                type: "UPDATE_LEAD",
                workspaceId: workspace.id,
                leadId: lead.id,
                patch,
            });
        }

        // Téléphones supplémentaires → customFields
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

        // Adresse postale → customField "Adresse"
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

    const skip = () => onClose();

    const isMac = /iPhone|iPad|Macintosh/.test(navigator.userAgent);

    return (
        <>
            <div
                className="fixed inset-0 z-[60] bg-foreground/20 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={skip}
                data-testid="call-note-backdrop"
            />
            <div
                data-testid="call-note-modal"
                className="fixed z-[70] left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-[480px] glass-strong rounded-3xl shadow-panel border border-border/60 overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
                style={{
                    top: "50%",
                    transform: "translate(-50%, -50%)",
                    maxHeight: "calc(100dvh - 2rem)",
                }}
            >
                {/* ── Header ── */}
                <div className="px-5 pt-5 pb-3">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="text-[11px] uppercase tracking-wider text-primary font-semibold">
                                {columnName}
                            </div>
                            <h3 className="text-lg font-semibold tracking-tight truncate mt-0.5">
                                Note d'appel · {lead.company}
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

                    {/* ── Résultat de l'appel ── */}
                    <div className="mt-4 flex gap-2">
                        <button
                            data-testid="call-outcome-reached"
                            onClick={() => setOutcome("reached")}
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
                            onClick={() => setOutcome("noanswer")}
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

                    {/* ── Zone de note ── */}
                    <Textarea
                        data-testid="call-note-text"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Note d'appel… Ex : « Rappeler M. Dupont au 06 12 34 56 78 »"
                        autoFocus
                        className="mt-3 min-h-[100px] resize-none rounded-xl text-sm"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1.5">
                        {isMac ? "⌘" : "Ctrl"} + Entrée pour enregistrer
                    </p>

                    {/* ── Rendez-vous détecté ── */}
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

                    {/* ── Infos détectées ── */}
                    {detectedItems.length > 0 && (
                        <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
                            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-primary uppercase tracking-wider">
                                <Sparkles size={11} />
                                Infos détectées — seront ajoutées à la fiche
                            </div>
                            <div className="space-y-1">
                                {detectedItems.map((item, i) => {
                                    // Détecter si cet item est "nouveau" ou déjà présent
                                    const isNew =
                                        (item.type === "phone" && (diff.newPhone === item.value || diff.extraPhones.includes(item.value))) ||
                                        (item.type === "email" && diff.newEmail === item.value) ||
                                        (item.type === "address" && diff.newAddress === item.value);

                                    return (
                                        <div
                                            key={i}
                                            className={`flex items-center gap-2 text-[12px] rounded-lg px-2 py-1 ${
                                                isNew
                                                    ? "text-foreground"
                                                    : "text-muted-foreground line-through opacity-50"
                                            }`}
                                        >
                                            <span className="text-base leading-none shrink-0">{item.icon}</span>
                                            <span className="truncate font-medium">{item.value}</span>
                                            {!isNew && (
                                                <span className="ml-auto text-[10px] shrink-0 opacity-70">déjà présent</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Footer ── */}
                <div className="px-5 py-3 border-t border-border/60 flex items-center justify-between gap-2 bg-secondary/30">
                    <div className="text-[11px] text-muted-foreground">
                        {hasNewInfo && outcome && (
                            <span className="text-primary font-medium">
                                ✓ Fiche mise à jour automatiquement
                            </span>
                        )}
                    </div>
                    <div className="flex gap-2">
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
                            disabled={!outcome}
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
