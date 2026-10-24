import fs from 'fs'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MenuModel } from '../98.menu.unit/menu.model.js'
import * as Act from '../98.menu.unit/menu.action.js'
import { resolveWorkerDir } from '../98.menu.unit/buz/00.menu.buzz.js'
import { getBaseUrl } from '../src/cascade.js'

describe('Agent Menu Toggle Target Mode', () => {
    beforeEach(() => {
        delete (global as any).agentBaseUrl
    })

    afterEach(() => {
        delete (global as any).agentBaseUrl
    })

    it('initializes with LIVE mode and canonical activeBaseUrl', () => {
        const model = new MenuModel()
        expect(model.targetMode).toBe('LIVE')
        expect(model.activeBaseUrl).toBe(getBaseUrl())
        expect(model.localProcess).toBeNull()
    })

    it('has TOGGLE_TARGET_MODE action defined correctly', () => {
        const action = new Act.ToggleTargetMode()
        expect(action.type).toBe('[Menu action] Toggle Target Mode')
    })

    it('resolves valid worker directory containing package.json', () => {
        const workerDir = resolveWorkerDir()
        expect(fs.existsSync(workerDir)).toBe(true)
        expect(fs.existsSync(`${workerDir}/package.json`)).toBe(true)
    })
})
