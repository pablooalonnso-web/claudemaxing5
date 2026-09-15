import { MANAGED_VAULTS, VAULT_PINS } from "./registry";
import { STOCK_NAMES } from "@/components/StockLogo";
import { TOKEN_ADDRESS, USDG_ADDRESS } from "./chain";
import { BRAND } from "./brand";

export const NATIVE_ETH = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as const;

export type TradeToken = {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  category: "core" | "stock" | "imported";
  logoUrl?: string;
  native?: boolean;
};

function stockTokens(): TradeToken[] {
  return VAULT_PINS.flatMap((pin) => {
    const entry = MANAGED_VAULTS.find((m) => m.id === pin.id);
    if (!entry) return [];
    const address = entry.token0.toLowerCase() === USDG_ADDRESS.toLowerCase() ? entry.token1 : entry.token0;
    return [{ address, symbol: pin.symbol, name: `${STOCK_NAMES.find((s) => s.symbol === pin.symbol)?.name ?? pin.symbol} Stock Token`, decimals: 18, category: "stock" as const, logoUrl: `/stock-tokens/${pin.symbol.toLowerCase()}.png` }];
  });
}

export const TRADE_TOKENS: TradeToken[] = [
  { address: NATIVE_ETH, symbol: "ETH", name: "Ether", decimals: 18, category: "core", logoUrl: "/brands/eth.svg", native: true },
  { address: USDG_ADDRESS, symbol: "USDG", name: "Global Dollar", decimals: 6, category: "core", logoUrl: "/brands/usdg.png" },
  { address: TOKEN_ADDRESS, symbol: BRAND.token, name: `${BRAND.name} token`, decimals: 18, category: "core", logoUrl: "/icon.svg" },
  ...stockTokens(),
];

export type TradeQuote = {
  providerId: string;
  providerName: string;
  amountOutRaw: string;
  netAmountOutRaw: string;
  gasEstimate: string;
  executable: boolean;
  routeSummary?: unknown;
  routerAddress?: string;
  note?: string;
};

export type QuotesResponse = { tokenIn: string; tokenOut: string; amountIn: string; quotes: TradeQuote[]; quotedAt: number };
