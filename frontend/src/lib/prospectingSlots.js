/**
 * Créneau de prospection dérivé de la heatmap d'appels (computeCallStats).
 */

import { computeCallStats } from "@/lib/statsUtils";

const DAY_FULL = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

/**
 * @param {object[]} workspaces
 * @returns {{
 *   bestHour: { hour: number, rate: number, total: number } | null,
 *   bestDay: { day: number, label: string, rate: number, total: number } | null,
 *   shortLabel: string,
 *   detailLabel: string,
 * } | null}
 */
export function getBestProspectingSlot(workspaces) {
    if (!workspaces?.length) return null;
    const stats = computeCallStats(workspaces);
    const { bestHour, bestDay } = stats;
    if (!bestHour && !bestDay) return null;

    const partsShort = [];
    const partsDetail = [];

    if (bestDay) {
        const name = DAY_FULL[bestDay.day] || bestDay.label;
        partsShort.push(name.slice(0, 3) + ".");
        partsDetail.push(
            `${name} (${Math.round(bestDay.rate)} % décroché · ${bestDay.total} appels)`
        );
    }
    if (bestHour) {
        const h = bestHour.hour;
        const slot = `${String(h).padStart(2, "0")}–${String((h + 1) % 24).padStart(2, "0")}h`;
        partsShort.push(slot);
        partsDetail.push(
            `${slot} (${Math.round(bestHour.rate)} % décroché · ${bestHour.total} appels)`
        );
    }

    return {
        bestHour,
        bestDay,
        shortLabel: partsShort.join(" · "),
        detailLabel: partsDetail.join(" · "),
    };
}
