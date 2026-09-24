with open("apps/worker/src/RepoBotDO.ts", "r") as f:
    content = f.read()

import re

# Match executeCompensatingSaga inside the MERGE_FAILED branch
pattern = r"executeCompensatingSaga\(\s*rollbackPayload,\s*this\.env,\s*\)\.then\(async \(\) => {\s*updated\.state = 'ROLLED_BACK'\s*await this\.ctx\.storage\.put\(\s*'fsm_context',\s*updated,\s*\)\s*}\)"

replacement = """this.ctx.waitUntil(
                                        executeCompensatingSaga(
                                            rollbackPayload,
                                            this.env,
                                        ).then(async () => {
                                            const freshUpdated = await this.ctx.storage.get<FSMContext>('fsm_context')
                                            if (freshUpdated) {
                                                freshUpdated.state = 'ROLLED_BACK'
                                                await this.ctx.storage.put('fsm_context', freshUpdated)
                                            }
                                        })
                                    )"""

if re.search(pattern, content):
    content = re.sub(pattern, replacement, content)
    with open("apps/worker/src/RepoBotDO.ts", "w") as f:
        f.write(content)
    print("Fixed RepoBotDO.ts state overwrite")
else:
    print("Could not find block to replace")
