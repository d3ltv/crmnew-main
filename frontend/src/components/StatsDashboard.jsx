import React, { useMemo, useState } from "react";
import { useCrm } from "@/context/CrmContext";
import { computeWorkspaceStats, aggregateStats, formatDuration } from "@/lib/statsUtils";
import {
    Users, TrendingUp, TrendingDown, Clock, CheckCircle2,
    XCircle, MessageSquare, AlertTriangle, Activity, Timer,
    BarChart3, ChevronDown, Trophy, Euro,
} from "lucide-react";

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

// ---------- SVG Line Chart (style courbe boursière) ----------
const PriceChart = ({ timeline }) => {
    const [hovered, setHovered] = useState(null);

    if (!timeline || timeline.length === 0) {
        return (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground italic">
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

    // Path data
    const points = timeline.map((p, i) => ({ x: xScale(i), y: yScale(p.cumul), ...p }));
    const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(PAD.top + innerH).toFixed(1)} L ${PAD.left.toFixed(1)} ${(PAD.top + innerH).toFixed(1)} Z`;

    // Y axis labels (3 ticks)
    const yTicks = [0, 0.5, 1].map((t) => ({
        v: minV + t * (maxV - minV),
        y: yScale(minV + t * (maxV - minV)),
    }));

    // X axis labels — show first, last, and a few middle ones
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
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.18" />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
                    </linearGradient>
                    <clipPath id="chartClip">
                        <rect x={PAD.left} y={PAD.top} width={innerW} height={innerH + 1} />
                    </clipPath>
                </defs>

                {/* Grid lines */}
                {yTicks.map((t, i) => (
                    <line
                        key={i}
                        x1={PAD.left} y1={t.y}
                        x2={PAD.left + innerW} y2={t.y}
                        stroke="hsl(var(--border))" strokeWidth="1" strokeDasharray="4 4"
                    />
                ))}

                {/* Area fill */}
                <path d={areaPath} fill="url(#areaGrad)" clipPath="url(#chartClip)" />

                {/* Line */}
                <path
                    d={linePath}
                    fill="none"
                    stroke="hsl(var(--primary))"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    clipPath="url(#chartClip)"
                />

                {/* Y axis labels */}
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

                {/* X axis labels */}
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

                {/* Individual deal dots + hover zones */}
                {points.map((p, i) => (
                    <g key={i}>
                        <circle cx={p.x} cy={p.y} r="4" fill="hsl(var(--primary))" stroke="hsl(var(--background))" strokeWidth="2" />
                        {/* Invisible larger hover target */}
                        <rect
                            x={p.x - 14} y={PAD.top} width={28} height={innerH}
                            fill="transparent"
                            onMouseEnter={() => setHovered({ ...p, idx: i })}
                        />
                    </g>
                ))}

                {/* Hover tooltip */}
                {hovered && (() => {
                    const tx = Math.min(Math.max(hovered.x, PAD.left + 40), PAD.left + innerW - 40);
                    const ty = Math.max(hovered.y - 36, PAD.top + 4);
                    return (
                        <g>
                            <line x1={hovered.x} y1={PAD.top} x2={hovered.x} y2={PAD.top + innerH} stroke="hsl(var(--primary))" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
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

// ---------- Distribution bar chart ----------
const DistributionBars = ({ distribution }) => {
    if (!distribution || distribution.length === 0) return null;
    const max = Math.max(...distribution.map((b) => b.count));
    return (
        <div className="space-y-2 mt-2">
            {distribution.map((b) => (
                <div key={b.label} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-24 shrink-0 text-right">{b.label}</span>
                    <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                        <div
                            className="h-full rounded-full bg-emerald-500/70 transition-all duration-500"
                            style={{ width: `${(b.count / max) * 100}%` }}
                        />
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground w-6 text-right shrink-0">{b.count}</span>
                </div>
            ))}
        </div>
    );
};

// ---------- Sub-components ----------

/** Single KPI tile */
const Tile = ({ icon: Icon, label, value, sub, accent = false, warn = false, green = false }) => (
    <div className={`rounded-2xl border bg-card shadow-card p-4 flex flex-col gap-2 ${
        warn  ? "border-rose-500/30 bg-rose-500/5" :
        green ? "border-emerald-500/30 bg-emerald-500/5" :
        "border-border"
    }`}>
        <div className="flex items-center gap-2 text-muted-foreground">
            <Icon size={14} strokeWidth={1.75} className={warn ? "text-rose-500" : green ? "text-emerald-500" : accent ? "text-primary" : ""} />
            <span className="text-[11px] uppercase tracking-wider font-medium">{label}</span>
        </div>
        <div className={`text-2xl font-semibold tracking-tight ${warn ? "text-rose-600 dark:text-rose-400" : green ? "text-emerald-600 dark:text-emerald-400" : accent ? "text-primary" : ""}`}>
            {value}
        </div>
        {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
);

/** Horizontal bar chart for column distribution */
const ColumnBar = ({ byColumn }) => {
    const total = byColumn.reduce((s, c) => s + c.count, 0);
    if (total === 0) return <p className="text-xs text-muted-foreground italic">Aucun lead</p>;
    return (
        <div className="space-y-2">
            {byColumn.filter((c) => c.count > 0).map((c) => {
                const pctVal = (c.count / total) * 100;
                return (
                    <div key={c.id || c.name} className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-28 truncate shrink-0">{c.name}</span>
                        <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                            <div className="h-full rounded-full bg-primary/70 transition-all duration-500" style={{ width: `${pctVal}%` }} />
                        </div>
                        <span className="text-xs tabular-nums text-muted-foreground w-8 text-right shrink-0">{c.count}</span>
                    </div>
                );
            })}
        </div>
    );
};

/** Section wrapper */
const Section = ({ title, children }) => (
    <div className="space-y-3">
        <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{title}</h3>
        {children}
    </div>
);

// ---------- Main component ----------
export const StatsDashboard = () => {
    const { state } = useCrm();
    const workspaces = state.order.map((id) => state.workspaces[id]).filter(Boolean);
    const [view, setView] = useState("total"); // "total" | workspace id

    const statsPerWs = useMemo(
        () => workspaces.map((ws) => ({ ws, stats: computeWorkspaceStats(ws) })),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [state.workspaces]
    );

    const totalStats = useMemo(
        () => aggregateStats(statsPerWs.map((s) => s.stats)),
        [statsPerWs]
    );

    const current = view === "total"
        ? totalStats
        : statsPerWs.find((s) => s.ws.id === view)?.stats || null;

    if (!workspaces.length) return null;

    return (
        <div className="space-y-6">
            {/* Header + view switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
                        <BarChart3 size={18} className="text-primary" />
                        Tableau de bord
                    </h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Vue d'ensemble de votre activité commerciale
                    </p>
                </div>

                {/* View selector */}
                <div className="relative">
                    <select
                        value={view}
                        onChange={(e) => setView(e.target.value)}
                        className="appearance-none h-10 pl-4 pr-9 rounded-full bg-secondary border border-border text-sm font-medium text-foreground cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary"
                        aria-label="Choisir la vue des statistiques"
                    >
                        <option value="total">Tous les espaces</option>
                        {workspaces.map((ws) => (
                            <option key={ws.id} value={ws.id}>{ws.name}</option>
                        ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
            </div>

            {current && current.total > 0 ? (
                <div className="space-y-6">
                    {/* KPI grid */}
                    <Section title="Vue d'ensemble">
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                            <Tile
                                icon={Users}
                                label="Total leads"
                                value={current.total}
                                sub={`${current.active} actif${current.active > 1 ? "s" : ""}`}
                            />
                            <Tile
                                icon={CheckCircle2}
                                label="Taux de conversion"
                                value={pct(current.conversionRate)}
                                sub={`${current.won} gagné${current.won > 1 ? "s" : ""}`}
                                accent
                            />
                            <Tile
                                icon={XCircle}
                                label="Taux de perte"
                                value={pct(current.lostRate)}
                                sub={`${current.lost} perdu${current.lost > 1 ? "s" : ""}`}
                            />
                            <Tile
                                icon={MessageSquare}
                                label="Notes totales"
                                value={current.totalNotes}
                                sub={`Dernière activité ${relativeDate(current.lastActivityAt)}`}
                            />
                        </div>
                    </Section>

                    {/* Timing KPIs */}
                    <Section title="Timing & vélocité">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <Tile
                                icon={Clock}
                                label="Délai moyen avant contact"
                                value={formatDuration(current.avgTimeToContact)}
                                sub="De 'Nouveau' au premier appel"
                            />
                            <Tile
                                icon={Timer}
                                label="Durée moy. dans le pipeline"
                                value={formatDuration(current.avgPipelineDuration)}
                                sub="Leads actifs uniquement"
                            />
                            <Tile
                                icon={TrendingUp}
                                label="Durée moy. pour closer"
                                value={formatDuration(current.avgClosingDuration)}
                                sub="De création à 'Gagné'"
                                accent
                            />
                        </div>
                    </Section>

                    {/* Pipeline distribution + alerts */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Section title="Distribution par colonne">
                            <div className="rounded-2xl border border-border bg-card shadow-card p-4">
                                <ColumnBar byColumn={current.byColumn} />
                            </div>
                        </Section>

                        <Section title="Alertes & qualité">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <Tile
                                    icon={AlertTriangle}
                                    label="Rappels en retard"
                                    value={current.overdueFollowups || 0}
                                    sub="À traiter en priorité"
                                    warn={current.overdueFollowups > 0}
                                />
                                <Tile
                                    icon={Activity}
                                    label="Sans coordonnées"
                                    value={current.noContact || 0}
                                    sub="Leads sans tél / email / site"
                                    warn={current.noContact > 0}
                                />
                                <Tile
                                    icon={TrendingDown}
                                    label="Leads perdus"
                                    value={current.lost}
                                    sub={pct(current.lostRate)}
                                />
                                <Tile
                                    icon={Users}
                                    label="Pipeline actif"
                                    value={current.active}
                                    sub={`${pct(current.total > 0 ? (current.active / current.total) * 100 : null)} du total`}
                                />
                            </div>
                        </Section>
                    </div>

                    {/* Revenue & pricing section */}
                    {current.dealsWithValueCount > 0 && (
                        <Section title="Chiffre d'affaires & prix de closing">
                            {/* KPI tiles */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <Tile
                                    icon={Trophy}
                                    label="CA total"
                                    value={fmtEur(current.totalRevenue)}
                                    sub={`${current.dealsWithValueCount} deal${current.dealsWithValueCount > 1 ? "s" : ""} valorisé${current.dealsWithValueCount > 1 ? "s" : ""}`}
                                    green
                                />
                                <Tile
                                    icon={Euro}
                                    label="Prix moyen"
                                    value={fmtEur(current.avgDealValue)}
                                    sub="Moyenne des deals closés"
                                    accent
                                />
                                <Tile
                                    icon={Euro}
                                    label="Prix médian"
                                    value={fmtEur(current.medianDealValue)}
                                    sub="50% des deals sont en dessous"
                                />
                                <Tile
                                    icon={TrendingUp}
                                    label="Fourchette"
                                    value={current.minDealValue === current.maxDealValue
                                        ? fmtEur(current.minDealValue)
                                        : `${fmtEur(current.minDealValue).replace(" €", "")} – ${fmtEur(current.maxDealValue)}`}
                                    sub="Min – Max"
                                />
                            </div>

                            {/* Cumulative revenue chart */}
                            <div className="rounded-2xl border border-border bg-card shadow-card p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                        Cumul CA dans le temps
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        {current.dealsWithValueCount} point{current.dealsWithValueCount > 1 ? "s" : ""}
                                    </span>
                                </div>
                                <PriceChart timeline={current.dealTimeline} />
                            </div>

                            {/* Distribution par tranche */}
                            {current.dealDistribution && current.dealDistribution.length > 0 && (
                                <div className="rounded-2xl border border-border bg-card shadow-card p-4">
                                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                        Distribution par tranche de prix
                                    </span>
                                    <DistributionBars distribution={current.dealDistribution} />
                                </div>
                            )}
                        </Section>
                    )}

                    {/* Per-workspace breakdown (total view only) */}
                    {view === "total" && statsPerWs.length > 1 && (
                        <Section title="Par espace">
                            <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-border surface-2">
                                            <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Espace</th>
                                            <th className="text-right px-4 py-3 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Leads</th>
                                            <th className="text-right px-4 py-3 text-[11px] uppercase tracking-wider text-muted-foreground font-medium hidden sm:table-cell">Actifs</th>
                                            <th className="text-right px-4 py-3 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Gagnés</th>
                                            <th className="text-right px-4 py-3 text-[11px] uppercase tracking-wider text-muted-foreground font-medium hidden sm:table-cell">Conversion</th>
                                            <th className="text-right px-4 py-3 text-[11px] uppercase tracking-wider text-muted-foreground font-medium hidden md:table-cell">Délai contact</th>
                                            <th className="text-right px-4 py-3 text-[11px] uppercase tracking-wider text-muted-foreground font-medium hidden md:table-cell">Notes</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {statsPerWs.map(({ ws, stats }) => (
                                            <tr key={ws.id} className="border-b border-border/50 last:border-0 hover:bg-secondary/40 transition-colors">
                                                <td className="px-4 py-3 font-medium">
                                                    {ws.name}
                                                    {ws.sector && <span className="ml-2 text-xs text-muted-foreground font-normal">{ws.sector}</span>}
                                                </td>
                                                <td className="px-4 py-3 text-right tabular-nums">{stats.total}</td>
                                                <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell text-muted-foreground">{stats.active}</td>
                                                <td className="px-4 py-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400 font-medium">{stats.won}</td>
                                                <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell">
                                                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                                                        stats.conversionRate === null ? "text-muted-foreground"
                                                        : stats.conversionRate >= 30 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                                        : stats.conversionRate >= 10 ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                                                        : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                                                    }`}>
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
                        </Section>
                    )}
                </div>
            ) : (
                <div className="rounded-2xl border border-dashed border-border p-8 text-center">
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
