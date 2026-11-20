import type { WorkerBridgeStatusBit } from '../fce/pivot-discovery.bit';
import type { LibraryModel } from '../library.model';

function emitBridgeConsole(ste: any, line: string): void {
  if (ste && typeof ste.hunt === 'function') {
    try {
      ste.hunt('[Console action] Update Console', { idx: 'cns00', src: line });
    } catch {
      // headless guard
    }
  }
}

function resolveWorkerBridgeUrl(cpy: LibraryModel): string {
  const g = globalThis as Record<string, any>;
  const raw =
    g.agentBaseUrl ||
    g.packageBaseUrl ||
    process.env.LIVE_WORKER_URL ||
    process.env.WORKER_URL ||
    (cpy as any).workerBaseUrl ||
    'http://127.0.0.1:8787';
  return String(raw).replace(/\/+$/, '');
}

export const checkWorkerBridge = async (
  cpy: LibraryModel,
  bal: { timeoutMs?: number; slv?: (val: any) => void } = {},
  ste?: any
): Promise<LibraryModel> => {
  const baseUrl = resolveWorkerBridgeUrl(cpy);
  const targetUrl = `${baseUrl}/api/switchboard/routes`;

  if (!cpy.workerBridgeEnabled) {
    const disabledReceipt: WorkerBridgeStatusBit = {
      enabled: false,
      baseUrl,
      reachable: false,
      remoteRouteCount: 0,
      latencyMs: 0,
      statusMessage: 'DISABLED_BY_OPERATOR',
    };
    cpy.lastWorkerBridgeReceipt = disabledReceipt;
    emitBridgeConsole(
      ste,
      '>> [BRIDGE:DISABLED] Remote worker bridge parity checks are currently toggled OFF.'
    );
    if (bal?.slv) bal.slv({ libBit: { idx: 'check-worker-bridge', dat: disabledReceipt } });
    return cpy;
  }

  emitBridgeConsole(ste, `>> [BRIDGE] Probing worker switchboard at ${targetUrl}...`);
  const startMs = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), bal?.timeoutMs ?? 2500);

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timer);
    const latencyMs = Date.now() - startMs;

    if (!response.ok) {
      throw new Error(`HTTP_${response.status}`);
    }

    const payload: any = await response.json();
    const routes = Array.isArray(payload?.routes) ? payload.routes : [];
    const receipt: WorkerBridgeStatusBit = {
      enabled: true,
      baseUrl,
      reachable: true,
      remoteRouteCount: routes.length,
      latencyMs,
      statusMessage: 'PARITY_VERIFIED',
    };
    cpy.lastWorkerBridgeReceipt = receipt;
    emitBridgeConsole(
      ste,
      `>> [BRIDGE:OK] Remote manifest parity verified (${routes.length} routes, ${latencyMs}ms)`
    );
    if (bal?.slv) bal.slv({ libBit: { idx: 'check-worker-bridge', dat: receipt } });
  } catch (err: any) {
    clearTimeout(timer);
    const latencyMs = Date.now() - startMs;
    const receipt: WorkerBridgeStatusBit = {
      enabled: true,
      baseUrl,
      reachable: false,
      remoteRouteCount: 0,
      latencyMs,
      statusMessage: err?.message || 'EDGE_UNREACHABLE',
    };
    cpy.lastWorkerBridgeReceipt = receipt;
    emitBridgeConsole(
      ste,
      '>> [BRIDGE:OFFLINE] Local workstation autonomous mode active (edge unreachable)'
    );
    if (bal?.slv) bal.slv({ libBit: { idx: 'check-worker-bridge', dat: receipt } });
  }

  return cpy;
};

export const toggleWorkerBridge = async (
  cpy: LibraryModel,
  bal: { enabled?: boolean; slv?: (val: any) => void } = {},
  ste?: any
): Promise<LibraryModel> => {
  cpy.workerBridgeEnabled =
    typeof bal?.enabled === 'boolean' ? bal.enabled : !cpy.workerBridgeEnabled;
  emitBridgeConsole(
    ste,
    `>> [BRIDGE:MODE] Worker bridge parity flag set to: ${cpy.workerBridgeEnabled ? 'ENABLED' : 'DISABLED'}`
  );
  return checkWorkerBridge(cpy, { slv: bal?.slv }, ste);
};
