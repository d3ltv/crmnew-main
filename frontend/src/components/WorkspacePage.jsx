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
import { Users, Upload, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

const WON_PATTERNS = ["gagné", "gagne", "won", "signé", "signe", "closed won"];
function isWonColumn(col) {
    if (!col) return false;
    const n = col.name.toLowerCase();
    return WON_PATTERNS.some((p) => n.includes(p));
}

// Colonne de type "Nouveau"
const NOUVEAU_PATTERNS = ["nouveau", "new", "prospect", "entrant"];
function isNouveauColumn(col) {
    if (!col) return false;
    const n = col.name.toLowerCase();
    return NOUVEAU_PATTERNS.some((p) => n.includes(p));
}

// Colonne de type "Contacté"
const CONTACTED_PATTERNS = ["contact", "appel", "relance", "call"];
function isContactedColumn(col) {
    if (!col) return false;
    const n = col.name.toLowerCase();
    return CONTACTED_PATTERNS.some((p) => n.includes(p));
}

// Colonne de type "Rendez-vous"
const MEETING_PATTERNS = ["rendez-vous", "rendez vous", "rdv", "meeting", "appointment"];
function isMeetingColumn(col) {
    if (!col) return false;
    const n = col.name.toLowerCase();
    return MEETING_PATTERNS.some((p) => n.includes(p));
}

export const WorkspacePage = () => {
    const { state, dispatch } = useCrm();
    const workspace = state.workspaces[state.currentId];
    const [filter, setFilter] = useState("");
    const [openLeadId, setOpenLeadId] = useState(null);
    const [importOpen, setImportOpen] = useState(false);
    // Vue active — persistée en localStorage
    const [view, setView] = useState(() => {
        try { return localStorage.getItem("crm_view") || "kanban"; } catch { return "kanban"; }
    });
    const handleViewChange = (v) => {
        setView(v);
        try { localStorage.setItem("crm_view", v); } catch {}
    };
    // Sidebar : pliée par défaut, état persisté en localStorage
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
        try {
            const saved = localStorage.getItem("sidebar_collapsed");
            return saved === null ? true : saved === "true";
        } catch {
            return true;
        }
    });
    const [callNoteLeadId, setCallNoteLeadId] = useState(null);
    const [wonLeadId, setWonLeadId] = useState(null);
    const [meetingLeadId, setMeetingLeadId] = useState(null);
    const [quickMode, setQuickMode] = useState(false);
    const [quickCount, setQuickCount] = useState(0);
    const prevColumnsRef = useRef({});
    const [pendingOpenColumnId, setPendingOpenColumnId] = useState(null);
    const prevLeadIdsRef = useRef(null);
    // Leads déplacés automatiquement depuis CallNoteModal (avec RDV déjà défini)
    // → on supprime l'ouverture de MeetingModal et d'un 2e CallNoteModal pour ces leads
    const suppressModalForLeadRef = useRef(new Set());

    useEffect(() => {
        prevColumnsRef.current = {};
    }, [state.currentId]);

    useEffect(() => {
        if (!workspace) return;
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
                if (isMeetingColumn(targetCol)) {
                    setMeetingLeadId(l.id);
                }
            }
        }
        // Remplacer entièrement la ref — élimine les entrées des leads supprimés
        prevColumnsRef.current = next;
    }, [workspace?.leads, workspace?.columns]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <div className="min-h-screen bg-background flex">
            <Sidebar
                collapsed={sidebarCollapsed}
                onToggleCollapsed={() => {
                        const next = !sidebarCollapsed;
                        setSidebarCollapsed(next);
                        try { localStorage.setItem("sidebar_collapsed", String(next)); } catch {}
                    }}
            />
            <main className="flex-1 flex flex-col min-w-0 h-screen h-[100dvh] overflow-hidden">
                <TopBar
                    workspace={workspace}
                    filter={filter}
                    setFilter={setFilter}
                    onImport={() => setImportOpen(true)}
                    onNewLead={onNewLead}
                    onOpenLead={(l) => setOpenLeadId(l.id)}
                    sidebarCollapsed={sidebarCollapsed}
                    onToggleSidebar={() => {
                        const next = !sidebarCollapsed;
                        setSidebarCollapsed(next);
                        try { localStorage.setItem("sidebar_collapsed", String(next)); } catch {}
                    }}
                    view={view}
                    onViewChange={handleViewChange}
                    quickMode={quickMode}
                    quickCount={quickCount}
                    onStopQuickMode={() => setQuickMode(false)}
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
                        onOpenLead={(l) => setOpenLeadId(l.id)}
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
