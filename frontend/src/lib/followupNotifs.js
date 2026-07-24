/**
 * Notifications prospection : rappels / RDV / relances dus aujourd'hui ou en retard.
 * Lu / non-lu **par item** — une notif lue disparaît de la liste (badge −1).
 */

import { toLocalDateKey } from "@/lib/dateUtils";
import { isManualRdv } from "@/lib/nextActionUtils";
import { isWonColumn, isLostColumn } from "@/constants/columnPatterns";

const SEEN_ITEMS_KEY = "crm_notif_seen_items_v1";
const LEGACY_SEEN_MAP_KEY = "crm_notif_seen_map_v1";
export const NOTIF_SEEN_EVENT = "crm_notif_seen_changed";

function isTerminal(lead, columns) {
    const name = columns?.[lead.columnId]?.name || "";
    return isWonColumn(name) || isLostColumn(name);
}

/**
 * @typedef {{
 *   key: string,
 *   lead: object,
 *   due: number,
 *   dueAt: string,
 *   overdue: boolean,
 *   today: boolean,
 *   kind: 'auto'|'rappel'|'rdv'|'relance',
 *   label: string,
 *   workspaceId?: string,
 *   workspaceName?: string,
 * }} NotifItem
 */

/**
 * @param {object} workspace
 * @returns {NotifItem[]}
 */
export function getWorkspaceFollowupNotifs(workspace) {
    const now = Date.now();
    const todayKey = toLocalDateKey(new Date());
    const items = [];
    const columns = workspace?.columns || {};
    const seenLeads = new Set();

    for (const lead of Object.values(workspace?.leads || {})) {
        if (!lead?.id || lead.archived) continue;
        if (isTerminal(lead, columns)) continue;

        // ── Relance auto ────────────────────────────────────────────────────
        if (lead.autoFollowup?.dueAt) {
            const dueAt = lead.autoFollowup.dueAt;
            const due = new Date(dueAt).getTime();
            if (Number.isFinite(due)) {
                const dateKey = toLocalDateKey(dueAt);
                const overdue =
                    !!lead.autoFollowup.overdue
                    || (lead.autoFollowup.stage >= 3 && due <= now)
                    || (dateKey && dateKey < todayKey);
                const today = dateKey === todayKey;
                if (overdue || today) {
                    const key = `${workspace.id}:${lead.id}:auto:${dueAt}`;
                    items.push({
                        key,
                        lead,
                        due,
                        dueAt,
                        overdue,
                        today: today && !overdue,
                        kind: "auto",
                        label: `Relance auto · étape ${lead.autoFollowup.stage || 1}/3`,
                    });
                    seenLeads.add(lead.id);
                }
            }
        }

        // ── nextAction (rappel / RDV calendrier) ────────────────────────────
        const na = lead.nextAction;
        if (!na || seenLeads.has(lead.id)) continue;
        const dueAt = na.dueAt || (na.date ? `${na.date}T09:00:00` : null);
        if (!dueAt) continue;
        const due = new Date(dueAt).getTime();
        if (!Number.isFinite(due)) continue;
        const dateKey = toLocalDateKey(dueAt);
        const overdue = dateKey < todayKey || due < now - 60_000;
        const today = dateKey === todayKey;
        if (!overdue && !today) continue;

        let kind = "rappel";
        if (isManualRdv(na)) kind = "rdv";
        else if (na.auto) kind = "relance";

        items.push({
            key: `${workspace.id}:${lead.id}:next:${dueAt}`,
            lead,
            due,
            dueAt,
            overdue,
            today: today && !overdue,
            kind,
            label: na.label || (kind === "rdv" ? "RDV" : "Rappel"),
        });
    }

    items.sort((a, b) => a.due - b.due);
    return items;
}

export function countWorkspaceFollowupNotifs(workspace) {
    return getWorkspaceFollowupNotifs(workspace).length;
}

/** @deprecated — préférer item.key */
export function notifItemKey(workspaceId, lead) {
    return `${workspaceId}:${lead?.id || ""}:${lead?.autoFollowup?.dueAt || lead?.nextAction?.dueAt || ""}`;
}

