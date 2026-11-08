"use client";

import { useSyncExternalStore } from "react";

import { vault, type VaultStatus } from "@/lib/crypto/vault";

/** Journal lock status for this device: unknown, off, locked or unlocked. */
export function useVaultStatus(): VaultStatus {
  return useSyncExternalStore(vault.subscribe, vault.status, () => "unknown" as VaultStatus);
}
