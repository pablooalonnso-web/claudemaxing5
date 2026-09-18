export type VerificationStatus = "pass" | "fail" | "warn" | "skip";
export type VerificationCheck = { name: string; status: VerificationStatus; detail: string; ms: number };
export type VerificationGroup = { id: string; title: string; description: string; checks: VerificationCheck[] };
export type VerificationReport = {
  version: 1;
  generatedAt: string;
  commit: string | null;
  site: string | null;
  chain: { id: number; head: string; headTime: string; rpcHost: string };
  summary: Record<VerificationStatus | "total", number>;
  groups: VerificationGroup[];
};
