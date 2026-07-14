import React, { useMemo, useState, useRef, useCallback } from "react";
import { Trophy, ChevronUp, ChevronDown, Phone, Mail } from "lucide-react";
import { getColumnColor } from "@/lib/columnColors";
import { telHref, mailtoHref } from "@/lib/actionLinks";

function formatDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" });
}

// Hauteur estimée d'une ligne (px) — utilisée pour le placeholder spacer
const ROW_HEIGHT = 45;
// Nombre de lignes à rendre en dehors du viewport (buffer haut + bas)
const OVERSCAN = 20;

/**
 * Hook de virtualisation légère pour une liste plate.
 * Pas de dépendance externe — utilise un scroll listener sur le conteneur.
 * Retourne l'index de début et de fin des lignes à rendre.
 */
function useVirtualRange(totalCount, containerRef) {
    const [range, setRange] = useState({ start: 0, end: Math.min(totalCount, 60) });

    const update = useCallback(() => {
        const el = containerRef.current;
        if (!el || totalCount === 0) return;
        const { scrollTop, clientHeight } = el;
        const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
        const end = Math.min(totalCount, Math.ceil((scrollTop + clientHeight) / ROW_HEIGHT) + OVERSCAN);
        setRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    }, [totalCount, containerRef]);

    // Écouter le scroll sur le conteneur
    const attachScroll = useCallback((el) => {
        if (!el) return;
        el.addEventListener("scroll", update, { passive: true });
        update();
        return () => el.removeEventListener("scroll", update);
    }, [update]);

    return { range, attachScroll };
}

