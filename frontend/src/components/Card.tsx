"use client";

import type { HTMLAttributes, ReactNode } from "react";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  /** Pulled forward visually when true (e.g. while it's the active panel). */
  active?: boolean;
};

/**
 * Frosted-glass surface used as the base for every panel on the page.
 * Concentrates the styling once so each panel can focus on content.
 */
export function Card({
  children,
  active = false,
  className = "",
  ...rest
}: CardProps) {
  return (
    <div
      {...rest}
      className={[
        "relative rounded-2xl border backdrop-blur",
        "transition-[border-color,background-color,box-shadow] duration-300",
        active
          ? "border-white/25 bg-white/[0.06] shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_8px_30px_-10px_rgba(99,102,241,0.5)]"
          : "border-white/10 bg-white/[0.025] hover:border-white/15",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

type CardHeaderProps = {
  title: string;
  subtitle?: ReactNode;
  className?: string;
};

export function CardHeader({ title, subtitle, className = "" }: CardHeaderProps) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${className}`}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
        {title}
      </span>
      {subtitle && <span className="text-xs text-white/60">{subtitle}</span>}
    </div>
  );
}
