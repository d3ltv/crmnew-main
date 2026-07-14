import React, { useMemo, useState } from "react";
import { useCrm } from "@/context/CrmContext";
import { Button } from "@/components/ui/button";
import {
    Plus, LayoutGrid, Trash2, Users, Trophy,
    ChevronRight, Briefcase, Target, Activity,
    Clock3, Zap, Download, Upload,
} from "lucide-react";
import { CreateWorkspaceDialog } from "./CreateWorkspaceDialog";
import { ThemeToggle } from "./ThemeToggle";
import { StatsDashboard } from "./StatsDashboard";
import { StorageErrorBanner } from "./StorageErrorBanner";
import { getColumnColor } from "@/lib/columnColors";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const fmt = (n) =>
    new Intl.NumberFormat("fr-FR", {
        style: "currency", currency: "EUR", maximumFractionDigits: 0,
    }).format(n);

function relDate(iso) {
    if (!iso) return null;
    const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (d === 0) return "aujourd'hui";
    if (d === 1) return "hier";
    if (d < 7) return `il y a ${d} j`;
    if (d < 30) return `il y a ${Math.floor(d / 7)} sem.`;
    return `il y a ${Math.floor(d / 30)} mois`;
}

function wsStats(ws) {
    const leads = Object.values(ws.leads);
    const pipeline = leads.reduce((s, l) => s + (l.dealValue || 0), 0);
    const contacts = leads.filter((l) => l.lastContact).length;
    const overdue = leads.filter((l) => l.autoFollowup?.overdue).length;
    const lastActivityTs = leads.reduce((max, l) => {
        const t = l.lastContact ? new Date(l.lastContact).getTime() : 0;
        return t > max ? t : max;
    }, 0);
    return { total: leads.length, pipeline, contacts, overdue, lastActivity: lastActivityTs || null };
}

// ── Global KPI bar ──────────────────────────────────────────────────────────
const GlobalKPIs = ({ workspaces }) => {
    const stats = useMemo(() => {
        let totalLeads = 0, totalPipeline = 0, totalOverdue = 0;
        workspaces.forEach((ws) => {
            const s = wsStats(ws);
            totalLeads += s.total;
            totalPipeline += s.pipeline;
            totalOverdue += s.overdue;
        });
        return { totalLeads, totalPipeline, totalOverdue, spaces: workspaces.length };
    }, [workspaces]);

    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            {[
                { icon: <LayoutGrid size={16} className="text-primary" />, label: "Espaces", value: stats.spaces, bg: "bg-primary/8" },
                { icon: <Users size={16} className="text-blue-500" />, label: "Leads total", value: stats.totalLeads, bg: "bg-blue-500/8" },
                { icon: <Trophy size={16} className="text-emerald-500" />, label: "Pipeline", value: stats.totalPipeline > 0 ? fmt(stats.totalPipeline) : "—", bg: "bg-emerald-500/8" },
                { icon: <Zap size={16} className="text-rose-500" />, label: "Relances dues", value: stats.totalOverdue || "0", bg: "bg-rose-500/8" },
            ].map((kpi) => (
                <div key={kpi.label} className={`rounded-xl border border-border bg-card p-4 flex items-center gap-3`}>
                    <div className={`w-9 h-9 rounded-xl ${kpi.bg} flex items-center justify-center shrink-0`}>
                        {kpi.icon}
                    </div>
                    <div>
                        <div className="text-[11px] text-muted-foreground font-medium">{kpi.label}</div>
                        <div className="text-[18px] font-bold text-foreground leading-tight">{kpi.value}</div>
                    </div>
                </div>
            ))}
        </div>
    );
};

