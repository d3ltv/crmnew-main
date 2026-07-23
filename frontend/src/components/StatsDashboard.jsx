import React, { useMemo, useState } from "react";
import { useCrm } from "@/context/CrmContext";
import { computeWorkspaceStats, aggregateStats, formatDuration, computeCallStats } from "@/lib/statsUtils";
import {
    AlertTriangle, BarChart3, ChevronDown, Phone, Star, PhoneMissed, ChevronRight,
} from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";

// ---------- Helpers ----------
function pct(n) {
    if (n === null || n === undefined) return "—";
    return `${n.toFixed(1)} %`;
}

function fmtEur(n) {
    if (n === null || n === undefined) return "—";
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

function relativeDate(ts) {
    if (!ts) return "—";
    const diff = Date.now() - ts;
    const d = Math.floor(diff / 86400000);
    if (d === 0) return "aujourd'hui";
    if (d === 1) return "hier";
    if (d < 7) return `il y a ${d} j`;
    if (d < 30) return `il y a ${Math.floor(d / 7)} sem.`;
    return `il y a ${Math.floor(d / 30)} mois`;
}

/** Opacité 0.22–1 selon intensité (0–1), teinte unique neutre */
function heatOpacity(intensity) {
    const t = Math.max(0, Math.min(1, intensity));
    return 0.22 + t * 0.78;
}

const CHART_HUE = "220 10% 28%"; // gris-ardoise — une seule teinte

// ---------- SVG Line Chart ----------
const PriceChart = ({ timeline }) => {
    const [hovered, setHovered] = useState(null);

    if (!timeline || timeline.length === 0) {
        return (
            <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                Aucun deal avec prix enregistré
            </div>
        );
    }

    const W = 600, H = 160, PAD = { top: 16, right: 16, bottom: 32, left: 56 };
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;

    const cumulValues = timeline.map((p) => p.cumul);
    const minV = 0;
    const maxV = Math.max(...cumulValues) * 1.08;

    const xScale = (i) => PAD.left + (i / Math.max(timeline.length - 1, 1)) * innerW;
    const yScale = (v) => PAD.top + innerH - ((v - minV) / (maxV - minV || 1)) * innerH;

    const points = timeline.map((p, i) => ({ x: xScale(i), y: yScale(p.cumul), ...p }));
    const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(PAD.top + innerH).toFixed(1)} L ${PAD.left.toFixed(1)} ${(PAD.top + innerH).toFixed(1)} Z`;

    const yTicks = [0, 0.5, 1].map((t) => ({
        v: minV + t * (maxV - minV),
        y: yScale(minV + t * (maxV - minV)),
    }));

    const xLabels = [];
    const step = Math.max(1, Math.floor(timeline.length / 4));
    for (let i = 0; i < timeline.length; i += step) xLabels.push(i);
    if (!xLabels.includes(timeline.length - 1)) xLabels.push(timeline.length - 1);

    return (
        <div className="relative w-full" style={{ aspectRatio: `${W}/${H}` }}>
            <svg
                viewBox={`0 0 ${W} ${H}`}
                className="w-full h-full"
                onMouseLeave={() => setHovered(null)}
            >
                <defs>
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={`hsl(${CHART_HUE})`} stopOpacity="0.12" />
                        <stop offset="100%" stopColor={`hsl(${CHART_HUE})`} stopOpacity="0" />
                    </linearGradient>
                    <clipPath id="chartClip">
                        <rect x={PAD.left} y={PAD.top} width={innerW} height={innerH + 1} />
                    </clipPath>
                </defs>

                {yTicks.map((t, i) => (
                    <line
                        key={i}
                        x1={PAD.left} y1={t.y}
                        x2={PAD.left + innerW} y2={t.y}
                        stroke="hsl(var(--border))" strokeWidth="1" strokeDasharray="4 4"
                    />
                ))}

                <path d={areaPath} fill="url(#areaGrad)" clipPath="url(#chartClip)" />
                <path
                    d={linePath}
                    fill="none"
                    stroke={`hsl(${CHART_HUE})`}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    clipPath="url(#chartClip)"
                />

                {yTicks.map((t, i) => (
                    <text
                        key={i}
                        x={PAD.left - 6} y={t.y + 4}
                        textAnchor="end"
                        fontSize="10"
                        fill="hsl(var(--muted-foreground))"
                    >
                        {fmtEur(t.v).replace("€", "").trim()}€
                    </text>
                ))}

                {xLabels.map((i) => {
                    const p = points[i];
                    const d = new Date(timeline[i].date);
                    const label = d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
                    return (
                        <text key={i} x={p.x} y={H - 6} textAnchor="middle" fontSize="10" fill="hsl(var(--muted-foreground))">
                            {label}
                        </text>
                    );
                })}

                {points.map((p, i) => (
                    <g key={i}>
                        <circle cx={p.x} cy={p.y} r="3.5" fill={`hsl(${CHART_HUE})`} stroke="hsl(var(--background))" strokeWidth="2" />
                        <rect
                            x={p.x - 14} y={PAD.top} width={28} height={innerH}
                            fill="transparent"
                            onMouseEnter={() => setHovered({ ...p, idx: i })}
                        />
                    </g>
                ))}

                {hovered && (() => {
                    const tx = Math.min(Math.max(hovered.x, PAD.left + 40), PAD.left + innerW - 40);
                    const ty = Math.max(hovered.y - 36, PAD.top + 4);
                    return (
                        <g>
                            <line x1={hovered.x} y1={PAD.top} x2={hovered.x} y2={PAD.top + innerH} stroke={`hsl(${CHART_HUE})`} strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />
                            <rect x={tx - 50} y={ty - 14} width={100} height={30} rx="6" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1" />
                            <text x={tx} y={ty + 2} textAnchor="middle" fontSize="11" fontWeight="600" fill="hsl(var(--foreground))">
                                {fmtEur(hovered.value)}
                            </text>
                            <text x={tx} y={ty + 14} textAnchor="middle" fontSize="9.5" fill="hsl(var(--muted-foreground))">
                                {hovered.company?.length > 16 ? hovered.company.slice(0, 15) + "…" : hovered.company}
                            </text>
                        </g>
                    );
                })()}
            </svg>
        </div>
    );
};

// ---------- Distribution bar chart (single hue + opacity) ----------
const DistributionBars = ({ distribution }) => {
    if (!distribution || distribution.length === 0) return null;
    const max = Math.max(...distribution.map((b) => b.count), 1);
    return (
        <div className="space-y-2.5 mt-3">
            {distribution.map((b) => {
                const intensity = b.count / max;
                return (
                    <div key={b.label} className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-24 shrink-0 text-right">{b.label}</span>
                        <div className="flex-1 h-2 rounded-full bg-black/[0.04] dark:bg-white/[0.06] overflow-hidden">
                            <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                    width: `${intensity * 100}%`,
                                    backgroundColor: `hsl(${CHART_HUE})`,
                                    opacity: heatOpacity(intensity),
                                }}
                            />
                        </div>
                        <span className="text-xs tabular-nums text-muted-foreground w-6 text-right shrink-0">{b.count}</span>
                    </div>
                );
            })}
        </div>
    );
};

// ---------- Sub-components ----------

/** KPI tile — fond subtil, pas de bordure, typo hiérarchisée */
const Tile = ({ label, value, sub, tone = "neutral" }) => {
    const valueClass =
        tone === "danger" ? "text-rose-600 dark:text-rose-400" :
        tone === "success" ? "text-emerald-700 dark:text-emerald-400" :
        "text-foreground";

    return (
        <div className="rounded-xl bg-[#FAFAFA] dark:bg-white/[0.04] p-5 flex flex-col gap-1.5 min-h-[96px]">
            <div className="text-[11px] uppercase tracking-[0.06em] font-medium text-muted-foreground/80">
                {label}
            </div>
            <div className={`text-[28px] font-semibold tracking-tight leading-none tabular-nums ${valueClass}`}>
                {value}
            </div>
            {sub && <div className="text-[12px] text-muted-foreground mt-1 leading-snug">{sub}</div>}
        </div>
    );
};

/** Panel sans bordure */
const Panel = ({ children, className = "" }) => (
    <div className={`rounded-xl bg-[#FAFAFA] dark:bg-white/[0.04] p-5 ${className}`}>
        {children}
    </div>
);

const PanelLabel = ({ children, hint }) => (
    <div className="flex items-center justify-between gap-3 mb-4">
        <span className="text-[13px] font-medium text-foreground">{children}</span>
        {hint && <span className="text-[11px] text-muted-foreground shrink-0">{hint}</span>}
    </div>
);

/** Horizontal bar chart for column distribution */
const ColumnBar = ({ byColumn }) => {
    const total = byColumn.reduce((s, c) => s + c.count, 0);
    if (total === 0) return <p className="text-xs text-muted-foreground">Aucun lead</p>;
    const max = Math.max(...byColumn.map((c) => c.count), 1);
    return (
        <div className="space-y-2.5">
            {byColumn.filter((c) => c.count > 0).map((c) => {
                const intensity = c.count / max;
                return (
                    <div key={c.id || c.name} className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-28 truncate shrink-0">{c.name}</span>
                        <div className="flex-1 h-2 rounded-full bg-black/[0.04] dark:bg-white/[0.06] overflow-hidden">
                            <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                    width: `${(c.count / total) * 100}%`,
                                    backgroundColor: `hsl(${CHART_HUE})`,
                                    opacity: heatOpacity(intensity),
                                }}
                            />
                        </div>
                        <span className="text-xs tabular-nums text-foreground/70 w-8 text-right shrink-0 font-medium">{c.count}</span>
                    </div>
                );
            })}
        </div>
    );
};

