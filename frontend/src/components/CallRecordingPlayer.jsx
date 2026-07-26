import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
    getCallRecording,
    downloadCallRecording,
    deleteCallRecording,
    daysUntilPurge,
} from "@/lib/callRecordings";
import { CallAudioPlayer } from "@/components/CallAudioPlayer";
import { useCrm } from "@/context/CrmContext";
import { toast } from "sonner";

/**
 * Lecteur d'un enregistrement d'appel rattaché à une note.
 */
export function CallRecordingPlayer({
    recordingId,
    leadLabel = "appel",
    workspaceId = null,
    leadId = null,
}) {
    const { dispatch } = useCrm();
    const [rec, setRec] = useState(null);
    const [url, setUrl] = useState(null);
    const [loading, setLoading] = useState(true);
    const [missing, setMissing] = useState(false);
    const [gone, setGone] = useState(false);

    useEffect(() => {
        let cancelled = false;
        let objectUrl = null;

        (async () => {
            setLoading(true);
            setMissing(false);
            setGone(false);
            const data = await getCallRecording(recordingId);
            if (cancelled) return;
            if (!data?.blob) {
                setRec(null);
                setUrl(null);
                setMissing(true);
                setLoading(false);
                return;
            }
            objectUrl = URL.createObjectURL(data.blob);
            setRec(data);
            setUrl(objectUrl);
            setLoading(false);
        })();

        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [recordingId]);

    const handleDownload = async () => {
        try {
            const safe = String(leadLabel || "appel")
                .replace(/[^\w\-àâäéèêëïîôùûüç\s]+/gi, "")
                .trim()
                .replace(/\s+/g, "-")
                .slice(0, 40) || "appel";
            const stamp = (rec?.createdAt || "").slice(0, 10);
            const updated = await downloadCallRecording(
                recordingId,
                `${safe}-${stamp || "audio"}`
            );
            if (updated) setRec(updated);
            toast.success("Audio téléchargé", {
                description: "Conservé dans le CRM",
            });
        } catch (err) {
            console.warn(err);
            toast.error("Téléchargement impossible");
        }
    };

    const handleDelete = async () => {
        if (!window.confirm("Supprimer ce vocal ?")) return;
        try {
            await deleteCallRecording(recordingId);
            if (workspaceId && leadId) {
                dispatch({
                    type: "CLEAR_NOTE_RECORDING",
                    workspaceId,
                    leadId,
                    recordingId,
                });
            }
            setGone(true);
            toast.success("Vocal supprimé");
        } catch (err) {
            console.warn(err);
            toast.error("Suppression impossible");
        }
    };

    if (gone) return null;

    if (loading) {
        return (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Loader2 size={12} className="animate-spin" />
                Chargement audio…
            </div>
        );
    }

    if (missing || !url) {
        return (
            <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground/80 italic">
                    Enregistrement expiré ou introuvable
                </p>
                {workspaceId && leadId && (
                    <button
                        type="button"
                        onClick={handleDelete}
                        className="text-[10px] font-medium text-muted-foreground hover:text-destructive"
                    >
                        Retirer
                    </button>
                )}
            </div>
        );
    }

    const daysLeft = daysUntilPurge(rec);

    return (
        <div
            className="mt-2 rounded-lg border border-border/50 bg-background/70 p-2 space-y-1"
            data-testid={`call-recording-${recordingId}`}
        >
            <CallAudioPlayer
                src={url}
                blob={rec.blob}
                peaks={rec.peaks}
                durationMs={rec.durationMs || 0}
                onDownload={handleDownload}
                downloadLabel="Télécharger"
                onDelete={handleDelete}
                deleteLabel="Supprimer le vocal"
            />
            {(rec.preserved || daysLeft != null) && (
                <p className="text-[10px] text-muted-foreground/70 px-0.5 tabular-nums">
                    {rec.preserved
                        ? "Conservé"
                        : daysLeft <= 0
                            ? "Expire bientôt"
                            : `${daysLeft}j restant`}
                </p>
            )}
        </div>
    );
}
