/**
 * CsvImportModal.jsx — Import CSV avec deux modes : Rapide et Avancé
 *
 * Mode Rapide  : upload → détection auto → récapitulatif → import en 2 clics
 * Mode Avancé : upload → éditeur visuel (tableau éditable, mapping colonnes,
 *               suppression lignes, recherche/filtre) → récapitulatif → import
 */
import React, { useRef, useState, useMemo, useCallback } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    FileUp, Upload, ArrowLeft, CheckCircle2, AlertCircle,
    MinusCircle, Zap, Settings2, Trash2, Search, X,
    AlertTriangle, RotateCcw, GripVertical, Eye, EyeOff,
    ChevronDown, ChevronUp, BookMarked, Sparkles, Star,
} from "lucide-react";
import { parseCsv, autoDetectMapping, rowsToLeads, HEADER_TRANSLATIONS } from "@/lib/csvUtils";
import {
    findBestProfile, applyProfile, saveProfile, touchProfile,
    THRESHOLD_AUTO, THRESHOLD_SUGGEST,
} from "@/lib/importProfiles";
import { ImportProfilesManager } from "./ImportProfilesManager";
import { useCrm } from "@/context/CrmContext";
import { toast } from "sonner";

// ── Constantes ────────────────────────────────────────────────────────────────
const NONE  = "__none__";   // ignorer la colonne
const EXTRA = "__extra__";  // garder comme champ extra

// Champs CRM principaux disponibles comme cibles de mapping
const CRM_FIELDS = [
    { key: "company", label: "Entreprise",  required: true },
    { key: "contact", label: "Contact" },
    { key: "phone",   label: "Téléphone" },
    { key: "email",   label: "Email" },
    { key: "website", label: "Site web" },
];

// Nombre max de colonnes affichées sans scroll horizontal dans l'éditeur
const MAX_VISIBLE_COLS = 8;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Construit le mapping { fieldKey → csvHeader } depuis colMapping { csvHeader → fieldKey } */
function buildLegacyMapping(colMapping) {
    const m = {};
    Object.entries(colMapping).forEach(([header, target]) => {
        if (target && target !== NONE && target !== EXTRA) m[target] = header;
    });
    return m;
}

/** Détecte et construit le colMapping initial depuis les headers ET les données */
function buildInitialMapping(headers, rows = []) {
    const detected = autoDetectMapping(headers, rows);
    const inverted = {};
    Object.entries(detected).forEach(([field, header]) => { inverted[header] = field; });
    const map = {};
    headers.forEach((h) => {
        if (!h) return;
        map[h] = inverted[h] ?? EXTRA;
    });
    return map;
}

/** Calcule le récapitulatif d'un import */
function computeSummary(headers, rows, colMapping, nameHeader = null) {
    const mapped   = headers.filter((h) => h && colMapping[h] !== NONE && colMapping[h] !== EXTRA);
    const extra    = headers.filter((h) => h && colMapping[h] === EXTRA);
    const ignored  = headers.filter((h) => h && colMapping[h] === NONE);
    // Pas de nom si : aucune colonne mappée sur "company" ET pas de nameHeader épinglé
    const noCompany = !nameHeader && !Object.values(colMapping).includes("company");

    // Détection de doublons sur la colonne "company" — retourne les groupes
    const companyHeader = Object.entries(colMapping).find(([, v]) => v === "company")?.[0];
    const companyIdx    = companyHeader ? headers.indexOf(companyHeader) : -1;
    let duplicates = 0;
    // Map : clé normalisée → [{ rowIdx, row }]
    const duplicateGroups = {}; // { normalizedName: [{ rowIdx, row }] }
    if (companyIdx >= 0) {
        const seen = {}; // normalizedName → first rowIdx
        rows.forEach((r, rowIdx) => {
            const v = (r[companyIdx] || "").trim().toLowerCase();
            if (!v) return;
            if (seen[v] !== undefined) {
                // Ajouter au groupe
                if (!duplicateGroups[v]) {
                    duplicateGroups[v] = [{ rowIdx: seen[v], row: rows[seen[v]] }];
                }
                duplicateGroups[v].push({ rowIdx, row: r });
                duplicates++;
            } else {
                seen[v] = rowIdx;
            }
        });
    }

    // Valeurs manquantes dans les colonnes mappées CRM
    let missingValues = 0;
    mapped.forEach((h) => {
        const idx = headers.indexOf(h);
        rows.forEach((r) => { if (!(r[idx] || "").trim()) missingValues++; });
    });

    return { mapped, extra, ignored, noCompany, duplicates, duplicateGroups, missingValues };
}

/**
 * Applique la résolution de doublons sur les lignes.
 * @param {string[][]} rows
 * @param {number[]} headers
 * @param {Object} duplicateGroups  — résultat de computeSummary
 * @param {"keep_first"|"keep_last"|"merge"} strategy
 * @param {string|null} dominantHeader  — colonne dominante pour la fusion (header name)
 * @returns {string[][]} nouvelles lignes après résolution
 */
function applyDuplicateResolution(rows, headers, duplicateGroups, strategy, dominantHeader) {
    if (!Object.keys(duplicateGroups).length) return rows;

    // Indices des lignes à supprimer / fusionner
    const rowsToRemove = new Set();
    const mergedRows   = {}; // rowIdx_du_survivant → row fusionnée

    Object.values(duplicateGroups).forEach((group) => {
        // group = [{ rowIdx, row }, ...]
        if (strategy === "keep_first") {
            // Garder la première, supprimer les autres
            group.slice(1).forEach(({ rowIdx }) => rowsToRemove.add(rowIdx));
        } else if (strategy === "keep_last") {
            // Garder la dernière, supprimer les autres
            group.slice(0, -1).forEach(({ rowIdx }) => rowsToRemove.add(rowIdx));
        } else if (strategy === "merge") {
            // Fusion : on garde la ligne dominante (ou la première si pas de dominant)
            const dominantIdx = dominantHeader ? headers.indexOf(dominantHeader) : -1;

            // Choisir le survivant : la ligne qui a la valeur non-vide dans la colonne dominante
            let survivorEntry = group[0];
            if (dominantIdx >= 0) {
                const withValue = group.filter(({ row }) => (row[dominantIdx] || "").trim() !== "");
                if (withValue.length > 0) survivorEntry = withValue[0];
            }
            const { rowIdx: survivorIdx } = survivorEntry;

            // Fusionner : pour chaque colonne, prendre la première valeur non-vide
            // en priorisant la colonne dominante depuis sa ligne
            const merged = headers.map((h, colIdx) => {
                if (dominantIdx >= 0 && colIdx === dominantIdx) {
                    // Toujours prendre la valeur du survivant pour la colonne dominante
                    return survivorEntry.row[colIdx] || "";
                }
                // Pour les autres colonnes : première valeur non-vide dans le groupe
                for (const { row } of group) {
                    if ((row[colIdx] || "").trim()) return row[colIdx];
                }
                return "";
            });

            mergedRows[survivorIdx] = merged;
            // Supprimer toutes les autres lignes du groupe
            group.forEach(({ rowIdx }) => {
                if (rowIdx !== survivorIdx) rowsToRemove.add(rowIdx);
            });
        }
    });

    return rows
        .map((row, idx) => {
            if (mergedRows[idx]) return mergedRows[idx];
            return row;
        })
        .filter((_, idx) => !rowsToRemove.has(idx));
}

