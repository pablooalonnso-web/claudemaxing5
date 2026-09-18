import { getT } from "@/i18n/server";

/* Blueprint-style vector art used inside the hatched frames on the home page. Labels come from the `home` namespace (`art.*`). */

function Grid({ color = "#C5FFD6", size = 24, opacity = 0.35 }: { color?: string; size?: number; opacity?: number }) {
  const lines = [];
  for (let x = 0; x <= 600; x += size) lines.push(<line key={`v${x}`} x1={x} y1={0} x2={x} y2={400} />);
  for (let y = 0; y <= 400; y += size) lines.push(<line key={`h${y}`} x1={0} y1={y} x2={600} y2={y} />);
  return (
    <g stroke={color} strokeWidth="0.6" opacity={opacity}>
      {lines}
    </g>
  );
}

/** STEP 01: a USDG deposit split into two legs and joined into a pool. */
export async function DepositArt() {
  const t = await getT("home");
  return (
    <svg viewBox="0 0 600 400" className="home-art" aria-hidden="true">
      <rect width="600" height="400" fill="#3D3B4F" />
      <Grid color="#FFCFFE" size={30} opacity={0.14} />
      <g fill="none" stroke="#C5FFD6" strokeWidth="1.2">
        <path d="M60 200 C 160 200, 160 120, 260 120 L 340 120" className="g-marching" />
        <path d="M60 200 C 160 200, 160 280, 260 280 L 340 280" className="g-marching" />
        <path d="M400 120 C 460 120, 460 200, 520 200" />
        <path d="M400 280 C 460 280, 460 200, 520 200" />
      </g>
      <g fontFamily="var(--font-mono), monospace" fontSize="11" fill="#FFCFFE" letterSpacing="1">
        <rect x="20" y="182" width="80" height="36" fill="#28E99F" />
        <text x="60" y="205" textAnchor="middle" fill="#000" fontWeight="700">
          USDG
        </text>
        <rect x="340" y="102" width="60" height="36" fill="#FFACFE" />
        <text x="370" y="125" textAnchor="middle" fill="#3D3B4F" fontWeight="700">
          {t("art.deposit.stock")}
        </text>
        <rect x="340" y="262" width="60" height="36" fill="#C5FFD6" />
        <text x="370" y="285" textAnchor="middle" fill="#3D3B4F" fontWeight="700">
          USDG
        </text>
        <text x="200" y="108" textAnchor="middle" fill="#DAFF01">
          {t("art.deposit.swap")}
        </text>
        <text x="200" y="312" textAnchor="middle" fill="#DAFF01">
          {t("art.deposit.keep")}
        </text>
      </g>
      <g transform="translate(520 200)">
        <circle r="46" fill="#5882FF" opacity="0.25" />
        <circle r="46" fill="none" stroke="#5882FF" strokeWidth="1.2" strokeDasharray="4 4" className="g-marching" />
        <g stroke="#D1E5FF" strokeWidth="0.8" fill="none" opacity="0.8">
          <ellipse rx="46" ry="16" />
          <ellipse rx="46" ry="30" />
          <ellipse rx="16" ry="46" />
          <ellipse rx="30" ry="46" />
        </g>
        <text y="70" textAnchor="middle" fontFamily="var(--font-mono), monospace" fontSize="11" fill="#FFCFFE" letterSpacing="1">
          {t("art.deposit.pool")}
        </text>
      </g>
      <g fill="#DAFF01">
        <rect x="336" y="98" width="6" height="6" />
        <rect x="396" y="132" width="6" height="6" />
        <rect x="336" y="292" width="6" height="6" />
        <rect x="396" y="258" width="6" height="6" />
      </g>
    </svg>
  );
}

