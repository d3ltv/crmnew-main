import React, { useEffect, useMemo, useState } from "react";
import { fr } from "date-fns/locale";
import {
    format,
    startOfDay,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    isSameMonth,
    isSameDay,
    addMonths,
    subMonths,
} from "date-fns";
import { useCrm } from "@/context/CrmContext";
import { toLocalDateKey } from "@/lib/dateUtils";
import {
    collectCalendarEvents,
    agendaEventsForDate,
    surveillanceEvents,
    countActionableToday,
    openLeadFromCalendar,
    readCalendarScope,
    writeCalendarScope,
    CALENDAR_EVENT_META,
} from "@/lib/calendarEvents";
import {
    ChevronLeft,
    ChevronRight,
    MoreHorizontal,
    Layers,
    Building2,
    Check,
    AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { QuickScheduleButton } from "./AddToCalendarDialog";
import { scheduleLeadNextAction } from "@/lib/scheduleLead";
import { toast } from "sonner";

const WEEKDAYS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];

function formatEventTime(dueAt) {
    if (!dueAt) return null;
    const d = new Date(dueAt);
    if (Number.isNaN(d.getTime())) return null;
    return format(d, "HH:mm");
}

function eventsByDay(events) {
    /** @type {Map<string, object[]>} */
    const map = new Map();
    for (const e of events || []) {
        if (e.type === "surveillance") continue;
        if (!map.has(e.dateKey)) map.set(e.dateKey, []);
        map.get(e.dateKey).push(e);
    }
    return map;
}

/**
 * Calendrier CRM — grille type Google Calendar + panneau du jour.
 */