// ── Sous-composant : Résolution de doublons ──────────────────────────────────
/**
 * Panneau affiché dans le récapitulatif quand des doublons sont détectés.
 * Permet de choisir :
 *   - Ignorer (importer quand même)
 *   - Garder le premier / le dernier
 *   - Fusionner (avec choix de la colonne dominante)
 */
const DuplicateResolutionPanel = ({
    duplicates,
    duplicateGroups,
    headers,
    colMapping,
    strategy,
    dominantHeader,
    onStrategyChange,
    onDominantChange,
}) => {
    // Colonnes non-ignorées disponibles comme colonne dominante
    const availableCols = headers.filter((h) => h && colMapping[h] !== NONE);

    // Exemple de groupes pour la prévisualisation (max 2)
    const groupEntries = Object.entries(duplicateGroups).slice(0, 2);

    return (
        <div className="rounded-xl border border-amber-400/40 bg-amber-400/5 p-3.5 space-y-3">
            {/* En-tête */}
            <div className="flex items-center gap-2">
                <AlertTriangle size={15} className="text-amber-500 shrink-0" />
                <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                    {duplicates} doublon{duplicates > 1 ? "s" : ""} détecté{duplicates > 1 ? "s" : ""} — que faire ?
                </span>
            </div>

            {/* Choix stratégie */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                    { value: "ignore",     icon: "⚠️", label: "Importer quand même",  desc: "Tous les doublons sont conservés." },
                    { value: "keep_first", icon: "1️⃣", label: "Garder le premier",    desc: "En cas de doublon, seule la 1ʳᵉ ligne est conservée." },
                    { value: "keep_last",  icon: "🔚", label: "Garder le dernier",    desc: "En cas de doublon, seule la dernière ligne est conservée." },
                    { value: "merge",      icon: "🔀", label: "Fusionner",             desc: "Les champs vides sont complétés par les autres lignes." },
                ].map((opt) => (
                    <button
                        key={opt.value}
                        onClick={() => onStrategyChange(opt.value)}
                        className={`rounded-lg border px-3 py-2.5 text-left text-[12px] transition-colors flex flex-col gap-0.5 ${
                            strategy === opt.value
                                ? "border-amber-500 bg-amber-500/15 text-amber-800 dark:text-amber-300"
                                : "border-border bg-background text-foreground hover:border-amber-400/60 hover:bg-amber-400/5"
                        }`}
                    >
                        <span className="font-semibold">{opt.icon} {opt.label}</span>
                        <span className="text-muted-foreground text-[11px] leading-snug">{opt.desc}</span>
                    </button>
                ))}
            </div>

            {/* Colonne dominante — visible uniquement en mode fusion */}
            {strategy === "merge" && (
                <div className="flex items-center gap-2 pt-1">
                    <span className="text-[12px] text-muted-foreground shrink-0">Colonne dominante :</span>
                    <select
                        value={dominantHeader || ""}
                        onChange={(e) => onDominantChange(e.target.value || null)}
                        className="h-8 px-2 pr-6 rounded-lg border border-border bg-background text-[12px] appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                        <option value="">— Aucune (première valeur non-vide) —</option>
                        {availableCols.map((h) => (
                            <option key={h} value={h}>{h}</option>
                        ))}
                    </select>
                    <span className="text-[11px] text-muted-foreground">
                        Les valeurs de cette colonne seront prioritaires.
                    </span>
                </div>
            )}

            {/* Aperçu des groupes concernés */}
            {groupEntries.length > 0 && strategy !== "ignore" && (
                <div className="space-y-1.5">
                    <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
                        Aperçu des doublons
                    </p>
                    {groupEntries.map(([name, group]) => {
                        const companyHeader = Object.entries(colMapping).find(([, v]) => v === "company")?.[0];
                        const companyIdx    = companyHeader ? headers.indexOf(companyHeader) : 0;
                        return (
                            <div key={name} className="rounded-lg border border-border bg-background px-3 py-2 text-[11.5px]">
                                <span className="font-semibold text-foreground">
                                    « {group[0].row[companyIdx] || name} »
                                </span>
                                <span className="text-muted-foreground ml-1.5">
                                    — {group.length} lignes
                                    {strategy === "keep_first" && " → 1ʳᵉ conservée, autres supprimées"}
                                    {strategy === "keep_last"  && " → dernière conservée, autres supprimées"}
                                    {strategy === "merge"      && " → fusionnées en 1 ligne"}
                                </span>
                            </div>
                        );
                    })}
                    {Object.keys(duplicateGroups).length > 2 && (
                        <p className="text-[11px] text-muted-foreground pl-1">
                            … et {Object.keys(duplicateGroups).length - 2} autre{Object.keys(duplicateGroups).length - 2 > 1 ? "s" : ""} groupe{Object.keys(duplicateGroups).length - 2 > 1 ? "s" : ""}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};

// ── Sous-composant : Zone de dépôt de fichier ─────────────────────────────────
const DropZone = ({ onFile }) => {
    const fileRef  = useRef(null);
    const [drag, setDrag] = useState(false);

    const handle = useCallback((file) => {
        if (!file) return;
        if (!file.name.toLowerCase().endsWith(".csv")) {
            toast.error("Fichier non supporté", { description: "Veuillez fournir un fichier .csv" });
            return;
        }
        onFile(file);
    }, [onFile]);

    return (
        <label
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files?.[0]); }}
            className={`block rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors ${
                drag ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-primary/[0.02]"
            }`}
            data-testid="csv-dropzone"
        >
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
                data-testid="csv-file-input"
                onChange={(e) => handle(e.target.files?.[0])} />
            <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
                <FileUp size={22} />
            </div>
            <p className="text-base font-medium">Glissez votre fichier CSV ici</p>
            <p className="text-sm text-muted-foreground mt-1">ou</p>
            <Button type="button" onClick={(e) => { e.preventDefault(); fileRef.current?.click(); }}
                variant="secondary" className="mt-3 rounded-full h-10"
                data-testid="csv-choose-file-btn">
                <Upload size={15} className="mr-1.5" />Choisir un fichier
            </Button>
        </label>
    );
};

// ── Sous-composant : Récapitulatif ────────────────────────────────────────────
const Summary = ({ fileName, rowCount, summary, headers, colMapping, nameHeader, dupStrategy, dupDominant, onDupStrategyChange, onDupDominantChange, skipExisting, onSkipExistingChange, existingLeadCount }) => {
    const { mapped, extra, ignored, noCompany, duplicates, duplicateGroups } = summary;
    return (
        <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                    <CheckCircle2 size={15} className="text-emerald-500" />
                    Prêt à importer
                </h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-lg bg-muted/40 px-3 py-2">
                        <div className="text-2xl font-bold text-foreground">{rowCount}</div>
                        <div className="text-xs text-muted-foreground">ligne{rowCount > 1 ? "s" : ""}</div>
                    </div>
                    <div className="rounded-lg bg-muted/40 px-3 py-2">
                        <div className="text-2xl font-bold text-foreground">{mapped.length}</div>
                        <div className="text-xs text-muted-foreground">champ{mapped.length > 1 ? "s" : ""} mappé{mapped.length > 1 ? "s" : ""}</div>
                    </div>
                    {extra.length > 0 && (
                        <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2">
                            <div className="text-2xl font-bold text-primary">{extra.length}</div>
                            <div className="text-xs text-muted-foreground">champ{extra.length > 1 ? "s" : ""} extra</div>
                        </div>
                    )}
                    {ignored.length > 0 && (
                        <div className="rounded-lg bg-muted/40 px-3 py-2 opacity-60">
                            <div className="text-2xl font-bold text-foreground">{ignored.length}</div>
                            <div className="text-xs text-muted-foreground">ignoré{ignored.length > 1 ? "s" : ""}</div>
                        </div>
                    )}
                </div>
            </div>

            {/* Ne pas réimporter les leads déjà dans l'espace */}
            {existingLeadCount > 0 && (
                <label className="flex items-start gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 text-sm cursor-pointer hover:bg-muted/30 transition-colors">
                    <input
                        type="checkbox"
                        checked={skipExisting}
                        onChange={(e) => onSkipExistingChange?.(e.target.checked)}
                        className="mt-0.5 rounded border-border"
                    />
                    <span>
                        <span className="font-medium text-foreground">Ignorer les leads déjà présents</span>
                        <span className="block text-xs text-muted-foreground mt-0.5">
                            Même entreprise ou e-mail que les {existingLeadCount} lead{existingLeadCount > 1 ? "s" : ""} de cet espace.
                        </span>
                    </span>
                </label>
            )}

            {/* Colonne nom épinglée */}
            {nameHeader && (
                <div className="flex items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-400/5 px-3 py-2.5 text-sm">
                    <Star size={13} className="text-amber-400 fill-amber-400 shrink-0" />
                    <span className="text-amber-700 dark:text-amber-400">
                        Nom du lead : colonne <strong>« {nameHeader} »</strong>
                    </span>
                </div>
            )}

            {/* Alerte : pas de nom du tout */}
            {noCompany && (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-400/40 bg-amber-400/5 px-3 py-2.5 text-sm">
                    <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
                    <span className="text-amber-700 dark:text-amber-400">
                        Aucun nom défini — épinglez une colonne avec ⭐ ou mappez une colonne sur <strong>Entreprise</strong>.
                    </span>
                </div>
            )}

            {/* Panneau de résolution de doublons */}
            {duplicates > 0 && (
                <DuplicateResolutionPanel
                    duplicates={duplicates}
                    duplicateGroups={duplicateGroups}
                    headers={headers}
                    colMapping={colMapping}
                    strategy={dupStrategy}
                    dominantHeader={dupDominant}
                    onStrategyChange={onDupStrategyChange}
                    onDominantChange={onDupDominantChange}
                />
            )}

            {/* Colonnes conservées */}
            {mapped.length > 0 && (
                <div className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Colonnes mappées : </span>
                    {mapped.join(", ")}
                </div>
            )}
            {extra.length > 0 && (
                <div className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Champs extra : </span>
                    {extra.slice(0, 6).join(", ")}{extra.length > 6 ? ` +${extra.length - 6}…` : ""}
                </div>
            )}
        </div>
    );
};

// ── Sous-composant : Sélecteur de mapping pour une colonne ───────────────────
const MappingSelect = ({ header, value, usedFields, onChange, index }) => {
    const translatedLabel = HEADER_TRANSLATIONS[(header || "").toLowerCase().trim()];
    const isAutoMapped = value !== NONE && value !== EXTRA;
    const isIgnored    = value === NONE;

    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger
                data-testid={`csv-col-map-${index}`}
                className={`h-8 text-[12px] min-w-[150px] ${
                    isAutoMapped ? "border-emerald-500/40 bg-emerald-500/5"
                    : isIgnored  ? "border-border/40 bg-secondary/30 opacity-60"
                    : "border-amber-500/40 bg-amber-500/5"
                }`}
            >
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Champs CRM
                </div>
                {CRM_FIELDS.map((f) => {
                    // On n'affiche jamais "utilisé" en grisé — si on choisit un champ déjà
                    // mappé ailleurs, le swap se fait automatiquement dans onMappingChange
                    const alreadyHere = value === f.key;
                    return (
                        <SelectItem key={f.key} value={f.key}>
                            {f.key === "company" && <Star size={10} className="inline mr-1 text-amber-400 fill-amber-400" />}
                            {f.label}
                            {f.required && !alreadyHere && (
                                <span className="ml-1 text-muted-foreground text-[10px]">
                                    {usedFields.has(f.key) ? "(remplace)" : "*"}
                                </span>
                            )}
                            {alreadyHere && <span className="ml-1 text-[10px] text-emerald-600">✓</span>}
                        </SelectItem>
                    );
                })}
                <div className="h-px bg-border my-1" />
                <SelectItem value={EXTRA}>
                    {translatedLabel ? `Extra « ${translatedLabel} »` : "Garder comme extra"}
                </SelectItem>
                <SelectItem value={NONE}>— Ignorer —</SelectItem>
            </SelectContent>
        </Select>
    );
};

