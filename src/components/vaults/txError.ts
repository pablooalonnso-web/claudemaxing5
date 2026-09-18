import type { TFunction } from "@/i18n";

/**
 * Translated counterpart of `describeTxError` in src/lib/managed-vault.ts: a declined wallet
 * request and the generic fallback come from the caller's namespace (`error.rejected`,
 * `error.txFailed`); short messages thrown by the flow itself are shown as they are.
 */
export function txErrorMessage(error: unknown, t: TFunction): string {
  const seen = new Set<unknown>();
  let cur: unknown = error;
  while (cur && typeof cur === "object" && !seen.has(cur)) {
    seen.add(cur);
    const e = cur as { code?: number; name?: string; cause?: unknown };
    if (e.code === 4001 || e.name === "UserRejectedRequestError") return t("error.rejected");
    cur = e.cause;
  }
  const msg = (error as { shortMessage?: string; message?: string })?.shortMessage || (error as { message?: string })?.message;
  return msg && msg.length < 220 ? msg : t("error.txFailed");
}
