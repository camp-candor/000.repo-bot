import type Unit from './fce/unit.interface'
import UnitBit from './fce/unit.interface'

export class UnitModel implements Unit {
    buzzTemplate = `export const {{=it.buzNom}} = async (
    cpy: {{=it.cpyNom}},
    bal: {{=it.balNom}},
    ste: State,
) => {
    if (ste) {
        await ste.hunt('[Console action] Update Console', {
            idx: 'cns00',
            src: '>> Executing {{=it.buzNom}} stub',
        })
    }
    if (bal && bal.slv != null) {
        bal.slv({ {{=it.nom}}Bit: { idx: '{{=it.buzNom}}-stub' } })
    }
    return cpy
}`

    buzzerTemplate = `export { {{=it.buzNom}} } from "./buz/{{=it.root}}.buzz";`

    actTemplate = `export const {{=it.actUpr}} = "{{=it.actMsg}}";
export class {{=it.actTle}} implements Action {
    readonly type = {{=it.actUpr}};
    constructor(public bale: {{=it.bitNom}}) {}
}`

    actTemplateLower = `| {{=it.actTle}}`

    reduceTemplate = `        case Act.{{=it.actUpr}}:
            return Buzz.{{=it.buzNom}}(clone(model), act.bale, state)`
}
