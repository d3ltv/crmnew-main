import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useCrm } from "@/context/CrmContext";
import { KanbanColumn } from "./KanbanColumn";
import { CallNoteModal } from "./CallNoteModal";
import { Plus, Zap, X } from "lucide-react";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    isContactedColumn,
    isNouveauColumn,
} from "@/constants/columnPatterns";

// Wrappers acceptant un objet colonne { name } — interface locale du composant
const isContactedCol = (name = "") => isContactedColumn(name);
const isNouveauCol   = (name = "") => isNouveauColumn(name);

export const KanbanBoard = ({
    workspace,
    filter,
    onOpenLead,
    onCloseLead,
    openLeadId,
    onAddLead,
    quickMode: quickModeProp,
    onQuickModeChange,
    onAutoMoved,
}) => {
    const { dispatch } = useCrm();

    const [dragState, setDragState] = useState(null);
    const [draggingColumnId, setDraggingColumnId] = useState(null);
    const [addingColumn, setAddingColumn] = useState(false);
    const [newColName, setNewColName] = useState("");

    // --- Mode traitement rapide — état géré ici, exposé au parent ---
    const [quickMode, setQuickMode] = useState(false);
    const [quickIndex, setQuickIndex] = useState(0);
    const [quickNoteLead, setQuickNoteLead] = useState(null);

    // Sync avec prop parent (stop depuis TopBar)
    useEffect(() => {
        if (quickModeProp === false && quickMode) {
            setQuickMode(false);
            setQuickNoteLead(null);
        }
    }, [quickModeProp]); // eslint-disable-line react-hooks/exhaustive-deps

    // Cleanup : si le composant unmount pendant un drag (navigation rapide),
    // on force la suppression de tous les clones orphelins laissés dans le body.
    useEffect(() => {
        return () => {
            document.querySelectorAll("body > [style*='-9999px']").forEach((node) => {
                if (node._cleanup) node._cleanup();
                else if (node.parentNode) node.parentNode.removeChild(node);
            });
        };
    }, []);

    // --- Filtered leads ---
    const filtered = useMemo(() => {
        const q = (filter || "").toLowerCase().trim();
        const all = Object.values(workspace.leads);
        if (!q) return all;
        return all.filter(
            (l) =>
                (l.company || "").toLowerCase().includes(q) ||
                (l.contact || "").toLowerCase().includes(q) ||
                (l.phone || "").toLowerCase().includes(q) ||
                (l.website || "").toLowerCase().includes(q) ||
                (l.email || "").toLowerCase().includes(q) ||
                (l.tags || []).some((t) => t.toLowerCase().includes(q)) ||
                // Chercher dans les champs extra (CSV)
                Object.entries(l.extra || {}).some(([, v]) =>
                    String(v || "").toLowerCase().includes(q)
                ) ||
                // Chercher dans les champs personnalisés
                (l.customFields || []).some((cf) =>
                    (cf.label || "").toLowerCase().includes(q) ||
                    (cf.value || "").toLowerCase().includes(q)
                ),
        );
    }, [workspace.leads, filter]);

    // --- Leads ordered per column (respects leadOrder if present) ---
    const byColumn = useMemo(() => {
        const now = Date.now();
        const m = {};
        workspace.columnOrder.forEach((cid) => (m[cid] = []));
        // Group filtered leads by column
        const grouped = {};
        workspace.columnOrder.forEach((cid) => (grouped[cid] = []));
        filtered.forEach((l) => {
            if (grouped[l.columnId]) grouped[l.columnId].push(l);
        });

        // Détecte si un lead a un RDV dans moins de 24h (non dépassé)
        const hasUrgentRdv = (lead) => {
            if (!lead.nextAction?.label?.startsWith("📅 RDV")) return false;
            const t = new Date(lead.nextAction.dueAt || lead.nextAction.date).getTime();
            return t > now - 60000 && t - now < 24 * 3600 * 1000;
        };

        // Sort each group by stored leadOrder if present
        workspace.columnOrder.forEach((cid) => {
            const col = workspace.columns[cid];
            const stored = workspace.leadOrder?.[cid];
            if (stored && stored.length > 0) {
                const idToLead = {};
                grouped[cid].forEach((l) => (idToLead[l.id] = l));
                const ordered = [];
                stored.forEach((id) => {
                    if (idToLead[id]) ordered.push(idToLead[id]);
                });
                grouped[cid].forEach((l) => {
                    if (!stored.includes(l.id)) ordered.push(l);
                });
                m[cid] = ordered;
            } else {
                m[cid] = grouped[cid];
            }

            // Leads stales toujours en tête dans les colonnes "contacté"
            if (isContactedCol(col?.name)) {
                m[cid] = [
                    ...m[cid].filter((l) => l.staleInContacted),
                    ...m[cid].filter((l) => !l.staleInContacted),
                ];
            }

            // RDV urgent (< 24h) en tête sur TOUTES les colonnes, peu importe le tri
            // Priorité absolue sur la colonne autoFollowup (colonne rappel auto)
            m[cid] = [
                ...m[cid].filter(hasUrgentRdv),
                ...m[cid].filter((l) => !hasUrgentRdv(l)),
            ];
        });
        return m;
    }, [filtered, workspace.columnOrder, workspace.leadOrder, workspace.columns]);

    // --- Colonnes détectées pour le mode rapide ---
    const nouveauColId = useMemo(() =>
        workspace.columnOrder.find((cid) => isNouveauCol(workspace.columns[cid]?.name))
        || workspace.columnOrder[0],
    [workspace.columnOrder, workspace.columns]);

    const contactedColId = useMemo(() =>
        workspace.columnOrder.find((cid) => isContactedCol(workspace.columns[cid]?.name)),
    [workspace.columnOrder, workspace.columns]);

    // Leads de la colonne "Nouveau" dans l'ordre — on utilise le même ordre que KanbanColumn
    // en tenant compte du tri éventuel (on récupère l'ordre depuis byColumn, le tri est local à KanbanColumn)
    const nouveauLeads = byColumn[nouveauColId] || [];

    // Clamp quickIndex quand la liste change (évite la sélection "aléatoire")
    useEffect(() => {
        if (!quickMode) return;
        setQuickIndex((i) => Math.min(i, Math.max(0, nouveauLeads.length - 1)));
    }, [quickMode, nouveauLeads.length]);

    // Lead actuellement focusé en mode rapide
    const focusedLead = quickMode ? (nouveauLeads[quickIndex] ?? null) : null;

    // Refs pour accéder aux valeurs courantes dans le handler clavier (closure stable)
    const focusedLeadRef = useRef(null);
    const openLeadIdRef = useRef(null);
    useEffect(() => { focusedLeadRef.current = focusedLead; }, [focusedLead]);
    useEffect(() => { openLeadIdRef.current = openLeadId; }, [openLeadId]);

    // Fermer le panel spacebar si le lead focusé change
    useEffect(() => {
        if (quickMode) onCloseLead?.();
    }, [quickIndex]); // eslint-disable-line react-hooks/exhaustive-deps

    // Démarrer le mode rapide
    const startQuickMode = useCallback(() => {
        setQuickIndex(0);
        setQuickMode(true);
        onQuickModeChange?.(true, nouveauLeads.length);
    }, [nouveauLeads.length, onQuickModeChange]);

    const stopQuickMode = useCallback(() => {
        setQuickMode(false);
        setQuickNoteLead(null);
        onCloseLead?.();
        onQuickModeChange?.(false, 0);
    }, [onCloseLead, onQuickModeChange]);

    // Déplacer le lead focusé vers "Contacté" + ouvrir la note
    const processCurrentLead = useCallback(() => {
        const lead = nouveauLeads[quickIndex];
        if (!lead || !contactedColId) return;
        // Signaler à WorkspacePage de ne pas ouvrir un 2e CallNoteModal
        // pour ce lead (le KanbanBoard l'ouvre déjà via setQuickNoteLead)
        onAutoMoved?.(lead.id);
        dispatch({
            type: "MOVE_LEAD_ORDERED",
            workspaceId: workspace.id,
            leadId: lead.id,
            toColumnId: contactedColId,
            toIndex: null,
        });
        setQuickNoteLead(lead);
        // Ne pas avancer l'index ici — la liste se raccourcit automatiquement
        // Le quickIndex reste 0 donc le prochain lead "monte"
    }, [nouveauLeads, quickIndex, contactedColId, dispatch, workspace.id, onAutoMoved]);

    // Clavier global en mode rapide
    useEffect(() => {
        if (!quickMode) return;
        const handler = (e) => {
            // Ignorer si on tape dans un input/textarea
            if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
            if (
                e.key === "ArrowRight" || e.key === "ArrowDown" ||
                e.key === "ArrowUp"    || e.key === "ArrowLeft"
            ) {
                // Capturer en phase capture pour court-circuiter Radix DropdownMenu
                // qui intercepte ArrowDown/ArrowUp pour ouvrir ses menus
                e.preventDefault();
                e.stopPropagation();
                if (e.key === "ArrowRight") {
                    processCurrentLead();
                } else if (e.key === "ArrowDown") {
                    setQuickIndex((i) => Math.min(i + 1, nouveauLeads.length - 1));
                } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
                    setQuickIndex((i) => Math.max(i - 1, 0));
                }
            } else if (e.key === " ") {
                // Spacebar : ouvrir/fermer le panel de détail du lead focusé
                e.preventDefault();
                e.stopPropagation();
                const focused = focusedLeadRef.current;
                const currentOpen = openLeadIdRef.current;
                if (focused && currentOpen === focused.id) {
                    // Déjà ouvert sur ce lead → fermer
                    onCloseLead?.();
                } else if (focused) {
                    // Ouvrir le panel sur le lead focusé
                    onOpenLead?.(focused);
                }
            } else if (e.key === "Escape") {
                // Si le panel est ouvert, fermer d'abord le panel
                if (openLeadIdRef.current !== null) {
                    e.preventDefault();
                    e.stopPropagation();
                    onCloseLead?.();
                } else {
                    stopQuickMode();
                }
            }
        };
        // useCapture: true — intercepte avant Radix UI
        document.addEventListener("keydown", handler, true);
        return () => document.removeEventListener("keydown", handler, true);
    }, [quickMode, processCurrentLead, nouveauLeads.length, stopQuickMode]);

    // Scroll automatique vers la carte focusée
    useEffect(() => {
        if (!quickMode || !focusedLead) return;
        const el = document.querySelector(`[data-testid="lead-card-${focusedLead.id}"]`);
        if (el) {
            el.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
    }, [quickMode, focusedLead?.id]);

    // Quand le modal ferme, passer au lead suivant
    const handleQuickNoteClose = useCallback(() => {
        setQuickNoteLead(null);
        if (nouveauLeads.length <= 1) stopQuickMode();
        else onQuickModeChange?.(true, Math.max(0, nouveauLeads.length - 1));
    }, [nouveauLeads.length, stopQuickMode, onQuickModeChange]);

    // --- Lead drag handlers ---
    const handleLeadDragStart = useCallback((e, lead) => {        e.dataTransfer.setData("application/x-lead-id", lead.id);
        e.dataTransfer.effectAllowed = "move";

        const el = e.currentTarget;
        if (el) {
            const clone = el.cloneNode(true);
            clone.style.cssText = `
                position: fixed; top: -9999px; left: -9999px;
                width: ${el.offsetWidth}px;
                opacity: 0.85;
                transform: rotate(2deg) scale(1.03);
                pointer-events: none;
                border-radius: 12px;
                box-shadow: 0 16px 40px -8px rgba(0,0,0,0.25);
            `;
            document.body.appendChild(clone);
            e.dataTransfer.setDragImage(clone, el.offsetWidth / 2, 24);
            const removeClone = () => {
                if (clone.parentNode) clone.parentNode.removeChild(clone);
            };
            const timer = setTimeout(removeClone, 0);
            clone._cleanup = () => { clearTimeout(timer); removeClone(); };
        }

        setDragState({
            leadId: lead.id,
            fromColumnId: lead.columnId,
            toColumnId: lead.columnId,
            toIndex: null,
        });
    }, []);

    const handleLeadDragEnd = useCallback(() => {
        setDragState(null);
    }, []);

    // Called by KanbanColumn when the drag hovers a column + index
    const handleDragHover = useCallback((columnId, index) => {
        setDragState((prev) =>
            prev ? { ...prev, toColumnId: columnId, toIndex: index } : prev,
        );
    }, []);

    const handleDropLead = useCallback(
        (columnId, index) => {
            if (!dragState?.leadId) return;
            const { leadId, fromColumnId } = dragState;

            if (fromColumnId === columnId) {
                // Same column → reorder
                const leads = byColumn[columnId];
                const fromIndex = leads.findIndex((l) => l.id === leadId);
                if (fromIndex === -1 || fromIndex === index) {
                    setDragState(null);
                    return;
                }
                // Adjust toIndex if moving down (splice removes element first)
                const toIndex = index != null ? index : leads.length - 1;
                dispatch({
                    type: "REORDER_LEADS",
                    workspaceId: workspace.id,
                    columnId,
                    fromIndex,
                    toIndex: fromIndex < toIndex ? toIndex - 1 : toIndex,
                });
            } else {
                // Cross-column move with position
                dispatch({
                    type: "MOVE_LEAD_ORDERED",
                    workspaceId: workspace.id,
                    leadId,
                    toColumnId: columnId,
                    toIndex: index,
                });
            }
            setDragState(null);
        },
        [dragState, byColumn, dispatch, workspace.id],
    );

    // --- Column drag handlers ---
    const handleColumnDragStart = (e, colId) => {
        e.dataTransfer.setData("application/x-column-id", colId);
        e.dataTransfer.effectAllowed = "move";
        setDraggingColumnId(colId);
    };
    const handleColumnDragOver = (e) => {
        e.preventDefault();
    };
    const handleColumnDrop = (targetColId) => {
        if (!draggingColumnId || draggingColumnId === targetColId) {
            setDraggingColumnId(null);
            return;
        }
        const order = [...workspace.columnOrder];
        const from = order.indexOf(draggingColumnId);
        const to = order.indexOf(targetColId);
        if (from === -1 || to === -1) return;
        order.splice(from, 1);
        order.splice(to, 0, draggingColumnId);
        dispatch({
            type: "REORDER_COLUMNS",
            workspaceId: workspace.id,
            newOrder: order,
        });
        setDraggingColumnId(null);
    };

    // --- Add column ---
    const commitNewColumn = () => {
        if (newColName.trim()) {
            dispatch({
                type: "ADD_COLUMN",
                workspaceId: workspace.id,
                name: newColName.trim(),
            });
        }
        setNewColName("");
        setAddingColumn(false);
    };

    return (
        <div className="flex-1 overflow-x-auto overflow-y-hidden kanban-hscroll relative">
            <div
                className="flex gap-4 h-full px-4 sm:px-6 pb-6 pt-3 min-w-min"
                data-testid="kanban-board"
            >
                {workspace.columnOrder.map((cid) => (
                    <KanbanColumn
                        key={cid}
                        column={workspace.columns[cid]}
                        leads={byColumn[cid] || []}
                        workspace={workspace}
                        dragState={dragState}
                        onOpenLead={onOpenLead}
                        onAddLead={() => onAddLead(cid)}
                        quickMode={quickMode && cid === nouveauColId}
                        quickFocusedLeadId={focusedLead?.id}
                        onStartQuickMode={cid === nouveauColId ? startQuickMode : undefined}
                        onRename={(newName) =>
                            dispatch({
                                type: "RENAME_COLUMN",
                                workspaceId: workspace.id,
                                columnId: cid,
                                name: newName,
                            })
                        }
                        onDelete={() =>
                            dispatch({
                                type: "DELETE_COLUMN",
                                workspaceId: workspace.id,
                                columnId: cid,
                            })
                        }
                        onSetColor={(color) =>
                            dispatch({
                                type: "SET_COLUMN_COLOR",
                                workspaceId: workspace.id,
                                columnId: cid,
                                color,
                            })
                        }
                        onToggleAutoFollowup={(enabled) =>
                            dispatch({
                                type: "SET_COLUMN_AUTO_FOLLOWUP",
                                workspaceId: workspace.id,
                                columnId: cid,
                                enabled,
                            })
                        }
                        onTogglePromptNote={(enabled) =>
                            dispatch({
                                type: "SET_COLUMN_PROMPT_NOTE",
                                workspaceId: workspace.id,
                                columnId: cid,
                                enabled,
                            })
                        }
                        onDragStartLead={handleLeadDragStart}
                        onDragEndLead={handleLeadDragEnd}
                        onDragHover={handleDragHover}
                        onDropLead={handleDropLead}
                        onColumnDragStart={handleColumnDragStart}
                        onColumnDragOver={handleColumnDragOver}
                        onColumnDrop={handleColumnDrop}
                    />
                ))}

                {/* Add column */}
                <div className="shrink-0 w-[240px] pt-1 pl-2">
                    {addingColumn ? (
                        <div className="bg-muted/30 rounded-xl p-2.5 border border-border">
                            <input
                                autoFocus
                                data-testid="new-column-input"
                                value={newColName}
                                onChange={(e) => setNewColName(e.target.value)}
                                onBlur={commitNewColumn}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") commitNewColumn();
                                    if (e.key === "Escape") {
                                        setNewColName("");
                                        setAddingColumn(false);
                                    }
                                }}
                                placeholder="Nom de la colonne"
                                className="w-full bg-background border border-border rounded-lg h-9 px-3 text-sm outline-none focus:ring-1 focus:ring-primary"
                            />
                        </div>
                    ) : (
                        <button
                            data-testid="add-column-btn"
                            onClick={() => setAddingColumn(true)}
                            className="flex items-center gap-2 h-9 px-3 text-[13px] text-muted-foreground/60 hover:text-foreground transition-colors rounded-xl hover:bg-muted/50 font-medium"
                        >
                            <Plus size={14} strokeWidth={2} />
                            Ajouter une colonne
                        </button>
                    )}
                </div>
            </div>

            {/* Modal note d'appel rapide */}
            <CallNoteModal
                open={!!quickNoteLead}
                lead={quickNoteLead}
                workspace={workspace}
                onAutoMoved={onAutoMoved}
                onClose={handleQuickNoteClose}
            />
        </div>
    );
};
