"use client";

import type { ReactNode } from "react";
import { WalletProvider } from "./wallet/WalletProvider";
import { ProtocolVaultProvider } from "./data/ProtocolVaultProvider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WalletProvider>
      <ProtocolVaultProvider>{children}</ProtocolVaultProvider>
    </WalletProvider>
  );
}
