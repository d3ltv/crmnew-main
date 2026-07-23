/**
 * Logos d'entreprise — Clearbit + fallback favicon Google.
 * Ignore les domaines d'agrégateurs d'annonces (HelloWork, Indeed…)
 * pour afficher le vrai logo de l'entreprise, pas celui de la source.
 */

/** Sites d'annonces / réseaux — ne jamais utiliser pour le logo entreprise */
export const AGGREGATOR_DOMAINS = [
    // Job boards FR / EU
    "hellowork.com", "hellowork.fr", "f.hellowork.com",
    "indeed.com", "indeed.fr",
    "apec.fr", "apec.com",
    "pole-emploi.fr", "francetravail.fr", "candidat.francetravail.fr",
    "regionsjob.com", "cadremploi.fr", "optioncarriere.com",
    "meteojob.com", "jobteaser.com", "welcometothejungle.com", "wttj.co",
    "monster.fr", "monster.com", "stepstone.fr", "stepstone.com",
    "glassdoor.com", "glassdoor.fr", "jooble.org", "simplyhired.com",
    "leboncoin.fr", "emploi.leboncoin.fr",
    "linkedin.com", "fr.linkedin.com",
    // Recherche / maps (souvent dans les CSV scrapés)
    "google.com", "google.fr", "maps.google.com", "maps.google.fr",
    "bing.com", "duckduckgo.com",
    // Social
    "facebook.com", "twitter.com", "x.com", "instagram.com",
    "youtube.com", "tiktok.com",
];

const GENERIC_EMAIL_DOMAINS = [
    "gmail.com", "yahoo.com", "yahoo.fr", "hotmail.com", "outlook.com",
    "live.com", "icloud.com", "me.com", "aol.com", "wanadoo.fr",
    "orange.fr", "free.fr", "laposte.net", "sfr.fr", "bbox.fr",
    "protonmail.com", "proton.me", "mail.com",
];

export function isAggregatorDomain(domain) {
    if (!domain) return true;
    const d = domain.toLowerCase().replace(/^www\./, "");
    return AGGREGATOR_DOMAINS.some(
        (bd) => d === bd || d.endsWith("." + bd)
    );
}

/**
 * Extrait un domaine "propre" depuis une URL ou un email.
 * @returns {string|null}
 */
export function extractDomain(website, email) {
    if (website) {
        try {
            const raw = String(website).trim();
            // Ignore les valeurs non-URL évidentes
            if (raw && (raw.includes(".") || /^https?:\/\//i.test(raw))) {
                const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
                const url = new URL(withProto);
                const host = url.hostname.replace(/^www\./i, "").toLowerCase();
                if (host && host.includes(".") && !host.startsWith("localhost")) {
                    return host;
                }
            }
        } catch {
            // URL invalide
        }
    }

    if (email) {
        const parts = String(email).trim().split("@");
        if (parts.length === 2) {
            const domain = parts[1].toLowerCase().replace(/^www\./i, "");
            if (!GENERIC_EMAIL_DOMAINS.includes(domain) && domain.includes(".")) {
                return domain;
            }
        }
    }

    return null;
}

/**
 * Trouve le domaine de l'entreprise (pas celui de l'annonce).
 * Priorité : email pro → site web non-agrégateur → URLs dans extra/customFields.
 */
export function findCompanyDomain(leadOrParts = {}) {
    const website = leadOrParts.website;
    const email = leadOrParts.email;
    const extra = leadOrParts.extra || {};
    const customFields = leadOrParts.customFields || [];

    // 1. Email pro = meilleur signal d'identité entreprise
    const fromEmail = extractDomain(null, email);
    if (fromEmail && !isAggregatorDomain(fromEmail)) return fromEmail;

    // 2. Site web s'il n'est pas une plateforme d'annonces
    const fromWeb = extractDomain(website, null);
    if (fromWeb && !isAggregatorDomain(fromWeb)) return fromWeb;

    // 3. Scanner extra + customFields pour un vrai site entreprise
    const candidates = [];
    const push = (label, value) => {
        if (!value) return;
        const s = String(value).trim();
        if (!s) return;
        const looksUrl = /^https?:\/\//i.test(s) || /^www\./i.test(s) || /\.[a-z]{2,}([/?#]|$)/i.test(s);
        const looksSiteLabel = /site|web|url|domaine|domain|homepage|entreprise/i.test(label || "");
        if (looksUrl || looksSiteLabel) candidates.push(s);
    };

    for (const [k, v] of Object.entries(extra)) push(k, v);
    for (const f of customFields) push(f?.label, f?.value);

    for (const c of candidates) {
        const d = extractDomain(c, null);
        if (d && !isAggregatorDomain(d)) return d;
    }

    return null;
}

export function clearbitLogoUrl(domain) {
    return `https://logo.clearbit.com/${domain}`;
}

export function googleFaviconUrl(domain) {
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}

/**
 * URL logo à stocker / afficher pour un lead.
 * Accepte (website, email) legacy ou un objet lead-like.
 */
export function resolveLogo(websiteOrLead, email) {
    let domain = null;
    if (websiteOrLead && typeof websiteOrLead === "object") {
        domain = findCompanyDomain(websiteOrLead);
    } else {
        domain = findCompanyDomain({ website: websiteOrLead, email });
    }
    if (!domain) return null;
    return clearbitLogoUrl(domain);
}

/** True si une URL logo pointe vers un agrégateur (à ignorer à l'affichage). */
export function isAggregatorLogoUrl(logoUrl) {
    if (!logoUrl) return false;
    try {
        const m = String(logoUrl).match(/logo\.clearbit\.com\/([^/?#]+)/i)
            || String(logoUrl).match(/[?&]domain=([^&]+)/i);
        if (!m) return false;
        return isAggregatorDomain(decodeURIComponent(m[1]));
    } catch {
        return false;
    }
}
