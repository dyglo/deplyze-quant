import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Surface / Panel — the shared card-surface primitives.
 *
 * These wrap the centralized `ds-surface` token utilities (see index.css) so
 * every card/panel in the app shares one elevation, radius, and border
 * treatment instead of hand-rolling `background + 1px border + borderRadius`
 * inline (which drifted across radius 8/10/12). Functional bordered controls
 * (inputs, buttons, chips, table rules) are intentionally NOT this — they keep
 * their own borders.
 */

type SurfaceVariant = "default" | "inset" | "ghost"

const SURFACE_CLASS: Record<SurfaceVariant, string> = {
  default: "ds-surface",
  inset: "ds-surface-inset",
  ghost: "ds-surface-ghost",
}

export interface SurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: SurfaceVariant
}

/** Flat card surface — bg + hairline border + token radius. */
export const Surface = React.forwardRef<HTMLDivElement, SurfaceProps>(
  ({ variant = "default", className, ...props }, ref) => (
    <div ref={ref} className={cn(SURFACE_CLASS[variant], className)} {...props} />
  ),
)
Surface.displayName = "Surface"

export interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: React.ReactNode
  subtitle?: React.ReactNode
  icon?: React.ReactNode
  actions?: React.ReactNode
  /** Hairline divider under the header. Default true. Set false to separate by space. */
  divider?: boolean
  /** Remove default content padding — for tables / flush content. */
  flush?: boolean
  contentStyle?: React.CSSProperties
}

/** Titled card surface with an optional header row + content region. */
export const Panel = React.forwardRef<HTMLDivElement, PanelProps>(
  (
    { title, subtitle, icon, actions, divider = true, flush = false, children, className, style, contentStyle, ...props },
    ref,
  ) => {
    const hasHeader = title != null || actions != null || icon != null
    return (
      <div
        ref={ref}
        className={cn("ds-surface", className)}
        style={{ overflow: "hidden", ...style }}
        {...props}
      >
        {hasHeader && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
              padding: "12px 16px 10px",
              borderBottom: divider ? "1px solid var(--border)" : undefined,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              {icon && <div style={{ flexShrink: 0, color: "var(--primary)" }}>{icon}</div>}
              <div style={{ minWidth: 0 }}>
                {title && (
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "var(--foreground)", letterSpacing: "-0.01em" }}>
                    {title}
                  </p>
                )}
                {subtitle && (
                  <p style={{ margin: "2px 0 0", fontSize: 10, color: "var(--muted-foreground)" }}>{subtitle}</p>
                )}
              </div>
            </div>
            {actions && <div style={{ flexShrink: 0 }}>{actions}</div>}
          </div>
        )}
        <div style={{ padding: flush ? 0 : "14px 16px", ...contentStyle }}>{children}</div>
      </div>
    )
  },
)
Panel.displayName = "Panel"
