#!/usr/bin/env python3
"""Add support typing indicators to ~/backend/server.js on the VPS (SQLite)."""
from pathlib import Path

p = Path.home() / "backend" / "server.js"
text = p.read_text(encoding="utf-8")
if "supportTypingActiveAt" in text:
    print("already patched")
    raise SystemExit(0)

ins_alter = """try {
  db.exec('ALTER TABLE support_threads ADD COLUMN user_typing_at TEXT');
} catch (_) {}
try {
  db.exec('ALTER TABLE support_threads ADD COLUMN admin_typing_at TEXT');
} catch (_) {}

"""
marker_alter = 'try {\n  db.exec("ALTER TABLE transactions ADD COLUMN status TEXT DEFAULT \'completed\'");\n} catch (_) {}\n'
if marker_alter not in text:
    raise SystemExit("alter anchor not found")
text = text.replace(marker_alter, marker_alter + ins_alter, 1)

needle = "// ---- Support chat (same contract as Client SPA; stored in SQLite) ----\n"
func = """const SUPPORT_TYPING_TTL_MS = 5000;
function supportTypingActiveAt(iso) {
  if (iso == null) return false;
  const s = String(iso).trim();
  if (!s) return false;
  const t = Date.parse(s);
  return Number.isFinite(t) && Date.now() - t < SUPPORT_TYPING_TTL_MS;
}

"""
if needle not in text:
    raise SystemExit("support section marker not found")
text = text.replace(needle, needle + func, 1)

old_thread = """    const t = supportGetThreadRow(userId);
    return res.json({
      messages: msgs,
      needsHuman: !!t.needs_human,
      userId: String(userId),
    });
"""
new_thread = """    const t = supportGetThreadRow(userId);
    return res.json({
      messages: msgs,
      needsHuman: !!t.needs_human,
      userId: String(userId),
      adminTyping: supportTypingActiveAt(t.admin_typing_at),
    });
"""
if old_thread not in text:
    raise SystemExit("GET support thread block not found")
text = text.replace(old_thread, new_thread, 1)

old_admin = """    return res.json({
      messages: msgs,
      userId: String(uid),
      userEmail: u?.email || '',
      userName: u?.full_name || '',
      profileAvatar: userProfileAvatarForAdminSql(uid),
      needsHuman: !!t.needs_human,
    });
"""
new_admin = """    return res.json({
      messages: msgs,
      userId: String(uid),
      userEmail: u?.email || '',
      userName: u?.full_name || '',
      profileAvatar: userProfileAvatarForAdminSql(uid),
      needsHuman: !!t.needs_human,
      userTyping: supportTypingActiveAt(t.user_typing_at),
    });
"""
if old_admin not in text:
    raise SystemExit("GET admin thread block not found")
text = text.replace(old_admin, new_admin, 1)

routes = """app.post('/api/support/typing', authMiddleware, (req, res) => {
  try {
    const typing = req.body?.typing === true;
    const userId = req.userId;
    const u = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!u) return res.status(404).json({ error: 'User not found' });
    supportEnsureThread(userId);
    const iso = typing ? new Date().toISOString() : null;
    db.prepare('UPDATE support_threads SET user_typing_at = ? WHERE user_id = ?').run(iso, userId);
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/support/typing', adminAuthMiddleware, (req, res) => {
  try {
    const uid = parseInt(String(req.body?.userId ?? '').trim(), 10);
    const typing = req.body?.typing === true;
    if (!Number.isFinite(uid)) return res.status(400).json({ error: 'userId required' });
    supportEnsureThread(uid);
    const iso = typing ? new Date().toISOString() : null;
    db.prepare('UPDATE support_threads SET admin_typing_at = ? WHERE user_id = ?').run(iso, uid);
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
});

"""
if "app.post('/api/support/messages', authMiddleware" not in text:
    raise SystemExit("support messages route not found")
text = text.replace("app.post('/api/support/messages', authMiddleware", routes + "app.post('/api/support/messages', authMiddleware", 1)

old_upd = """    db.prepare(
      'UPDATE support_threads SET unread_for_admin = unread_for_admin + 1, updated_at = datetime(\\'now\\') WHERE user_id = ?'
    ).run(userId);

    if (requestHuman) {
"""
new_upd = """    db.prepare(
      'UPDATE support_threads SET unread_for_admin = unread_for_admin + 1, updated_at = datetime(\\'now\\') WHERE user_id = ?'
    ).run(userId);
    db.prepare('UPDATE support_threads SET user_typing_at = NULL WHERE user_id = ?').run(userId);

    if (requestHuman) {
"""
if old_upd not in text:
    raise SystemExit("user message UPDATE block not found")
text = text.replace(old_upd, new_upd, 1)

old_rep = """    db.prepare(
      'UPDATE support_threads SET unread_for_user = unread_for_user + 1, updated_at = datetime(\\'now\\') WHERE user_id = ?'
    ).run(uid);

    const msgs = supportLoadMessages(uid);
"""
new_rep = """    db.prepare(
      'UPDATE support_threads SET unread_for_user = unread_for_user + 1, updated_at = datetime(\\'now\\') WHERE user_id = ?'
    ).run(uid);
    db.prepare('UPDATE support_threads SET admin_typing_at = NULL WHERE user_id = ?').run(uid);

    const msgs = supportLoadMessages(uid);
"""
if old_rep not in text:
    raise SystemExit("admin reply UPDATE block not found")
text = text.replace(old_rep, new_rep, 1)

p.write_text(text, encoding="utf-8")
print("patched", p)
