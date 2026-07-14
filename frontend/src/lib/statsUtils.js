// ---------- Stats computation helpers ----------

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function formatDuration(ms) {
    if (!ms || ms < 0) return "—";
    const days = Math.floor(ms / DAY_MS);
    const hours = Math.floor((ms % DAY_MS) / HOUR_MS);
    if (days >= 2) return `${days} j`;
    if (days === 1) return hours > 0 ? `1 j ${hours} h` : "1 jour";
    if (hours >= 1) return `${hours} h`;
    return "< 1 h";
}

function avg(arr) {
    if (!arr.length) return null;
    return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function median(arr) {
    if (!arr.length) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Détecte la colonne "Gagné" et "Perdu" d'un workspace par patterns de nom.
 */
function detectSpecialCols(columns) {
    const WON_P  = ["gagné", "gagne", "won", "signé", "signe", "closed won"];
    const LOST_P = ["perdu", "lost", "closed lost", "abandon"];
    const CONTACT_P = ["contact", "appel", "relance", "call", "contacté"];

    let wonId = null, lostId = null, contactIds = [];
    for (const col of Object.values(columns)) {
        const n = col.name.toLowerCase();
        if (!wonId  && WON_P.some((p) => n.includes(p)))     wonId = col.id;
        if (!lostId && LOST_P.some((p) => n.includes(p)))    lostId = col.id;
        if (CONTACT_P.some((p) => n.includes(p)))            contactIds.push(col.id);
    }
    return { wonId, lostId, contactIds };
}

/**
 * Calcule toutes les statistiques pour un workspace donné.
 */
export function computeWorkspaceStats(ws) {
    const leads = Object.values(ws.leads);
    const total = leads.length;
    const { wonId, lostId, contactIds } = detectSpecialCols(ws.columns);

    const won   = leads.filter((l) => l.columnId === wonId).length;
    const lost  = leads.filter((l) => l.columnId === lostId).length;
    const active = leads.filter((l) => l.columnId !== wonId && l.columnId !== lostId).length;

    const conversionRate = total > 0 ? (won  / total) * 100 : null;
    const lostRate       = total > 0 ? (lost / total) * 100 : null;

    // Temps moyen avant premier contact
    const timeToContactMs = [];
    for (const l of leads) {
        const history = l.statusHistory || [];
        const firstEntry = history[0];
        const firstContact = history.find((e) => contactIds.includes(e.columnId) && e !== firstEntry);
        if (firstEntry && firstContact) {
            timeToContactMs.push(new Date(firstContact.at) - new Date(firstEntry.at));
        }
    }
    const avgTimeToContact = avg(timeToContactMs);

    // Durée moyenne dans le pipeline (de createdAt à maintenant, leads actifs uniquement)
    const pipelineDurations = leads
        .filter((l) => l.columnId !== wonId && l.columnId !== lostId)
        .map((l) => Date.now() - new Date(l.createdAt).getTime())
        .filter((d) => d > 0);
    const avgPipelineDuration = avg(pipelineDurations);

    // Durée moyenne pour closer (createdAt → statusHistory entry dans wonId)
    const closingDurations = [];
    for (const l of leads) {
        if (l.columnId !== wonId) continue;
        const wonEntry = [...(l.statusHistory || [])].reverse().find((e) => e.columnId === wonId);
        if (wonEntry) closingDurations.push(new Date(wonEntry.at) - new Date(l.createdAt));
    }
    const avgClosingDuration = avg(closingDurations);

    // Leads par colonne
    const byColumn = ws.columnOrder.map((cid) => {
        const col = ws.columns[cid];
        const count = leads.filter((l) => l.columnId === cid).length;
        return { id: cid, name: col.name, count, color: col.color };
    });

    // Notes & activité
    const totalNotes = leads.reduce((s, l) => s + (l.notes || []).length, 0);
    const lastContactDates = leads
        .filter((l) => l.lastContact)
        .map((l) => new Date(l.lastContact).getTime());
    const lastActivityAt = lastContactDates.length ? Math.max(...lastContactDates) : null;

    // Leads sans coordonnées (phone + email + website tous vides)
    const noContact = leads.filter((l) => !l.phone && !l.email && !l.website).length;

    // Leads avec rappel en retard
    const overdueFollowups = leads.filter(
        (l) => l.autoFollowup && (l.autoFollowup.overdue || new Date(l.autoFollowup.dueAt) <= new Date())
    ).length;

    // ---- Prix / deal values ----
    // Tous les leads avec un dealValue (peu importe la colonne — peut être saisi manuellement)
    const dealsWithValue = leads
        .filter((l) => l.dealValue != null && !isNaN(l.dealValue) && l.dealValue > 0)
        .sort((a, b) => {
            const ta = a.dealClosedAt ? new Date(a.dealClosedAt).getTime() : new Date(a.createdAt).getTime();
            const tb = b.dealClosedAt ? new Date(b.dealClosedAt).getTime() : new Date(b.createdAt).getTime();
            return ta - tb;
        });

    const dealValues = dealsWithValue.map((l) => l.dealValue);
    const totalRevenue  = dealValues.reduce((s, v) => s + v, 0);
    const avgDealValue  = avg(dealValues);
    const medianDealValue = median(dealValues);
    const minDealValue  = dealValues.length ? Math.min(...dealValues) : null;
    const maxDealValue  = dealValues.length ? Math.max(...dealValues) : null;

    // Série chronologique pour le graphique (cumul + valeurs individuelles)
    // Chaque point = { date: ISO string, value: montant, cumul: cumul à ce point, company }
    let cumul = 0;
    const dealTimeline = dealsWithValue.map((l) => {
        cumul += l.dealValue;
        return {
            date: l.dealClosedAt || l.createdAt,
            value: l.dealValue,
            cumul,
            company: l.company,
            id: l.id,
        };
    });

    // Distribution par tranche (ex: 0-500, 500-1000, 1000-2500, 2500-5000, 5000+)
    const BRACKETS = [
        { label: "< 500 €",      min: 0,    max: 500    },
        { label: "500–1k €",     min: 500,  max: 1000   },
        { label: "1k–2.5k €",   min: 1000, max: 2500   },
        { label: "2.5k–5k €",   min: 2500, max: 5000   },
        { label: "5k–10k €",    min: 5000, max: 10000  },
        { label: "> 10k €",     min: 10000, max: Infinity },
    ];
    const dealDistribution = BRACKETS.map((b) => ({
        ...b,
        count: dealValues.filter((v) => v >= b.min && v < b.max).length,
    })).filter((b) => b.count > 0);

    return {
        total,
        won,
        lost,
        active,
        conversionRate,
        lostRate,
        avgTimeToContact,
        avgPipelineDuration,
        avgClosingDuration,
        byColumn,
        totalNotes,
        lastActivityAt,
        noContact,
        overdueFollowups,
        // deal / prix
        totalRevenue,
        avgDealValue,
        medianDealValue,
        minDealValue,
        maxDealValue,
        dealTimeline,
        dealDistribution,
        dealsWithValueCount: dealValues.length,
    };
}

/**
 * Agrège les stats de plusieurs workspaces en un total global.
 */
export function aggregateStats(statsList) {
    if (!statsList.length) return null;

    const sum = (key) => statsList.reduce((s, st) => s + (st[key] || 0), 0);
    const avgMs = (key) => {
        const vals = statsList.map((st) => st[key]).filter((v) => v !== null);
        return avg(vals);
    };
    const avgNullable = (key) => {
        const vals = statsList.map((st) => st[key]).filter((v) => v !== null && v !== undefined);
        return avg(vals);
    };

    const total = sum("total");
    const won   = sum("won");
    const lost  = sum("lost");

    // Merge byColumn — group by column name (case-insensitive)
    const colMap = new Map();
    for (const st of statsList) {
        for (const c of st.byColumn) {
            const key = c.name.toLowerCase();
            if (!colMap.has(key)) colMap.set(key, { ...c });
            else colMap.get(key).count += c.count;
        }
    }

    // Merge deal timelines sorted chronologically
    const allTimeline = statsList.flatMap((st) => st.dealTimeline || [])
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    let cumul = 0;
    const dealTimeline = allTimeline.map((pt) => {
        cumul += pt.value;
        return { ...pt, cumul };
    });

    // Merge distributions
    const distMap = new Map();
    for (const st of statsList) {
        for (const b of (st.dealDistribution || [])) {
            if (!distMap.has(b.label)) distMap.set(b.label, { ...b });
            else distMap.get(b.label).count += b.count;
        }
    }

    const allValues = statsList.flatMap((st) => (st.dealTimeline || []).map((p) => p.value));
    const totalRevenue = sum("totalRevenue");

    return {
        total,
        won,
        lost,
        active: sum("active"),
        conversionRate: total > 0 ? (won / total) * 100 : null,
        lostRate:       total > 0 ? (lost / total) * 100 : null,
        avgTimeToContact:    avgMs("avgTimeToContact"),
        avgPipelineDuration: avgMs("avgPipelineDuration"),
        avgClosingDuration:  avgMs("avgClosingDuration"),
        byColumn: [...colMap.values()],
        totalNotes: sum("totalNotes"),
        lastActivityAt: Math.max(...statsList.map((s) => s.lastActivityAt || 0)) || null,
        noContact: sum("noContact"),
        overdueFollowups: sum("overdueFollowups"),
        // deal / prix
        totalRevenue,
        avgDealValue: avgNullable("avgDealValue"),
        medianDealValue: median(allValues),
        minDealValue: allValues.length ? Math.min(...allValues) : null,
        maxDealValue: allValues.length ? Math.max(...allValues) : null,
        dealTimeline,
        dealDistribution: [...distMap.values()],
        dealsWithValueCount: sum("dealsWithValueCount"),
    };
}

export { formatDuration };
