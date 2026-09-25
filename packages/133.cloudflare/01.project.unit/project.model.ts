import Project from './fce/project.interface.js'
import ProjectBit from './fce/project.bit.js'

export class ProjectModel implements Project {
    idx: string = ''
    projectBits: Record<string, ProjectBit> = {}
}
