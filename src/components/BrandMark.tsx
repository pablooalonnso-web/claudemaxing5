import { MARK_PATH, MARK_VIEWBOX } from "@/lib/brand-mark";

/** Four-petal mark used in the header, footer, cards and favicon. */
export function BrandMark({
  size = 32,
  circle = false,
  color = "currentColor",
  disc = "#3D3B4F",
}: {
  size?: number;
  /** Draw the mark inside a filled disc (avatar style). */
  circle?: boolean;
  /** Fill colour of the mark itself. */
  color?: string;
  /** Disc colour when `circle` is set. */
  disc?: string;
}) {
  return (
    <svg width={size} height={size} viewBox={MARK_VIEWBOX} aria-hidden="true" focusable="false">
      {circle ? <circle cx="50" cy="50" r="50" fill={disc} /> : null}
      <path d={MARK_PATH} fill={color} fillRule="evenodd" transform={circle ? "translate(50 50) scale(0.62) translate(-50 -50)" : undefined} />
    </svg>
  );
}
