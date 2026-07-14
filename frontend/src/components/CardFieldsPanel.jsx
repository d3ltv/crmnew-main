import React, { useMemo, useState } from "react";
import { useCrm } from "@/context/CrmContext";
import { DEFAULT_CARD_FIELDS } from "@/context/CrmContext";
import { GripVertical, Eye, EyeOff, PanelsLeftRight, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";

const MIN_WIDTH = 260;
const MAX_WIDTH = 520;
const DEFAULT_WIDTH = 340;

/**
 * Popover content for configuring card fields visibility/order
 * and column width (persisted in workspace.columnWidth).
 */
export const CardFieldsPanel = ({ workspace }) => {
    const { dispatch } = useCrm();
    const [dragIndex, setDragIndex] = useState(null);
    const [hoverIndex, setHoverIndex] = useState(null);

    const currentWidth = workspace.columnWidth ?? DEFAULT_WIDTH;

    const extraKeys = useMemo(() => {
        const known = new Set(DEFAULT_CARD_FIELDS.map((f) => f.key));
        const extras = new Set();
        Object.values(workspace.leads).forEach((l) => {
            Object.keys(l.extra || {}).forEach((k) => extras.add(`extra:${k}`));
        });
        return [...extras].filter((k) => !known.has(k));
    }, [workspace.leads]);

    const fields = useMemo(() => {
        const saved = workspace.cardFields && workspace.cardFields.length > 0
            ? workspace.cardFields : [];
        const savedMap = new Map(saved.map((f) => [f.key, f]));
        const merged = DEFAULT_CARD_FIELDS.map((def) =>
            savedMap.has(def.key) ? savedMap.get(def.key) : def
        );
        saved.forEach((f) => {
            if (f.key.startsWith("extra:") && !merged.find((m) => m.key === f.key))
                merged.push(f);
        });
        const existingKeys = new Set(merged.map((f) => f.key));
        extraKeys.filter((k) => !existingKeys.has(k)).forEach((k) => {
            merged.push({ key: k, label: k.replace("extra:", ""), visible: false });
        });
        return merged;
    }, [workspace.cardFields, extraKeys]);

    const toggle = (key) => {
        const updated = fields.map((f) => f.key === key ? { ...f, visible: !f.visible } : f);
        dispatch({ type: "SET_CARD_FIELDS", workspaceId: workspace.id, fields: updated });
    };

    const deleteExtraField = (key) => {
        dispatch({ type: "DELETE_EXTRA_FIELD", workspaceId: workspace.id, fieldKey: key });
    };

    const visibleCount = fields.filter((f) => f.visible).length;
    const allVisible = visibleCount === fields.length;

    const toggleAll = () => {
        dispatch({
            type: "SET_CARD_FIELDS",
            workspaceId: workspace.id,
            fields: fields.map((f) => ({ ...f, visible: !allVisible })),
        });
    };

    const handleWidthChange = (e) => {
        dispatch({
            type: "SET_COLUMN_WIDTH",
            workspaceId: workspace.id,
            width: Number(e.target.value),
        });
    };

    // Drag reorder
    const handleDragStart = (e, index) => {
        setDragIndex(index);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(index));
    };
    const handleDragOver = (e, index) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setHoverIndex(index);
    };
    const handleDrop = (e, dropIndex) => {
        e.preventDefault();
        if (dragIndex === null || dragIndex === dropIndex) {
            setDragIndex(null); setHoverIndex(null); return;
        }
        const reordered = [...fields];
        const [moved] = reordered.splice(dragIndex, 1);
        reordered.splice(dropIndex, 0, moved);
        dispatch({ type: "SET_CARD_FIELDS", workspaceId: workspace.id, fields: reordered });
        setDragIndex(null); setHoverIndex(null);
    };
    const handleDragEnd = () => { setDragIndex(null); setHoverIndex(null); };

    return (
        <div className="w-80">
            {/* ── Slider largeur des colonnes ── */}
            <div className="px-4 pt-4 pb-3 border-b border-border/60">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-sm font-semibold">
                        <PanelsLeftRight size={14} className="text-muted-foreground" />
                        Largeur des colonnes
                    </div>
                    <span className="text-xs font-medium text-muted-foreground tabular-nums">
                        {currentWidth}px
                    </span>
                </div>
                <input
                    type="range"
                    min={MIN_WIDTH}
                    max={MAX_WIDTH}
                    step={10}
                    value={currentWidth}
                    onChange={handleWidthChange}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-primary bg-border"
                    aria-label="Largeur des colonnes"
                    data-testid="column-width-slider"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>Étroit</span>
                    <span>Large</span>
                </div>
            </div>

            {/* ── Champs visibles ── */}
            <div className="px-4 py-3 border-b border-border/60">
                <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-sm">Champs sur les cartes</div>
                    <button
                        onClick={toggleAll}
                        title={allVisible ? "Tout masquer" : "Tout afficher"}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors border ${
                            allVisible
                                ? "border-border text-muted-foreground hover:bg-secondary"
                                : "border-primary/30 bg-primary/8 text-primary hover:bg-primary/15"
                        }`}
                    >
                        {allVisible ? <><EyeOff size={12} /> Masquer</> : <><Eye size={12} /> Tout afficher</>}
                    </button>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                    {visibleCount}/{fields.length} visible{visibleCount > 1 ? "s" : ""} · glisser pour réordonner
                </div>
            </div>

            <div className="max-h-[360px] overflow-y-auto py-1">
                {fields.map((f, index) => (
                    <FieldRow
                        key={f.key}
                        field={f}
                        index={index}
                        isDragging={dragIndex === index}
                        isOver={hoverIndex === index && dragIndex !== index}
                        onToggle={toggle}
                        onDelete={deleteExtraField}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        onDragEnd={handleDragEnd}
                    />
                ))}
            </div>

            <div className="px-4 py-2.5 border-t border-border/60 flex items-center justify-between">
                <button
                    onClick={() => {
                        dispatch({ type: "SET_CARD_FIELDS", workspaceId: workspace.id, fields: DEFAULT_CARD_FIELDS });
                        dispatch({ type: "SET_COLUMN_WIDTH", workspaceId: workspace.id, width: DEFAULT_WIDTH });
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                    Réinitialiser par défaut
                </button>
            </div>
        </div>
    );
};

const FieldRow = ({ field, index, isDragging, isOver, onToggle, onDelete, onDragStart, onDragOver, onDrop, onDragEnd }) => {
    const isExtra = field.key.startsWith("extra:");
    const [confirmDel, setConfirmDel] = useState(false);

    const handleDeleteClick = (e) => {
        e.stopPropagation();
        setConfirmDel(true);
    };

    const handleConfirmDelete = (e) => {
        e.stopPropagation();
        onDelete(field.key);
        setConfirmDel(false);
    };

    const handleCancelDelete = (e) => {
        e.stopPropagation();
        setConfirmDel(false);
    };

    return (
        <div
            draggable
            onDragStart={(e) => onDragStart(e, index)}
            onDragOver={(e) => onDragOver(e, index)}
            onDrop={(e) => onDrop(e, index)}
            onDragEnd={onDragEnd}
            className={`flex items-center justify-between px-4 py-2 transition-all select-none ${
                isDragging ? "opacity-40 bg-secondary"
                : isOver ? "bg-primary/8 border-t-2 border-primary"
                : "hover:bg-secondary/60"
            }`}
        >
            {confirmDel ? (
                /* Confirmation inline */
                <div className="flex items-center gap-2 w-full text-[12px]">
                    <span className="text-rose-600 dark:text-rose-400 font-medium flex-1 truncate">
                        Supprimer « {field.label} » de tous les leads ?
                    </span>
                    <button
                        onClick={handleCancelDelete}
                        className="px-2 py-0.5 rounded text-muted-foreground hover:bg-secondary transition-colors shrink-0"
                    >
                        Annuler
                    </button>
                    <button
                        onClick={handleConfirmDelete}
                        className="px-2 py-0.5 rounded bg-rose-500 text-white hover:bg-rose-600 transition-colors shrink-0 font-medium"
                    >
                        Supprimer
                    </button>
                </div>
            ) : (
                <>
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <GripVertical size={13} className="text-muted-foreground/60 shrink-0 cursor-grab active:cursor-grabbing" />
                        {field.visible
                            ? <Eye size={13} className="text-primary shrink-0" />
                            : <EyeOff size={13} className="text-muted-foreground/50 shrink-0" />
                        }
                        <span className={`text-sm truncate ${field.visible ? "text-foreground" : "text-muted-foreground"}`}>
                            {field.label}
                        </span>
                        {isExtra && (
                            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground shrink-0">
                                importé
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                        {isExtra && (
                            <button
                                onClick={handleDeleteClick}
                                title="Supprimer ce champ importé de tous les leads"
                                className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground/40 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                                aria-label={`Supprimer le champ ${field.label}`}
                            >
                                <Trash2 size={12} />
                            </button>
                        )}
                        <Switch
                            checked={field.visible}
                            onCheckedChange={() => onToggle(field.key)}
                            aria-label={`Afficher ${field.label}`}
                            className="shrink-0"
                        />
                    </div>
                </>
            )}
        </div>
    );
};
