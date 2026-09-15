import Image from "next/image";
import stockTokens from "@/data/stock-tokens.json";

const LOGOS = stockTokens as Record<string, string>;

export function hasStockLogo(symbol: string) {
  return Boolean(LOGOS[symbol]);
}

export function StockLogo({ symbol, size = 40 }: { symbol: string; size?: number }) {
  const src = LOGOS[symbol];
  if (!src) {
    return (
      <span className="token-logo-fallback" style={{ width: size, height: size, fontSize: Math.max(9, 0.34 * size) }} title={symbol}>
        {symbol.slice(0, 2)}
      </span>
    );
  }
  return (
    <span className="stock-logo-frame" style={{ width: size, height: size }}>
      <Image className="stock-token-logo" src={src} alt="" width={size} height={size} sizes={`${size}px`} />
    </span>
  );
}

export const STOCK_NAMES: { symbol: string; name: string }[] = [
  { symbol: "AAPL", name: "Apple" },
  { symbol: "GOOGL", name: "Alphabet" },
  { symbol: "COST", name: "Costco" },
  { symbol: "MSFT", name: "Microsoft" },
  { symbol: "NVDA", name: "NVIDIA" },
  { symbol: "AMZN", name: "Amazon" },
  { symbol: "META", name: "Meta" },
  { symbol: "TSLA", name: "Tesla" },
  { symbol: "INTC", name: "Intel" },
  { symbol: "MSTR", name: "MicroStrategy" },
  { symbol: "PLTR", name: "Palantir" },
  { symbol: "AMD", name: "AMD" },
  { symbol: "SNDK", name: "SanDisk" },
  { symbol: "CRCL", name: "Circle" },
  { symbol: "GME", name: "GameStop" },
  { symbol: "MU", name: "Micron" },
  { symbol: "SPCX", name: "SPCX" },
  { symbol: "QQQ", name: "QQQ" },
  { symbol: "SPY", name: "SPY" },
];

export function stockName(symbol: string) {
  return STOCK_NAMES.find((s) => s.symbol === symbol)?.name ?? symbol;
}
