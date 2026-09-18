"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createWalletClient, custom, getAddress, type Address, type EIP1193Provider, type WalletClient } from "viem";
import { robinhoodChain } from "@/lib/chain";

type WalletState = {
  /** True once the provider has checked for an existing connection. */
  ready: boolean;
  /** Whether an injected (EIP-1193) provider exists in this browser. */
  available: boolean;
  address?: Address;
  chainId?: number;
  connecting: boolean;
  error?: string;
  connect: () => Promise<void>;
  disconnect: () => void;
  /** Prompts the wallet to add / switch to Robinhood Chain. */
  switchChain: () => Promise<void>;
  walletClient?: WalletClient;
};

const WalletContext = createContext<WalletState | null>(null);
const STORAGE_KEY = "vertex:wallet";

declare global {
  interface Window {
    ethereum?: EIP1193Provider & { isMetaMask?: boolean; providers?: EIP1193Provider[] };
  }
}

function injected(): EIP1193Provider | undefined {
  if (typeof window === "undefined") return undefined;
  return window.ethereum;
}

const CHAIN_PARAMS = {
  chainId: `0x${robinhoodChain.id.toString(16)}`,
  chainName: robinhoodChain.name,
  nativeCurrency: robinhoodChain.nativeCurrency,
  rpcUrls: robinhoodChain.rpcUrls.default.http,
  blockExplorerUrls: [robinhoodChain.blockExplorers.default.url],
};

export function WalletProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [available, setAvailable] = useState(false);
  const [address, setAddress] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string>();
  const providerRef = useRef<EIP1193Provider | undefined>(undefined);

  useEffect(() => {
    const provider = injected();
    providerRef.current = provider;
    setAvailable(Boolean(provider));
    let cancelled = false;
    (async () => {
      if (!provider) return setReady(true);
      try {
        let remembered = false;
        try {
          remembered = window.localStorage.getItem(STORAGE_KEY) === "1";
        } catch {}
        if (remembered) {
          const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
          if (!cancelled && accounts[0]) setAddress(getAddress(accounts[0]));
        }
        const hex = (await provider.request({ method: "eth_chainId" })) as string;
        if (!cancelled) setChainId(Number(hex));
      } catch {
        /* wallet locked or unavailable */
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    const onAccounts = (accounts: unknown) => {
      const list = accounts as string[];
      setAddress(list[0] ? getAddress(list[0]) : undefined);
    };
    const onChain = (hex: unknown) => setChainId(Number(hex as string));
    provider?.on?.("accountsChanged", onAccounts);
    provider?.on?.("chainChanged", onChain);
    return () => {
      cancelled = true;
      provider?.removeListener?.("accountsChanged", onAccounts);
      provider?.removeListener?.("chainChanged", onChain);
    };
  }, []);

  const switchChain = useCallback(async () => {
    const provider = providerRef.current;
    if (!provider) throw new Error("No wallet found");
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_PARAMS.chainId }] });
    } catch (e) {
      const code = (e as { code?: number }).code;
      if (code === 4902 || code === -32603) {
        await provider.request({ method: "wallet_addEthereumChain", params: [CHAIN_PARAMS] });
      } else {
        throw e;
      }
    }
  }, []);

  const connect = useCallback(async () => {
    const provider = providerRef.current ?? injected();
    providerRef.current = provider;
    if (!provider) {
      setError("No browser wallet was found. Install MetaMask, Rabby or another EIP-1193 wallet.");
      return;
    }
    setConnecting(true);
    setError(undefined);
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      if (accounts[0]) {
        setAddress(getAddress(accounts[0]));
        try {
          window.localStorage.setItem(STORAGE_KEY, "1");
        } catch {}
      }
      const hex = (await provider.request({ method: "eth_chainId" })) as string;
      setChainId(Number(hex));
      if (Number(hex) !== robinhoodChain.id) {
        try {
          await switchChain();
        } catch {
          /* user declined the switch; UI shows a prompt */
        }
      }
    } catch (e) {
      const code = (e as { code?: number }).code;
      setError(code === 4001 ? "Connection request rejected." : "Could not connect the wallet.");
    } finally {
      setConnecting(false);
    }
  }, [switchChain]);

  const disconnect = useCallback(() => {
    setAddress(undefined);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  const walletClient = useMemo(() => {
    const provider = providerRef.current ?? injected();
    if (!provider || !address) return undefined;
    return createWalletClient({ account: address, chain: robinhoodChain, transport: custom(provider) });
  }, [address]);

  const value = useMemo<WalletState>(
    () => ({ ready, available, address, chainId, connecting, error, connect, disconnect, switchChain, walletClient }),
    [ready, available, address, chainId, connecting, error, connect, disconnect, switchChain, walletClient],
  );
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}

export const shortAddress = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