export function loadNotifSeenItems() {
    try {
        const raw = localStorage.getItem(SEEN_ITEMS_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function saveNotifSeenItems(map) {
    try {
        localStorage.setItem(SEEN_ITEMS_KEY, JSON.stringify(map));
    } catch { /* ignore */ }
    try {
        window.dispatchEvent(new Event(NOTIF_SEEN_EVENT));
    } catch { /* ignore */ }
}

/** @deprecated alias — le hook utilise encore ce nom */
export function loadNotifSeenMap() {
    return loadNotifSeenItems();
}

export function isNotifItemUnread(itemOrWorkspaceId, lead, seenItems = loadNotifSeenItems()) {
    // Nouvelle API : objet notif avec .key
    if (itemOrWorkspaceId && typeof itemOrWorkspaceId === "object" && itemOrWorkspaceId.key) {
        return !seenItems[itemOrWorkspaceId.key];
    }
    // Legacy
    if (!itemOrWorkspaceId || !lead?.id) return false;
    const key = notifItemKey(itemOrWorkspaceId, lead);
    if (seenItems[key]) return false;
    // Compat : anciennes clés auto-only
    const autoKey = `${itemOrWorkspaceId}:${lead.id}:auto:${lead.autoFollowup?.dueAt || ""}`;
    const nextKey = `${itemOrWorkspaceId}:${lead.id}:next:${lead.nextAction?.dueAt || ""}`;
    return !seenItems[autoKey] && !seenItems[nextKey] && !seenItems[key];
}

/** Notifs encore visibles (non lues). */
export function getUnreadWorkspaceNotifs(workspace, seenItems = loadNotifSeenItems()) {
    return getWorkspaceFollowupNotifs(workspace).filter((item) => !seenItems[item.key]);
}

export function isWorkspaceNotifUnread(workspace, seenItems = loadNotifSeenItems()) {
    return getUnreadWorkspaceNotifs(workspace, seenItems).length > 0;
}

export function countUnreadWorkspaceNotifs(workspace, seenItems = loadNotifSeenItems()) {
    return getUnreadWorkspaceNotifs(workspace, seenItems).length;
}

export function countAllUnreadNotifs(workspaces, seenItems = loadNotifSeenItems()) {
    let n = 0;
    for (const ws of workspaces || []) {
        n += countUnreadWorkspaceNotifs(ws, seenItems);
    }
    return n;
}

export function getAllFollowupNotifs(workspaces) {
    const out = [];
    for (const ws of workspaces || []) {
        for (const item of getWorkspaceFollowupNotifs(ws)) {
            out.push({ ...item, workspaceId: ws.id, workspaceName: ws.name });
        }
    }
    out.sort((a, b) => a.due - b.due);
    return out;
}

export function getAllUnreadNotifs(workspaces, seenItems = loadNotifSeenItems()) {
    return getAllFollowupNotifs(workspaces).filter((item) => !seenItems[item.key]);
}

/** Marque une notif comme lue (disparaît de la liste, badge −1). */
export function markNotifItemRead(itemOrWorkspaceId, lead) {
    const map = loadNotifSeenItems();
    if (itemOrWorkspaceId && typeof itemOrWorkspaceId === "object" && itemOrWorkspaceId.key) {
        map[itemOrWorkspaceId.key] = true;
        saveNotifSeenItems(map);
        return;
    }
    if (!itemOrWorkspaceId || !lead?.id) return;
    map[notifItemKey(itemOrWorkspaceId, lead)] = true;
    if (lead.autoFollowup?.dueAt) {
        map[`${itemOrWorkspaceId}:${lead.id}:auto:${lead.autoFollowup.dueAt}`] = true;
    }
    if (lead.nextAction?.dueAt) {
        map[`${itemOrWorkspaceId}:${lead.id}:next:${lead.nextAction.dueAt}`] = true;
    }
    saveNotifSeenItems(map);
}

export function markWorkspaceNotifsRead(workspace) {
    if (!workspace?.id) return;
    const map = loadNotifSeenItems();
    for (const item of getWorkspaceFollowupNotifs(workspace)) {
        map[item.key] = true;
    }
    saveNotifSeenItems(map);
}

/** Marque toutes les notifs d’un lead (tous kinds) comme lues — le RDV reste. */
export function markLeadNotifsRead(workspaces, workspaceId, leadId) {
    if (!workspaceId || !leadId) return;
    const map = loadNotifSeenItems();
    let changed = false;
    for (const ws of workspaces || []) {
        if (ws?.id !== workspaceId) continue;
        for (const item of getWorkspaceFollowupNotifs(ws)) {
            if (item.lead?.id !== leadId) continue;
            if (!map[item.key]) {
                map[item.key] = true;
                changed = true;
            }
        }
    }
    if (changed) saveNotifSeenItems(map);
}

export function markAllNotifsRead(workspaces) {
    const map = loadNotifSeenItems();
    for (const ws of workspaces || []) {
        if (!ws?.id) continue;
        for (const item of getWorkspaceFollowupNotifs(ws)) {
            map[item.key] = true;
        }
    }
    saveNotifSeenItems(map);
    try {
        localStorage.removeItem(LEGACY_SEEN_MAP_KEY);
    } catch { /* ignore */ }
}
