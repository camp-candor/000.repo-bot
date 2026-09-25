with open('apps/worker/src/index.ts', 'r') as f:
    text = f.read()

search_str = """        if (isJulesBranch && c.env.SLACK_BOT_TOKEN) {
            const card = buildJulesStatusCard(
                {
                    sessionId: pr.head?.sha?.slice(0, 10) || 'active',"""

replace_str = """        if (isJulesBranch && c.env.SLACK_BOT_TOKEN) {
            let actualSessionId = pr.head?.sha?.slice(0, 10) || 'active'
            if (c.env.DB) {
                try {
                    const row = await c.env.DB.prepare('SELECT session_id FROM jules_sessions WHERE branch_name = ?').bind(headRef).first()
                    if (row && row.session_id) {
                        actualSessionId = row.session_id
                    }
                } catch (err) {
                    console.warn('Failed to query session id by branch', err)
                }
            }
            const card = buildJulesStatusCard(
                {
                    sessionId: actualSessionId,"""

if search_str in text:
    print("Found webhook logic to fix.")
    text = text.replace(search_str, replace_str)
    with open('apps/worker/src/index.ts', 'w') as f:
        f.write(text)
else:
    print("Webhook logic not found.")
