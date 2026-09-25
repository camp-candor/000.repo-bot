import { describe, it, expect, vi } from 'vitest'
import {
    initProject,
    updateProject,
    deleteProject,
} from './buz/project.buzz.js'
import { ProjectModel } from './project.model.js'

describe('project', () => {
    it('should initialize project', () => {
        const model = new ProjectModel()
        const state = {
            hunt: vi.fn().mockResolvedValue({}),
            dispatch: vi.fn(),
        } as any

        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        expect(typeof initProject).toBe('function')

        const result = initProject(model, bal, state)
        expect(result).toBe(model)
    })

    it('should update project', () => {
        const model = new ProjectModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        const result = updateProject(model, bal, state)
        expect(result).toBe(model)
        expect(slv).toHaveBeenCalledWith({ prjBit: { idx: 'update-project' } })
    })

    it('should delete project', () => {
        const model = new ProjectModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        const result = deleteProject(model, bal, state)
        expect(result).toBe(model)
        expect(slv).toHaveBeenCalledWith({ prjBit: { idx: 'delete-project' } })
    })
})
