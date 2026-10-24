export type DataTelemetryStage =
    | 'INIT'
    | 'UPDATE'
    | 'PREP'
    | 'EXEC'
    | 'PROG'
    | 'COMP'
    | 'ERR'

export type DataTelemetryStatus = 'OK' | 'WARN' | 'FAIL' | 'PREP' | 'INFO'

export interface DataTelemetryEnvelope {
    stage: DataTelemetryStage
    status?: DataTelemetryStatus
    message: string
    timestamp?: string
}