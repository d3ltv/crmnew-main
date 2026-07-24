/**
 * Hook : re-render quand l'état « notifs lues » change (local ou autre onglet).
 */
import { useEffect, useState } from "react";
import { NOTIF_SEEN_EVENT, loadNotifSeenMap } from "@/lib/followupNotifs";

export function useNotifSeenMap() {
    const [seenMap, setSeenMap] = useState(loadNotifSeenMap);

    useEffect(() => {
        const refresh = () => setSeenMap(loadNotifSeenMap());
        window.addEventListener(NOTIF_SEEN_EVENT, refresh);
        window.addEventListener("storage", refresh);
        return () => {
            window.removeEventListener(NOTIF_SEEN_EVENT, refresh);
            window.removeEventListener("storage", refresh);
        };
    }, []);

    return seenMap;
}
