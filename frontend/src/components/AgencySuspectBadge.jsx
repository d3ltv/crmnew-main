import React from "react";
import { Building2 } from "lucide-react";

const CHIP_CLS =
    "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300";

/**
 * Signal visuel « cabinet / agence » — palette orange (distinct du rose process).
 * @param {{ score: number, label?: string, variant?: "chip" | "line" | "compact" }} props
 */
export function AgencySuspectBadge({ score, label, variant = "chip" }) {
    const title = label || `Suspect à ${score}% d'être un cabinet de recrutement`;

    if (variant === "line") {
        return (
            <div
                className="mt-1 text-[11px] font-medium leading-snug text-orange-700/90 dark:text-orange-300/90"
                title={title}
                data-testid="agency-suspect-line"
            >
                {title}
            </div>
        );
    }

    if (variant === "compact") {
        return (
            <span className={CHIP_CLS} title={title} data-testid="agency-suspect-badge">
                <Building2 size={9} strokeWidth={2.5} className="shrink-0" />
            </span>
        );
    }

    return (
        <span className={CHIP_CLS} title={title} data-testid="agency-suspect-badge">
            <Building2 size={9} strokeWidth={2.5} className="shrink-0" />
            <span>Cabinet</span>
            <span className="tabular-nums opacity-80">{score}%</span>
        </span>
    );
}

export const AGENCY_NAME_CLS = "text-orange-700 dark:text-orange-300";
