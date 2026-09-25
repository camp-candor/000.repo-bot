import Workers from './fce/workers.interface.js'
import WorkersBit from './fce/workers.bit.js'

export class WorkersModel implements Workers {
    idx: string = ''
    workersBits: Record<string, WorkersBit> = {}
}
