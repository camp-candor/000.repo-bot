with open('apps/worker/src/jules.ts', 'r') as f:
    text = f.read()

search_str = """            } else if (
                currentStatus === 'COMPLETED' ||
                currentStatus === 'FAILED'
            ) {
                await env.DB.prepare(
                    'UPDATE jules_sessions SET status = ?, updated_at = ? WHERE session_id = ?',
                )
                    .bind(currentStatus, Date.now(), item.session_id)
                    .run()
            }
        } catch (err: any) {"""

replace_str = """            } else if (
                currentStatus === 'COMPLETED' ||
                currentStatus === 'FAILED'
            ) {
                await env.DB.prepare(
                    'UPDATE jules_sessions SET status = ?, updated_at = ? WHERE session_id = ?',
                )
                    .bind(currentStatus, Date.now(), item.session_id)
                    .run()
            } else if (currentStatus !== item.status) {
                await env.DB.prepare(
                    'UPDATE jules_sessions SET status = ?, updated_at = ? WHERE session_id = ?',
                )
                    .bind(currentStatus, Date.now(), item.session_id)
                    .run()
            }
        } catch (err: any) {"""

if search_str in text:
    print("Found poller logic to fix.")
    text = text.replace(search_str, replace_str)
    with open('apps/worker/src/jules.ts', 'w') as f:
        f.write(text)
else:
    print("Poller logic not found.")
