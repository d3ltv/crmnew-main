// Small, dependency-free CSV parser + column auto-detector.
// Handles: double-quoted fields, escaped quotes ("" -> "), commas & semicolons,
// CRLF / LF line endings. Not a full RFC 4180 parser, but robust for MVP.
import { resolveLogo } from "./logoUtils";

export function parseCsv(text) {
    if (!text) return { headers: [], rows: [] };
    // Detect delimiter — comma or semicolon (most common in FR exports).
    const firstLine = text.split(/\r?\n/)[0] || "";
    const delimiter =
        (firstLine.match(/;/g) || []).length >
        (firstLine.match(/,/g) || []).length
            ? ";"
            : ",";

    const rows = [];
    let field = "";
    let row = [];
    let inQuotes = false;

    const pushField = () => {
        row.push(field);
        field = "";
    };
    const pushRow = () => {
        rows.push(row);
        row = [];
    };

    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += c;
            }
        } else {
            if (c === '"') {
                inQuotes = true;
            } else if (c === delimiter) {
                pushField();
            } else if (c === "\n") {
                pushField();
                pushRow();
            } else if (c === "\r") {
                // handled with \n
            } else {
                field += c;
            }
        }
    }
    // flush last field/row
    if (field.length > 0 || row.length > 0) {
        pushField();
        pushRow();
    }

    // First row = headers
    const headers = (rows.shift() || []).map((h) => (h || "").trim());
    // Filter empty rows
    const dataRows = rows
        .filter((r) => r.some((c) => (c || "").trim() !== ""))
        .map((r) => {
            // pad to headers length
            const padded = [...r];
            while (padded.length < headers.length) padded.push("");
            return padded.map((c) => (c ?? "").trim());
        });
    return { headers, rows: dataRows };
}

