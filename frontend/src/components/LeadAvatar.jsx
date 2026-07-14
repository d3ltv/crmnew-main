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
 * 3. Emoji déterministe
 *
 * @param {object} lead   - objet lead (besoin de .id, .logoUrl, .website, .email)
 * @param {string} size   - classe Tailwind de taille (défaut: "text-[20px]")
 * @param {boolean} card  - vrai si affiché sur la carte (taille réduite)
 */
export const LeadAvatar = ({ lead, size, card = false }) => {
    const [logoFailed, setLogoFailed] = useState(false);
    const [fallbackFailed, setFallbackFailed] = useState(false);

    const logoUrl = lead.logoUrl;
    const domain = !logoFailed && !logoUrl
        ? extractDomain(lead.website, lead.email)
        : null;
    const fallbackUrl = domain ? googleFaviconUrl(domain) : null;

    // Si on a un logo Clearbit valide
    if (logoUrl && !logoFailed) {
        return (
            <span
                className={`shrink-0 select-none flex items-center justify-center ${card ? "w-6 h-6" : "w-9 h-9"} rounded-lg overflow-hidden bg-white`}
                aria-hidden
            >
                <img
                    src={logoUrl}
                    alt=""
                    className={`${card ? "w-5 h-5" : "w-8 h-8"} object-contain`}
                    onError={() => setLogoFailed(true)}
                    loading="lazy"
                />
            </span>
        );
    }

    // Fallback : Google Favicon
    if (fallbackUrl && !fallbackFailed) {
        return (
            <span
                className={`shrink-0 select-none flex items-center justify-center ${card ? "w-6 h-6" : "w-9 h-9"} rounded-lg overflow-hidden bg-white`}
                aria-hidden
            >
                <img
                    src={fallbackUrl}
                    alt=""
                    className={`${card ? "w-4 h-4" : "w-7 h-7"} object-contain`}
                    onError={() => setFallbackFailed(true)}
                    loading="lazy"
                />
            </span>
        );
    }

    // Dernier fallback : emoji
    return (
        <span
            className={`shrink-0 select-none leading-none ${size || (card ? "text-[18px]" : "text-[28px]")}`}
            aria-hidden
        >
            {pickEmoji(lead.id)}
        </span>
    );
};
