import React, { useState } from "react";
import { useCrm } from "@/context/CrmContext";
import {
    Plus,
    LayoutGrid,
    Home,
    ChevronLeft,
    ChevronRight,
} from "lucide-react";
import { CreateWorkspaceDialog } from "./CreateWorkspaceDialog";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

export const SidebarContent = ({
    collapsed = false,
    onToggleCollapsed,
    onNavigate,
    forceExpanded = false,
}) => {
    const { state, dispatch } = useCrm();
    const [open, setOpen] = useState(false);
    const workspaces = state.order.map((id) => state.workspaces[id]);
    const isCollapsed = forceExpanded ? false : collapsed;

    const handleSelect = (id) => {
        dispatch({ type: "SELECT_WORKSPACE", id });
        onNavigate?.();
    };

    return (
        <TooltipProvider delayDuration={200}>
            <div className="h-full flex flex-col">
                {/* Header */}
                <div
                    className={`h-14 flex items-center border-b border-border/60 shrink-0 ${isCollapsed ? "justify-center px-2" : "px-4 gap-2"}`}
                >
                    <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <LayoutGrid size={16} />
                    </div>
                    {!isCollapsed && (
                        <span className="font-semibold tracking-tight">
                            CRM
                        </span>
                    )}
                    {!isCollapsed && onToggleCollapsed && (
                        <button
                            data-testid="sidebar-collapse-btn"
                            onClick={onToggleCollapsed}
                            aria-label="Réduire la barre latérale"
                            className="ml-auto w-8 h-8 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground flex items-center justify-center"
                        >
                            <ChevronLeft size={15} />
                        </button>
                    )}
                </div>

                {isCollapsed && onToggleCollapsed && (
                    <button
                        data-testid="sidebar-expand-btn"
                        onClick={onToggleCollapsed}
                        aria-label="Développer la barre latérale"
                        className="mx-2 mt-3 h-9 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground flex items-center justify-center"
                    >
                        <ChevronRight size={15} />
                    </button>
                )}

                {/* Home */}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            data-testid="sidebar-home-btn"
                            onClick={() => handleSelect(null)}
                            className={`mx-2 mt-3 flex items-center h-11 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors ${isCollapsed ? "justify-center" : "px-3 gap-2"}`}
                        >
                            <Home size={16} />
                            {!isCollapsed && "Tous les espaces"}
                        </button>
                    </TooltipTrigger>
                    {isCollapsed && (
                        <TooltipContent side="right">
                            Tous les espaces
                        </TooltipContent>
                    )}
                </Tooltip>

                {/* Workspaces list */}
                <div className="px-2 mt-4 flex-1 overflow-y-auto no-scrollbar">
                    <div
                        className={`flex items-center mb-2 ${isCollapsed ? "justify-center" : "px-2 justify-between"}`}
                    >
                        {!isCollapsed && (
                            <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                                Espaces
                            </span>
                        )}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    data-testid="sidebar-add-workspace-btn"
                                    aria-label="Créer un espace"
                                    onClick={() => setOpen(true)}
                                    className="w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary flex items-center justify-center"
                                >
                                    <Plus size={14} />
                                </button>
                            </TooltipTrigger>
                            {isCollapsed && (
                                <TooltipContent side="right">
                                    Créer un espace
                                </TooltipContent>
                            )}
                        </Tooltip>
                    </div>
                    <nav className="space-y-0.5">
                        {workspaces.map((ws) => {
                            const active = state.currentId === ws.id;
                            const initial = (ws.name?.[0] || "?").toUpperCase();
                            return (
                                <Tooltip key={ws.id}>
                                    <TooltipTrigger asChild>
                                        <button
                                            data-testid={`sidebar-ws-${ws.id}`}
                                            onClick={() => handleSelect(ws.id)}
                                            className={`w-full h-11 rounded-lg text-sm truncate flex items-center transition-colors ${
                                                active
                                                    ? "bg-primary/10 text-primary font-medium"
                                                    : "text-foreground/80 hover:bg-secondary"
                                            } ${isCollapsed ? "justify-center" : "px-3 gap-2 text-left"}`}
                                        >
                                            {isCollapsed ? (
                                                <span
                                                    className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-semibold ${active ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
                                                >
                                                    {initial}
                                                </span>
                                            ) : (
                                                <>
                                                    <span
                                                        className={`w-1.5 h-1.5 rounded-full ${active ? "bg-primary" : "bg-muted-foreground/40"}`}
                                                    />
                                                    <span className="truncate flex-1">
                                                        {ws.name}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {
                                                            Object.keys(
                                                                ws.leads,
                                                            ).length
                                                        }
                                                    </span>
                                                </>
                                            )}
                                        </button>
                                    </TooltipTrigger>
                                    {isCollapsed && (
                                        <TooltipContent side="right">
                                            {ws.name}
                                            <span className="ml-2 text-muted-foreground">
                                                {
                                                    Object.keys(ws.leads)
                                                        .length
                                                }
                                            </span>
                                        </TooltipContent>
                                    )}
                                </Tooltip>
                            );
                        })}
                    </nav>
                </div>

                <CreateWorkspaceDialog open={open} onOpenChange={setOpen} />
            </div>
        </TooltipProvider>
    );
};

export const Sidebar = ({ collapsed, onToggleCollapsed }) => {
    return (
        <aside
            data-testid="sidebar"
            className={`hidden md:flex flex-col shrink-0 border-r border-border/60 bg-background h-screen sticky top-0 transition-[width] duration-200 ease-out ${collapsed ? "w-14" : "w-56"}`}
        >
            <SidebarContent
                collapsed={collapsed}
                onToggleCollapsed={onToggleCollapsed}
            />
        </aside>
    );
};
