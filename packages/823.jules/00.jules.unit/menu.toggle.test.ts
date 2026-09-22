import fs from 'fs'
import { describe, it, expect } from 'vitest'
import { MenuModel } from '../98.menu.unit/menu.model.js'
import * as Act from '../98.menu.unit/menu.action.js'

import { resolveWorkerDir } from '../98.menu.unit/buz/00.menu.buzz.js'

describe('Jules Menu Toggle Target Mode', () => {
    it('initializes with LIVE mode and default activeBaseUrl', () => {
        const model = new MenuModel()
        expect(model.targetMode).toBe('LIVE')
        expect(model.activeBaseUrl).toContain('http')
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
