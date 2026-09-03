import { Button } from "./button.jsx";
import { cn } from "../../lib/utils.js";

export function relativeActivityTime(iso) {
  if (!iso) return "";
  try {
    const time = typeof iso === "number" ? iso : new Date(iso).getTime();
    if (isNaN(time)) return "";
    const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  } catch {
    return "";
  }
}

export function SituationShell({
  density = "row",
  eyebrow,
  title,
  href,
  pulse,
  metaLine,
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  secondary,
  children,
  onClick,
  className,
}) {
  return (
    <article
      onClick={onClick}
      className={cn(
        "relative rounded-xl border border-border/80 bg-card/60 backdrop-blur-xs transition-all duration-150 ease-out hover:border-border hover:bg-card/90 hover:shadow-xs",
        density === "card" && "flex h-full min-h-[9rem] flex-col p-4",
        density === "row" && "px-4 py-3",
        onClick && "cursor-pointer",
        className
      )}
    >
      <div
        className={cn(
          "flex gap-3",
          density === "row" && "items-center",
          density === "card" && "flex-1 flex-col justify-between"
        )}
      >
        <div className="min-w-0 flex-1">
          {(eyebrow || metaLine) && (
            <div className="mb-1 flex flex-wrap items-center gap-2">
              {eyebrow && (
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                  {eyebrow}
                </span>
              )}
              {metaLine && (
                <span className="text-[11px] text-muted-foreground">
                  {metaLine}
                </span>
              )}
            </div>
          )}

          {title && (
            <h4 className="truncate text-[13.5px] font-semibold text-foreground leading-tight tracking-[-0.01em]">
              {title}
            </h4>
          )}

          {pulse && (
            <p
              className={cn(
                "mt-1 text-[12.5px] text-foreground-secondary leading-snug",
                density === "card" && "line-clamp-2"
              )}
            >
              {pulse}
            </p>
          )}

          {children}
        </div>

        {(primaryLabel || secondary) && (
          <div
            className={cn(
              "flex shrink-0 items-center gap-2",
              density === "card" && "mt-3 justify-end pt-2 border-t border-border/40"
            )}
          >
            {primaryLabel && onPrimary && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-[12px] font-medium border-border/80 hover:bg-foreground/[0.06] hover:text-foreground"
                disabled={primaryDisabled}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onPrimary();
                }}
              >
                {primaryLabel}
              </Button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
