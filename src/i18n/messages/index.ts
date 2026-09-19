/**
 * Message registry. One file per namespace under ./messages; each exports a table per locale.
 * English is the source of truth. Missing keys in other locales fall back to English, then to the key itself.
 */
import { common } from "./common";
import { nav } from "./nav";
import { footer } from "./footer";
import { home } from "./home";
import { docs } from "./docs";
import { vaults } from "./vaults";
import { strategies } from "./strategies";
import { allocator } from "./allocator";
import { zap } from "./zap";
import { lending } from "./lending";
import { trade } from "./trade";
import { portfolio } from "./portfolio";
import { help } from "./help";
import { intelligence } from "./intelligence";
import { calculator } from "./calculator";
import { status } from "./status";
import { verify } from "./verify";
import { errors } from "./errors";
import { wallet } from "./wallet";

export const MESSAGES = {
  common,
  nav,
  footer,
  home,
  docs,
  vaults,
  strategies,
  allocator,
  zap,
  lending,
  trade,
  portfolio,
  help,
  intelligence,
  calculator,
  status,
  verify,
  errors,
  wallet,
} as const;

export type Namespace = keyof typeof MESSAGES;