export function CrmCalendar({
    workspaces: workspacesProp,
    currentWorkspace = null,
    variant = "page",
    className,
    defaultScope,
    onOpenLead,
}) {
    const { state, dispatch } = useCrm();
    const [selected, setSelected] = useState(() => startOfDay(new Date()));
    const [month, setMonth] = useState(() => startOfMonth(new Date()));
    const [scope, setScope] = useState(() => defaultScope || readCalendarScope());

    useEffect(() => {
        writeCalendarScope(scope);
    }, [scope]);

    const allWorkspaces = useMemo(() => {
        if (workspacesProp?.length) return workspacesProp;
        return state.order.map((id) => state.workspaces[id]).filter(Boolean);
    }, [workspacesProp, state.order, state.workspaces]);

    const activeWorkspace = currentWorkspace
        || (state.currentId ? state.workspaces[state.currentId] : null)
        || allWorkspaces[0]
        || null;

    const workspaces = useMemo(() => {
        if (scope === "current" && activeWorkspace) return [activeWorkspace];
        return allWorkspaces;
    }, [scope, activeWorkspace, allWorkspaces]);

    const events = useMemo(() => collectCalendarEvents(workspaces), [workspaces]);
    const byDay = useMemo(() => eventsByDay(events), [events]);
    const todayKey = toLocalDateKey(new Date());
    const selectedKey = toLocalDateKey(selected);
    const dayEvents = useMemo(
        () => agendaEventsForDate(events, selectedKey, { todayKey, includeSurveillance: false }),
        [events, selectedKey, todayKey]
    );
    const watchList = useMemo(() => surveillanceEvents(events), [events]);
    const actionableCount = useMemo(() => countActionableToday(events), [events]);

    const gridDays = useMemo(() => {
        const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
        const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
        return eachDayOfInterval({ start, end });
    }, [month]);

    const isDialog = variant === "dialog";
    const showWsChip = scope === "all" && allWorkspaces.length > 1;

    const handleOpenLead = (workspaceId, leadId) => {
        onOpenLead?.(workspaceId, leadId);
        openLeadFromCalendar(dispatch, workspaceId, leadId);
    };

    const goToday = () => {
        const t = startOfDay(new Date());
        setSelected(t);
        setMonth(startOfMonth(t));
    };

    return (
        <div
            className={cn(
                "flex flex-col bg-background text-foreground overflow-hidden",
                isDialog ? "rounded-xl border border-border" : "rounded-2xl border border-border shadow-sm",
                className
            )}
            data-testid="crm-calendar"
            data-variant={variant}
            data-scope={scope}
        >
            {/* ── Toolbar ── */}
            <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-3 border-b border-border shrink-0">
                <button
                    type="button"
                    onClick={goToday}
                    className="h-9 px-3.5 rounded-full border border-border text-[13px] font-medium hover:bg-muted/60 transition-colors"
                >
                    Aujourd&apos;hui
                </button>
                <div className="flex items-center">
                    <button
                        type="button"
                        aria-label="Mois précédent"
                        onClick={() => setMonth((m) => subMonths(m, 1))}
                        className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted/70"
                    >
                        <ChevronLeft size={18} />
                    </button>
                    <button
                        type="button"
                        aria-label="Mois suivant"
                        onClick={() => setMonth((m) => addMonths(m, 1))}
                        className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted/70"
                    >
                        <ChevronRight size={18} />
                    </button>
                </div>
                <h2 className="text-lg sm:text-xl font-normal tracking-tight capitalize text-foreground min-w-0 truncate">
                    {format(month, "MMMM yyyy", { locale: fr })}
                </h2>

                <div className="ml-auto flex items-center gap-2">
                    {actionableCount > 0 && (
                        <span className="hidden sm:inline text-[12px] text-muted-foreground tabular-nums">
                            {actionableCount} à faire
                        </span>
                    )}
                    <span className="hidden md:inline-flex items-center gap-1 h-8 px-2.5 rounded-full bg-muted/60 text-[11px] text-muted-foreground border border-border/60">
                        {scope === "all" ? <Layers size={11} /> : <Building2 size={11} />}
                        {scope === "all" ? "Tous les espaces" : (activeWorkspace?.name || "Espace")}
                    </span>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                data-testid="calendar-scope-menu"
                                aria-label="Options"
                                className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted/70"
                            >
                                <MoreHorizontal size={18} />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 rounded-xl">
                            <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                                Portée
                            </DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => setScope("all")} className="gap-2" data-testid="calendar-scope-all">
                                <Layers size={14} /> Tous les espaces
                                {scope === "all" && <Check size={14} className="ml-auto text-primary" />}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => activeWorkspace && setScope("current")}
                                disabled={!activeWorkspace}
                                className="gap-2"
                                data-testid="calendar-scope-current"
                            >
                                <Building2 size={14} /> Espace courant
                                {scope === "current" && <Check size={14} className="ml-auto text-primary" />}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel className="text-[11px] font-normal normal-case tracking-normal text-muted-foreground">
                                Cliquez un jour pour voir l&apos;agenda.
                            </DropdownMenuLabel>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* ── Body : grille + panneau ── */}
            <div
                className={cn(
                    "flex flex-col lg:flex-row flex-1 min-h-0",
                    isDialog ? "min-h-[520px] max-h-[min(82vh,760px)]" : "min-h-[640px]"
                )}
            >
                {/* Grille mois */}
                <div className="flex-1 min-w-0 flex flex-col border-b lg:border-b-0 lg:border-r border-border">
                    <div className="grid grid-cols-7 border-b border-border shrink-0">
                        {WEEKDAYS.map((d) => (
                            <div
                                key={d}
                                className="py-2 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                            >
                                {d}
                            </div>
                        ))}
                    </div>

                    <div className="flex-1 grid grid-cols-7 auto-rows-fr min-h-0">
                        {gridDays.map((day) => {
                            const key = toLocalDateKey(day);
                            const inMonth = isSameMonth(day, month);
                            const isToday = key === todayKey;
                            const isSel = isSameDay(day, selected);
                            const dayEv = byDay.get(key) || [];
                            const maxChips = isDialog ? 2 : 3;
                            const extra = Math.max(0, dayEv.length - maxChips);

                            return (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => setSelected(startOfDay(day))}
                                    className={cn(
                                        "relative flex flex-col items-stretch text-left p-1 sm:p-1.5 border-b border-r border-border/70",
                                        "min-h-[72px] sm:min-h-[96px] lg:min-h-[110px] transition-colors",
                                        "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40",
                                        !inMonth && "bg-muted/20",
                                        isSel && "bg-primary/[0.06]"
                                    )}
                                >
                                    <span
                                        className={cn(
                                            "self-start mb-1 inline-flex items-center justify-center w-7 h-7 rounded-full text-[13px] tabular-nums",
                                            !inMonth && "text-muted-foreground/45",
                                            isToday && "bg-primary text-primary-foreground font-semibold",
                                            isSel && !isToday && "bg-foreground/10 font-semibold",
                                            inMonth && !isToday && !isSel && "text-foreground"
                                        )}
                                    >
                                        {day.getDate()}
                                    </span>
                                    <div className="flex flex-col gap-0.5 w-full min-w-0 flex-1 overflow-hidden">
                                        {dayEv.slice(0, maxChips).map((ev) => {
                                            const meta = CALENDAR_EVENT_META[ev.type] || CALENDAR_EVENT_META.rappel;
                                            return (
                                                <span
                                                    key={ev.id}
                                                    className={cn(
                                                        "block truncate rounded-sm px-1 py-0.5 text-[10px] sm:text-[11px] font-medium leading-tight",
                                                        meta.chip
                                                    )}
                                                    title={`${ev.title} — ${ev.subtitle || ""}`}
                                                >
                                                    {formatEventTime(ev.dueAt)
                                                        ? `${formatEventTime(ev.dueAt)} `
                                                        : ""}
                                                    {ev.title}
                                                </span>
                                            );
                                        })}
                                        {extra > 0 && (
                                            <span className="text-[10px] text-muted-foreground px-1 font-medium">
                                                +{extra} autre{extra > 1 ? "s" : ""}
                                            </span>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Panneau jour */}
                <aside
                    className={cn(
                        "flex flex-col bg-card shrink-0",
                        isDialog ? "lg:w-[300px]" : "lg:w-[340px]",
                        "max-h-[360px] lg:max-h-none"
                    )}
                >
                    <div className="px-4 py-4 border-b border-border shrink-0">
                        <p className="text-[15px] font-medium capitalize tracking-tight">
                            {format(selected, "EEEE d MMMM", { locale: fr })}
                        </p>
                        <p className="text-[12px] text-muted-foreground mt-0.5">
                            {dayEvents.length === 0
                                ? "Aucun événement"
                                : `${dayEvents.length} événement${dayEvents.length > 1 ? "s" : ""}`}
                            {selectedKey === todayKey ? " · aujourd'hui" : ""}
                        </p>
                    </div>

                    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
                        {dayEvents.length === 0 && (
                            <p className="text-sm text-muted-foreground text-center py-10 px-4">
                                Rien de planifié ce jour-là.
                                <br />
                                <span className="text-[12px]">Cliquez un autre jour ou ajoutez un rappel depuis une fiche.</span>
                            </p>
                        )}
                        {dayEvents.map((ev) => {
                            const meta = CALENDAR_EVENT_META[ev.type] || CALENDAR_EVENT_META.rappel;
                            const time = formatEventTime(ev.dueAt);
                            const overdue = ev.type !== "contact"
                                && (ev.dateKey < todayKey || ev.meta?.overdueCarry);
                            return (
                                <button
                                    key={ev.id + (ev.meta?.overdueCarry ? ":over" : "")}
                                    type="button"
                                    data-testid={`calendar-event-${ev.leadId}`}
                                    onClick={() => handleOpenLead(ev.workspaceId, ev.leadId)}
                                    className={cn(
                                        "w-full text-left rounded-lg border border-border/80 px-3 py-2.5",
                                        "hover:bg-muted/50 hover:border-border transition-colors flex gap-3",
                                        overdue && "border-rose-500/35 bg-rose-500/[0.04]"
                                    )}
                                >
                                    <span className={cn("w-1 self-stretch rounded-full shrink-0", meta.dot)} />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-baseline gap-2">
                                            {time && (
                                                <span className="text-[12px] tabular-nums text-muted-foreground shrink-0">
                                                    {time}
                                                </span>
                                            )}
                                            <span className="text-[13px] font-medium truncate">{ev.title}</span>
                                        </div>
                                        <p className="text-[12px] text-muted-foreground truncate mt-0.5">
                                            {ev.subtitle}
                                        </p>
                                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                            <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded border", meta.chip)}>
                                                {meta.label}
                                            </span>
                                            {showWsChip && (
                                                <span className="text-[10px] text-muted-foreground truncate">
                                                    {ev.workspaceName}
                                                </span>
                                            )}
                                            {overdue && (
                                                <span className="text-[10px] font-medium text-rose-600 dark:text-rose-400">
                                                    en retard
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <ChevronRight size={14} className="text-muted-foreground/40 shrink-0 mt-1" />
                                </button>
                            );
                        })}
                    </div>

                    {watchList.length > 0 && (
                        <div className="border-t border-border px-3 py-3 shrink-0 max-h-[160px] overflow-y-auto bg-muted/30">
                            <div className="flex items-center gap-1.5 mb-2">
                                <AlertTriangle size={12} className="text-rose-500" />
                                <span className="text-[11px] font-semibold">À surveiller</span>
                                <span className="text-[10px] text-muted-foreground">· {watchList.length}</span>
                            </div>
                            <div className="space-y-1">
                                {watchList.slice(0, isDialog ? 5 : 8).map((ev) => (
                                    <div
                                        key={ev.id}
                                        className="flex items-center gap-1 rounded-md hover:bg-background/80"
                                        data-testid={`calendar-watch-${ev.leadId}`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => handleOpenLead(ev.workspaceId, ev.leadId)}
                                            className="flex-1 min-w-0 text-left px-2 py-1.5 flex items-center gap-2"
                                        >
                                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                                            <span className="text-[12px] font-medium truncate flex-1">{ev.title}</span>
                                            <span className="text-[10px] text-rose-600 tabular-nums shrink-0">
                                                {ev.meta?.daysSince} j
                                            </span>
                                        </button>
                                        <QuickScheduleButton
                                            company={ev.company || ev.title}
                                            defaultLabel={`Rappeler ${ev.company || ev.title}`}
                                            hint={ev.subtitle}
                                            size="xs"
                                            testId={`calendar-watch-schedule-${ev.leadId}`}
                                            onConfirm={(nextAction) => {
                                                const result = scheduleLeadNextAction(dispatch, {
                                                    workspace: state.workspaces[ev.workspaceId],
                                                    leadId: ev.leadId,
                                                    nextAction,
                                                    move: true,
                                                });
                                                toast.success("Rappel placé", {
                                                    description: result.moved && result.toColumnName
                                                        ? `${nextAction.label} · → ${result.toColumnName}`
                                                        : nextAction.label,
                                                });
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </aside>
            </div>
        </div>
    );
}
