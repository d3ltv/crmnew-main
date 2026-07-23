// ---------- Stats computation helpers ----------

import {
    isWonColumn,
    isLostColumn,
    isContactedColumn,
} from "@/constants/columnPatterns";
import { toLocalDateKey } from "@/lib/dateUtils";

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
 * Détecte la colonne "Gagné", "Perdu" et les colonnes "Contacté" d'un workspace
 * via les patterns centralisés dans columnPatterns.js
 */
function detectSpecialCols(columns) {
    let wonId = null, lostId = null, contactIds = [];
    for (const col of Object.values(columns)) {
        if (!wonId  && isWonColumn(col.name))      wonId = col.id;
        if (!lostId && isLostColumn(col.name))     lostId = col.id;
        if (isContactedColumn(col.name))           contactIds.push(col.id);
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

/**
 * Extrait toutes les notes d'appel de tous les leads de tous les workspaces fournis.
 * Retourne un tableau de { at: Date, answered: boolean, workspaceId, leadId, company }.
 *
 * Détection :
 *   - "📞" dans le texte → appel décroché (answered = true)
 *   - "📵" dans le texte → pas de réponse (answered = false)
 */
function extractCallEvents(workspaces) {
    const events = [];
    for (const ws of workspaces) {
        for (const lead of Object.values(ws.leads || {})) {
            for (const note of lead.notes || []) {
                const text = note.text || "";
                const isCall = text.includes("📞") || text.includes("📵");
                if (!isCall) continue;
                const answered = text.includes("📞");
                const at = note.at ? new Date(note.at) : null;
                if (!at || isNaN(at)) continue;
                events.push({
                    at,
                    answered,
                    workspaceId: ws.id,
                    leadId: lead.id,
                    company: lead.company || "",
                });
            }
        }
    }
    return events;
}

/**
 * Calcule les statistiques d'appels avancées à partir des workspaces.
 *
 * Retourne :
 *   - totalCalls        : nombre total d'appels
 *   - totalAnswered     : nombre de décrochés
 *   - globalAnswerRate  : taux global de décrochage (0–100)
 *   - byHour            : [{hour, total, answered, rate}] × 24
 *   - byDayOfWeek       : [{day (0=Dim…6=Sam), label, total, answered, rate}] × 7
 *   - byDay             : [{date (YYYY-MM-DD), total, answered, rate}] — 90 derniers jours avec activité
 *   - last30Days        : [{date, total, answered, rate}] — 30 derniers jours calendaires (y.c. 0)
 *   - bestHour          : {hour, rate, total} — heure avec le meilleur taux (min 3 appels)
 *   - bestDay           : {day, label, rate, total} — jour de semaine avec le meilleur taux
 *   - streak            : nombre de jours consécutifs avec au moins 1 appel (jusqu'à aujourd'hui)
 */
export function computeCallStats(workspaces) {
    const events = extractCallEvents(workspaces);

    const total = events.length;
    const answered = events.filter((e) => e.answered).length;
    const globalAnswerRate = total > 0 ? (answered / total) * 100 : null;

    // ── Par heure (0–23) ──────────────────────────────────────────────────────
    const byHour = Array.from({ length: 24 }, (_, h) => {
        const calls = events.filter((e) => e.at.getHours() === h);
        const ans   = calls.filter((e) => e.answered).length;
        return {
            hour: h,
            total: calls.length,
            answered: ans,
            rate: calls.length > 0 ? (ans / calls.length) * 100 : null,
        };
    });

    // ── Par jour de semaine ────────────────────────────────────────────────────
    const DAY_LABELS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
    const byDayOfWeek = Array.from({ length: 7 }, (_, d) => {
        const calls = events.filter((e) => e.at.getDay() === d);
        const ans   = calls.filter((e) => e.answered).length;
        return {
            day: d,
            label: DAY_LABELS[d],
            total: calls.length,
            answered: ans,
            rate: calls.length > 0 ? (ans / calls.length) * 100 : null,
        };
    });

    // ── Par date (YYYY-MM-DD) ─────────────────────────────────────────────────
    const dateMap = new Map();
    for (const e of events) {
        const key = toLocalDateKey(e.at);
        if (!dateMap.has(key)) dateMap.set(key, { total: 0, answered: 0 });
        dateMap.get(key).total++;
        if (e.answered) dateMap.get(key).answered++;
    }
    const byDay = [...dateMap.entries()]
        .map(([date, { total: t, answered: a }]) => ({
            date,
            total: t,
            answered: a,
            rate: t > 0 ? (a / t) * 100 : null,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

    // ── 30 derniers jours calendaires (rempli avec 0 pour les jours sans appel) ─
    const last30Days = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = toLocalDateKey(d);
        const entry = dateMap.get(key);
        last30Days.push({
            date: key,
            total: entry?.total || 0,
            answered: entry?.answered || 0,
            rate: entry ? (entry.answered / entry.total) * 100 : null,
        });
    }

    // ── Meilleure heure (min 3 appels, taux le plus élevé) ─────────────────────
    const bestHourEntry = byHour
        .filter((h) => h.total >= 3 && h.rate !== null)
        .sort((a, b) => b.rate - a.rate)[0] || null;
    const bestHour = bestHourEntry
        ? { hour: bestHourEntry.hour, rate: bestHourEntry.rate, total: bestHourEntry.total }
        : null;

    // ── Meilleur jour de semaine (min 3 appels) ────────────────────────────────
    const bestDayEntry = byDayOfWeek
        .filter((d) => d.total >= 3 && d.rate !== null)
        .sort((a, b) => b.rate - a.rate)[0] || null;
    const bestDay = bestDayEntry
        ? { day: bestDayEntry.day, label: bestDayEntry.label, rate: bestDayEntry.rate, total: bestDayEntry.total }
        : null;

    // ── Streak : jours consécutifs avec appels (jusqu'à aujourd'hui) ──────────
    let streak = 0;
    const todayKey = toLocalDateKey(today);
    let checkDate = new Date(today);
    while (true) {
        const key = toLocalDateKey(checkDate);
        if (dateMap.has(key)) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
        } else if (key === todayKey) {
            // Aujourd'hui sans appel — on remonte quand même pour voir hier
            checkDate.setDate(checkDate.getDate() - 1);
            const yesterdayKey = toLocalDateKey(checkDate);
            if (dateMap.has(yesterdayKey)) {
                checkDate = new Date(today);
                checkDate.setDate(checkDate.getDate() - 1);
                continue;
            } else {
                break;
            }
        } else {
            break;
        }
    }

    return {
        totalCalls: total,
        totalAnswered: answered,
        globalAnswerRate,
        byHour,
        byDayOfWeek,
        byDay,
        last30Days,
        bestHour,
        bestDay,
        streak,
    };
}

export { formatDuration };
