/**
 * Helpers pour nextAction / RDV — contrat unique dans toute l'app.
 *
 * Un RDV manuel est reconnu si :
 *   - meeting: true, OU
 *   - label commence par "📅 RDV", OU
 *   - label legacy "RDV — …" / "RDV · …" (MeetingModal avant fix)
 */

/** @param {{ label?: string, meeting?: boolean, auto?: boolean } | null | undefined} nextAction */
export function isManualRdv(nextAction) {
    if (!nextAction || nextAction.auto) return false;
    if (nextAction.meeting) return true;
    const label = (nextAction.label || "").trim();
    if (!label) return false;
    if (label.startsWith("📅 RDV")) return true;
    // Legacy MeetingModal labels (sans emoji)
    if (/^RDV[\s—–-]/.test(label)) return true;
    return false;
}

/**
 * Construit un nextAction RDV normalisé (📅 RDV… + meeting: true).
 * @param {{ date: string, dueAt: string, label?: string }} opts
 */
export function makeRdvNextAction({ date, dueAt, label }) {
    const raw = (label || "").trim();
    let normalized;
    if (!raw) {
        normalized = "📅 RDV";
    } else if (raw.startsWith("📅")) {
        normalized = raw;
    } else if (/^RDV\b/i.test(raw)) {
        normalized = `📅 ${raw}`;
    } else {
        normalized = `📅 RDV · ${raw}`;
    }
    return {
        date,
        dueAt,
        label: normalized,
        auto: false,
        meeting: true,
    };
}
