import React, { useState, useMemo, useEffect } from "react";
import {
    findCompanyDomain,
    clearbitLogoUrl,
    googleFaviconUrl,
    isAggregatorLogoUrl,
} from "@/lib/logoUtils";

const AVATAR_HUES = [
    "bg-blue-500/12 text-blue-700 dark:text-blue-300",
    "bg-sky-500/12 text-sky-700 dark:text-sky-300",
    "bg-teal-500/12 text-teal-700 dark:text-teal-300",
    "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
    "bg-violet-500/12 text-violet-700 dark:text-violet-300",
    "bg-amber-500/12 text-amber-800 dark:text-amber-300",
    "bg-rose-500/12 text-rose-700 dark:text-rose-300",
    "bg-indigo-500/12 text-indigo-700 dark:text-indigo-300",
];

function hashId(id = "") {
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) {
        h ^= id.charCodeAt(i);
        h = (h * 16777619) >>> 0;
    }
    return h;
}

function initialsFromLead(lead) {
    const raw = (lead?.company || lead?.contact || "?").trim();
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return raw.slice(0, 2).toUpperCase() || "?";
}

/**
 * Logo entreprise (domaine réel) → favicon → initiale.
 * Ignore les logos HelloWork / Indeed / LinkedIn stockés par erreur.
 */
export const LeadAvatar = ({ lead, size, card = false, bgClass }) => {
    const [logoFailed, setLogoFailed] = useState(false);
    const [fallbackFailed, setFallbackFailed] = useState(false);

    const domain = useMemo(
        () => findCompanyDomain(lead),
        [lead.website, lead.email, lead.extra, lead.customFields]
    );

    const logoUrl = useMemo(() => {
        if (domain) return clearbitLogoUrl(domain);
        if (lead.logoUrl && !isAggregatorLogoUrl(lead.logoUrl)) return lead.logoUrl;
        return null;
    }, [domain, lead.logoUrl]);

    const fallbackUrl = domain ? googleFaviconUrl(domain) : null;

    useEffect(() => {
        setLogoFailed(false);
        setFallbackFailed(false);
    }, [logoUrl, fallbackUrl]);

    const hue = AVATAR_HUES[hashId(lead.id) % AVATAR_HUES.length];
    const well = bgClass || hue;
    const containerSize = card ? "w-7 h-7" : "w-8 h-8";
    const imgSize = card ? "w-4 h-4" : "w-5 h-5";
    const imgFbSize = card ? "w-3.5 h-3.5" : "w-4.5 h-4.5";
    const initialSize = size || (card ? "text-[10px]" : "text-[11px]");

    if (logoUrl && !logoFailed) {
        return (
            <span
                className={`shrink-0 select-none flex items-center justify-center ${containerSize} rounded-md overflow-hidden bg-white dark:bg-white/10`}
                aria-hidden
            >
                <img
                    src={logoUrl}
                    alt=""
                    className={`${imgSize} object-contain`}
                    onError={() => setLogoFailed(true)}
                    loading="lazy"
                />
            </span>
        );
    }

    if (fallbackUrl && !fallbackFailed) {
        return (
            <span
                className={`shrink-0 select-none flex items-center justify-center ${containerSize} rounded-md overflow-hidden bg-white dark:bg-white/10`}
                aria-hidden
            >
                <img
                    src={fallbackUrl}
                    alt=""
                    className={`${imgFbSize} object-contain`}
                    onError={() => setFallbackFailed(true)}
                    loading="lazy"
                />
            </span>
        );
    }

    return (
        <span
            className={`shrink-0 select-none flex items-center justify-center ${containerSize} rounded-md font-semibold tracking-tight ${well} ${initialSize}`}
            aria-hidden
        >
            {initialsFromLead(lead)}
        </span>
    );
};
