/**
 * Notifications de relances (overdue + dues aujourd'hui).
 * Lu / non-lu **par item** (clic → badge 3→2).
 */

const SEEN_ITEMS_KEY = "crm_notif_seen_items_v1";
const LEGACY_SEEN_MAP_KEY = "crm_notif_seen_map_v1";
export const NOTIF_SEEN_EVENT = "crm_notif_seen_changed";

/**
 * @param {object} workspace
 * @returns {Array<{ lead: object, due: number, overdue: boolean, today: boolean }>}
 */
export function getWorkspaceFollowupNotifs(workspace) {
    const now = Date.now();
    const todayStr = new Date().toDateString();
    const items = [];
    for (const lead of Object.values(workspace?.leads || {})) {
        if (!lead.autoFollowup) continue;
        const due = new Date(lead.autoFollowup.dueAt).getTime();
        if (!Number.isFinite(due)) continue;
        const overdue =
            !!lead.autoFollowup.overdue
            || (lead.autoFollowup.stage >= 3 && due <= now);
        const today = new Date(lead.autoFollowup.dueAt).toDateString() === todayStr;
        if (!overdue && !today) continue;
        items.push({ lead, due, overdue, today });
    }
    items.sort((a, b) => a.due - b.due);
    return items;
}

export function countWorkspaceFollowupNotifs(workspace) {
    return getWorkspaceFollowupNotifs(workspace).length;
}

/** Clé stable d'une notif individuelle. */
export function notifItemKey(workspaceId, lead) {
    return `${workspaceId}:${lead?.id || ""}:${lead?.autoFollowup?.dueAt || ""}`;
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

export function isNotifItemUnread(workspaceId, lead, seenItems = loadNotifSeenItems()) {
    if (!workspaceId || !lead?.id) return false;
    return !seenItems[notifItemKey(workspaceId, lead)];
}

/** True s'il reste au moins une notif non lue sur l'espace. */
export function isWorkspaceNotifUnread(workspace, seenItems = loadNotifSeenItems()) {
    if (!workspace?.id) return false;
    return getWorkspaceFollowupNotifs(workspace).some(
        (f) => isNotifItemUnread(workspace.id, f.lead, seenItems)
    );
}

/** Nombre de notifs non lues (badge). */
export function countUnreadWorkspaceNotifs(workspace, seenItems = loadNotifSeenItems()) {
    if (!workspace?.id) return 0;
    return getWorkspaceFollowupNotifs(workspace).filter(
        (f) => isNotifItemUnread(workspace.id, f.lead, seenItems)
    ).length;
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

/** Marque une seule notif comme lue (badge −1). */
export function markNotifItemRead(workspaceId, lead) {
    if (!workspaceId || !lead?.id) return;
    const map = loadNotifSeenItems();
    map[notifItemKey(workspaceId, lead)] = true;
    saveNotifSeenItems(map);
}

export function markWorkspaceNotifsRead(workspace) {
    if (!workspace?.id) return;
    const map = loadNotifSeenItems();
    for (const f of getWorkspaceFollowupNotifs(workspace)) {
        map[notifItemKey(workspace.id, f.lead)] = true;
    }
    saveNotifSeenItems(map);
}

export function markAllNotifsRead(workspaces) {
    const map = loadNotifSeenItems();
    for (const ws of workspaces || []) {
        if (!ws?.id) continue;
        for (const f of getWorkspaceFollowupNotifs(ws)) {
            map[notifItemKey(ws.id, f.lead)] = true;
        }
    }
    saveNotifSeenItems(map);
    try {
        localStorage.removeItem(LEGACY_SEEN_MAP_KEY);
    } catch { /* ignore */ }
}