/** STEP 02: concentrated liquidity around the oracle price. */
export async function RangeArt() {
  const t = await getT("home");
  const bars = [8, 14, 22, 36, 58, 84, 100, 84, 58, 36, 22, 14, 8];
  return (
    <svg viewBox="0 0 600 400" className="home-art" aria-hidden="true">
      <rect width="600" height="400" fill="#3D3B4F" />
      <Grid color="#C5FFD6" size={24} opacity={0.16} />
      <g transform="translate(90 60)">
        {bars.map((h, i) => (
          <rect key={i} x={i * 32} y={240 - h * 2.2} width="22" height={h * 2.2} fill={i >= 4 && i <= 8 ? "#28E99F" : "#756CF5"} opacity={i >= 4 && i <= 8 ? 0.9 : 0.45} />
        ))}
        <line x1="-20" y1="240" x2="440" y2="240" stroke="#FFCFFE" strokeWidth="1" />
        <rect x="126" y="-10" width="166" height="262" fill="none" stroke="#DAFF01" strokeWidth="1.2" strokeDasharray="5 5" className="g-marching" />
        <line x1="203" y1="-30" x2="203" y2="250" stroke="#FFACFE" strokeWidth="1.5" />
        <g fontFamily="var(--font-mono), monospace" fontSize="11" letterSpacing="1">
          <text x="126" y="270" textAnchor="middle" fill="#FFCFFE">
            {t("art.range.lower")}
          </text>
          <text x="292" y="270" textAnchor="middle" fill="#FFCFFE">
            {t("art.range.upper")}
          </text>
          <text x="203" y="-38" textAnchor="middle" fill="#FFACFE">
            {t("art.range.oracle")}
          </text>
          <text x="440" y="235" textAnchor="end" fill="#C5FFD6" opacity="0.7">
            {t("art.range.liquidity")}
          </text>
        </g>
        <g fill="#DAFF01">
          <rect x="122" y="-14" width="8" height="8" />
          <rect x="288" y="-14" width="8" height="8" />
          <rect x="122" y="248" width="8" height="8" />
          <rect x="288" y="248" width="8" height="8" />
        </g>
      </g>
    </svg>
  );
}

/** STEP 03: the fee split: 70 compounds, 20 buyback, 10 treasury. */
export async function FeeSplitArt() {
  const t = await getT("home");
  return (
    <svg viewBox="0 0 600 400" className="home-art" aria-hidden="true">
      <rect width="600" height="400" fill="#3D3B4F" />
      <Grid color="#FFCFFE" size={30} opacity={0.12} />
      <g fill="none" stroke="#5882FF" strokeWidth="0.9" opacity="0.8" transform="translate(300 200)">
        {[0, 20, 40, 60, 80, 100, 120, 140, 160].map((deg) => (
          <ellipse key={deg} rx="150" ry="52" transform={`rotate(${deg})`} />
        ))}
        <circle r="150" strokeDasharray="4 6" />
      </g>
      <g fontFamily="var(--font-mono), monospace" fontSize="11" letterSpacing="1">
        <rect x="80" y="70" width="120" height="44" fill="#28E99F" />
        <text x="140" y="90" textAnchor="middle" fill="#000" fontWeight="700">
          70%
        </text>
        <text x="140" y="105" textAnchor="middle" fill="#000">
          {t("art.split.compounds")}
        </text>
        <rect x="400" y="300" width="120" height="44" fill="#DAFF01" />
        <text x="460" y="320" textAnchor="middle" fill="#3D3B4F" fontWeight="700">
          20%
        </text>
        <text x="460" y="335" textAnchor="middle" fill="#3D3B4F">
          {t("art.split.buyback")}
        </text>
        <rect x="80" y="300" width="120" height="44" fill="#FFCFFE" />
        <text x="140" y="320" textAnchor="middle" fill="#3D3B4F" fontWeight="700">
          10%
        </text>
        <text x="140" y="335" textAnchor="middle" fill="#3D3B4F">
          {t("art.split.treasury")}
        </text>
        <text x="300" y="206" textAnchor="middle" fill="#FFCFFE" fontSize="13">
          {t("art.split.claimed")}
        </text>
      </g>
      <g fill="none" stroke="#C5FFD6" strokeWidth="1.2" strokeDasharray="5 5" className="g-marching">
        <path d="M300 180 L 200 114" />
        <path d="M300 220 L 400 300" />
      </g>
      <g fill="#28E99F">
        <rect x="296" y="176" width="8" height="8" />
      </g>
    </svg>
  );
}

