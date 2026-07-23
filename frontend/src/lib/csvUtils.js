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
        // Français — exact et variantes courantes
        "entreprise", "société", "societe", "raison sociale", "raison_sociale",
        "nom entreprise", "nom_entreprise", "nom de l'entreprise",
        "nom société", "nom_societe", "nom_société",
        "organisation", "organisme",
        // Anglais — generique
        "company", "company name", "company_name", "companyname",
        "org", "organization", "organisation name", "account", "account name",
        "account_name", "business", "business name", "business_name", "firm",
        "employer", "workplace", "corp", "corporation",
    ],
    phone: [
        // Français
        "téléphone", "telephone", "téléphone fixe", "telephone fixe",
        "tél", "tel", "tél.", "tel.", "tél direct", "tel direct",
        "mobile", "portable", "numéro", "numero", "num", "n° tel", "num tel",
        "numéro de téléphone", "numero de telephone",
        "téléphone mobile", "telephone mobile",
        // Anglais
        "phone", "phone number", "phone_number", "phonenumber",
        "mobile phone", "mobile_phone", "cell", "cell phone", "cellular",
        "direct phone", "work phone", "office phone", "contact phone",
        "landline", "fax",
    ],
    website: [
        // Français
        "site", "site web", "site_web", "siteweb", "site internet",
        "site_internet", "domaine", "url site", "adresse web", "web",
        // Anglais
        "website", "website url", "website_url", "web url", "web_url",
        "url", "homepage", "domain", "company url", "company_url",
        "company website", "company_website", "profile url", "profile_url",
        "linkedin url", "linkedin_url",
    ],
    email: [
        // Français
        "email", "e-mail", "mail", "courriel",
        "adresse email", "adresse_email", "adresse mail", "adresse_mail",
        "email professionnel", "email_professionnel",
        // Anglais
        "email address", "email_address", "emailaddress",
        "work email", "work_email", "professional email",
        "contact email", "e mail", "electronic mail",
    ],
    contact: [
        // Français — prénom / nom seul
        "contact", "prénom", "prenom", "nom", "nom complet", "nom_complet",
        "personne", "interlocuteur", "interlocutrice",
        "prénom contact", "prenom_contact", "nom contact", "nom_contact",
        "responsable", "référent", "referent", "dirigeant",
        "gérant", "gerant", "daf", "drh",
        // Nom de famille seul — doit aussi mapper vers contact
        "last_name", "lastname", "last name", "nom de famille", "surname", "family name",
        // Anglais
        "full name", "full_name", "fullname", "contact name", "contact_name",
        "first name", "first_name",
        "person", "person name", "person_name",
        "lead name", "prospect name", "owner name", "owner",
        "rep", "representative",
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

/**
 * Détecte automatiquement le mapping champ CRM → colonne CSV.
 *
 * Deux passes :
 *  1. Par nom de colonne (4 niveaux : exact → mot entier → sous-chaîne → tokens)
 *  2. Par analyse des données réelles (scan des valeurs) pour les champs non trouvés
 *     - email  : colonne dont ≥50% des valeurs non vides contiennent "@"
 *     - phone  : colonne dont ≥50% des valeurs ressemblent à un numéro de téléphone
 *     - contact: colonnes first_name + last_name fusionnées si aucun contact trouvé
 */
export function autoDetectMapping(headers, rows = []) {
    // Normalise : minuscules, sans accents, underscores/tirets → espaces
    const norm = (str) =>
        (str || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[_\-]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();

    const normalizedHeaders = headers.map(norm);
    const map   = {};
    const used  = new Set(); // indices de colonnes déjà attribués

    // ── Passe 1 : matching par nom de colonne ─────────────────────────────────
    for (const [field, hints] of Object.entries(FIELD_HINTS)) {
        const nh = hints.map(norm);

        // Score 1 — exact après normalisation
        let idx = normalizedHeaders.findIndex((h, i) => !used.has(i) && nh.includes(h));

        // Score 2 — hint présent comme mot entier dans le header
        if (idx === -1) {
            idx = normalizedHeaders.findIndex((h, i) => {
                if (used.has(i)) return false;
                return nh.some((hint) => {
                    const escaped = hint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                    return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(h);
                });
            });
        }

        // Score 3 — sous-chaîne dans un sens ou l'autre
        if (idx === -1) {
            idx = normalizedHeaders.findIndex((h, i) => {
                if (used.has(i)) return false;
                return nh.some((hint) => h.includes(hint) || hint.includes(h));
            });
        }

        // Score 4 — tous les tokens du hint présents dans le header
        if (idx === -1) {
            idx = normalizedHeaders.findIndex((h, i) => {
                if (used.has(i)) return false;
                const hTokens = h.split(" ");
                return nh.some((hint) => {
                    const hintTokens = hint.split(" ");
                    return hintTokens.length > 1 &&
                        hintTokens.every((t) => hTokens.some((ht) => ht.includes(t) || t.includes(ht)));
                });
            });
        }

        if (idx !== -1) {
            map[field] = headers[idx];
            used.add(idx);
        }
    }

    // ── Passe 2 : détection par analyse des données réelles ───────────────────
    if (rows.length > 0) {
        const SAMPLE = Math.min(rows.length, 20); // scanner les 20 premières lignes
        const sampleRows = rows.slice(0, SAMPLE);

        headers.forEach((h, colIdx) => {
            if (!h || used.has(colIdx)) return;

            // Valeurs non vides de cette colonne dans l'échantillon
            const values = sampleRows
                .map((r) => (r[colIdx] || "").trim())
                .filter(Boolean);
            if (values.length === 0) return;

            // ── Email : ≥50% des valeurs contiennent "@" ──────────────────────
            if (!map.email) {
                const emailCount = values.filter((v) => v.includes("@")).length;
                if (emailCount / values.length >= 0.5) {
                    map.email = h;
                    used.add(colIdx);
                    return;
                }
            }

            // ── Téléphone : ≥50% ressemblent à un numéro ─────────────────────
            // Accepte : +33..., 06..., 07..., chiffres avec espaces/tirets/points
            if (!map.phone) {
                const phoneRe = /^(\+?\d[\d\s.\-()]{6,})$/;
                const phoneCount = values.filter((v) => phoneRe.test(v.replace(/\s/g, " "))).length;
                if (phoneCount / values.length >= 0.5) {
                    map.phone = h;
                    used.add(colIdx);
                    return;
                }
            }
        });
    }

    // ── Passe 3 : fallback company sur la première colonne non utilisée ───────
    if (!map.company && headers.length > 0) {
        const fi = headers.findIndex((h, i) => h && !used.has(i));
        if (fi !== -1) {
            map.company = headers[fi];
            used.add(fi);
        }
    }

    return map;
}

export function rowsToLeads(headers, rows, mapping, colMapping = {}, nameHeader = null) {
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

    // nameHeader override : colonne choisie via l'étoile comme nom du lead,
    // indépendamment du mapping CRM (peut être une colonne Extra ou n'importe quoi)
    const iNameOverride = nameHeader ? headers.indexOf(nameHeader) : -1;

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
        // Si une colonne "nom" a été épinglée via l'étoile, elle prime sur company
        const companyFromMapping = (iCompany >= 0 ? r[iCompany] : "").trim();
        const companyFromOverride = (iNameOverride >= 0 ? r[iNameOverride] : "").trim();
        const company = companyFromOverride || companyFromMapping;

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
            logoUrl:  resolveLogo({ website, email, extra }),
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
