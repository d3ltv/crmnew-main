import React, { useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2, Check } from "lucide-react";
import { formatDuration, pickAudioMimeType } from "@/lib/callRecordings";
import { openProcessedMic, createCallRecorder } from "@/lib/audioCapture";
import { AudioWaveform, startPeakSampler } from "@/components/AudioWaveform";
import { CallAudioPlayer } from "@/components/CallAudioPlayer";
import { CallRecordingPlayer } from "@/components/CallRecordingPlayer";
import { cn } from "@/lib/utils";

/**
 * Section « Vocal » — design type Apple Voice Memos (sobre, grand micro, onde).
 * onSave({ blob, mimeType, durationMs, peaks })
 */
export function VoiceCallSection({
    onSave,
    saving = false,
    disabled = false,
    recent = [],
    leadLabel = "appel",
    workspaceId,
    leadId,
}) {
    const [status, setStatus] = useState("idle"); // idle | recording | ready | denied | unsupported
    const [elapsedMs, setElapsedMs] = useState(0);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [previewBlob, setPreviewBlob] = useState(null);
    const [liveStream, setLiveStream] = useState(null);
    const [peaks, setPeaks] = useState([]);
    const [pending, setPending] = useState(null);

    const mediaRecorderRef = useRef(null);
    const captureCleanupRef = useRef(null);
    const chunksRef = useRef([]);
    const startedAtRef = useRef(0);
    const timerRef = useRef(null);
    const mimeRef = useRef("");
    const peakSamplerRef = useRef(null);
    const previewUrlRef = useRef(null);

    const cleanupStream = () => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        captureCleanupRef.current?.();
        captureCleanupRef.current = null;
        mediaRecorderRef.current = null;
        setLiveStream(null);
    };

    const clearPreview = () => {
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
        setPreviewUrl(null);
        setPreviewBlob(null);
        setPending(null);
        setPeaks([]);
    };

    useEffect(() => () => {
        peakSamplerRef.current?.stop?.();
        peakSamplerRef.current = null;
        cleanupStream();
        clearPreview();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const reset = () => {
        peakSamplerRef.current?.stop?.();
        peakSamplerRef.current = null;
        cleanupStream();
        clearPreview();
        chunksRef.current = [];
        setElapsedMs(0);
        setStatus("idle");
    };

    const start = async () => {
        if (disabled || saving || status === "recording") return;
        if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
            setStatus("unsupported");
            return;
        }
        try {
            clearPreview();
            const mimeType = pickAudioMimeType();
            mimeRef.current = mimeType;
            const { stream, cleanup } = await openProcessedMic();
            captureCleanupRef.current = cleanup;
            setLiveStream(stream);
            chunksRef.current = [];
            peakSamplerRef.current = startPeakSampler(stream, 56);

            const recorder = createCallRecorder(stream, { mimeType });
            mediaRecorderRef.current = recorder;

            recorder.ondataavailable = (e) => {
                if (e.data?.size) chunksRef.current.push(e.data);
            };
            recorder.onstop = () => {
                const sampled = peakSamplerRef.current?.stop?.() || [];
                peakSamplerRef.current = null;
                const durationMs = Math.max(0, Date.now() - startedAtRef.current);
                cleanupStream();
                const blob = new Blob(chunksRef.current, {
                    type: mimeRef.current || chunksRef.current[0]?.type || "audio/webm",
                });
                chunksRef.current = [];
                if (!blob.size) {
                    setStatus("idle");
                    return;
                }
                const url = URL.createObjectURL(blob);
                previewUrlRef.current = url;
                setPreviewUrl(url);
                setPreviewBlob(blob);
                setPeaks(sampled);
                setElapsedMs(durationMs);
                setPending({
                    blob,
                    mimeType: blob.type || mimeRef.current || "audio/webm",
                    durationMs,
                    peaks: sampled,
                });
                setStatus("ready");
            };

            startedAtRef.current = Date.now();
            setElapsedMs(0);
            setStatus("recording");
            recorder.start(250);
            timerRef.current = setInterval(() => {
                setElapsedMs(Date.now() - startedAtRef.current);
            }, 200);
        } catch (err) {
            peakSamplerRef.current?.stop?.();
            peakSamplerRef.current = null;
            cleanupStream();
            setStatus(err?.name === "NotAllowedError" ? "denied" : "unsupported");
        }
    };

    const stop = () => {
        const recorder = mediaRecorderRef.current;
        if (!recorder || recorder.state === "inactive") {
            peakSamplerRef.current?.stop?.();
            peakSamplerRef.current = null;
            cleanupStream();
            setStatus("idle");
            return;
        }
        recorder.stop();
    };

    const handleSave = async () => {
        if (!pending?.blob || saving) return;
        await onSave?.(pending);
        reset();
    };

    if (status === "unsupported") {
        return (
            <p className="text-[12px] text-muted-foreground text-center py-3">
                Audio non supporté sur ce navigateur
            </p>
        );
    }

    if (status === "denied") {
        return (
            <div className="rounded-2xl bg-secondary/50 px-4 py-4 text-center space-y-2">
                <p className="text-[12px] text-muted-foreground leading-relaxed">
                    Micro refusé — autorisez-le dans les réglages du navigateur.
                </p>
                <button
                    type="button"
                    onClick={() => setStatus("idle")}
                    className="text-[12px] font-medium text-foreground"
                >
                    Réessayer
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-3" data-testid="voice-call-section">
            <div
                className={cn(
                    "rounded-[20px] border border-border/60",
                    "bg-gradient-to-b from-secondary/40 via-secondary/15 to-background",
                    "dark:from-secondary/30 dark:via-background dark:to-background",
                    "px-4 pt-4 pb-4"
                )}
            >
                {/* Timer + hint */}
                <div className="text-center mb-3">
                    <p
                        className={cn(
                            "text-[22px] leading-none font-light tabular-nums tracking-tight",
                            status === "recording" ? "text-foreground" : "text-foreground/85"
                        )}
                    >
                        {formatDuration(elapsedMs || pending?.durationMs || 0)}
                    </p>
                    <p className="mt-1.5 text-[11px] text-muted-foreground font-medium">
                        {status === "idle" && "Appuyez pour enregistrer"}
                        {status === "recording" && "Enregistrement…"}
                        {status === "ready" && "Prêt · Sauver comme Joint"}
                    </p>
                </div>

                {/* Wave */}
                <div
                    className="mx-auto mb-3.5 h-9 max-w-[240px] flex items-center justify-center"
                    style={{
                        "--waveform-color": status === "recording"
                            ? "hsl(var(--destructive))"
                            : "hsl(var(--foreground))",
                        "--waveform-muted": "hsl(var(--muted-foreground) / 0.28)",
                    }}
                >
                    {status === "recording" && liveStream && (
                        <AudioWaveform live liveStream={liveStream} barCount={44} heightClass="h-9 w-full" />
                    )}
                    {status === "ready" && previewUrl && (
                        <CallAudioPlayer
                            src={previewUrl}
                            blob={previewBlob}
                            peaks={peaks}
                            durationMs={pending?.durationMs || elapsedMs}
                            compact
                            className="w-full"
                        />
                    )}
                    {status === "idle" && (
                        <div className="flex items-end justify-center gap-[2.5px] h-7 opacity-30 w-full" aria-hidden>
                            {Array.from({ length: 36 }).map((_, i) => (
                                <span
                                    key={i}
                                    className="w-[2.5px] rounded-full bg-foreground/75"
                                    style={{
                                        height: `${7 + Math.sin(i * 0.5) * 9 + (i % 5) * 1.2}px`,
                                    }}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Contrôles centrés */}
                <div className="flex items-center justify-center gap-5">
                    {status === "ready" ? (
                        <>
                            <button
                                type="button"
                                onClick={reset}
                                disabled={saving}
                                className="h-10 w-10 rounded-full bg-secondary text-muted-foreground hover:text-destructive inline-flex items-center justify-center transition-colors disabled:opacity-50"
                                aria-label="Supprimer"
                                title="Supprimer"
                            >
                                <Trash2 size={15} strokeWidth={1.75} />
                            </button>
                            <button
                                type="button"
                                data-testid="voice-section-save"
                                onClick={handleSave}
                                disabled={saving}
                                className="h-12 w-12 rounded-full bg-foreground text-background inline-flex items-center justify-center shadow-sm hover:opacity-90 active:scale-[0.97] transition-[opacity,transform] disabled:opacity-50"
                                aria-label="Enregistrer le vocal"
                                title="Sauver · Joint"
                            >
                                {saving ? (
                                    <span className="text-[11px] font-medium">…</span>
                                ) : (
                                    <Check size={20} strokeWidth={2.25} />
                                )}
                            </button>
                            <span className="h-10 w-10" aria-hidden />
                        </>
                    ) : status === "recording" ? (
                        <button
                            type="button"
                            data-testid="voice-section-stop"
                            onClick={stop}
                            className="relative h-12 w-12 rounded-full bg-destructive text-destructive-foreground inline-flex items-center justify-center shadow-sm active:scale-[0.97] transition-transform"
                            aria-label="Arrêter"
                            title="Arrêter"
                        >
                            <span className="absolute inset-0 rounded-full bg-destructive/25 animate-ping opacity-35" />
                            <Square size={14} fill="currentColor" className="relative" />
                        </button>
                    ) : (
                        <button
                            type="button"
                            data-testid="voice-section-start"
                            disabled={disabled || saving}
                            onClick={start}
                            className="h-12 w-12 rounded-full bg-foreground text-background inline-flex items-center justify-center shadow-sm hover:opacity-90 active:scale-[0.97] transition-[opacity,transform] disabled:opacity-50"
                            aria-label="Enregistrer un vocal"
                            title="Enregistrer l'appel"
                        >
                            <Mic size={20} strokeWidth={1.75} />
                        </button>
                    )}
                </div>
            </div>

            {recent.length > 0 && (
                <div className="space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-0.5">
                        Récents
                    </p>
                    <div className="space-y-1.5">
                        {recent.map((n) => (
                            <div
                                key={n.id}
                                className="rounded-xl border border-border/50 bg-card/60 px-2.5 py-2 space-y-1"
                            >
                                <span className="text-[10px] text-muted-foreground font-medium tabular-nums">
                                    {n.at
                                        ? new Date(n.at).toLocaleString("fr-FR", {
                                            day: "numeric",
                                            month: "short",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })
                                        : "—"}
                                </span>
                                <CallRecordingPlayer
                                    recordingId={n.recordingId}
                                    leadLabel={leadLabel}
                                    workspaceId={workspaceId}
                                    leadId={leadId}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
