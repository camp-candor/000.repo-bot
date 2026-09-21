import { describe, it, expect, vi } from 'vitest'
import { reducer } from '../98.menu.unit/menu.reduce.js'
import { MenuModel } from '../98.menu.unit/menu.model.js'
import * as Act from '../98.menu.unit/menu.action.js'

describe('Agent Menu Toggle Target Mode', () => {
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
})
