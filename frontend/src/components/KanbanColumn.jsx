import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { LeadCard } from "./LeadCard";
import {
    Plus,
    MoreHorizontal,
    Trash2,
    GripVertical,
    Palette,
    BellRing,
    Check,
    MessageSquarePlus,
    Eraser,
    Zap,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    X as XIcon,
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuLabel,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
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
import { ColorPickerRow } from "./ColorPickerRow";
import { getColumnColor } from "@/lib/columnColors";
import { useCrm } from "@/context/CrmContext";
import { isContactedColumn } from "@/constants/columnPatterns";

// Wrapper local : accepte un nom de colonne string
const isContactedCol = (name = "") => isContactedColumn(name);

// DropZone between cards — shows an animated insertion line
const InsertionPlaceholder = () => (
    <div
        aria-hidden
        className="kanban-insert-placeholder mx-1 rounded-lg"
        style={{
            height: "4px",
            margin: "2px 4px",
            background: "hsl(var(--primary) / 0.5)",
            borderRadius: "4px",
            animation: "placeholderPulse 900ms ease-in-out infinite",
        }}
    />
);

// Each slot between/around cards is a drop target
const CardDropSlot = ({ index, isActive, onDragOver, onDrop, children }) => {
    const handleDragOver = (e) => {
        if (e.dataTransfer.types.includes("application/x-lead-id")) {
            e.preventDefault();
            onDragOver(index);
        }
    };

    return (
        <div
            className="kanban-drop-slot"
            onDragOver={handleDragOver}
            onDrop={(e) => {
                if (e.dataTransfer.types.includes("application/x-lead-id")) {
                    e.preventDefault();
                    onDrop(index);
                }
            }}
        >
            {isActive && <InsertionPlaceholder />}
            {children}
        </div>
    );
};

export const KanbanColumn = ({
    column,
    leads,
    workspace,
    onOpenLead,
    onAddLead,
    onRename,
    onDelete,
    onSetColor,
    onToggleAutoFollowup,
    onTogglePromptNote,
    onDragStartLead,
    onDragEndLead,
    onDragHover,
    onDropLead,
    onColumnDragStart,
    onColumnDragOver,
    onColumnDrop,
    dragState,
    quickMode,
    quickFocusedLeadId,
    onStartQuickMode,
}) => {
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(column.name);
    const [confirmDel, setConfirmDel] = useState(false);
    const [confirmClear, setConfirmClear] = useState(false);
    const inputRef = useRef(null);
    const contentRef = useRef(null);
    const [bgHeight, setBgHeight] = useState(160);
    const color = getColumnColor(column);
    const { dispatch } = useCrm();

    // ── Tri local — persisté par colonne ──────────────────────────────────────
    const SORT_KEY = `crm_sort_${column.id}`;
    const [sort, setSort] = useState(() => {
        try {
            const s = localStorage.getItem(SORT_KEY);
            // Si déjà sauvegardé (y compris null explicite), respecter le choix
            if (s !== null) return JSON.parse(s);
        } catch {}
        // Tri par défaut : colonnes "contacté" → dernier contact du plus récent au plus ancien
        if (isContactedCol(column.name)) {
            return { key: "lastContact", dir: "desc", label: "Dernier contact" };
        }
        return null;
    }); // null = ordre manuel | { key, dir: "asc"|"desc", label }

    const applySort = (key, label) => {
        setSort((prev) => {
            const next = prev?.key === key
                ? (prev.dir === "asc" ? { key, dir: "desc", label } : null) // 3e clic = reset
                : { key, dir: "asc", label };
            try { localStorage.setItem(SORT_KEY, JSON.stringify(next)); } catch {}
            return next;
        });
    };

    const clearSort = () => {
        setSort(null);
        // Stocker null explicitement pour que le tri par défaut ne se réapplique pas
        try { localStorage.setItem(SORT_KEY, JSON.stringify(null)); } catch {}
    };

    // Champs extra disponibles dans cette colonne
    const extraKeys = useMemo(() => {
        const keys = new Set();
        leads.forEach((l) => Object.keys(l.extra || {}).forEach((k) => keys.add(k)));
        return [...keys].sort();
    }, [leads]);

    // Leads triés
    const sortedLeads = useMemo(() => {
        if (!sort) return leads;
        const { key, dir } = sort;
        const mul = dir === "asc" ? 1 : -1;

        const getValue = (lead) => {
            if (key === "company")     return (lead.company || "").toLowerCase();
            if (key === "createdAt")   return lead.createdAt || "";
            if (key === "lastContact") return lead.lastContact || "";
            if (key === "phone")       return (lead.phone || "").replace(/\D/g, "");
            if (key === "email")       return (lead.email || "").toLowerCase();
            if (key === "dealValue")   return lead.dealValue ?? -Infinity;
            if (key === "contact")     return (lead.contact || "").toLowerCase();
            if (key.startsWith("extra:")) {
                const ek = key.slice(6);
                return (lead.extra?.[ek] || "").toString().toLowerCase();
            }
            return "";
        };

        // Tri appliqué, mais les RDV urgents restent en tête (gérés par KanbanBoard)
        const now = Date.now();
        const hasUrgentRdv = (lead) => {
            if (!lead.nextAction?.label?.startsWith("📅 RDV")) return false;
            const t = new Date(lead.nextAction.dueAt || lead.nextAction.date).getTime();
            return t > now - 60000 && t - now < 24 * 3600 * 1000;
        };

        const urgent = leads.filter(hasUrgentRdv);
        const rest = [...leads.filter((l) => !hasUrgentRdv(l))].sort((a, b) => {
            const va = getValue(a), vb = getValue(b);
            if (va === vb) return 0;
            if (va === "" || va === -Infinity) return 1;
            if (vb === "" || vb === -Infinity) return -1;
            return va < vb ? -mul : mul;
        });

        return [...urgent, ...rest];
    }, [leads, sort]);

    useEffect(() => {
        if (editing) inputRef.current?.select();
    }, [editing]);
    useEffect(() => setName(column.name), [column.name]);

    // Mesure la hauteur réelle du contenu pour animer le fond
    useEffect(() => {
        if (!contentRef.current) return;
        const el = contentRef.current;
        const measure = () => {
            const h = el.scrollHeight;
            setBgHeight(Math.max(120, h));
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, [leads.length]);

    const commit = () => {
        const clean = name.trim();
        setEditing(false);
        if (clean && clean !== column.name) onRename(clean);
        else setName(column.name);
    };

    // Is a lead being dragged into this column?
    const isDragTarget =
        dragState?.leadId != null && dragState?.toColumnId === column.id;

    // Which insertion index is currently hovered?
    const insertIndex = isDragTarget ? dragState.toIndex : null;

    // Handle drag over the column background (empty column or below all cards)
    const handleColumnDragOver = useCallback(
        (e) => {
            if (e.dataTransfer.types.includes("application/x-lead-id")) {
                e.preventDefault();
                e.stopPropagation();
                onDragHover(column.id, leads.length);
            } else if (e.dataTransfer.types.includes("application/x-column-id")) {
                onColumnDragOver(e, column.id);
            }
        },
        [column.id, leads.length, onDragHover, onColumnDragOver],
    );

    const handleColumnDrop = useCallback(
        (e) => {
            if (e.dataTransfer.types.includes("application/x-lead-id")) {
                e.preventDefault();
                onDropLead(column.id, leads.length);
            } else if (e.dataTransfer.types.includes("application/x-column-id")) {
                onColumnDrop(column.id);
            }
        },
        [column.id, leads.length, onDropLead, onColumnDrop],
    );

    return (
        <div
            data-testid={`kanban-column-${column.id}`}
            className={`kanban-col relative shrink-0 flex flex-col max-h-full transition-colors duration-150 ${
                isDragTarget ? "ring-2 ring-primary/30 rounded-xl" : ""
            }`}
            style={{ width: `${workspace.columnWidth ?? 300}px` }}
            onDragOver={handleColumnDragOver}
            onDrop={handleColumnDrop}
            onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) {}
            }}
        >
            {/* Pas de fond coloré — look épuré comme la maquette */}

            {/* Contenu */}
            <div ref={contentRef} className="flex flex-col max-h-full overflow-hidden">

            {/* ── Header ── */}
            <div
                className="px-1 pt-1 pb-2 flex items-center gap-2 group"
                draggable
                onDragStart={(e) => onColumnDragStart(e, column.id)}
            >
                {/* Grip — visible au hover */}
                <button
                    aria-label="Réordonner la colonne"
                    className="cursor-grab active:cursor-grabbing text-foreground/20 hover:text-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    data-testid={`column-grip-${column.id}`}
                >
                    <GripVertical size={12} />
                </button>

                {/* Pill coloré avec le nom */}
                {editing ? (
                    <input
                        ref={inputRef}
                        data-testid={`column-title-input-${column.id}`}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onBlur={commit}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") commit();
                            if (e.key === "Escape") { setName(column.name); setEditing(false); }
                        }}
                        className="flex-1 bg-transparent text-[13px] font-semibold outline-none border-b border-foreground/30 text-foreground"
                    />
                ) : (
                    <button
                        data-testid={`column-title-${column.id}`}
                        onDoubleClick={() => setEditing(true)}
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-white ${color.dot} shrink-0 max-w-[160px] truncate`}
                        title="Double-cliquez pour renommer"
                    >
                        {column.name}
                    </button>
                )}

                {/* Compteur — discret, gris */}
                <span
                    data-testid={`column-count-${column.id}`}
                    className="text-[12.5px] text-muted-foreground/60 tabular-nums shrink-0"
                >
                    {leads.length}
                </span>
                {sort && (
                    <button
                        onClick={clearSort}
                        title={`Trié par ${sort.label} (${sort.dir === "asc" ? "↑" : "↓"}) — cliquer pour réinitialiser`}
                        className="shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium hover:bg-primary/20 transition-colors"
                    >
                        {sort.dir === "asc" ? <ArrowUp size={9} /> : <ArrowDown size={9} />}
                        <span className="max-w-[60px] truncate">{sort.label}</span>
                    </button>
                )}

                {/* Mode rapide actif — badge discret */}
                {quickMode && (
                    <span className="shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold">
                        <Zap size={9} className="fill-primary-foreground" />
                        Actif
                    </span>
                )}

                {/* Auto-followup badge */}
                {column.autoFollowup && (
                    <span title="Rappels automatiques" className="shrink-0 text-foreground/40">
                        <BellRing size={11} data-testid={`column-followup-badge-${column.id}`} />
                    </span>
                )}

                {/* ⋯ Menu — toujours visible, pas seulement au hover */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            data-testid={`column-menu-${column.id}`}
                            aria-label="Options de colonne"
                            className="ml-auto w-7 h-7 rounded-lg flex items-center justify-center text-foreground/40 hover:text-foreground hover:bg-black/10 dark:hover:bg-white/10 transition-all shrink-0"
                        >
                            <MoreHorizontal size={15} />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-60 rounded-xl">
                        <DropdownMenuItem onClick={() => setEditing(true)}>
                            Renommer la colonne
                        </DropdownMenuItem>
                        {/* Mode traitement rapide — déplacé ici depuis le header */}
                        {onStartQuickMode && leads.length > 0 && (
                            <DropdownMenuItem
                                onClick={() => { onStartQuickMode(); }}
                                data-testid={`column-quick-mode-${column.id}`}
                            >
                                <Zap size={14} className={`mr-2 ${quickMode ? "text-primary fill-primary" : ""}`} />
                                Mode traitement rapide
                                {quickMode && <Check size={13} className="ml-auto text-primary" />}
                                {!quickMode && <span className="ml-auto text-[10px] text-muted-foreground">→ / ↑↓</span>}
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                            onClick={() => onToggleAutoFollowup(!column.autoFollowup)}
                            data-testid={`column-toggle-followup-${column.id}`}
                        >
                            <BellRing size={14} className="mr-2" />
                            Rappel auto (+1j / +2j / +3j)
                            {column.autoFollowup && <Check size={13} className="ml-auto text-primary" />}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => onTogglePromptNote(!column.promptNoteOnEnter)}
                            data-testid={`column-toggle-prompt-${column.id}`}
                        >
                            <MessageSquarePlus size={14} className="mr-2" />
                            Note d'appel à l'arrivée
                            {column.promptNoteOnEnter && <Check size={13} className="ml-auto text-primary" />}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />

                        {/* ── Trier par ── */}
                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger className="flex items-center gap-2">
                                <ArrowUpDown size={14} className="text-muted-foreground" />
                                <span>Trier par</span>
                                {sort && (
                                    <span className="ml-auto text-[10px] font-medium text-primary truncate max-w-[80px]">
                                        {sort.label}
                                    </span>
                                )}
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="w-52 rounded-xl">
                                {/* Reset */}
                                {sort && (
                                    <>
                                        <DropdownMenuItem onClick={clearSort} className="text-muted-foreground">
                                            <XIcon size={13} className="mr-2" />
                                            Ordre manuel
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                    </>
                                )}
                                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                                    Champs principaux
                                </DropdownMenuLabel>
                                {[
                                    { key: "company",     label: "Nom entreprise" },
                                    { key: "contact",     label: "Contact" },
                                    { key: "phone",       label: "Téléphone" },
                                    { key: "email",       label: "Email" },
                                    { key: "dealValue",   label: "Valeur deal" },
                                    { key: "createdAt",   label: "Date création" },
                                    { key: "lastContact", label: "Dernier contact" },
                                ].map(({ key, label }) => {
                                    const active = sort?.key === key;
                                    return (
                                        <DropdownMenuItem key={key} onClick={() => applySort(key, label)}>
                                            <span className="flex-1">{label}</span>
                                            {active && (
                                                sort.dir === "asc"
                                                    ? <ArrowUp size={13} className="text-primary" />
                                                    : <ArrowDown size={13} className="text-primary" />
                                            )}
                                        </DropdownMenuItem>
                                    );
                                })}
                                {extraKeys.length > 0 && (
                                    <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                                            Données importées
                                        </DropdownMenuLabel>
                                        {extraKeys.map((k) => {
                                            const key = `extra:${k}`;
                                            const active = sort?.key === key;
                                            return (
                                                <DropdownMenuItem key={key} onClick={() => applySort(key, k)}>
                                                    <span className="flex-1 truncate">{k}</span>
                                                    {active && (
                                                        sort.dir === "asc"
                                                            ? <ArrowUp size={13} className="text-primary" />
                                                            : <ArrowDown size={13} className="text-primary" />
                                                    )}
                                                </DropdownMenuItem>
                                            );
                                        })}
                                    </>
                                )}
                            </DropdownMenuSubContent>
                        </DropdownMenuSub>

                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal flex items-center gap-1.5">
                            <Palette size={12} /> Couleur
                        </DropdownMenuLabel>
                        <ColorPickerRow current={column.color} onPick={onSetColor} />
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setConfirmClear(true)}
                            disabled={leads.length === 0}
                            data-testid={`column-clear-${column.id}`}
                        >
                            <Eraser size={14} className="mr-2" />
                            Vider la colonne
                            {leads.length > 0 && (
                                <span className="ml-auto text-[11px] opacity-60">
                                    {leads.length} lead{leads.length > 1 ? "s" : ""}
                                </span>
                            )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setConfirmDel(true)}
                            data-testid={`column-delete-${column.id}`}
                        >
                            <Trash2 size={14} className="mr-2" />
                            Supprimer la colonne
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Cards list */}
            <div className="kanban-col-scroll overflow-y-auto flex-1 px-0 pb-3">
                {/* Drop slot before first card */}
                <CardDropSlot
                    index={0}
                    isActive={isDragTarget && insertIndex === 0}
                    onDragOver={onDragHover.bind(null, column.id)}
                    onDrop={(idx) => onDropLead(column.id, idx)}
                >
                    <div className="pt-1" />
                </CardDropSlot>

                {sortedLeads.map((lead, i) => (
                    <React.Fragment key={lead.id}>
                        <LeadCard
                            lead={lead}
                            column={column}
                            workspace={workspace}
                            onOpen={onOpenLead}
                            onDragStart={onDragStartLead}
                            onDragEnd={onDragEndLead}
                            dragging={dragState?.leadId === lead.id}
                            quickFocused={quickMode && lead.id === quickFocusedLeadId}
                        />
                        <CardDropSlot
                            index={i + 1}
                            isActive={isDragTarget && insertIndex === i + 1}
                            onDragOver={onDragHover.bind(null, column.id)}
                            onDrop={(idx) => onDropLead(column.id, idx)}
                        >
                            <div className="pt-2" />
                        </CardDropSlot>
                    </React.Fragment>
                ))}

                {/* Empty state */}
                {leads.length === 0 && !isDragTarget && (
                    <div className="pt-1 pb-2 px-1">
                        <button
                            onClick={onAddLead}
                            className="flex items-center justify-center gap-2 w-full py-4 rounded-xl border border-dashed border-foreground/15 hover:border-foreground/30 hover:bg-white/20 dark:hover:bg-white/5 transition-colors text-foreground/40 text-[13px] font-medium"
                        >
                            <Plus size={14} />
                            <span>Nouveau lead</span>
                        </button>
                    </div>
                )}

                {leads.length === 0 && isDragTarget && (
                    <div
                        className="rounded-xl border-2 border-dashed border-foreground/30 bg-white/30 py-8 mx-1 flex items-center justify-center"
                        onDragOver={(e) => {
                            if (e.dataTransfer.types.includes("application/x-lead-id")) {
                                e.preventDefault();
                                onDragHover(column.id, 0);
                            }
                        }}
                        onDrop={(e) => {
                            if (e.dataTransfer.types.includes("application/x-lead-id")) {
                                e.preventDefault();
                                onDropLead(column.id, 0);
                            }
                        }}
                    >
                        <span className="text-xs text-foreground/60 font-medium">Déposer ici</span>
                    </div>
                )}

            <div className="pb-1" />
            </div>

            </div>{/* fin relative */}

            <AlertDialog
                open={confirmClear}
                onOpenChange={(v) => !v && setConfirmClear(false)}
            >
                <AlertDialogContent className="rounded-2xl">
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Vider « {column.name} » ?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {leads.length} lead{leads.length > 1 ? "s" : ""} sera{leads.length > 1 ? "ont" : ""} supprimé{leads.length > 1 ? "s" : ""} définitivement. La colonne restera en place.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                            data-testid={`confirm-column-clear-${column.id}`}
                            onClick={() => {
                                dispatch({
                                    type: "CLEAR_COLUMN",
                                    workspaceId: workspace.id,
                                    columnId: column.id,
                                });
                                setConfirmClear(false);
                            }}
                            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                        >
                            Vider la colonne
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog
                open={confirmDel}
                onOpenChange={(v) => !v && setConfirmDel(false)}
            >
                <AlertDialogContent className="rounded-2xl">
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Supprimer « {column.name} » ?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {leads.length > 0
                                ? `Les ${Object.values(workspace.leads).filter((l) => l.columnId === column.id).length} lead(s) seront déplacés vers la première colonne.`
                                : "Cette colonne est vide et sera supprimée."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                            data-testid={`confirm-column-delete-${column.id}`}
                            onClick={() => {
                                onDelete();
                                setConfirmDel(false);
                            }}
                            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                        >
                            Supprimer la colonne
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};
