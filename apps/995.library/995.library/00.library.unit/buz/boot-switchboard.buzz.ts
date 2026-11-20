import type {
  BootSwitchboardPayload,
  BootSwitchboardReceipt,
} from '../fce/pivot-discovery.bit';
import type { LibraryModel } from '../library.model';
import {
  resolveFleetRoot,
  scanFleetPivots,
  hydratePivotModules,
} from './pivot-discovery.buzz';

function emitBootConsole(ste: any, line: string): void {
  if (ste && typeof ste.hunt === 'function') {
    try {
      ste.hunt('[Console action] Update Console', { idx: 'cns00', src: line });
    } catch {
      // headless guard
    }
  }
}

export const bootSwitchboard = async (
  cpy: LibraryModel,
  bal: BootSwitchboardPayload = {},
  ste?: any
): Promise<LibraryModel> => {
  const isHeadless = bal?.headless === true || !ste || typeof ste.hunt !== 'function';

  if (!isHeadless) {
    await ste.hunt('[Terminal action] Init Terminal', {});
    await ste.hunt('[Terminal action] Set Session Context', {
      activePivotTitle: 'MASTER SWITCHBOARD',
      hostRigRole: process.env.HOST_RIG_ROLE || 'RIG 1 (ORCHESTRATOR)',
    });
  }

  emitBootConsole(ste, '>> [BOOT:SWITCHBOARD] Initiating unified local workstation harness...');

  await resolveFleetRoot(cpy, { startDir: bal?.startDir }, ste);
  await scanFleetPivots(cpy, {}, ste);

  await hydratePivotModules(cpy, { registerMenus: false }, ste);

  const hydratedPivots = cpy.discoveredPivots.filter((pivot) =>
    cpy.hydrationReceipts.some(
      (r) => r.globalKey === pivot.terminal.globalKey && r.status === 'HYDRATED'
    )
  );

  const mountedTitles: string[] = ['LIBRARY MENU'];

  for (const pivot of hydratedPivots) {
    if (ste && typeof ste.hunt === 'function') {
      await ste.hunt('[Menu action] Route Menu', {
        menuTitle: pivot.terminal.menuTitle,
        menuDesc: pivot.terminal.menuDesc,
        globalKey: pivot.terminal.globalKey,
      });
    }
    mountedTitles.push(pivot.terminal.menuTitle);
  }

  const receipt: BootSwitchboardReceipt = {
    fleetRoot: cpy.fleetRoot,
    isStandalone: cpy.isStandaloneMode,
    mountedCount: hydratedPivots.length,
    totalDiscovered: cpy.discoveredPivots.length,
    mountedTitles,
  };

  cpy.switchboardBooted = true;
  cpy.lastBootReceipt = receipt;

  emitBootConsole(
    ste,
    `>> [BOOT:READY] Mounted ${mountedTitles.length} switchboard route(s): ${mountedTitles.join(', ')}`
  );

  if (!isHeadless) {
    await ste.hunt('[Menu action] Init Menu', { slv: bal?.slv });
  } else if (bal?.slv) {
    bal.slv({
      libBit: {
        idx: 'boot-switchboard-headless',
        receipt,
      },
    });
  }

  return cpy;
};
