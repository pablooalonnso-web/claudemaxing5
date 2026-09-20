/**
 * Compiles contracts/VertexAllocatorV1.sol with solc 0.8.24 and writes the
 * artifact (ABI, creation and runtime bytecode, settings) to
 * src/data/allocator-v1.artifact.json, which the deploy page and the
 * simulations read.
 *
 *   npm run compile:allocator
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const solc = require("solc") as { compile: (input: string) => string; version: () => string };

const source = readFileSync("contracts/VertexAllocatorV1.sol", "utf8");
const settings = { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun", viaIR: false, metadata: { bytecodeHash: "none" }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object", "evm.deployedBytecode.immutableReferences", "metadata"] } } };
const input = { language: "Solidity", sources: { "VertexAllocatorV1.sol": { content: source } }, settings };
const out = JSON.parse(solc.compile(JSON.stringify(input))) as { errors?: { severity: string; formattedMessage: string }[]; contracts: Record<string, Record<string, { abi: unknown[]; evm: { bytecode: { object: string }; deployedBytecode: { object: string; immutableReferences?: Record<string, { start: number; length: number }[]> } }; metadata: string }>> };
const errors = (out.errors ?? []).filter((e) => e.severity === "error");
for (const e of out.errors ?? []) console.error(e.formattedMessage);
if (errors.length) process.exit(1);
const c = out.contracts["VertexAllocatorV1.sol"].VertexAllocatorV1;
const artifact = {
  contract: "VertexAllocatorV1",
  compiler: solc.version(),
  settings: { optimizer: settings.optimizer, evmVersion: settings.evmVersion, viaIR: settings.viaIR },
  sourceSha256: createHash("sha256").update(source).digest("hex"),
  abi: c.abi,
  bytecode: "0x" + c.evm.bytecode.object,
  deployedBytecode: "0x" + c.evm.deployedBytecode.object,
  // Offsets the deployed code fills with immutable values (the USDG address); a verifier fills them the same way before comparing.
  immutableReferences: Object.values(c.evm.deployedBytecode.immutableReferences ?? {}).flat(),
};
writeFileSync("src/data/allocator-v1.artifact.json", JSON.stringify(artifact, null, 2) + "\n");
console.log(`compiled with ${artifact.compiler}: creation ${(c.evm.bytecode.object.length / 2).toLocaleString()} bytes, runtime ${(c.evm.deployedBytecode.object.length / 2).toLocaleString()} bytes, ${(c.abi as unknown[]).length} ABI entries`);
