"use client";

type KeyButtonProps = {
  label: string;
  /** When true, fully highlighted in the active colour. */
  isActive: boolean;
  /** When true, dimmer "this group is locked" highlight (no fill). */
  isLocked?: boolean;
  /** Hex/CSS colour used for the active state. */
  highlightColor: string;
};

/**
 * A single scanner cell — letter, command, anything that's part of the
 * row-column scan. The visual states are:
 *
 *   - active   : filled with the highlight colour, glowing ring
 *   - locked   : transparent fill, coloured ring (group has been chosen,
 *                we're scanning letters within it)
 *   - resting  : muted surface
 */
export function KeyButton({
  label,
  isActive,
  isLocked = false,
  highlightColor,
}: KeyButtonProps) {
  return (
    <div
      className={[
        "flex aspect-square items-center justify-center rounded-xl text-2xl font-bold tabular-nums",
        "transition-[transform,background-color,color,box-shadow] duration-200",
        "select-none sm:text-3xl",
        isActive ? "scale-[1.04] text-black" : "text-white/90",
      ].join(" ")}
      style={
        isActive
          ? {
              backgroundColor: highlightColor,
              boxShadow: `0 0 0 2px ${highlightColor}, 0 8px 28px -8px ${highlightColor}`,
            }
          : isLocked
            ? {
                backgroundColor: "rgba(255,255,255,0.04)",
                boxShadow: `inset 0 0 0 2px ${highlightColor}`,
              }
            : {
                backgroundColor: "rgba(255,255,255,0.05)",
                boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)",
              }
      }
    >
      {label}
    </div>
  );
}
