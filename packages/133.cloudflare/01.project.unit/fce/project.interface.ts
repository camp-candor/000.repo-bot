import ProjectBit from './project.bit.js'

export default interface Project {
    idx: string
    projectBits: Record<string, ProjectBit>
}