/** Lending art: vault shares pledged as collateral, USDG borrowed. */
export async function LendingArt() {
  const t = await getT("home");
  return (
    <svg viewBox="0 0 600 400" className="home-art" aria-hidden="true">
      <rect width="600" height="400" fill="#EEEEEE" />
      <Grid color="#5882FF" size={24} opacity={0.18} />
      <g fill="none" stroke="#5882FF" strokeWidth="0.9" opacity="0.8">
        <g transform="translate(200 200)">
          {[0, 30, 60, 90, 120, 150].map((d) => (
            <ellipse key={d} rx="120" ry="40" transform={`rotate(${d})`} />
          ))}
        </g>
        <g transform="translate(400 200)">
          {[0, 30, 60, 90, 120, 150].map((d) => (
            <ellipse key={d} rx="120" ry="40" transform={`rotate(${d})`} />
          ))}
        </g>
      </g>
      <g fontFamily="var(--font-mono), monospace" fontSize="11" letterSpacing="1" fill="#3D3B4F">
        <rect x="150" y="60" width="100" height="30" fill="#FFACFE" />
        <text x="200" y="80" textAnchor="middle" fontWeight="700">
          {t("art.lending.collateral")}
        </text>
        <rect x="350" y="310" width="100" height="30" fill="#28E99F" />
        <text x="400" y="330" textAnchor="middle" fontWeight="700">
          {t("art.lending.borrow")}
        </text>
        <text x="300" y="205" textAnchor="middle" fill="#756CF5" fontSize="12">
          {t("art.lending.params")}
        </text>
      </g>
      <g fill="#FFACFE">
        <rect x="286" y="150" width="10" height="10" />
        <rect x="330" y="236" width="10" height="10" />
        <rect x="250" y="250" width="10" height="10" />
      </g>
    </svg>
  );
}

/** Stack cards: a partner mark centred on a faint wireframe. */
export async function CtaArt() {
  const t = await getT("home");
  const nodes = [
    [300, 30],
    [80, 100],
    [520, 100],
    [80, 330],
    [520, 330],
    [300, 400],
  ];
  return (
    <svg viewBox="0 0 600 440" className="home-cta-art" aria-hidden="true">
      <g fill="none" stroke="#C5FFD6" strokeWidth="1" strokeDasharray="4 5" opacity="0.7">
        {nodes.map(([x, y], i) => (
          <line key={i} x1="300" y1="215" x2={x} y2={y} />
        ))}
        <polygon points="300,30 520,100 520,330 300,400 80,330 80,100" />
      </g>
      {nodes.map(([x, y], i) => (
        <g key={i} transform={`translate(${x - 30} ${y - 22})`}>
          <rect width="60" height="8" fill="#FFACFE" />
          <rect y="11" width="60" height="8" fill="#28E99F" />
          <rect y="22" width="60" height="8" fill="#28E99F" />
          <text x="30" y="44" textAnchor="middle" fontFamily="var(--font-mono), monospace" fontSize="10" letterSpacing="1.5" fill="#EEEEEE">
            {t("art.cta.fees")}
          </text>
        </g>
      ))}
      <g transform="translate(150 130)">
        <rect width="300" height="170" fill="#EEEEEE" />
        <text x="12" y="22" fontFamily="var(--font-mono), monospace" fontSize="10" fill="#3D3B4F" opacity="0.6">
          AAPL / USDG
        </text>
        <rect x="0" y="32" width="300" height="20" fill="#FFCFFE" />
        <text x="24" y="46" fontFamily="var(--font-mono), monospace" fontSize="10" fill="#3D3B4F">
          {t("art.cta.lower")}
        </text>
        <rect x="0" y="54" width="300" height="20" fill="#C5FFD6" />
        <text x="24" y="68" fontFamily="var(--font-mono), monospace" fontSize="10" fill="#3D3B4F">
          {t("art.cta.current")}
        </text>
        <rect x="0" y="76" width="300" height="20" fill="#C5FFD6" />
        <text x="24" y="90" fontFamily="var(--font-mono), monospace" fontSize="10" fill="#3D3B4F">
          {t("art.cta.upper")}
        </text>
        <g transform="translate(12 118)">
          <circle cx="6" cy="6" r="6" fill="#28E99F" />
          <text x="18" y="10" fontFamily="var(--font-sans), sans-serif" fontSize="10" fontWeight="700" fill="#3D3B4F">
            vertex
          </text>
          <text x="70" y="10" fontFamily="var(--font-sans), sans-serif" fontSize="9" fill="#3D3B4F" opacity="0.6">
            {t("art.cta.justNow")}
          </text>
        </g>
        <text x="12" y="150" fontFamily="var(--font-sans), sans-serif" fontSize="10" fill="#3D3B4F">
          {t("art.cta.comment")}
        </text>
      </g>
    </svg>
  );
}
