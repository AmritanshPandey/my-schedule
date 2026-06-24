"use client";

import { APP_VERSION, BUILD_ID, BUILD_TIME } from "@/lib/buildInfo";
import { getLastSyncedAt, getSyncStatus, type SyncStatus } from "@/lib/cloudSync";
import { getErrorLog, type LoggedError } from "@/lib/errorLog";
import { DISABLE_SW_ON_IOS, getBootLog, isIOSDevice, isIOSSafeMode, isStandalonePWA, type BootLogEntry } from "@/lib/iosSafeMode";

export interface DiagnosticsSnapshot {
  app: {
    version: string;
    buildId: string;
    buildTime: string;
  };
  platform: {
    userAgent: string;
    isIOS: boolean;
    isStandalonePWA: boolean;
    iosSafeMode: boolean;
  };
  serviceWorker: {
    supported: boolean;
    controller: boolean;
    registrations: number;
    disabledOnIOS: boolean;
    planrCaches: string[];
  };
  sync: {
    status: SyncStatus;
    lastSyncedAt: number;
  };
  bootLog: BootLogEntry[];
  errors: LoggedError[];
  capturedAt: string;
}

export async function collectDiagnostics(): Promise<DiagnosticsSnapshot> {
  const supported = typeof navigator !== "undefined" && "serviceWorker" in navigator;
  const registrations = supported ? await navigator.serviceWorker.getRegistrations().catch(() => []) : [];
  const cacheKeys = typeof caches !== "undefined" ? await caches.keys().catch(() => []) : [];

  return {
    app: {
      version: APP_VERSION,
      buildId: BUILD_ID,
      buildTime: BUILD_TIME,
    },
    platform: {
      userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
      isIOS: isIOSDevice(),
      isStandalonePWA: isStandalonePWA(),
      iosSafeMode: isIOSSafeMode(),
    },
    serviceWorker: {
      supported,
      controller: supported ? !!navigator.serviceWorker.controller : false,
      registrations: registrations.length,
      disabledOnIOS: DISABLE_SW_ON_IOS,
      planrCaches: cacheKeys.filter((key) => key.startsWith("planr-")),
    },
    sync: {
      status: getSyncStatus(),
      lastSyncedAt: getLastSyncedAt(),
    },
    bootLog: getBootLog(),
    errors: getErrorLog(),
    capturedAt: new Date().toISOString(),
  };
}

export function formatDiagnostics(snapshot: DiagnosticsSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}
