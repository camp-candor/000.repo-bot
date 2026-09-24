with open("apps/worker/src/RepoBotDO.ts", "r") as f:
    content = f.read()

import re

# Find the block where MERGE_FAILED rollback happens:
# executeCompensatingSaga(rollbackPayload, this.env).then(async () => {
#     updated.state = 'ROLLED_BACK'
#     await this.ctx.storage.put('fsm_context', updated)
# })
# and replace it with:
# this.ctx.waitUntil(executeCompensatingSaga(rollbackPayload, this.env).then(async () => {
#     const freshUpdated = await this.ctx.storage.get<FSMContext>('fsm_context')
#     if (freshUpdated) {
#         freshUpdated.state = 'ROLLED_BACK'
#         await this.ctx.storage.put('fsm_context', freshUpdated)
#     }
# }))

old_block = """executeCompensatingSaga(rollbackPayload, this.env).then(async () => {
                                    updated.state = 'ROLLED_BACK'
                                    await this.ctx.storage.put('fsm_context', updated)
                                })"""

new_block = """this.ctx.waitUntil(executeCompensatingSaga(rollbackPayload, this.env).then(async () => {
                                    const freshUpdated = await this.ctx.storage.get<FSMContext>('fsm_context')
                                    if (freshUpdated) {
                                        freshUpdated.state = 'ROLLED_BACK'
                                        await this.ctx.storage.put('fsm_context', freshUpdated)
                                    }
                                }))"""

if old_block in content:
    content = content.replace(old_block, new_block)
    with open("apps/worker/src/RepoBotDO.ts", "w") as f:
        f.write(content)
    print("Fixed RepoBotDO.ts state overwrite")
else:
    print("Could not find block to replace")