// Normalise une chaîne : minuscules + suppression des accents
function normalize(str) {
    return (str || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}

const FIELD_HINTS = {
    company: [
        // Français
        "société", "societe", "entreprise", "organisation", "raison sociale",
        "nom entreprise", "nom de l'entreprise", "nom société",
        // Anglais — générique
        "company", "company name", "org", "organization", "organisation name",
        "account", "account name", "business", "business name", "firm",
        // Anglais — exports courants (LinkedIn, Apollo, HubSpot, Salesforce…)
        "company_name", "companyname", "employer", "workplace",
    ],
    phone: [
        // Français
        "téléphone", "telephone", "tel", "mobile", "portable", "numéro", "numero",
        "tél", "n° tel", "num tel",
        // Anglais
        "phone", "phone number", "phone_number", "phonenumber",
        "mobile phone", "mobile_phone", "cell", "cell phone", "cellular",
        "direct phone", "work phone", "office phone", "contact phone",
        "number", "call",
    ],
    website: [
        // Français
        "site", "site web", "siteweb", "domaine",
        // Anglais
        "website", "web", "url", "website url", "web url", "website_url",
        "homepage", "domain", "company url", "company_url", "company website",
        "linkedin url", "linkedin_url", "profile url",
    ],
    email: [
        // Français
        "email", "mail", "e-mail", "courriel", "adresse mail", "adresse email",
        // Anglais
        "email address", "email_address", "emailaddress",
        "work email", "work_email", "professional email",
        "contact email", "e mail", "electronic mail",
    ],
    contact: [
        // Français
        "contact", "prénom", "prenom", "personne", "interlocuteur",
        "nom contact", "prénom contact", "nom complet",
        // Anglais
        "full name", "full_name", "fullname", "contact name",
        "person", "person name",
        "person_name", "lead name", "prospect name", "owner name",
    ],
};

// Colonnes reconnues mais non mappées aux champs principaux →
// renommées en français dans les champs "extra" de la carte.
// Clé = pattern (lowercase), valeur = libellé français affiché.
export const HEADER_TRANSLATIONS = {
    // Identité contact
    "first_name":           "Prénom",
    "firstname":            "Prénom",
    "first name":           "Prénom",
    "last_name":            "Nom",
    "lastname":             "Nom",
    "last name":            "Nom",
    "nom":                  "Nom",
    "job_title":            "Poste",
    "jobtitle":             "Poste",
    "job title":            "Poste",
    "title":                "Titre",
    "position":             "Poste",
    "role":                 "Rôle",
    "fonction":             "Fonction",

    // Entreprise
    "sector":               "Secteur",
    "secteur":              "Secteur",
    "industry":             "Secteur",
    "industrie":            "Industrie",
    "size":                 "Taille",
    "taille":               "Taille",
    "employees":            "Effectif",
    "effectif":             "Effectif",
    "headcount":            "Effectif",
    "siren":                "SIREN",
    "siret":                "SIRET",
    "vat":                  "TVA",
    "tva":                  "TVA",

    // Localisation
    "location":             "Localisation",
    "localisation":         "Localisation",
    "adresse":              "Adresse",
    "address":              "Adresse",
    "city":                 "Ville",
    "ville":                "Ville",
    "zip":                  "Code postal",
    "postal_code":          "Code postal",
    "code postal":          "Code postal",
    "country":              "Pays",
    "pays":                 "Pays",
    "region":               "Région",
    "département":          "Département",
    "departement":          "Département",

    // Réseaux sociaux
    "linkedin_contact":     "LinkedIn contact",
    "linkedin contact":     "LinkedIn contact",
    "linkedin_entreprise":  "LinkedIn entreprise",
    "linkedin entreprise":  "LinkedIn entreprise",
    "linkedin":             "LinkedIn",
    "linkedin_url":         "LinkedIn",
    "facebook_entreprise":  "Facebook",
    "facebook":             "Facebook",
    "twitter":              "Twitter",
    "twitter_entreprise":   "Twitter",
    "instagram":            "Instagram",
    "instagram_entreprise": "Instagram",

    // Scores / données enrichies
    "score":                "Score",
    "ai_score_boost":       "Score IA",
    "rating":               "Note",
    "priority":             "Priorité",
    "priorité":             "Priorité",

    // Divers
    "description":          "Description",
    "notes":                "Notes",
    "comment":              "Commentaire",
    "commentaire":          "Commentaire",
    "source":               "Source",
    "origine":              "Origine",
    "tags":                 "Tags",
    "status":               "Statut",
    "statut":               "Statut",
    "created_at":           "Créé le",
    "updated_at":           "Modifié le",
    "date":                 "Date",
};

export function autoDetectMapping(headers) {
    const normalized = headers.map((h) => normalize(h));
    const map = {};
    const used = new Set();

    for (const [field, hints] of Object.entries(FIELD_HINTS)) {
        // Normaliser les hints aussi pour comparer sans accents
        const normalizedHints = hints.map(normalize);
        // 1. Exact match first
        let idx = normalized.findIndex(
            (h) => !used.has(h) && normalizedHints.some((hint) => h === hint),
        );
        // 2. Fallback: partial match
        if (idx === -1) {
            idx = normalized.findIndex(
                (h) => !used.has(h) && normalizedHints.some((hint) => h.includes(hint) || hint.includes(h)),
            );
        }
        if (idx !== -1) {
            map[field] = headers[idx];
            used.add(normalized[idx]);
        }
    }

    if (!map.company && headers.length > 0) {
        const fallback = headers.find((h) => h && !used.has(normalize(h)));
        if (fallback) map.company = fallback;
    }
    return map;
}

export function rowsToLeads(headers, rows, mapping, colMapping = {}) {
    const idx = (fieldKey) => {
        const header = mapping[fieldKey];
        if (!header) return -1;
        return headers.indexOf(header);
    };
    const iCompany = idx("company");
    const iPhone   = idx("phone");
    const iWeb     = idx("website");
    const iEmail   = idx("email");
    const iContact = idx("contact");

    // Detect first_name / last_name columns for auto-merge into contact
    const normalizedHeaders = headers.map((h) => (h || "").toLowerCase().trim());
    const iFirstName = normalizedHeaders.findIndex((h) =>
        ["first_name", "firstname", "first name", "prénom", "prenom"].includes(h)
    );
    const iLastName = normalizedHeaders.findIndex((h) =>
        ["last_name", "lastname", "last name"].includes(h)
    );

    // Columns consumed by main fields (won't appear as extras)
    const mainIndices = new Set(
        [iCompany, iPhone, iWeb, iEmail, iContact].filter((i) => i >= 0)
    );
    // If we auto-merged first+last into contact, exclude those too
    const mergedContact = iContact === -1 && (iFirstName >= 0 || iLastName >= 0);
    if (mergedContact) {
        if (iFirstName >= 0) mainIndices.add(iFirstName);
        if (iLastName  >= 0) mainIndices.add(iLastName);
    }

    // Which CSV headers are explicitly ignored by the user
    const ignoredHeaders = new Set(
        Object.entries(colMapping)
            .filter(([, v]) => v === "__none__")
            .map(([h]) => h)
    );

    return rows.map((r) => {
        const company = (iCompany >= 0 ? r[iCompany] : "").trim();

        // Build contact value
        let contactValue = iContact >= 0 ? (r[iContact] || "").trim() : "";
        if (!contactValue && mergedContact) {
            const first = iFirstName >= 0 ? (r[iFirstName] || "").trim() : "";
            const last  = iLastName  >= 0 ? (r[iLastName]  || "").trim() : "";
            contactValue = [first, last].filter(Boolean).join(" ");
        }

        const extra = {};
        headers.forEach((h, i) => {
            if (mainIndices.has(i) || !h) return;
            if (ignoredHeaders.has(h)) return; // user chose to ignore
            const v = (r[i] || "").trim();
            if (!v) return;
            // Translate header to French label
            const key = (h || "").toLowerCase().trim();
            const label = HEADER_TRANSLATIONS[key] || h;
            extra[label] = v;
        });

        // ── Fallback accent/typo : si un champ principal est vide mais qu'un
        // champ extra porte un nom similaire (sans accents), on le récupère.
        // Ex: "telephone" → phone, "e mail" → email, "societe" → company
        const FIELD_EXTRA_FALLBACKS = {
            phone:   ["telephone", "tel", "mobile", "portable", "numero", "num tel", "phone", "phone number"],
            email:   ["email", "mail", "e mail", "courriel", "adresse mail", "adresse email"],
            website: ["site", "site web", "siteweb", "website", "url", "domaine"],
            company: ["societe", "entreprise", "organisation", "company", "raison sociale"],
            contact: ["contact", "prenom", "nom contact", "full name", "fullname", "personne"],
        };

        let phone   = iPhone  >= 0 ? (r[iPhone]  || "").trim() : "";
        let website = iWeb    >= 0 ? (r[iWeb]    || "").trim() : "";
        let email   = iEmail  >= 0 ? (r[iEmail]  || "").trim() : "";
        let contact = contactValue;
        let companyFinal = company;

        // Pour chaque champ vide, chercher dans extra un équivalent sans accents
        for (const [field, patterns] of Object.entries(FIELD_EXTRA_FALLBACKS)) {
            const currentVal = field === "phone" ? phone
                : field === "email" ? email
                : field === "website" ? website
                : field === "contact" ? contact
                : companyFinal;

            if (currentVal) continue; // déjà rempli — ne pas écraser

            // Chercher dans les clés de extra
            const matchKey = Object.keys(extra).find((k) =>
                patterns.some((p) => normalize(k) === normalize(p) || normalize(k).includes(normalize(p)))
            );
            if (matchKey && extra[matchKey]) {
                const val = extra[matchKey];
                if (field === "phone")   { phone   = val; delete extra[matchKey]; }
                if (field === "email")   { email   = val; delete extra[matchKey]; }
                if (field === "website") { website = val; delete extra[matchKey]; }
                if (field === "contact") { contact = val; delete extra[matchKey]; }
                if (field === "company") { companyFinal = val; delete extra[matchKey]; }
            }
        }

        return {
            company:  companyFinal || "Sans nom — à compléter",
            phone,
            website,
            email,
            contact,
            extra,
            logoUrl:  resolveLogo(website, email),
            _incomplete: !companyFinal,
        };
    });
}

export function leadsToCsv(leads) {
    const headers = [
        "company",
        "contact",
        "phone",
        "email",
        "website",
        "status",
        "tags",
        "next_action",
        "last_contact",
        "notes",
    ];
    const escape = (v) => {
        const s = String(v ?? "");
        if (/[",;\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
    };
    const lines = [headers.join(",")];
    for (const l of leads) {
        lines.push(
            [
                l.company,
                l.contact || "",
                l.phone || "",
                l.email || "",
                l.website || "",
                l._statusName || "",
                (l.tags || []).join("|"),
                l.nextAction
                    ? `${l.nextAction.date || ""} ${l.nextAction.label || ""}`.trim()
                    : "",
                l.lastContact || "",
                (l.notes || []).map((n) => n.text).join(" | "),
            ]
                .map(escape)
                .join(","),
        );
    }
    return lines.join("\n");
}
