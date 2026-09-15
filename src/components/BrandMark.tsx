const PETAL = "M6 6C11 6 14 10 14 14V18C9 18 6 14 6 10Z";

/** Four-petal mark used in the header, footer and favicon. */
export function BrandMark({
  size = 32,
  circle = true,
  accent = "#1f8a5b",
  petal = "#f8f7f3",
  disc = "#242b27",
}: {
  size?: number;
  circle?: boolean;
  accent?: string;
  petal?: string;
  disc?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      {circle ? <circle cx="16" cy="16" r="16" fill={disc} /> : null}
      {[0, 90, 180, 270].map((deg) => (
        <path key={deg} d={PETAL} transform={`rotate(${deg} 16 16)`} fill={deg % 180 === 0 ? accent : petal} />
      ))}
    </svg>
  );
}
