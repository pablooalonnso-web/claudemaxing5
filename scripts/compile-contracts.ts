/**
 * Compiles every contract under contracts/ with solc 0.8.24 and writes one
 * artifact per named contract (ABI, creation and runtime bytecode, immutable
 * references, settings, source hash) to src/data/<kebab-name>.artifact.json.
 *
 *   npm run compile:contracts -- VertexStaking VertexGovernor VertexFeeSplitter VertexLendingModule
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const solc = require("solc") as { compile: (input: string) => string; version: () => string };

const names = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!names.length) {
  console.error("usage: compile-contracts <ContractName>...");
  process.exit(1);
}
const sources: Record<string, { content: string }> = {};
for (const f of readdirSync("contracts")) if (f.endsWith(".sol")) sources[f] = { content: readFileSync(`contracts/${f}`, "utf8") };
const settings = { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun", viaIR: false, metadata: { bytecodeHash: "none" }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object", "evm.deployedBytecode.immutableReferences"] } } };
const out = JSON.parse(solc.compile(JSON.stringify({ language: "Solidity", sources, settings }))) as {
  errors?: { severity: string; formattedMessage: string }[];
  contracts: Record<string, Record<string, { abi: unknown[]; evm: { bytecode: { object: string }; deployedBytecode: { object: string; immutableReferences?: Record<string, { start: number; length: number }[]> } } }>>;
};
const errors = (out.errors ?? []).filter((e) => e.severity === "error");
for (const e of out.errors ?? []) if (e.severity === "error" || !/Unreachable code|Function state mutability/.test(e.formattedMessage)) console.error(e.formattedMessage);
if (errors.length) process.exit(1);
const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
for (const name of names) {
  const file = `${name}.sol`;
  const c = out.contracts[file]?.[name];
  if (!c) {
    console.error(`${name} not found in ${file}`);
    process.exit(1);
  }
  const artifact = {
    contract: name,
    compiler: solc.version(),
    settings: { optimizer: settings.optimizer, evmVersion: settings.evmVersion, viaIR: settings.viaIR },
    sourceSha256: createHash("sha256").update(sources[file].content).digest("hex"),
    abi: c.abi,
    bytecode: "0x" + c.evm.bytecode.object,
    deployedBytecode: "0x" + c.evm.deployedBytecode.object,
    immutableReferences: Object.values(c.evm.deployedBytecode.immutableReferences ?? {}).flat(),
  };
  const path = `src/data/${kebab(name)}.artifact.json`;
  writeFileSync(path, JSON.stringify(artifact, null, 2) + "\n");
  console.log(`${name}: creation ${(c.evm.bytecode.object.length / 2).toLocaleString()} bytes, runtime ${(c.evm.deployedBytecode.object.length / 2).toLocaleString()} bytes, ${(c.abi as unknown[]).length} ABI entries → ${path}`);
}