function isNoContactLead(l) {
    return !l.phone && !l.email && !l.website;
}

function isOverdueLead(l) {
    return !!(l.autoFollowup && (l.autoFollowup.overdue || new Date(l.autoFollowup.dueAt) <= new Date()));
}

/** Collecte les leads d'alerte, groupés par espace (ordre des workspaces) */
function collectAlertLeads(workspaces, type) {
    const predicate = type === "nocontact" ? isNoContactLead : isOverdueLead;
    return workspaces
        .map((ws) => {
            const leads = Object.values(ws.leads)
                .filter(predicate)
                .sort((a, b) => (a.company || "").localeCompare(b.company || "", "fr", { sensitivity: "base" }))
                .map((lead) => ({
                    lead,
                    columnName: ws.columns[lead.columnId]?.name || "—",
                }));
            return { workspace: ws, leads };
        })
        .filter((g) => g.leads.length > 0);
}

/** Dialogue listant les leads d'une alerte, séparés par ligne, triés par espace */
const AlertLeadsDialog = ({ open, onOpenChange, type, groups, onOpenLead }) => {
    const total = groups.reduce((s, g) => s + g.leads.length, 0);
    const title = type === "nocontact"
        ? "Leads sans coordonnées"
        : "Rappels en retard";
    const description = type === "nocontact"
        ? `${total} lead${total > 1 ? "s" : ""} sans téléphone, email ni site — regroupés par espace`
        : `${total} rappel${total > 1 ? "s" : ""} en retard — regroupés par espace`;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="sm:max-w-lg p-0 gap-0 overflow-hidden rounded-2xl"
                data-testid="alert-leads-dialog"
            >
                <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/50 text-left">
                    <DialogTitle className="text-[17px] font-semibold tracking-tight">
                        {title}
                    </DialogTitle>
                    <DialogDescription className="text-[13px]">
                        {description}
                    </DialogDescription>
                </DialogHeader>

                <div className="max-h-[min(70vh,520px)] overflow-y-auto">
                    {groups.length === 0 ? (
                        <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                            Aucun lead dans cette catégorie.
                        </div>
                    ) : (
                        groups.map(({ workspace, leads }) => (
                            <div key={workspace.id}>
                                <div className="sticky top-0 z-10 px-5 py-2 bg-[#FAFAFA] dark:bg-white/[0.06] border-b border-border/40">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[12px] font-semibold text-foreground truncate">
                                            {workspace.name}
                                        </span>
                                        <span className="text-[11px] tabular-nums text-muted-foreground shrink-0">
                                            {leads.length}
                                        </span>
                                    </div>
                                    {workspace.sector && (
                                        <span className="text-[11px] text-muted-foreground">{workspace.sector}</span>
                                    )}
                                </div>
                                <ul className="divide-y divide-border/50">
                                    {leads.map(({ lead, columnName }) => (
                                        <li key={lead.id}>
                                            <button
                                                type="button"
                                                data-testid={`alert-lead-${lead.id}`}
                                                onClick={() => onOpenLead(workspace.id, lead.id)}
                                                className="w-full text-left px-5 py-3 flex items-center gap-3 hover:bg-black/[0.025] dark:hover:bg-white/[0.04] transition-colors group"
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-[14px] font-medium text-foreground truncate">
                                                        {lead.company || "Sans nom"}
                                                    </div>
                                                    <div className="text-[12px] text-muted-foreground truncate mt-0.5">
                                                        {columnName}
                                                        {type === "overdue" && lead.autoFollowup?.stage != null && (
                                                            <span> · étape {lead.autoFollowup.stage}/3</span>
                                                        )}
                                                        {lead.contact && <span> · {lead.contact}</span>}
                                                    </div>
                                                </div>
                                                <ChevronRight
                                                    size={15}
                                                    className="text-muted-foreground/50 group-hover:text-foreground shrink-0 transition-colors"
                                                />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};

/** Bandeau d'alertes — rupture visuelle, hors grille */
const AlertsBanner = ({ overdue, noContact, onOpenAlert }) => {
    const items = [];
    if (overdue > 0) {
        items.push({
            key: "overdue",
            icon: AlertTriangle,
            count: overdue,
            label: overdue === 1 ? "rappel en retard" : "rappels en retard",
            detail: "Cliquer pour voir la liste",
        });
    }
    if (noContact > 0) {
        items.push({
            key: "nocontact",
            icon: PhoneMissed,
            count: noContact,
            label: noContact === 1 ? "lead sans coordonnées" : "leads sans coordonnées",
            detail: "Cliquer pour voir la liste",
        });
    }
    if (items.length === 0) return null;

    return (
        <div className="flex flex-col sm:flex-row gap-3" data-testid="stats-alerts-banner">
            {items.map((item) => {
                const Icon = item.icon;
                return (
                    <button
                        key={item.key}
                        type="button"
                        onClick={() => onOpenAlert?.(item.key)}
                        className="flex-1 flex items-center gap-4 rounded-xl bg-rose-50/80 dark:bg-rose-500/10 pl-0 pr-5 py-4 border-l-[3.5px] border-rose-500 text-left hover:bg-rose-100/80 dark:hover:bg-rose-500/15 transition-colors cursor-pointer"
                    >
                        <div className="pl-4 flex items-center gap-4 min-w-0 w-full">
                            <Icon size={22} strokeWidth={1.75} className="text-rose-500 shrink-0" />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-baseline gap-2 flex-wrap">
                                    <span className="text-[26px] font-semibold tracking-tight text-rose-600 dark:text-rose-400 tabular-nums leading-none">
                                        {item.count}
                                    </span>
                                    <span className="text-[14px] font-medium text-rose-700/90 dark:text-rose-300">
                                        {item.label}
                                    </span>
                                </div>
                                <div className="text-[12px] text-rose-600/60 dark:text-rose-400/60 mt-1">
                                    {item.detail}
                                </div>
                            </div>
                            <ChevronRight size={16} className="text-rose-400/70 shrink-0" />
                        </div>
                    </button>
                );
            })}
        </div>
    );
};

/** Onglets soulignés — style outil pro */
const StatsTabs = ({ tabs, active, onChange }) => (
    <div className="border-b border-border/70" role="tablist">
        <div className="flex gap-6 -mb-px overflow-x-auto">
            {tabs.map((tab) => {
                const isActive = active === tab.id;
                return (
                    <button
                        key={tab.id}
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => onChange(tab.id)}
                        className={`relative pb-3 pt-1 text-[14px] whitespace-nowrap transition-colors group ${
                            isActive
                                ? "text-foreground font-medium"
                                : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        {tab.label}
                        <span
                            className={`absolute left-0 right-0 bottom-0 h-[2px] rounded-full origin-left transition-transform duration-200 ${
                                isActive
                                    ? "bg-foreground scale-x-100"
                                    : "bg-foreground/25 scale-x-0 group-hover:scale-x-100"
                            }`}
                        />
                    </button>
                );
            })}
        </div>
    </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Call Analytics
// ─────────────────────────────────────────────────────────────────────────────

const HourHeatmap = ({ byHour }) => {
    const [tooltip, setTooltip] = useState(null);
    const slots = byHour.filter((h) => h.hour >= 7 && h.hour <= 21);
    const maxTotal = Math.max(...slots.map((h) => h.total), 0);
    const hasData = maxTotal > 0;

    if (!hasData) {
        return (
            <div className="py-8 text-center">
                <p className="text-sm text-muted-foreground">
                    Pas encore d'appels entre 7h et 21h pour afficher le décrochage horaire.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <div className="flex items-end gap-1 relative" style={{ height: 88 }}>
                {slots.map((h) => {
                    const heightPct = h.total > 0 ? (h.total / maxTotal) * 100 : 0;
                    const rateIntensity = h.rate != null ? h.rate / 100 : 0;
                    return (
                        <div
                            key={h.hour}
                            className="flex-1 flex flex-col items-center justify-end gap-1 cursor-default"
                            onMouseEnter={() => setTooltip(h)}
                            onMouseLeave={() => setTooltip(null)}
                        >
                            <div
                                className="w-full rounded-t-sm transition-all duration-300"
                                style={{
                                    height: `${heightPct}%`,
                                    minHeight: h.total > 0 ? 4 : 0,
                                    backgroundColor: `hsl(${CHART_HUE})`,
                                    opacity: h.total === 0 ? 0.08 : heatOpacity(rateIntensity),
                                }}
                            />
                        </div>
                    );
                })}
            </div>
            <div className="flex gap-1">
                {slots.map((h) => (
                    <div key={h.hour} className="flex-1 text-center text-[9px] text-muted-foreground tabular-nums">
                        {h.hour}h
                    </div>
                ))}
            </div>
            {tooltip && tooltip.total > 0 && (
                <div className="mt-1 text-xs text-center text-foreground bg-background rounded-lg px-3 py-2">
                    <span className="font-semibold">{tooltip.hour}h00</span>
                    {" · "}
                    {tooltip.total} appel{tooltip.total > 1 ? "s" : ""}
                    {" · "}
                    <span className="font-semibold tabular-nums">
                        {tooltip.rate !== null ? `${tooltip.rate.toFixed(0)} % décrochés` : "—"}
                    </span>
                </div>
            )}
            <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1">
                <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-2 rounded-sm" style={{ backgroundColor: `hsl(${CHART_HUE})`, opacity: 0.25 }} />
                    Faible taux
                </span>
                <span className="text-muted-foreground/70">Hauteur = volume · Opacité = taux</span>
                <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-2 rounded-sm" style={{ backgroundColor: `hsl(${CHART_HUE})`, opacity: 1 }} />
                    Fort taux
                </span>
            </div>
        </div>
    );
};

const DayOfWeekBars = ({ byDayOfWeek }) => {
    const slots = byDayOfWeek.filter((d) => d.day !== 0 || d.total > 0);
    const maxTotal = Math.max(...slots.map((d) => d.total), 1);
    const hasData = slots.some((d) => d.total > 0);

    if (!hasData) {
        return (
            <div className="py-6 text-center text-sm text-muted-foreground">
                Aucun appel enregistré par jour de semaine.
            </div>
        );
    }

    return (
        <div className="space-y-2.5">
            {slots.map((d) => {
                const rate = d.rate ?? 0;
                const rateIntensity = rate / 100;
                return (
                    <div key={d.day} className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-8 shrink-0 font-medium">{d.label}</span>
                        <div className="flex-1 h-5 rounded-md bg-black/[0.04] dark:bg-white/[0.06] overflow-hidden relative">
                            <div
                                className="h-full rounded-md transition-all duration-500"
                                style={{
                                    width: `${(d.total / maxTotal) * 100}%`,
                                    backgroundColor: `hsl(${CHART_HUE})`,
                                    opacity: d.total === 0 ? 0.1 : heatOpacity(rateIntensity),
                                }}
                            />
                        </div>
                        <div className="text-right w-28 shrink-0 flex items-center justify-end gap-2">
                            <span className="text-xs text-muted-foreground tabular-nums">{d.total}</span>
                            {d.total > 0 && (
                                <span className="text-xs font-medium tabular-nums text-foreground/80">
                                    {rate.toFixed(0)} %
                                </span>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

const CallSparkline = ({ last30Days }) => {
    const [hovered, setHovered] = useState(null);
    const maxTotal = Math.max(...last30Days.map((d) => d.total), 1);
    const hasData = last30Days.some((d) => d.total > 0);
    const W = 560, H = 80, PAD = { top: 8, right: 8, bottom: 28, left: 8 };
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const BAR_W = Math.max(2, Math.floor(innerW / last30Days.length) - 2);

    if (!hasData) {
        return (
            <div className="py-8 text-center text-sm text-muted-foreground">
                Aucune activité téléphonique sur les 30 derniers jours.
            </div>
        );
    }

    return (
        <div className="relative w-full" style={{ aspectRatio: `${W}/${H}` }}>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" onMouseLeave={() => setHovered(null)}>
                {last30Days.map((d, i) => {
                    const x = PAD.left + (i / last30Days.length) * innerW + (innerW / last30Days.length - BAR_W) / 2;
                    const totalH = (d.total / maxTotal) * innerH;
                    const answeredH = d.total > 0 ? (d.answered / d.total) * totalH : 0;
                    const rateIntensity = (d.rate ?? 0) / 100;

                    const showLabel = i === 0 || i === 14 || i === last30Days.length - 1;
                    const labelDate = new Date(d.date);
                    const labelStr = labelDate.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

                    return (
                        <g key={d.date}>
                            {d.total > 0 && (
                                <rect
                                    x={x} y={PAD.top + innerH - totalH}
                                    width={BAR_W} height={totalH}
                                    fill={`hsl(${CHART_HUE})`}
                                    opacity={0.12}
                                    rx={2}
                                />
                            )}
                            {d.answered > 0 && (
                                <rect
                                    x={x} y={PAD.top + innerH - answeredH}
                                    width={BAR_W} height={answeredH}
                                    fill={`hsl(${CHART_HUE})`}
                                    opacity={heatOpacity(rateIntensity)}
                                    rx={2}
                                />
                            )}
                            <rect
                                x={x - 2} y={PAD.top}
                                width={BAR_W + 4} height={innerH}
                                fill="transparent"
                                onMouseEnter={() => setHovered({ ...d, x: x + BAR_W / 2 })}
                            />
                            {showLabel && (
                                <text x={x + BAR_W / 2} y={H - 4} textAnchor="middle" fontSize="9" fill="hsl(var(--muted-foreground))">
                                    {labelStr}
                                </text>
                            )}
                        </g>
                    );
                })}

                {hovered && hovered.total > 0 && (() => {
                    const tx = Math.min(Math.max(hovered.x, 55), W - 55);
                    const labelDate = new Date(hovered.date);
                    const labelStr = labelDate.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
                    const rate = hovered.rate ?? 0;
                    return (
                        <g>
                            <rect x={tx - 52} y={4} width={104} height={38} rx="6" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1" />
                            <text x={tx} y={18} textAnchor="middle" fontSize="10" fontWeight="600" fill="hsl(var(--foreground))">{labelStr}</text>
                            <text x={tx} y={34} textAnchor="middle" fontSize="9.5" fill="hsl(var(--muted-foreground))">
                                {hovered.answered}/{hovered.total} décrochés ({rate.toFixed(0)} %)
                            </text>
                        </g>
                    );
                })()}
            </svg>

            <div className="flex items-center gap-4 justify-center mt-2 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-2.5 rounded-sm" style={{ backgroundColor: `hsl(${CHART_HUE})`, opacity: 0.12 }} />
                    Total appels
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-2.5 rounded-sm" style={{ backgroundColor: `hsl(${CHART_HUE})`, opacity: 0.85 }} />
                    Décrochés
                </span>
            </div>
        </div>
    );
};

const CallStatsSection = ({ callStats }) => {
    const { totalCalls, totalAnswered, globalAnswerRate, byHour, byDayOfWeek, last30Days, bestHour, bestDay, streak } = callStats;

    if (totalCalls === 0) {
        return (
            <div className="rounded-xl bg-[#FAFAFA] dark:bg-white/[0.04] p-10 text-center">
                <Phone size={20} className="mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">
                    Aucun appel enregistré. Les statistiques s'afficheront après vos premiers appels.
                </p>
            </div>
        );
    }

    const answerTone =
        globalAnswerRate === null ? "neutral" :
        globalAnswerRate >= 50 ? "success" :
        globalAnswerRate < 25 ? "danger" :
        "neutral";

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Tile
                    label="Total appels"
                    value={totalCalls}
                    sub="Tous appels confondus"
                />
                <Tile
                    label="Décrochés"
                    value={totalAnswered}
                    sub={`${totalCalls - totalAnswered} non répondus`}
                    tone={totalAnswered > 0 ? "success" : "neutral"}
                />
                <Tile
                    label="Taux de décrochage"
                    value={globalAnswerRate !== null ? `${globalAnswerRate.toFixed(1)} %` : "—"}
                    sub="Sur l'ensemble des appels"
                    tone={answerTone}
                />
                <Tile
                    label="Jours consécutifs"
                    value={streak}
                    sub="Série d'appels en cours"
                />
            </div>

            {(bestHour || bestDay) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {bestHour && (
                        <div className="rounded-xl bg-[#FAFAFA] dark:bg-white/[0.04] p-5 flex items-start gap-3">
                            <Star size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                            <div>
                                <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground/80 font-medium">Meilleure heure</div>
                                <div className="text-[22px] font-semibold mt-1 tracking-tight tabular-nums">{bestHour.hour}h00 – {bestHour.hour + 1}h00</div>
                                <div className="text-[12px] text-muted-foreground mt-1">
                                    <span className="text-emerald-700 dark:text-emerald-400 font-medium">{bestHour.rate.toFixed(0)} %</span>
                                    {" de décrochage · "}{bestHour.total} appels
                                </div>
                            </div>
                        </div>
                    )}
                    {bestDay && (
                        <div className="rounded-xl bg-[#FAFAFA] dark:bg-white/[0.04] p-5 flex items-start gap-3">
                            <Star size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                            <div>
                                <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground/80 font-medium">Meilleur jour</div>
                                <div className="text-[22px] font-semibold mt-1 tracking-tight">{bestDay.label}</div>
                                <div className="text-[12px] text-muted-foreground mt-1">
                                    <span className="text-emerald-700 dark:text-emerald-400 font-medium">{bestDay.rate.toFixed(0)} %</span>
                                    {" de décrochage · "}{bestDay.total} appels
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <Panel>
                <PanelLabel hint="Hauteur = volume · Opacité = taux">Décrochage par heure (7h–21h)</PanelLabel>
                <HourHeatmap byHour={byHour} />
            </Panel>

            <Panel>
                <PanelLabel>Décrochage par jour de la semaine</PanelLabel>
                <DayOfWeekBars byDayOfWeek={byDayOfWeek} />
            </Panel>

            <Panel>
                <PanelLabel
                    hint={`${last30Days.reduce((s, d) => s + d.total, 0)} appels · ${last30Days.reduce((s, d) => s + d.answered, 0)} décrochés`}
                >
                    Activité sur 30 jours
                </PanelLabel>
                <CallSparkline last30Days={last30Days} />
            </Panel>
        </div>
    );
};

const TABS = [
    { id: "overview", label: "Vue d'ensemble" },
    { id: "timing", label: "Timing & vélocité" },
    { id: "calls", label: "Téléphonie" },
];

// ---------- Main component ----------
const PENDING_LEAD_KEY = "crm_pending_lead";

export const StatsDashboard = () => {
    const { state, dispatch } = useCrm();
    const workspaces = state.order.map((id) => state.workspaces[id]).filter(Boolean);
    const [view, setView] = useState("total");
    const [tab, setTab] = useState("overview");
    const [alertType, setAlertType] = useState(null); // "nocontact" | "overdue" | null

    const statsPerWs = useMemo(
        () => workspaces.map((ws) => ({ ws, stats: computeWorkspaceStats(ws) })),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [state.workspaces]
    );

    const totalStats = useMemo(
        () => aggregateStats(statsPerWs.map((s) => s.stats)),
        [statsPerWs]
    );

    const scopedWorkspaces = useMemo(
        () => (view === "total" ? workspaces : workspaces.filter((ws) => ws.id === view)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [state.workspaces, view]
    );

    const callStats = useMemo(() => {
        return computeCallStats(scopedWorkspaces);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.workspaces, view]);

    const alertGroups = useMemo(
        () => (alertType ? collectAlertLeads(scopedWorkspaces, alertType) : []),
        [scopedWorkspaces, alertType]
    );

    const current = view === "total"
        ? totalStats
        : statsPerWs.find((s) => s.ws.id === view)?.stats || null;

    const openLeadFromAlert = (workspaceId, leadId) => {
        try {
            sessionStorage.setItem(PENDING_LEAD_KEY, JSON.stringify({ workspaceId, leadId }));
        } catch { /* ignore */ }
        setAlertType(null);
        dispatch({ type: "SELECT_WORKSPACE", id: workspaceId });
    };

    if (!workspaces.length) return null;

    const conversionTone =
        current?.conversionRate == null ? "neutral" :
        current.conversionRate >= 30 ? "success" :
        "neutral";

    return (
        <div className="space-y-8">
            {/* Toolbar : filtre espace */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                    Vue d'ensemble de votre activité commerciale
                </p>
                <div className="relative self-start sm:self-auto">
                    <select
                        value={view}
                        onChange={(e) => setView(e.target.value)}
                        className="appearance-none h-9 pl-3.5 pr-8 rounded-lg bg-[#FAFAFA] dark:bg-white/[0.04] text-sm font-medium text-foreground cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30"
                        aria-label="Choisir la vue des statistiques"
                    >
                        <option value="total">Tous les espaces</option>
                        {workspaces.map((ws) => (
                            <option key={ws.id} value={ws.id}>{ws.name}</option>
                        ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
            </div>

            <AlertLeadsDialog
                open={!!alertType}
                onOpenChange={(v) => !v && setAlertType(null)}
                type={alertType}
                groups={alertGroups}
                onOpenLead={openLeadFromAlert}
            />

            {current && current.total > 0 ? (
                <div className="space-y-8">
                    {/* Alertes — hors grille, premier regard */}
                    <AlertsBanner
                        overdue={current.overdueFollowups || 0}
                        noContact={current.noContact || 0}
                        onOpenAlert={setAlertType}
                    />

                    {/* Onglets */}
                    <StatsTabs tabs={TABS} active={tab} onChange={setTab} />

                    {/* ── Vue d'ensemble ── */}
                    {tab === "overview" && (
                        <div className="space-y-10">
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                                <Tile
                                    label="Total leads"
                                    value={current.total}
                                    sub={`${current.active} actif${current.active > 1 ? "s" : ""}`}
                                />
                                <Tile
                                    label="Taux de conversion"
                                    value={pct(current.conversionRate)}
                                    sub={`${current.won} gagné${current.won > 1 ? "s" : ""}`}
                                    tone={conversionTone}
                                />
                                <Tile
                                    label="Taux de perte"
                                    value={pct(current.lostRate)}
                                    sub={`${current.lost} perdu${current.lost > 1 ? "s" : ""}`}
                                />
                                <Tile
                                    label="Notes totales"
                                    value={current.totalNotes}
                                    sub={`Dernière activité ${relativeDate(current.lastActivityAt)}`}
                                />
                                <Tile
                                    label="Leads perdus"
                                    value={current.lost}
                                    sub={pct(current.lostRate)}
                                />
                                <Tile
                                    label="Pipeline actif"
                                    value={current.active}
                                    sub={`${pct(current.total > 0 ? (current.active / current.total) * 100 : null)} du total`}
                                />
                            </div>

                            <Panel>
                                <PanelLabel>Distribution par colonne</PanelLabel>
                                <ColumnBar byColumn={current.byColumn} />
                            </Panel>

                            {current.dealsWithValueCount > 0 && (
                                <div className="space-y-4">
                                    <h3 className="text-[18px] font-semibold tracking-tight text-foreground">
                                        Chiffre d'affaires
                                    </h3>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        <Tile
                                            label="CA total"
                                            value={fmtEur(current.totalRevenue)}
                                            sub={`${current.dealsWithValueCount} deal${current.dealsWithValueCount > 1 ? "s" : ""} valorisé${current.dealsWithValueCount > 1 ? "s" : ""}`}
                                            tone="success"
                                        />
                                        <Tile
                                            label="Prix moyen"
                                            value={fmtEur(current.avgDealValue)}
                                            sub="Moyenne des deals closés"
                                        />
                                        <Tile
                                            label="Prix médian"
                                            value={fmtEur(current.medianDealValue)}
                                            sub="50% des deals sont en dessous"
                                        />
                                        <Tile
                                            label="Fourchette"
                                            value={current.minDealValue === current.maxDealValue
                                                ? fmtEur(current.minDealValue)
                                                : `${fmtEur(current.minDealValue).replace(" €", "")} – ${fmtEur(current.maxDealValue)}`}
                                            sub="Min – Max"
                                        />
                                    </div>

                                    <Panel>
                                        <PanelLabel hint={`${current.dealsWithValueCount} point${current.dealsWithValueCount > 1 ? "s" : ""}`}>
                                            Cumul CA dans le temps
                                        </PanelLabel>
                                        <PriceChart timeline={current.dealTimeline} />
                                    </Panel>

                                    {current.dealDistribution && current.dealDistribution.length > 0 && (
                                        <Panel>
                                            <PanelLabel>Distribution par tranche de prix</PanelLabel>
                                            <DistributionBars distribution={current.dealDistribution} />
                                        </Panel>
                                    )}
                                </div>
                            )}

                            {view === "total" && statsPerWs.length > 1 && (
                                <div className="space-y-4">
                                    <h3 className="text-[18px] font-semibold tracking-tight text-foreground">
                                        Par espace
                                    </h3>
                                    <div className="rounded-xl overflow-hidden border border-border/40">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="border-b border-border/50 bg-background">
                                                    <th className="text-left px-4 py-3 text-[11px] uppercase tracking-[0.06em] text-muted-foreground font-medium">Espace</th>
                                                    <th className="text-right px-4 py-3 text-[11px] uppercase tracking-[0.06em] text-muted-foreground font-medium">Leads</th>
                                                    <th className="text-right px-4 py-3 text-[11px] uppercase tracking-[0.06em] text-muted-foreground font-medium hidden sm:table-cell">Actifs</th>
                                                    <th className="text-right px-4 py-3 text-[11px] uppercase tracking-[0.06em] text-muted-foreground font-medium">Gagnés</th>
                                                    <th className="text-right px-4 py-3 text-[11px] uppercase tracking-[0.06em] text-muted-foreground font-medium hidden sm:table-cell">Conversion</th>
                                                    <th className="text-right px-4 py-3 text-[11px] uppercase tracking-[0.06em] text-muted-foreground font-medium hidden md:table-cell">Délai contact</th>
                                                    <th className="text-right px-4 py-3 text-[11px] uppercase tracking-[0.06em] text-muted-foreground font-medium hidden md:table-cell">Notes</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {statsPerWs.map(({ ws, stats }, i) => (
                                                    <tr
                                                        key={ws.id}
                                                        className={`border-b border-border/30 last:border-0 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors ${
                                                            i % 2 === 1 ? "bg-[#FAFAFA] dark:bg-white/[0.03]" : "bg-background"
                                                        }`}
                                                    >
                                                        <td className="px-4 py-3">
                                                            <span className="font-semibold text-foreground">{ws.name}</span>
                                                            {ws.sector && (
                                                                <span className="ml-2 text-xs text-muted-foreground font-normal">{ws.sector}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 text-right tabular-nums font-medium">{stats.total}</td>
                                                        <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell text-muted-foreground">{stats.active}</td>
                                                        <td className="px-4 py-3 text-right tabular-nums font-medium">
                                                            <span className={stats.won > 0 ? "text-emerald-700 dark:text-emerald-400" : ""}>
                                                                {stats.won}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell">
                                                            <span className={
                                                                stats.conversionRate != null && stats.conversionRate >= 30
                                                                    ? "text-emerald-700 dark:text-emerald-400 font-medium"
                                                                    : "text-foreground/80"
                                                            }>
                                                                {pct(stats.conversionRate)}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell text-muted-foreground text-xs">{formatDuration(stats.avgTimeToContact)}</td>
                                                        <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell text-muted-foreground">{stats.totalNotes}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Timing & vélocité ── */}
                    {tab === "timing" && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <Tile
                                label="Délai moyen avant contact"
                                value={formatDuration(current.avgTimeToContact)}
                                sub="De 'Nouveau' au premier appel"
                            />
                            <Tile
                                label="Durée moy. dans le pipeline"
                                value={formatDuration(current.avgPipelineDuration)}
                                sub="Leads actifs uniquement"
                            />
                            <Tile
                                label="Durée moy. pour closer"
                                value={formatDuration(current.avgClosingDuration)}
                                sub="De création à 'Gagné'"
                            />
                        </div>
                    )}

                    {/* ── Téléphonie ── */}
                    {tab === "calls" && (
                        <CallStatsSection callStats={callStats} />
                    )}
                </div>
            ) : (
                <div className="rounded-xl bg-[#FAFAFA] dark:bg-white/[0.04] p-10 text-center">
                    <BarChart3 size={24} className="mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">
                        {current?.total === 0
                            ? "Cet espace n'a pas encore de leads. Les statistiques apparaîtront ici."
                            : "Aucune donnée disponible."}
                    </p>
                </div>
            )}
        </div>
    );
};
