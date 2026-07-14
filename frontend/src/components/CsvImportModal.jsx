import React, { useRef, useState, useMemo } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { FileUp, Upload, ArrowLeft, CheckCircle2, AlertCircle, MinusCircle } from "lucide-react";
import { parseCsv, autoDetectMapping, rowsToLeads, HEADER_TRANSLATIONS } from "@/lib/csvUtils";
import { useCrm } from "@/context/CrmContext";
import { toast } from "sonner";

// Champs CRM disponibles comme cibles de mapping
const CRM_FIELDS = [
    { key: "company", label: "Nom de l'entreprise", required: true },
    { key: "contact", label: "Contact (prénom + nom)" },
    { key: "phone",   label: "Téléphone" },
    { key: "website", label: "Site web" },
    { key: "email",   label: "Email" },
];

const NONE   = "__none__";   // ignorer cette colonne
const EXTRA  = "__extra__";  // garder comme champ extra (traduit)

export const CsvImportModal = ({ open, onOpenChange, workspaceId }) => {
    const { dispatch } = useCrm();
    const fileRef = useRef(null);
    const [step, setStep]         = useState(1);
    const [fileName, setFileName] = useState("");
    const [headers, setHeaders]   = useState([]);
    const [rows, setRows]         = useState([]);
    // colMapping : { [csvHeader]: "company"|"phone"|...|"__none__"|"__extra__" }
    const [colMapping, setColMapping] = useState({});
    const [dragOver, setDragOver] = useState(false);

    const reset = () => {
        setStep(1); setFileName(""); setHeaders([]); setRows([]); setColMapping({});
    };

    const handleClose = (v) => {
        onOpenChange(v);
        if (!v) setTimeout(reset, 200);
    };

    const handleFile = async (file) => {
        if (!file) return;
        if (!file.name.toLowerCase().endsWith(".csv")) {
            toast.error("Fichier non supporté", { description: "Veuillez fournir un fichier .csv" });
            return;
        }
        try {
            const text = await file.text();
            const { headers: h, rows: r } = parseCsv(text);
            if (!h.length || !r.length) { toast.error("CSV vide ou illisible"); return; }

            // autoDetectMapping retourne { fieldKey: csvHeader }
            // On inverse pour obtenir { csvHeader: fieldKey }
            const detected = autoDetectMapping(h); // { company: "entreprise", phone: "phone_number", ... }
            const invertedDetected = {};
            Object.entries(detected).forEach(([field, header]) => {
                invertedDetected[header] = field;
            });

            // Pour chaque colonne CSV, déterminer la valeur initiale du select
            const initMap = {};
            h.forEach((header) => {
                if (!header) return;
                if (invertedDetected[header]) {
                    initMap[header] = invertedDetected[header]; // auto-détecté → champ CRM
                } else {
                    initMap[header] = EXTRA; // non détecté → garder comme extra par défaut
                }
            });

            setFileName(file.name);
            setHeaders(h);
            setRows(r);
            setColMapping(initMap);
            setStep(2);
        } catch (err) {
            toast.error("Erreur de lecture", { description: String(err) });
        }
    };

    // Construit le mapping attendu par rowsToLeads : { fieldKey: csvHeader }
    const legacyMapping = useMemo(() => {
        const m = {};
        Object.entries(colMapping).forEach(([header, target]) => {
            if (target && target !== NONE && target !== EXTRA) {
                m[target] = header;
            }
        });
        return m;
    }, [colMapping]);

    // Colonnes qui nécessitent une attention (pas auto-détectées, pas encore ignorées)
    const unmappedCount = useMemo(() =>
        headers.filter((h) => h && colMapping[h] === EXTRA).length,
    [headers, colMapping]);

    const preview = rows.slice(0, 2);

    const confirmImport = async () => {
        const leads = rowsToLeads(headers, rows, legacyMapping, colMapping);
        const incomplete = leads.filter((l) => l._incomplete).length;
        const cleanLeads = leads.map(({ _incomplete: _i, ...rest }) => rest);

        // Pour de grands imports, découper en chunks de 100 pour ne pas bloquer
        // le thread principal avec un seul dispatch massif.
        const CHUNK = 100;
        if (cleanLeads.length <= CHUNK) {
            dispatch({ type: "BULK_ADD_LEADS", workspaceId, leads: cleanLeads });
        } else {
            // Premier chunk immédiat
            dispatch({ type: "BULK_ADD_LEADS", workspaceId, leads: cleanLeads.slice(0, CHUNK) });
            // Chunks suivants avec un yield pour garder l'UI réactive
            for (let i = CHUNK; i < cleanLeads.length; i += CHUNK) {
                await new Promise((resolve) => setTimeout(resolve, 0));
                dispatch({ type: "BULK_ADD_LEADS", workspaceId, leads: cleanLeads.slice(i, i + CHUNK) });
            }
        }

        toast.success(`${leads.length} lead${leads.length > 1 ? "s" : ""} importé${leads.length > 1 ? "s" : ""}`, {
            description: incomplete > 0 ? `${incomplete} sans nom d'entreprise à compléter.` : undefined,
        });
        handleClose(false);
    };

    // Valeurs déjà utilisées pour un champ CRM (pour éviter le double mapping)
    const usedCrmFields = useMemo(() => {
        const used = new Set();
        Object.values(colMapping).forEach((v) => {
            if (v && v !== NONE && v !== EXTRA) used.add(v);
        });
        return used;
    }, [colMapping]);

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent
                data-testid="csv-import-modal"
                className="sm:max-w-[660px] rounded-2xl shadow-panel"
            >
                <DialogHeader>
                    <DialogTitle className="text-xl tracking-tight">
                        {step === 1 ? "Importer un CSV" : "Associer les colonnes"}
                    </DialogTitle>
                    <DialogDescription>
                        {step === 1
                            ? "Déposez un fichier ou choisissez-en un."
                            : `${fileName} — ${rows.length} ligne(s) · Vérifiez chaque colonne avant d'importer.`}
                    </DialogDescription>
                </DialogHeader>

                {/* ── ÉTAPE 1 : upload ── */}
                {step === 1 && (
                    <div className="py-4">
                        <label
                            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
                            className={`block rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors ${
                                dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-primary/[0.02]"
                            }`}
                            data-testid="csv-dropzone"
                        >
                            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
                                data-testid="csv-file-input"
                                onChange={(e) => handleFile(e.target.files?.[0])} />
                            <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
                                <FileUp size={22} />
                            </div>
                            <div className="text-base font-medium">Glissez votre fichier CSV ici</div>
                            <div className="text-sm text-muted-foreground mt-1">ou</div>
                            <Button type="button" onClick={() => fileRef.current?.click()}
                                variant="secondary" className="mt-3 rounded-full h-10"
                                data-testid="csv-choose-file-btn">
                                <Upload size={15} className="mr-1.5" />Choisir un fichier
                            </Button>
                        </label>
                    </div>
                )}

                {/* ── ÉTAPE 2 : mapping colonne par colonne ── */}
                {step === 2 && (
                    <div className="py-1 max-h-[65vh] overflow-y-auto space-y-4">

                        {/* Légende */}
                        <div className="flex items-center gap-4 text-[11px] text-muted-foreground px-0.5">
                            <span className="flex items-center gap-1.5">
                                <CheckCircle2 size={12} className="text-emerald-500" />
                                Détecté automatiquement
                            </span>
                            <span className="flex items-center gap-1.5">
                                <AlertCircle size={12} className="text-amber-500" />
                                À confirmer
                            </span>
                            <span className="flex items-center gap-1.5">
                                <MinusCircle size={12} className="text-muted-foreground/50" />
                                Ignoré
                            </span>
                        </div>

                        {/* Table de mapping — une ligne par colonne CSV */}
                        <div className="rounded-xl border border-border overflow-hidden">
                            {/* Header */}
                            <div className="grid grid-cols-12 gap-3 px-4 py-2 bg-secondary/50 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                                <div className="col-span-3">Colonne CSV</div>
                                <div className="col-span-3">Exemple</div>
                                <div className="col-span-6">Correspond à…</div>
                            </div>

                            {headers.filter(Boolean).map((header, i) => {
                                const target = colMapping[header] ?? EXTRA;
                                const isAutoMapped = target !== NONE && target !== EXTRA;
                                const isExtra = target === EXTRA;
                                const isIgnored = target === NONE;
                                const sampleVal = preview[0] ? (preview[0][headers.indexOf(header)] || "") : "";
                                const translatedLabel = HEADER_TRANSLATIONS[(header || "").toLowerCase().trim()];

                                return (
                                    <div
                                        key={header}
                                        className={`grid grid-cols-12 gap-3 px-4 py-2.5 items-center border-t border-border/60 text-sm transition-colors ${
                                            isIgnored ? "opacity-40" : ""
                                        }`}
                                    >
                                        {/* Colonne CSV */}
                                        <div className="col-span-3 flex items-center gap-2 min-w-0">
                                            {isAutoMapped
                                                ? <CheckCircle2 size={13} className="shrink-0 text-emerald-500" />
                                                : isIgnored
                                                    ? <MinusCircle size={13} className="shrink-0 text-muted-foreground/40" />
                                                    : <AlertCircle size={13} className="shrink-0 text-amber-500" />
                                            }
                                            <span className="font-medium truncate text-[12px]" title={header}>
                                                {header}
                                            </span>
                                        </div>

                                        {/* Exemple */}
                                        <div className="col-span-3 text-[11px] text-muted-foreground truncate" title={sampleVal}>
                                            {sampleVal || <span className="italic">—</span>}
                                        </div>

                                        {/* Select cible */}
                                        <div className="col-span-6">
                                            <Select
                                                value={target}
                                                onValueChange={(v) =>
                                                    setColMapping((m) => ({ ...m, [header]: v }))
                                                }
                                            >
                                                <SelectTrigger
                                                    data-testid={`csv-col-map-${i}`}
                                                    className={`h-9 text-[12px] ${
                                                        isAutoMapped
                                                            ? "border-emerald-500/40 bg-emerald-500/5"
                                                            : isIgnored
                                                                ? "border-border/40 bg-transparent"
                                                                : "border-amber-500/40 bg-amber-500/5"
                                                    }`}
                                                >
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {/* Champs CRM principaux */}
                                                    <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                                                        Champs principaux
                                                    </div>
                                                    {CRM_FIELDS.map((f) => {
                                                        const alreadyUsed = usedCrmFields.has(f.key) && target !== f.key;
                                                        return (
                                                            <SelectItem
                                                                key={f.key}
                                                                value={f.key}
                                                                disabled={alreadyUsed}
                                                                className={alreadyUsed ? "opacity-40" : ""}
                                                            >
                                                                {f.label}
                                                                {f.required && <span className="ml-1 text-primary text-[10px]">*</span>}
                                                                {alreadyUsed && <span className="ml-1 text-[10px] text-muted-foreground">(déjà utilisé)</span>}
                                                            </SelectItem>
                                                        );
                                                    })}
                                                    {/* Garder comme extra */}
                                                    <div className="h-px bg-border my-1" />
                                                    <SelectItem value={EXTRA}>
                                                        {translatedLabel
                                                            ? `Garder comme « ${translatedLabel} »`
                                                            : "Garder comme champ extra"}
                                                    </SelectItem>
                                                    <SelectItem value={NONE}>
                                                        — Ignorer cette colonne —
                                                    </SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Résumé */}
                        <div className="flex items-center gap-3 text-[12px] text-muted-foreground px-0.5">
                            <span>
                                {Object.values(colMapping).filter((v) => v !== NONE && v !== EXTRA).length} champ
                                {Object.values(colMapping).filter((v) => v !== NONE && v !== EXTRA).length > 1 ? "s" : ""} mappé
                                {Object.values(colMapping).filter((v) => v !== NONE && v !== EXTRA).length > 1 ? "s" : ""}
                            </span>
                            <span>·</span>
                            <span>
                                {Object.values(colMapping).filter((v) => v === EXTRA).length} extra
                                {Object.values(colMapping).filter((v) => v === EXTRA).length > 1 ? "s" : ""}
                            </span>
                            <span>·</span>
                            <span>
                                {Object.values(colMapping).filter((v) => v === NONE).length} ignoré
                                {Object.values(colMapping).filter((v) => v === NONE).length > 1 ? "s" : ""}
                            </span>
                        </div>

                        {!legacyMapping.company && (
                            <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                                <AlertCircle size={12} />
                                Aucune colonne mappée sur "Entreprise" — les leads seront créés sans nom.
                            </p>
                        )}
                    </div>
                )}

                <DialogFooter className="pt-2">
                    {step === 2 && (
                        <Button variant="ghost" onClick={() => setStep(1)} data-testid="csv-back-btn">
                            <ArrowLeft size={15} className="mr-1.5" />Retour
                        </Button>
                    )}
                    <Button variant="ghost" onClick={() => handleClose(false)} data-testid="csv-cancel-btn">
                        Annuler
                    </Button>
                    {step === 2 && (
                        <Button onClick={confirmImport} data-testid="csv-confirm-btn"
                            className="bg-primary hover:bg-primary/90 text-primary-foreground">
                            Importer {rows.length} lead{rows.length > 1 ? "s" : ""}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
