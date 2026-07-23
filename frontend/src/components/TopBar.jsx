import React, { useMemo, useState } from "react";
import { useCrm } from "@/context/CrmContext";
import {
    Search,
    Upload,
    Download,
    Plus,
    Bell,
    Settings2,
    Trash2,
    PanelLeftOpen,
    Menu,
    X,
    Sun,
    Moon,
    Columns3,
    Undo2,
    Redo2,
    LayoutList,
    Table2,
    TrendingUp,
    Trello,
    Target,
    BellRing,
    Zap,
    PanelRight,
    Monitor,
    Info,
    MoreHorizontal,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { leadsToCsv } from "@/lib/csvUtils";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
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
import {
    Sheet,
    SheetContent,
    SheetTrigger,
} from "@/components/ui/sheet";
import { getColumnColor } from "@/lib/columnColors";
import { formatShortDateTime } from "@/lib/dateUtils";
import { SidebarContent } from "./Sidebar";
import { CardFieldsPanel } from "./CardFieldsPanel";
import { DailyGoalWidget, DailyGoalEditor } from "./DailyGoalWidget";

export const TopBar = ({
    workspace,
    filter,
    setFilter,
    activeFilters,
    setActiveFilters,
    onImport,
    onNewLead,
    onOpenLead,
    onToggleSidebar,
    sidebarCollapsed,
    view,
    onViewChange,
    quickMode,
    quickCount,
    onStopQuickMode,
}) => {
    const { state, dispatch, undo, redo, canUndo, canRedo } = useCrm();
    const isDark = state.theme === "dark";
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [goalEditorOpen, setGoalEditorOpen] = useState(false);
    const [filterInput, setFilterInput] = useState("");

    const VIEWS = [
        { id: "kanban",   icon: <Trello size={15} />,      label: "Kanban" },
        { id: "list",     icon: <LayoutList size={15} />,   label: "Liste" },
        { id: "table",    icon: <Table2 size={15} />,       label: "Table" },
        { id: "pipeline", icon: <TrendingUp size={15} />,   label: "Pipeline" },
    ];

    const followups = useMemo(() => {
        const now = Date.now();
        return Object.values(workspace.leads)
            .filter((l) => l.autoFollowup)
            .map((l) => ({
                lead: l,
                due: new Date(l.autoFollowup.dueAt).getTime(),
                overdue:
                    l.autoFollowup.overdue ||
                    (l.autoFollowup.stage >= 3 &&
                        new Date(l.autoFollowup.dueAt).getTime() <= now),
                today:
                    new Date(l.autoFollowup.dueAt).toDateString() ===
                    new Date().toDateString(),
            }))
            .sort((a, b) => a.due - b.due);
    }, [workspace.leads]);

    const overdueCount = followups.filter((f) => f.overdue).length;
    const todayCount = followups.filter((f) => f.today && !f.overdue).length;
    const totalNotifs = overdueCount + todayCount;

    const exportCsv = () => {
        const leads = Object.values(workspace.leads).map((l) => ({
            ...l,
            _statusName: workspace.columns[l.columnId]?.name || "",
        }));
        const csv = leadsToCsv(leads);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${workspace.name.replace(/\s+/g, "_").toLowerCase()}_leads.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    return (
        <>
        <header className="border-b border-border/60 bg-background/95 backdrop-blur-sm sticky top-0 z-20 safe-top">
            {/* Layout 3 colonnes : gauche / centre / droite */}
            <div className="px-3 sm:px-4 h-14 grid grid-cols-[1fr_auto_1fr] items-center gap-2">

                {/* ── Colonne gauche : sidebar, titre, vues ── */}
                <div className="flex items-center gap-2 min-w-0">
                    {/* Mobile: hamburger opens sidebar sheet */}
                    <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                        <SheetTrigger asChild>
                            <button
                                data-testid="topbar-mobile-nav-btn"
                                aria-label="Ouvrir le menu"
                                className="md:hidden w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary text-muted-foreground shrink-0 touch-target"
                            >
                                <Menu size={17} />
                            </button>
                        </SheetTrigger>
                        <SheetContent
                            side="left"
                            className="w-72 p-0 border-r border-border/60 glass-strong"
                            data-testid="mobile-sidebar-sheet"
                        >
                            <SidebarContent
                                forceExpanded
                                onNavigate={() => setMobileNavOpen(false)}
                            />
                        </SheetContent>
                    </Sheet>

                    {/* Desktop: expand sidebar button when collapsed */}
                    {sidebarCollapsed && (
                        <button
                            data-testid="topbar-expand-sidebar-btn"
                            onClick={onToggleSidebar}
                            aria-label="Développer la barre latérale"
                            className="hidden md:flex w-9 h-9 rounded-full items-center justify-center hover:bg-secondary text-muted-foreground shrink-0"
                        >
                            <PanelLeftOpen size={16} />
                        </button>
                    )}

                    <div className="min-w-0">
                        <h1
                            className="text-sm sm:text-[15px] font-semibold tracking-tight truncate leading-tight"
                            data-testid="workspace-title"
                        >
                            {workspace.name}
                        </h1>
                        {workspace.sector && (
                            <p className="text-[10px] text-muted-foreground truncate hidden sm:block leading-none mt-0.5">
                                {workspace.sector}
                            </p>
                        )}
                    </div>

                    {/* Séparateur + Sélecteur de vue — collé au titre */}
                    <div className="hidden sm:block w-px h-5 bg-border/60 shrink-0 ml-1" />
                    <div className="hidden sm:flex items-center gap-0.5 bg-muted rounded-lg p-0.5 shrink-0">
                        {VIEWS.map((v) => (
                            <button
                                key={v.id}
                                onClick={() => onViewChange(v.id)}
                                title={v.label}
                                className={`w-8 h-8 flex items-center justify-center rounded-md transition-all ${
                                    view === v.id
                                        ? "bg-background text-foreground shadow-sm"
                                        : "text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                {v.icon}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── Colonne centre : mode rapide (si actif) + objectif quotidien ── */}
                <div className="flex items-center justify-center gap-2">
                    {quickMode && (
                        <div className="flex items-center gap-1">
                            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[11px] font-medium">
                                <Zap size={10} className="fill-primary shrink-0" />
                                <span>{quickCount}</span>
                            </div>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <button
                                        aria-label="Aide mode rapide"
                                        className="w-5 h-5 rounded-full bg-primary/10 border border-primary/20 text-primary flex items-center justify-center hover:bg-primary/20 transition-colors"
                                    >
                                        <Info size={10} strokeWidth={2.5} />
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent align="center" sideOffset={6} className="w-52 p-3 rounded-xl text-xs space-y-1.5">
                                    <p className="font-semibold text-sm">Mode traitement rapide</p>
                                    <div className="space-y-1 text-muted-foreground">
                                        <p><kbd className="px-1 py-0.5 rounded bg-muted border border-border font-mono text-[10px]">→</kbd> Contacter</p>
                                        <p><kbd className="px-1 py-0.5 rounded bg-muted border border-border font-mono text-[10px]">↑↓</kbd> Naviguer</p>
                                        <p><kbd className="px-1 py-0.5 rounded bg-muted border border-border font-mono text-[10px]">Esc</kbd> Quitter</p>
                                    </div>
                                </PopoverContent>
                            </Popover>
                            <button
                                onClick={onStopQuickMode}
                                className="w-5 h-5 rounded-full bg-primary/10 border border-primary/20 text-primary flex items-center justify-center hover:bg-rose-500/10 hover:text-rose-500 hover:border-rose-500/20 transition-colors"
                            >
                                <X size={10} />
                            </button>
                        </div>
                    )}
                    <DailyGoalWidget
                        workspace={workspace}
                        onEditGoal={() => setGoalEditorOpen(true)}
                    />
                </div>

                {/* ── Colonne droite : actions essentielles ── */}
                <div className="flex items-center gap-1.5 justify-end min-w-0">
                    {/* Recherche (ouvre une rangée pleine largeur) */}
                    <button
                        data-testid="topbar-search-btn"
                        aria-label="Rechercher"
                        onClick={() => {
                            setSearchOpen((v) => !v);
                            if (searchOpen) {
                                setFilterInput("");
                                setFilter("");
                            }
                        }}
                        className={`relative w-9 h-9 rounded-full flex items-center justify-center transition-colors touch-target ${
                            searchOpen || (activeFilters || []).length > 0
                                ? "bg-primary/10 text-primary"
                                : "hover:bg-secondary text-muted-foreground"
                        }`}
                    >
                        <Search size={16} />
                        {(activeFilters || []).length > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                                {(activeFilters || []).length}
                            </span>
                        )}
                    </button>

                    {/* Notifications */}
                    <Popover>
                        <PopoverTrigger asChild>
                            <button
                                data-testid="topbar-notifications-btn"
                                aria-label="Notifications de rappel"
                                className="relative w-9 h-9 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors touch-target"
                            >
                                <Bell size={16} />
                                {totalNotifs > 0 && (
                                    <span
                                        data-testid="notif-badge"
                                        className={`absolute top-1.5 right-1.5 min-w-[15px] h-3.5 px-1 rounded-full text-[9px] font-semibold flex items-center justify-center text-white ${overdueCount > 0 ? "bg-rose-500 pulse-dot" : "bg-primary"}`}
                                    >
                                        {totalNotifs}
                                    </span>
                                )}
                            </button>
                        </PopoverTrigger>
                        <PopoverContent
                            align="end"
                            className="w-80 p-0 rounded-2xl overflow-hidden shadow-panel glass-strong"
                            data-testid="notif-popover"
                        >
                            <div className="px-4 py-3 border-b border-border/60">
                                <div className="font-semibold tracking-tight text-sm">Rappels</div>
                                <div className="text-xs text-muted-foreground mt-0.5">
                                    {overdueCount > 0
                                        ? `${overdueCount} en retard · ${todayCount} aujourd'hui`
                                        : todayCount > 0
                                          ? `${todayCount} à rappeler aujourd'hui`
                                          : "Aucun rappel actif"}
                                </div>
                            </div>
                            <div className="max-h-80 overflow-y-auto">
                                {followups.length === 0 && (
                                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                                        Rien pour l'instant. Les colonnes avec « rappel auto » activé déclencheront des relances.
                                    </div>
                                )}
                                {followups.map(({ lead, overdue, today }) => {
                                    const col = workspace.columns[lead.columnId];
                                    const cc = getColumnColor(col);
                                    return (
                                        <button
                                            key={lead.id}
                                            data-testid={`notif-item-${lead.id}`}
                                            onClick={() => onOpenLead(lead)}
                                            className="w-full text-left px-4 py-3 border-b border-border/40 last:border-0 hover:bg-secondary/70 transition-colors flex gap-3"
                                        >
                                            <span className={`shrink-0 w-2 h-2 mt-1.5 rounded-full ${overdue ? "bg-rose-500 pulse-dot" : today ? "bg-amber-500" : cc.dot}`} />
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm font-medium truncate">{lead.company}</div>
                                                <div className="text-[11px] text-muted-foreground truncate">
                                                    {col?.name} · relance{" "}
                                                    {overdue ? "en retard" : today ? "aujourd'hui" : formatShortDateTime(lead.autoFollowup.dueAt)}{" "}
                                                    · étape {lead.autoFollowup.stage}/3
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </PopoverContent>
                    </Popover>

                    {/* Overflow : champs cartes, undo/redo, thème */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                data-testid="topbar-more-btn"
                                aria-label="Plus d'actions"
                                className="w-9 h-9 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors touch-target"
                            >
                                <MoreHorizontal size={16} />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52 rounded-xl">
                            <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                                Actions
                            </DropdownMenuLabel>
                            <DropdownMenuItem
                                disabled={!canUndo()}
                                onClick={() => {
                                    const did = undo();
                                    if (did) import("sonner").then(({ toast }) => toast("Action annulée", { duration: 2000 }));
                                }}
                                data-testid="topbar-undo-btn"
                            >
                                <Undo2 size={14} className="mr-2" /> Annuler
                                <span className="ml-auto text-[10px] text-muted-foreground">⌘Z</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                disabled={!canRedo()}
                                onClick={() => {
                                    const did = redo();
                                    if (did) import("sonner").then(({ toast }) => toast("Action rétablie", { duration: 2000 }));
                                }}
                                data-testid="topbar-redo-btn"
                            >
                                <Redo2 size={14} className="mr-2" /> Rétablir
                                <span className="ml-auto text-[10px] text-muted-foreground">⌘⇧Z</span>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                className="hidden sm:flex"
                                onClick={() => dispatch({ type: "SET_THEME", theme: isDark ? "light" : "dark" })}
                            >
                                {isDark ? <Sun size={14} className="mr-2" /> : <Moon size={14} className="mr-2" />}
                                {isDark ? "Mode clair" : "Mode sombre"}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Champs cartes */}
                    <Popover>
                        <PopoverTrigger asChild>
                            <button
                                data-testid="topbar-card-fields-btn"
                                aria-label="Configurer les champs affichés sur les cartes"
                                title="Configurer la vue des cartes"
                                className="w-9 h-9 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors touch-target"
                            >
                                <Columns3 size={16} />
                            </button>
                        </PopoverTrigger>
                        <PopoverContent
                            align="end"
                            className="p-0 rounded-2xl overflow-hidden shadow-panel glass-strong w-auto"
                            data-testid="card-fields-popover"
                        >
                            <CardFieldsPanel workspace={workspace} />
                        </PopoverContent>
                    </Popover>

                    {/* Paramètres */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                data-testid="topbar-settings-btn"
                                aria-label="Paramètres de l'espace"
                                className="w-9 h-9 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors touch-target"
                            >
                                <Settings2 size={16} />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 rounded-xl">
                            <DropdownMenuItem
                                className="sm:hidden"
                                onClick={() => dispatch({ type: "SET_THEME", theme: isDark ? "light" : "dark" })}
                                data-testid="settings-theme-btn"
                            >
                                {isDark ? <Sun size={14} className="mr-2" /> : <Moon size={14} className="mr-2" />}
                                {isDark ? "Mode clair" : "Mode sombre"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="sm:hidden" />
                            <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                                Objectifs
                            </DropdownMenuLabel>                            <DropdownMenuItem
                                onClick={() => setGoalEditorOpen(true)}
                                data-testid="settings-daily-goal-btn"
                            >
                                <Target size={14} className="mr-2" /> Objectif quotidien
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                                Rappels
                            </DropdownMenuLabel>
                            <div className="px-2 py-1.5">
                                <p className="text-[10px] text-muted-foreground mb-1.5 flex items-center gap-1.5">
                                    <BellRing size={10} />
                                    Colonne de rappel auto
                                </p>
                                <div className="relative">
                                    <select
                                        value={workspace.columnOrder.find(
                                            (cid) => workspace.columns[cid]?.autoFollowup
                                        ) || ""}
                                        onChange={(e) => {
                                            workspace.columnOrder.forEach((cid) => {
                                                if (workspace.columns[cid]?.autoFollowup) {
                                                    dispatch({
                                                        type: "SET_COLUMN_AUTO_FOLLOWUP",
                                                        workspaceId: workspace.id,
                                                        columnId: cid,
                                                        enabled: false,
                                                    });
                                                }
                                            });
                                            if (e.target.value) {
                                                dispatch({
                                                    type: "SET_COLUMN_AUTO_FOLLOWUP",
                                                    workspaceId: workspace.id,
                                                    columnId: e.target.value,
                                                    enabled: true,
                                                });
                                            }
                                        }}
                                        className="w-full h-8 pl-2 pr-7 rounded-lg bg-secondary border border-border text-[12px] text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary appearance-none"
                                    >
                                        <option value="">— Aucune —</option>
                                        {workspace.columnOrder.map((cid) => {
                                            const col = workspace.columns[cid];
                                            if (!col) return null;
                                            return (
                                                <option key={cid} value={cid}>
                                                    {col.name}
                                                </option>
                                            );
                                        })}
                                    </select>
                                    <BellRing size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                                </div>
                            </div>
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                                Affichage
                            </DropdownMenuLabel>
                            <div className="px-2 py-1.5">
                                <p className="text-[10px] text-muted-foreground mb-1.5">Fenêtre du lead</p>
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => dispatch({ type: "SET_LEAD_PANEL_MODE", mode: "side" })}
                                        title="Panneau latéral"
                                        className={"flex-1 h-8 rounded-lg flex items-center justify-center gap-1.5 text-xs border transition-colors " + (state.leadPanelMode !== "modal" ? "bg-primary/10 border-primary/30 text-primary" : "border-border text-muted-foreground hover:bg-secondary")}
                                    >
                                        <PanelRight size={13} /> Côté
                                    </button>
                                    <button
                                        onClick={() => dispatch({ type: "SET_LEAD_PANEL_MODE", mode: "modal" })}
                                        title="Modale centrée"
                                        className={"flex-1 h-8 rounded-lg flex items-center justify-center gap-1.5 text-xs border transition-colors " + (state.leadPanelMode === "modal" ? "bg-primary/10 border-primary/30 text-primary" : "border-border text-muted-foreground hover:bg-secondary")}
                                    >
                                        <Monitor size={13} /> Centre
                                    </button>
                                </div>
                            </div>
                            <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                                Données
                            </DropdownMenuLabel>
                            <DropdownMenuItem onClick={onImport} data-testid="settings-import-btn">
                                <Upload size={14} className="mr-2" /> Importer un CSV
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={exportCsv}
                                disabled={Object.keys(workspace.leads).length === 0}
                                data-testid="settings-export-btn"
                            >
                                <Download size={14} className="mr-2" /> Exporter les leads
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                                Espace
                            </DropdownMenuLabel>
                            <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setConfirmDelete(true)}
                                data-testid="settings-delete-workspace-btn"
                            >
                                <Trash2 size={14} className="mr-2" /> Supprimer l'espace
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <Button
                        onClick={() => onNewLead()}
                        data-testid="topbar-new-lead-btn"
                        className="h-8 rounded-lg px-2.5 sm:px-3.5 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 text-[12px] font-medium touch-target"
                    >
                        <Plus size={13} />
                        <span className="hidden sm:inline">Nouveau</span>
                    </Button>
                </div>
            </div>

            {/* Rangée recherche pleine largeur */}
            {searchOpen && (
                <div className="px-3 sm:px-4 pb-3 flex flex-wrap items-center gap-2 border-t border-border/40 pt-2">
                    {(activeFilters || []).length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap">
                            {(activeFilters || []).map((tag) => (
                                <span
                                    key={tag}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/12 border border-primary/25 text-primary text-[11px] font-medium"
                                >
                                    {tag}
                                    <button
                                        onClick={() => setActiveFilters((prev) => prev.filter((t) => t !== tag))}
                                        className="hover:text-rose-500 transition-colors"
                                        aria-label={`Retirer le filtre ${tag}`}
                                    >
                                        <X size={9} strokeWidth={2.5} />
                                    </button>
                                </span>
                            ))}
                            <button
                                onClick={() => setActiveFilters([])}
                                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1"
                                title="Effacer tous les filtres"
                            >
                                Tout effacer
                            </button>
                        </div>
                    )}
                    <div className="relative flex-1 min-w-[180px]">
                        <Search
                            size={14}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                        />
                        <Input
                            data-testid="workspace-search-input"
                            value={filterInput}
                            onChange={(e) => {
                                setFilterInput(e.target.value);
                                setFilter(e.target.value);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && filterInput.trim()) {
                                    const val = filterInput.trim();
                                    if (!(activeFilters || []).includes(val)) {
                                        setActiveFilters((prev) => [...prev, val]);
                                    }
                                    setFilterInput("");
                                    setFilter("");
                                    e.preventDefault();
                                } else if (e.key === "Backspace" && !filterInput && (activeFilters || []).length > 0) {
                                    setActiveFilters((prev) => prev.slice(0, -1));
                                } else if (e.key === "Escape") {
                                    setFilterInput("");
                                    setFilter("");
                                    setSearchOpen(false);
                                }
                            }}
                            placeholder={(activeFilters || []).length > 0 ? "Ajouter un filtre…" : "Rechercher ou filtrer…"}
                            autoFocus
                            className="pl-8 pr-3 h-9 w-full rounded-lg bg-secondary/70 border-transparent focus-visible:bg-background transition-colors text-[13px]"
                        />
                    </div>
                </div>
            )}

            <AlertDialog open={confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(false)}>
                <AlertDialogContent className="rounded-2xl" data-testid="delete-current-ws-dialog">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Supprimer « {workspace.name} » ?</AlertDialogTitle>
                        <AlertDialogDescription>
                            L'espace, ses colonnes et tous ses leads seront supprimés. Cette action est irréversible.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                            data-testid="confirm-delete-current-ws-btn"
                            onClick={() => {
                                dispatch({ type: "DELETE_WORKSPACE", id: workspace.id });
                                setConfirmDelete(false);
                            }}
                            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                        >
                            Supprimer l'espace
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Mobile : sélecteur de vues toujours accessible */}
            <div className="sm:hidden px-3 pb-2">
                <div
                    className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5"
                    role="tablist"
                    aria-label="Vue"
                >
                    {VIEWS.map((v) => (
                        <button
                            key={v.id}
                            role="tab"
                            aria-selected={view === v.id}
                            onClick={() => onViewChange(v.id)}
                            title={v.label}
                            className={`flex-1 h-9 flex items-center justify-center gap-1.5 rounded-md text-[12px] font-medium transition-all touch-target ${
                                view === v.id
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            {v.icon}
                            <span className="hidden xs:inline">{v.label}</span>
                        </button>
                    ))}
                </div>
            </div>
        </header>

        {/* Editor modal en dehors du header pour éviter les problèmes de z-index */}
        <DailyGoalEditor open={goalEditorOpen} onClose={() => setGoalEditorOpen(false)} />
        </>
    );
};
