import React, { useState } from "react";
import { googleFaviconUrl, extractDomain } from "@/lib/logoUtils";

// Emojis repère visuel — même liste que LeadCard
const LEAD_EMOJIS = [
    "🏢","🏗","🏬","🏭","🏦","🏨","🏪","🏫","🏛","🏟",
    "🔧","⚡","🛠","🔩","⚙️","🔌","💻","📱","🖥","🖨",
    "🌿","🏔","🌸","🦋","🌻","🍀","🌴","🌵",
    "🌾","🍃","🌺","🌹","🦚","🦜","🐬","🦁","🐯","🦊",
    "🚀","💡","🔑","🎯","🔮","🎪","🎨","🎭","🎬","🎤",
    "🏆","🥇","🎗","🎁","🎊","✨",
    "🔵","🟢","🟡","🟠","🔴","🟣","⚫","🟤","🔶","🔷",
    "🟦","🟩","🟨","🟧","🟥","🟪","⬛","🟫","💠","🔹",
    "🍎","🍋","🍇","🍓","🥝","🌶","🧁","☕","🍵","🧃",
    "✈️","🚢","🚂","🚁","🛸","🚗","🏎","⛵",
    "🌙","⭐","🌟","💫","☀️","🌈","❄️","🔥","💧","🌊",
    "💎","🔐","📦","📋","📌","📎","🗂","📊","📈","🧩",
    "🧲","🧪","🔭","🗺","🧭","⏱","🕰","📡","🛡","⚔️",
];

function pickEmoji(id = "") {
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) {
        h ^= id.charCodeAt(i);
        h = (h * 16777619) >>> 0;
    }
    return LEAD_EMOJIS[h % LEAD_EMOJIS.length];
}

/**
 * Affiche le logo d'une entreprise avec fallback progressif :
 * 1. logoUrl stocké sur le lead (Clearbit)
 * 2. Google Favicon (si le domaine est récupérable)
 * 3. Emoji déterministe dans un cercle coloré (couleur de la colonne)
 *
 * @param {object} lead   - objet lead (.id, .logoUrl, .website, .email)
 * @param {string} size   - classe Tailwind de taille emoji (défaut auto)
 * @param {boolean} card  - vrai si affiché sur la carte (taille réduite)
 * @param {string} bgClass - classe Tailwind de fond pour le cercle emoji (ex: "bg-blue-500/15")
 */
export const LeadAvatar = ({ lead, size, card = false, bgClass = "bg-muted" }) => {
    const [logoFailed, setLogoFailed] = useState(false);
    const [fallbackFailed, setFallbackFailed] = useState(false);

    const logoUrl = lead.logoUrl;
    const domain = !logoFailed && !logoUrl
        ? extractDomain(lead.website, lead.email)
        : null;
    const fallbackUrl = domain ? googleFaviconUrl(domain) : null;

    const containerSize = card ? "w-8 h-8" : "w-9 h-9";
    const imgSize      = card ? "w-6 h-6" : "w-8 h-8";
    const imgFbSize    = card ? "w-5 h-5" : "w-7 h-7";

    // Logo Clearbit
    if (logoUrl && !logoFailed) {
        return (
            <span
                className={`shrink-0 select-none flex items-center justify-center ${containerSize} rounded-full overflow-hidden ${bgClass}`}
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

    // Fallback Google Favicon
    if (fallbackUrl && !fallbackFailed) {
        return (
            <span
                className={`shrink-0 select-none flex items-center justify-center ${containerSize} rounded-full overflow-hidden ${bgClass}`}
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

    // Emoji dans un cercle coloré
    return (
        <span
            className={`shrink-0 select-none flex items-center justify-center ${containerSize} rounded-full ${bgClass}`}
            aria-hidden
        >
            <span className={size || (card ? "text-[15px]" : "text-[22px]")} style={{ lineHeight: 1 }}>
                {pickEmoji(lead.id)}
            </span>
        </span>
    );
};
