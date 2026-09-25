import WorkersBit from './workers.bit.js'

export default interface Workers {
    idx: string
    workersBits: Record<string, WorkersBit>
}