// ── Sous-composant : Éditeur avancé ──────────────────────────────────────────
// Tableau éditable : renommer colonnes, mapping, supprimer lignes, chercher/filtrer
const AdvancedEditor = ({ headers, rows, colMapping, nameHeader, onHeadersChange, onRowsChange, onMappingChange, onNameHeaderChange }) => {
    const [search, setSearch]           = useState("");
    const [searchOpen, setSearchOpen]   = useState(false);
    const [colFilter, setColFilter]     = useState("all");
    const [editingHeader, setEditingHeader] = useState(null); // index de la colonne en édition
    const [headerDraft, setHeaderDraft] = useState("");
    const [showColPanel, setShowColPanel] = useState(true);
    const tableRef = useRef(null);

    // Colonnes visibles selon le filtre
    const visibleColIndices = useMemo(() => {
        return headers.map((h, i) => ({ h, i })).filter(({ h }) => {
            if (!h) return false;
            const target = colMapping[h] ?? EXTRA;
            if (colFilter === "mapped")  return target !== NONE && target !== EXTRA;
            if (colFilter === "extra")   return target === EXTRA;
            if (colFilter === "ignored") return target === NONE;
            return true;
        });
    }, [headers, colMapping, colFilter]);

    // Lignes filtrées par recherche
    const filteredRows = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return rows.map((r, i) => ({ r, origIdx: i }));
        return rows
            .map((r, i) => ({ r, origIdx: i }))
            .filter(({ r }) => r.some((cell) => (cell || "").toLowerCase().includes(q)));
    }, [rows, search]);

    // Champs CRM déjà utilisés
    const usedFields = useMemo(() => {
        const s = new Set();
        Object.values(colMapping).forEach((v) => { if (v !== NONE && v !== EXTRA) s.add(v); });
        return s;
    }, [colMapping]);

    // Swap-aware mapping change : si on assigne un champ CRM déjà pris par une autre
    // colonne, l'ancienne colonne est rétrogradée en EXTRA automatiquement.
    const onMappingChangeWithSwap = useCallback((header, newValue) => {
        const updated = { ...colMapping };
        // Si c'est un champ CRM (pas NONE/EXTRA), retirer l'ancienne affectation
        if (newValue !== NONE && newValue !== EXTRA) {
            Object.keys(updated).forEach((k) => {
                if (k !== header && updated[k] === newValue) {
                    updated[k] = EXTRA;
                }
            });
        }
        updated[header] = newValue;
        onMappingChange(updated);
    }, [colMapping, onMappingChange]);

    const deleteRow = useCallback((origIdx) => {
        onRowsChange(rows.filter((_, i) => i !== origIdx));
    }, [rows, onRowsChange]);

    const editCell = useCallback((origIdx, colIdx, value) => {
        const updated = rows.map((r, i) => {
            if (i !== origIdx) return r;
            const copy = [...r];
            copy[colIdx] = value;
            return copy;
        });
        onRowsChange(updated);
    }, [rows, onRowsChange]);

    const commitHeaderRename = useCallback((colIdx) => {
        const newName = headerDraft.trim();
        if (!newName || newName === headers[colIdx]) { setEditingHeader(null); return; }
        // Mettre à jour les headers
        const newHeaders = headers.map((h, i) => i === colIdx ? newName : h);
        // Transférer le mapping de l'ancien header vers le nouveau
        const oldName = headers[colIdx];
        const newMapping = { ...colMapping };
        if (oldName && newMapping[oldName] !== undefined) {
            newMapping[newName] = newMapping[oldName];
            delete newMapping[oldName];
        }
        onHeadersChange(newHeaders, newMapping);
        setEditingHeader(null);
    }, [headerDraft, headers, colMapping, onHeadersChange]);

    const toggleIgnoreAll = () => {
        const allIgnored = visibleColIndices.every(({ h }) => colMapping[h] === NONE);
        const patch = {};
        visibleColIndices.forEach(({ h }) => { patch[h] = allIgnored ? EXTRA : NONE; });
        onMappingChange({ ...colMapping, ...patch });
    };

    return (
        <div className="flex flex-col gap-3 h-full">

            {/* ── Barre d'outils ── */}
            <div className="flex items-center gap-1.5 shrink-0">

                {/* Loupe — expand on click */}
                {searchOpen ? (
                    <div className="relative">
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        <Input
                            autoFocus
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Escape") { setSearch(""); setSearchOpen(false); } }}
                            placeholder="Rechercher…"
                            className="pl-7 pr-7 h-8 text-[12px] rounded-lg w-48"
                        />
                        <button
                            onClick={() => { setSearch(""); setSearchOpen(false); }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            <X size={12} />
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={() => setSearchOpen(true)}
                        title="Rechercher dans les données"
                        className={`w-8 h-8 rounded-lg flex items-center justify-center border border-border bg-secondary text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ${search ? "text-primary border-primary/40 bg-primary/5" : ""}`}>
                        <Search size={14} />
                    </button>
                )}

                {/* Filtre colonnes */}
                <select value={colFilter} onChange={(e) => setColFilter(e.target.value)}
                    className="h-8 px-2 pr-6 rounded-lg border border-border bg-secondary text-[12px] appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary">
                    <option value="all">Toutes ({headers.filter(Boolean).length})</option>
                    <option value="mapped">Mappées ({headers.filter((h) => h && colMapping[h] !== NONE && colMapping[h] !== EXTRA).length})</option>
                    <option value="extra">Extra ({headers.filter((h) => h && colMapping[h] === EXTRA).length})</option>
                    <option value="ignored">Ignorées ({headers.filter((h) => h && colMapping[h] === NONE).length})</option>
                </select>

                {/* Toggle panneau mapping */}
                <button onClick={() => setShowColPanel((v) => !v)}
                    title={showColPanel ? "Masquer le panneau de mapping" : "Afficher le panneau de mapping"}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center border border-border transition-colors ${showColPanel ? "bg-primary/10 border-primary/30 text-primary" : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
                    {showColPanel ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>

                {/* Compteur en temps réel */}
                <span className="ml-auto text-[11px] text-muted-foreground shrink-0">
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        {headers.filter((h) => h && colMapping[h] !== NONE).length} col.
                    </span>
                    {headers.filter((h) => h && colMapping[h] === NONE).length > 0 && (
                        <span className="text-muted-foreground/50">
                            {" / "}{headers.filter((h) => h && colMapping[h] === NONE).length} ignorée{headers.filter((h) => h && colMapping[h] === NONE).length > 1 ? "s" : ""}
                        </span>
                    )}
                    <span className="mx-1.5 opacity-30">·</span>
                    {filteredRows.length} ligne{filteredRows.length !== 1 ? "s" : ""}
                    {search && <span className="text-muted-foreground/50"> / {rows.length}</span>}
                </span>
            </div>

            {/* ── Panneau mapping colonnes (repliable) ── */}
            {showColPanel && (
                <div className="shrink-0 rounded-xl border border-border bg-muted/30 overflow-hidden">
                    <div className="px-3 py-2 border-b border-border/60 flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
                            Association des colonnes
                        </span>
                        <div className="flex items-center gap-2 ml-auto">
                            {/* Légende compacte */}
                            <span className="text-[10px] text-muted-foreground hidden sm:flex items-center gap-2">
                                <span className="flex items-center gap-1"><Star size={10} className="text-amber-400 fill-amber-400" />Nom du lead</span>
                                <span className="flex items-center gap-1"><CheckCircle2 size={10} className="text-emerald-500" />Mappé</span>
                                <span className="flex items-center gap-1"><AlertCircle size={10} className="text-amber-500" />Extra</span>
                                <span className="flex items-center gap-1"><MinusCircle size={10} className="text-muted-foreground/40" />Ignoré</span>
                            </span>
                            {/* Tout cocher / tout décocher */}
                            <button onClick={toggleIgnoreAll}
                                className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-0.5 rounded border border-border bg-background transition-colors shrink-0">
                                {visibleColIndices.every(({ h }) => colMapping[h] === NONE)
                                    ? "Tout activer" : "Tout ignorer"}
                            </button>
                        </div>
                    </div>

                    {/* Cartes colonnes — scroll horizontal */}
                    <div className="overflow-x-auto">
                        <div className="flex gap-2 p-2.5 min-w-min">
                            {visibleColIndices.map(({ h, i }) => {
                                const target    = colMapping[h] ?? EXTRA;
                                const isIgnored = target === NONE;
                                const isName    = h === nameHeader;
                                return (
                                    <div key={i}
                                        className={`shrink-0 rounded-lg border bg-card p-2 space-y-1.5 transition-all ${
                                            isIgnored ? "opacity-40" : ""
                                        } ${isName ? "border-amber-400/60 bg-amber-400/5 ring-1 ring-amber-400/30" : ""}`}
                                        style={{ minWidth: "160px", maxWidth: "210px" }}>

                                        {/* Ligne : checkbox + nom renommable + étoile */}
                                        <div className="flex items-center gap-1.5">
                                            <input
                                                type="checkbox"
                                                checked={!isIgnored}
                                                onChange={(e) => onMappingChange({
                                                    ...colMapping,
                                                    [h]: e.target.checked ? EXTRA : NONE,
                                                })}
                                                title={isIgnored ? "Inclure" : "Exclure"}
                                                className="w-3.5 h-3.5 rounded accent-primary shrink-0 cursor-pointer"
                                            />
                                            {editingHeader === i ? (
                                                <input
                                                    autoFocus
                                                    value={headerDraft}
                                                    onChange={(e) => setHeaderDraft(e.target.value)}
                                                    onBlur={() => commitHeaderRename(i)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter")  commitHeaderRename(i);
                                                        if (e.key === "Escape") setEditingHeader(null);
                                                    }}
                                                    className="flex-1 min-w-0 h-6 px-1.5 text-[11px] font-semibold bg-background border border-primary rounded outline-none"
                                                />
                                            ) : (
                                                <button
                                                    onClick={() => { setEditingHeader(i); setHeaderDraft(h); }}
                                                    title="Cliquer pour renommer"
                                                    className="flex-1 min-w-0 text-left text-[11px] font-semibold text-foreground truncate hover:text-primary transition-colors group/pnl flex items-center gap-1">
                                                    <span className="truncate">{h}</span>
                                                    <span className="opacity-0 group-hover/pnl:opacity-50 shrink-0 text-[9px]">✎</span>
                                                </button>
                                            )}
                                            {/* Bouton étoile — définir comme nom du lead, indépendant du mapping CRM */}
                                            <button
                                                onClick={() => onNameHeaderChange(isName ? null : h)}
                                                title={isName ? "Retirer comme nom du lead" : "Épingler comme nom du lead ⭐"}
                                                className={`shrink-0 w-5 h-5 rounded flex items-center justify-center transition-all ${
                                                    isName
                                                        ? "text-amber-400 hover:text-amber-300"
                                                        : "text-muted-foreground/30 hover:text-amber-400 hover:scale-110"
                                                }`}
                                            >
                                                <Star size={11} className={isName ? "fill-amber-400" : ""} />
                                            </button>
                                        </div>

                                        {/* Select mapping — totalement indépendant de l'étoile */}
                                        <MappingSelect
                                            header={h} value={target} usedFields={usedFields} index={i}
                                            onChange={(v) => onMappingChangeWithSwap(h, v)}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Tableau de données ── */}
            <div ref={tableRef} className="flex-1 overflow-auto rounded-xl border border-border min-h-0">
                {filteredRows.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                        {search ? "Aucun résultat pour cette recherche." : "Aucune donnée."}
                    </div>
                ) : (
                    <table className="w-full text-[12px] border-collapse min-w-max">
                        <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                            <tr>
                                {/* Numéro de ligne */}
                                <th className="w-8 px-2 py-2.5 text-center text-muted-foreground/50 font-normal border-b border-border/60 text-[10px]">
                                    #
                                </th>
                                {visibleColIndices.map(({ h, i }) => {
                                    const target    = colMapping[h] ?? EXTRA;
                                    const isIgnored = target === NONE;
                                    const isMapped  = target !== NONE && target !== EXTRA;
                                    const crmLabel  = CRM_FIELDS.find((f) => f.key === target)?.label;

                                    return (
                                        <th key={i}
                                            className={`px-2 py-1.5 text-left border-b border-border/60 font-normal align-top transition-opacity ${isIgnored ? "opacity-40" : ""}`}
                                            style={{ minWidth: "140px", maxWidth: "240px" }}>

                                            <div className="flex flex-col gap-1">

                                                {/* Ligne 1 : checkbox + renommage inline */}
                                                <div className="flex items-center gap-1.5">
                                                    {/* Checkbox inclure/exclure */}
                                                    <input
                                                        type="checkbox"
                                                        checked={!isIgnored}
                                                        onChange={(e) => onMappingChange({
                                                            ...colMapping,
                                                            [h]: e.target.checked ? EXTRA : NONE,
                                                        })}
                                                        title={isIgnored ? "Inclure cette colonne" : "Exclure cette colonne"}
                                                        className="w-3.5 h-3.5 rounded accent-primary shrink-0 cursor-pointer"
                                                    />

                                                    {/* Renommage inline — double-clic ou clic sur l'icône */}
                                                    {editingHeader === i ? (
                                                        <input
                                                            autoFocus
                                                            value={headerDraft}
                                                            onChange={(e) => setHeaderDraft(e.target.value)}
                                                            onBlur={() => commitHeaderRename(i)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === "Enter")  commitHeaderRename(i);
                                                                if (e.key === "Escape") setEditingHeader(null);
                                                            }}
                                                            className="flex-1 min-w-0 h-6 px-1.5 text-[11px] font-semibold bg-background border border-primary rounded outline-none"
                                                        />
                                                    ) : (
                                                        <span
                                                            onDoubleClick={() => { setEditingHeader(i); setHeaderDraft(h); }}
                                                            title={`${h}  ·  Double-cliquer pour renommer`}
                                                            className="flex-1 min-w-0 text-[11.5px] font-semibold text-foreground truncate cursor-text group/hdr flex items-center gap-1 select-none">
                                                            <span className="truncate">{h}</span>
                                                            <span
                                                                onClick={(e) => { e.stopPropagation(); setEditingHeader(i); setHeaderDraft(h); }}
                                                                className="shrink-0 opacity-0 group-hover/hdr:opacity-40 hover:!opacity-100 text-[10px] cursor-pointer transition-opacity"
                                                                title="Renommer">
                                                                ✎
                                                            </span>
                                                        </span>
                                                    )}

                                                    {/* Étoile — définir comme nom du lead, indépendant du mapping CRM */}
                                                    <button
                                                        onClick={() => onNameHeaderChange(h === nameHeader ? null : h)}
                                                        title={h === nameHeader ? "Retirer comme nom du lead" : "Épingler comme nom du lead ⭐"}
                                                        className={`shrink-0 w-4 h-4 rounded flex items-center justify-center transition-all ${
                                                            h === nameHeader
                                                                ? "text-amber-400 hover:text-amber-300"
                                                                : "text-muted-foreground/20 hover:text-amber-400 hover:scale-110"
                                                        }`}
                                                    >
                                                        <Star size={10} className={h === nameHeader ? "fill-amber-400" : ""} />
                                                    </button>
                                                </div>

                                                {/* Ligne 2 : badge de statut du mapping */}
                                                {h === nameHeader ? (
                                                    <span className="text-[10px] text-amber-500 font-medium pl-5 flex items-center gap-0.5">
                                                        <Star size={8} className="fill-amber-400 text-amber-400" /> Nom du lead
                                                    </span>
                                                ) : isMapped ? (
                                                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium pl-5">
                                                        → {crmLabel}
                                                    </span>
                                                ) : isIgnored ? (
                                                    <span className="text-[10px] text-muted-foreground/40 pl-5">Ignoré</span>
                                                ) : (
                                                    <span className="text-[10px] text-amber-500 pl-5">Extra</span>
                                                )}
                                            </div>
                                        </th>
                                    );
                                })}
                                {/* Colonne suppression */}
                                <th className="w-8 px-1 py-2 border-b border-border/60" />
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRows.map(({ r, origIdx }, rowI) => (
                                <tr key={origIdx}
                                    className={`group border-t border-border/40 hover:bg-muted/30 transition-colors ${rowI % 2 === 0 ? "" : "bg-muted/10"}`}>
                                    {/* Numéro */}
                                    <td className="px-2 py-1.5 text-center text-muted-foreground/40 text-[10px] tabular-nums select-none">
                                        {origIdx + 1}
                                    </td>
                                    {visibleColIndices.map(({ h, i }) => {
                                        const isIgnored = colMapping[h] === NONE;
                                        return (
                                            <td key={i}
                                                className={`px-1 py-1 ${isIgnored ? "opacity-30" : ""}`}
                                                style={{ maxWidth: "220px" }}>
                                                <input
                                                    value={r[i] ?? ""}
                                                    onChange={(e) => editCell(origIdx, i, e.target.value)}
                                                    className="w-full h-7 px-2 bg-transparent rounded hover:bg-background focus:bg-background border border-transparent hover:border-border focus:border-primary text-foreground outline-none transition-colors text-[12px] truncate"
                                                    title={r[i] || ""}
                                                />
                                            </td>
                                        );
                                    })}
                                    {/* Supprimer la ligne */}
                                    <td className="px-1 py-1 text-center">
                                        <button onClick={() => deleteRow(origIdx)}
                                            title="Supprimer cette ligne"
                                            className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100">
                                            <Trash2 size={11} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

// ── Bouton inline de sauvegarde de profil ─────────────────────────────────────
const SaveProfileButton = ({ onSave }) => {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const commit = () => {
        if (!name.trim()) return;
        onSave(name.trim());
        setOpen(false);
        setName("");
    };
    if (open) {
        return (
            <div className="flex items-center gap-1.5">
                <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setOpen(false); setName(""); } }}
                    placeholder="Nom du profil…"
                    className="h-9 px-2.5 w-36 text-[12px] bg-background border border-border rounded-lg outline-none focus:border-primary" />
                <button onClick={commit}
                    className="h-9 px-2.5 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium hover:bg-primary/90 transition-colors flex items-center gap-1">
                    <BookMarked size={12} />Sauvegarder
                </button>
                <button onClick={() => { setOpen(false); setName(""); }}
                    className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                    <X size={13} />
                </button>
            </div>
        );
    }
    return (
        <Button variant="outline" onClick={() => setOpen(true)}
            className="h-9 rounded-lg text-[12px] gap-1.5 border-border">
            <BookMarked size={13} />
            Sauvegarder comme profil
        </Button>
    );
};

// ── Composant principal ───────────────────────────────────────────────────────
export const CsvImportModal = ({ open, onOpenChange, workspaceId }) => {
    const { state, dispatch, batchDispatch } = useCrm();
    const workspace = state.workspaces[workspaceId];

    // step: "upload" | "quick-summary" | "advanced-edit" | "advanced-summary"
    const [step, setStep]           = useState("upload");
    const [fileName, setFileName]   = useState("");
    const [headers, setHeaders]     = useState([]);
    const [rows, setRows]           = useState([]);
    const [colMapping, setColMapping] = useState({});

    // ── Profils d'import ──────────────────────────────────────────────────────
    // matchedProfile : { profile, score, isAuto, isSuggested, newHeaders } | null
    const [matchedProfile,    setMatchedProfile]    = useState(null);
    // appliedProfileId : id du profil appliqué (pour le touch en fin d'import)
    const [appliedProfileId,  setAppliedProfileId]  = useState(null);
    // showProfiles : afficher le panneau de gestion des profils
    const [showProfiles,      setShowProfiles]      = useState(false);

    // ── Résolution de doublons ────────────────────────────────────────────────
    // "ignore" | "keep_first" | "keep_last" | "merge"
    // Défaut keep_first : évite de polluer le pipeline avec des lignes CSV en double
    const [dupStrategy,   setDupStrategy]   = useState("keep_first");
    // colonne dominante pour la fusion (header name ou null)
    const [dupDominant,   setDupDominant]   = useState(null);
    // Ignorer les leads déjà présents dans le workspace (company / email)
    const [skipExisting,  setSkipExisting]  = useState(true);

    // ── Colonne "nom du lead" épinglée via l'étoile ───────────────────────────
    // Indépendante du colMapping — n'importe quelle colonne peut être le nom,
    // même une colonne Extra. null = utiliser la colonne mappée sur "company".
    const [nameHeader, setNameHeader] = useState(null);

    const reset = () => {
        setStep("upload"); setFileName(""); setHeaders([]); setRows([]); setColMapping({});
        setMatchedProfile(null); setAppliedProfileId(null); setShowProfiles(false);
        setDupStrategy("keep_first"); setDupDominant(null);
        setSkipExisting(true);
        setNameHeader(null);
    };

    const handleClose = (v) => {
        onOpenChange(v);
        if (!v) setTimeout(reset, 250);
    };

    // Lecture du fichier — commun aux deux modes
    const handleFile = useCallback(async (file) => {
        try {
            const text = await file.text();
            const { headers: h, rows: r } = parseCsv(text);
            if (!h.length || !r.length) { toast.error("CSV vide ou illisible"); return; }

            // ── Détection de profil ──────────────────────────────────────────
            const match = findBestProfile(h);
            setMatchedProfile(match);

            let initMapping;
            if (match) {
                // Profil trouvé (auto ou suggéré) → appliquer les colonnes connues
                initMapping = applyProfile(h, match.profile);
                setAppliedProfileId(match.profile.id);
            } else {
                // Aucun profil → détection automatique par nom/données
                initMapping = buildInitialMapping(h, r);
                setAppliedProfileId(null);
            }

            setFileName(file.name);
            setHeaders(h);
            setRows(r);
            setColMapping(initMapping);
            // Rester sur upload — l'utilisateur choisit le mode
        } catch (err) {
            toast.error("Erreur de lecture", { description: String(err) });
        }
    }, []);

    // Lance l'import effectif (commun aux deux modes)
    const doImport = useCallback((finalHeaders, finalRows, finalColMapping) => {
        // Appliquer la résolution de doublons si nécessaire
        const currentSummary = computeSummary(finalHeaders, finalRows, finalColMapping, nameHeader);
        let resolvedRows = finalRows;
        if (dupStrategy !== "ignore" && Object.keys(currentSummary.duplicateGroups).length > 0) {
            resolvedRows = applyDuplicateResolution(
                finalRows, finalHeaders, currentSummary.duplicateGroups, dupStrategy, dupDominant
            );
        }

        const legacyMapping = buildLegacyMapping(finalColMapping);
        const leads = rowsToLeads(finalHeaders, resolvedRows, legacyMapping, finalColMapping, nameHeader);
        const incomplete = leads.filter((l) => l._incomplete).length;
        let cleanLeads = leads.map(({ _incomplete: _i, ...rest }) => rest);

        // Filtrer les leads déjà présents dans le workspace (company / email)
        let skippedExisting = 0;
        if (skipExisting && workspace?.leads) {
            const companies = new Set();
            const emails = new Set();
            Object.values(workspace.leads).forEach((l) => {
                const c = (l.company || "").trim().toLowerCase();
                const e = (l.email || "").trim().toLowerCase();
                if (c) companies.add(c);
                if (e) emails.add(e);
            });
            const kept = [];
            for (const lead of cleanLeads) {
                const c = (lead.company || "").trim().toLowerCase();
                const e = (lead.email || "").trim().toLowerCase();
                if ((c && companies.has(c)) || (e && emails.has(e))) {
                    skippedExisting++;
                    continue;
                }
                if (c) companies.add(c);
                if (e) emails.add(e);
                kept.push(lead);
            }
            cleanLeads = kept;
        }

        const removedCount = finalRows.length - resolvedRows.length;

        // Grouper tous les leads en chunks puis les envoyer comme UNE SEULE action undo
        // via batchDispatch — un import = une seule entrée dans le undo stack.
        const CHUNK = 100;
        const actions = [];
        for (let i = 0; i < cleanLeads.length; i += CHUNK) {
            actions.push({ type: "BULK_ADD_LEADS", workspaceId, leads: cleanLeads.slice(i, i + CHUNK) });
        }
        if (actions.length > 0) {
            batchDispatch(actions);
        }

        // Marquer le profil comme utilisé
        if (appliedProfileId) touchProfile(appliedProfileId);

        const importedCount = cleanLeads.length;
        toast.success(
            importedCount === 0
                ? "Aucun nouveau lead à importer"
                : `${importedCount} lead${importedCount > 1 ? "s" : ""} importé${importedCount > 1 ? "s" : ""}`,
            {
                description: [
                    incomplete > 0 ? `${incomplete} sans nom d'entreprise.` : null,
                    removedCount > 0 ? `${removedCount} doublon${removedCount > 1 ? "s" : ""} ${dupStrategy === "merge" ? "fusionné" : "supprimé"}${removedCount > 1 ? "s" : ""} dans le fichier.` : null,
                    skippedExisting > 0 ? `${skippedExisting} déjà présent${skippedExisting > 1 ? "s" : ""} dans l'espace (ignoré${skippedExisting > 1 ? "s" : ""}).` : null,
                ].filter(Boolean).join(" ") || undefined,
            }
        );
        handleClose(false);
    }, [dispatch, batchDispatch, workspaceId, workspace, appliedProfileId, dupStrategy, dupDominant, nameHeader, skipExisting]); // eslint-disable-line react-hooks/exhaustive-deps

    // Récapitulatif courant (recalculé à chaque changement)
    const summary = useMemo(
        () => (headers.length ? computeSummary(headers, rows, colMapping, nameHeader) : null),
        [headers, rows, colMapping, nameHeader]
    );

    const fileLoaded = headers.length > 0;

    // Titre et description selon l'étape
    const stepMeta = {
        "upload":           { title: "Importer un CSV", desc: fileLoaded ? `${fileName} — ${rows.length} lignes détectées` : "Déposez un fichier ou choisissez-en un." },
        "quick-summary":    { title: "Confirmer l'import rapide", desc: `${fileName} — ${rows.length} lignes` },
        "advanced-edit":    { title: "Éditeur de données", desc: `${fileName} — ${rows.length} lignes · Modifiez, corrigez, puis passez au récapitulatif.` },
        "advanced-summary": { title: "Récapitulatif final", desc: `${fileName} — ${rows.length} lignes` },
    };
    const { title, desc } = stepMeta[step] ?? stepMeta["upload"];

    // Largeur de la dialog selon l'étape
    const isEditor = step === "advanced-edit";

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent
                data-testid="csv-import-modal"
                className={`rounded-2xl shadow-panel flex flex-col transition-all duration-200 ${
                    isEditor
                        ? "sm:max-w-[95vw] max-h-[92vh] h-[92vh]"
                        : "sm:max-w-[660px] max-h-[90vh]"
                }`}
                style={isEditor ? { width: "95vw" } : undefined}
            >
                <DialogHeader className="shrink-0">
                    <DialogTitle className="text-xl tracking-tight">{title}</DialogTitle>
                    <DialogDescription>{desc}</DialogDescription>
                </DialogHeader>

                {/* ════════════════════════════════════════
                    ÉTAPE : UPLOAD
                ════════════════════════════════════════ */}
                {step === "upload" && (
                    <div className="flex-1 overflow-y-auto py-2 space-y-4">
                        <DropZone onFile={handleFile} />

                        {/* ── Bandeau profil reconnu ── */}
                        {fileLoaded && matchedProfile && (
                            <div className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${
                                matchedProfile.isAuto
                                    ? "border-emerald-500/40 bg-emerald-500/5"
                                    : "border-amber-400/40 bg-amber-400/5"
                            }`}>
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                    matchedProfile.isAuto ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                    : "bg-amber-400/15 text-amber-600 dark:text-amber-400"
                                }`}>
                                    {matchedProfile.isAuto ? <Sparkles size={15} /> : <BookMarked size={15} />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className={`text-sm font-semibold ${
                                        matchedProfile.isAuto
                                            ? "text-emerald-700 dark:text-emerald-400"
                                            : "text-amber-700 dark:text-amber-400"
                                    }`}>
                                        {matchedProfile.isAuto
                                            ? `Profil « ${matchedProfile.profile.name} » appliqué automatiquement`
                                            : `Profil « ${matchedProfile.profile.name} » suggéré (${Math.round(matchedProfile.score * 100)}% de correspondance)`}
                                    </p>
                                    <p className="text-[11.5px] text-muted-foreground mt-0.5">
                                        {matchedProfile.isAuto
                                            ? "Le mapping a été configuré automatiquement. Vérifiez si besoin dans l'éditeur."
                                            : matchedProfile.newHeaders.length > 0
                                                ? `${matchedProfile.newHeaders.length} nouvelle${matchedProfile.newHeaders.length > 1 ? "s" : ""} colonne${matchedProfile.newHeaders.length > 1 ? "s" : ""} à compléter : ${matchedProfile.newHeaders.slice(0, 3).join(", ")}${matchedProfile.newHeaders.length > 3 ? "…" : ""}`
                                                : "Le mapping est prêt, vérifiez avant d'importer."
                                        }
                                    </p>
                                </div>
                                <button
                                    onClick={() => {
                                        setMatchedProfile(null);
                                        setColMapping(buildInitialMapping(headers, rows));
                                        setAppliedProfileId(null);
                                    }}
                                    title="Ignorer ce profil et utiliser la détection automatique"
                                    className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                                    <X size={12} />
                                </button>
                            </div>
                        )}

                        {/* Choix du mode — apparaît dès qu'un fichier est chargé */}
                        {fileLoaded && (
                            <div className="space-y-3">
                                <p className="text-sm text-muted-foreground text-center">
                                    Fichier prêt — choisissez votre mode d'import
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {/* Import rapide */}
                                    <button
                                        data-testid="csv-quick-import-btn"
                                        onClick={() => setStep("quick-summary")}
                                        className="group rounded-2xl border-2 border-primary bg-primary/5 hover:bg-primary/10 p-5 text-left transition-colors flex flex-col gap-2">
                                        <div className="flex items-center gap-2">
                                            <div className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
                                                <Zap size={18} />
                                            </div>
                                            <span className="font-semibold text-[15px] text-foreground">Import rapide</span>
                                        </div>
                                        <p className="text-[12.5px] text-muted-foreground leading-relaxed">
                                            Toutes les colonnes sont importées automatiquement.
                                            Aucune étape supplémentaire.
                                        </p>
                                        <div className="mt-1 flex flex-wrap gap-1.5">
                                            {headers.slice(0, 5).map((h) => (
                                                <span key={h} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10.5px] font-medium">{h}</span>
                                            ))}
                                            {headers.length > 5 && (
                                                <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10.5px]">+{headers.length - 5}</span>
                                            )}
                                        </div>
                                    </button>

                                    {/* Mode avancé */}
                                    <button
                                        data-testid="csv-advanced-btn"
                                        onClick={() => setStep("advanced-edit")}
                                        className="group rounded-2xl border-2 border-border hover:border-foreground/30 bg-card p-5 text-left transition-colors flex flex-col gap-2">
                                        <div className="flex items-center gap-2">
                                            <div className="w-9 h-9 rounded-xl bg-secondary text-foreground flex items-center justify-center">
                                                <Settings2 size={18} />
                                            </div>
                                            <span className="font-semibold text-[15px] text-foreground">Modifier avant l'import</span>
                                        </div>
                                        <p className="text-[12.5px] text-muted-foreground leading-relaxed">
                                            Éditez les données, renommez les colonnes, supprimez des lignes — sans ouvrir Excel.
                                        </p>
                                        <div className="mt-1 flex flex-wrap gap-1.5">
                                            {["Tableau éditable", "Mapping colonnes", "Filtre & recherche"].map((t) => (
                                                <span key={t} className="px-2 py-0.5 rounded-full bg-secondary text-muted-foreground text-[10.5px]">{t}</span>
                                            ))}
                                        </div>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ── Panneau profils (toujours accessible, replié par défaut) ── */}
                        <div className="border-t border-border/50 pt-3">
                            <button
                                onClick={() => setShowProfiles((v) => !v)}
                                className="flex items-center gap-2 text-[12px] text-muted-foreground hover:text-foreground transition-colors w-full">
                                <BookMarked size={13} />
                                <span className="font-medium">Profils d'import enregistrés</span>
                                {showProfiles ? <ChevronUp size={12} className="ml-auto" /> : <ChevronDown size={12} className="ml-auto" />}
                            </button>
                            {showProfiles && (
                                <div className="mt-3">
                                    <ImportProfilesManager
                                        currentHeaders={headers}
                                        currentColMapping={colMapping}
                                        canSave={fileLoaded}
                                        onApply={(profile) => {
                                            const applied = applyProfile(headers, profile);
                                            setColMapping(applied);
                                            setAppliedProfileId(profile.id);
                                            setMatchedProfile({
                                                profile, score: 1,
                                                isAuto: false, isSuggested: true, newHeaders: [],
                                            });
                                            setShowProfiles(false);
                                            toast.success(`Profil « ${profile.name} » appliqué`);
                                        }}
                                        onSaveCurrent={(name) => {
                                            const saved = saveProfile({ name, headers, colMapping });
                                            setAppliedProfileId(saved.id);
                                            toast.success(`Profil « ${name} » enregistré`);
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ════════════════════════════════════════
                    ÉTAPE : RÉCAPITULATIF RAPIDE
                ════════════════════════════════════════ */}
                {step === "quick-summary" && summary && (
                    <div className="flex-1 overflow-y-auto py-2">
                        <Summary
                            fileName={fileName}
                            rowCount={rows.length}
                            summary={summary}
                            headers={headers}
                            colMapping={colMapping}
                            nameHeader={nameHeader}
                            dupStrategy={dupStrategy}
                            dupDominant={dupDominant}
                            onDupStrategyChange={setDupStrategy}
                            onDupDominantChange={setDupDominant}
                            skipExisting={skipExisting}
                            onSkipExistingChange={setSkipExisting}
                            existingLeadCount={Object.keys(workspace?.leads || {}).length}
                        />
                    </div>
                )}

                {/* ════════════════════════════════════════
                    ÉTAPE : ÉDITEUR AVANCÉ
                ════════════════════════════════════════ */}
                {step === "advanced-edit" && (
                    <div className="flex-1 min-h-0 overflow-hidden py-1">
                        <AdvancedEditor
                            headers={headers}
                            rows={rows}
                            colMapping={colMapping}
                            nameHeader={nameHeader}
                            onHeadersChange={(newHeaders, newMapping) => {
                                setHeaders(newHeaders);
                                setColMapping(newMapping);
                            }}
                            onRowsChange={setRows}
                            onMappingChange={setColMapping}
                            onNameHeaderChange={setNameHeader}
                        />
                    </div>
                )}

                {/* ════════════════════════════════════════
                    ÉTAPE : RÉCAPITULATIF AVANCÉ
                ════════════════════════════════════════ */}
                {step === "advanced-summary" && summary && (
                    <div className="flex-1 overflow-y-auto py-2">
                        <Summary
                            fileName={fileName}
                            rowCount={rows.length}
                            summary={summary}
                            headers={headers}
                            colMapping={colMapping}
                            nameHeader={nameHeader}
                            dupStrategy={dupStrategy}
                            dupDominant={dupDominant}
                            onDupStrategyChange={setDupStrategy}
                            onDupDominantChange={setDupDominant}
                            skipExisting={skipExisting}
                            onSkipExistingChange={setSkipExisting}
                            existingLeadCount={Object.keys(workspace?.leads || {}).length}
                        />
                    </div>
                )}

                {/* ════════════════════════════════════════
                    FOOTER
                ════════════════════════════════════════ */}
                <DialogFooter className="shrink-0 pt-2 border-t border-border/60 flex-wrap gap-2">

                    {/* Retour */}
                    {step !== "upload" && (
                        <Button variant="ghost" data-testid="csv-back-btn"
                            onClick={() => {
                                if (step === "quick-summary")    setStep("upload");
                                if (step === "advanced-edit")    setStep("upload");
                                if (step === "advanced-summary") setStep("advanced-edit");
                            }}>
                            <ArrowLeft size={15} className="mr-1.5" />Retour
                        </Button>
                    )}

                    {/* Annuler */}
                    <Button variant="ghost" onClick={() => handleClose(false)} data-testid="csv-cancel-btn">
                        Annuler
                    </Button>

                    {/* Bouton sauvegarder profil — visible sur les étapes summary */}
                    {(step === "quick-summary" || step === "advanced-summary") && !appliedProfileId && (
                        <SaveProfileButton
                            onSave={(name) => {
                                const saved = saveProfile({ name, headers, colMapping });
                                setAppliedProfileId(saved.id);
                                toast.success(`Profil « ${name} » enregistré`);
                            }}
                        />
                    )}

                    {/* CTA principal selon l'étape */}
                    {step === "upload" && fileLoaded && (
                        <Button onClick={() => setStep("quick-summary")}
                            data-testid="csv-quick-confirm-btn"
                            className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5">
                            <Zap size={14} />
                            Import rapide
                        </Button>
                    )}

                    {step === "quick-summary" && (
                        <Button data-testid="csv-confirm-btn"
                            onClick={() => doImport(headers, rows, colMapping)}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground">
                            <CheckCircle2 size={14} className="mr-1.5" />
                            {dupStrategy !== "ignore" && summary?.duplicates > 0
                                ? `Importer (${rows.length} → résolution doublons)`
                                : `Importer ${rows.length} lead${rows.length > 1 ? "s" : ""}`}
                        </Button>
                    )}

                    {step === "advanced-edit" && (
                        <Button data-testid="csv-advanced-next-btn"
                            onClick={() => setStep("advanced-summary")}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground">
                            Récapitulatif →
                        </Button>
                    )}

                    {step === "advanced-summary" && (
                        <Button data-testid="csv-confirm-btn"
                            onClick={() => doImport(headers, rows, colMapping)}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground">
                            <CheckCircle2 size={14} className="mr-1.5" />
                            {dupStrategy !== "ignore" && summary?.duplicates > 0
                                ? `Importer (${rows.length} → résolution doublons)`
                                : `Importer ${rows.length} lead${rows.length > 1 ? "s" : ""}`}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
