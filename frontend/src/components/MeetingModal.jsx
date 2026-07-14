import React, { useEffect, useRef, useState } from "react";
import { CalendarCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCrm } from "@/context/CrmContext";

/**
 * Modal qui s'ouvre quand un lead entre dans une colonne "Rendez-vous".
 * Demande la date + heure du RDV et l'enregistre comme nextAction.
 */
export const MeetingModal = ({ open, lead, workspace, onClose }) => {
    const { dispatch } = useCrm();
    const [date, setDate] = useState("");
    const [time, setTime] = useState("");
    const [label, setLabel] = useState("");
    const dateRef = useRef(null);

    useEffect(() => {
        if (open) {
            // Pré-remplir avec la date du jour
            const today = new Date().toISOString().slice(0, 10);
            setDate(today);
            setTime("");
            setLabel("");
            const t = setTimeout(() => dateRef.current?.focus(), 80);
            return () => clearTimeout(t);
        }
    }, [open, lead?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const onKey = (e) => {
            if (!open) return;
            if (e.key === "Escape") onClose();
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [open, date, time, label]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!open || !lead) return null;

    const save = () => {
        if (!date) { onClose(); return; }

        // Construire la date ISO avec l'heure si fournie
        const dueAt = time
            ? new Date(`${date}T${time}:00`).toISOString()
            : new Date(`${date}T09:00:00`).toISOString();

        const dateLabel = new Date(dueAt).toLocaleDateString("fr-FR", {
            weekday: "long", day: "numeric", month: "long",
        });
        const timeLabel = time ? ` à ${time}` : "";
        const fullLabel = label.trim()
            ? label.trim()
            : `RDV — ${dateLabel}${timeLabel}`;

        dispatch({
            type: "SET_NEXT_ACTION",
            workspaceId: workspace.id,
            leadId: lead.id,
            nextAction: {
                date,
                dueAt,
                label: fullLabel,
                auto: false,
                meeting: true, // flag pour l'affichage vert sur la carte
            },
        });
        onClose();
    };

    const skip = () => onClose();

    const isMac = /iPhone|iPad|Macintosh/.test(navigator.userAgent);

    return (
        <>
            <div
                className="fixed inset-0 z-[60] bg-foreground/20 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={skip}
            />
            <div className="fixed z-[70] left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-[420px] glass-strong rounded-3xl shadow-panel border border-border/60 animate-in fade-in zoom-in-95 duration-200"
                style={{ top: "50%", transform: "translate(-50%, -50%)" }}
            >
                {/* Header */}
                <div className="px-6 pt-6 pb-4 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 flex items-center justify-center shrink-0">
                            <CalendarCheck size={18} className="text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} />
                        </div>
                        <div>
                            <h3 className="text-base font-semibold tracking-tight">Rendez-vous planifié</h3>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[220px]">
                                {lead.company}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={skip}
                        aria-label="Fermer"
                        className="w-9 h-9 rounded-full hover:bg-secondary text-muted-foreground shrink-0 flex items-center justify-center"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 pb-4 space-y-3">
                    <p className="text-sm text-muted-foreground">
                        Pour quand est prévu ce rendez-vous ?
                    </p>

                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                            <label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                                Date
                            </label>
                            <Input
                                ref={dateRef}
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="h-10"
                                data-testid="meeting-date-input"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                                Heure (opt.)
                            </label>
                            <Input
                                type="time"
                                value={time}
                                onChange={(e) => setTime(e.target.value)}
                                className="h-10"
                                data-testid="meeting-time-input"
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                            Objet (opt.)
                        </label>
                        <Input
                            type="text"
                            placeholder="ex. Démo produit, Présentation offre…"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && save()}
                            className="h-10"
                            data-testid="meeting-label-input"
                        />
                    </div>

                    <p className="text-[11px] text-muted-foreground">
                        {isMac ? "⌘" : "Ctrl"} + Entrée pour enregistrer
                    </p>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-border/60 flex items-center justify-end gap-2 bg-secondary/30">
                    <Button variant="ghost" onClick={skip} className="h-10 rounded-full text-sm">
                        Passer
                    </Button>
                    <Button
                        onClick={save}
                        disabled={!date}
                        data-testid="meeting-save-btn"
                        className="h-10 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium"
                    >
                        <CalendarCheck size={14} className="mr-1.5" />
                        Enregistrer le RDV
                    </Button>
                </div>
            </div>
        </>
    );
};
