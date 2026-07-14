/**
 * Utilitaires pour la détection et le chargement des logos d'entreprise.
 * Utilise Clearbit Logo API (gratuit, sans clé) : https://logo.clearbit.com/{domain}
 * Fallback sur Google Favicon API si Clearbit échoue.
 */

/**
 * Extrait un domaine "propre" depuis une URL, un email, ou un nom d'entreprise.
 * @param {string} website - URL du site (ex: "https://acme.com", "www.acme.com")
 * @param {string} email   - Email (ex: "contact@acme.com")
 * @returns {string|null}  - domaine (ex: "acme.com") ou null
 */
export function extractDomain(website, email) {
    // 1. Depuis l'URL du site
    if (website) {
        try {
            const raw = website.trim();
            const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
            const url = new URL(withProto);
            const host = url.hostname.replace(/^www\./i, "").toLowerCase();
            if (host && host.includes(".") && !host.startsWith("localhost")) {
                return host;
            }
        } catch {
            // URL invalide — continuer
        }
    }

    // 2. Depuis l'email
    if (email) {
        const parts = email.trim().split("@");
        if (parts.length === 2) {
            const domain = parts[1].toLowerCase().replace(/^www\./i, "");
            // Ignorer les domaines email génériques
            const GENERIC = [
                "gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
                "live.com", "icloud.com", "me.com", "aol.com", "wanadoo.fr",
                "orange.fr", "free.fr", "laposte.net", "sfr.fr", "bbox.fr",
            ];
            if (!GENERIC.includes(domain) && domain.includes(".")) {
                return domain;
            }
        }
    }

    return null;
}

/**
 * Construit l'URL du logo Clearbit pour un domaine donné.
 * @param {string} domain
 * @returns {string}
 */
export function clearbitLogoUrl(domain) {
    return `https://logo.clearbit.com/${domain}`;
}

/**
 * Construit l'URL favicon Google comme fallback.
 * @param {string} domain
 * @returns {string}
 */
export function googleFaviconUrl(domain) {
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

/**
 * Détermine l'URL du logo à stocker sur le lead, depuis website et/ou email.
 * Retourne null si aucun domaine détectable.
 * @param {string} website
 * @param {string} email
 * @returns {string|null}
 */
export function resolveLogo(website, email) {
    const domain = extractDomain(website, email);
    if (!domain) return null;
    return clearbitLogoUrl(domain);
}
