// Column color palette — semantic colors with light + dark mode support.
// Light : fond de colonne coloré bien visible (100/70), cartes blanches avec ombre marquée.
// Dark  : fond de colonne neutre uniforme, couleur uniquement dans le pill header.

export const COLUMN_COLORS = {
    gray: {
        label: "Gris",
        dot: "bg-neutral-400",
        bar: "bg-neutral-400",
        chipBg: "bg-neutral-500/10",
        chipText: "text-neutral-700 dark:text-neutral-300",
        ring: "ring-neutral-400/30",
        colBg: "bg-neutral-200/70 dark:bg-[hsl(222,14%,12%)]",
        shadow: "rgba(163,163,163,0.45)",
    },
    blue: {
        label: "Bleu",
        dot: "bg-blue-500",
        bar: "bg-blue-500",
        chipBg: "bg-blue-500/10",
        chipText: "text-blue-700 dark:text-blue-300",
        ring: "ring-blue-500/30",
        colBg: "bg-blue-100/70 dark:bg-[hsl(222,14%,12%)]",
        shadow: "rgba(59,130,246,0.45)",
    },
    amber: {
        label: "Ambre",
        dot: "bg-amber-500",
        bar: "bg-amber-500",
        chipBg: "bg-amber-500/10",
        chipText: "text-amber-700 dark:text-amber-300",
        ring: "ring-amber-500/30",
        colBg: "bg-amber-100/70 dark:bg-[hsl(222,14%,12%)]",
        shadow: "rgba(245,158,11,0.45)",
    },
    violet: {
        label: "Violet",
        dot: "bg-violet-500",
        bar: "bg-violet-500",
        chipBg: "bg-violet-500/10",
        chipText: "text-violet-700 dark:text-violet-300",
        ring: "ring-violet-500/30",
        colBg: "bg-violet-100/70 dark:bg-[hsl(222,14%,12%)]",
        shadow: "rgba(139,92,246,0.45)",
    },
    sky: {
        label: "Ciel",
        dot: "bg-sky-500",
        bar: "bg-sky-500",
        chipBg: "bg-sky-500/10",
        chipText: "text-sky-700 dark:text-sky-300",
        ring: "ring-sky-500/30",
        colBg: "bg-sky-100/70 dark:bg-[hsl(222,14%,12%)]",
        shadow: "rgba(14,165,233,0.45)",
    },
    teal: {
        label: "Turquoise",
        dot: "bg-teal-500",
        bar: "bg-teal-500",
        chipBg: "bg-teal-500/10",
        chipText: "text-teal-700 dark:text-teal-300",
        ring: "ring-teal-500/30",
        colBg: "bg-teal-100/70 dark:bg-[hsl(222,14%,12%)]",
        shadow: "rgba(20,184,166,0.45)",
    },
    green: {
        label: "Vert",
        dot: "bg-emerald-500",
        bar: "bg-emerald-500",
        chipBg: "bg-emerald-500/10",
        chipText: "text-emerald-700 dark:text-emerald-300",
        ring: "ring-emerald-500/30",
        colBg: "bg-emerald-100/70 dark:bg-[hsl(222,14%,12%)]",
        shadow: "rgba(16,185,129,0.45)",
    },
    red: {
        label: "Rouge",
        dot: "bg-rose-500",
        bar: "bg-rose-500",
        chipBg: "bg-rose-500/10",
        chipText: "text-rose-700 dark:text-rose-300",
        ring: "ring-rose-500/30",
        colBg: "bg-rose-100/70 dark:bg-[hsl(222,14%,12%)]",
        shadow: "rgba(244,63,94,0.45)",
    },
    pink: {
        label: "Rose",
        dot: "bg-pink-500",
        bar: "bg-pink-500",
        chipBg: "bg-pink-500/10",
        chipText: "text-pink-700 dark:text-pink-300",
        ring: "ring-pink-500/30",
        colBg: "bg-pink-100/70 dark:bg-[hsl(222,14%,12%)]",
        shadow: "rgba(236,72,153,0.45)",
    },
};

export const COLUMN_COLOR_KEYS = Object.keys(COLUMN_COLORS);

const RULES = [
    { keys: ["gagn", "won", "closed won", "success", "signé"], color: "green" },
    { keys: ["perdu", "lost", "closed lost", "abandon", "refus"], color: "red" },
    { keys: ["nouveau", "new", "lead", "à contacter"], color: "blue" },
    { keys: ["contact", "appel", "call", "relance"], color: "amber" },
    { keys: ["rdv", "rendez", "meeting", "démo", "demo"], color: "violet" },
    { keys: ["propos", "devis", "offre", "quote", "proposal"], color: "sky" },
    { keys: ["négoc", "negoc", "négo", "nego"], color: "teal" },
    { keys: ["qualif", "discovery"], color: "pink" },
];

export function inferColumnColor(name = "") {
    const n = name.toLowerCase().trim();
    for (const r of RULES) if (r.keys.some((k) => n.includes(k))) return r.color;
    return "gray";
}

export function getColumnColor(column) {
    const key = column?.color || inferColumnColor(column?.name || "");
    return COLUMN_COLORS[key] || COLUMN_COLORS.gray;
}
