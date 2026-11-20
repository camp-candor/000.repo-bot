export interface TerminalManifestConfig {
  readonly globalKey: string;
  readonly menuTitle: string;
  readonly menuDesc: string;
}

export interface DiscoveredPivotBit {
  readonly packageName: string;
  readonly packageDir: string;
  readonly clusterLabel: string;
  readonly huntEntryPath: string;
  readonly terminal: TerminalManifestConfig;
}

export interface PivotHydrationReceipt {
  readonly globalKey: string;
  readonly menuTitle: string;
  readonly packageName: string;
  readonly status: 'HYDRATED' | 'SKIPPED_NO_BUILD' | 'FAILED';
  readonly reason?: string;
}

export interface FleetDiscoverySummary {
  readonly fleetRoot: string;
  readonly isStandalone: boolean;
  readonly discovered: readonly DiscoveredPivotBit[];
  readonly receipts: readonly PivotHydrationReceipt[];
}

export interface BootSwitchboardPayload {
  readonly startDir?: string;
  readonly headless?: boolean;
  readonly slv?: (val: any) => void;
}

export interface BootSwitchboardReceipt {
  readonly fleetRoot: string;
  readonly isStandalone: boolean;
  readonly mountedCount: number;
  readonly totalDiscovered: number;
  readonly mountedTitles: readonly string[];
}

export interface SessionRouteAuditRow {
  readonly menuTitle: string;
  readonly globalKey: string;
  readonly routeRegistered: boolean;
  readonly globalBound: boolean;
  readonly status: 'READY' | 'DEGRADED' | 'UNBOUND';
}

export interface WorkerBridgeStatusBit {
  readonly enabled: boolean;
  readonly baseUrl: string;
  readonly reachable: boolean;
  readonly remoteRouteCount: number;
  readonly latencyMs: number;
  readonly statusMessage: string;
}
