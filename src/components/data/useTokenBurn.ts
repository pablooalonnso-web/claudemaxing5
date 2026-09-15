"use client";

import { useEffect, useState } from "react";
import { erc20Abi } from "@/lib/abis";
import { BURN_ADDRESS, publicClient, TOKEN_ADDRESS } from "@/lib/chain";

export type BurnData = {
  status: "ready" | "unavailable";
  tokenAddress: string;
  burnedRaw: string | null;
  totalSupplyRaw: string | null;
  decimals: number | null;
  block: string | null;
};

/** Reads the protocol token's burned balance straight from the chain, once a minute. */
export function useTokenBurn() {
  const [data, setData] = useState<BurnData | null>(null);
  useEffect(() => {
    let alive = true;
    let busy = false;
    const read = async () => {
      if (busy) return;
      busy = true;
      try {
        const client = publicClient();
        const [burned, supply, decimals, block] = await Promise.all([
          client.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [BURN_ADDRESS] }),
          client.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "totalSupply" }),
          client.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "decimals" }),
          client.getBlockNumber(),
        ]);
        if (alive) setData({ status: "ready", tokenAddress: TOKEN_ADDRESS, burnedRaw: burned.toString(), totalSupplyRaw: supply.toString(), decimals: Number(decimals), block: block.toString() });
      } catch {
        if (alive) setData({ status: "unavailable", tokenAddress: TOKEN_ADDRESS, burnedRaw: null, totalSupplyRaw: null, decimals: null, block: null });
      } finally {
        busy = false;
      }
    };
    void read();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void read();
    }, 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  return data;
}
