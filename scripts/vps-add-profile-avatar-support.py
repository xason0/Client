#!/usr/bin/env python3
"""Patch ~/backend/server.js on VPS: admin support inbox/thread return profileAvatar from user_avatars."""
from pathlib import Path

p = Path.home() / "backend" / "server.js"
if not p.is_file():
    raise SystemExit(f"missing {p}")

t = p.read_text(encoding="utf-8")

if "userProfileAvatarForAdminSql" in t:
    print("already patched (userProfileAvatarForAdminSql present)")
else:
    marker = "\n\nfunction sanitizeSupportTextSql(s, max = 4000) {"
    if marker not in t:
        raise SystemExit("marker not found: sanitizeSupportTextSql")
    insert = """

function userProfileAvatarForAdminSql(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id < 1) return '';
  const row = db.prepare('SELECT avatar FROM user_avatars WHERE user_id = ?').get(id);
  const a = row?.avatar;
  if (a != null && typeof a === 'string' && a.trim()) return a.trim();
  return '';
}
""" + marker
    t = t.replace(marker, insert, 1)
    print("inserted userProfileAvatarForAdminSql")

old_inbox = """      list.push({
        userId: String(row.user_id),
        userEmail: row.user_email || '',
        userName: row.user_name || '',
        updatedAt: row.updated_at || '',"""

new_inbox = """      list.push({
        userId: String(row.user_id),
        userEmail: row.user_email || '',
        userName: row.user_name || '',
        profileAvatar: userProfileAvatarForAdminSql(row.user_id),
        updatedAt: row.updated_at || '',"""

if "profileAvatar: userProfileAvatarForAdminSql(row.user_id)" not in t:
    if old_inbox not in t:
        raise SystemExit("inbox list.push block not found")
    t = t.replace(old_inbox, new_inbox, 1)
    print("patched admin inbox list.push")
else:
    print("inbox already has profileAvatar")

old_thread = """    return res.json({
      messages: msgs,
      userId: String(uid),
      userEmail: u?.email || '',
      userName: u?.full_name || '',
      needsHuman: !!t.needs_human,
    });"""

new_thread = """    return res.json({
      messages: msgs,
      userId: String(uid),
      userEmail: u?.email || '',
      userName: u?.full_name || '',
      profileAvatar: userProfileAvatarForAdminSql(uid),
      needsHuman: !!t.needs_human,
    });"""

if "profileAvatar: userProfileAvatarForAdminSql(uid)" not in t:
    if old_thread not in t:
        raise SystemExit("thread res.json block not found")
    t = t.replace(old_thread, new_thread, 1)
    print("patched admin thread response")
else:
    print("thread already has profileAvatar")

p.write_text(t, encoding="utf-8")
print("wrote", p)
