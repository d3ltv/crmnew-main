import React, { useState, useEffect, useMemo } from "react";
import { Target } from "lucide-react";
import { isContactedColumn } from "@/constants/columnPatterns";

// ─── Helper local : accepte un nom de colonne (string) ───────────────────────
const isContactedCol = (name = "") => isContactedColumn(name);

// ─── Clé localStorage pour l'objectif ────────────────────────────────────────
const GOAL_KEY = "crm_daily_goal";

function getTodayStr() {
    return new Date().toLocaleDateString("fr-CA"); // YYYY-MM-DD
}

function loadGoal() {
    try {
        const v = localStorage.getItem(GOAL_KEY);
        if (v === null) return 20;
        const n = parseInt(v, 10);
        return isNaN(n) || n < 1 ? 20 : n;
    } catch {
        return 20;
    }
}

function saveGoal(n) {
    try { localStorage.setItem(GOAL_KEY, String(n)); } catch {}
}

// ─── Calcule combien de leads ont été déplacés dans une colonne "contacté"
// AUJOURD'HUI. On regarde statusHistory pour chaque lead.
function countContactedToday(workspace) {
    const todayStr = getTodayStr();
    let count = 0;
    for (const lead of Object.values(workspace.leads || {})) {
        const history = lead.statusHistory || [];
        // Cherche si le lead a une entrée dans une colonne "contacté" aujourd'hui
        const hasContactedToday = history.some((entry) => {
            if (!entry.at) return false;
            const entryDate = new Date(entry.at).toLocaleDateString("fr-CA");
            if (entryDate !== todayStr) return false;
            const col = workspace.columns?.[entry.columnId];
            return col && isContactedCol(col.name);
        });
        if (hasContactedToday) count++;
    }
    return count;
}

// ─── Code couleur selon progression ──────────────────────────────────────────
function getColorScheme(ratio) {
    if (ratio >= 1)     return { bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", label: "Objectif atteint !" };
    if (ratio >= 0.7)   return { bar: "bg-yellow-400",  text: "text-yellow-600 dark:text-yellow-400",  label: "Bientôt !" };
    if (ratio >= 0.35)  return { bar: "bg-orange-400",  text: "text-orange-600 dark:text-orange-400",  label: "En cours" };
    return                     { bar: "bg-muted-foreground/40", text: "text-muted-foreground", label: "En cours" };
}

// ─── Composant principal ──────────────────────────────────────────────────────
export const DailyGoalWidget = ({ workspace, onEditGoal }) => {
    const [goal, setGoal] = useState(loadGoal);

    // Recharger l'objectif depuis localStorage si modifié ailleurs
    useEffect(() => {
        const handler = () => setGoal(loadGoal());
        window.addEventListener("crm_goal_updated", handler);
        return () => window.removeEventListener("crm_goal_updated", handler);
    }, []);

    const current = useMemo(() => countContactedToday(workspace), [workspace]);
    const ratio = goal > 0 ? Math.min(current / goal, 1) : 0;
    const pct = Math.round(ratio * 100);
    const { bar, text, label } = getColorScheme(ratio);

    return (
        <button
            onClick={onEditGoal}
            title={`Objectif quotidien — ${label}\nCliquez pour modifier`}
            className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl hover:bg-secondary transition-colors group min-w-[72px]"
            aria-label={`Objectif quotidien : ${current} sur ${goal} contacts`}
            data-testid="daily-goal-widget"
        >
            {/* Chiffres */}
            <div className="flex items-baseline gap-0.5">
                <span className={`text-[15px] font-bold tabular-nums leading-none ${text}`}>
                    {current}
                </span>
                <span className="text-[11px] text-muted-foreground font-medium leading-none">
                    /{goal}
                </span>
            </div>

            {/* Barre de progression */}
            <div className="w-full h-[3px] rounded-full bg-secondary overflow-hidden mt-0.5">
                <div
                    className={`h-full rounded-full transition-all duration-500 ${bar}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
        </button>
    );
};

// ─── Sous-composant : dialog d'édition de l'objectif ─────────────────────────
export const DailyGoalEditor = ({ open, onClose }) => {
    const [value, setValue] = useState("");

    useEffect(() => {
        if (open) setValue(String(loadGoal()));
    }, [open]);

    const handleSave = () => {
        const n = parseInt(value, 10);
        if (!isNaN(n) && n >= 1) {
            saveGoal(n);
            window.dispatchEvent(new Event("crm_goal_updated"));
        }
        onClose();
    };

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="bg-card border border-border rounded-2xl shadow-panel p-6 w-80 space-y-4">
                <div className="flex items-center gap-2">
                    <Target size={16} className="text-primary" />
                    <h3 className="font-semibold text-sm tracking-tight">Objectif quotidien</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                    Définissez le nombre de prospects à contacter par jour. Le compteur se réinitialise automatiquement chaque nuit à 00:01.
                </p>
                <div className="space-y-1.5">
                    <label className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
                        Nombre de contacts visé
                    </label>
                    <input
                        type="number"
                        min="1"
                        max="999"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onClose(); }}
                        autoFocus
                        className="w-full h-10 px-3 rounded-lg border border-border bg-secondary/50 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary tabular-nums"
                    />
                </div>

                {/* Aperçu des couleurs */}
                <div className="space-y-1.5">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Code couleur</p>
                    <div className="grid grid-cols-2 gap-1.5">
                        {[
                            { color: "bg-rose-500",    label: "0–34% — Critique" },
                            { color: "bg-orange-400",  label: "35–69% — En cours" },
                            { color: "bg-yellow-400",  label: "70–99% — Bientôt" },
                            { color: "bg-emerald-500", label: "100% — Atteint !" },
                        ].map(({ color, label }) => (
                            <div key={label} className="flex items-center gap-1.5">
                                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${color}`} />
                                <span className="text-[10px] text-muted-foreground">{label}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex gap-2 pt-1">
                    <button
                        onClick={onClose}
                        className="flex-1 h-9 rounded-lg border border-border text-sm hover:bg-secondary transition-colors"
                    >
                        Annuler
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                        Enregistrer
                    </button>
                </div>
            </div>
        </div>
    );
};