// ── Workspace card ───────────────────────────────────────────────────────────
const WorkspaceCard = ({ ws, onOpen, onDelete, isRecent }) => {
    const stats = useMemo(() => wsStats(ws), [ws]);
    const isJobs = ws.template === "jobs";

    // Première colonne non-vide pour la couleur dominante
    const firstColId = ws.columnOrder.find((cid) =>
        Object.values(ws.leads).some((l) => l.columnId === cid)
    ) || ws.columnOrder[0];
    const dominantColor = getColumnColor(ws.columns[firstColId]);

    // Répartition des leads par colonne (top 4)
    const colDist = ws.columnOrder.slice(0, 6).map((cid) => {
        const col = ws.columns[cid];
        const count = Object.values(ws.leads).filter((l) => l.columnId === cid).length;
        const color = getColumnColor(col);
        return { name: col.name, count, color };
    });

    return (
        <div
            data-testid={`workspace-card-${ws.id}`}
            onClick={onOpen}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen()}
            className="group relative rounded-2xl border border-border bg-card overflow-hidden cursor-pointer hover:border-border/80 hover:shadow-lg transition-all duration-200"
        >
            {/* Bande colorée top */}
            <div className={`h-1.5 w-full ${dominantColor.dot}`} />

            {/* Badge "Récent" */}
            {isRecent && (
                <div className="absolute top-4 right-4 flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold">
                    <Clock3 size={9} />
                    Récent
                </div>
            )}

            <div className="p-5">
                {/* Header */}
                <div className="flex items-start gap-3 mb-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white text-[18px] font-bold ${dominantColor.dot}`}>
                        {isJobs ? "💼" : (ws.name[0] || "?").toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-[15px] text-foreground truncate">
                            {ws.name}
                        </h3>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {ws.sector && (
                                <span className="text-[11.5px] text-muted-foreground truncate">{ws.sector}</span>
                            )}
                            {isJobs && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-violet-500/10 text-violet-700 dark:text-violet-300">
                                    Offres d'emploi
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Stats inline */}
                <div className="flex items-center gap-3 mb-4 text-[12px]">
                    <div className="flex items-center gap-1 text-muted-foreground">
                        <Users size={12} strokeWidth={1.75} />
                        <span className="font-semibold text-foreground">{stats.total}</span>
                        <span>{stats.total > 1 ? "leads" : "lead"}</span>
                    </div>
                    {stats.pipeline > 0 && (
                        <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                            <Trophy size={12} strokeWidth={1.75} />
                            <span className="font-semibold">{fmt(stats.pipeline)}</span>
                        </div>
                    )}
                    {stats.overdue > 0 && (
                        <div className="flex items-center gap-1 text-rose-500">
                            <Zap size={12} strokeWidth={1.75} />
                            <span className="font-semibold">{stats.overdue}</span>
                            <span>en retard</span>
                        </div>
                    )}
                </div>

                {/* Colonnes avec couleurs réelles */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                    {colDist.filter((c) => c.count > 0 || colDist.every((x) => x.count === 0)).slice(0, 5).map((col) => (
                        <span
                            key={col.name}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium text-white ${col.color.dot}`}
                            style={{ opacity: col.count > 0 ? 1 : 0.5 }}
                        >
                            {col.name}
                            {col.count > 0 && <span className="opacity-80">· {col.count}</span>}
                        </span>
                    ))}
                    {ws.columnOrder.length > 5 && (
                        <span className="text-[10.5px] text-muted-foreground px-1">+{ws.columnOrder.length - 5}</span>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-border/60">
                    <div className="flex items-center gap-1 text-[11.5px] text-muted-foreground">
                        {stats.lastActivity ? (
                            <>
                                <Activity size={11} />
                                <span>Activité {relDate(new Date(stats.lastActivity).toISOString())}</span>
                            </>
                        ) : (
                            <span className="italic">Aucune activité</span>
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            data-testid={`workspace-delete-${ws.id}`}
                            onClick={(e) => { e.stopPropagation(); onDelete(); }}
                            aria-label="Supprimer"
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                        >
                            <Trash2 size={13} />
                        </button>
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground group-hover:text-primary group-hover:bg-primary/10 transition-colors">
                            <ChevronRight size={14} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ── Main page ────────────────────────────────────────────────────────────────
export const WorkspacesPage = () => {
    const { state, dispatch, exportBackup, importBackup } = useCrm();
    const [open, setOpen] = useState(false);
    const [confirmDel, setConfirmDel] = useState(null);

    const workspaces = state.order.map((id) => state.workspaces[id]);
    const isEmpty = workspaces.length === 0;

    // Import depuis fichier
    const handleImportBackup = () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => importBackup(ev.target.result);
            reader.readAsText(file);
        };
        input.click();
    };

    // Dernier espace ouvert
    const recentId = state.lastOpenedId || state.order[state.order.length - 1];

    const sortedWorkspaces = useMemo(() => {
        // Dernier utilisé en premier
        return [...workspaces].sort((a, b) => {
            if (a.id === recentId) return -1;
            if (b.id === recentId) return 1;
            return new Date(b.createdAt) - new Date(a.createdAt);
        });
    }, [workspaces, recentId]);

    if (isEmpty) {
        return (
            <div className="min-h-screen bg-background" data-testid="workspaces-page">
                <nav className="border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-30">
                    <div className="max-w-5xl mx-auto px-4 sm:px-8 h-14 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                                <LayoutGrid size={14} />
                            </div>
                            <span className="font-semibold text-[15px]">Mon CRM</span>
                        </div>
                        <ThemeToggle />
                    </div>
                </nav>
                <OnboardingHero onCreate={() => setOpen(true)} />
                <CreateWorkspaceDialog open={open} onOpenChange={setOpen} />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background" data-testid="workspaces-page">
            {/* Alerte persistante si le quota localStorage est dépassé */}
            <StorageErrorBanner />
            {/* Nav */}
            <nav className="border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-30">
                <div className="max-w-5xl mx-auto px-4 sm:px-8 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                            <LayoutGrid size={14} />
                        </div>
                        <span className="font-semibold text-[15px]">Mon CRM</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <ThemeToggle />
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleImportBackup}
                            className="h-8 rounded-lg px-3 gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
                            title="Restaurer un backup"
                        >
                            <Upload size={13} />
                            <span className="hidden sm:inline">Restaurer</span>
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={exportBackup}
                            className="h-8 rounded-lg px-3 gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
                            title="Exporter un backup JSON"
                        >
                            <Download size={13} />
                            <span className="hidden sm:inline">Backup</span>
                        </Button>
                        <Button
                            data-testid="create-workspace-header-btn"
                            onClick={() => setOpen(true)}
                            className="h-8 rounded-lg px-3 gap-1.5 bg-foreground text-background hover:bg-foreground/85 text-[13px] font-medium"
                        >
                            <Plus size={14} />
                            <span className="hidden sm:inline">Nouvel espace</span>
                        </Button>
                    </div>
                </div>
            </nav>

            <div className="max-w-5xl mx-auto px-4 sm:px-8 py-8">

                {/* Titre + sous-titre */}
                <div className="mb-6">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                        Vos espaces
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {workspaces.length} espace{workspaces.length > 1 ? "s" : ""} · Cliquez pour ouvrir
                    </p>
                </div>

                {/* KPIs globaux */}
                <GlobalKPIs workspaces={workspaces} />

                {/* Grille des espaces */}
                <div
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
                    data-testid="workspaces-grid"
                >
                    {sortedWorkspaces.map((ws) => (
                        <WorkspaceCard
                            key={ws.id}
                            ws={ws}
                            isRecent={ws.id === recentId}
                            onOpen={() => dispatch({ type: "SELECT_WORKSPACE", id: ws.id })}
                            onDelete={() => setConfirmDel(ws)}
                        />
                    ))}

                    {/* Bouton créer un espace */}
                    <button
                        onClick={() => setOpen(true)}
                        className="rounded-2xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-primary/3 transition-colors p-5 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary min-h-[200px]"
                    >
                        <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                            <Plus size={20} />
                        </div>
                        <span className="text-[13px] font-medium">Nouvel espace</span>
                        <span className="text-[11px] text-muted-foreground/60 text-center">Prospects, offres d'emploi…</span>
                    </button>
                </div>

                {/* Stats détaillées */}
                <div className="mt-10 pt-8 border-t border-border/60">
                    <h2 className="text-[15px] font-semibold text-foreground mb-4">Statistiques détaillées</h2>
                    <StatsDashboard />
                </div>
            </div>

            <CreateWorkspaceDialog open={open} onOpenChange={setOpen} />

            <AlertDialog open={!!confirmDel} onOpenChange={(v) => !v && setConfirmDel(null)}>
                <AlertDialogContent data-testid="delete-workspace-dialog" className="rounded-2xl">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Supprimer « {confirmDel?.name} » ?</AlertDialogTitle>
                        <AlertDialogDescription>
                            L'espace, ses colonnes et tous ses leads seront supprimés. Cette action est irréversible.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                            data-testid="confirm-delete-workspace-btn"
                            onClick={() => { dispatch({ type: "DELETE_WORKSPACE", id: confirmDel.id }); setConfirmDel(null); }}
                            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                        >
                            Supprimer définitivement
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

// ── Onboarding ────────────────────────────────────────────────────────────────
const OnboardingHero = ({ onCreate }) => (
    <div className="max-w-2xl mx-auto px-4 py-20 sm:py-32 flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-6">
            <Target size={28} strokeWidth={1.5} />
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
            Bienvenue dans votre CRM
        </h1>
        <p className="text-muted-foreground text-base mb-8 max-w-md">
            Créez votre premier espace pour organiser vos leads ou candidatures sur un tableau Kanban.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <Button
                data-testid="create-first-workspace-btn"
                onClick={onCreate}
                className="h-11 rounded-xl px-6 text-[14px] font-medium bg-foreground text-background hover:bg-foreground/85 gap-2"
            >
                <Plus size={16} />
                Créer un espace
            </Button>
        </div>
        <div className="mt-8 flex items-center gap-6 text-[12px] text-muted-foreground">
            <div className="flex items-center gap-1.5"><Users size={13} /> Suivi prospects</div>
            <div className="flex items-center gap-1.5"><Briefcase size={13} /> Offres d'emploi</div>
            <div className="flex items-center gap-1.5"><Trophy size={13} /> Pipeline deals</div>
        </div>
    </div>
);
