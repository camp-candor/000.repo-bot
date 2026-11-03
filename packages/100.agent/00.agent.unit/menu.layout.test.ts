import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MenuModel } from '../98.menu.unit/menu.model.js'
import { initMenu, updateMenu } from '../98.menu.unit/buz/00.menu.buzz.js'

describe('100.agent 98.menu.unit Blessed Cockpit Dual-Pane Topology', () => {
    beforeEach(() => {
        delete (globalThis as any).LIBRARY
        delete (global as any).LIBRARY
    })

    afterEach(() => {
        delete (globalThis as any).LIBRARY
        delete (global as any).LIBRARY
    })

    it('asserts the right 8 columns mount cns00 console pane and stream telemetry', async () => {
        const dispatched: Array<{ action: string; bale: any }> = []
        const mockLibrary = {
            hunt: async (action: string, bale: any) => {
                dispatched.push({ action, bale })
                if (action === '[Grid action] Update Grid') {
                    return {
                        grdBit: {
                            dat: {
                                x: bale.x,
                                y: bale.y,
                                xSpan: bale.xSpan,
                                ySpan: bale.ySpan,
                            },
                        },
                    }
                }
                if (action === '[Open action] Open Choice') {
                    return { chcBit: { src: 'ROOT MENU' } }
                }
                return { val: 1 }
            },
        }

        ;(globalThis as any).LIBRARY = mockLibrary
        ;(global as any).LIBRARY = mockLibrary

        const model = new MenuModel()
        await initMenu(model, { idx: 'test-init' }, {
            hunt: async () => {},
        } as any)

        // 1. Grid allocation for information pane must cover columns 4-12 (x: 4, xSpan: 8, rows 0-12)
        const gridConsoleAction = dispatched.find(
            (d) =>
                d.action === '[Grid action] Update Grid' &&
                d.bale.x === 4 &&
                d.bale.xSpan === 8,
        )
        expect(gridConsoleAction).toBeDefined()
        expect(gridConsoleAction?.bale.y).toBe(0)
        expect(gridConsoleAction?.bale.ySpan).toBe(12)

        // 2. Console widget cns00 must be mounted via WRITE_CONSOLE with grid net dat
        const writeConsoleAction = dispatched.find(
            (d) => d.action === '[Write action] Write Console',
        )
        expect(writeConsoleAction).toBeDefined()
        expect(writeConsoleAction?.bale.idx).toBe('cns00')
        expect(writeConsoleAction?.bale.dat?.net).toEqual({
            x: 4,
            y: 0,
            xSpan: 8,
            ySpan: 12,
        })

        // 3. Information and telemetry logs must stream to cns00
        const consoleLogs = dispatched.filter(
            (d) =>
                d.action === '[Console action] Update Console' &&
                d.bale.idx === 'cns00',
        )
        expect(consoleLogs.length).toBeGreaterThan(0)
    })

    it('asserts the left 4 columns house interactive choices bound to grid net mesh', async () => {
        let capturedChoiceBale: any = null
        let capturedChoiceGrid: any = null

        const mockLibrary = {
            hunt: async (action: string, bale: any) => {
                if (action === '[Grid action] Update Grid') {
                    capturedChoiceGrid = bale
                    return {
                        grdBit: {
                            dat: {
                                left: `${(bale.x / 12) * 100}%`,
                                top: `${(bale.y / 12) * 100}%`,
                                width: `${(bale.xSpan / 12) * 100}%`,
                                height: `${(bale.ySpan / 12) * 100}%`,
                            },
                        },
                    }
                }
                if (action === '[Open action] Open Choice') {
                    capturedChoiceBale = bale
                    return { chcBit: { src: 'ROOT MENU' } }
                }
                return { val: 1 }
            },
        }

        ;(globalThis as any).LIBRARY = mockLibrary
        ;(global as any).LIBRARY = mockLibrary

        const model = new MenuModel()
        await updateMenu(model, { idx: 'test-update', slv: () => {} }, {
            hunt: async () => {},
        } as any)

        expect(capturedChoiceGrid).toBeDefined()
        // 1. Grid geometry: Left 4 columns (x: 0, xSpan: 4, rows 4-12)
        expect(capturedChoiceGrid.x).toBe(0)
        expect(capturedChoiceGrid.xSpan).toBe(4)
        expect(capturedChoiceGrid.y).toBe(4)
        expect(capturedChoiceGrid.ySpan).toBe(8)

        // 2. Net mesh must be present to anchor choice widget and prevent 100% full-screen blowout
        expect(capturedChoiceBale).toBeDefined()
        expect(capturedChoiceBale.net).toBeDefined()
        expect(capturedChoiceBale.net.left).toBe('0%')
        expect(capturedChoiceBale.net.width).toBe(`${(4 / 12) * 100}%`)

        // 3. Must contain interactive choices including ROOT MENU
        expect(capturedChoiceBale.lst).toBeDefined()
        expect(capturedChoiceBale.lst).toContain('ROOT MENU')
        expect(capturedChoiceBale.lst.length).toBeGreaterThanOrEqual(6)
    })
})
