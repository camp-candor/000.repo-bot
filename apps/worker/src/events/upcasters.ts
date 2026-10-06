import { CURRENT_SCHEMA_VERSIONS, type EventEnvelope } from './eventEnvelope.js'

export type UpcasterFunction = (oldPayload: any) => any

export class EventUpcasterRegistry {
  private upcasters = new Map<string, UpcasterFunction>()

  register(
    type: string,
    fromVersion: number,
    upcaster: UpcasterFunction,
  ): void {
    this.upcasters.set(`${type}:v${fromVersion}->v${fromVersion + 1}`, upcaster)
  }

  hasUpcaster(type: string, fromVersion: number): boolean {
    return this.upcasters.has(`${type}:v${fromVersion}->v${fromVersion + 1}`)
  }

  upcast(envelope: EventEnvelope): EventEnvelope {
    let currentVersion = envelope.version
    let currentPayload = envelope.payload
    const targetVersion =
      CURRENT_SCHEMA_VERSIONS[envelope.type] || envelope.version

    while (currentVersion < targetVersion) {
      const key = `${envelope.type}:v${currentVersion}->v${currentVersion + 1}`
      const upcaster = this.upcasters.get(key)
      if (!upcaster) {
        throw new Error(
          `MISSING_UPCASTER: Cannot migrate event '${envelope.type}' from v${currentVersion} to v${targetVersion}`,
        )
      }
      currentPayload = upcaster(currentPayload)
      currentVersion++
    }

    return {
      ...envelope,
      version: currentVersion,
      payload: currentPayload,
    }
  }
}

export const defaultUpcasterRegistry = new EventUpcasterRegistry()