export const TableView = ({ workspace, filter, onOpenLead }) => {
    const [sortKey, setSortKey] = useState("company");
    const [sortDir, setSortDir] = useState("asc");
    const containerRef = useRef(null);

    const leads = useMemo(() => {
        const q = (filter || "").toLowerCase().trim();
        const all = Object.values(workspace.leads);
        const filtered = !q ? all : all.filter((l) =>
            (l.company || "").toLowerCase().includes(q) ||
            (l.contact || "").toLowerCase().includes(q) ||
            (l.phone || "").toLowerCase().includes(q) ||
            (l.email || "").toLowerCase().includes(q) ||
            (l.tags || []).some((t) => t.toLowerCase().includes(q))
        );
        return [...filtered].sort((a, b) => {
            let va, vb;
            if (sortKey === "company") { va = a.company || ""; vb = b.company || ""; }
            else if (sortKey === "column") {
                va = workspace.columns[a.columnId]?.name || "";
                vb = workspace.columns[b.columnId]?.name || "";
            }
            else if (sortKey === "dealValue") { va = a.dealValue ?? -1; vb = b.dealValue ?? -1; }
            else if (sortKey === "lastContact") { va = a.lastContact || ""; vb = b.lastContact || ""; }
            else if (sortKey === "contact") { va = a.contact || ""; vb = b.contact || ""; }
            else { va = ""; vb = ""; }
            const cmp = typeof va === "number"
                ? va - vb
                : va.localeCompare(vb, "fr");
            return sortDir === "asc" ? cmp : -cmp;
        });
    }, [workspace.leads, workspace.columns, filter, sortKey, sortDir]);

    const { range, attachScroll } = useVirtualRange(leads.length, containerRef);

    // Callback ref : attache le scroll listener ET stocke la ref
    const setContainerRef = useCallback((el) => {
        containerRef.current = el;
        attachScroll(el);
    }, [attachScroll]);

    const handleSort = (key) => {
        if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
        else { setSortKey(key); setSortDir("asc"); }
    };

    const Th = ({ label, k }) => (
        <th
            className="px-3 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none whitespace-nowrap"
            onClick={() => handleSort(k)}
        >
            <span className="inline-flex items-center gap-1">
                {label}
                {sortKey === k
                    ? sortDir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />
                    : <ChevronUp size={11} className="opacity-20" />}
            </span>
        </th>
    );

    // Lignes visibles seulement (+ overscan)
    const visibleLeads = leads.slice(range.start, range.end);
    const topSpacerHeight = range.start * ROW_HEIGHT;
    const bottomSpacerHeight = (leads.length - range.end) * ROW_HEIGHT;

    return (
        <div ref={setContainerRef} className="flex-1 overflow-auto px-4 sm:px-6 py-4">
            <div className="rounded-xl border border-border overflow-hidden bg-card">
                <table className="w-full text-sm border-collapse">
                    <thead className="bg-muted/50 border-b border-border sticky top-0 z-10">
                        <tr>
                            <Th label="Entreprise" k="company" />
                            <Th label="Contact" k="contact" />
                            <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Tél. / Email</th>
                            <Th label="Statut" k="column" />
                            <Th label="Deal" k="dealValue" />
                            <Th label="Dernier contact" k="lastContact" />
                            <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Tags</th>
                        </tr>
                    </thead>
                    <tbody>
                        {/* Spacer haut — remplace les lignes non rendues au-dessus */}
                        {topSpacerHeight > 0 && (
                            <tr aria-hidden style={{ height: topSpacerHeight }}>
                                <td colSpan={7} />
                            </tr>
                        )}

                        {visibleLeads.map((lead, i) => {
                            const col = workspace.columns[lead.columnId];
                            const color = getColumnColor(col);
                            const globalIndex = range.start + i;
                            return (
                                <tr
                                    key={lead.id}
                                    onClick={() => onOpenLead(lead)}
                                    className={`cursor-pointer hover:bg-muted/30 transition-colors ${globalIndex > 0 ? "border-t border-border/50" : ""}`}
                                >
                                    {/* Entreprise */}
                                    <td className="px-3 py-2.5">
                                        <span className={`font-semibold text-[13px] text-foreground ${lead.company?.startsWith("Sans nom") ? "opacity-40 italic" : ""}`}>
                                            {lead.company}
                                        </span>
                                    </td>
                                    {/* Contact */}
                                    <td className="px-3 py-2.5 text-[12.5px] text-muted-foreground max-w-[140px]">
                                        <span className="truncate block">{lead.contact || "—"}</span>
                                    </td>
                                    {/* Tél / Email */}
                                    <td className="px-3 py-2.5">
                                        <div className="flex flex-col gap-0.5">
                                            {lead.phone && (
                                                <a href={telHref(lead.phone) || undefined} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground truncate max-w-[130px]">
                                                    <Phone size={10} strokeWidth={1.75} className="shrink-0" />
                                                    {lead.phone}
                                                </a>
                                            )}
                                            {lead.email && (
                                                <a href={mailtoHref(lead.email) || undefined} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground truncate max-w-[130px]">
                                                    <Mail size={10} strokeWidth={1.75} className="shrink-0" />
                                                    {lead.email}
                                                </a>
                                            )}
                                            {!lead.phone && !lead.email && <span className="text-[12px] text-muted-foreground/40">—</span>}
                                        </div>
                                    </td>
                                    {/* Statut */}
                                    <td className="px-3 py-2.5">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold text-white ${color.dot}`}>
                                            {col?.name || "—"}
                                        </span>
                                    </td>
                                    {/* Deal */}
                                    <td className="px-3 py-2.5">
                                        {lead.dealValue != null ? (
                                            <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-700 dark:text-emerald-400">
                                                <Trophy size={10} strokeWidth={2} />
                                                {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(lead.dealValue)}
                                            </span>
                                        ) : <span className="text-muted-foreground/40 text-[12px]">—</span>}
                                    </td>
                                    {/* Dernier contact */}
                                    <td className="px-3 py-2.5 text-[12px] text-muted-foreground whitespace-nowrap">
                                        {formatDate(lead.lastContact)}
                                    </td>
                                    {/* Tags */}
                                    <td className="px-3 py-2.5">
                                        <div className="flex flex-wrap gap-1">
                                            {(lead.tags || []).slice(0, 2).map((t) => (
                                                <span key={t} className="px-1.5 py-0.5 rounded bg-primary/8 text-primary text-[10.5px] font-medium">{t}</span>
                                            ))}
                                            {lead.tags?.length > 2 && <span className="text-[10.5px] text-muted-foreground">+{lead.tags.length - 2}</span>}
                                            {!lead.tags?.length && <span className="text-muted-foreground/40 text-[12px]">—</span>}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}

                        {/* Spacer bas — remplace les lignes non rendues en dessous */}
                        {bottomSpacerHeight > 0 && (
                            <tr aria-hidden style={{ height: bottomSpacerHeight }}>
                                <td colSpan={7} />
                            </tr>
                        )}

                        {leads.length === 0 && (
                            <tr>
                                <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-sm">
                                    Aucun lead trouvé
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
                {/* Footer */}
                <div className="px-4 py-2 border-t border-border/60 text-[11px] text-muted-foreground bg-muted/20">
                    {leads.length} lead{leads.length > 1 ? "s" : ""}
                </div>
            </div>
        </div>
    );
};
