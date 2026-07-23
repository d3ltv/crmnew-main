import React, { useEffect, useRef, useState } from "react";
import { useCrm } from "@/context/CrmContext";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { KanbanBoard } from "./KanbanBoard";
import { ListView } from "./ListView";
import { TableView } from "./TableView";
import { PipelineView } from "./PipelineView";
import { LeadDetailPanel } from "./LeadDetailPanel";
import { CsvImportModal } from "./CsvImportModal";
import { CallNoteModal } from "./CallNoteModal";
import { WonDealModal } from "./WonDealModal";
import { MeetingModal } from "./MeetingModal";
import { StorageErrorBanner } from "./StorageErrorBanner";
import { Users, Upload, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    isWonCol as isWonColumn,
    isNouveauCol as isNouveauColumn,
    isContactedCol as isContactedColumn,
    isMeetingCol as isMeetingColumn,
} from "@/constants/columnPatterns";
import { isManualRdv } from "@/lib/nextActionUtils";

export const WorkspacePage = () => {
    const { state, dispatch, restoreEpoch } = useCrm();
    const workspace = state.workspaces[state.currentId];
    const [filter, setFilter] = useState("");
    const [activeFilters, setActiveFilters] = useState([]);
    const [openLeadId, setOpenLeadId] = useState(null);
    const [importOpen, setImportOpen] = useState(false);
    // Vue active — persistée en localStorage
    const [view, setView] = useState(() => {
        try { return localStorage.getItem("crm_view") || "kanban"; } catch { return "kanban"; }
    });
    const handleViewChange = (v) => {
        setView(v);
        try { localStorage.setItem("crm_view", v); } catch {}
        // Mode rapide = Kanban uniquement — éviter un badge fantôme hors vue kanban
        if (v !== "kanban") {
            setQuickMode(false);
            setQuickCount(0);
        }
    };
    // Menu espaces : fermé par défaut (overlay), préférence persistée
    const [sidebarOpen, setSidebarOpen] = useState(() => {
        try {
            const saved = localStorage.getItem("sidebar_open");
            if (saved !== null) return saved === "true";
            // Ancienne clé : collapsed=true → menu fermé
            const legacy = localStorage.getItem("sidebar_collapsed");
            if (legacy !== null) return legacy !== "true";
            return false;
        } catch {
            return false;
        }
    });
    const persistSidebarOpen = (next) => {
        setSidebarOpen(next);
        try {
            localStorage.setItem("sidebar_open", String(next));
            localStorage.setItem("sidebar_collapsed", String(!next));
        } catch { /* ignore */ }
    };
    const toggleSidebar = () => persistSidebarOpen(!sidebarOpen);
    const closeSidebar = () => persistSidebarOpen(false);
    const [callNoteLeadId, setCallNoteLeadId] = useState(null);
    const [wonLeadId, setWonLeadId] = useState(null);
    const [meetingLeadId, setMeetingLeadId] = useState(null);
    const [quickMode, setQuickMode] = useState(false);
    const [quickCount, setQuickCount] = useState(0);
    const prevColumnsRef = useRef({});
    const prevRestoreEpochRef = useRef(restoreEpoch);
    const [pendingOpenColumnId, setPendingOpenColumnId] = useState(null);
    const prevLeadIdsRef = useRef(null);
    // Leads déplacés automatiquement depuis CallNoteModal (avec RDV déjà défini)
    // → on supprime l'ouverture de MeetingModal et d'un 2e CallNoteModal pour ces leads
    const suppressModalForLeadRef = useRef(new Set());

    useEffect(() => {
        prevColumnsRef.current = {};
        // Reset mode rapide au changement d'espace
        setQuickMode(false);
        setQuickCount(0);
    }, [state.currentId]);

    useEffect(() => {
        if (!workspace) return;

        // Undo/redo (ou restore backup) : resynchroniser le suivi des colonnes
        // SANS rouvrir de modal — une note rouverte écraserait des données non pertinentes.
        const isRestore = restoreEpoch !== prevRestoreEpochRef.current;
        prevRestoreEpochRef.current = restoreEpoch;
        if (isRestore) {
            const next = {};
            for (const l of Object.values(workspace.leads)) {
                next[l.id] = l.columnId;
            }
            prevColumnsRef.current = next;
            setCallNoteLeadId(null);
            setWonLeadId(null);
            setMeetingLeadId(null);
            return;
        }

        const prev = prevColumnsRef.current;
        const next = {};
        for (const l of Object.values(workspace.leads)) {
            next[l.id] = l.columnId;
            const wasIn = prev[l.id];
            if (wasIn && wasIn !== l.columnId) {
                const fromCol  = workspace.columns[wasIn];
                const targetCol = workspace.columns[l.columnId];

                // Si ce lead a été déplacé automatiquement par CallNoteModal
                // (RDV déjà enregistré dans la note), on ne rouvre pas de modal pour lui.
                if (suppressModalForLeadRef.current.has(l.id)) {
                    suppressModalForLeadRef.current.delete(l.id);
                    continue;
                }

                // Ouvrir le modal de note d'appel si :
                //   1. La colonne cible a promptNoteOnEnter activé manuellement, OU
                //   2. Le lead vient d'une colonne "Nouveau" et arrive dans une colonne "Contacté"
                const isNouveauToContacted =
                    isNouveauColumn(fromCol) && isContactedColumn(targetCol);

                if (targetCol?.promptNoteOnEnter || isNouveauToContacted) {
                    setCallNoteLeadId(l.id);
                }

                // Prompt deal value on entering "Gagné"
                if (isWonColumn(targetCol)) {
                    setWonLeadId(l.id);
                }
                // Prompt meeting date on entering "Rendez-vous"
                // — sauf si le lead a déjà un RDV enregistré
                const hasExistingRdv = isManualRdv(l.nextAction);
                if (isMeetingColumn(targetCol) && !hasExistingRdv) {
                    setMeetingLeadId(l.id);
                }
            }
        }
        // Remplacer entièrement la ref — élimine les entrées des leads supprimés
        prevColumnsRef.current = next;
    }, [workspace?.leads, workspace?.columns, restoreEpoch]); // eslint-disable-line react-hooks/exhaustive-deps

    // Ouvrir automatiquement le panel sur le lead nouvellement créé
    useEffect(() => {
        if (pendingOpenColumnId === null || !prevLeadIdsRef.current || !workspace) return;
        const newLead = Object.values(workspace.leads).find(
            (l) => !prevLeadIdsRef.current.has(l.id) && l.columnId === pendingOpenColumnId
        );
        if (newLead) {
            setOpenLeadId(newLead.id);
            setPendingOpenColumnId(null);
            prevLeadIdsRef.current = null;
        }
    }, [workspace?.leads, pendingOpenColumnId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Ouvrir un lead depuis le dashboard (alertes stats)
    useEffect(() => {
        if (!workspace) return;
        try {
            const raw = sessionStorage.getItem("crm_pending_lead");
            if (!raw) return;
            const { workspaceId, leadId } = JSON.parse(raw);
            if (workspaceId !== workspace.id) return;
            if (!workspace.leads[leadId]) {
                sessionStorage.removeItem("crm_pending_lead");
                return;
            }
            setOpenLeadId(leadId);
            sessionStorage.removeItem("crm_pending_lead");
        } catch {
            try { sessionStorage.removeItem("crm_pending_lead"); } catch { /* ignore */ }
        }
    }, [workspace?.id, workspace?.leads]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!workspace) return null;

    const openLead =
        state.workspaces[state.currentId]?.leads[openLeadId] || null;
    const callNoteLead =
        state.workspaces[state.currentId]?.leads[callNoteLeadId] || null;
    const wonLead =
        state.workspaces[state.currentId]?.leads[wonLeadId] || null;
    const meetingLead =
        state.workspaces[state.currentId]?.leads[meetingLeadId] || null;

    const onNewLead = (columnId) => {
        const col = columnId || workspace.columnOrder[0];
        prevLeadIdsRef.current = new Set(Object.keys(workspace.leads));
        setPendingOpenColumnId(col);
        dispatch({
            type: "ADD_LEAD",
            workspaceId: workspace.id,
            columnId: col,
            lead: { company: "Nouveau lead" },
        });
    };

    const leadCount = Object.keys(workspace.leads).length;

    return (
        <div className="min-h-screen bg-background">
            <Sidebar
                open={sidebarOpen}
                onClose={closeSidebar}
                onToggle={toggleSidebar}
            />
            <main className="flex flex-col min-w-0 min-h-screen overflow-x-hidden">
                {/* Alerte persistante si le quota localStorage est dépassé */}
                <StorageErrorBanner />
                <TopBar
                    workspace={workspace}
                    filter={filter}
                    setFilter={setFilter}
                    activeFilters={activeFilters}
                    setActiveFilters={setActiveFilters}
                    onImport={() => setImportOpen(true)}
                    onNewLead={onNewLead}
                    onOpenLead={(l) => setOpenLeadId(l.id)}
                    sidebarOpen={sidebarOpen}
                    onToggleSidebar={toggleSidebar}
                    view={view}
                    onViewChange={handleViewChange}
                    quickMode={quickMode}
                    quickCount={quickCount}
                    onStopQuickMode={() => {
                        setQuickMode(false);
                        setQuickCount(0);
                    }}
                />

                {leadCount === 0 && (
                    <div className="px-6 pt-6 pb-2" data-testid="workspace-empty-banner">
                        <div className="rounded-2xl border border-dashed border-border p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
                            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                <Users size={18} strokeWidth={1.75} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h3 className="text-base font-semibold tracking-tight">Votre pipeline est prêt</h3>
                                <p className="text-sm text-muted-foreground">
                                    Importez un CSV existant ou créez votre premier lead pour lancer le suivi.
                                </p>
                            </div>
                            <div className="flex gap-2 w-full sm:w-auto">
                                <Button
                                    onClick={() => setImportOpen(true)}
                                    variant="secondary"
                                    className="flex-1 sm:flex-none h-10 rounded-full px-4"
                                    data-testid="empty-import-btn"
                                >
                                    <Upload size={14} className="mr-1.5" />
                                    Importer un CSV
                                </Button>
                                <Button
                                    onClick={() => onNewLead()}
                                    className="flex-1 sm:flex-none h-10 rounded-full px-4 bg-primary hover:bg-primary/90 text-primary-foreground"
                                    data-testid="empty-new-lead-btn"
                                >
                                    <Plus size={14} className="mr-1.5" />
                                    Créer un lead
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {view === "kanban" && (
                    <KanbanBoard
                        workspace={workspace}
                        filter={filter}
                        activeFilters={activeFilters}
                        onOpenLead={(l) => setOpenLeadId(l.id)}
                        onCloseLead={() => setOpenLeadId(null)}
                        openLeadId={openLeadId}
                        onAddLead={(colId) => onNewLead(colId)}
                        quickMode={quickMode}
                        onQuickModeChange={(active, count) => {
                            setQuickMode(active);
                            setQuickCount(count);
                        }}
                        onAutoMoved={(leadId) => suppressModalForLeadRef.current.add(leadId)}
                    />
                )}
                {view === "list" && (
                    <ListView
                        workspace={workspace}
                        filter={filter}
                        onOpenLead={(l) => setOpenLeadId(l.id)}
                    />
                )}
                {view === "table" && (
                    <TableView
                        workspace={workspace}
                        filter={filter}
                        onOpenLead={(l) => setOpenLeadId(l.id)}
                    />
                )}
                {view === "pipeline" && (
                    <PipelineView
                        workspace={workspace}
                        filter={filter}
                        onOpenLead={(l) => setOpenLeadId(l.id)}
                    />
                )}
            </main>

            <LeadDetailPanel
                open={!!openLead}
                lead={openLead}
                workspace={workspace}
                onClose={() => setOpenLeadId(null)}
            />

            <CsvImportModal
                open={importOpen}
                onOpenChange={setImportOpen}
                workspaceId={workspace.id}
            />

            <CallNoteModal
                open={!!callNoteLead}
                lead={callNoteLead}
                workspace={workspace}
                onAutoMoved={(leadId) => suppressModalForLeadRef.current.add(leadId)}
                onClose={() => setCallNoteLeadId(null)}
            />

            <WonDealModal
                open={!!wonLead}
                lead={wonLead}
                workspace={workspace}
                onClose={() => setWonLeadId(null)}
            />

            <MeetingModal
                open={!!meetingLead}
                lead={meetingLead}
                workspace={workspace}
                onClose={() => setMeetingLeadId(null)}
            />
        </div>
    );
};
