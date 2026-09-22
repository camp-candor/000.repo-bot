import { GithubModel } from '../github.model.js'
import GithubBit from '../fce/github.bit.js'
import State from '../../99.core/state.js'

export const initGithub = (cpy: GithubModel, bal: GithubBit, ste: State) => {
    const urlgithub = 'https://zero00-github.onrender.com/api/github/test'

    fetch(urlgithub)
        .then((res) => {
            if (!res.ok) throw new Error('Network response was not ok')
            return res.json()
        })
        .then((data) => {
            if (bal.slv != null) {
                bal.slv({
                    intBit: {
                        idx: 'init-github',
                        dat: {
                            github: data,
                        },
                    },
                })
            }
        })
        .catch((err) => {
            if (bal.slv != null) {
                bal.slv({
                    intBit: { idx: 'init-github-err', dat: err.message },
                })
            }
        })

    return cpy
}

export const updateGithub = (cpy: GithubModel, bal: GithubBit, ste: State) => {
    if (bal.slv != null) bal.slv({ intBit: { idx: 'update-github' } })
    return cpy
}

export const testGithub = (cpy: GithubModel, bal: GithubBit, ste: State) => {
    if (bal.slv != null) bal.slv({ mytBit: { idx: 'test-github', val: 1 } })
    return cpy
}

export const listGithub = async (
    cpy: GithubModel,
    bal: GithubBit,
    ste: State,
) => {
    const lst = ['github-repo-1', 'github-repo-2']
    if (bal.slv != null) bal.slv({ gthBit: { idx: 'list-github', lst } })
    return cpy
}
