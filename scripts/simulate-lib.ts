/**
 * Shared harness for multi-block simulations through eth_simulateV1: the
 * scenario contract's code and token balances are injected with state
 * overrides, each stage runs in its own simulated block with the clock moved
 * forward, and state persists from one stage to the next. Nothing is sent.
 */
import { readdirSync, readFileSync } from "node:fs";
import { decodeErrorResult, decodeFunctionResult, encodeAbiParameters, encodeFunctionData, keccak256, pad, toHex, type Abi, type Address, type Hex, type PublicClient } from "viem";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const solc = require("solc") as { compile: (input: string) => string };

export function compileScenario(testFile: string, contractName: string) {
  const sources: Record<string, { content: string }> = {};
  for (const f of readdirSync("contracts")) if (f.endsWith(".sol")) sources[f] = { content: readFileSync(`contracts/${f}`, "utf8") };
  sources[`test/${testFile}`] = { content: readFileSync(`contracts/test/${testFile}`, "utf8") };
  const input = { language: "Solidity", sources, settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true, evmVersion: "cancun", outputSelection: { "*": { "*": ["abi", "evm.deployedBytecode.object"] } } } };
  const out = JSON.parse(solc.compile(JSON.stringify(input))) as { errors?: { severity: string; formattedMessage: string }[]; contracts: Record<string, Record<string, { abi: unknown[]; evm: { deployedBytecode: { object: string } } }>> };
  const errors = (out.errors ?? []).filter((e) => e.severity === "error");
  if (errors.length) {
    for (const e of errors) console.error(e.formattedMessage);
    process.exit(1);
  }
  const s = out.contracts[`test/${testFile}`][contractName];
  return { abi: s.abi as Abi, runtime: ("0x" + s.evm.deployedBytecode.object) as Hex };
}

export const balanceSlot = (owner: Address, base: number) => keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [owner, pad(toHex(base), { size: 32 })]));

export type Stage = { name: string; at: bigint; data: Hex };
export type StageResult = { name: string; status: string; returnData: Hex; error?: string; gasUsed: bigint };

/** Runs the stages as consecutive simulated blocks on top of `base`, returning each call's raw result. */
export async function simulate(client: PublicClient, opts: { base: bigint | "latest"; scenario: Address; overrides: Record<string, { code?: Hex; stateDiff?: Record<string, Hex> }>; stages: Stage[]; gas?: bigint }): Promise<StageResult[]> {
  const blockStateCalls = opts.stages.map((s, i) => ({
    blockOverrides: { time: toHex(s.at) },
    ...(i === 0 ? { stateOverrides: opts.overrides } : {}),
    calls: [{ to: opts.scenario, data: s.data, gas: toHex(opts.gas ?? 30_000_000n) }],
  }));
  const res = (await client.request({
    method: "eth_simulateV1" as never,
    params: [{ blockStateCalls, validation: false, traceTransfers: false }, opts.base === "latest" ? "latest" : toHex(opts.base)] as never,
  })) as { calls: { status: Hex; returnData: Hex; gasUsed: Hex; error?: { message?: string; data?: Hex } }[] }[];
  return res.map((b, i) => {
    const c = b.calls[0];
    return { name: opts.stages[i].name, status: c.status, returnData: c.returnData, gasUsed: BigInt(c.gasUsed), error: c.error ? `${c.error.message ?? ""}${c.error.data ? " " + c.error.data : ""}` : undefined };
  });
}

export function describeRevert(abis: Abi[], data: Hex | undefined): string {
  if (!data || data === "0x") return "no revert data";
  const all = [...abis.flat(), { type: "error", name: "Error", inputs: [{ name: "message", type: "string" }] }, { type: "error", name: "Panic", inputs: [{ name: "code", type: "uint256" }] }] as Abi;
  try {
    const d = decodeErrorResult({ abi: all, data });
    return `${d.errorName}(${(d.args ?? []).map((a) => String(a)).join(", ")})`;
  } catch {
    return data;
  }
}

export function stageCall(abi: Abi, functionName: string, args: unknown[] = []): Hex {
  return encodeFunctionData({ abi, functionName, args });
}

export function decodeStage<T>(abi: Abi, functionName: string, data: Hex): T {
  return decodeFunctionResult({ abi, functionName, data }) as T;
}
