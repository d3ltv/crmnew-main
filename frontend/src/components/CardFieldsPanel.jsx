import React, { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { useCrm } from "@/context/CrmContext";
import { DEFAULT_CARD_FIELDS } from "@/context/CrmContext";
import { GripVertical, Eye, EyeOff, PanelsLeftRight, Trash2, GalleryHorizontal } from "lucide-react";
import { Switch } from "@/components/ui/switch";

const MIN_WIDTH = 260;
const MAX_WIDTH = 520;
const DEFAULT_WIDTH = 340;

const MIN_SCALE = 0.7;
const MAX_SCALE = 1.0;
const DEFAULT_SCALE = 1.0;

const ROW_H = 40; // hauteur estimée d'une ligne en px
const SCROLL_ZONE = 48; // zone en px depuis le bord qui déclenche l'auto-scroll
const SCROLL_SPEED = 8; // px par frame

/**
 * Popover content for configuring card fields visibility/order,
 * column width, and card scale (persisted in workspace).
 */
export const CardFieldsPanel = ({ workspace }) => {
    const { dispatch } = useCrm();
    const listRef = useRef(null);

    // Drag state — pointer-based pour un glisser fluide avec auto-scroll
    const dragState = useRef({
        active: false,
        fromIdx: null,
        toIdx: null,
        ghostY: 0,
        startY: 0,
        itemH: ROW_H,
        rafId: null,
        pointerY: 0,
    });
    const [draggingIdx, setDraggingIdx] = useState(null);
    const [overIdx, setOverIdx] = useState(null);

    const currentWidth = workspace.columnWidth ?? DEFAULT_WIDTH;
    const currentScale = workspace.cardScale ?? DEFAULT_SCALE;

    const extraKeys = useMemo(() => {
        const known = new Set(DEFAULT_CARD_FIELDS.map((f) => f.key));
        const extras = new Set();
        Object.values(workspace.leads).forEach((l) => {
            Object.keys(l.extra || {}).forEach((k) => extras.add(`extra:${k}`));
        });
        return [...extras].filter((k) => !known.has(k));
    }, [workspace.leads]);

    const cfKeys = useMemo(() => {
        const MAIN_BASES = ["téléphone", "telephone", "email", "contact", "contact rh", "site web", "site", "lien offre"];
        const cfSet = new Set();
        Object.values(workspace.leads).forEach((l) => {
            (l.customFields || []).forEach((f) => {
                const label = f.label.toLowerCase().trim();
                const isDupe = MAIN_BASES.some((base) =>
                    new RegExp("^" + base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\d+$").test(label)
                );
                if (isDupe) cfSet.add(f.label);
            });
        });
        return [...cfSet];
    }, [workspace.leads]);

    const fields = useMemo(() => {
        const saved = workspace.cardFields && workspace.cardFields.length > 0
            ? workspace.cardFields : [];
        const savedMap = new Map(saved.map((f) => [f.key, f]));
        const merged = DEFAULT_CARD_FIELDS.map((def) =>
            savedMap.has(def.key) ? savedMap.get(def.key) : def
        );
        saved.forEach((f) => {
            if ((f.key.startsWith("extra:") || f.key.startsWith("cf:")) && !merged.find((m) => m.key === f.key))
                merged.push(f);
        });
        const existingKeys = new Set(merged.map((f) => f.key));
        extraKeys.filter((k) => !existingKeys.has(k)).forEach((k) => {
            merged.push({ key: k, label: k.replace("extra:", ""), visible: false });
        });
        cfKeys.filter((label) => !existingKeys.has("cf:" + label)).forEach((label) => {
            merged.push({ key: "cf:" + label, label, visible: true });
        });
        return merged;
    }, [workspace.cardFields, extraKeys, cfKeys]);

    const toggle = (key) => {
        const updated = fields.map((f) => f.key === key ? { ...f, visible: !f.visible } : f);
        dispatch({ type: "SET_CARD_FIELDS", workspaceId: workspace.id, fields: updated });
    };

    const deleteExtraField = (key) => {
        if (key.startsWith("cf:")) {
            const label = key.slice(3);
            dispatch({ type: "DELETE_CF_FIELD", workspaceId: workspace.id, label });
        } else {
            dispatch({ type: "DELETE_EXTRA_FIELD", workspaceId: workspace.id, fieldKey: key });
        }
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
        dispatch({ type: "SET_COLUMN_WIDTH", workspaceId: workspace.id, width: Number(e.target.value) });
    };

    const handleScaleChange = (e) => {
        dispatch({ type: "SET_CARD_SCALE", workspaceId: workspace.id, scale: Number(e.target.value) });
    };

    // ── Pointer drag handlers ──────────────────────────────────────────────────
    const commitReorder = useCallback((fromIdx, toIdx) => {
        if (fromIdx === null || toIdx === null || fromIdx === toIdx) return;
        const reordered = [...fields];
        const [moved] = reordered.splice(fromIdx, 1);
        reordered.splice(toIdx, 0, moved);
        dispatch({ type: "SET_CARD_FIELDS", workspaceId: workspace.id, fields: reordered });
    }, [fields, dispatch, workspace.id]);

    const getIndexFromY = useCallback((clientY) => {
        const el = listRef.current;
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        const relY = clientY - rect.top + el.scrollTop;
        const idx = Math.floor(relY / dragState.current.itemH);
        return Math.max(0, Math.min(fields.length - 1, idx));
    }, [fields.length]);

    const autoScroll = useCallback(() => {
        const el = listRef.current;
        if (!el || !dragState.current.active) return;
        const rect = el.getBoundingClientRect();
        const y = dragState.current.pointerY;
        const distFromTop = y - rect.top;
        const distFromBottom = rect.bottom - y;
        if (distFromTop < SCROLL_ZONE) {
            el.scrollTop -= SCROLL_SPEED * (1 - distFromTop / SCROLL_ZONE);
        } else if (distFromBottom < SCROLL_ZONE) {
            el.scrollTop += SCROLL_SPEED * (1 - distFromBottom / SCROLL_ZONE);
        }
        const newIdx = getIndexFromY(y);
        if (newIdx !== dragState.current.toIdx) {
            dragState.current.toIdx = newIdx;
            setOverIdx(newIdx);
        }
        dragState.current.rafId = requestAnimationFrame(autoScroll);
    }, [getIndexFromY]);

    const onGripPointerDown = useCallback((e, index) => {
        e.preventDefault();
        e.stopPropagation();
        const el = listRef.current;
        if (!el) return;
        // Mesure la hauteur réelle d'une ligne
        const rows = el.querySelectorAll("[data-field-row]");
        const itemH = rows[0]?.getBoundingClientRect().height || ROW_H;
        dragState.current = {
            active: true,
            fromIdx: index,
            toIdx: index,
            startY: e.clientY,
            itemH,
            rafId: null,
            pointerY: e.clientY,
        };
        setDraggingIdx(index);
        setOverIdx(index);

        const onMove = (ev) => {
            dragState.current.pointerY = ev.clientY;
        };
        const onUp = () => {
            cancelAnimationFrame(dragState.current.rafId);
            const { fromIdx, toIdx } = dragState.current;
            dragState.current.active = false;
            setDraggingIdx(null);
            setOverIdx(null);
            commitReorder(fromIdx, toIdx);
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        dragState.current.rafId = requestAnimationFrame(autoScroll);
    }, [autoScroll, commitReorder]);

    // Cleanup on unmount
    useEffect(() => () => {
        cancelAnimationFrame(dragState.current.rafId);
    }, []);

    return (
        <div className="w-80">
            {/* ── Slider largeur des colonnes ── */}
            <div className="px-4 pt-4 pb-3 border-b border-border/60">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-sm font-semibold">
                        <PanelsLeftRight size={14} className="text-muted-foreground" />
                        Largeur des colonnes
                    </div>
                    <span className="text-xs font-medium text-muted-foreground tabular-nums">{currentWidth}px</span>
                </div>
                <input type="range" min={MIN_WIDTH} max={MAX_WIDTH} step={10} value={currentWidth} onChange={handleWidthChange}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-primary bg-border"
                    aria-label="Largeur des colonnes" data-testid="column-width-slider" />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>Étroit</span><span>Large</span>
                </div>
            </div>

            {/* ── Slider taille des cartes ── */}
            <div className="px-4 pt-3 pb-3 border-b border-border/60">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-sm font-semibold">
                        <GalleryHorizontal size={14} className="text-muted-foreground" />
                        Taille des cartes
                    </div>
                    <span className="text-xs font-medium text-muted-foreground tabular-nums">
                        {currentScale === DEFAULT_SCALE ? "100%" : `${Math.round(currentScale * 100)}%`}
                    </span>
                </div>
                <input type="range" min={MIN_SCALE} max={MAX_SCALE} step={0.05} value={currentScale} onChange={handleScaleChange}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-primary bg-border"
                    aria-label="Taille des cartes" data-testid="card-scale-slider" />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>Compact</span><span>Normal</span>
                </div>
            </div>

            {/* ── Champs visibles ── */}
            <div className="px-4 py-3 border-b border-border/60">
                <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-sm">Champs sur les cartes</div>
                    <button onClick={toggleAll} title={allVisible ? "Tout masquer" : "Tout afficher"}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors border ${
                            allVisible ? "border-border text-muted-foreground hover:bg-secondary"
                            : "border-primary/30 bg-primary/8 text-primary hover:bg-primary/15"
                        }`}>
                        {allVisible ? <><EyeOff size={12} /> Masquer</> : <><Eye size={12} /> Tout afficher</>}
                    </button>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                    {visibleCount}/{fields.length} visible{visibleCount > 1 ? "s" : ""} · glisser la poignée pour réordonner
                </div>
            </div>

            {/* Liste avec scroll et drag fluide */}
            <div ref={listRef} className="max-h-[360px] overflow-y-auto py-1">
                {fields.map((f, index) => (
                    <FieldRow
                        key={f.key}
                        field={f}
                        index={index}
                        isDragging={draggingIdx === index}
                        isOver={overIdx === index && draggingIdx !== null && draggingIdx !== index}
                        onToggle={toggle}
                        onDelete={deleteExtraField}
                        onGripDown={onGripPointerDown}
                    />
                ))}
            </div>

            <div className="px-4 py-2.5 border-t border-border/60 flex items-center justify-between">
                <button
                    onClick={() => {
                        dispatch({ type: "SET_CARD_FIELDS", workspaceId: workspace.id, fields: DEFAULT_CARD_FIELDS });
                        dispatch({ type: "SET_COLUMN_WIDTH", workspaceId: workspace.id, width: DEFAULT_WIDTH });
                        dispatch({ type: "SET_CARD_SCALE", workspaceId: workspace.id, scale: DEFAULT_SCALE });
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                    Réinitialiser par défaut
                </button>
            </div>
        </div>
    );
};

const FieldRow = ({ field, index, isDragging, isOver, onToggle, onDelete, onGripDown }) => {
    const isExtra = field.key.startsWith("extra:");
    const isCf = field.key.startsWith("cf:");
    const isDeletable = isExtra || isCf;
    const [confirmDel, setConfirmDel] = useState(false);

    return (
        <div
            data-field-row
            className={`flex items-center justify-between px-4 py-2 transition-colors select-none ${
                isDragging ? "opacity-30 bg-secondary"
                : isOver ? "bg-primary/10 border-t-2 border-primary"
                : "hover:bg-secondary/60"
            }`}
        >
            {confirmDel ? (
                <div className="flex items-center gap-2 w-full text-[12px]">
                    <span className="text-rose-600 dark:text-rose-400 font-medium flex-1 truncate">
                        Supprimer « {field.label} » ?
                    </span>
                    <button onClick={(e) => { e.stopPropagation(); setConfirmDel(false); }}
                        className="px-2 py-0.5 rounded text-muted-foreground hover:bg-secondary transition-colors shrink-0">
                        Annuler
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onDelete(field.key); setConfirmDel(false); }}
                        className="px-2 py-0.5 rounded bg-rose-500 text-white hover:bg-rose-600 transition-colors shrink-0 font-medium">
                        Supprimer
                    </button>
                </div>
            ) : (
                <>
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {/* Poignée de drag — pointer down pour démarrer */}
                        <div
                            onPointerDown={(e) => onGripDown(e, index)}
                            className="cursor-grab active:cursor-grabbing touch-none shrink-0 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                            title="Glisser pour réordonner"
                        >
                            <GripVertical size={13} />
                        </div>
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
                        {isCf && (
                            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">
                                coordonnée
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                        {isDeletable && (
                            <button
                                onClick={(e) => { e.stopPropagation(); setConfirmDel(true); }}
                                title={isCf ? `Supprimer ${field.label} de tous les leads` : "Supprimer ce champ importé"}
                                className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground/40 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
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
