import cubes from "@/data/footer-cubes.json";
import { MARK_PATH } from "@/lib/brand-mark";

/**
 * Isometric field of brand cubes that closes every page. Each cube carries the
 * four-petal mark on its top face and lights up green on hover.
 */
export function FooterCubes() {
  const { viewBox, items } = cubes as { viewBox: string; items: [number, number, number, number][] };
  return (
    <svg viewBox={viewBox} className="gf-cubes" aria-hidden="true" focusable="false">
      <defs>
        <g id="sw-cube">
          <rect width="367" height="420" fill="transparent" />
          <path d="M187 0 L362.6 164.2 L178.7 321.5 L3.1 157.2 Z" />
          <rect width="236.453" height="83.4566" transform="matrix(0.75471 -0.656059 0 1 188.017 336.544)" />
          <rect width="236.453" height="83.4566" transform="matrix(0.731354 0.681998 0 1 0 174.962)" />
          <g transform="translate(183 160) scale(1.5) rotate(45) translate(-50 -50)" className="gf-cube-mark">
            <path d={MARK_PATH} fillRule="evenodd" />
          </g>
        </g>
      </defs>
      {items.map(([x, y, r, s], i) => (
        <use key={i} href="#sw-cube" className="gf-cube" transform={`translate(${x}, ${y}) rotate(${r}, 89.75, 103) scale(${s})`} />
      ))}
    </svg>
  );
}
