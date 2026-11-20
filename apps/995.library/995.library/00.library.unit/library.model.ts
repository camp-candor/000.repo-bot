import type Library from './fce/library.interface'
import LibraryBit from './fce/library.interface'
import type {
    BootSwitchboardReceipt,
    DiscoveredPivotBit,
    PivotHydrationReceipt,
    WorkerBridgeStatusBit,
} from './fce/pivot-discovery.bit'

export class LibraryModel implements Library {
    idx = '995.library'
    //libraryBitList: LibraryBit[] = [];
    //libraryBits: any = {};
    sourceDirectoryLocation: 'hard code location' // comes from the environment file
    fleetRoot: string = ''
    isStandaloneMode: boolean = true
    switchboardBooted: boolean = false
    discoveredPivots: DiscoveredPivotBit[] = []
    hydrationReceipts: PivotHydrationReceipt[] = []
    lastBootReceipt: BootSwitchboardReceipt | null = null
    workerBridgeEnabled: boolean = true
    workerBaseUrl: string = 'http://127.0.0.1:8787'
    lastWorkerBridgeReceipt: WorkerBridgeStatusBit | null = null
}
