import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, useReducer } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from './api';
import PublicStorefront, { readPublicStoreSnapshot } from './PublicStorefront.jsx';
import UltraxasChatBar from './components/UltraxasChatBar';
import BroadcastRichEditor from './components/BroadcastRichEditor';
import {
  sanitizeBroadcastTitle,
  sanitizeBroadcastRichHtml,
  formatBroadcastCaptionForDisplay,
  broadcastPlainTextPreview,
} from '../shared/broadcastSanitize.js';

/** Must match server `MIN_WALLET_TOPUP_GHS` / `WALLET_MIN_TOPUP_GHS`. */
const MIN_WALLET_TOPUP_GHS = 10;

/** Store dashboard → Settings: theme options for card style (digi-mall style). */
const STORE_THEME_OPTIONS = [
  { id: 'default', label: 'Default', desc: 'Clean, simple cards' },
  { id: 'gradient', label: 'Gradient', desc: 'Smooth color gradients' },
  { id: 'glass', label: 'Glass', desc: 'Glassmorphism effect' },
  { id: 'neon', label: 'Neon', desc: 'Glowing neon borders' },
  { id: 'minimal', label: 'Minimal', desc: 'Ultra clean design' },
  { id: 'bold', label: 'Bold', desc: 'Strong colors & shadows' },
];
const MAX_STORE_LOGO_BYTES = 2 * 1024 * 1024;

/**
 * Origin used for "Your store link" copy and share URL. Set at build time:
 *   VITE_PUBLIC_SITE_URL=https://client.ultraxas.com
 * so local dev (http://localhost:4173) still shows the real public link customers will use.
 * If unset, uses `window.location.origin` in the browser.
 */
function getPublicSiteOrigin() {
  const raw = (import.meta.env.VITE_PUBLIC_SITE_URL || '').trim();
  if (raw) {
    try {
      const s = raw.includes('://') ? raw : `https://${raw}`;
      return new URL(s).origin;
    } catch {
      return raw.replace(/\/$/, '');
    }
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '';
}

/** Per-user cache so two accounts / tabs on the same origin do not share one profile photo. */
const PROFILE_IMG_STORAGE_PREFIX = 'dataplus_profile_img_';
function profileImageStorageKey(userId) {
  if (userId == null || userId === '') return null;
  const n = Number(userId);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${PROFILE_IMG_STORAGE_PREFIX}${Math.trunc(n)}`;
}

const BROADCAST_DISMISS_KEY = 'dataplus_broadcast_dismissed';

/** First-visit hint for support chat UI (customer-facing, support tone). Bump suffix to show again. */
const SUPPORT_CHAT_INTRO_SEEN_KEY = 'dataplus_support_chat_intro_seen_v3';

/** Double-tap / double-click window for opening support message actions (ms). */
const SUPPORT_MSG_ACTION_DBL_MS = 320;

function readDismissMap() {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(BROADCAST_DISMISS_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw);
    if (Array.isArray(p)) {
      const o = {};
      for (const id of p) o[String(id)] = 'forever';
      return o;
    }
    if (p && typeof p === 'object' && !Array.isArray(p)) return p;
  } catch {
    return {};
  }
  return {};
}

function isBroadcastDismissed(id, reshowAfterHours) {
  const map = readDismissMap();
  const key = String(id);
  if (!(key in map)) return false;
  const v = map[key];
  if (v === 'forever') return true;
  const hours = Number(reshowAfterHours) || 0;
  if (hours <= 0) return true;
  const t = typeof v === 'number' ? v : Date.parse(String(v));
  if (!Number.isFinite(t)) return true;
  return Date.now() < t + hours * 3600000;
}

function dismissPublicBroadcast(id, reshowAfterHours) {
  const map = readDismissMap();
  const hours = Number(reshowAfterHours) || 0;
  map[String(id)] = hours <= 0 ? 'forever' : Date.now();
  localStorage.setItem(BROADCAST_DISMISS_KEY, JSON.stringify(map));
}

/** Let a broadcast show again after admin re-activates or resets dismiss state. */
function clearBroadcastDismissEntry(id) {
  if (typeof localStorage === 'undefined' || id == null || id === '') return;
  const map = readDismissMap();
  const key = String(id);
  if (!(key in map)) return;
  delete map[key];
  if (Object.keys(map).length === 0) localStorage.removeItem(BROADCAST_DISMISS_KEY);
  else localStorage.setItem(BROADCAST_DISMISS_KEY, JSON.stringify(map));
}

function broadcastPopupDelaySec(b) {
  if (!b) return 2;
  const n = Number(b.popup_delay_seconds);
  if (Number.isFinite(n)) return Math.min(600, Math.max(0, n));
  return 2;
}

/** Match server CTA rules so the button is not dropped when the user omits https:// */
function normalizeBroadcastCtaUrlForApi(raw) {
  let s = String(raw ?? '').trim();
  if (!s) return '';
  const lower = s.toLowerCase();
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) {
    s = `https://${s.replace(/^\/+/, '')}`;
  }
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.href.length > 2048 ? u.href.slice(0, 2048) : u.href;
  } catch {
    return '';
  }
}

const DASHBOARD_HEADLINES = [
  'Welcome to DataPlus',
  'Powering Smart Business Connectivity',
  'Fast. Trusted. Professional.',
  'Advert-Ready Digital Service',
];

/** Customer-facing product name (support header, headlines, etc.). */
const APP_BRAND_DISPLAY_NAME = 'DataPlus';

/** Footer credit — brand name is plain text (no link). */
const FOOTER_BRAND_NAME = 'XSLUS';
const FOOTER_CREDIT_LINES = [
  `Digital platforms and web products by ${FOOTER_BRAND_NAME}.`,
  `Engineering and design — ${FOOTER_BRAND_NAME}.`,
];

/** Render `**bold**` in support system messages as <strong>. */
function supportInlineBold(text) {
  const s = String(text ?? '');
  const parts = s.split(/\*\*/);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold">
        {part}
      </strong>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );
}

function supportInboxAvatarInitial(name, email) {
  const raw = String(name || email || '').trim();
  if (!raw) return '?';
  return raw.charAt(0).toUpperCase();
}

function SupportInboxAvatar({ src, initial, isDark, className }) {
  const [failed, setFailed] = useState(false);
  const trimmed = String(src || '').trim();
  const showImg = trimmed.length > 0 && !failed;
  const size = className || 'h-10 w-10';
  const ring = isDark ? 'ring-white/15' : 'ring-slate-200/90';
  if (showImg) {
    return (
      <div className={`${size} shrink-0 rounded-full overflow-hidden ring-1 ${ring} bg-black/5`}>
        <img src={trimmed} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />
      </div>
    );
  }
  return (
    <div
      className={`${size} shrink-0 rounded-full flex items-center justify-center text-sm font-semibold ${isDark ? 'bg-gradient-to-br from-white/15 to-white/5 text-white/95' : 'bg-gradient-to-br from-slate-200 to-slate-100 text-slate-700'}`}
      aria-hidden
    >
      {initial}
    </div>
  );
}

function supportInboxRelativeTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const diff = Date.now() - d.getTime();
    if (diff < 45_000) return 'Just now';
    if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}m`;
    if (diff < 86_400_000) return `${Math.max(1, Math.floor(diff / 3_600_000))}h`;
    if (diff < 604_800_000) return `${Math.max(1, Math.floor(diff / 86_400_000))}d`;
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    });
  } catch {
    return '';
  }
}

/** Localized date+time for support bubbles (API may send `createdAt` or `created_at`). */
function supportMsgIso(m) {
  if (!m || typeof m !== 'object') return '';
  const v = m.createdAt ?? m.created_at;
  return v != null && String(v).trim() ? String(v).trim() : '';
}

function supportMessageTimestamp(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    const opts = {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    };
    if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
    return d.toLocaleString(undefined, opts);
  } catch {
    return '';
  }
}

function supportIsAbortError(err) {
  return err?.name === 'AbortError' || err?.code === 20;
}

/** Public store path segment for `/store/:slug` — lowercase, a-z, digits, hyphens. */
function sanitizeStorePathSegment(raw) {
  if (raw == null) return '';
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function defaultStorePathSlugFromUser(u) {
  const e = (u?.email && String(u.email).split('@')[0]) || '';
  const fromEmail = sanitizeStorePathSegment(e);
  if (fromEmail) return fromEmail;
  if (u?.id != null) {
    const id = String(u.id).replace(/\D/g, '') || String(u.id);
    return `user${id}`.toLowerCase().slice(0, 40) || 'my-store';
  }
  return 'my-store';
}

/** Store Dashboard is in private testing — only these signed-in emails see the menu and page. */
const STORE_DASHBOARD_ALLOWLIST = new Set(['ultraxas@gmail.com'].map((e) => e.trim().toLowerCase()));
function isStoreDashboardAllowedForUser(u) {
  const em = u && typeof u.email === 'string' ? u.email.trim().toLowerCase() : '';
  return em.length > 0 && STORE_DASHBOARD_ALLOWLIST.has(em);
}

/** Card style aligned with system “team notified” messages — admin replies in support. */
function supportAdminReplyBubbleClass(isDark) {
  return isDark
    ? 'rounded-2xl px-3 py-2.5 text-sm max-w-full whitespace-pre-wrap shadow-sm ring-1 ring-white/10 bg-white/10 text-white/90'
    : 'rounded-2xl px-3 py-2.5 text-sm max-w-full whitespace-pre-wrap shadow-sm ring-1 ring-slate-200/90 bg-slate-200/80 text-slate-800';
}

/** Human-readable time until admin-scheduled support chat purge (ISO deadline). */
function formatSupportAutoClearRemaining(iso) {
  if (!iso) return '';
  const ms = Date.parse(String(iso));
  if (!Number.isFinite(ms)) return '';
  const left = ms - Date.now();
  if (left <= 0) return 'clearing…';
  const secTotal = Math.max(1, Math.ceil(left / 1000));
  if (secTotal < 60) return `${secTotal}s`;
  const m = Math.floor(secTotal / 60);
  const rs = secTotal % 60;
  if (secTotal < 3600) return rs ? `${m}m ${rs}s` : `${m}m`;
  const h = Math.floor(secTotal / 3600);
  const remAfterH = secTotal % 3600;
  const rm = Math.floor(remAfterH / 60);
  const rsec = remAfterH % 60;
  if (h < 48) {
    if (rm && rsec) return `${h}h ${rm}m ${rsec}s`;
    if (rm) return `${h}h ${rm}m`;
    if (rsec) return `${h}h ${rsec}s`;
    return `${h}h`;
  }
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d}d ${rh}h` : `${d}d`;
}

/** WhatsApp-style menu: hidden until double-tap (touch) or double-click (mouse). */
function SupportMessageActionsMenu({ anchor, isDark, align, disabled, onEdit, onDelete, onClose }) {
  const menuRef = useRef(null);
  useEffect(() => {
    if (!anchor) return undefined;
    const down = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', down, true);
    document.addEventListener('touchstart', down, true);
    return () => {
      document.removeEventListener('mousedown', down, true);
      document.removeEventListener('touchstart', down, true);
    };
  }, [anchor, onClose]);

  if (!anchor || typeof document === 'undefined') return null;

  const MENU_W = 156;
  const MENU_H = 88;
  let left = align === 'end' ? anchor.right - MENU_W : anchor.left;
  left = Math.max(10, Math.min(left, window.innerWidth - MENU_W - 10));
  let top = anchor.bottom + 8;
  if (top + MENU_H > window.innerHeight - 12) {
    top = Math.max(12, anchor.top - MENU_H - 8);
  }

  const shell = isDark
    ? 'bg-zinc-800/98 text-white ring-1 ring-white/12 shadow-2xl backdrop-blur-sm'
    : 'bg-white text-slate-900 ring-1 ring-slate-200 shadow-xl';

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="Message actions"
      className={`fixed z-[100001] rounded-xl overflow-hidden py-0.5 min-w-[148px] ${shell}`}
      style={{ top, left }}
    >
      <button
        type="button"
        role="menuitem"
        disabled={disabled}
        className={`w-full text-left px-4 py-2.5 text-sm font-medium disabled:opacity-40 ${isDark ? 'hover:bg-white/10 active:bg-white/[0.14]' : 'hover:bg-slate-100 active:bg-slate-200/80'}`}
        onClick={() => {
          if (disabled) return;
          onClose();
          onEdit();
        }}
      >
        Edit
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={disabled}
        className={`w-full text-left px-4 py-2.5 text-sm font-medium text-rose-500 disabled:opacity-40 ${isDark ? 'hover:bg-white/10 active:bg-white/[0.14]' : 'hover:bg-rose-50 active:bg-rose-100/80'}`}
        onClick={() => {
          if (disabled) return;
          onClose();
          onDelete();
        }}
      >
        Delete
      </button>
    </div>,
    document.body,
  );
}

/** Typing indicator — dots only; optional avatar. No visible caption (a11y: neutral “Typing”). */
function SupportTypingIndicator({ align, isDark, avatar }) {
  const row = align === 'end' ? 'justify-end' : 'justify-start';
  const pill = isDark
    ? 'bg-white/[0.08] ring-1 ring-white/12'
    : 'bg-slate-100 ring-1 ring-slate-200/90';
  return (
    <div
      className={`flex items-end gap-1.5 ${row}`}
      aria-live="polite"
      role="status"
      aria-label="Typing"
    >
      {align === 'start' ? avatar : null}
      <div className={`inline-flex items-center justify-center gap-1 rounded-2xl px-2.5 py-2 ${pill}`}>
        <span className={`support-typing-dot h-2 w-2 rounded-full ${isDark ? 'bg-white' : 'bg-slate-500'}`} />
        <span className={`support-typing-dot h-2 w-2 rounded-full ${isDark ? 'bg-white' : 'bg-slate-500'}`} />
        <span className={`support-typing-dot h-2 w-2 rounded-full ${isDark ? 'bg-white' : 'bg-slate-500'}`} />
      </div>
      {align === 'end' ? avatar : null}
    </div>
  );
}

/** Empty thread: assistant-style line with a single blinking dot (no canned tips in the list). */
function SupportAssistantIdle({ isDark, avatar }) {
  const bubble = isDark
    ? 'bg-white/10 text-white/90 ring-1 ring-white/10 mr-8'
    : 'bg-slate-200/80 text-slate-800 ring-1 ring-slate-200/80 mr-8';
  return (
    <div className="flex items-end gap-1.5 justify-start" aria-live="polite" role="status">
      {avatar}
      <div className={`flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-sm max-w-[95%] ${bubble}`}>
        <span
          className={`support-idle-dot h-2 w-2 shrink-0 rounded-full ${isDark ? 'bg-white' : 'bg-slate-600'}`}
          aria-hidden
        />
        <span className="leading-snug">
          Message us here — we’ll share quick pointers when your text matches common topics. Need a person? Tap{' '}
          <span className="font-semibold">Request a human</span> below.
        </span>
      </div>
    </div>
  );
}

/** Hide legacy server welcome / old human copy so the thread can stay visually “clean”. */
function filterSupportMessagesForUi(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.filter((m) => {
    if (m.role !== 'system' || typeof m.body !== 'string') return true;
    const b = m.body;
    if (b.startsWith('Quick tips:')) return false;
    if (b.startsWith('Your request was sent to the team.')) return false;
    return true;
  });
}

/** Auto “please hold” system line — hidden in admin UI (API may strip too). */
function isSupportAutoWaitAckMessage(m) {
  return (
    m &&
    m.role === 'system' &&
    typeof m.body === 'string' &&
    m.body.startsWith('Thanks for your message — please hold on for a moment.')
  );
}

function filterSupportMessagesForAdminUi(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.filter((m) => !isSupportAutoWaitAckMessage(m));
}

function supportMessagePreviewForReply(m) {
  if (!m) return '';
  const t = String(m.body || '').trim();
  if (m.image && !t) return '📷 Image';
  if (t.length > 160) return `${t.slice(0, 157)}…`;
  if (t) return t;
  if (m.image) return '📷 Image';
  return '(empty)';
}

/** Normalize reply fields from API (camelCase or snake_case). */
function supportMessageReplyMeta(m) {
  if (!m || typeof m !== 'object') return null;
  const rt = m.replyTo ?? m.reply_to ?? m.reply_to_id;
  const replyToStr = rt != null && String(rt).trim() !== '' ? String(rt).trim() : '';
  const replyPreviewRaw = m.replyPreview ?? m.reply_preview ?? '';
  const replyPreview = String(replyPreviewRaw).trim();
  const replyRole = m.replyRole ?? m.reply_role ?? 'system';
  if (!replyToStr && !replyPreview) return null;
  return { replyTo: replyToStr, replyPreview: replyPreview || '…', replyRole };
}

/** If the API omits reply fields on the newest admin row, attach from the composer target (send success / stale backends). */
function injectAdminReplyMetaIfMissing(messages, replyTarget) {
  if (!supportReplyDraftHasTarget(replyTarget) || !Array.isArray(messages) || messages.length === 0)
    return messages;
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'admin') return messages;
  if (supportMessageReplyMeta(last)) return messages;
  return [
    ...messages.slice(0, -1),
    {
      ...last,
      replyTo: String(replyTarget.id),
      replyPreview: String(replyTarget.preview ?? '').trim() || '…',
      replyRole: replyTarget.role || 'user',
    },
  ];
}

/** Same as injectAdminReplyMetaIfMissing for customer-sent rows (role user). */
function injectUserReplyMetaIfMissing(messages, replyTarget) {
  if (!supportReplyDraftHasTarget(replyTarget) || !Array.isArray(messages) || messages.length === 0)
    return messages;
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user') return messages;
  if (supportMessageReplyMeta(last)) return messages;
  return [
    ...messages.slice(0, -1),
    {
      ...last,
      replyTo: String(replyTarget.id),
      replyPreview: String(replyTarget.preview ?? '').trim() || '…',
      replyRole: replyTarget.role || 'admin',
    },
  ];
}

function applySupportReplyFieldsFromSource(from, onto) {
  const rt = from.replyTo ?? from.reply_to ?? from.reply_to_id;
  if (rt == null || String(rt).trim() === '') return onto;
  const rp = String(from.replyPreview ?? from.reply_preview ?? '').trim() || '…';
  const rr = String(from.replyRole ?? from.reply_role ?? 'user').trim() || 'user';
  return { ...onto, replyTo: String(rt).trim(), replyPreview: rp, replyRole: rr };
}

/**
 * GET thread polls replace messages; if the API omits reply_* on rows we already showed, copy reply fields
 * from the previous in-memory list by message id (admin + customer support).
 */
function mergeSupportReplyMetaFromPrev(prev, incoming) {
  if (!Array.isArray(incoming)) return [];
  if (!Array.isArray(prev) || prev.length === 0) return incoming;
  const prevById = new Map();
  for (const x of prev) {
    if (x && x.id != null) prevById.set(String(x.id), x);
  }
  return incoming.map((m) => {
    if (!m || m.id == null) return m;
    if (supportMessageReplyMeta(m)) return m;
    const old = prevById.get(String(m.id));
    if (!old || !supportMessageReplyMeta(old)) return m;
    return applySupportReplyFieldsFromSource(old, m);
  });
}

/** Bubble palette for WhatsApp-style reply strip (viewer = customer vs admin surface). */
function supportReplyQuoteTone(messageRole, viewerIsUser) {
  if (viewerIsUser) {
    if (messageRole === 'user') return 'customerOwn';
    return 'peer';
  }
  if (messageRole === 'admin') return 'adminOwn';
  return 'customerPeer';
}

function supportReplyQuoteWaClasses(tone, isDark, inImageCard) {
  if (inImageCard) {
    return isDark
      ? {
          bar: 'w-[3px] rounded-sm bg-indigo-400',
          box: 'bg-zinc-800/90',
          name: 'text-indigo-200',
          preview: 'text-zinc-300',
        }
      : {
          bar: 'w-[3px] rounded-sm bg-indigo-500',
          box: 'bg-slate-100',
          name: 'text-indigo-800',
          preview: 'text-slate-600',
        };
  }
  if (tone === 'customerOwn') {
    return isDark
      ? {
          bar: 'w-[3px] rounded-sm bg-white/90',
          box: 'rounded-lg bg-black/35',
          name: 'text-white font-bold',
          preview: 'text-white/75',
        }
      : {
          bar: 'w-[3px] rounded-sm bg-white/95',
          box: 'rounded-lg bg-indigo-950/40',
          name: 'text-white font-bold',
          preview: 'text-indigo-100/90',
        };
  }
  if (tone === 'peer') {
    return isDark
      ? {
          bar: 'bg-indigo-400',
          box: 'bg-white/[0.08]',
          name: 'text-white/90',
          preview: 'text-white/55',
        }
      : {
          bar: 'bg-indigo-500',
          box: 'bg-slate-100/95',
          name: 'text-indigo-800',
          preview: 'text-slate-600',
        };
  }
  if (tone === 'adminOwn') {
    return isDark
      ? {
          bar: 'w-[3px] rounded-sm bg-sky-200/90',
          box: 'rounded-lg bg-black/25',
          name: 'text-sky-100 font-bold',
          preview: 'text-white/70',
        }
      : {
          bar: 'w-[3px] rounded-sm bg-sky-700',
          box: 'rounded-lg bg-white/90',
          name: 'text-sky-950 font-bold',
          preview: 'text-slate-600',
        };
  }
  /* customerPeer */
  return isDark
    ? {
        bar: 'bg-sky-300',
        box: 'bg-sky-950/50',
        name: 'text-sky-100',
        preview: 'text-sky-100/75',
      }
    : {
        bar: 'bg-sky-500',
        box: 'bg-sky-100/95',
        name: 'text-sky-900',
        preview: 'text-sky-800/90',
      };
}

/** Thinner accent bar for inline reply quotes (bubble + composer). */
function slimSupportReplyBarClass(c) {
  const b = c.bar;
  if (b.includes('w-[3px]')) return b.replace('w-[3px] rounded-sm', 'w-[2px] rounded-full');
  return `w-[2px] rounded-full ${b}`;
}

/** Quoted context inside a message bubble — preview text only, compact strip. */
function SupportReplyQuoteInBubble({ m, isDark, viewerIsUser, inImageCard }) {
  const meta = supportMessageReplyMeta(m);
  if (!meta) return null;
  const tone = supportReplyQuoteTone(m.role, viewerIsUser);
  const c = supportReplyQuoteWaClasses(tone, isDark, !!inImageCard);
  const ownSide = tone === 'customerOwn' || tone === 'adminOwn';
  const barCls = slimSupportReplyBarClass(c);
  const outerClass = inImageCard
    ? 'flex gap-1 min-w-0 px-1.5 pt-1.5'
    : ownSide
      ? isDark
        ? 'flex gap-1 min-w-0 pb-1.5 mb-0 border-b border-white/15'
        : tone === 'customerOwn'
          ? 'flex gap-1 min-w-0 pb-1.5 mb-0 border-b border-white/20'
          : 'flex gap-1 min-w-0 pb-1.5 mb-0 border-b border-slate-600/15'
      : 'flex gap-1 min-w-0 border-b border-current/10 pb-1 mb-1.5 opacity-[0.98]';
  return (
    <div className={outerClass}>
      <div className={`shrink-0 self-stretch min-h-[1.125rem] ${barCls}`} aria-hidden />
      <div className={`min-w-0 flex-1 ${ownSide ? 'px-2 py-1' : 'rounded-md px-1.5 py-1'} ${c.box}`}>
        <p className={`text-[11px] leading-tight line-clamp-2 break-words ${c.preview}`}>{meta.replyPreview}</p>
      </div>
    </div>
  );
}

/** Composer strip while drafting — same WA reply look, dismiss × like pending image. */
function SupportComposerReplyPreview({ replyTo, isDark, viewerIsUser, onDismiss, embedded }) {
  if (!supportReplyDraftHasTarget(replyTo)) return null;
  const tone = viewerIsUser ? 'customerOwn' : 'adminOwn';
  const c = supportReplyQuoteWaClasses(tone, isDark, false);
  const barCls = slimSupportReplyBarClass(c);
  if (embedded && viewerIsUser) {
    return (
      <div className="relative w-full min-w-0 pr-9">
        <div className="flex gap-1 min-w-0">
          <div className={`shrink-0 self-stretch min-h-[1.25rem] ${barCls}`} aria-hidden />
          <div className={`min-w-0 flex-1 rounded-md px-2 py-1 ${c.box}`}>
            <p className={`text-[11px] leading-tight line-clamp-2 break-words ${c.preview}`}>
              {replyTo.preview || '…'}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="absolute right-0 top-0 flex h-6 w-6 items-center justify-center rounded-full text-sm font-light leading-none bg-white/20 text-white ring-1 ring-white/25 hover:bg-white/30"
          onClick={onDismiss}
          aria-label="Cancel reply"
        >
          ×
        </button>
      </div>
    );
  }
  return (
    <div className="mb-2">
      <div className="relative inline-block max-w-full min-w-0">
        <div className="flex gap-1 min-w-0 max-w-full pr-7">
          <div className={`shrink-0 self-stretch min-h-[1.25rem] ${barCls}`} aria-hidden />
          <div className={`min-w-0 flex-1 rounded-md px-2 py-1 ${c.box}`}>
            <p className={`text-[11px] leading-tight line-clamp-2 break-words ${c.preview}`}>
              {replyTo.preview || '…'}
            </p>
          </div>
        </div>
        <button
          type="button"
          className={`absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-xs font-light leading-none shadow ${isDark ? 'bg-zinc-800 text-white ring-1 ring-white/20 hover:bg-zinc-700' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'}`}
          onClick={onDismiss}
          aria-label="Cancel reply"
        >
          ×
        </button>
      </div>
    </div>
  );
}

const THEME_KEY_LEGACY = 'theme';
const THEME_KEY_CUSTOMER = 'dataplus_theme_customer';
const THEME_KEY_ADMIN = 'dataplus_theme_admin';

const SUPPORT_REPLY_DRAFT_KEY = 'dataplus_support_reply_draft_v1';

function supportReplyDraftHasTarget(replyTo) {
  if (!replyTo || typeof replyTo !== 'object') return false;
  const id = replyTo.id;
  return id != null && String(id).trim() !== '';
}

function parseSupportReplyDraft(raw) {
  try {
    const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!p || typeof p !== 'object') return null;
    const id = p.id;
    if (id == null || String(id).trim() === '') return null;
    return {
      id,
      role: p.role || 'user',
      preview: typeof p.preview === 'string' ? p.preview : '',
    };
  } catch {
    return null;
  }
}

function adminSupportReplyDraftKey(userId) {
  const u = userId != null ? String(userId).trim() : '';
  return u ? `dataplus_admin_reply_draft_v1_${u}` : '';
}

function readPersistedSupportReplyDraft() {
  if (typeof window === 'undefined') return null;
  try {
    const ls = localStorage.getItem(SUPPORT_REPLY_DRAFT_KEY);
    if (ls) return ls;
    const ss = sessionStorage.getItem(SUPPORT_REPLY_DRAFT_KEY);
    if (ss) {
      try {
        localStorage.setItem(SUPPORT_REPLY_DRAFT_KEY, ss);
      } catch (_) {}
    }
    return ss;
  } catch (_) {
    return null;
  }
}

function writePersistedSupportReplyDraft(json) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SUPPORT_REPLY_DRAFT_KEY, json);
  } catch (_) {}
  try {
    sessionStorage.setItem(SUPPORT_REPLY_DRAFT_KEY, json);
  } catch (_) {}
}

function clearPersistedSupportReplyDraft() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(SUPPORT_REPLY_DRAFT_KEY);
  } catch (_) {}
  try {
    sessionStorage.removeItem(SUPPORT_REPLY_DRAFT_KEY);
  } catch (_) {}
}

function readPersistedAdminReplyDraft(userId) {
  if (typeof window === 'undefined') return null;
  const key = adminSupportReplyDraftKey(userId);
  if (!key) return null;
  try {
    const ls = localStorage.getItem(key);
    if (ls) return ls;
    const ss = sessionStorage.getItem(key);
    if (ss) {
      try {
        localStorage.setItem(key, ss);
      } catch (_) {}
    }
    return ss;
  } catch (_) {
    return null;
  }
}

function writePersistedAdminReplyDraft(userId, json) {
  if (typeof window === 'undefined') return;
  const key = adminSupportReplyDraftKey(userId);
  if (!key) return;
  try {
    localStorage.setItem(key, json);
  } catch (_) {}
  try {
    sessionStorage.setItem(key, json);
  } catch (_) {}
}

function clearPersistedAdminReplyDraft(userId) {
  const key = adminSupportReplyDraftKey(userId);
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch (_) {}
  try {
    sessionStorage.removeItem(key);
  } catch (_) {}
}

function getSystemTheme() {
  if (typeof window === 'undefined') return 'light';
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch (_) {
    return window.__INITIAL_THEME__ || 'light';
  }
}

/** Customer vs /admin use separate localStorage keys so toggling theme in admin does not overwrite the customer UI preference (same device, different surfaces). */
function readThemeForSurface(isAdminSurface) {
  if (typeof window === 'undefined') return 'light';
  if (isAdminSurface) {
    const s = localStorage.getItem(THEME_KEY_ADMIN);
    if (s === 'dark' || s === 'light') return s;
    return getSystemTheme();
  }
  const scoped = localStorage.getItem(THEME_KEY_CUSTOMER);
  if (scoped === 'dark' || scoped === 'light') return scoped;
  const leg = localStorage.getItem(THEME_KEY_LEGACY);
  if (leg === 'dark' || leg === 'light') return leg;
  return getSystemTheme();
}

function persistThemeForSurface(isAdminSurface, value) {
  if (typeof window === 'undefined') return;
  if (isAdminSurface) {
    localStorage.setItem(THEME_KEY_ADMIN, value);
    return;
  }
  localStorage.setItem(THEME_KEY_CUSTOMER, value);
  try {
    localStorage.setItem(THEME_KEY_LEGACY, value);
  } catch (_) {}
}

function clearManualThemeForSurface(isAdminSurface) {
  if (typeof window === 'undefined') return;
  if (isAdminSurface) localStorage.removeItem(THEME_KEY_ADMIN);
  else {
    localStorage.removeItem(THEME_KEY_CUSTOMER);
    localStorage.removeItem(THEME_KEY_LEGACY);
  }
}

function renderFooterCreditLine(line, isDark) {
  const parts = line.split(FOOTER_BRAND_NAME);
  const brandClass = `mx-0.5 inline font-semibold tracking-wide ${
    isDark ? 'text-indigo-200' : 'text-indigo-900'
  }`;
  return parts.map((part, i) => (
    <React.Fragment key={i}>
      {part}
      {i < parts.length - 1 ? <span className={brandClass}>{FOOTER_BRAND_NAME}</span> : null}
    </React.Fragment>
  ));
}

/** Site credit strip — calm typography, soft fade between lines (same timing idea as dashboard headlines). */
function UltraxasAdBanner({ isDark }) {
  const [lineIndex, setLineIndex] = useState(0);
  const [lineVisible, setLineVisible] = useState(true);

  useEffect(() => {
    if (FOOTER_CREDIT_LINES.length < 2) return undefined;
    const timer = setInterval(() => {
      setLineVisible(false);
      setTimeout(() => {
        setLineIndex((prev) => (prev + 1) % FOOTER_CREDIT_LINES.length);
        setLineVisible(true);
      }, 280);
    }, 5500);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="w-full max-w-full py-3 sm:py-4">
      <p
        aria-live="polite"
        className={`mx-auto w-full text-center text-lg sm:text-2xl md:text-3xl font-semibold tracking-tight leading-[1.25] transition-all duration-500 ease-out ${
          lineVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-[2px]'
        } ${isDark ? 'text-slate-200' : 'text-slate-700'}`}
      >
        {renderFooterCreditLine(FOOTER_CREDIT_LINES[lineIndex], isDark)}
      </p>
    </div>
  );
}

export default function App({ adminRoute: adminRouteProp = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const adminRoute = adminRouteProp || (typeof location?.pathname === 'string' && location.pathname === '/admin');
  const adminRouteRef = useRef(adminRoute);
  adminRouteRef.current = adminRoute;
  const [theme, setTheme] = useState(
    () => (typeof window !== 'undefined' && window.__INITIAL_THEME__) || readThemeForSurface(adminRoute)
  );
  const [token, setToken] = useState(() => (typeof window !== 'undefined' ? api.getToken() : null));
  const [user, setUser] = useState(null);
  const [isSignedIn, setIsSignedIn] = useState(!!token);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [ordersExpanded, setOrdersExpanded] = useState(false);
  const [selectedMenu, setSelectedMenu] = useState(() => (typeof window !== 'undefined' && window.location.pathname === '/admin' && api.getAdminToken()) ? 'admin-analytics' : 'dashboard');
  const [activeTab, setActiveTab] = useState('mtn');
  const [scrolled, setScrolled] = useState(false);
  const [currentPage, setCurrentPage] = useState(() => (typeof window !== 'undefined' && window.location.pathname === '/admin' && api.getAdminToken()) ? 'admin-analytics' : 'dashboard');
  const [profileImage, setProfileImage] = useState(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [buyBundle, setBuyBundle] = useState(null);
  const [recipientNumber, setRecipientNumber] = useState('');
  const [recipientError, setRecipientError] = useState(null);
  const [bulkOrderInput, setBulkOrderInput] = useState('');
  const [bulkOrderError, setBulkOrderError] = useState(null);
  const [bulkOrderSuccess, setBulkOrderSuccess] = useState(null);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [confirmCheckoutOpen, setConfirmCheckoutOpen] = useState(false);
  const [confirmError, setConfirmError] = useState(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [topUpError, setTopUpError] = useState(null);
  const [topUpSuccess, setTopUpSuccess] = useState(null);
  const [topUpBusy, setTopUpBusy] = useState(false);
  /** Falls back to GET /api/public/config when VITE_PAYSTACK_PUBLIC_KEY was not baked into the build */
  const [paystackPublicKey, setPaystackPublicKey] = useState(() => import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '');
  const [paystackConfigLoading, setPaystackConfigLoading] = useState(() => !import.meta.env.VITE_PAYSTACK_PUBLIC_KEY);
  const [cartPosition, setCartPosition] = useState(() => {
    if (typeof window === 'undefined') return { x: 24, y: 80 };
    const w = window.innerWidth;
    const h = window.innerHeight;
    return { x: Math.max(16, (w - 320) / 2), y: Math.max(16, (h - 400) / 2) };
  });
  const cartDragRef = useRef({ startX: 0, startY: 0, startLeft: 0, startTop: 0 });
  const [cartButtonPosition, setCartButtonPosition] = useState(null);
  const cartButtonRef = useRef(null);
  const cartButtonDragRef = useRef({ didMove: false, startX: 0, startY: 0, startLeft: 0, startTop: 0 });
  const [supportChatFabPosition, setSupportChatFabPosition] = useState(null);
  const supportChatFabRef = useRef(null);
  const supportChatFabDragRef = useRef({ didMove: false, startX: 0, startY: 0, startLeft: 0, startTop: 0 });
  const [adminInboxFabPosition, setAdminInboxFabPosition] = useState(null);
  const adminInboxFabRef = useRef(null);
  const adminInboxFabDragRef = useRef({ didMove: false, startX: 0, startY: 0, startLeft: 0, startTop: 0 });
  const fileInputRef = useRef(null);
  const supportAttachmentInputRef = useRef(null);
  const adminSupportAttachmentInputRef = useRef(null);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [profileEditFullName, setProfileEditFullName] = useState('');
  const [profileEditEmail, setProfileEditEmail] = useState('');
  const [profileEditPhone, setProfileEditPhone] = useState('');
  const [profileEditError, setProfileEditError] = useState(null);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [passwordCurrent, setPasswordCurrent] = useState('');
  const [passwordNew, setPasswordNew] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [passwordError, setPasswordError] = useState(null);
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
  const [orderHistorySearch, setOrderHistorySearch] = useState('');
  const [orderDateFilter, setOrderDateFilter] = useState('Today');
  const [orderCustomStart, setOrderCustomStart] = useState('');
  const [orderCustomEnd, setOrderCustomEnd] = useState('');
  const [storeDashTab, setStoreDashTab] = useState('overview');
  const [storePathSlugOverride, setStorePathSlugOverride] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      const v = localStorage.getItem('dataplus_store_slug_override');
      return v ? sanitizeStorePathSegment(v) : '';
    } catch {
      return '';
    }
  });
  const [storeAvailabilityOn, setStoreAvailabilityOn] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      const v = localStorage.getItem('dataplus_store_availability');
      if (v === '0' || v === 'false') return false;
    } catch {
      // ignore
    }
    return true;
  });
  const [storeActivePackageCount] = useState(0);
  const [storeTotalPackageCount] = useState(0);
  const [storePricingOpenId, setStorePricingOpenId] = useState(null);
  const [storeCustomBundlePrices, setStoreCustomBundlePrices] = useState(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem('dataplus_store_custom_bundle_prices');
      if (!raw) return {};
      const p = JSON.parse(raw);
      return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
    } catch {
      return {};
    }
  });
  const [storeCustomBundleActive, setStoreCustomBundleActive] = useState(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem('dataplus_store_custom_bundle_active');
      if (!raw) return {};
      const p = JSON.parse(raw);
      return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
    } catch {
      return {};
    }
  });
  const [storePricingSaveMessage, setStorePricingSaveMessage] = useState(null);
  const [storeEarningsPeriod, setStoreEarningsPeriod] = useState('this-month');
  const [storeEarningsRefreshHint, setStoreEarningsRefreshHint] = useState(false);
  const [storeEarningsActionMsg, setStoreEarningsActionMsg] = useState(null);
  const [storeEarningsData, setStoreEarningsData] = useState(null);
  const [storeEarningsLoading, setStoreEarningsLoading] = useState(false);
  const [storeEarningsError, setStoreEarningsError] = useState(null);
  const loadStoreServiceSettings = () => {
    const defaults = {
      afaEnabled: true,
      afaPrice: '15',
      afaDescription: 'Register for MTN AFA to enjoy bundle benefits',
      vouchersEnabled: false,
    };
    if (typeof window === 'undefined') return defaults;
    try {
      const raw = localStorage.getItem('dataplus_store_services_v1');
      if (!raw) return defaults;
      const p = JSON.parse(raw);
      if (p && typeof p === 'object' && !Array.isArray(p)) {
        return {
          afaEnabled: typeof p.afaEnabled === 'boolean' ? p.afaEnabled : defaults.afaEnabled,
          afaPrice: typeof p.afaPrice === 'string' ? p.afaPrice : String(p.afaPrice ?? defaults.afaPrice),
          afaDescription: typeof p.afaDescription === 'string' ? p.afaDescription : defaults.afaDescription,
          vouchersEnabled: typeof p.vouchersEnabled === 'boolean' ? p.vouchersEnabled : defaults.vouchersEnabled,
        };
      }
    } catch {
      // ignore
    }
    return defaults;
  };
  const [storeServiceSettings, setStoreServiceSettings] = useState(() => loadStoreServiceSettings());
  const [storeServicesPanelMessage, setStoreServicesPanelMessage] = useState(null);
  const AFA_REG_BASE_GHS = 12;
  const loadStoreDisplaySettings = () => {
    const defaults = {
      logoDataUrl: null,
      theme: 'default',
      storeName: '',
      storeDescription: '',
      whatsapp: '',
      whatsappGroup: '',
      paystackEnabled: true,
      feeAbsorption: 0,
    };
    if (typeof window === 'undefined') return defaults;
    try {
      const raw = localStorage.getItem('dataplus_store_display_v1');
      if (!raw) return defaults;
      const p = JSON.parse(raw);
      if (p && typeof p === 'object' && !Array.isArray(p)) {
        return {
          logoDataUrl: typeof p.logoDataUrl === 'string' && p.logoDataUrl ? p.logoDataUrl : null,
          theme: typeof p.theme === 'string' && STORE_THEME_OPTIONS.some((t) => t.id === p.theme) ? p.theme : 'default',
          storeName: typeof p.storeName === 'string' ? p.storeName.slice(0, 100) : defaults.storeName,
          storeDescription: typeof p.storeDescription === 'string' ? p.storeDescription.slice(0, 500) : defaults.storeDescription,
          whatsapp: typeof p.whatsapp === 'string' ? p.whatsapp : defaults.whatsapp,
          whatsappGroup: typeof p.whatsappGroup === 'string' ? p.whatsappGroup : defaults.whatsappGroup,
          paystackEnabled: typeof p.paystackEnabled === 'boolean' ? p.paystackEnabled : defaults.paystackEnabled,
          feeAbsorption: typeof p.feeAbsorption === 'number' && p.feeAbsorption >= 0 && p.feeAbsorption <= 100 ? p.feeAbsorption : 0,
        };
      }
    } catch {
      // ignore
    }
    return defaults;
  };
  const [storeDisplaySettings, setStoreDisplaySettings] = useState(() => loadStoreDisplaySettings());
  const [storeSettingsMessage, setStoreSettingsMessage] = useState(null);
  const [storeLogoError, setStoreLogoError] = useState(null);
  const storeLogoInputRef = useRef(null);
  const storeApiSyncTimerRef = useRef(null);
  const storePricingLocalPersistTimerRef = useRef(null);
  const buildMyStoreRequestBodyRef = useRef(null);
  const vendorStoreSyncedForUserRef = useRef(null);
  const [storeLinkEditOpen, setStoreLinkEditOpen] = useState(false);
  const [storePathSlugDraft, setStorePathSlugDraft] = useState('');
  const [storeLinkSettingsMessage, setStoreLinkSettingsMessage] = useState(null);
  /** Server snapshot for `/store/:slug` when the viewer is not the owner (GET /api/public/store/:slug). */
  const [publicStoreFromApi, setPublicStoreFromApi] = useState(null);
  const [orders, setOrders] = useState([]);
  const orderCreatedAtByIdRef = useRef(new Map());
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [transactionDateFilter, setTransactionDateFilter] = useState('Today');
  const [transactionCustomStart, setTransactionCustomStart] = useState('');
  const [transactionCustomEnd, setTransactionCustomEnd] = useState('');
  const [transactionTypeFilter, setTransactionTypeFilter] = useState('All Types');
  const [transactionStatusFilter, setTransactionStatusFilter] = useState('All Status');
  const [transactionSearch, setTransactionSearch] = useState('');
  const [adminStats, setAdminStats] = useState(null);
  const [adminStatsLoading, setAdminStatsLoading] = useState(false);
  const [adminStatsError, setAdminStatsError] = useState(null);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminUsersSearch, setAdminUsersSearch] = useState('');
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const [adminRoleUpdating, setAdminRoleUpdating] = useState(null);
  const [adminOrders, setAdminOrders] = useState([]);
  const [adminOrdersLoading, setAdminOrdersLoading] = useState(false);
  const [adminOrdersError, setAdminOrdersError] = useState(null);
  const [adminOrdersSearch, setAdminOrdersSearch] = useState('');
  const [adminOrderStatusUpdating, setAdminOrderStatusUpdating] = useState(null);
  const [adminAllTransactions, setAdminAllTransactions] = useState([]);
  const [adminAllTxLoading, setAdminAllTxLoading] = useState(false);
  const [adminAllTxError, setAdminAllTxError] = useState(null);
  const [adminAllTxSearch, setAdminAllTxSearch] = useState('');
  const [adminWallets, setAdminWallets] = useState([]);
  const [adminWalletsLoading, setAdminWalletsLoading] = useState(false);
  const [adminWalletsError, setAdminWalletsError] = useState(null);
  const [adminWalletsSearch, setAdminWalletsSearch] = useState('');
  const [adminTotalWalletBalance, setAdminTotalWalletBalance] = useState(0);
  const [dashboardHeadlineIndex, setDashboardHeadlineIndex] = useState(0);
  const [dashboardHeadlineVisible, setDashboardHeadlineVisible] = useState(true);
  const [agentApplications, setAgentApplications] = useState([]);
  const [agentApplicationsLoading, setAgentApplicationsLoading] = useState(false);
  const [agentApplicationsError, setAgentApplicationsError] = useState(null);
  const [agentApplicationsSearch, setAgentApplicationsSearch] = useState('');
  const [afaApplications, setAfaApplications] = useState([]);
  const [afaApplicationsLoading, setAfaApplicationsLoading] = useState(false);
  const [afaModalOpen, setAfaModalOpen] = useState(false);
  const [afaSubmitting, setAfaSubmitting] = useState(false);
  const [afaError, setAfaError] = useState(null);
  const [afaSuccess, setAfaSuccess] = useState(null);
  const [afaForm, setAfaForm] = useState({
    full_name: '',
    phone: '',
    ghana_card_number: '',
    occupation: '',
    date_of_birth: '',
  });
  const [agentAppReview, setAgentAppReview] = useState(null);
  const [agentAppReviewSaving, setAgentAppReviewSaving] = useState(false);
  const [agentAppReviewError, setAgentAppReviewError] = useState(null);
  const [walletAdjust, setWalletAdjust] = useState(null);
  const [walletAdjustAmount, setWalletAdjustAmount] = useState('');
  const [walletAdjustSaving, setWalletAdjustSaving] = useState(false);
  const [walletAdjustError, setWalletAdjustError] = useState(null);
  const [recentUsersExpanded, setRecentUsersExpanded] = useState(false);
  const [adminDeleteUserUpdating, setAdminDeleteUserUpdating] = useState(null);
  const [adminPinVerified, setAdminPinVerified] = useState(() => !!api.getAdminToken());
  const [appSettings, setAppSettings] = useState({ sidebarLogoUrl: 'https://files.catbox.moe/l3islw.jpg' });
  const [bundlesData, setBundlesData] = useState(null);
  const [adminSettingsSaving, setAdminSettingsSaving] = useState(false);
  const [adminSettingsMessage, setAdminSettingsMessage] = useState(null);
  const [adminBundlesSaving, setAdminBundlesSaving] = useState(false);
  const [adminBundlesMessage, setAdminBundlesMessage] = useState(null);
  const [adminPackagesNetwork, setAdminPackagesNetwork] = useState('mtn');
  const [publicBroadcasts, setPublicBroadcasts] = useState([]);
  const [broadcastDismissTick, setBroadcastDismissTick] = useState(0);
  const [adminBroadcasts, setAdminBroadcasts] = useState([]);
  const [adminBroadcastsLoading, setAdminBroadcastsLoading] = useState(false);
  const [adminBroadcastsError, setAdminBroadcastsError] = useState(null);
  const [supportChatOpen, setSupportChatOpen] = useState(false);
  const [supportMessages, setSupportMessages] = useState([]);
  const [supportNeedsHuman, setSupportNeedsHuman] = useState(false);
  const [supportDraft, setSupportDraft] = useState('');
  const [supportSending, setSupportSending] = useState(false);
  const supportOutboundAbortRef = useRef(null);
  const cancelSupportOutbound = useCallback(() => {
    supportOutboundAbortRef.current?.abort();
  }, []);
  const [supportError, setSupportError] = useState(null);
  const [supportUnreadUser, setSupportUnreadUser] = useState(0);
  /** Data URL after user picks a photo; message sends only after they add a caption and tap send. */
  const [supportPendingImage, setSupportPendingImage] = useState(null);
  /** Swipe-right target: outgoing sends include replyToMessageId until cleared. */
  const [supportReplyTo, setSupportReplyTo] = useState(null);
  /** First persist effect run: avoid treating initial null `supportReplyTo` as user cleared the draft. */
  const supportCustomerReplyStorageInitRef = useRef(false);
  const [supportAdminTyping, setSupportAdminTyping] = useState(false);
  const [supportComposerFocused, setSupportComposerFocused] = useState(false);
  /** When set, composer updates this user message instead of sending a new one. */
  const [supportEditingMessageId, setSupportEditingMessageId] = useState(null);
  /** Brief fade-in banner when an admin message first appears while chat is open. */
  const [supportAgentJoinedBanner, setSupportAgentJoinedBanner] = useState(false);
  const [adminSupportInbox, setAdminSupportInbox] = useState([]);
  const [adminSupportSelectedUserId, setAdminSupportSelectedUserId] = useState(null);
  const [adminSupportThreadMessages, setAdminSupportThreadMessages] = useState([]);
  const [adminSupportThreadMeta, setAdminSupportThreadMeta] = useState(null);
  const [adminSupportLoading, setAdminSupportLoading] = useState(false);
  const [adminSupportError, setAdminSupportError] = useState(null);
  const [adminSupportReplyDraft, setAdminSupportReplyDraft] = useState('');
  const [adminSupportReplySending, setAdminSupportReplySending] = useState(false);
  const [adminSupportPendingImage, setAdminSupportPendingImage] = useState(null);
  const [adminSupportReplyTo, setAdminSupportReplyTo] = useState(null);
  const [adminSupportUserTyping, setAdminSupportUserTyping] = useState(false);
  const [adminSupportComposerFocused, setAdminSupportComposerFocused] = useState(false);
  /** Admin thread: editing an existing admin reply in the composer. */
  const [adminSupportEditingMessageId, setAdminSupportEditingMessageId] = useState(null);
  /** { messageId, left, right, top, bottom } from getBoundingClientRect — Edit/Delete popover anchor. */
  const [supportMsgActionsMenu, setSupportMsgActionsMenu] = useState(null);
  const [adminSupportMsgActionsMenu, setAdminSupportMsgActionsMenu] = useState(null);
  /** In-app delete confirm for support bubbles (replaces window.confirm / iOS system alert). */
  const [supportDeleteConfirmMessageId, setSupportDeleteConfirmMessageId] = useState(null);
  const [adminSupportDeleteConfirmMessageId, setAdminSupportDeleteConfirmMessageId] = useState(null);
  /** One-time “support is in the corner” card for first visits (non-admin). */
  const [supportChatIntroOpen, setSupportChatIntroOpen] = useState(false);
  const [adminSupportAutoClearBusy, setAdminSupportAutoClearBusy] = useState(false);
  const [adminSupportAutoClearCustomMin, setAdminSupportAutoClearCustomMin] = useState('');
  const [adminSupportAutoClearCustomSec, setAdminSupportAutoClearCustomSec] = useState('');
  const [, bumpAdminAutoClearCountdown] = useReducer((x) => x + 1, 0);
  /** admin support: floating modal like user support chat — inbox → thread inside same panel */
  const [adminSupportModalOpen, setAdminSupportModalOpen] = useState(false);
  const [adminSupportPhase, setAdminSupportPhase] = useState('inbox');
  const [broadcastForm, setBroadcastForm] = useState({
    title: '',
    caption: '',
    image_url: '',
    active: true,
    popup_delay_seconds: 2,
    auto_close_seconds: 0,
    reshow_after_hours: 0,
    cta_url: '',
    cta_label: '',
    cta_open_new_tab: true,
  });
  const [broadcastSaving, setBroadcastSaving] = useState(false);
  /** When set, Publish saves via PATCH instead of POST (form filled from Edit). */
  const [broadcastEditingId, setBroadcastEditingId] = useState(null);
  const [broadcastModalOpen, setBroadcastModalOpen] = useState(false);
  /** Admin list: show same popup UI as customers (no dismiss / no analytics). */
  const [adminBroadcastPreview, setAdminBroadcastPreview] = useState(null);
  /** { id, title } when admin confirms broadcast delete (replaces native confirm). */
  const [broadcastDeleteConfirm, setBroadcastDeleteConfirm] = useState(null);
  const [broadcastDeleteBusy, setBroadcastDeleteBusy] = useState(false);
  const broadcastDelayTimerRef = useRef(null);
  const prevVisibleBroadcastIdRef = useRef(null);
  const broadcastFileInputRef = useRef(null);
  const [editingBundle, setEditingBundle] = useState(null);
  const [editBundleForm, setEditBundleForm] = useState({ size: '', price: 0 });
  const [ultraxasChatInput, setUltraxasChatInput] = useState('');
  const ultraxasFileInputRef = useRef(null);
  const [headerShowWelcome, setHeaderShowWelcome] = useState(true);
  const adminLogoInputRef = useRef(null);
  const headerWelcomeEnteredAtRef = useRef(null);
  const headerBrandTimeoutRef = useRef(null);
  const mountedRef = useRef(true);
  const supportOwnDblTapRef = useRef({ id: null, t: 0 });
  const adminOwnDblTapRef = useRef({ id: null, t: 0 });
  const supportSwipeGestureRef = useRef(null);
  const adminSupportSwipeGestureRef = useRef(null);
  const supportSuppressOwnBubbleTouchEndRef = useRef(0);
  const adminSupportSuppressOwnBubbleTouchEndRef = useRef(0);
  /** -1 = uninitialized for this open session; used to detect new admin replies. */
  const supportPrevAdminCountRef = useRef(-1);
  const closeSupportMsgActionsMenu = useCallback(() => setSupportMsgActionsMenu(null), []);
  const closeAdminSupportMsgActionsMenu = useCallback(() => setAdminSupportMsgActionsMenu(null), []);
  const openSupportMessageMenuFromEl = useCallback((messageId, el) => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    setSupportMsgActionsMenu({
      messageId,
      left: r.left,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
    });
  }, []);
  const openAdminSupportMessageMenuFromEl = useCallback((messageId, el) => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    setAdminSupportMsgActionsMenu({
      messageId,
      left: r.left,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
    });
  }, []);
  const handleSupportOwnBubbleInteract = useCallback(
    (e, messageId) => {
      if (!messageId) return;
      if (e.type === 'dblclick') {
        supportOwnDblTapRef.current = { id: null, t: 0 };
        openSupportMessageMenuFromEl(messageId, e.currentTarget);
        return;
      }
      if (e.type === 'touchend') {
        if (Date.now() < supportSuppressOwnBubbleTouchEndRef.current) return;
        const now = Date.now();
        const prev = supportOwnDblTapRef.current;
        if (prev.id === messageId && now - prev.t < SUPPORT_MSG_ACTION_DBL_MS) {
          supportOwnDblTapRef.current = { id: null, t: 0 };
          openSupportMessageMenuFromEl(messageId, e.currentTarget);
        } else {
          supportOwnDblTapRef.current = { id: messageId, t: now };
        }
      }
    },
    [openSupportMessageMenuFromEl],
  );
  const handleAdminOwnBubbleInteract = useCallback(
    (e, messageId) => {
      if (!messageId) return;
      if (e.type === 'dblclick') {
        adminOwnDblTapRef.current = { id: null, t: 0 };
        openAdminSupportMessageMenuFromEl(messageId, e.currentTarget);
        return;
      }
      if (e.type === 'touchend') {
        if (Date.now() < adminSupportSuppressOwnBubbleTouchEndRef.current) return;
        const now = Date.now();
        const prev = adminOwnDblTapRef.current;
        if (prev.id === messageId && now - prev.t < SUPPORT_MSG_ACTION_DBL_MS) {
          adminOwnDblTapRef.current = { id: null, t: 0 };
          openAdminSupportMessageMenuFromEl(messageId, e.currentTarget);
        } else {
          adminOwnDblTapRef.current = { id: messageId, t: now };
        }
      }
    },
    [openAdminSupportMessageMenuFromEl],
  );

  const supportThreadSwipeDown = useCallback((e, m) => {
    if (e.button !== 0 || !e.isPrimary || !m?.id) return;
    supportSwipeGestureRef.current = {
      pid: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      messageId: m.id,
    };
  }, []);
  const supportThreadSwipeUp = useCallback((e, m) => {
    const s = supportSwipeGestureRef.current;
    supportSwipeGestureRef.current = null;
    if (!m?.id || !s || s.pid !== e.pointerId || s.messageId !== m.id) return;
    const dx = e.clientX - s.x;
    const dy = Math.abs(e.clientY - s.y);
    if (dx > 52 && dy < 56) {
      supportSuppressOwnBubbleTouchEndRef.current = Date.now() + 500;
      setSupportReplyTo({ id: m.id, role: m.role, preview: supportMessagePreviewForReply(m) });
    }
  }, []);
  const supportThreadSwipeCancel = useCallback(() => {
    supportSwipeGestureRef.current = null;
  }, []);

  const adminSupportThreadSwipeDown = useCallback((e, m) => {
    if (e.button !== 0 || !e.isPrimary || !m?.id) return;
    adminSupportSwipeGestureRef.current = {
      pid: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      messageId: m.id,
    };
  }, []);
  const adminSupportThreadSwipeUp = useCallback((e, m) => {
    const s = adminSupportSwipeGestureRef.current;
    adminSupportSwipeGestureRef.current = null;
    if (!m?.id || !s || s.pid !== e.pointerId || s.messageId !== m.id) return;
    const dx = e.clientX - s.x;
    const dy = Math.abs(e.clientY - s.y);
    if (dx > 52 && dy < 56) {
      adminSupportSuppressOwnBubbleTouchEndRef.current = Date.now() + 500;
      setAdminSupportReplyTo({ id: m.id, role: m.role, preview: supportMessagePreviewForReply(m) });
    }
  }, []);
  const adminSupportThreadSwipeCancel = useCallback(() => {
    adminSupportSwipeGestureRef.current = null;
  }, []);
  const hasAdminRole = (user?.role || '').toLowerCase() === 'admin';
  /** Sidebar admin links:
   * - real admin users always see admin tabs
   * - PIN-only sessions see admin tabs only on /admin
   */
  const showAdminNav = (isSignedIn && hasAdminRole) || (adminRoute && adminPinVerified);
  /** Catalog / bundle edit controls — admins use customer UI on /, tools on /admin */
  const adminStoreTools = adminRoute && (hasAdminRole || adminPinVerified);
  const adminDisplayName = (raw) => {
    const name = (raw ?? '').toString().trim();
    if (name.toLowerCase() === 'xason') return 'Gyamfi Bless';
    return name || 'Gyamfi Bless';
  };
  const brandLogoUrl = appSettings?.sidebarLogoUrl || 'https://files.catbox.moe/l3islw.jpg';
  const ownerAdminEmails = new Set(['xasongab@gmail.com', 'gyamfibless0700@gmail.com', 'lobstanzerg@gmail.com']);
  const isOwnerAdmin = hasAdminRole && (
    ownerAdminEmails.has((user?.email || '').toLowerCase()) ||
    ['xason', 'gyamfi bless'].includes((user?.full_name || '').trim().toLowerCase())
  );
  const useOwnerAdminPresentation = isOwnerAdmin && adminRoute;
  const profileDisplayName = useOwnerAdminPresentation
    ? adminDisplayName(user?.full_name || user?.email || 'User')
    : (user?.full_name || user?.email || 'User');
  const canShowUserPhoto = Boolean(isSignedIn && user?.id);
  const photoForUi = canShowUserPhoto ? profileImage : null;
  const pinOnlyAdminShell = adminRoute && adminPinVerified && !isSignedIn;
  /** Keep /admin visuals consistent: always use brand logo there. */
  const adminAvatarSrc = adminRoute
    ? brandLogoUrl
    : (pinOnlyAdminShell ? brandLogoUrl : photoForUi);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    api.getSettings().then((s) => setAppSettings((prev) => ({ ...prev, ...s }))).catch(() => {});
  }, []);

  useEffect(() => {
    api.getBundles().then((b) => setBundlesData(b)).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api
        .getBroadcasts()
        .then((list) => {
          if (!cancelled) setPublicBroadcasts(Array.isArray(list) ? list : []);
        })
        .catch(() => {
          if (!cancelled) setPublicBroadcasts([]);
        });
    };
    load();
    if (adminRoute) {
      return () => {
        cancelled = true;
      };
    }
    const id = setInterval(load, 120000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [adminRoute]);

  useEffect(() => {
    if (import.meta.env.VITE_PAYSTACK_PUBLIC_KEY) return;
    let cancelled = false;
    api
      .getPublicConfig()
      .then((c) => {
        if (!cancelled && c?.paystackPublicKey) setPaystackPublicKey(String(c.paystackPublicKey).trim());
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setPaystackConfigLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** After Paystack redirect, URL contains ?reference=… — verify and credit wallet */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const ref = (params.get('reference') || params.get('trxref') || '').trim();
    if (!ref || !api.getToken()) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await api.verifyPaystackWalletTopUp(ref);
        if (cancelled) return;
        setWalletBalance(r.balance);
        setTopUpSuccess('Payment successful. Your wallet balance has been updated.');
        setTopUpError(null);
        setCurrentPage('topup');
        const list = await api.getTransactions();
        if (!cancelled) setTransactions(Array.isArray(list) ? list : []);
      } catch (e) {
        if (!cancelled) {
          setTopUpError(e?.message || 'Could not verify payment');
          setCurrentPage('topup');
        }
      } finally {
        if (!cancelled && typeof window !== 'undefined') {
          const path = window.location.pathname || '/';
          window.history.replaceState({}, '', path + (window.location.hash || ''));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Switch header from welcome back to brand name after 10 seconds. Do NOT clear the timeout in cleanup when effect re-runs (e.g. auth state) so the timer keeps running.
  useEffect(() => {
    const hasMainApp = isSignedIn || (adminRoute && adminPinVerified);

    if (!hasMainApp) {
      headerWelcomeEnteredAtRef.current = null;
      if (headerBrandTimeoutRef.current) {
        clearTimeout(headerBrandTimeoutRef.current);
        headerBrandTimeoutRef.current = null;
      }
      return;
    }

    const justEntered = headerWelcomeEnteredAtRef.current === null;
    if (justEntered) {
      headerWelcomeEnteredAtRef.current = Date.now();
      setHeaderShowWelcome(true);
      headerBrandTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) setHeaderShowWelcome(false);
        headerBrandTimeoutRef.current = null;
      }, 10 * 1000);
    }
    // Intentionally no cleanup: when effect re-runs (e.g. isSignedIn updates), we keep the existing timeout so it can fire after 3 min. Timeout is cleared only when hasMainApp becomes false above.
  }, [isSignedIn, adminRoute, adminPinVerified]);

  const clearSession = () => {
    try {
      const uid = user?.id;
      if (uid != null) {
        const k = profileImageStorageKey(uid);
        if (k) localStorage.removeItem(k);
      }
      localStorage.removeItem('profileImage');
    } catch (_) {}
    api.setToken(null);
    api.clearAdminToken();
    setToken(null);
    setIsSignedIn(false);
    setAdminPinVerified(false);
    setUser(null);
    setProfileImage(null);
    setWalletBalance(0);
    setCurrentPage('dashboard');
    setSelectedMenu('dashboard');
    setProfileOpen(false);
    setSidebarOpen(false);
    orderCreatedAtByIdRef.current = new Map();
    localStorage.removeItem('dataplus_signed_in');
    clearPersistedSupportReplyDraft();
  };

  const parseTimestampMs = (value) => {
    if (value === null || value === undefined || value === '') return NaN;
    if (value instanceof Date) {
      const ms = value.getTime();
      return Number.isFinite(ms) ? ms : NaN;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return NaN;
      return value < 1e12 ? value * 1000 : value;
    }
    const raw = String(value).trim();
    if (!raw) return NaN;
    if (/^\d{10,16}$/.test(raw)) {
      const asNum = Number(raw);
      if (Number.isFinite(asNum)) {
        if (raw.length <= 10) return asNum * 1000;
        if (raw.length === 13) return asNum;
        if (raw.length > 13) return Math.floor(asNum / (10 ** (raw.length - 13)));
      }
    }
    // SQLite datetime('now'): "YYYY-MM-DD HH:mm:ss" — not reliably parsed in all engines
    let normalized = raw;
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(raw)) {
      normalized = raw.replace(' ', 'T');
    }
    const parsed = Date.parse(normalized);
    return Number.isFinite(parsed) ? parsed : NaN;
  };

  const parseTimestampFromText = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return NaN;
    const matches = raw.match(/\d{10,16}/g) || [];
    for (const token of matches) {
      const ms = parseTimestampMs(token);
      if (!Number.isFinite(ms)) continue;
      if (ms < Date.parse('2019-01-01T00:00:00.000Z')) continue;
      if (ms > Date.now() + 7 * 86400000) continue;
      return ms;
    }
    return NaN;
  };

  const getOrderCreatedAtIso = (order) => {
    if (!order || typeof order !== 'object') return null;
    const candidates = [
      order.created_at,
      order.createdAt,
      order.date,
      order.ordered_at,
      order.order_date,
      order.timestamp,
    ];
    for (const value of candidates) {
      const ms = parseTimestampMs(value);
      if (Number.isFinite(ms)) return new Date(ms).toISOString();
    }
    const referenceCandidates = [
      order.reference,
      order.payment_reference,
      order.paystack_reference,
      order.transaction_reference,
      order.ref,
      order.order_ref,
    ];
    for (const value of referenceCandidates) {
      const ms = parseTimestampFromText(value);
      if (Number.isFinite(ms)) return new Date(ms).toISOString();
    }
    return null;
  };

  const stabilizeOrdersList = (list) => {
    if (!Array.isArray(list)) return [];
    return list.map((order) => {
      if (!order || typeof order !== 'object') return order;
      const id = order.id ?? order.order_id ?? order.orderId;
      if (id === undefined || id === null) return order;
      const key = String(id);
      const normalizedCreatedAt = getOrderCreatedAtIso(order);
      const cached = orderCreatedAtByIdRef.current.get(key) ?? null;
      if (normalizedCreatedAt) {
        if (!cached) orderCreatedAtByIdRef.current.set(key, normalizedCreatedAt);
        return { ...order, created_at: cached || normalizedCreatedAt };
      }
      if (cached) return { ...order, created_at: cached };
      // Some upstream order rows do not include any timestamp field.
      // Keep a stable first-seen fallback so UI never shows moving/dash time.
      const firstSeenCreatedAt = new Date().toISOString();
      orderCreatedAtByIdRef.current.set(key, firstSeenCreatedAt);
      return { ...order, created_at: firstSeenCreatedAt };
    });
  };

  const fetchWallet = () => {
    if (!api.getToken()) return;
    api.getWallet()
      .then((d) => setWalletBalance(d.balance))
      .catch((e) => {
        if (/unauthorized|expired|401/i.test(String(e?.message || ''))) clearSession();
      });
  };
  const sendUltraxasChatMessage = () => {
    if (!ultraxasChatInput.trim()) return;
    setUltraxasChatInput('');
  };
  const handleUltraxasUploadClick = () => {
    ultraxasFileInputRef.current?.click();
  };


  useEffect(() => {
    if (!token) {
      setIsSignedIn(false);
      setUser(null);
      setProfileImage(null);
      setWalletBalance(0);
      return;
    }
    api.me()
      .then((u) => {
        // me() returns null on 401 — must not leave isSignedIn true with a dead token
        if (!u) {
          clearSession();
          return;
        }
        setUser(u);
        setIsSignedIn(true);
        fetchWallet();
      })
      .catch(() => {
        clearSession();
      });
  }, [token]);

  useEffect(() => {
    if ((currentPage === 'topup' || currentPage === 'transactions' || currentPage === 'dashboard') && api.getToken()) {
      api.getTransactions()
        .then(setTransactions)
        .catch((e) => {
          if (/unauthorized|expired|401/i.test(String(e?.message || ''))) clearSession();
          setTransactions([]);
        });
    }
  }, [currentPage]);

  useEffect(() => {
    if ((currentPage === 'orders' || currentPage === 'dashboard') && api.getToken()) {
      setOrdersLoading(true);
      api.getOrders()
        .then((list) => setOrders(stabilizeOrdersList(list)))
        .catch(() => setOrders([]))
        .finally(() => setOrdersLoading(false));
    }
  }, [currentPage]);

  useEffect(() => {
    if (currentPage !== 'dashboard') return undefined;
    let fadeTimer;
    const timer = setInterval(() => {
      setDashboardHeadlineVisible(false);
      fadeTimer = setTimeout(() => {
        setDashboardHeadlineIndex((prev) => (prev + 1) % DASHBOARD_HEADLINES.length);
        setDashboardHeadlineVisible(true);
      }, 220);
    }, 3200);
    return () => {
      clearInterval(timer);
      if (fadeTimer) clearTimeout(fadeTimer);
    };
  }, [currentPage]);

  useEffect(() => {
    if (currentPage === 'afa-registration' && api.getToken()) {
      setAfaApplicationsLoading(true);
      api.getAfaApplications()
        .then((list) => setAfaApplications(Array.isArray(list) ? list : []))
        .catch(() => setAfaApplications([]))
        .finally(() => setAfaApplicationsLoading(false));
    }
  }, [currentPage]);

  useEffect(() => {
    if (currentPage !== 'orders' || !api.getToken()) return undefined;
    const timer = setInterval(() => {
      api.getOrders()
        .then((list) => setOrders(stabilizeOrdersList(list)))
        .catch(() => {});
    }, 10000);
    return () => clearInterval(timer);
  }, [currentPage, token]);

  useEffect(() => {
    const hasAdminAccess = adminPinVerified || (user?.role === 'admin' && api.getToken());
    if (currentPage === 'admin-analytics' && hasAdminAccess) {
      setAdminStatsLoading(true);
      setAdminStatsError(null);
      Promise.all([api.getAdminStats(), api.getAdminUsers(), api.getAdminWallets()])
        .then(([stats, users, wallets]) => {
          setAdminStats(stats);
          setAdminUsers(Array.isArray(users) ? users : []);
          const walletTotal = (Array.isArray(wallets) ? wallets : []).reduce((sum, w) => {
            const raw = w?.balance;
            const parsed = typeof raw === 'number' ? raw : parseFloat(raw);
            return sum + (Number.isFinite(parsed) ? parsed : 0);
          }, 0);
          setAdminTotalWalletBalance(walletTotal);
        })
        .catch((err) => {
          const msg = err?.message || 'Failed to load admin data';
          setAdminStatsError(msg);
          setAdminStats(null);
          setAdminUsers([]);
          setAdminTotalWalletBalance(0);
          const isTokenInvalid = /invalid|expired|token|unauthorized|401|403/i.test(msg);
          if (isTokenInvalid) {
            api.clearAdminToken();
            setAdminPinVerified(false);
          }
        })
        .finally(() => setAdminStatsLoading(false));
    } else if (currentPage === 'admin-users' && hasAdminAccess) {
      setAdminUsersLoading(true);
      api.getAdminUsers()
        .then((users) => setAdminUsers(Array.isArray(users) ? users : []))
        .catch(() => setAdminUsers([]))
        .finally(() => setAdminUsersLoading(false));
    } else if (currentPage === 'admin-orders' && hasAdminAccess) {
      setAdminOrdersLoading(true);
      setAdminOrdersError(null);
      setAgentApplicationsLoading(true);
      setAgentApplicationsError(null);
      Promise.all([api.getAdminOrders(), api.getAgentApplications()])
        .then(([ordersList, appList]) => {
          setAdminOrders(Array.isArray(ordersList) ? ordersList : []);
          setAgentApplications(Array.isArray(appList) ? appList : []);
        })
        .catch((err) => {
          const msg = err?.message || 'Failed to load admin order data';
          setAdminOrdersError(msg);
          setAgentApplicationsError(msg);
          setAdminOrders([]);
          setAgentApplications([]);
        })
        .finally(() => setAgentApplicationsLoading(false))
        .finally(() => setAdminOrdersLoading(false));
    } else if (currentPage === 'admin-packages' && hasAdminAccess) {
      api.getBundles()
        .then((b) => setBundlesData(b && typeof b === 'object' ? b : null))
        .catch(() => {});
    } else if (currentPage === 'admin-all-transactions' && hasAdminAccess) {
      setAdminAllTxLoading(true);
      setAdminAllTxError(null);
      api.getAdminTransactions()
        .then((list) => setAdminAllTransactions(Array.isArray(list) ? list : []))
        .catch((err) => {
          setAdminAllTxError(err?.message || 'Failed to load transactions');
          setAdminAllTransactions([]);
        })
        .finally(() => setAdminAllTxLoading(false));
    } else if (currentPage === 'admin-wallet' && hasAdminAccess) {
      setAdminWalletsLoading(true);
      setAdminWalletsError(null);
      api.getAdminWallets()
        .then((list) => setAdminWallets(Array.isArray(list) ? list : []))
        .catch((err) => {
          setAdminWalletsError(err?.message || 'Failed to load wallets');
          setAdminWallets([]);
        })
        .finally(() => setAdminWalletsLoading(false));
    } else if (currentPage === 'admin-applications' && hasAdminAccess) {
      setAgentApplicationsLoading(true);
      setAgentApplicationsError(null);
      api
        .getAgentApplications()
        .then((list) => setAgentApplications(Array.isArray(list) ? list : []))
        .catch((err) => {
          setAgentApplicationsError(err?.message || 'Failed to load applications');
          setAgentApplications([]);
        })
        .finally(() => setAgentApplicationsLoading(false));
    } else if (currentPage === 'admin-broadcasts' && hasAdminAccess) {
      setAdminBroadcastsLoading(true);
      setAdminBroadcastsError(null);
      api
        .getAdminBroadcasts()
        .then((list) => setAdminBroadcasts(Array.isArray(list) ? list : []))
        .catch((err) => {
          setAdminBroadcastsError(err?.message || 'Failed to load broadcasts');
          setAdminBroadcasts([]);
        })
        .finally(() => setAdminBroadcastsLoading(false));
    } else if (adminSupportModalOpen && hasAdminAccess) {
      setAdminSupportLoading(true);
      setAdminSupportError(null);
      api
        .getAdminSupportInbox()
        .then((list) => setAdminSupportInbox(Array.isArray(list) ? list : []))
        .catch((err) => {
          setAdminSupportError(err?.message || 'Failed to load support inbox');
          setAdminSupportInbox([]);
        })
        .finally(() => setAdminSupportLoading(false));
    }
  }, [currentPage, user?.role, adminPinVerified, adminSupportModalOpen]);

  useEffect(() => {
    if (adminSupportModalOpen) return;
    setAdminSupportSelectedUserId(null);
    setAdminSupportThreadMessages([]);
    setAdminSupportThreadMeta(null);
    setAdminSupportReplyDraft('');
    setAdminSupportPhase('inbox');
    setAdminSupportPendingImage(null);
    setAdminSupportReplyTo(null);
    setAdminSupportError(null);
    setAdminSupportMsgActionsMenu(null);
    try {
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith('dataplus_admin_reply_draft_v1_')) sessionStorage.removeItem(k);
      }
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith('dataplus_admin_reply_draft_v1_')) localStorage.removeItem(k);
      }
    } catch (_) {}
  }, [adminSupportModalOpen]);

  useEffect(() => {
    if (typeof window === 'undefined' || adminRoute || !isSignedIn || !token) {
      setSupportChatIntroOpen(false);
      return;
    }
    if (!user) return;
    try {
      if (localStorage.getItem(SUPPORT_CHAT_INTRO_SEEN_KEY) === '1') {
        setSupportChatIntroOpen(false);
        return;
      }
    } catch (_) {
      return;
    }
    if (broadcastModalOpen) {
      setSupportChatIntroOpen(false);
      return;
    }
    setSupportChatIntroOpen(true);
  }, [adminRoute, isSignedIn, token, user, broadcastModalOpen]);

  useEffect(() => {
    if (!supportChatOpen) {
      setSupportMsgActionsMenu(null);
      setSupportDeleteConfirmMessageId(null);
    }
  }, [supportChatOpen]);

  useEffect(() => {
    if (!adminSupportModalOpen || adminSupportPhase !== 'thread') {
      setAdminSupportMsgActionsMenu(null);
      setAdminSupportDeleteConfirmMessageId(null);
    }
  }, [adminSupportModalOpen, adminSupportPhase]);

  useEffect(() => {
    if (!isSignedIn || adminRoute || !api.getToken()) return undefined;
    let cancelled = false;
    const tick = () => {
      api.getSupportStatus().then((s) => {
        if (!cancelled) setSupportUnreadUser(Number(s.unreadUser) || 0);
      }).catch(() => {});
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isSignedIn, adminRoute]);

  useEffect(() => {
    if (!supportChatOpen || !isSignedIn || adminRoute) return undefined;
    let cancelled = false;
    const load = () => {
      api
        .getSupportThread()
        .then((d) => {
          if (cancelled) return;
          const incoming = Array.isArray(d.messages) ? d.messages : [];
          setSupportMessages((prev) => mergeSupportReplyMetaFromPrev(prev, incoming));
          setSupportNeedsHuman(!!d.needsHuman);
          setSupportUnreadUser(0);
          setSupportError(null);
          setSupportAdminTyping(!!d.adminTyping);
        })
        .catch((e) => {
          if (!cancelled) setSupportError(e?.message || 'Could not load chat');
        });
    };
    load();
    const id = setInterval(load, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [supportChatOpen, isSignedIn, adminRoute]);

  useEffect(() => {
    if (!supportChatOpen) {
      supportPrevAdminCountRef.current = -1;
      setSupportAgentJoinedBanner(false);
      return;
    }
    const n = supportMessages.filter((m) => m.role === 'admin').length;
    if (supportPrevAdminCountRef.current === -1) {
      supportPrevAdminCountRef.current = n;
      return;
    }
    // First admin message in this open session (fade-in banner once).
    if (supportPrevAdminCountRef.current < 1 && n >= 1) {
      supportPrevAdminCountRef.current = n;
      setSupportAgentJoinedBanner(true);
      const t = setTimeout(() => setSupportAgentJoinedBanner(false), 5200);
      return () => clearTimeout(t);
    }
    supportPrevAdminCountRef.current = n;
  }, [supportChatOpen, supportMessages]);

  useEffect(() => {
    if (!supportChatOpen) {
      setSupportPendingImage(null);
      setSupportReplyTo(null);
      return;
    }
    try {
      const p = parseSupportReplyDraft(readPersistedSupportReplyDraft());
      if (p) {
        setSupportReplyTo((cur) => (supportReplyDraftHasTarget(cur) ? cur : p));
      }
    } catch (_) {}
  }, [supportChatOpen]);

  useEffect(() => {
    try {
      if (!supportCustomerReplyStorageInitRef.current) {
        supportCustomerReplyStorageInitRef.current = true;
        if (!supportReplyTo) return;
      }
      if (!supportReplyTo || !supportReplyDraftHasTarget(supportReplyTo)) {
        return;
      }
      writePersistedSupportReplyDraft(JSON.stringify(supportReplyTo));
    } catch (_) {}
  }, [supportReplyTo]);

  useEffect(() => {
    setAdminSupportPendingImage(null);
    if (!adminSupportSelectedUserId) {
      setAdminSupportReplyTo(null);
      return;
    }
    try {
      const p = parseSupportReplyDraft(readPersistedAdminReplyDraft(adminSupportSelectedUserId));
      setAdminSupportReplyTo(p || null);
    } catch (_) {
      setAdminSupportReplyTo(null);
    }
  }, [adminSupportSelectedUserId]);

  useEffect(() => {
    if (!adminSupportSelectedUserId) return;
    if (!adminSupportReplyTo || !supportReplyDraftHasTarget(adminSupportReplyTo)) return;
    try {
      writePersistedAdminReplyDraft(adminSupportSelectedUserId, JSON.stringify(adminSupportReplyTo));
    } catch (_) {}
  }, [adminSupportSelectedUserId, adminSupportReplyTo]);

  useEffect(() => {
    if (!showAdminNav) return undefined;
    const hasAdminAccess = adminPinVerified || (user?.role === 'admin' && api.getToken());
    if (!hasAdminAccess) return undefined;
    const load = () => {
      api.getAdminSupportInbox().then((list) => setAdminSupportInbox(Array.isArray(list) ? list : [])).catch(() => {});
    };
    load();
    const ms = adminSupportModalOpen ? 8000 : 20000;
    const id = setInterval(load, ms);
    return () => clearInterval(id);
  }, [showAdminNav, adminSupportModalOpen, adminPinVerified, user?.role]);

  useEffect(() => {
    if (!adminSupportModalOpen || !adminSupportSelectedUserId || adminSupportPhase !== 'thread') return undefined;
    const hasAdminAccess = adminPinVerified || (user?.role === 'admin' && api.getToken());
    if (!hasAdminAccess) return undefined;
    let cancelled = false;
    const uid = adminSupportSelectedUserId;
    const load = () => {
      api
        .getAdminSupportThread(uid)
        .then((d) => {
          if (cancelled) return;
          const incoming = Array.isArray(d.messages) ? d.messages : [];
          setAdminSupportThreadMessages((prev) => mergeSupportReplyMetaFromPrev(prev, incoming));
          setAdminSupportThreadMeta({
            userEmail: d.userEmail,
            userName: d.userName,
            profileAvatar: d.profileAvatar,
            needsHuman: d.needsHuman,
            userId: d.userId,
            autoClearAt: d.autoClearAt ?? null,
          });
          setAdminSupportUserTyping(!!d.userTyping);
        })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [adminSupportModalOpen, adminSupportSelectedUserId, adminSupportPhase, adminPinVerified, user?.role]);

  useEffect(() => {
    if (!supportChatOpen) setSupportComposerFocused(false);
  }, [supportChatOpen]);

  useEffect(() => {
    if (!adminSupportModalOpen || adminSupportPhase !== 'thread') setAdminSupportComposerFocused(false);
  }, [adminSupportModalOpen, adminSupportPhase]);

  useEffect(() => {
    if (!supportChatOpen || !isSignedIn || adminRoute) return undefined;
    const active =
      !!(String(supportDraft).trim() || supportPendingImage || supportComposerFocused);
    if (!active) {
      api.postSupportTyping(false).catch(() => {});
      return undefined;
    }
    const ping = () => api.postSupportTyping(true).catch(() => {});
    ping();
    const id = setInterval(ping, 2000);
    return () => {
      clearInterval(id);
      api.postSupportTyping(false).catch(() => {});
    };
  }, [
    supportChatOpen,
    isSignedIn,
    adminRoute,
    supportDraft,
    supportPendingImage,
    supportComposerFocused,
  ]);

  useEffect(() => {
    if (!adminSupportModalOpen || adminSupportPhase !== 'thread' || !adminSupportSelectedUserId) return undefined;
    const hasAdminAccess = adminPinVerified || (user?.role === 'admin' && api.getToken());
    if (!hasAdminAccess) return undefined;
    const uid = adminSupportSelectedUserId;
    const active =
      !!(
        String(adminSupportReplyDraft).trim() ||
        adminSupportPendingImage ||
        adminSupportComposerFocused
      );
    if (!active) {
      api.postAdminSupportTyping(uid, false).catch(() => {});
      return undefined;
    }
    const ping = () => api.postAdminSupportTyping(uid, true).catch(() => {});
    ping();
    const id = setInterval(ping, 2000);
    return () => {
      clearInterval(id);
      api.postAdminSupportTyping(uid, false).catch(() => {});
    };
  }, [
    adminSupportModalOpen,
    adminSupportPhase,
    adminSupportSelectedUserId,
    adminSupportReplyDraft,
    adminSupportPendingImage,
    adminSupportComposerFocused,
    adminPinVerified,
    user?.role,
  ]);

  useEffect(() => {
    if (!adminSupportModalOpen || adminSupportPhase !== 'thread' || !adminSupportThreadMeta?.autoClearAt)
      return undefined;
    const id = setInterval(() => bumpAdminAutoClearCountdown(), 1000);
    return () => clearInterval(id);
  }, [adminSupportModalOpen, adminSupportPhase, adminSupportThreadMeta?.autoClearAt]);

  useEffect(() => {
    setAdminSupportAutoClearCustomMin('');
    setAdminSupportAutoClearCustomSec('');
  }, [adminSupportSelectedUserId]);

  const applyAdminSupportAutoClear = useCallback(
    async (opts) => {
      const uid = adminSupportSelectedUserId;
      if (!uid) return;
      setAdminSupportAutoClearBusy(true);
      setAdminSupportError(null);
      try {
        const d = await api.postAdminSupportAutoClear(uid, opts);
        const incoming = Array.isArray(d.messages) ? d.messages : [];
        setAdminSupportThreadMessages((prev) => mergeSupportReplyMetaFromPrev(prev, incoming));
        setAdminSupportThreadMeta((prev) => ({
          userEmail: d.userEmail ?? prev?.userEmail,
          userName: d.userName ?? prev?.userName,
          profileAvatar:
            typeof d.profileAvatar === 'string' && d.profileAvatar.trim()
              ? d.profileAvatar.trim()
              : prev?.profileAvatar,
          needsHuman: !!d.needsHuman,
          userId: d.userId ?? prev?.userId ?? uid,
          autoClearAt: d.autoClearAt ?? null,
        }));
      } catch (err) {
        setAdminSupportError(err?.message || 'Could not update timer');
      } finally {
        setAdminSupportAutoClearBusy(false);
      }
    },
    [adminSupportSelectedUserId],
  );

  const supportMessagesUi = useMemo(
    () => filterSupportMessagesForUi(supportMessages),
    [supportMessages],
  );

  const adminSupportMessagesUi = useMemo(
    () => filterSupportMessagesForAdminUi(adminSupportThreadMessages),
    [adminSupportThreadMessages],
  );

  const networkLabel = (n) => ({ mtn: 'MTN', telecel: 'Telecel', bigtime: 'AT BigTime', ishare: 'AT iShare' }[n] || 'MTN');
  const stableOrderCodeSuffix = (id, createdAt) => {
    const s = String(id ?? '');
    const hexish = s.replace(/[^0-9a-f]/gi, '');
    if (hexish.length >= 8) return hexish.slice(0, 8).toUpperCase();
    const seed = `${s}|${createdAt || ''}`;
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
    return (h >>> 0).toString(16).padStart(8, '0').slice(0, 8).toUpperCase();
  };
  const formatOrderDisplayId = (order, fallbackCreatedAt) => {
    const rawOrd = (order?.order_number || order?.orderNumber || order?.order_id || '').toString().trim();
    if (rawOrd) return rawOrd.toUpperCase().startsWith('ORD-') ? rawOrd : `ORD-${rawOrd.replace(/^ORD-?/i, '')}`;
    const refRaw = (
      order?.reference ||
      order?.payment_reference ||
      order?.paystack_reference ||
      order?.transaction_reference ||
      ''
    ).toString();
    const seqMatch = refRaw.match(/(?:^|[-_])(\\d{1,9})(?:[-_]|$)/);
    if (seqMatch && seqMatch[1]) return `ORD-${seqMatch[1].padStart(6, '0')}`;
    const rawId = (order?.id ?? '').toString().trim();
    if (/^\d+$/.test(rawId)) return `ORD-${rawId.padStart(6, '0')}`;
    return `ORD-${stableOrderCodeSuffix(order?.id, fallbackCreatedAt || order?.created_at || order?.createdAt)}`;
  };
  const normalizeAdminOrderRow = (o) => {
    const canonicalCreatedIso = getOrderCreatedAtIso(o);
    const netKey = o.network;
    const net = networkLabel(typeof netKey === 'string' && netKey.length <= 24 ? netKey.toLowerCase() : 'mtn');
    const bundle = (o.bundle_size || o.bundle || o.data_bundle || o.plan || '').toString().trim() || '—';
    const recipient = (
      o.recipient_number ||
      o.recipient_phone ||
      o.phone_number ||
      o.msisdn ||
      o.phone ||
      o.recipient ||
      ''
    ).toString();
    const orderIdDisplay = formatOrderDisplayId(o, canonicalCreatedIso || o.created_at);
    const ref =
      o.reference ||
      o.payment_reference ||
      o.paystack_reference ||
      o.transaction_reference ||
      o.pay_ref ||
      (() => {
        const ms = parseTimestampMs(canonicalCreatedIso || o.created_at);
        const t = Number.isFinite(ms) ? ms : Date.now();
        const tail = String(o.id ?? '').replace(/\D/g, '').slice(-6) || String(Math.abs((t % 1e9) | 0)).padStart(6, '0');
        return `${t}${tail}`.replace(/\D/g, '').slice(0, 17);
      })();
    const customer =
      o.customer_name ||
      o.buyer_name ||
      o.full_name ||
      o.name ||
      o.user_full_name ||
      (o.user && (o.user.full_name || o.user.name || o.user.email)) ||
      'Unknown';
    const customerSub = (o.user_email || o.email || o.user?.email || '').toString().trim() || 'Unknown';
    const packageTitle = (o.package_title || o.bundle_label || o.plan_name || `${net} ${bundle}`).trim();
    const packageSub = (o.package_subtitle || `${bundle} • ${net} Ghana`).trim();
    const packageFull = `${packageTitle} — ${packageSub}`;
    const rawPrice = o.bundle_price ?? o.amount ?? o.price ?? o.total_amount ?? o.total ?? o.paid_amount;
    const numPrice = typeof rawPrice === 'number' ? rawPrice : parseFloat(rawPrice);
    const amount = Number.isFinite(numPrice) ? numPrice.toFixed(2) : String(rawPrice ?? '0');
    const st = (o.status && String(o.status).toLowerCase()) || 'processing';
    const statusLabel = st === 'completed' ? 'Completed' : st === 'failed' || st === 'cancelled' ? 'Failed' : 'Processing';
    let placedAtDate = '—';
    let placedAtTime = '—';
    if (canonicalCreatedIso) {
      const d = new Date(canonicalCreatedIso);
      if (!Number.isNaN(d.getTime())) {
        placedAtDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        placedAtTime = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      }
    }
    return {
      id: o.id,
      key: String(o.id ?? ref),
      orderIdDisplay,
      reference: String(ref),
      customer,
      customerSub,
      packageTitle,
      packageSub,
      packageFull,
      recipient,
      amount,
      statusLabel,
      dateIso: canonicalCreatedIso,
      placedAtDate,
      placedAtTime,
    };
  };
  const normalizeAdminTxRow = (t, idx) => {
    const rawId = t.id ?? t.transaction_id ?? `tx-${idx}`;
    const created = t.created_at ?? t.createdAt ?? t.date ?? null;
    const rawAmt = t.amount;
    const parsed = typeof rawAmt === 'number' ? rawAmt : parseFloat(rawAmt);
    const amount = Number.isFinite(parsed) ? parsed : 0;
    const typ = (t.type || '').toString().toLowerCase();
    const reference = (
      t.reference ||
      t.payment_reference ||
      t.paystack_reference ||
      t.transaction_reference ||
      ''
    ).toString();
    const userName = (t.user_name || t.full_name || t.user_full_name || t.user?.full_name || '').toString().trim();
    const userEmail = (t.user_email || t.email || t.user?.email || '').toString().trim();
    const userPhone = (t.user_phone || t.phone || t.user?.phone || '').toString().trim();
    const userLine =
      [userName, userEmail].filter(Boolean).join(' · ') ||
      userPhone ||
      (t.user_id != null ? `User #${t.user_id}` : '—');
    const narration =
      (t.description || t.narration || '').toString().trim() ||
      (reference || (typ === 'topup' ? 'Wallet top-up' : typ === 'payment' ? 'Bundle purchase' : typ || '—'));
    const st = (t.status && String(t.status).toLowerCase()) || 'completed';
    const statusLabel =
      st === 'completed' || st === 'success'
        ? 'Completed'
        : st === 'failed' || st === 'cancelled' || st === 'reversed'
          ? 'Failed'
          : st.charAt(0).toUpperCase() + st.slice(1);
    const time = created ? Date.parse(created) : 0;
    return {
      key: String(rawId),
      created_at: created,
      time,
      amount,
      type: typ,
      reference,
      userLine,
      narration,
      statusLabel,
    };
  };
  const userTodayStats = (() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const startMs = start.getTime();
    const isToday = (value) => {
      const t = Date.parse(value || '');
      return Number.isFinite(t) && t >= startMs;
    };
    const todayOrders = (orders || []).filter((o) => isToday(o.created_at));
    const todaySpent = (transactions || []).reduce((sum, t) => {
      if (!isToday(t.created_at)) return sum;
      const rawAmount = t.amount ?? t.bundle_price ?? t.price ?? t.value;
      const parsed = typeof rawAmount === 'number' ? rawAmount : parseFloat(rawAmount);
      if (!Number.isFinite(parsed) || parsed >= 0) return sum;
      return sum + Math.abs(parsed);
    }, 0);
    const amount = todayOrders.reduce((sum, o) => {
      const p = typeof o.bundle_price === 'number' ? o.bundle_price : parseFloat(o.bundle_price);
      return sum + (Number.isFinite(p) ? p : 0);
    }, 0);
    const bundles = todayOrders.reduce((sum, o) => {
      const rawSize = String(o.bundle_size || o.bundle || o.data_bundle || '').trim();
      const match = rawSize.match(/(\d+(\.\d+)?)/);
      const parsed = match ? parseFloat(match[1]) : NaN;
      return sum + (Number.isFinite(parsed) ? parsed : 0);
    }, 0);
    return {
      spent: todaySpent,
      orders: todayOrders.length,
      amount,
      bundles,
    };
  })();
  const isPinOnlyAdminSession = showAdminNav && !hasAdminRole;
  const dashboardBalance = isPinOnlyAdminSession ? 0 : walletBalance;
  const dashboardTodaySpent = isPinOnlyAdminSession ? 0 : userTodayStats.spent;
  const dashboardTodayOrders = isPinOnlyAdminSession ? 0 : userTodayStats.orders;
  const dashboardTodayAmount = isPinOnlyAdminSession ? 0 : userTodayStats.amount;
  const dashboardTodayBundles = isPinOnlyAdminSession ? 0 : userTodayStats.bundles;

  const loadStoreEarnings = useCallback(async () => {
    if (!isSignedIn || !api.getToken()) {
      setStoreEarningsData(null);
      setStoreEarningsLoading(false);
      return;
    }
    setStoreEarningsLoading(true);
    setStoreEarningsError(null);
    try {
      const d = await api.getStoreEarnings(storeEarningsPeriod);
      if (d && typeof d === 'object') {
        setStoreEarningsData(d);
        if (Number.isFinite(Number(d.balanceGhs)) && !isPinOnlyAdminSession) {
          setWalletBalance(Number(d.balanceGhs));
        }
      } else {
        setStoreEarningsData(null);
        setStoreEarningsError('Could not load earnings from the API. Deploy the latest server or check your connection.');
      }
    } catch (e) {
      setStoreEarningsData(null);
      setStoreEarningsError(e?.message || 'Failed to load earnings');
    } finally {
      setStoreEarningsLoading(false);
    }
  }, [isSignedIn, storeEarningsPeriod, isPinOnlyAdminSession]);

  useEffect(() => {
    if (currentPage !== 'store-dashboard' || storeDashTab !== 'earnings' || !isSignedIn) return undefined;
    loadStoreEarnings();
    return undefined;
  }, [currentPage, storeDashTab, isSignedIn, storeEarningsPeriod, loadStoreEarnings]);

  const networkBg = (n) => n === 'telecel' ? 'url(https://files.catbox.moe/yzcokj.jpg)' : (n === 'bigtime' || n === 'ishare') ? 'url(https://files.catbox.moe/riugtj.png)' : 'url(https://files.catbox.moe/r1m0uh.png)';
  const networkBrandLogoUrl = (n) =>
    n === 'telecel'
      ? 'https://files.catbox.moe/yzcokj.jpg'
      : n === 'bigtime' || n === 'ishare'
        ? 'https://files.catbox.moe/riugtj.png'
        : 'https://files.catbox.moe/r1m0uh.png';

  const RECIPIENT_PHONE_LEN = 10;
  const normalizeRecipientDigits = (s) => String(s || '').replace(/\D/g, '');
  const isValidRecipientPhone = (digits) =>
    /^[0-9]+$/.test(digits) && digits.length === RECIPIENT_PHONE_LEN;

  const addToCart = () => {
    if (!buyBundle) return;
    const digitsOnly = normalizeRecipientDigits(recipientNumber);
    if (!isValidRecipientPhone(digitsOnly)) {
      setRecipientError(
        `Almost there — we need exactly ${RECIPIENT_PHONE_LEN} digits (the full local number). Numbers only.`
      );
      return;
    }
    setRecipientError(null);
    setCart((prev) => [...prev, { id: Date.now(), bundle: buyBundle, recipientNumber: digitsOnly }]);
    setBuyBundle(null);
    setRecipientNumber('');
  };

  const removeFromCart = (id) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  const defaultBundlesForUse = {
    mtn: [
      { size: '1 GB', price: 4.20 }, { size: '2 GB', price: 8.40 }, { size: '3 GB', price: 12.30 },
      { size: '4 GB', price: 16.20 }, { size: '5 GB', price: 20.50 }, { size: '6 GB', price: 25.00 },
      { size: '7 GB', price: 28.80 }, { size: '8 GB', price: 33.00 }, { size: '10 GB', price: 41.00 },
      { size: '15 GB', price: 61.00 }, { size: '20 GB', price: 80.00 }, { size: '25 GB', price: 98.00 },
      { size: '30 GB', price: 118.00 }, { size: '40 GB', price: 154.00 }, { size: '50 GB', price: 193.00 },
    ],
    telecel: [
      { size: '10 GB', price: 39.00 }, { size: '12 GB', price: 44.00 }, { size: '15 GB', price: 56.00 },
      { size: '20 GB', price: 75.00 }, { size: '25 GB', price: 94.00 }, { size: '30 GB', price: 110.00 },
      { size: '35 GB', price: 129.00 }, { size: '40 GB', price: 143.00 }, { size: '50 GB', price: 183.00 },
      { size: '100 GB', price: 350.00 },
    ],
    bigtime: [
      { size: '20 GB', price: 60.00 }, { size: '25 GB', price: 65.00 }, { size: '30 GB', price: 75.00 },
      { size: '40 GB', price: 85.00 }, { size: '50 GB', price: 95.00 }, { size: '60 GB', price: 135.00 },
      { size: '80 GB', price: 170.00 }, { size: '100 GB', price: 200.00 }, { size: '200 GB', price: 370.00 },
    ],
    ishare: [
      { size: '1 GB', price: 4.20 }, { size: '2 GB', price: 8.20 }, { size: '3 GB', price: 12.00 },
      { size: '4 GB', price: 16.00 }, { size: '5 GB', price: 19.00 }, { size: '6 GB', price: 23.00 },
      { size: '7 GB', price: 28.30 }, { size: '8 GB', price: 32.80 }, { size: '9 GB', price: 36.90 },
      { size: '10 GB', price: 39.00 }, { size: '15 GB', price: 55.00 },
    ],
  };
  const mtnBundlesForBulk = (bundlesData && Array.isArray(bundlesData.mtn) ? bundlesData.mtn : defaultBundlesForUse.mtn) || [];

  const validMtnCapacities = (mtnBundlesForBulk || []).map((b) => parseInt(b.size.replace(/\D/g, ''), 10)).filter((n) => !isNaN(n));
  const getMtnBundleByCapacity = (capacityNum) => {
    const b = (mtnBundlesForBulk || []).find((x) => x.size === `${capacityNum} GB`);
    if (!b) return null;
    const price = typeof b.price === 'number' ? b.price : parseFloat(b.price);
    return { size: b.size, price: Number.isFinite(price) ? price : 0, network: 'mtn' };
  };

  const parseBulkLines = () => {
    setBulkOrderError(null);
    setBulkOrderSuccess(null);
    const lines = bulkOrderInput
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      return {
        added: [],
        errors: ['Add at least one line: phone (10 digits) then bundle size, e.g. 0535596955 5'],
      };
    }
    const added = [];
    const errors = [];
    lines.forEach((line, idx) => {
      const parts = line.split(/\s+/);
      if (parts.length < 2) {
        errors.push(`Line ${idx + 1}: need "phone_number capacity" (e.g. 0535596955 5)`);
        return;
      }
      const digitsOnly = normalizeRecipientDigits(parts[0]);
      const capacityNum = parseInt(parts[1], 10);
      if (!isValidRecipientPhone(digitsOnly)) {
        errors.push(`Line ${idx + 1}: phone should be exactly ${RECIPIENT_PHONE_LEN} digits.`);
        return;
      }
      if (!Number.isInteger(capacityNum) || !validMtnCapacities.includes(capacityNum)) {
        errors.push(`Line ${idx + 1}: capacity must be a valid MTN bundle size (e.g. 1, 2, 5, 10, 15, 20, 25, 30, 40, 50).`);
        return;
      }
      const bundle = getMtnBundleByCapacity(capacityNum);
      if (!bundle) {
        errors.push(`Line ${idx + 1}: no MTN bundle for ${capacityNum} GB.`);
        return;
      }
      added.push({ id: Date.now() + idx, bundle, recipientNumber: digitsOnly });
    });
    return { added, errors };
  };

  const processBulkOrders = () => {
    const { added, errors } = parseBulkLines();
    if (errors.length > 0) {
      const msg = errors.length > 10
        ? errors.slice(0, 10).join(' ') + ` ... and ${errors.length - 10} more.`
        : errors.join(' ');
      setBulkOrderError(msg);
      return;
    }
    const total = added.reduce((sum, i) => sum + Number(i.bundle?.price || 0), 0);
    setCart((prev) => [...prev, ...added]);
    setCartOpen(true);
    setBulkOrderInput('');
    setBulkOrderSuccess(`${added.length} order(s) queued separately (¢${total.toFixed(2)} total). Checkout to send to management.`);
  };

  const submitBulkOrdersNow = async () => {
    const { added, errors } = parseBulkLines();
    if (errors.length > 0) {
      const msg = errors.length > 10
        ? errors.slice(0, 10).join(' ') + ` ... and ${errors.length - 10} more.`
        : errors.join(' ');
      setBulkOrderError(msg);
      return;
    }
    const total = added.reduce((sum, i) => sum + Number(i.bundle?.price || 0), 0);
    if (walletBalance < total) {
      setBulkOrderError(`Insufficient balance. You have ¢ ${walletBalance.toFixed(2)} but bulk total is ¢ ${total.toFixed(2)}.`);
      return;
    }
    setBulkSubmitting(true);
    try {
      const data = await api.createOrders(added);
      setWalletBalance(Number(data?.balance ?? walletBalance));
      setBulkOrderInput('');
      setBulkOrderSuccess(`${added.length} bulk order(s) sent. They are now in admin management as separate lines.`);
      fetchWallet();
      api.getOrders().then((list) => setOrders(stabilizeOrdersList(list))).catch(() => {});
      if (adminPinVerified || user?.role === 'admin') {
        api.getAdminOrders().then((list) => setAdminOrders(Array.isArray(list) ? list : [])).catch(() => {});
      }
    } catch (err) {
      setBulkOrderError(err?.message || 'Failed to submit bulk orders');
    } finally {
      setBulkSubmitting(false);
    }
  };

  const clampCartPosition = (x, y) => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 400;
    const h = typeof window !== 'undefined' ? window.innerHeight : 600;
    const panelW = 320;
    const panelH = 400;
    return {
      x: Math.max(0, Math.min(w - panelW, x)),
      y: Math.max(0, Math.min(h - 120, y)),
    };
  };

  const handleCartDragStart = (e) => {
    if (e.target.closest('button')) return;
    if (e.cancelable) e.preventDefault();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    cartDragRef.current = {
      startX: clientX,
      startY: clientY,
      startLeft: cartPosition.x,
      startTop: cartPosition.y,
    };
    const onMove = (ev) => {
      if (ev.cancelable) ev.preventDefault();
      const cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
      const { startX, startY, startLeft, startTop } = cartDragRef.current;
      setCartPosition(clampCartPosition(startLeft + cx - startX, startTop + cy - startY));
    };
    const onEnd = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  };

  const clampCartButtonPosition = (x, y) => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 400;
    const h = typeof window !== 'undefined' ? window.innerHeight : 600;
    const size = 56;
    return {
      x: Math.max(0, Math.min(w - size, x)),
      y: Math.max(0, Math.min(h - size, y)),
    };
  };

  const handleCartButtonDragStart = (e) => {
    if (e.cancelable) e.preventDefault();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    let startLeft = cartButtonPosition?.x;
    let startTop = cartButtonPosition?.y;
    if (startLeft == null || startTop == null) {
      const el = cartButtonRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        setCartButtonPosition({ x: startLeft, y: startTop });
      } else return;
    }
    cartButtonDragRef.current = { didMove: false, startX: clientX, startY: clientY, startLeft, startTop };
    const onMove = (ev) => {
      if (ev.cancelable) ev.preventDefault();
      const cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
      const { startX, startY, startLeft: sl, startTop: st } = cartButtonDragRef.current;
      const dx = cx - startX;
      const dy = cy - startY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) cartButtonDragRef.current.didMove = true;
      setCartButtonPosition(clampCartButtonPosition(sl + dx, st + dy));
    };
    const onEnd = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  };

  const handleCartButtonClick = () => {
    if (cartButtonDragRef.current.didMove) {
      cartButtonDragRef.current.didMove = false;
      return;
    }
    setCartOpen(true);
  };

  const handleSupportChatFabDragStart = (e) => {
    if (e.cancelable) e.preventDefault();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    let startLeft = supportChatFabPosition?.x;
    let startTop = supportChatFabPosition?.y;
    if (startLeft == null || startTop == null) {
      const el = supportChatFabRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        setSupportChatFabPosition({ x: startLeft, y: startTop });
      } else return;
    }
    supportChatFabDragRef.current = { didMove: false, startX: clientX, startY: clientY, startLeft, startTop };
    const onMove = (ev) => {
      if (ev.cancelable) ev.preventDefault();
      const cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
      const { startX, startY, startLeft: sl, startTop: st } = supportChatFabDragRef.current;
      const dx = cx - startX;
      const dy = cy - startY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) supportChatFabDragRef.current.didMove = true;
      setSupportChatFabPosition(clampCartButtonPosition(sl + dx, st + dy));
    };
    const onEnd = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  };

  const dismissSupportChatIntro = useCallback(() => {
    try {
      localStorage.setItem(SUPPORT_CHAT_INTRO_SEEN_KEY, '1');
    } catch (_) {}
    setSupportChatIntroOpen(false);
  }, []);

  const openSupportFromIntro = useCallback(() => {
    dismissSupportChatIntro();
    setSupportError(null);
    setSupportChatOpen(true);
  }, [dismissSupportChatIntro]);

  useEffect(() => {
    if (adminRoute) setSupportChatIntroOpen(false);
  }, [adminRoute]);

  useEffect(() => {
    if (supportChatOpen) dismissSupportChatIntro();
  }, [supportChatOpen, dismissSupportChatIntro]);

  useEffect(() => {
    if (!supportChatIntroOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') dismissSupportChatIntro();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [supportChatIntroOpen, dismissSupportChatIntro]);

  const handleSupportChatFabClick = () => {
    if (supportChatFabDragRef.current.didMove) {
      supportChatFabDragRef.current.didMove = false;
      return;
    }
    setSupportChatOpen((o) => {
      if (o) {
        cancelSupportOutbound();
        setSupportEditingMessageId(null);
        setSupportDraft('');
        setSupportPendingImage(null);
        setSupportReplyTo(null);
        setSupportMsgActionsMenu(null);
        setSupportDeleteConfirmMessageId(null);
        setSupportSending(false);
      }
      return !o;
    });
    setSupportError(null);
  };

  const handleAdminInboxFabDragStart = (e) => {
    if (e.cancelable) e.preventDefault();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    let startLeft = adminInboxFabPosition?.x;
    let startTop = adminInboxFabPosition?.y;
    if (startLeft == null || startTop == null) {
      const el = adminInboxFabRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        setAdminInboxFabPosition({ x: startLeft, y: startTop });
      } else return;
    }
    adminInboxFabDragRef.current = { didMove: false, startX: clientX, startY: clientY, startLeft, startTop };
    const onMove = (ev) => {
      if (ev.cancelable) ev.preventDefault();
      const cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
      const { startX, startY, startLeft: sl, startTop: st } = adminInboxFabDragRef.current;
      const dx = cx - startX;
      const dy = cy - startY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) adminInboxFabDragRef.current.didMove = true;
      setAdminInboxFabPosition(clampCartButtonPosition(sl + dx, st + dy));
    };
    const onEnd = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  };

  const handleAdminInboxFabClick = () => {
    if (adminInboxFabDragRef.current.didMove) {
      adminInboxFabDragRef.current.didMove = false;
      return;
    }
    setAdminSupportModalOpen(true);
    setAdminSupportPhase('inbox');
    setSidebarOpen(false);
  };

  useEffect(() => {
    if (!user?.id) {
      setProfileImage(null);
      return;
    }
    const key = profileImageStorageKey(user.id);
    const fromApi = user.profile_avatar;
    if (fromApi) {
      setProfileImage(fromApi);
      if (key) {
        try {
          localStorage.setItem(key, fromApi);
        } catch (_) {}
      }
      return;
    }
    if (key) {
      const scoped = localStorage.getItem(key);
      if (scoped) {
        setProfileImage(scoped);
        return;
      }
    }
    const legacy = localStorage.getItem('profileImage');
    if (legacy) {
      setProfileImage(legacy);
      if (key) {
        try {
          localStorage.setItem(key, legacy);
          localStorage.removeItem('profileImage');
        } catch (_) {}
      }
      return;
    }
    setProfileImage(null);
  }, [user?.id, user?.profile_avatar]);

  // Apply stored theme for current surface (/admin vs customer) before paint and when route switches
  useLayoutEffect(() => {
    const resolved = readThemeForSurface(adminRoute);
    setTheme(resolved);
    document.documentElement.setAttribute('data-theme', resolved);
  }, [adminRoute]);

  // OS theme change: clear manual override only for the surface you are on (admin vs customer stay independent)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const applySystemTheme = () => {
      const next = mq.matches ? 'dark' : 'light';
      clearManualThemeForSurface(adminRouteRef.current);
      setTheme(next);
      document.documentElement.setAttribute('data-theme', next);
    };
    mq.addEventListener('change', applySystemTheme);
    return () => mq.removeEventListener('change', applySystemTheme);
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const resolved = readThemeForSurface(adminRouteRef.current);
      setTheme(resolved);
      document.documentElement.setAttribute('data-theme', resolved);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Desktop: show sidebar by default and track viewport
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const handle = () => {
      setIsDesktop(mq.matches);
      if (mq.matches) setSidebarOpen(true);
    };
    handle();
    mq.addEventListener('change', handle);
    return () => mq.removeEventListener('change', handle);
  }, []);

  useEffect(() => {
    if (!adminRoute) return;
    if (adminPinVerified || (isSignedIn && user?.role === 'admin')) {
      const adminSubPages = ['admin', 'admin-users', 'admin-orders', 'admin-packages', 'admin-all-transactions', 'admin-wallet', 'admin-applications', 'admin-broadcasts', 'admin-support', 'admin-analytics'];
      const mainAppPages = ['dashboard', 'store-dashboard', 'bulk-orders', 'afa-registration', 'orders', 'transactions', 'join-us', 'profile', 'topup', 'pending-orders', 'completed-orders', 'my-orders'];
      if (adminSubPages.includes(currentPage)) return;
      if (mainAppPages.includes(currentPage)) return;
      setCurrentPage('admin-analytics');
      setSelectedMenu('admin-analytics');
    }
    // Do NOT redirect non-admin users away from /admin — they can still enter the admin PIN to get access.
  }, [adminRoute, adminPinVerified, isSignedIn, user?.role, navigate, currentPage]);

  const canAccessStoreDashboard = isStoreDashboardAllowedForUser(user);
  useEffect(() => {
    if (currentPage !== 'store-dashboard') return;
    if (!canAccessStoreDashboard) {
      setCurrentPage('dashboard');
      setSelectedMenu('dashboard');
    }
  }, [currentPage, canAccessStoreDashboard]);

  /** Leaving /admin must drop admin-only pages from state; PIN sessions are not admin UI on `/`. */
  useEffect(() => {
    if (location.pathname === '/admin') return;
    const adminPages = ['admin', 'admin-users', 'admin-orders', 'admin-packages', 'admin-all-transactions', 'admin-wallet', 'admin-applications', 'admin-broadcasts', 'admin-support', 'admin-analytics'];
    setCurrentPage((p) => (adminPages.includes(p) ? 'dashboard' : p));
    setSelectedMenu((m) => (adminPages.includes(m) ? 'dashboard' : m));
  }, [location.pathname]);

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);
  const toggleProfile = () => setProfileOpen((prev) => !prev);
  const toggleOrders = () => setOrdersExpanded((prev) => !prev);
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    persistThemeForSurface(adminRoute, next);
    document.documentElement.setAttribute('data-theme', next);
    setTheme(next);
  };

  const handleMenuSelect = (menu) => {
    if (menu === 'support') {
      setSupportChatOpen(true);
      setSupportError(null);
      setProfileOpen(false);
      setSidebarOpen(false);
      return;
    }
    setSelectedMenu(menu);
    if (menu === 'profile-page') {
      setCurrentPage('profile');
      setProfileOpen(false);
    } else if (menu === 'dashboard') {
      setCurrentPage('dashboard');
      setProfileOpen(false);
    } else if (menu === 'store-dashboard') {
      if (!isStoreDashboardAllowedForUser(user)) return;
      setCurrentPage('store-dashboard');
      setProfileOpen(false);
    } else if (menu === 'wallet' || menu === 'topup') {
      setCurrentPage('topup');
      setProfileOpen(false);
    } else if (menu === 'my-orders') {
      setCurrentPage('orders');
      setOrderStatusFilter('all');
      setProfileOpen(false);
    } else if (menu === 'pending-orders') {
      setCurrentPage('orders');
      setOrderStatusFilter('processing');
      setProfileOpen(false);
    } else if (menu === 'completed-orders') {
      setCurrentPage('orders');
      setOrderStatusFilter('completed');
      setProfileOpen(false);
    } else if (menu === 'bulk-orders') {
      setCurrentPage('bulk-orders');
      setProfileOpen(false);
    } else if (menu === 'afa-registration') {
      setCurrentPage('afa-registration');
      setProfileOpen(false);
    } else if (menu === 'transactions') {
      setCurrentPage('transactions');
      setProfileOpen(false);
    } else if (menu === 'join-us') {
      setCurrentPage('join-us');
      setProfileOpen(false);
    } else if (menu === 'admin') {
      navigate('/admin');
      setCurrentPage('admin');
      setProfileOpen(false);
    } else if (['admin-users', 'admin-orders', 'admin-packages', 'admin-all-transactions', 'admin-wallet', 'admin-applications', 'admin-broadcasts', 'admin-analytics'].includes(menu)) {
      navigate('/admin');
      setCurrentPage(menu);
      setSelectedMenu(menu);
      setProfileOpen(false);
      if (menu === 'admin-packages') setAdminPackagesNetwork('mtn');
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result;
        setProfileImage(base64String);
        const key = profileImageStorageKey(user?.id);
        if (key) {
          try {
            localStorage.setItem(key, base64String);
            localStorage.removeItem('profileImage');
          } catch (_) {}
        }
        try {
          await api.uploadProfileImage(base64String);
        } catch (_) {
          // keep local state and localStorage; user still sees the pic
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerFileInput = () => fileInputRef.current?.click();

  const isDark = theme === 'dark';
  const defaultStorePathSlug = useMemo(
    () => defaultStorePathSlugFromUser(user),
    [user?.id, user?.email]
  );
  const effectiveStorePathSlug = storePathSlugOverride || defaultStorePathSlug;
  const fullStoreLinkUrl = useMemo(() => {
    const base = getPublicSiteOrigin();
    if (!base) return '';
    return `${String(base).replace(/\/$/, '')}/store/${effectiveStorePathSlug}`;
  }, [effectiveStorePathSlug]);
  const storePathInputPrefix = useMemo(() => {
    const o = getPublicSiteOrigin();
    return o ? `${String(o).replace(/\/$/, '')}/store/` : '…/store/';
  }, []);
  const hasCustomStorePath = Boolean((storePathSlugOverride || '').trim().length);
  const publicStorePathSegment = useMemo(() => {
    const p = (location?.pathname || '').replace(/\/+$/g, '') || '/';
    const m = p.match(/^\/store\/([a-z0-9-]+)$/i);
    return m ? sanitizeStorePathSegment(m[1]) : null;
  }, [location?.pathname]);
  const isPublicUrlMine = useMemo(
    () =>
      Boolean(
        isSignedIn && publicStorePathSegment && effectiveStorePathSlug && effectiveStorePathSlug === publicStorePathSegment
      ),
    [isSignedIn, publicStorePathSegment, effectiveStorePathSlug]
  );
  const profileUserId = (() => {
    const n = Number(user?.id);
    if (Number.isFinite(n) && n > 0) return `USR-${String(Math.trunc(n)).padStart(6, '0')}`;
    const seed = String(user?.email || 'guest').toLowerCase();
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    const code = Math.abs(hash) % 1000000;
    return `USR-${String(code).padStart(6, '0')}`;
  })();

  const defaultBundles = {
    mtn: [
      { size: '1 GB', price: 4.20 }, { size: '2 GB', price: 8.40 }, { size: '3 GB', price: 12.30 },
      { size: '4 GB', price: 16.20 }, { size: '5 GB', price: 20.50 }, { size: '6 GB', price: 25.00 },
      { size: '7 GB', price: 28.80 }, { size: '8 GB', price: 33.00 }, { size: '10 GB', price: 41.00 },
      { size: '15 GB', price: 61.00 }, { size: '20 GB', price: 80.00 }, { size: '25 GB', price: 98.00 },
      { size: '30 GB', price: 118.00 }, { size: '40 GB', price: 154.00 }, { size: '50 GB', price: 193.00 },
    ],
    telecel: [
      { size: '10 GB', price: 39.00 }, { size: '12 GB', price: 44.00 }, { size: '15 GB', price: 56.00 },
      { size: '20 GB', price: 75.00 }, { size: '25 GB', price: 94.00 }, { size: '30 GB', price: 110.00 },
      { size: '35 GB', price: 129.00 }, { size: '40 GB', price: 143.00 }, { size: '50 GB', price: 183.00 },
      { size: '100 GB', price: 350.00 },
    ],
    bigtime: [
      { size: '20 GB', price: 60.00 }, { size: '25 GB', price: 65.00 }, { size: '30 GB', price: 75.00 },
      { size: '40 GB', price: 85.00 }, { size: '50 GB', price: 95.00 }, { size: '60 GB', price: 135.00 },
      { size: '80 GB', price: 170.00 }, { size: '100 GB', price: 200.00 }, { size: '200 GB', price: 370.00 },
    ],
    ishare: [
      { size: '1 GB', price: 4.20 }, { size: '2 GB', price: 8.20 }, { size: '3 GB', price: 12.00 },
      { size: '4 GB', price: 16.00 }, { size: '5 GB', price: 19.00 }, { size: '6 GB', price: 23.00 },
      { size: '7 GB', price: 28.30 }, { size: '8 GB', price: 32.80 }, { size: '9 GB', price: 36.90 },
      { size: '10 GB', price: 39.00 }, { size: '15 GB', price: 55.00 },
    ],
  };
  const bundlesByNetwork = bundlesData && Array.isArray(bundlesData.mtn) ? bundlesData : defaultBundles;
  const bundles = bundlesByNetwork.mtn || defaultBundles.mtn;
  const telecelBundles = bundlesByNetwork.telecel || defaultBundles.telecel;
  const bigtimeBundles = bundlesByNetwork.bigtime || defaultBundles.bigtime;
  const ishareBundles = bundlesByNetwork.ishare || defaultBundles.ishare;
  const displayBundles = activeTab === 'telecel' ? telecelBundles : activeTab === 'bigtime' ? bigtimeBundles : activeTab === 'ishare' ? ishareBundles : bundles;
  const isTelecel = activeTab === 'telecel';
  const isBigTime = activeTab === 'bigtime';
  const isIshare = activeTab === 'ishare';
  const storePricingBundleKey = (netId, size) => `${netId}|${size}`;
  const getPricingBundles = (id) => {
    if (id === 'mtn') return bundlesByNetwork.mtn || defaultBundles.mtn;
    if (id === 'telecel') return bundlesByNetwork.telecel || defaultBundles.telecel;
    if (id === 'bigtime') return bundlesByNetwork.bigtime || defaultBundles.bigtime;
    if (id === 'ishare') return bundlesByNetwork.ishare || defaultBundles.ishare;
    return [];
  };
  const storePricingNetworkRows = useMemo(
    () => [
      { id: 'mtn', name: 'MTN', count: (bundlesByNetwork.mtn || defaultBundles.mtn).length },
      { id: 'telecel', name: 'Telecel', count: (bundlesByNetwork.telecel || defaultBundles.telecel).length },
      { id: 'bigtime', name: 'Big Time', count: (bundlesByNetwork.bigtime || defaultBundles.bigtime).length },
      { id: 'ishare', name: 'Ishare', count: (bundlesByNetwork.ishare || defaultBundles.ishare).length },
    ],
    [bundlesByNetwork]
  );

  const persistPublicStoreSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || !effectiveStorePathSlug) return;
    try {
      const ownerName =
        (storeDisplaySettings?.storeName && String(storeDisplaySettings.storeName).trim()) ||
        (user?.full_name && String(user.full_name).trim()) ||
        (user?.name && String(user.name).trim()) ||
        (user?.email && String(user.email).split('@')[0]) ||
        'Store';
      const snap = {
        v: 1,
        slug: effectiveStorePathSlug,
        updatedAt: Date.now(),
        display: { ...storeDisplaySettings },
        service: { ...storeServiceSettings },
        availability: storeAvailabilityOn,
        customBundlePrices: { ...storeCustomBundlePrices },
        customBundleActive: { ...storeCustomBundleActive },
        bundles: {
          mtn: [...(bundlesByNetwork.mtn || defaultBundles.mtn)],
          telecel: [...(bundlesByNetwork.telecel || defaultBundles.telecel)],
          bigtime: [...(bundlesByNetwork.bigtime || defaultBundles.bigtime)],
          ishare: [...(bundlesByNetwork.ishare || defaultBundles.ishare)],
        },
        ownerName,
      };
      localStorage.setItem('dataplus_store_public_v1', JSON.stringify(snap));
    } catch {
      // ignore quota
    }
  }, [
    effectiveStorePathSlug,
    storeDisplaySettings,
    storeServiceSettings,
    storeAvailabilityOn,
    storeCustomBundlePrices,
    storeCustomBundleActive,
    bundlesByNetwork,
    user,
  ]);

  buildMyStoreRequestBodyRef.current = () => {
    const ownerName =
      (storeDisplaySettings?.storeName && String(storeDisplaySettings.storeName).trim()) ||
      (user?.full_name && String(user.full_name).trim()) ||
      (user?.name && String(user.name).trim()) ||
      (user?.email && String(user.email).split('@')[0]) ||
      'Store';
    return {
      pathSlug: effectiveStorePathSlug,
      pathSlugOverride: hasCustomStorePath
        ? sanitizeStorePathSegment(storePathSlugOverride) || null
        : null,
      display: { ...storeDisplaySettings },
      service: { ...storeServiceSettings },
      availability: storeAvailabilityOn,
      customBundlePrices: { ...storeCustomBundlePrices },
      customBundleActive: { ...storeCustomBundleActive },
      bundles: {
        mtn: [...(bundlesByNetwork.mtn || defaultBundles.mtn)],
        telecel: [...(bundlesByNetwork.telecel || defaultBundles.telecel)],
        bigtime: [...(bundlesByNetwork.bigtime || defaultBundles.bigtime)],
        ishare: [...(bundlesByNetwork.ishare || defaultBundles.ishare)],
      },
      ownerName,
    };
  };

  const flushStoreToApi = useCallback(() => {
    if (typeof window === 'undefined' || !isSignedIn || !api.getToken() || !effectiveStorePathSlug) return;
    if (storeApiSyncTimerRef.current) {
      clearTimeout(storeApiSyncTimerRef.current);
      storeApiSyncTimerRef.current = null;
    }
    const body = buildMyStoreRequestBodyRef.current ? buildMyStoreRequestBodyRef.current() : null;
    if (!body) return;
    api
      .putMyStore(body)
      .then(() => {
        try {
          persistPublicStoreSnapshot();
        } catch {
          // ignore
        }
      })
      .catch(() => {});
  }, [isSignedIn, effectiveStorePathSlug, persistPublicStoreSnapshot]);

  const applyStorePathOverride = (raw) => {
    const s = sanitizeStorePathSegment(raw);
    setStorePathSlugOverride(s);
    try {
      if (s) localStorage.setItem('dataplus_store_slug_override', s);
      else localStorage.removeItem('dataplus_store_slug_override');
    } catch {
      // ignore
    }
    if (typeof window !== 'undefined') {
      window.setTimeout(() => persistPublicStoreSnapshot(), 0);
    }
  };

  const publicStorefrontData = useMemo(() => {
    if (!publicStorePathSegment) return null;
    if (isPublicUrlMine) {
      return {
        slug: effectiveStorePathSlug,
        display: { ...storeDisplaySettings },
        service: { ...storeServiceSettings },
        availability: storeAvailabilityOn,
        customBundlePrices: { ...storeCustomBundlePrices },
        customBundleActive: { ...storeCustomBundleActive },
        bundles: {
          mtn: [...(bundlesByNetwork.mtn || defaultBundles.mtn)],
          telecel: [...(bundlesByNetwork.telecel || defaultBundles.telecel)],
          bigtime: [...(bundlesByNetwork.bigtime || defaultBundles.bigtime)],
          ishare: [...(bundlesByNetwork.ishare || defaultBundles.ishare)],
        },
        ownerName:
          (storeDisplaySettings?.storeName && String(storeDisplaySettings.storeName).trim()) ||
          (user?.full_name && String(user.full_name).trim()) ||
          (user?.name && String(user.name).trim()) ||
          (user?.email && String(user.email).split('@')[0]) ||
          'Store',
      };
    }
    if (
      publicStoreFromApi &&
      String(publicStoreFromApi.slug || '') === publicStorePathSegment
    ) {
      return {
        ...publicStoreFromApi,
        availability: publicStoreFromApi.availability !== false,
        customBundlePrices:
          publicStoreFromApi.customBundlePrices && typeof publicStoreFromApi.customBundlePrices === 'object'
            ? { ...publicStoreFromApi.customBundlePrices }
            : {},
        customBundleActive:
          publicStoreFromApi.customBundleActive && typeof publicStoreFromApi.customBundleActive === 'object'
            ? { ...publicStoreFromApi.customBundleActive }
            : {},
        bundles: publicStoreFromApi.bundles && typeof publicStoreFromApi.bundles === 'object' ? { ...publicStoreFromApi.bundles } : {},
      };
    }
    return readPublicStoreSnapshot(publicStorePathSegment);
  }, [
    publicStorePathSegment,
    isPublicUrlMine,
    publicStoreFromApi,
    effectiveStorePathSlug,
    storeDisplaySettings,
    storeServiceSettings,
    storeAvailabilityOn,
    storeCustomBundlePrices,
    storeCustomBundleActive,
    bundlesByNetwork,
    user,
  ]);

  useEffect(() => {
    if (!publicStorePathSegment || isPublicUrlMine) {
      if (isPublicUrlMine) setPublicStoreFromApi(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const s = await api.getPublicStoreBySlug(publicStorePathSegment);
      if (cancelled) return;
      setPublicStoreFromApi(s);
    })();
    return () => {
      cancelled = true;
    };
  }, [publicStorePathSegment, isPublicUrlMine]);

  useEffect(() => {
    if (!isSignedIn || !user?.id) {
      vendorStoreSyncedForUserRef.current = null;
      return;
    }
    if (!api.getToken()) return;
    if (vendorStoreSyncedForUserRef.current === user.id) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { store } = await api.getMyStore();
        if (cancelled) return;
        if (!store) {
          vendorStoreSyncedForUserRef.current = user.id;
          return;
        }
        const dSlug = defaultStorePathSlugFromUser(user);
        if (store.pathSlug && String(store.pathSlug) !== dSlug) {
          const s = sanitizeStorePathSegment(String(store.pathSlug));
          if (s) {
            setStorePathSlugOverride(s);
            try {
              localStorage.setItem('dataplus_store_slug_override', s);
            } catch {
              // ignore
            }
          }
        } else {
          setStorePathSlugOverride('');
          try {
            localStorage.removeItem('dataplus_store_slug_override');
          } catch {
            // ignore
          }
        }
        if (store.display && typeof store.display === 'object') {
          const d = store.display;
          setStoreDisplaySettings((prev) => {
            const next = {
              ...prev,
              logoDataUrl: typeof d.logoDataUrl === 'string' && d.logoDataUrl ? d.logoDataUrl : null,
              theme:
                typeof d.theme === 'string' && STORE_THEME_OPTIONS.some((o) => o.id === d.theme) ? d.theme : prev.theme,
              storeName: typeof d.storeName === 'string' ? d.storeName.slice(0, 100) : prev.storeName,
              storeDescription:
                typeof d.storeDescription === 'string' ? d.storeDescription.slice(0, 500) : prev.storeDescription,
              whatsapp: typeof d.whatsapp === 'string' ? d.whatsapp : prev.whatsapp,
              whatsappGroup: typeof d.whatsappGroup === 'string' ? d.whatsappGroup : prev.whatsappGroup,
              paystackEnabled: typeof d.paystackEnabled === 'boolean' ? d.paystackEnabled : prev.paystackEnabled,
              feeAbsorption:
                typeof d.feeAbsorption === 'number' && d.feeAbsorption >= 0 && d.feeAbsorption <= 100
                  ? d.feeAbsorption
                  : prev.feeAbsorption,
            };
            try {
              localStorage.setItem('dataplus_store_display_v1', JSON.stringify(next));
            } catch {
              // ignore
            }
            return next;
          });
        }
        if (store.service && typeof store.service === 'object') {
          const sv = store.service;
          setStoreServiceSettings((prev) => {
            const next = {
              afaEnabled: typeof sv.afaEnabled === 'boolean' ? sv.afaEnabled : prev.afaEnabled,
              afaPrice: typeof sv.afaPrice === 'string' ? sv.afaPrice : String(sv.afaPrice ?? prev.afaPrice),
              afaDescription:
                typeof sv.afaDescription === 'string' ? sv.afaDescription : prev.afaDescription,
              vouchersEnabled: typeof sv.vouchersEnabled === 'boolean' ? sv.vouchersEnabled : prev.vouchersEnabled,
            };
            try {
              localStorage.setItem('dataplus_store_services_v1', JSON.stringify(next));
            } catch {
              // ignore
            }
            return next;
          });
        }
        if (store.customBundlePrices && typeof store.customBundlePrices === 'object' && !Array.isArray(store.customBundlePrices)) {
          setStoreCustomBundlePrices((prev) => {
            const next = { ...prev, ...store.customBundlePrices };
            try {
              localStorage.setItem('dataplus_store_custom_bundle_prices', JSON.stringify(next));
            } catch {
              // ignore
            }
            return next;
          });
        }
        if (store.customBundleActive && typeof store.customBundleActive === 'object' && !Array.isArray(store.customBundleActive)) {
          setStoreCustomBundleActive((prev) => {
            const next = { ...prev, ...store.customBundleActive };
            try {
              localStorage.setItem('dataplus_store_custom_bundle_active', JSON.stringify(next));
            } catch {
              // ignore
            }
            return next;
          });
        }
        if (store.availability !== undefined) {
          setStoreAvailabilityOn(!!store.availability);
        }
        window.setTimeout(() => {
          if (!cancelled) {
            try {
              persistPublicStoreSnapshot();
            } catch {
              // ignore
            }
          }
        }, 0);
        vendorStoreSyncedForUserRef.current = user.id;
      } catch {
        // offline or older API: keep local cache
        vendorStoreSyncedForUserRef.current = user.id;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, user?.id, user?.email, persistPublicStoreSnapshot]);

  useEffect(() => {
    if (!isSignedIn || !api.getToken() || !effectiveStorePathSlug) {
      if (storeApiSyncTimerRef.current) {
        clearTimeout(storeApiSyncTimerRef.current);
        storeApiSyncTimerRef.current = null;
      }
      return undefined;
    }
    if (storeApiSyncTimerRef.current) clearTimeout(storeApiSyncTimerRef.current);
    storeApiSyncTimerRef.current = setTimeout(() => {
      storeApiSyncTimerRef.current = null;
      const body = buildMyStoreRequestBodyRef.current ? buildMyStoreRequestBodyRef.current() : null;
      if (body) api.putMyStore(body).catch(() => {});
    }, 2500);
    return () => {
      if (storeApiSyncTimerRef.current) {
        clearTimeout(storeApiSyncTimerRef.current);
        storeApiSyncTimerRef.current = null;
      }
    };
  }, [
    isSignedIn,
    effectiveStorePathSlug,
    hasCustomStorePath,
    storePathSlugOverride,
    storeDisplaySettings,
    storeServiceSettings,
    storeAvailabilityOn,
    storeCustomBundlePrices,
    storeCustomBundleActive,
    bundlesByNetwork,
    user,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined' || !effectiveStorePathSlug) return;
    try {
      localStorage.setItem('dataplus_store_availability', storeAvailabilityOn ? '1' : '0');
    } catch {
      // ignore
    }
    persistPublicStoreSnapshot();
    // Only availability + slug: avoids rewriting snapshot on every change to persist’s other deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeAvailabilityOn, effectiveStorePathSlug]);

  /** Keep local public snapshot + pricing keys in sync when Custom Pricing changes (no need to press Save only). */
  useEffect(() => {
    if (typeof window === 'undefined' || !effectiveStorePathSlug) return undefined;
    if (storePricingLocalPersistTimerRef.current) {
      clearTimeout(storePricingLocalPersistTimerRef.current);
    }
    storePricingLocalPersistTimerRef.current = setTimeout(() => {
      storePricingLocalPersistTimerRef.current = null;
      try {
        localStorage.setItem('dataplus_store_custom_bundle_prices', JSON.stringify(storeCustomBundlePrices));
        localStorage.setItem('dataplus_store_custom_bundle_active', JSON.stringify(storeCustomBundleActive));
      } catch {
        // ignore
      }
      persistPublicStoreSnapshot();
    }, 400);
    return () => {
      if (storePricingLocalPersistTimerRef.current) {
        clearTimeout(storePricingLocalPersistTimerRef.current);
        storePricingLocalPersistTimerRef.current = null;
      }
    };
  }, [
    storeCustomBundlePrices,
    storeCustomBundleActive,
    effectiveStorePathSlug,
    persistPublicStoreSnapshot,
  ]);

  const MenuItem = ({ id, icon, label, hasSubmenu = false, badge }) => {
    const isSelected = selectedMenu === id;
    const showBadge = typeof badge === 'number' && badge > 0;
    return (
      <div
        className={`rounded-xl transition-all ${isSelected ? 'p-[2px]' : ''}`}
        style={
          isSelected
            ? { background: 'linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7)' }
            : {}
        }
      >
        <button
          onClick={() => handleMenuSelect(id)}
                className={`flex items-center gap-3 p-3 w-full rounded-xl transition-all duration-200 text-base border ${
            isSelected
              ? isDark
                ? 'bg-white/10 text-white border-white/20 shadow-[0_0_16px_rgba(255,255,255,0.08)]'
                : 'bg-slate-200 text-slate-900 border-slate-300'
              : isDark
                ? 'bg-white/5 hover:bg-white/10 text-white border-white/10 hover:border-white/20'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-900 border-slate-200'
                }`}
              >
                <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all ${
              isSelected
                ? isDark
                  ? 'bg-white/15 border-white/20'
                  : 'bg-slate-300 border-slate-300'
                : isDark
                  ? 'bg-white/10 border-white/10'
                  : 'bg-slate-200 border-slate-200'
            }`}
          >
            {icon}
          </div>
          <span className="flex-1 text-left">{label}</span>
          {showBadge ? (
            <span className="shrink-0 min-w-[1.25rem] h-5 px-1 rounded-full text-xs font-bold flex items-center justify-center bg-rose-500 text-white">
              {badge > 9 ? '9+' : badge}
            </span>
          ) : null}
          {hasSubmenu && (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke={isDark ? '#ffffff' : '#000000'}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform ${ordersExpanded ? 'rotate-180' : ''}`}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          )}
        </button>
      </div>
    );
  };

  const Svg = {
    Menu: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={props.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M15 21V9" />
      </svg>
    ),
    User: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={props.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
    Sun: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <circle cx="12" cy="12" r="5" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      </svg>
    ),
    Moon: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    ),
    Close: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={props.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    ),
    RefreshCw: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={props.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
        <path d="M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
        <path d="M3 21v-5h5" />
      </svg>
    ),
    Trash: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={props.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <line x1="10" y1="11" x2="10" y2="17" />
        <line x1="14" y1="11" x2="14" y2="17" />
      </svg>
    ),
    Grid: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={props.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
    Phone: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={props.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <rect x="5" y="2" width="14" height="20" rx="2" />
        <path d="M12 18h.01" />
      </svg>
    ),
    ChevronDown: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={props.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className} {...props}>
        <path d="M6 9l6 6 6-6" />
      </svg>
    ),
    Clock: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={props.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
    ),
    Message: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={props.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    ),
    Inbox: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={props.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
        <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      </svg>
    ),
    WhatsApp: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill={props.stroke || 'currentColor'} {...props}>
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.885-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    ),
    Wallet: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={props.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
    Cart: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={props.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </svg>
    ),
    Shield: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={props.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    Home: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={props.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
    Plus: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="16" />
        <line x1="8" y1="12" x2="16" y2="12" />
      </svg>
    ),
    File: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70" {...props}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
    Dollar: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70" {...props}>
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
    Card: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70" {...props}>
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
    LogOut: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
    ),
    Edit: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    ),
    Link: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <path d="M15 3h6v6" />
        <path d="M10 14 21 3" />
      </svg>
    ),
    Chart: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </svg>
    ),
    ArrowLeft: ({ width = 24, height = 24, ...props }) => (
      <svg xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M13.8 12H3" />
      </svg>
    ),
    Megaphone: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={props.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="m3 11 18-5v12L3 13v-2z" />
        <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
      </svg>
    ),
  };

  const stroke = isDark ? '#ffffff' : '#000000';

  const visiblePublicBroadcast = useMemo(() => {
    if (adminRoute) return null;
    const list = Array.isArray(publicBroadcasts) ? publicBroadcasts : [];
    for (const b of list) {
      if (b?.id && b.image_url && !isBroadcastDismissed(b.id, b.reshow_after_hours ?? 0)) return b;
    }
    return null;
  }, [adminRoute, publicBroadcasts, broadcastDismissTick]);

  const visibleBroadcastId = visiblePublicBroadcast?.id ?? null;
  const visiblePopupDelayRaw = visiblePublicBroadcast?.popup_delay_seconds;
  const visiblePopupDelayMs = useMemo(() => {
    if (!visibleBroadcastId) return 2000;
    const n = Number(visiblePopupDelayRaw);
    const sec = Number.isFinite(n) ? Math.min(600, Math.max(0, n)) : 2;
    return sec * 1000;
  }, [visibleBroadcastId, visiblePopupDelayRaw]);

  useEffect(() => {
    if (broadcastDelayTimerRef.current) {
      clearTimeout(broadcastDelayTimerRef.current);
      broadcastDelayTimerRef.current = null;
    }

    if (adminRoute || !visibleBroadcastId) {
      setBroadcastModalOpen(false);
      prevVisibleBroadcastIdRef.current = visibleBroadcastId;
      return undefined;
    }

    const prev = prevVisibleBroadcastIdRef.current;
    const idChanged = prev !== null && prev !== visibleBroadcastId;
    if (idChanged) {
      setBroadcastModalOpen(false);
    }
    prevVisibleBroadcastIdRef.current = visibleBroadcastId;

    if (!idChanged && broadcastModalOpen) {
      return () => {
        if (broadcastDelayTimerRef.current) {
          clearTimeout(broadcastDelayTimerRef.current);
          broadcastDelayTimerRef.current = null;
        }
      };
    }

    const ms = visiblePopupDelayMs;
    broadcastDelayTimerRef.current = setTimeout(() => {
      setBroadcastModalOpen(true);
      broadcastDelayTimerRef.current = null;
    }, ms);

    return () => {
      if (broadcastDelayTimerRef.current) {
        clearTimeout(broadcastDelayTimerRef.current);
        broadcastDelayTimerRef.current = null;
      }
    };
  }, [adminRoute, visibleBroadcastId, broadcastDismissTick, broadcastModalOpen, visiblePopupDelayMs]);

  const broadcastAutoCloseSec = useMemo(() => {
    const b = visiblePublicBroadcast;
    if (!b || !visibleBroadcastId || String(b.id) !== String(visibleBroadcastId)) return 0;
    const raw = b.auto_close_seconds ?? b.autoCloseSeconds;
    const ac = typeof raw === 'string' ? parseInt(String(raw).replace(/\D/g, ''), 10) : Math.round(Number(raw));
    if (!Number.isFinite(ac) || ac <= 0) return 0;
    return Math.min(86400, Math.max(1, ac));
  }, [visiblePublicBroadcast, visibleBroadcastId]);

  const broadcastAutoCloseReshowHours = useMemo(() => {
    const b = visiblePublicBroadcast;
    if (!b || !visibleBroadcastId || String(b.id) !== String(visibleBroadcastId)) return 0;
    return Number(b.reshow_after_hours ?? b.reshowAfterHours) || 0;
  }, [visiblePublicBroadcast, visibleBroadcastId]);

  useEffect(() => {
    if (!broadcastModalOpen || !visibleBroadcastId || broadcastAutoCloseSec <= 0) return undefined;
    const bid = visibleBroadcastId;
    const reshow = broadcastAutoCloseReshowHours;
    const t = setTimeout(() => {
      dismissPublicBroadcast(bid, reshow);
      setBroadcastDismissTick((x) => x + 1);
      setBroadcastModalOpen(false);
    }, broadcastAutoCloseSec * 1000);
    return () => clearTimeout(t);
  }, [broadcastModalOpen, visibleBroadcastId, broadcastAutoCloseSec, broadcastAutoCloseReshowHours]);

  return (
    <div className={`h-full min-h-0 flex flex-col overflow-hidden transition-colors duration-300 ${isDark ? 'bg-black text-white' : 'bg-slate-50 text-slate-900'}`} style={{ minHeight: '100dvh' }}>
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes pulse-ray {
          0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); }
          50% { box-shadow: 0 0 0 8px rgba(34, 197, 94, 0); }
          100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
        }
        .status-dot { animation: pulse-ray 2s infinite; }
        @keyframes gradient-flow {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        .balance-card-live {
          background: linear-gradient(90deg, #8b5cf6, #d946ef, #06b6d4, #8b5cf6);
          background-size: 200% 100%;
          animation: gradient-flow 2.5s ease infinite;
        }
        @keyframes datapod-float {
          0% { transform: translate3d(0, 0, 0); }
          50% { transform: translate3d(0, -10px, 0); }
          100% { transform: translate3d(0, 0, 0); }
        }
      `}</style>

      {typeof document !== 'undefined' &&
        isSignedIn &&
        token &&
        !adminRoute &&
        supportChatIntroOpen &&
        createPortal(
          <>
            <div
              className={`fixed inset-0 z-[99986] backdrop-blur-sm motion-safe:transition-opacity ${isDark ? 'bg-black/25' : 'bg-slate-900/15'}`}
              aria-hidden="true"
              onClick={dismissSupportChatIntro}
              role="presentation"
            />
            <div
              className="pointer-events-none fixed inset-x-0 bottom-0 z-[99990] flex justify-center p-4 md:justify-end md:p-6"
              style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
            >
              <div
                className="pointer-events-auto relative w-full max-w-[min(100%,22rem)] md:max-w-[24rem]"
                role="dialog"
                aria-modal="true"
                aria-labelledby="support-chat-intro-title"
                aria-describedby="support-chat-intro-body"
              >
                <div
                  className={`pointer-events-none absolute -inset-3 -z-10 rounded-[2.75rem] opacity-50 blur-2xl ${isDark ? 'bg-sky-400/25' : 'bg-sky-400/40'}`}
                  aria-hidden
                />
                <div
                  className={`relative border shadow-2xl backdrop-blur-xl
                    rounded-tl-[2.25rem] rounded-tr-[1.35rem] rounded-br-[0.85rem] rounded-bl-[2.1rem]
                    ${isDark
                      ? 'border-white/20 bg-gradient-to-br from-zinc-900/88 via-zinc-950/82 to-zinc-950/78'
                      : 'border-white/75 bg-gradient-to-br from-white/78 via-white/62 to-sky-50/45'}`}
                >
                  <div
                    className={`pointer-events-none absolute -bottom-2 right-11 z-0 h-6 w-6 rotate-45 rounded-[3px] border-r border-b shadow-md backdrop-blur-xl
                      ${isDark ? 'border-white/20 bg-zinc-950/92' : 'border-white/75 bg-white/78'}`}
                    aria-hidden
                  />
                  <div className="relative z-[1] px-4 pb-4 pt-3.5">
                    <div className="flex items-start gap-3">
                      <SupportInboxAvatar
                        src={brandLogoUrl}
                        initial={supportInboxAvatarInitial(APP_BRAND_DISPLAY_NAME, 'Support')}
                        isDark={isDark}
                        className="h-11 w-11 shrink-0 ring-2 ring-white/25 dark:ring-white/10"
                      />
                      <div className="min-w-0 flex-1 pt-0.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p
                              id="support-chat-intro-title"
                              className={`text-sm font-semibold leading-tight ${isDark ? 'text-white' : 'text-slate-900'}`}
                            >
                              {APP_BRAND_DISPLAY_NAME} Support
                            </p>
                            <p className={`mt-0.5 text-[11px] font-medium ${isDark ? 'text-sky-300/95' : 'text-sky-600'}`}>
                              New — live chat for help
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={dismissSupportChatIntro}
                            className={`shrink-0 rounded-full p-2 transition-colors ${isDark ? 'text-white/65 hover:bg-white/10' : 'text-slate-500 hover:bg-slate-900/[0.06]'}`}
                            aria-label="Dismiss"
                          >
                            <Svg.Close stroke={stroke} width={18} height={18} />
                          </button>
                        </div>
                        <p
                          id="support-chat-intro-body"
                          className={`mt-3 text-sm leading-relaxed ${isDark ? 'text-white/88' : 'text-slate-700'}`}
                        >
                          We have added <span className="font-semibold">in-app support chat</span> so you can reach us
                          faster. Tap the highlighted <span className="font-semibold">message</span> bubble in the
                          corner — same spot for orders, bundles, or to request a human.
                        </p>
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={openSupportFromIntro}
                            className={`min-h-[44px] flex-1 rounded-full px-5 py-2.5 text-sm font-semibold shadow-md transition-transform active:scale-[0.98] ${isDark ? 'bg-white text-black hover:bg-white/92' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
                          >
                            Open support chat
                          </button>
                          <button
                            type="button"
                            onClick={dismissSupportChatIntro}
                            className={`min-h-[44px] rounded-full px-5 py-2.5 text-sm font-semibold transition-colors ${isDark ? 'bg-white/10 text-white/90 ring-1 ring-white/15 hover:bg-white/15' : 'bg-white/80 text-slate-800 ring-1 ring-slate-200/80 hover:bg-white'}`}
                          >
                            Not now
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>,
          document.body,
        )}

      {adminRoute && !adminPinVerified && !(isSignedIn && user?.role === 'admin') ? (
        <div className="flex-1 flex flex-col w-full min-h-full items-center justify-center p-6" style={{ minHeight: '100dvh' }}>
          <AdminPinPage
            isDark={isDark}
            onVerified={() => {
              setAdminPinVerified(true);
              setCurrentPage('admin-analytics');
              setSelectedMenu('admin-analytics');
            }}
            appSettings={appSettings}
          />
        </div>
      ) : publicStorePathSegment ? (
        <div
          className={`flex-1 h-0 min-h-0 w-full overflow-y-auto overflow-x-hidden overscroll-y-contain ${isDark ? 'bg-zinc-950' : 'bg-slate-100'}`}
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <PublicStorefront
            isDark={isDark}
            onToggleTheme={toggleTheme}
            slug={publicStorePathSegment}
            data={publicStorefrontData}
            onOpenSignIn={() => {
              navigate('/');
            }}
            onBrowseOther={() => {
              navigate('/');
            }}
          />
        </div>
      ) : !isSignedIn && !adminPinVerified ? (
        <div className="flex-1 flex flex-col w-full min-h-full">
          <SignInPage
            isDark={isDark}
            appSettings={appSettings}
            onSignIn={(result) => {
              api.setToken(result.token);
              setToken(result.token);
              setUser(result.user);
              setIsSignedIn(true);
              localStorage.setItem('dataplus_signed_in', 'true');
              fetchWallet();
            }}
          />
        </div>
      ) : (
        <>
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />

      {(sidebarOpen || profileOpen) && (
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 md:hidden flex items-start justify-start p-4"
            onClick={() => {
              setSidebarOpen(false);
              setProfileOpen(false);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setSidebarOpen(false); setProfileOpen(false); } }}
            aria-label="Close menu"
          >
            <span className="rounded-full bg-white/20 p-2 text-white pointer-events-none">
              <Svg.ArrowLeft width={24} height={24} aria-hidden className="shrink-0" />
            </span>
          </div>
      )}

      {/* Layout: on mobile = full-width main + overlay sidebar; on md+ = sidebar | main (flex row, main fills rest) */}
      <div className="flex-1 flex min-h-0 flex-col md:flex-row">
      <aside
        className={`fixed md:relative top-0 left-0 h-full w-72 flex-shrink-0 z-[60] md:z-50 transition-transform duration-300 rounded-r-3xl md:rounded-r-none shadow-xl md:shadow-none ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} ${isDark ? 'bg-black border-r border-white/10' : 'bg-white border-r border-slate-200'}`}
      >
        <div className="p-4 pt-5 h-full overflow-y-auto no-scrollbar flex flex-col items-stretch">
          {/* Datafy Hub: circle + details in line with close button, no card */}
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-4 min-w-0 flex-1">
              <div className="relative flex-shrink-0">
                <img
                  src={appSettings?.sidebarLogoUrl || 'https://files.catbox.moe/l3islw.jpg'}
                  alt="DataPlus"
                  className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border ${isDark ? 'border-white/10' : 'border-slate-200'}`}
                />
                {showAdminNav && (
                  <>
                    <input
                      ref={adminLogoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const dataUrl = await new Promise((res, rej) => {
                          const r = new FileReader();
                          r.onload = () => res(r.result);
                          r.onerror = rej;
                          r.readAsDataURL(f);
                        });
                        e.target.value = '';
                        setAdminSettingsSaving(true);
                        setAdminSettingsMessage(null);
                        try {
                          await api.updateAdminSettings({ sidebarLogoUrl: dataUrl });
                          const s = await api.getSettings();
                          setAppSettings((prev) => ({ ...prev, ...s }));
                          setAdminSettingsMessage({ type: 'success', text: 'Logo updated' });
                        } catch (err) {
                          setAdminSettingsMessage({ type: 'error', text: err?.message || 'Failed to save' });
                        } finally {
                          setAdminSettingsSaving(false);
                          setTimeout(() => setAdminSettingsMessage(null), 2500);
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => adminLogoInputRef.current?.click()}
                      disabled={adminSettingsSaving}
                      className="absolute bottom-0 right-0 w-7 h-7 rounded-full flex items-center justify-center border-2 shadow-md transition-transform hover:scale-110 active:scale-95 bg-white text-black border-slate-300 disabled:opacity-60"
                      aria-label="Edit logo"
                      title="Edit logo"
                    >
                      {adminSettingsSaving ? <span className="text-sm">…</span> : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                      )}
                    </button>
                  </>
                )}
              </div>
              <div className="min-w-0">
                <h2 className={`text-lg font-semibold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>𝒟𝒶𝓉𝒶𝒫𝓁𝓊𝓈</h2>
                <p className={`text-sm truncate ${isDark ? 'text-white/70' : 'text-slate-500'}`}>{showAdminNav ? 'Admin Console' : 'User Console'}</p>
              </div>
            </div>
            <button
              onClick={toggleSidebar}
              className={`flex items-center justify-center w-12 h-12 rounded-xl border transition-all duration-200 hover:scale-105 active:scale-95 flex-shrink-0 ${isDark ? 'bg-white/10 border-white/10 hover:border-white/20' : 'bg-slate-100 border-slate-200 hover:border-slate-300'}`}
              aria-label="Close menu"
            >
              <Svg.Close stroke={stroke} />
            </button>
          </div>
          {adminSettingsMessage && (
            <p className={`text-xs mb-3 ${adminSettingsMessage.type === 'success' ? (isDark ? 'text-green-400' : 'text-green-600') : (isDark ? 'text-red-400' : 'text-red-600')}`}>
              {adminSettingsMessage.text}
            </p>
          )}
          <div className={`w-10 h-px mx-auto mb-4 ${isDark ? 'bg-white/10' : 'bg-slate-200'}`} />

          <p className={`text-xs uppercase tracking-wider mb-2 font-medium ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Menu</p>
          <nav className="space-y-1.5">
            <MenuItem id="dashboard" icon={<Svg.Grid stroke={stroke} />} label="Dashboard" />
            {!showAdminNav && canAccessStoreDashboard && (
              <MenuItem id="store-dashboard" icon={<Svg.Cart stroke={stroke} />} label="Store Dashboard" />
            )}
            {!showAdminNav && <MenuItem id="bulk-orders" icon={<Svg.Phone stroke={stroke} />} label="Bulk Orders (MTN)" />}
            {!showAdminNav && <MenuItem id="afa-registration" icon={<Svg.Phone stroke={stroke} />} label="AFA Registration" />}
            {!showAdminNav && (
              <div
                className={`rounded-xl transition-all ${selectedMenu === 'orders' ? 'p-[2px]' : ''}`}
                style={selectedMenu === 'orders' ? { background: 'linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7)' } : {}}
              >
                <button
                  onClick={() => {
                    handleMenuSelect('orders');
                    toggleOrders();
                  }}
                  className={`flex items-center gap-3 p-3 w-full rounded-xl transition-all duration-200 border ${
                    selectedMenu === 'orders'
                      ? isDark ? 'bg-white/10 text-white border-white/20 shadow-[0_0_16px_rgba(255,255,255,0.08)]' : 'bg-slate-200 text-slate-900 border-slate-300'
                      : isDark ? 'bg-white/5 hover:bg-white/10 text-white border-white/10 hover:border-white/20' : 'bg-slate-50 hover:bg-slate-100 text-slate-900 border-slate-200'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${selectedMenu === 'orders' ? (isDark ? 'bg-white/15 border-white/20' : 'bg-slate-300 border-slate-300') : isDark ? 'bg-white/10 border-white/10' : 'bg-slate-200 border-slate-200'}`}>
                    <Svg.Clock stroke={stroke} />
                  </div>
                  <span className="flex-1 text-left">Orders</span>
                  <Svg.ChevronDown stroke={stroke} className={`transition-transform ${ordersExpanded ? 'rotate-180' : ''}`} />
                </button>
                {ordersExpanded && (
                  <div className={`px-3 pb-3 space-y-1 ${isDark ? 'text-white/80' : 'text-slate-600'}`}>
                    <a href="#" onClick={(e) => { e.preventDefault(); handleMenuSelect('pending-orders'); }} className={`block py-2.5 px-3 rounded-lg text-base ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-200'} ${selectedMenu === 'pending-orders' ? (isDark ? 'bg-white/10' : 'bg-slate-200') : ''}`}>Pending Orders</a>
                    <a href="#" onClick={(e) => { e.preventDefault(); handleMenuSelect('completed-orders'); }} className={`block py-2.5 px-3 rounded-lg text-base ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-200'} ${selectedMenu === 'completed-orders' ? (isDark ? 'bg-white/10' : 'bg-slate-200') : ''}`}>Completed Orders</a>
                  </div>
                )}
              </div>
            )}
            <MenuItem id="transactions" icon={<Svg.Clock stroke={stroke} />} label="Transactions" />
            {isSignedIn && !showAdminNav && (
              <MenuItem id="support" icon={<Svg.Message stroke={stroke} />} label="Support" badge={supportUnreadUser} />
            )}
            {!showAdminNav && <MenuItem id="join-us" icon={<Svg.WhatsApp stroke={stroke} />} label="Join Us" />}
            {showAdminNav && (
              <>
                <MenuItem id="admin-users" icon={<Svg.User stroke={stroke} />} label="User Management" />
                <MenuItem id="admin-orders" icon={<Svg.Cart stroke={stroke} />} label="Order Management" />
                <MenuItem id="admin-packages" icon={<Svg.Grid stroke={stroke} />} label="Data Packages" />
                <MenuItem id="admin-all-transactions" icon={<Svg.Card stroke={stroke} />} label="All Transactions" />
                <MenuItem id="admin-wallet" icon={<Svg.Wallet stroke={stroke} />} label="Wallet Management" />
                <MenuItem id="admin-broadcasts" icon={<Svg.Megaphone stroke={stroke} />} label="Broadcasts" />
                <MenuItem id="admin-analytics" icon={<Svg.Chart stroke={stroke} />} label="Analytics" />
              </>
            )}
          </nav>

          <div className={`mt-4 pt-4 border-t ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
            <button
              onClick={toggleTheme}
              className={`flex items-center justify-center w-12 h-12 rounded-xl border transition-all duration-200 hover:scale-105 active:scale-95 ${isDark ? 'bg-white/10 border-white/10 hover:border-white/20' : 'bg-slate-100 border-slate-200 hover:border-slate-300'}`}
              aria-label="Toggle theme"
            >
              {isDark ? <Svg.Sun /> : <Svg.Moon />}
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden w-full min-w-0 px-3 sm:px-4 md:px-6 lg:px-8 pb-20 sm:pb-24">
        <header
          className={`fixed top-0 left-0 right-0 z-50 h-14 sm:h-16 transition-all duration-300 flex items-center justify-between px-3 sm:px-4 md:px-6 backdrop-blur-xl md:left-72 ${isDark ? 'bg-black/90' : 'bg-white/40'} ${scrolled ? 'shadow-lg' : ''}`}
          style={{ paddingLeft: 'max(0.75rem, env(safe-area-inset-left))', paddingRight: 'max(0.75rem, env(safe-area-inset-right))' }}
        >
          <button
            onClick={toggleSidebar}
            className={`w-11 h-11 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center transition-colors flex-shrink-0 ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-200'}`}
            aria-label="Toggle sidebar"
          >
            <Svg.Menu stroke={stroke} width={24} height={24} />
          </button>
          <h1 className={`flex-1 text-center text-xl sm:text-2xl md:text-3xl font-semibold truncate px-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            {headerShowWelcome
              ? profileDisplayName ? `Welcome, ${profileDisplayName.trim().split(/\s+/)[0] || 'User'}` : 'Welcome'
              : '𝒟𝒶𝓉𝒶𝒫𝓁𝓊𝓈'}
          </h1>
          <button
            onClick={toggleProfile}
            className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center overflow-hidden transition-colors flex-shrink-0 ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-200'}`}
            aria-label="Toggle profile"
          >
            {adminAvatarSrc ? (
              <img src={adminAvatarSrc} alt="" className="w-full h-full object-cover rounded-full" />
            ) : (
              <Svg.User stroke={stroke} width={24} height={24} />
            )}
          </button>
        </header>

        {broadcastModalOpen && visiblePublicBroadcast && typeof document !== 'undefined' &&
          createPortal(
            <div className="fixed inset-0 z-[85] flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="broadcast-popup-title">
              {/* Backdrop: visual only — does not dismiss; only the ✕ control closes (per product request). */}
              <div className="absolute inset-0 bg-black/45 backdrop-blur-md" aria-hidden="true" />
              <div
                className={`relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border shadow-2xl isolate ${
                  isDark
                    ? 'bg-zinc-950/50 backdrop-blur-2xl border-white/15 shadow-black/50'
                    : 'bg-white/45 backdrop-blur-2xl border-white/70 shadow-slate-900/15'
                }`}
              >
                <button
                  type="button"
                  className={`absolute top-3 right-3 z-10 w-10 h-10 rounded-full flex items-center justify-center text-lg leading-none font-semibold border backdrop-blur-md ${
                    isDark
                      ? 'bg-white/10 text-white border-white/25 hover:bg-white/15'
                      : 'bg-white/60 text-slate-800 border-white/80 hover:bg-white/80'
                  }`}
                  aria-label="Close"
                  onClick={() => {
                    dismissPublicBroadcast(visiblePublicBroadcast.id, Number(visiblePublicBroadcast.reshow_after_hours) || 0);
                    setBroadcastDismissTick((t) => t + 1);
                    setBroadcastModalOpen(false);
                  }}
                >
                  ✕
                </button>
                <div
                  className={`relative w-full h-[min(46vh,320px)] min-h-[72px] overflow-hidden rounded-t-2xl ${isDark ? 'bg-black/45' : 'bg-slate-100'}`}
                >
                  <img
                    src={visiblePublicBroadcast.image_url}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover object-center"
                  />
                </div>
                <div
                  className={`p-5 pt-6 border-t ${
                    isDark
                      ? 'border-white/10 text-white bg-zinc-950'
                      : 'border-slate-200/90 text-slate-900 bg-white'
                  }`}
                >
                  <p id="broadcast-popup-title" className="text-lg sm:text-xl font-semibold leading-snug tracking-tight">
                    {sanitizeBroadcastTitle(visiblePublicBroadcast.title) || 'Announcement from DataPlus'}
                  </p>
                  {(() => {
                    const capHtml = formatBroadcastCaptionForDisplay(visiblePublicBroadcast.caption || '');
                    return capHtml ? (
                      <div
                        className={`broadcast-popup-body text-sm mt-2.5 leading-relaxed ${isDark ? 'text-white/90' : 'text-slate-700'}`}
                        dangerouslySetInnerHTML={{ __html: capHtml }}
                      />
                    ) : null;
                  })()}
                  {String(visiblePublicBroadcast.cta_url || '').trim() ? (
                    <div className="mt-4 flex justify-end">
                      <a
                        href={visiblePublicBroadcast.cta_url}
                        {...(visiblePublicBroadcast.cta_open_new_tab !== false
                          ? { target: '_blank', rel: 'noopener noreferrer' }
                          : { rel: 'noopener' })}
                        className="inline-flex max-w-full items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-white bg-violet-600 hover:bg-violet-500 active:bg-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900 transition-colors shadow-sm"
                      >
                        <Svg.Link width={18} height={18} className="shrink-0 text-white/95" stroke="currentColor" />
                        {String(visiblePublicBroadcast.cta_label || '').trim() || 'Learn more'}
                      </a>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>,
            document.body
          )}

        {adminBroadcastPreview && typeof document !== 'undefined' &&
          createPortal(
            <div
              className="fixed inset-0 z-[86] flex items-center justify-center p-4 sm:p-6"
              role="dialog"
              aria-modal="true"
              aria-labelledby="admin-broadcast-preview-title"
            >
              <button
                type="button"
                className="absolute inset-0 bg-black/45 backdrop-blur-md"
                aria-label="Close preview"
                onClick={() => setAdminBroadcastPreview(null)}
              />
              <div
                className={`relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border shadow-2xl isolate ${
                  isDark
                    ? 'bg-zinc-950/50 backdrop-blur-2xl border-white/15 shadow-black/50'
                    : 'bg-white/45 backdrop-blur-2xl border-white/70 shadow-slate-900/15'
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className={`flex items-center justify-between gap-3 px-4 py-3 border-b backdrop-blur-md ${
                    isDark ? 'border-white/10 bg-white/[0.08]' : 'border-white/50 bg-white/35'
                  }`}
                >
                  <div className="min-w-0">
                    <p className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-violet-300' : 'text-violet-700'}`}>
                      {String(adminBroadcastPreview.id) === '__draft__' ? 'Draft preview' : 'Customer preview'}
                    </p>
                    <p className={`text-xs mt-0.5 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>
                      {String(adminBroadcastPreview.id) === '__draft__'
                        ? 'Not published yet — same layout customers will see'
                        : 'This is how the pop-up looks to users'}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg leading-none font-semibold border backdrop-blur-md ${
                      isDark
                        ? 'bg-white/10 text-white border-white/25 hover:bg-white/15'
                        : 'bg-white/60 text-slate-800 border-white/80 hover:bg-white/80'
                    }`}
                    aria-label="Close preview"
                    onClick={() => setAdminBroadcastPreview(null)}
                  >
                    ✕
                  </button>
                </div>
                {String(adminBroadcastPreview.id) === '__draft__' ? (
                  <div
                    className={`mx-4 mt-3 px-3 py-2 rounded-lg text-xs font-semibold border backdrop-blur-md ${
                      isDark
                        ? 'bg-sky-500/20 border-sky-400/30 text-sky-50'
                        : 'bg-sky-400/25 border-sky-500/25 text-sky-950'
                    }`}
                  >
                    Draft — click Publish to show this to customers.
                  </div>
                ) : null}
                {String(adminBroadcastPreview.id) !== '__draft__' && adminBroadcastPreview.active === false ? (
                  <div
                    className={`mx-4 mt-3 px-3 py-2 rounded-lg text-xs font-semibold border backdrop-blur-md ${
                      isDark
                        ? 'bg-zinc-500/25 border-zinc-400/35 text-zinc-100'
                        : 'bg-slate-100 border-slate-300 text-slate-800'
                    }`}
                  >
                    Inactive — customers do not see this broadcast.
                  </div>
                ) : null}
                <div
                  className={`relative w-full h-[min(46vh,320px)] min-h-[72px] overflow-hidden ${isDark ? 'bg-black/45' : 'bg-slate-100'} ${String(adminBroadcastPreview.id) !== '__draft__' && adminBroadcastPreview.active === false ? 'opacity-60' : ''}`}
                >
                  <img
                    src={adminBroadcastPreview.image_url}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover object-center"
                  />
                </div>
                <div
                  className={`p-5 pt-6 border-t ${
                    isDark
                      ? 'border-white/10 text-white bg-zinc-950'
                      : 'border-slate-200/90 text-slate-900 bg-white'
                  }`}
                >
                  <p id="admin-broadcast-preview-title" className="text-lg sm:text-xl font-semibold leading-snug tracking-tight">
                    {sanitizeBroadcastTitle(adminBroadcastPreview.title) || 'Announcement from DataPlus'}
                  </p>
                  {(() => {
                    const prevCap = formatBroadcastCaptionForDisplay(adminBroadcastPreview.caption || '');
                    return prevCap ? (
                      <div
                        className={`broadcast-popup-body text-sm mt-2.5 leading-relaxed ${isDark ? 'text-white/90' : 'text-slate-700'}`}
                        dangerouslySetInnerHTML={{ __html: prevCap }}
                      />
                    ) : null;
                  })()}
                  {(() => {
                    const previewCta = normalizeBroadcastCtaUrlForApi(adminBroadcastPreview.cta_url);
                    return previewCta ? (
                      <div className="mt-4 flex justify-end">
                        <a
                          href={previewCta}
                          {...(adminBroadcastPreview.cta_open_new_tab !== false
                            ? { target: '_blank', rel: 'noopener noreferrer' }
                            : { rel: 'noopener' })}
                          className="inline-flex max-w-full items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-white bg-violet-600 hover:bg-violet-500 active:bg-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900 transition-colors shadow-sm pointer-events-auto"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Svg.Link width={18} height={18} className="shrink-0 text-white/95" stroke="currentColor" />
                          {String(adminBroadcastPreview.cta_label || '').trim() || 'Learn more'}
                        </a>
                      </div>
                    ) : String(adminBroadcastPreview.cta_url || '').trim() ? (
                      <p className={`text-xs mt-3 ${isDark ? 'text-rose-200/90' : 'text-rose-700'}`}>
                        Link field is set but not a valid http(s) URL — customers would not see a button.
                      </p>
                    ) : null;
                  })()}
                  <p className={`text-xs mt-4 ${isDark ? 'text-white/55' : 'text-slate-600'}`}>
                    Preview only — closing does not affect customers.
                  </p>
                </div>
              </div>
            </div>,
            document.body
          )}

      {buyBundle && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setBuyBundle(null); setRecipientNumber(''); }} aria-hidden="true" />
          <div className={`relative w-full max-w-md rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto ${isDark ? 'bg-black' : 'bg-slate-50'}`}>
            {/* Top card: purchase summary - matches selected network */}
            <div className="rounded-xl sm:rounded-2xl mx-3 mt-3 sm:mx-4 sm:mt-4 p-5 sm:p-6 text-white relative overflow-hidden bg-cover bg-center" style={{ backgroundImage: networkBg(buyBundle.network) }}>
              <div className="absolute inset-0 bg-black/50 rounded-xl sm:rounded-2xl" aria-hidden="true" />
              {adminStoreTools && bundlesData && bundlesData[buyBundle.network] && (() => {
                const arr = bundlesData[buyBundle.network];
                const idx = Array.isArray(arr) ? arr.findIndex((b) => String(b.size) === String(buyBundle.size)) : -1;
                return idx >= 0 ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const b = arr[idx];
                      setEditingBundle({ network: buyBundle.network, index: idx });
                      setEditBundleForm({ size: b.size, price: typeof b.price === 'number' ? b.price : parseFloat(b.price) || 0 });
                      setAdminBundlesMessage(null);
                      setBuyBundle(null);
                    }}
                    className="absolute top-3 right-3 z-20 w-9 h-9 rounded-lg flex items-center justify-center bg-white/20 hover:bg-white/40 text-white border border-white/40 shadow-lg"
                    aria-label="Edit package"
                    title="Edit package (updates for everyone)"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                  </button>
                ) : null;
              })()}
              <div className="relative z-10 flex justify-between items-start mb-4">
                <div>
                  <p className="text-sm font-medium opacity-90">{networkLabel(buyBundle.network)}</p>
                  <h3 className="text-xl sm:text-2xl font-bold">{buyBundle.size}</h3>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium opacity-90">Price</p>
                  <p className="text-lg sm:text-xl font-bold">¢ {buyBundle.price}</p>
                </div>
              </div>
              <button type="button" className={`w-full py-3 sm:py-4 rounded-xl font-semibold text-base transition-colors shadow-lg ${isDark ? 'bg-white/95 hover:bg-white text-black' : 'bg-white hover:bg-slate-50 text-slate-900'}`}>
                Buy
              </button>
            </div>
            {/* Bottom card: recipient — exactly 10 digits, any network */}
            <div className={`mx-3 mb-3 sm:mx-4 sm:mb-4 mt-3 rounded-xl sm:rounded-2xl p-5 sm:p-6 border ${isDark ? 'bg-black border-white/10' : 'bg-white border-slate-200'}`}>
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-white' : 'text-slate-700'}`}>Recipient number</label>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                value={recipientNumber}
                onChange={(e) => {
                  const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, RECIPIENT_PHONE_LEN);
                  setRecipientNumber(digitsOnly);
                  setRecipientError(null);
                }}
                placeholder="e.g. 0535596955"
                maxLength={RECIPIENT_PHONE_LEN}
                className={`w-full px-4 py-3 rounded-xl border text-base placeholder:opacity-60 ${recipientError ? 'border-red-500 focus:border-red-500' : isDark ? 'border-white/10' : 'border-slate-200'} ${isDark ? 'bg-black text-white placeholder:text-white/50' : 'bg-white text-slate-900 placeholder:text-slate-400'}`}
              />
              <p className={`text-xs mt-1.5 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>
                Ten digits, any network — no country code, just the local number.
              </p>
              {recipientError && <p className="text-sm text-red-500 mt-1.5">{recipientError}</p>}
              <div className="flex gap-3 mt-5 justify-end">
                <button
                  type="button"
                  onClick={() => { setBuyBundle(null); setRecipientNumber(''); setRecipientError(null); }}
                  className={`px-5 py-2.5 rounded-xl font-medium text-base transition-colors ${isDark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-slate-200 text-slate-800 hover:bg-slate-300'}`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={addToCart}
                  className={`px-5 py-2.5 rounded-xl font-medium text-base transition-colors ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/90'}`}
                >
                  Add to cart
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

        {currentPage === 'bulk-orders' ? (
          <>
            <div className="pt-14 sm:pt-20 pb-4 sm:pb-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <h1 className="page-title text-2xl sm:text-3xl truncate">Bulk Orders</h1>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`w-2 h-2 rounded-full ${isDark ? 'bg-white' : 'bg-slate-600'}`} aria-hidden />
                <span className={`text-sm font-medium hidden sm:inline ${isDark ? 'text-white/90' : 'text-slate-700'}`}>Open now</span>
                <button
                  type="button"
                  onClick={() => setCurrentPage('dashboard')}
                  className={`flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0 transition-colors ${isDark ? 'text-white/80 hover:bg-white/10' : 'text-slate-700 hover:bg-slate-200'}`}
                  aria-label="Back to dashboard"
                >
                  <Svg.ArrowLeft width={24} height={24} aria-hidden className="shrink-0" />
                </button>
              </div>
            </div>

            <p className={`mb-4 sm:mb-5 text-sm border-l-2 pl-3 ${isDark ? 'border-red-500/60 text-red-200/90' : 'border-red-500 text-red-700'}`}>
              <span className="font-medium">MTN Network Only.</span>{' '}
              Currently supporting MTN bundles. Additional networks will be available soon.
            </p>

            <div className={`rounded-xl sm:rounded-2xl overflow-hidden mb-4 sm:mb-5 ${isDark ? 'bg-white/5 border border-white/10' : 'bg-white border border-slate-200 shadow-sm'}`}>
              <div className="p-4 sm:p-6">
                <h2 className={`text-lg font-bold mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>Order Input</h2>
                <p className={`text-sm mb-3 ${isDark ? 'text-white/70' : 'text-slate-600'}`}>
                  Enter your orders in the format: <code className={`px-1.5 py-0.5 rounded font-mono text-sm ${isDark ? 'bg-white/10 text-white/90' : 'bg-slate-200 text-slate-800'}`}>phone_number capacity</code>
                </p>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className={`text-xs ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Examples:</span>
                  <span className={`text-xs font-medium ${isDark ? 'text-white/60' : 'text-slate-500'}`}>{bulkOrderInput.split(/\r?\n/).filter((s) => s.trim()).length} lines</span>
                </div>
                <div className={`rounded-lg p-3 mb-4 font-mono text-sm ${isDark ? 'bg-black/30 text-white/80' : 'bg-slate-100 text-slate-700'}`}>
                  <div>0535596955 5</div>
                  <div>0247654321 10</div>
                  <div>0551234567 2</div>
                </div>
                <textarea
                  value={bulkOrderInput}
                  onChange={(e) => { setBulkOrderInput(e.target.value); setBulkOrderError(null); setBulkOrderSuccess(null); }}
                  placeholder={'0535596955 5\n0247654321 10\n0551234567 2'}
                  rows={6}
                  className={`w-full px-4 py-3 rounded-xl border text-base font-mono placeholder:opacity-60 resize-y ${isDark ? 'bg-black/30 border-white/10 text-white placeholder:text-white/50' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`}
                />
                {bulkOrderError && <p className={`text-sm mt-2 ${isDark ? 'text-red-400' : 'text-red-600'}`}>{bulkOrderError}</p>}
                {bulkOrderSuccess && <p className={`text-sm mt-2 ${isDark ? 'text-white/90' : 'text-slate-700'}`}>{bulkOrderSuccess}</p>}
              </div>
            </div>

            <button
              type="button"
              onClick={processBulkOrders}
              className={`w-full py-4 rounded-xl font-semibold flex items-center justify-center gap-2 mb-4 sm:mb-5 transition-all shadow-lg ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/90'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Process Orders
            </button>
            <button
              type="button"
              disabled={bulkSubmitting}
              onClick={submitBulkOrdersNow}
              className={`w-full py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 mb-4 transition-all border ${
                isDark
                  ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50'
              }`}
            >
              {bulkSubmitting ? 'Submitting…' : 'Submit Bulk Orders Now'}
            </button>

            <div className={`rounded-xl sm:rounded-2xl p-4 sm:p-5 mb-4 ${isDark ? 'bg-white/5 border border-white/10' : 'bg-slate-100 border border-slate-200'}`}>
              <h3 className={`font-semibold mb-3 ${isDark ? 'text-white' : 'text-slate-900'}`}>System Status</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${isDark ? 'bg-white' : 'bg-slate-600'}`} />
                  <span className={isDark ? 'text-white/90' : 'text-slate-700'}>Text Input: Active</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${isDark ? 'bg-white' : 'bg-slate-600'}`} />
                  <span className={isDark ? 'text-white/90' : 'text-slate-700'}>Ordering: Enabled</span>
                </div>
              </div>
            </div>

            <div className={`rounded-xl sm:rounded-2xl overflow-hidden mb-5 ${isDark ? 'bg-white/5 border border-white/10' : 'bg-white border border-slate-200 shadow-sm'}`}>
              <div className="p-4 sm:p-5">
                <h3 className={`font-semibold mb-3 ${isDark ? 'text-white' : 'text-slate-900'}`}>Format Guide</h3>
                <div className={`rounded-lg p-3 mb-3 ${isDark ? 'bg-black/30 text-white/90' : 'bg-slate-100 text-slate-800'}`}>
                  <p className="text-sm font-medium mb-2">Valid Format:</p>
                  <div className="font-mono text-sm space-y-1">0535596955 5<br />0247654321 10</div>
                </div>
                <ul className={`text-sm space-y-1 list-disc list-inside ${isDark ? 'text-white/70' : 'text-slate-600'}`}>
                  <li>Each phone number is exactly 10 digits — any network, no country code.</li>
                  <li>Capacity must be a valid MTN bundle size (1, 2, 3, 4, 5, 6, 7, 8, 10, 15, 20, 25, 30, 40, 50).</li>
                </ul>
              </div>
            </div>
          </>
        ) : currentPage === 'afa-registration' ? (
          (() => {
            const fee = 14;
            const statusChip = (status) => {
              const s = (status || 'pending').toLowerCase();
              if (s === 'approved') return <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${isDark ? 'bg-emerald-500/20 text-emerald-200' : 'bg-emerald-100 text-emerald-800'}`}>approved</span>;
              if (s === 'rejected') return <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${isDark ? 'bg-red-500/20 text-red-200' : 'bg-red-100 text-red-800'}`}>rejected</span>;
              return <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${isDark ? 'bg-sky-500/20 text-sky-200' : 'bg-sky-100 text-sky-800'}`}>pending</span>;
            };
            const fmtDate = (iso) => {
              if (!iso) return '—';
              const t = Date.parse(iso);
              if (Number.isNaN(t)) return '—';
              return new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            };
            const pendingCount = afaApplications.filter((x) => (x.status || 'pending').toLowerCase() === 'pending').length;
            const approvedCount = afaApplications.filter((x) => (x.status || '').toLowerCase() === 'approved').length;
            return (
              <>
                <div className="pt-14 sm:pt-20 pb-4 sm:pb-5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <h1 className="page-title text-2xl sm:text-3xl truncate">AFA Registration</h1>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCurrentPage('dashboard')}
                    className={`flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0 transition-colors ${isDark ? 'text-white/80 hover:bg-white/10' : 'text-slate-700 hover:bg-slate-200'}`}
                    aria-label="Back to dashboard"
                  >
                    <Svg.ArrowLeft width={24} height={24} aria-hidden className="shrink-0" />
                  </button>
                </div>
                <div className={`rounded-xl sm:rounded-2xl p-4 sm:p-5 border mb-5 ${isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={`text-base font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>AFA Registration Fee</p>
                      <p className={`text-sm mt-1 ${isDark ? 'text-white/65' : 'text-slate-600'}`}>Available balance: ₵{walletBalance.toFixed(2)}</p>
                    </div>
                    <p className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>₵{fee.toFixed(2)}</p>
                  </div>
                  {walletBalance < fee && (
                    <div className={`mt-4 px-3 py-2.5 rounded-lg text-sm ${isDark ? 'bg-red-500/15 border border-red-500/30 text-red-200' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                      Insufficient balance. Please top up your wallet.
                    </div>
                  )}
                </div>
                {afaSuccess && <p className={`text-sm mb-4 ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>{afaSuccess}</p>}
                {afaError && <p className={`text-sm mb-4 ${isDark ? 'text-red-300' : 'text-red-700'}`}>{afaError}</p>}
                <button
                  type="button"
                  onClick={() => { setAfaError(null); setAfaSuccess(null); setAfaModalOpen(true); }}
                  className={`w-auto px-6 py-3.5 rounded-xl font-semibold inline-flex items-center justify-center gap-2 mb-5 transition-colors ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/90'}`}
                >
                  <Svg.Plus />
                  Register New AFA
                </button>
                <div className="grid grid-cols-3 gap-3 mb-5">
                  <div className={`rounded-xl p-4 border ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'}`}><p className={`text-xs ${isDark ? 'text-white/55' : 'text-slate-500'}`}>Total</p><p className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{afaApplications.length}</p></div>
                  <div className={`rounded-xl p-4 border ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'}`}><p className={`text-xs ${isDark ? 'text-white/55' : 'text-slate-500'}`}>Pending</p><p className={`text-2xl font-bold ${isDark ? 'text-sky-300' : 'text-sky-700'}`}>{pendingCount}</p></div>
                  <div className={`rounded-xl p-4 border ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'}`}><p className={`text-xs ${isDark ? 'text-white/55' : 'text-slate-500'}`}>Approved</p><p className={`text-2xl font-bold ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>{approvedCount}</p></div>
                </div>
                <div className={`rounded-xl border overflow-hidden ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'}`}>
                  <div className={`px-4 py-3 text-sm font-semibold ${isDark ? 'border-b border-white/10 text-white/80' : 'border-b border-slate-200 text-slate-700'}`}>My AFA applications</div>
                  {afaApplicationsLoading ? (
                    <div className={`px-4 py-10 text-sm text-center ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Loading…</div>
                  ) : afaApplications.length === 0 ? (
                    <div className={`px-4 py-10 text-sm text-center ${isDark ? 'text-white/50' : 'text-slate-500'}`}>No applications yet.</div>
                  ) : (
                    <div className={`divide-y ${isDark ? 'divide-white/10' : 'divide-slate-100'}`}>
                      {afaApplications.map((row) => (
                        <div key={row.id} className="px-4 py-3 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className={`font-medium truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{row.full_name || '—'}</p>
                            <p className={`text-xs ${isDark ? 'text-white/50' : 'text-slate-500'}`}>{row.phone || '—'} · {fmtDate(row.applied_at)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-semibold ${isDark ? 'text-white/70' : 'text-slate-600'}`}>₵{Number(row.payment_amount || 0).toFixed(2)}</span>
                            {statusChip(row.status)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {afaModalOpen && (
                  <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { if (!afaSubmitting) setAfaModalOpen(false); }} />
                    <div className={`relative w-full max-w-lg rounded-2xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto ${isDark ? 'bg-black border border-white/10' : 'bg-white border border-slate-200'}`}>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>Register New AFA Application</h3>
                        <button type="button" onClick={() => { if (!afaSubmitting) setAfaModalOpen(false); }} className={`text-sm ${isDark ? 'text-white/70' : 'text-slate-500'}`}>Close</button>
                      </div>
                      <div className="space-y-4">
                        {[
                          ['full_name', 'Full Name', 'Enter full name', 'text'],
                          ['phone', 'Phone Number', 'Enter phone number', 'tel'],
                          ['ghana_card_number', 'Ghana Card Number', 'GHA-XXXXXXXXX-X', 'text'],
                          ['occupation', 'Occupation', 'Enter occupation', 'text'],
                          ['date_of_birth', 'Date of Birth', '', 'date'],
                        ].map(([key, label, placeholder, type]) => (
                          <div key={key}>
                            <label className={`block text-sm font-medium mb-1.5 ${isDark ? 'text-white/80' : 'text-slate-700'}`}>{label}</label>
                            <input
                              type={type}
                              value={afaForm[key]}
                              onChange={(e) => setAfaForm((prev) => ({ ...prev, [key]: e.target.value }))}
                              placeholder={placeholder}
                              className={`w-full px-4 py-3 rounded-xl border ${isDark ? 'bg-white/5 border-white/15 text-white placeholder:text-white/40' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="mt-5 flex gap-3">
                        <button type="button" disabled={afaSubmitting} onClick={() => setAfaModalOpen(false)} className={`flex-1 py-3 rounded-xl font-semibold ${isDark ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-800'}`}>Cancel</button>
                        <button
                          type="button"
                          disabled={afaSubmitting}
                          onClick={async () => {
                            setAfaError(null);
                            setAfaSuccess(null);
                            setAfaSubmitting(true);
                            try {
                              const data = await api.createAfaApplication(afaForm);
                              setWalletBalance(Number(data?.balance ?? walletBalance));
                              setAfaApplications((prev) => [data.application, ...prev]);
                              setAfaModalOpen(false);
                              setAfaForm({ full_name: '', phone: '', ghana_card_number: '', occupation: '', date_of_birth: '' });
                              setAfaSuccess('Application submitted successfully and sent to admin.');
                              fetchWallet();
                            } catch (err) {
                              setAfaError(err?.message || 'Failed to submit application');
                            } finally {
                              setAfaSubmitting(false);
                            }
                          }}
                          className={`flex-1 py-3 rounded-xl font-semibold text-white ${walletBalance < fee ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                        >
                          {afaSubmitting ? 'Submitting…' : 'Register AFA'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            );
          })()
        ) : currentPage === 'store-dashboard' ? (
          <>
            <div className="pt-14 sm:pt-20 pb-3 flex items-center justify-end gap-4">
              <button
                type="button"
                onClick={() => {
                  setCurrentPage('dashboard');
                  setSelectedMenu('dashboard');
                }}
                className={`flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0 transition-colors ${
                  isDark ? 'text-white/80 hover:bg-white/10' : 'text-slate-700 hover:bg-slate-200'
                }`}
                aria-label="Back to dashboard"
              >
                <Svg.ArrowLeft width={24} height={24} aria-hidden className="shrink-0" />
              </button>
            </div>
            <div
              className={`w-full max-w-full min-w-0 space-y-6 pb-[max(6rem,env(safe-area-inset-bottom,0.5rem))] ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}
            >
              <div>
                <h1 className={`text-2xl sm:text-3xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Store
                </h1>
                <p className={`text-sm sm:text-base mt-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Manage your store settings, pricing, and customer communications
                </p>
              </div>
              <div
                className="flex gap-3 sm:gap-3.5 overflow-x-auto py-1.5 pb-2.5 -mx-1 px-2 snap-x snap-mandatory scrollbar-thin"
                style={{ WebkitOverflowScrolling: 'touch' }}
                role="tablist"
                aria-label="Store sections"
              >
                {['overview', 'pricing', 'earnings', 'services', 'settings'].map((id) => {
                  const label =
                    id === 'overview'
                      ? 'Overview'
                      : id === 'pricing'
                        ? 'Pricing'
                        : id === 'earnings'
                          ? 'Earnings'
                          : id === 'services'
                            ? 'Services'
                            : 'Settings';
                  const active = storeDashTab === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setStoreDashTab(id)}
                      className={`shrink-0 snap-start rounded-full px-5 py-2.5 text-sm font-medium transition-colors ${
                        active
                          ? isDark
                            ? 'bg-violet-500/20 text-violet-200 border border-violet-500/40'
                            : 'bg-violet-100 text-violet-900 border border-violet-200/90'
                          : isDark
                            ? 'bg-white/5 text-slate-400 border border-transparent hover:bg-white/10'
                            : 'bg-slate-100/80 text-slate-600 border border-transparent hover:bg-slate-200/80'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {storeDashTab === 'overview' ? (
                <div className="space-y-4 w-full min-w-0">
                  <div
                    className={`rounded-2xl p-4 sm:p-5 shadow-sm border text-left ${
                      isDark ? 'bg-zinc-900/80 border-white/10' : 'bg-white border-slate-200/90'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          isDark ? 'bg-white/10 text-violet-300' : 'bg-violet-50 text-violet-600'
                        }`}
                        aria-hidden
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" />
                          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                          <path d="M10 12h4" />
                          <path d="M12 12v9" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <h2 className={`text-base font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                          Store Status
                        </h2>
                        <p
                          className={`text-sm mt-2 flex flex-wrap items-center gap-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}
                        >
                          <span>Your store is currently</span>
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold text-white ${
                              storeAvailabilityOn ? 'bg-violet-600' : isDark ? 'bg-slate-500' : 'bg-slate-500'
                            }`}
                          >
                            {storeAvailabilityOn ? 'Online' : 'Hidden'}
                          </span>
                        </p>
                        <div className={`h-px my-4 ${isDark ? 'bg-white/10' : 'bg-slate-200'}`} />
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                              Store Availability
                            </p>
                            <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                              Toggle to make your store visible to customers
                            </p>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={storeAvailabilityOn}
                            onClick={() => setStoreAvailabilityOn((v) => !v)}
                            className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors ${
                              storeAvailabilityOn
                                ? 'bg-violet-600'
                                : isDark
                                  ? 'bg-slate-600'
                                  : 'bg-slate-300'
                            }`}
                          >
                            <span
                              className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                                storeAvailabilityOn ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div
                    className={`rounded-2xl p-4 sm:p-5 shadow-sm border text-left ${
                      isDark ? 'bg-zinc-900/80 border-white/10' : 'bg-white border-slate-200/90'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          isDark ? 'bg-white/10 text-violet-400' : 'bg-violet-50 text-violet-600'
                        }`}
                        aria-hidden
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                          <path d="m3.3 7.8 7.7 3.2a2 2 0 0 0 1.4 0l7.3-2.1" />
                          <path d="M12 22V12" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <h2 className={`text-base font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                          Active Packages
                        </h2>
                        <p className={`text-xs sm:text-sm mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          Packages available in your store
                        </p>
                        <p
                          className={`text-4xl sm:text-5xl font-bold tabular-nums mt-3 ${isDark ? 'text-white' : 'text-slate-900'}`}
                        >
                          {storeActivePackageCount}
                        </p>
                        <p className={`text-sm mt-1 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                          of {storeTotalPackageCount} total packages
                        </p>
                      </div>
                    </div>
                  </div>
              <div
                className={`rounded-2xl p-4 sm:p-5 shadow-sm border text-left ${
                  isDark ? 'bg-zinc-900/80 border-white/10' : 'bg-white border-slate-200/90'
                }`}
              >
                <h2 className={`text-base sm:text-lg font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Your Store Link
                </h2>
                <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Share this unique link with customers to access your store
                </p>
                  <div
                    className={`mt-4 flex items-stretch gap-0 rounded-xl border overflow-hidden ${
                      isDark ? 'bg-black/30 border-white/10' : 'bg-slate-100 border-slate-200'
                    }`}
                  >
                    <p
                      className={`flex-1 min-w-0 px-3 py-2.5 text-xs sm:text-sm break-all ${
                        isDark ? 'text-slate-200' : 'text-slate-800'
                      }`}
                    >
                      {fullStoreLinkUrl || '—'}
                    </p>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!fullStoreLinkUrl) return;
                        try {
                          await navigator.clipboard.writeText(fullStoreLinkUrl);
                        } catch {
                          try {
                            const ta = document.createElement('textarea');
                            ta.value = fullStoreLinkUrl;
                            document.body.appendChild(ta);
                            ta.select();
                            document.execCommand('copy');
                            document.body.removeChild(ta);
                          } catch {
                            /* ignore */
                          }
                        }
                      }}
                      className={`shrink-0 px-3 flex items-center justify-center border-l ${
                        isDark ? 'border-white/10 bg-white/5 hover:bg-white/10 text-violet-300' : 'border-slate-200 bg-white hover:bg-slate-50 text-violet-600'
                      }`}
                      title="Copy link"
                      aria-label="Copy store link"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <rect x="9" y="9" width="13" height="13" rx="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    </button>
                  </div>
                  {hasCustomStorePath && storePathSlugOverride ? (
                    <div
                      className={`mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl border px-3 py-2.5 ${
                        isDark ? 'border-emerald-500/30 bg-emerald-950/40' : 'border-emerald-200 bg-emerald-50'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 text-sm">
                        <svg
                          className={`shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          aria-hidden
                        >
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                        <span className={isDark ? 'text-emerald-200' : 'text-emerald-900'}>
                          Using custom URL: <span className="font-medium">/{storePathSlugOverride}</span>
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          applyStorePathOverride('');
                          setStoreLinkEditOpen(false);
                        }}
                        className={`shrink-0 self-start sm:self-center text-sm font-medium rounded-lg border px-3 py-1.5 transition-colors ${
                          isDark
                            ? 'border-amber-500/50 text-amber-300 hover:bg-amber-500/10'
                            : 'border-amber-200 text-amber-700 bg-white hover:bg-amber-50'
                        }`}
                      >
                        Reset to Default
                      </button>
                    </div>
                  ) : null}
                  <div className="mt-5 flex items-start justify-between gap-3">
                    <div>
                      <h3 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        Custom Store URL
                      </h3>
                      <p className={`text-xs mt-0.5 max-w-sm ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                        Create a memorable custom URL for your store
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (storeLinkEditOpen) {
                          setStorePathSlugDraft(effectiveStorePathSlug);
                          setStoreLinkEditOpen(false);
                        } else {
                          setStorePathSlugDraft(effectiveStorePathSlug);
                          setStoreLinkEditOpen(true);
                        }
                      }}
                      className={`shrink-0 text-sm font-medium rounded-lg border px-3 py-1.5 transition-colors ${
                        isDark
                          ? 'border-white/20 text-slate-200 hover:bg-white/10'
                          : 'border-slate-200 text-slate-700 bg-white hover:bg-slate-50'
                      }`}
                    >
                      {storeLinkEditOpen ? 'Done' : 'Edit'}
                    </button>
                  </div>
                  {storeLinkEditOpen ? (
                    <div className="mt-3 space-y-3">
                      <div>
                        <label
                          className={`block text-xs mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}
                          htmlFor="store-path-slug"
                        >
                          Path (letters, numbers, hyphens)
                        </label>
                        <div className="flex items-center gap-1 sm:gap-2 flex-wrap sm:flex-nowrap">
                          <span
                            className={`text-xs sm:text-sm shrink-0 max-w-[min(100%,12rem)] truncate ${
                              isDark ? 'text-slate-500' : 'text-slate-400'
                            }`}
                          >
                            {storePathInputPrefix}
                          </span>
                          <input
                            id="store-path-slug"
                            type="text"
                            value={storePathSlugDraft}
                            onChange={(e) => setStorePathSlugDraft(e.target.value)}
                            className={`flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm ${
                              isDark
                                ? 'bg-black/30 border-white/15 text-white placeholder:text-slate-600'
                                : 'bg-white border-slate-200 text-slate-900'
                            }`}
                            placeholder="your-store-name"
                            autoComplete="off"
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setStorePathSlugDraft(effectiveStorePathSlug);
                            setStoreLinkEditOpen(false);
                          }}
                          className={`text-sm font-medium rounded-lg border px-4 py-2 ${
                            isDark
                              ? 'border-white/15 text-slate-300 hover:bg-white/5'
                              : 'border-slate-200 text-slate-700 bg-white'
                          }`}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            applyStorePathOverride(storePathSlugDraft);
                            setStoreLinkEditOpen(false);
                          }}
                          className="text-sm font-medium rounded-lg px-4 py-2 bg-violet-600 text-white hover:bg-violet-500"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <div
                    className={`mt-6 border-t pt-4 space-y-3 ${
                      isDark ? 'border-white/10' : 'border-slate-200'
                    }`}
                  >
                    {storeLinkSettingsMessage ? (
                      <p
                        className={`text-sm text-center ${
                          isDark ? 'text-emerald-400' : 'text-emerald-600'
                        }`}
                        role="status"
                      >
                        {storeLinkSettingsMessage}
                      </p>
                    ) : null}
                    <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end sm:gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setStorePathSlugDraft(effectiveStorePathSlug);
                          setStoreLinkEditOpen(false);
                        }}
                        className={`w-full sm:w-auto rounded-xl border py-2.5 px-4 text-sm font-medium ${
                          isDark
                            ? 'border-white/20 text-slate-200 bg-white/5 hover:bg-white/10'
                            : 'border-slate-200 text-slate-800 bg-white hover:bg-slate-50'
                        }`}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (storeLinkEditOpen) {
                            applyStorePathOverride(storePathSlugDraft);
                            setStoreLinkEditOpen(false);
                          }
                          setStoreLinkSettingsMessage('Profile settings saved');
                          if (typeof window !== 'undefined') {
                            window.setTimeout(() => setStoreLinkSettingsMessage(null), 2800);
                          }
                          persistPublicStoreSnapshot();
                        }}
                        className="w-full sm:w-auto sm:min-w-[10rem] rounded-xl py-2.5 px-3 sm:px-4 text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 shadow-sm"
                      >
                        Save profile settings
                      </button>
                    </div>
                  </div>
                </div>
                </div>
              ) : storeDashTab === 'pricing' ? (
                <div className="w-full min-w-0 text-left space-y-4">
                  <div
                    className={`rounded-2xl p-4 sm:p-5 shadow-sm border ${
                      isDark ? 'bg-zinc-900/80 border-white/10' : 'bg-white border-slate-200/90'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden shrink-0 ${
                          isDark ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-800'
                        } ${storeDisplaySettings?.logoDataUrl ? 'ring-1 ' + (isDark ? 'ring-white/20' : 'ring-slate-200') : ''}`}
                      >
                        {storeDisplaySettings?.logoDataUrl ? (
                          <img
                            src={storeDisplaySettings.logoDataUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="flex items-center justify-center" aria-hidden>
                            <svg
                              width="22"
                              height="22"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                            </svg>
                          </span>
                        )}
                      </div>
                      <h2 className={`text-base sm:text-lg font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        Custom Pricing
                      </h2>
                    </div>
                    <p className={`text-sm mt-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                      Set your own prices for data bundles. A package must have a price set and be <strong>Active</strong> to
                      show on your public <code className="text-xs">/store</code> page; turn Active off to hide it (and its
                      price) from the preview.
                    </p>
                    <div
                      className={`mt-4 rounded-xl border p-3 sm:p-4 ${
                        isDark ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50/80'
                      }`}
                    >
                      <div className="flex gap-3">
                        <div className="shrink-0 pt-0.5" aria-hidden>
                          <svg width="20" height="20" className={isDark ? 'text-violet-300' : 'text-violet-600'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 3v6h6M21 12V5h-6" />
                            <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                            <path d="M3 12a9 9 0 0 0 15-6.7L21 16" />
                            <path d="M3 3l6 6" />
                            <path d="M12 3v3" />
                            <path d="M3 3h3" />
                          </svg>
                        </div>
                        <p className={`text-sm leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                          Set your price <strong className="text-violet-600 dark:text-violet-300">higher</strong> than the
                          base price to earn profit. <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Your profit = Your price − Base price.</span>
                        </p>
                      </div>
                    </div>
                    {storePricingSaveMessage ? (
                      <p
                        className={`text-sm mt-3 text-center ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}
                        role="status"
                      >
                        {storePricingSaveMessage}
                      </p>
                    ) : null}
                    <ul className="mt-4 space-y-0 rounded-xl border overflow-hidden divide-y list-none p-0 m-0" role="list">
                      {storePricingNetworkRows.map((row) => {
                        const open = storePricingOpenId === row.id;
                        const list = getPricingBundles(row.id);
                        return (
                          <li
                            key={row.id}
                            className={isDark ? 'divide-slate-700/60 border-slate-700/60' : 'divide-slate-200 border-slate-200'}
                          >
                            <button
                              type="button"
                              onClick={() => setStorePricingOpenId(open ? null : row.id)}
                              className={`w-full flex items-center gap-3 px-3 py-3.5 sm:px-4 text-left transition-colors ${
                                isDark
                                  ? 'bg-zinc-900/40 hover:bg-white/5'
                                  : 'bg-white hover:bg-slate-50/90'
                              }`}
                              aria-expanded={open}
                            >
                              <span
                                className={`shrink-0 w-9 h-7 rounded-md overflow-hidden border flex items-center justify-center p-0.5 ${
                                  isDark ? 'border-white/10 bg-zinc-900' : 'border-slate-200/90 bg-white'
                                }`}
                              >
                                <img
                                  src={networkBrandLogoUrl(row.id)}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              </span>
                              <span className={`flex-1 min-w-0 text-sm font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                {row.name}
                              </span>
                              <span className={`text-sm shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                {row.count} offer{row.count === 1 ? '' : 's'}
                              </span>
                              <span className="shrink-0 text-slate-400" aria-hidden>
                                <svg
                                  width="18"
                                  height="18"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  className={open ? 'rotate-180 transition-transform' : 'transition-transform'}
                                >
                                  <path d="M6 9l6 6 6-6" />
                                </svg>
                              </span>
                            </button>
                            {open && list.length > 0 ? (
                              <div
                                className={`px-2 sm:px-4 pb-4 -mt-0.5 ${
                                  isDark ? 'bg-zinc-950/50' : 'bg-slate-50/90'
                                }`}
                              >
                                <div
                                  className={`hidden sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_auto] gap-2 sm:items-end px-1 sm:px-0 pt-3 pb-1 border-b ${
                                    isDark ? 'border-white/10' : 'border-slate-200/90'
                                  }`}
                                >
                                  <span
                                    className={`text-[10px] sm:text-xs font-medium uppercase tracking-wide ${isDark ? 'text-slate-500' : 'text-slate-500'}`}
                                  >
                                    Size
                                  </span>
                                  <span
                                    className={`text-[10px] sm:text-xs font-medium uppercase tracking-wide ${isDark ? 'text-slate-500' : 'text-slate-500'}`}
                                  >
                                    Base price
                                  </span>
                                  <span
                                    className={`text-[10px] sm:text-xs font-medium uppercase tracking-wide ${isDark ? 'text-slate-500' : 'text-slate-500'}`}
                                  >
                                    Your price
                                  </span>
                                  <span
                                    className={`text-[10px] sm:text-xs font-medium uppercase tracking-wide sm:text-left ${isDark ? 'text-slate-500' : 'text-slate-500'}`}
                                  >
                                    Profit
                                  </span>
                                  <span
                                    className={`text-[10px] sm:text-xs font-medium uppercase tracking-wide text-right pr-0.5 min-w-[3.5rem] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}
                                  >
                                    Active
                                  </span>
                                </div>
                                {list.map((b, bidx) => {
                                  const k = storePricingBundleKey(row.id, b.size);
                                  const base = Number(b.price);
                                  const yourStr = storeCustomBundlePrices[k];
                                  const yourNum = yourStr != null && yourStr !== '' ? Number.parseFloat(String(yourStr), 10) : NaN;
                                  const hasValidYour = Number.isFinite(yourNum) && yourNum >= 0;
                                  const profit = hasValidYour ? yourNum - base : null;
                                  const showProfitGhs = hasValidYour && Number.isFinite(profit);
                                  const activeOn = storeCustomBundleActive[k] !== false;
                                  return (
                                    <div
                                      key={`${row.id}-${bidx}-${b.size}`}
                                      className={`grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_auto] gap-3 sm:gap-2 items-start sm:items-center py-3 sm:py-2.5 border-b last:border-0 ${
                                        isDark ? 'border-white/10' : 'border-slate-200/90'
                                      }`}
                                    >
                                      <div>
                                        <p
                                          className={`sm:hidden text-[10px] font-medium uppercase tracking-wide mb-0.5 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}
                                        >
                                          Size
                                        </p>
                                        <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                          {b.size}
                                        </p>
                                      </div>
                                      <div>
                                        <p
                                          className={`sm:hidden text-[10px] font-medium uppercase tracking-wide mb-0.5 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}
                                        >
                                          Base price
                                        </p>
                                        <p className={`text-sm font-medium tabular-nums ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                                          ¢{base.toFixed(2)}
                                        </p>
                                      </div>
                                      <div className="min-w-0">
                                        <p
                                          className={`sm:hidden text-[10px] font-medium uppercase tracking-wide mb-0.5 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}
                                        >
                                          Your price
                                        </p>
                                        <input
                                          id={`pr-${k}`}
                                          type="number"
                                          inputMode="decimal"
                                          min="0"
                                          step="0.01"
                                          placeholder="Set price"
                                          value={storeCustomBundlePrices[k] ?? ''}
                                          onChange={(e) => {
                                            const v = e.target.value;
                                            setStoreCustomBundlePrices((prev) => ({ ...prev, [k]: v }));
                                          }}
                                          className={`w-full min-w-0 rounded-lg border px-2.5 py-2 text-sm ${
                                            isDark
                                              ? 'bg-black/30 border-white/15 text-white placeholder:text-slate-500'
                                              : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'
                                          }`}
                                        />
                                      </div>
                                      <div className="min-w-0 sm:flex sm:items-center sm:pl-0">
                                        <p
                                          className={`sm:hidden text-[10px] font-medium uppercase tracking-wide mb-0.5 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}
                                        >
                                          Profit
                                        </p>
                                        {showProfitGhs ? (
                                          <p
                                            className={`text-sm font-medium tabular-nums ${
                                              profit != null && profit >= 0
                                                ? isDark
                                                  ? 'text-emerald-400'
                                                  : 'text-emerald-600'
                                                : isDark
                                                  ? 'text-amber-400'
                                                  : 'text-amber-600'
                                            }`}
                                          >
                                            GHS {profit != null ? profit.toFixed(2) : '—'}
                                          </p>
                                        ) : (
                                          <span className={`text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`} aria-hidden>
                                            -
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center justify-between sm:justify-center sm:pl-0 gap-2 sm:w-[3.5rem]">
                                        <p
                                          className={`sm:hidden text-[10px] font-medium uppercase tracking-wide ${isDark ? 'text-slate-500' : 'text-slate-500'}`}
                                        >
                                          Active
                                        </p>
                                        <button
                                          type="button"
                                          role="switch"
                                          aria-checked={activeOn}
                                          aria-label={activeOn ? 'Active in store' : 'Hidden from store'}
                                          onClick={() =>
                                            setStoreCustomBundleActive((prev) => {
                                              const on = prev[k] !== false;
                                              return { ...prev, [k]: !on };
                                            })
                                          }
                                          className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center sm:ml-auto rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:ring-offset-0 ${
                                            activeOn ? 'bg-violet-600' : isDark ? 'bg-slate-600' : 'bg-slate-300'
                                          }`}
                                        >
                                          <span
                                            className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow transition ease-out ${
                                              activeOn ? 'translate-x-[22px]' : 'translate-x-0.5'
                                            }`}
                                            aria-hidden
                                          />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                                <div className="pt-3 flex justify-end">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      try {
                                        localStorage.setItem('dataplus_store_custom_bundle_prices', JSON.stringify(storeCustomBundlePrices));
                                        localStorage.setItem('dataplus_store_custom_bundle_active', JSON.stringify(storeCustomBundleActive));
                                      } catch {
                                        // ignore
                                      }
                                      persistPublicStoreSnapshot();
                                      setStorePricingSaveMessage('Custom prices and active settings saved for this device.');
                                      if (typeof window !== 'undefined') {
                                        window.setTimeout(() => setStorePricingSaveMessage(null), 3000);
                                      }
                                    }}
                                    className="text-sm font-medium rounded-lg px-4 py-2 bg-violet-600 text-white hover:bg-violet-500"
                                  >
                                    Save prices
                                  </button>
                                </div>
                              </div>
                            ) : null}
                            {open && list.length === 0 ? (
                              <p className={`px-3 pb-3 text-sm ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                                No offers loaded for this network.
                              </p>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                    <p className={`text-xs mt-3 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                      Base price is read-only; your price and profit update the public store. Inactive packages are hidden
                      on your /store preview. Changes save here and sync to the server when you are signed in.
                    </p>
                  </div>
                </div>
              ) : storeDashTab === 'earnings' ? (
                <div className="w-full min-w-0 text-left space-y-4">
                  {storeEarningsActionMsg ? (
                    <p className={`text-sm text-center ${isDark ? 'text-violet-300' : 'text-violet-700'}`} role="status">
                      {storeEarningsActionMsg}
                    </p>
                  ) : null}
                  {storeEarningsError ? (
                    <p className={`text-sm rounded-xl border px-3 py-2 ${isDark ? 'border-amber-800/50 bg-amber-950/30 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-900'}`} role="status">
                      {storeEarningsError}
                    </p>
                  ) : null}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="min-w-0">
                      <label
                        className={`sr-only`}
                        htmlFor="store-earnings-period"
                      >
                        Earnings period
                      </label>
                      <div className="relative">
                        <select
                          id="store-earnings-period"
                          value={storeEarningsPeriod}
                          onChange={(e) => setStoreEarningsPeriod(e.target.value)}
                          className={`appearance-none w-full sm:w-56 rounded-xl border py-2.5 pl-3 pr-9 text-sm font-medium cursor-pointer ${
                            isDark
                              ? 'bg-zinc-900/80 border-white/15 text-white'
                              : 'bg-white border-slate-200 text-slate-900'
                          }`}
                        >
                          <option value="today">Today</option>
                          <option value="this-week">This week</option>
                          <option value="this-month">This month</option>
                          <option value="last-month">Last month</option>
                        </select>
                        <span
                          className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}
                          aria-hidden
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:justify-end">
                      {storeEarningsRefreshHint ? (
                        <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>Updated</span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          setStoreEarningsRefreshHint(true);
                          fetchWallet();
                          loadStoreEarnings();
                          if (typeof window !== 'undefined') {
                            window.setTimeout(() => setStoreEarningsRefreshHint(false), 2000);
                          }
                        }}
                        className={`inline-flex items-center justify-center gap-2 rounded-xl border py-2.5 px-4 text-sm font-medium ${
                          isDark
                            ? 'border-white/20 text-slate-200 bg-zinc-900/80 hover:bg-zinc-800/80'
                            : 'border-slate-200 text-slate-800 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                          <path d="M21 3v5h-5" />
                          <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                          <path d="M8 16H3v5" />
                        </svg>
                        Refresh
                      </button>
                    </div>
                  </div>
                  {(() => {
                    const ghs = (n) => {
                      const v = Number(n);
                      return `GHS ${(Number.isFinite(v) ? v : 0).toFixed(2)}`;
                    };
                    const showAmt = (n) => (storeEarningsLoading && !storeEarningsData ? '—' : ghs(n));
                    const periodLabel =
                      storeEarningsPeriod === 'today'
                        ? 'Today'
                        : storeEarningsPeriod === 'this-week'
                          ? 'Last 7 days'
                          : storeEarningsPeriod === 'last-month'
                            ? 'Last month'
                            : 'This month';
                    const d = storeEarningsData;
                    const withdrawable = d && Number.isFinite(Number(d.withdrawableGhs)) ? Number(d.withdrawableGhs) : dashboardBalance;
                    const revP = d && Number.isFinite(Number(d.revenueInPeriodGhs)) ? Number(d.revenueInPeriodGhs) : 0;
                    const profP = d && Number.isFinite(Number(d.periodProfitGhs)) ? Number(d.periodProfitGhs) : 0;
                    const pending = d && Number.isFinite(Number(d.profitPendingGhs)) ? Number(d.profitPendingGhs) : 0;
                    const totRev = d && Number.isFinite(Number(d.totalRevenueGhs)) ? Number(d.totalRevenueGhs) : 0;
                    const totProf = d && Number.isFinite(Number(d.totalProfitGhs)) ? Number(d.totalProfitGhs) : 0;
                    const totWd = d && Number.isFinite(Number(d.totalWithdrawnGhs)) ? Number(d.totalWithdrawnGhs) : 0;
                    const wds = Array.isArray(d?.withdrawals) ? d.withdrawals : [];
                    const EarningCard = ({ icon, amount, label, sub }) => (
                      <div
                        className={`rounded-2xl border p-4 ${
                          isDark
                            ? 'bg-violet-950/20 border-violet-800/50'
                            : 'bg-violet-100/50 border-violet-200/70'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                              isDark ? 'bg-violet-900/50 text-violet-300' : 'bg-violet-100 text-violet-700'
                            }`}
                            aria-hidden
                          >
                            {icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p
                              className={`text-lg sm:text-xl font-bold tabular-nums ${
                                isDark ? 'text-white' : 'text-slate-900'
                              }`}
                            >
                              {amount}
                            </p>
                            <p
                              className={`text-sm mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}
                            >
                              {label}
                            </p>
                            {sub ? (
                              <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>{sub}</p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                    return (
                      <div className="space-y-3">
                        {storeEarningsLoading && !storeEarningsData ? (
                          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Loading earnings from the server…</p>
                        ) : null}
                        <EarningCard
                          icon={
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 12V7H5a2 2 0 0 1 0-4h14" />
                              <path d="M3 5v14a2 2 0 0 0 2 2h16" />
                              <path d="M3 5l5 2v10" />
                            </svg>
                          }
                          amount={showAmt(dashboardBalance)}
                          label="Available balance"
                          sub="From your wallet on the API"
                        />
                        <EarningCard
                          icon={
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="9" />
                              <path d="M12 6v6l3 2" />
                            </svg>
                          }
                          amount={showAmt(withdrawable)}
                          label="Withdrawable now"
                          sub="Same as available until payout rules apply"
                        />
                        <div
                          className={`rounded-2xl border p-4 ${
                            isDark
                              ? 'bg-violet-950/20 border-violet-800/50'
                              : 'bg-violet-100/50 border-violet-200/70'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                isDark ? 'bg-violet-900/50 text-violet-300' : 'bg-violet-100 text-violet-700'
                              }`}
                              aria-hidden
                            >
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 3v6h6" />
                                <path d="M21 12V9a3 3 0 0 0-3-3h-1" />
                                <path d="M7 18l4-4" />
                                <path d="M3 12a9 9 0 0 0 9 9" />
                              </svg>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                {'Period sales & profit'}
                              </p>
                              <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>{periodLabel}</p>
                              <div className="mt-2 grid grid-cols-2 gap-3">
                                <div>
                                  <p
                                    className={`text-lg sm:text-xl font-bold tabular-nums ${
                                      isDark ? 'text-white' : 'text-slate-900'
                                    }`}
                                  >
                                    {showAmt(revP)}
                                  </p>
                                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Customer spend (completed)</p>
                                </div>
                                <div>
                                  <p
                                    className={`text-lg sm:text-xl font-bold tabular-nums ${
                                      isDark ? 'text-white' : 'text-slate-900'
                                    }`}
                                  >
                                    {showAmt(profP)}
                                  </p>
                                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Your profit (completed)</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        <EarningCard
                          icon={
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="2" y="6" width="20" height="12" rx="2" />
                              <path d="M2 10h20" />
                              <path d="M6 14h.01" />
                            </svg>
                          }
                          amount={showAmt(pending)}
                          label="Pending profit"
                          sub="Store orders not completed or cancelled yet"
                        />
                        <EarningCard
                          icon={
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M3 3v6h6" />
                              <path d="M3 12a9 9 0 0 0 9 9" />
                            </svg>
                          }
                          amount={showAmt(totRev)}
                          label="Total store revenue (all time)"
                        />
                        <EarningCard
                          icon={
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="2" y="6" width="20" height="12" rx="2" />
                              <path d="M2 10h20" />
                            </svg>
                          }
                          amount={showAmt(totProf)}
                          label="Total store profit (all time)"
                        />
                        <EarningCard
                          icon={
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M22 2L11 13" />
                              <path d="M22 2l-7 20-4-9-9-4 20-7z" />
                            </svg>
                          }
                          amount={showAmt(totWd)}
                          label="Total withdrawn"
                          sub="Payout and withdrawal transactions on the API"
                        />
                        {totRev === 0 && !storeEarningsLoading && d ? (
                          <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                            No store sales in your server ledger yet. When public checkout records orders for your store, sales
                            and profit will appear here.
                          </p>
                        ) : null}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setStoreEarningsActionMsg('Transfer from store earnings to wallet will be available when payouts are enabled on the API.');
                              if (typeof window !== 'undefined') {
                                window.setTimeout(() => setStoreEarningsActionMsg(null), 3500);
                              }
                            }}
                            className={`inline-flex items-center justify-center gap-2 rounded-xl border py-3 px-4 text-sm font-medium ${
                              isDark
                                ? 'border-white/15 text-slate-200 bg-zinc-900/60 hover:bg-zinc-800/80'
                                : 'border-slate-200 text-slate-800 bg-slate-100/90 hover:bg-slate-200/80'
                            }`}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                              <path d="M7 7h10l-4 4" />
                              <path d="M7 17h10" />
                            </svg>
                            Transfer to wallet
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setStoreEarningsActionMsg('Withdrawal requests will be available when store payouts are enabled on the API.');
                              if (typeof window !== 'undefined') {
                                window.setTimeout(() => setStoreEarningsActionMsg(null), 3500);
                              }
                            }}
                            className="inline-flex items-center justify-center gap-2 rounded-xl py-3 px-4 text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 shadow-sm"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M22 2L11 13" />
                              <path d="M22 2l-7 20-4-9-9-4 20-7z" />
                            </svg>
                            Request withdrawal
                          </button>
                        </div>
                        <div
                          className={`rounded-2xl border p-4 ${
                            isDark ? 'bg-zinc-900/50 border-white/10' : 'bg-white border-slate-200/90'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                isDark ? 'bg-violet-900/40 text-violet-300' : 'bg-violet-100 text-violet-700'
                              }`}
                              aria-hidden
                            >
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <path d="M12 8v4" />
                                <path d="M12 16h.01" />
                              </svg>
                            </div>
                            <div className="min-w-0">
                              <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                Withdrawal policy
                              </p>
                              <p
                                className={`text-sm mt-2 leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}
                              >
                                Earnings and balances are loaded from the same API as your wallet. Store revenue and profit
                                rows are recorded when a customer purchase is attributed to your store on the server. Profits
                                stay pending while those orders are not completed; cancelled or failed orders do not add to
                                settled profit.
                              </p>
                            </div>
                          </div>
                        </div>
                        <div
                          className={`rounded-2xl border p-4 ${
                            isDark ? 'bg-zinc-900/50 border-white/10' : 'bg-white border-slate-200/90'
                          }`}
                        >
                          <h3 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            Withdrawal history
                          </h3>
                          <p
                            className={`text-xs mt-1 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}
                          >
                            Payout and withdrawal entries from the API
                          </p>
                          {wds.length === 0 ? (
                            <p
                              className={`text-sm text-center py-10 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}
                            >
                              No withdrawal or payout entries yet
                            </p>
                          ) : (
                            <ul className="mt-3 space-y-2 list-none p-0 m-0" role="list">
                              {wds.map((w) => {
                                const when = w.created_at
                                  ? new Date(String(w.created_at).replace(' ', 'T'))
                                  : null;
                                const whenStr =
                                  when && !Number.isNaN(when.getTime())
                                    ? when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                                    : '—';
                                const abs = Math.abs(Number(w.amount) || 0);
                                return (
                                  <li
                                    key={w.id}
                                    className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 rounded-lg border px-3 py-2 text-sm ${
                                      isDark ? 'border-white/10 bg-zinc-950/40' : 'border-slate-200/90 bg-slate-50/80'
                                    }`}
                                  >
                                    <div className="min-w-0">
                                      <p className={isDark ? 'text-slate-200' : 'text-slate-800'}>
                                        {w.description || w.type || 'Payout'}
                                      </p>
                                      <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>{whenStr}</p>
                                    </div>
                                    <p className={`font-semibold tabular-nums shrink-0 ${isDark ? 'text-amber-200' : 'text-amber-800'}`}>
                                      {ghs(abs)}
                                    </p>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : storeDashTab === 'services' ? (
                <div className="w-full min-w-0 text-left space-y-4">
                  {storeServicesPanelMessage ? (
                    <p
                      className={`text-sm text-center ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}
                      role="status"
                    >
                      {storeServicesPanelMessage}
                    </p>
                  ) : null}
                  <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                    When you are signed in, service options sync to the server (automatically after you stop editing, or
                    immediately when you save).
                  </p>
                  {(() => {
                    const afaP = Number.parseFloat(String(storeServiceSettings.afaPrice), 10);
                    const afaProfit = Number.isFinite(afaP) ? afaP - AFA_REG_BASE_GHS : null;
                    const afaOn = storeServiceSettings.afaEnabled;
                    const vouchOn = storeServiceSettings.vouchersEnabled;
                    return (
                      <div className="space-y-4">
                        <div
                          className={`rounded-2xl border p-4 sm:p-5 ${
                            isDark ? 'bg-zinc-900/80 border-white/10' : 'bg-white border-slate-200/90'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                  isDark ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-800'
                                }`}
                                aria-hidden
                              >
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M16 18a4 4 0 0 0-8 0" />
                                  <circle cx="12" cy="8" r="3" />
                                  <line x1="20" y1="8" x2="20" y2="14" />
                                  <line x1="17" y1="11" x2="23" y2="11" />
                                </svg>
                              </div>
                              <h3 className={`text-base font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                AFA registration
                              </h3>
                            </div>
                            <span
                              className={`inline-flex items-center gap-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] sm:text-xs font-semibold ${
                                isDark ? 'bg-emerald-900/45 text-emerald-300' : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                                <path d="M20 6L9 17l-5-5" />
                              </svg>
                              Available
                            </span>
                          </div>
                          <p
                            className={`text-sm mt-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}
                          >
                            Allow customers to register for the MTN AFA bundle plan through your store
                          </p>
                          <div
                            className={`mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-2 border-b ${
                              isDark ? 'border-white/10' : 'border-slate-200/90'
                            }`}
                          >
                            <div>
                              <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                Enable AFA registration
                              </p>
                              <p
                                className={`text-xs mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}
                              >
                                Show AFA registration on your storefront
                              </p>
                            </div>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={afaOn}
                              onClick={() =>
                                setStoreServiceSettings((s) => ({ ...s, afaEnabled: !s.afaEnabled }))
                              }
                              className={`relative self-end sm:self-center inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500/50 ${
                                afaOn ? 'bg-violet-600' : isDark ? 'bg-slate-600' : 'bg-slate-300'
                              }`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow transition ${
                                  afaOn ? 'translate-x-[22px]' : 'translate-x-0.5'
                                }`}
                                aria-hidden
                              />
                            </button>
                          </div>
                          <div className="mt-4">
                            <p className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5 text-sm">
                              <span
                                className={`font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}
                              >
                                Custom price (GHS)
                              </span>
                              <span className={isDark ? 'text-slate-500' : 'text-slate-500'}>
                                — Base: GHS {AFA_REG_BASE_GHS.toFixed(2)}
                              </span>
                            </p>
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.01"
                              value={storeServiceSettings.afaPrice}
                              onChange={(e) =>
                                setStoreServiceSettings((s) => ({ ...s, afaPrice: e.target.value }))
                              }
                              className={`mt-2 w-full max-w-md rounded-lg border px-2.5 py-2 text-sm ${
                                isDark
                                  ? 'bg-black/30 border-white/15 text-white'
                                  : 'bg-white border-slate-200 text-slate-900'
                              }`}
                            />
                            {afaProfit != null && Number.isFinite(afaProfit) ? (
                              <p
                                className={`text-sm mt-2 font-medium ${
                                  afaProfit >= 0
                                    ? isDark
                                      ? 'text-emerald-400'
                                      : 'text-emerald-600'
                                    : isDark
                                      ? 'text-amber-400'
                                      : 'text-amber-600'
                                }`}
                              >
                                Your profit per registration: GHS {afaProfit.toFixed(2)}
                              </p>
                            ) : null}
                          </div>
                          <div className="mt-4">
                            <label
                              className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}
                              htmlFor="store-afa-desc"
                            >
                              Description (optional)
                            </label>
                            <textarea
                              id="store-afa-desc"
                              value={storeServiceSettings.afaDescription}
                              onChange={(e) =>
                                setStoreServiceSettings((s) => ({
                                  ...s,
                                  afaDescription: e.target.value.slice(0, 255),
                                }))
                              }
                              maxLength={255}
                              rows={3}
                              className={`mt-1.5 w-full rounded-lg border px-2.5 py-2 text-sm resize-y min-h-[4.5rem] ${
                                isDark
                                  ? 'bg-black/30 border-white/15 text-white placeholder:text-slate-500'
                                  : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'
                              }`}
                              placeholder="Describe this service to customers"
                            />
                            <p
                              className={`text-xs mt-1.5 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}
                            >
                              Shown on your storefront. Max 255 characters.
                            </p>
                          </div>
                        </div>
                        <div
                          className={`rounded-2xl border p-4 sm:p-5 ${
                            isDark ? 'bg-zinc-900/80 border-white/10' : 'bg-white border-slate-200/90'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                  isDark ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-800'
                                }`}
                                aria-hidden
                              >
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v.5a1 1 0 0 0 0 2v1a1 1 0 0 0 0 2V16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1.5a1 1 0 0 0 0-2V10a1 1 0 0 0 0-2V7Z" />
                                </svg>
                              </div>
                              <h3 className={`text-base font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                Vouchers
                              </h3>
                            </div>
                            <span
                              className={`inline-flex items-center gap-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] sm:text-xs font-semibold ${
                                isDark ? 'bg-emerald-900/45 text-emerald-300' : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                                <path d="M20 6L9 17l-5-5" />
                              </svg>
                              2 type(s) available
                            </span>
                          </div>
                          <p
                            className={`text-sm mt-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}
                          >
                            Allow customers to purchase exam vouchers, e-pins, and other voucher types through your store
                          </p>
                          <div
                            className={`mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-0`}
                          >
                            <div>
                              <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                Enable voucher sales
                              </p>
                              <p
                                className={`text-xs mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}
                              >
                                Show the vouchers section on your storefront
                              </p>
                            </div>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={vouchOn}
                              onClick={() =>
                                setStoreServiceSettings((s) => ({ ...s, vouchersEnabled: !s.vouchersEnabled }))
                              }
                              className={`relative self-end sm:self-center inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500/50 ${
                                vouchOn ? 'bg-violet-600' : isDark ? 'bg-slate-600' : 'bg-slate-300'
                              }`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow transition ${
                                  vouchOn ? 'translate-x-[22px]' : 'translate-x-0.5'
                                }`}
                                aria-hidden
                              />
                            </button>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            try {
                              localStorage.setItem('dataplus_store_services_v1', JSON.stringify(storeServiceSettings));
                            } catch {
                              // ignore
                            }
                            persistPublicStoreSnapshot();
                            if (isSignedIn && api.getToken()) {
                              flushStoreToApi();
                              setStoreServicesPanelMessage('Service settings saved and synced to the server.');
                            } else {
                              setStoreServicesPanelMessage('Service settings saved on this device. Sign in to sync to the server.');
                            }
                            if (typeof window !== 'undefined') {
                              window.setTimeout(() => setStoreServicesPanelMessage(null), 3200);
                            }
                          }}
                          className="w-full rounded-xl py-3 px-4 text-sm font-semibold bg-violet-600 text-white hover:bg-violet-500 shadow-sm"
                        >
                          Save services settings
                        </button>
                        <div
                          className={`pt-1 border-t space-y-3 ${
                            isDark ? 'border-white/10' : 'border-slate-200'
                          }`}
                        >
                          <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end sm:gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                setStoreServiceSettings(loadStoreServiceSettings());
                                setStoreServicesPanelMessage('Restored to last saved.');
                                if (typeof window !== 'undefined') {
                                  window.setTimeout(() => setStoreServicesPanelMessage(null), 2200);
                                }
                              }}
                              className={`w-full sm:w-auto rounded-xl border py-2.5 px-4 text-sm font-medium ${
                                isDark
                                  ? 'border-white/20 text-slate-200 bg-white/5 hover:bg-white/10'
                                  : 'border-slate-200 text-slate-800 bg-white hover:bg-slate-50'
                              }`}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (storeLinkEditOpen) {
                                  applyStorePathOverride(storePathSlugDraft);
                                  setStoreLinkEditOpen(false);
                                }
                                setStoreLinkSettingsMessage('Profile settings saved');
                                if (typeof window !== 'undefined') {
                                  window.setTimeout(() => setStoreLinkSettingsMessage(null), 2800);
                                }
                                setStoreServicesPanelMessage('Profile link saved. Use Overview to edit your public store URL any time.');
                                if (typeof window !== 'undefined') {
                                  window.setTimeout(() => setStoreServicesPanelMessage(null), 3200);
                                }
                                persistPublicStoreSnapshot();
                              }}
                              className="w-full sm:w-auto sm:min-w-[10rem] rounded-xl py-2.5 px-3 sm:px-4 text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 shadow-sm"
                            >
                              Save profile settings
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="w-full min-w-0 text-left space-y-4">
                  {storeSettingsMessage ? (
                    <p
                      className={`text-sm text-center ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}
                      role="status"
                    >
                      {storeSettingsMessage}
                    </p>
                  ) : null}
                  <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                    When you are signed in, storefront and payment options sync to the server (automatically after you
                    stop editing, or immediately when you save).
                  </p>
                  <input
                    ref={storeLogoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="sr-only"
                    onChange={(e) => {
                      setStoreLogoError(null);
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (!f) return;
                      if (f.size > MAX_STORE_LOGO_BYTES) {
                        setStoreLogoError('File must be 2MB or smaller.');
                        return;
                      }
                      const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
                      if (!ok.includes(f.type)) {
                        setStoreLogoError('Use JPEG, PNG, WebP, or GIF.');
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => {
                        if (typeof reader.result === 'string') {
                          setStoreDisplaySettings((s) => ({ ...s, logoDataUrl: reader.result }));
                        }
                      };
                      reader.readAsDataURL(f);
                    }}
                    aria-label="Upload store logo"
                  />
                  <div
                    className={`rounded-2xl border p-4 sm:p-5 ${
                      isDark ? 'bg-zinc-900/80 border-white/10' : 'bg-white border-slate-200/90'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          isDark ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-800'
                        }`}
                        aria-hidden
                      >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M4 20h16" />
                          <path d="M4 4v4l3.5-3" />
                          <rect x="8" y="10" width="8" height="6" rx="0.5" />
                        </svg>
                      </div>
                      <h2 className={`text-base sm:text-lg font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        Store logo
                      </h2>
                    </div>
                    <p className={`text-sm mt-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                      Upload a logo for your store (max 2MB, JPEG/PNG/WebP/GIF)
                    </p>
                    {storeLogoError ? (
                      <p className="text-sm mt-2 text-amber-600 dark:text-amber-400" role="alert">
                        {storeLogoError}
                      </p>
                    ) : null}
                    <div
                      className={`mt-4 rounded-xl border-2 border-dashed flex flex-col items-center justify-center p-4 min-h-[140px] ${
                        isDark ? 'border-white/20 bg-white/5' : 'border-slate-200 bg-slate-50/80'
                      }`}
                    >
                      {storeDisplaySettings.logoDataUrl ? (
                        <img
                          src={storeDisplaySettings.logoDataUrl}
                          alt="Store logo preview"
                          className="max-h-32 max-w-full object-contain rounded-lg"
                        />
                      ) : (
                        <div className="text-slate-400" aria-hidden>
                          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" />
                            <path d="M9 22V12h6v10" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => storeLogoInputRef.current?.click()}
                        className={`inline-flex items-center gap-2 rounded-xl border py-2 px-4 text-sm font-medium ${
                          isDark
                            ? 'border-white/20 text-slate-200 bg-white/5 hover:bg-white/10'
                            : 'border-slate-200 text-slate-800 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path d="M4 4v4l3.5-3" />
                          <path d="M4 4h4" />
                        </svg>
                        Upload logo
                      </button>
                      {storeDisplaySettings.logoDataUrl ? (
                        <button
                          type="button"
                          onClick={() => {
                            setStoreDisplaySettings((s) => ({ ...s, logoDataUrl: null }));
                            setStoreLogoError(null);
                          }}
                          className={`text-sm font-medium py-2 px-2 ${
                            isDark ? 'text-rose-400 hover:text-rose-300' : 'text-rose-600 hover:text-rose-700'
                          }`}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                    <p className={`text-xs mt-2 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                      Recommended: square image, at least 200×200 pixels
                    </p>
                  </div>
                  <div
                    className={`rounded-2xl border p-4 sm:p-5 ${
                      isDark ? 'bg-zinc-900/80 border-white/10' : 'bg-white border-slate-200/90'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          isDark ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-800'
                        }`}
                        aria-hidden
                      >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="6" cy="7" r="2" />
                          <path d="M2 20l4-8M10 6l-2-2" />
                          <path d="M8 4l-2-2" />
                        </svg>
                      </div>
                      <h2 className={`text-base sm:text-lg font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        Store theme
                      </h2>
                    </div>
                    <p className={`text-sm mt-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                      Choose a card style for your package listings
                    </p>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {STORE_THEME_OPTIONS.map((opt) => {
                        const sel = storeDisplaySettings.theme === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setStoreDisplaySettings((s) => ({ ...s, theme: opt.id }))}
                            className={`relative rounded-xl border-2 p-3 text-left transition ${
                              sel
                                ? 'border-violet-500 ring-1 ring-violet-500/30'
                                : isDark
                                  ? 'border-white/10 hover:border-white/20'
                                  : 'border-slate-200 hover:border-slate-300'
                            } ${isDark ? (sel ? 'bg-violet-950/30' : 'bg-zinc-900/40') : sel ? 'bg-violet-50/50' : 'bg-white'}`}
                          >
                            {sel ? (
                              <span
                                className="absolute top-2 right-2 w-5 h-5 rounded-full bg-violet-600 flex items-center justify-center"
                                aria-hidden
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                                  <path d="M20 6L9 17l-5-5" />
                                </svg>
                              </span>
                            ) : null}
                            <p
                              className={`text-sm font-semibold pr-6 ${isDark ? 'text-white' : 'text-slate-900'}`}
                            >
                              {opt.label}
                            </p>
                            <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>{opt.desc}</p>
                          </button>
                        );
                      })}
                    </div>
                    <p
                      className={`text-xs mt-3 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}
                    >
                      Network colors (MTN yellow, Telecel grey, Big Time blue, Ishare violet) are applied automatically
                      for each package provider in your store theme.
                    </p>
                  </div>
                  <div
                    className={`rounded-2xl border p-4 sm:p-5 ${
                      isDark ? 'bg-zinc-900/80 border-white/10' : 'bg-white border-slate-200/90'
                    }`}
                  >
                    <h2 className={`text-base sm:text-lg font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      Store information
                    </h2>
                    <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                      Update your store name and description
                    </p>
                    <div className="mt-4 space-y-4">
                      <div>
                        <label
                          className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}
                          htmlFor="store-settings-name"
                        >
                          Store name
                        </label>
                        <input
                          id="store-settings-name"
                          type="text"
                          value={storeDisplaySettings.storeName}
                          maxLength={100}
                          onChange={(e) =>
                            setStoreDisplaySettings((s) => ({ ...s, storeName: e.target.value.slice(0, 100) }))
                          }
                          className={`mt-1.5 w-full rounded-lg border px-2.5 py-2 text-sm ${
                            isDark
                              ? 'bg-black/30 border-white/15 text-white'
                              : 'bg-white border-slate-200 text-slate-900'
                          }`}
                        />
                        <p className={`text-xs mt-1 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                          {storeDisplaySettings.storeName.length}/100 characters
                        </p>
                      </div>
                      <div>
                        <label
                          className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}
                          htmlFor="store-settings-desc"
                        >
                          Store description
                        </label>
                        <textarea
                          id="store-settings-desc"
                          value={storeDisplaySettings.storeDescription}
                          onChange={(e) =>
                            setStoreDisplaySettings((s) => ({
                              ...s,
                              storeDescription: e.target.value.slice(0, 500),
                            }))
                          }
                          maxLength={500}
                          rows={4}
                          className={`mt-1.5 w-full rounded-lg border px-2.5 py-2 text-sm resize-y min-h-[5rem] ${
                            isDark
                              ? 'bg-black/30 border-white/15 text-white'
                              : 'bg-white border-slate-200 text-slate-900'
                          }`}
                          placeholder="Brief description of your store"
                        />
                        <p className={`text-xs mt-1 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                          {storeDisplaySettings.storeDescription.length}/500 characters
                        </p>
                      </div>
                      <div>
                        <label
                          className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}
                          htmlFor="store-settings-wa"
                        >
                          WhatsApp number (optional)
                        </label>
                        <input
                          id="store-settings-wa"
                          type="text"
                          inputMode="numeric"
                          value={storeDisplaySettings.whatsapp}
                          onChange={(e) =>
                            setStoreDisplaySettings((s) => ({ ...s, whatsapp: e.target.value }))
                          }
                          className={`mt-1.5 w-full rounded-lg border px-2.5 py-2 text-sm ${
                            isDark
                              ? 'bg-black/30 border-white/15 text-white'
                              : 'bg-white border-slate-200 text-slate-900'
                          }`}
                          placeholder="233…"
                        />
                        <p className={`text-xs mt-1.5 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                          Customers can contact you via WhatsApp if provided. Use international format (233…).
                        </p>
                      </div>
                      <div>
                        <label
                          className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}
                          htmlFor="store-settings-wa-group"
                        >
                          WhatsApp group link (optional)
                        </label>
                        <input
                          id="store-settings-wa-group"
                          type="url"
                          value={storeDisplaySettings.whatsappGroup}
                          onChange={(e) =>
                            setStoreDisplaySettings((s) => ({ ...s, whatsappGroup: e.target.value }))
                          }
                          className={`mt-1.5 w-full rounded-lg border px-2.5 py-2 text-sm ${
                            isDark
                              ? 'bg-black/30 border-white/15 text-white'
                              : 'bg-white border-slate-200 text-slate-900'
                          }`}
                          placeholder="https://chat.whatsapp.com/…"
                        />
                        <p className={`text-xs mt-1.5 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                          Share a group link so customers can join for updates and support.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div
                    className={`rounded-2xl border p-4 sm:p-5 ${
                      isDark ? 'bg-zinc-900/80 border-white/10' : 'bg-white border-slate-200/90'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          isDark ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-800'
                        }`}
                        aria-hidden
                      >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="1" y="4" width="22" height="16" rx="2" />
                          <path d="M1 9h22" />
                        </svg>
                      </div>
                      <div>
                        <h2 className={`text-base sm:text-lg font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                          Payment preferences
                        </h2>
                        <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                          Configure which payment methods are available on your store
                        </p>
                      </div>
                    </div>
                    <h3
                      className={`text-sm font-semibold mt-5 ${isDark ? 'text-white' : 'text-slate-900'}`}
                    >
                      Enabled payment methods
                    </h3>
                    <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                      Toggle which methods customers can use on your storefront
                    </p>
                    <div className="mt-3 space-y-2">
                      <div
                        className={`rounded-xl border-2 p-3 flex items-start justify-between gap-2 ${
                          storeDisplaySettings.paystackEnabled
                            ? isDark
                              ? 'border-violet-500/50 bg-violet-950/20'
                              : 'border-violet-500 bg-violet-50/40'
                            : isDark
                              ? 'border-white/10'
                              : 'border-slate-200'
                        }`}
                      >
                        <div>
                          <p className={`text-sm font-semibold flex items-center gap-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            Paystack
                            {storeDisplaySettings.paystackEnabled ? (
                              <span
                                className="inline-flex text-violet-600"
                                aria-label="On"
                                title="On"
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                                  <path d="M20 6L9 17l-5-5" />
                                </svg>
                              </span>
                            ) : null}
                          </p>
                          <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                            Card &amp; bank payments
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={storeDisplaySettings.paystackEnabled}
                          onClick={() =>
                            setStoreDisplaySettings((s) => ({ ...s, paystackEnabled: !s.paystackEnabled }))
                          }
                          className={`relative shrink-0 inline-flex h-7 w-12 items-center rounded-full border-2 border-transparent transition ${
                            storeDisplaySettings.paystackEnabled ? 'bg-violet-600' : isDark ? 'bg-slate-600' : 'bg-slate-300'
                          }`}
                        >
                          <span
                            className={`pointer-events-none block h-6 w-6 rounded-full bg-white shadow transition ${
                              storeDisplaySettings.paystackEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'
                            }`}
                            aria-hidden
                          />
                        </button>
                      </div>
                      <div
                        className={`rounded-xl border p-3 flex items-start justify-between gap-2 select-none ${
                          isDark ? 'border-white/10 opacity-60' : 'border-slate-200 bg-slate-100/30 opacity-90'
                        }`}
                        aria-disabled
                      >
                        <div>
                          <p
                            className={`text-sm font-semibold flex flex-wrap items-center gap-1.5 ${
                              isDark ? 'text-slate-500' : 'text-slate-500'
                            }`}
                          >
                            BulkClix
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-600'
                              }`}
                            >
                              Disabled by admin
                            </span>
                          </p>
                          <p
                            className={`text-xs mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}
                          >
                            This payment method is currently unavailable on the platform.
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled
                          className="relative shrink-0 inline-flex h-7 w-12 items-center rounded-full bg-slate-400/80 cursor-not-allowed opacity-90"
                        >
                          <span className="pointer-events-none block h-6 w-6 translate-x-0.5 rounded-full bg-white" aria-hidden />
                        </button>
                      </div>
                    </div>
                    <h3
                      className={`text-sm font-semibold mt-6 ${isDark ? 'text-white' : 'text-slate-900'}`}
                    >
                      Fee absorption
                    </h3>
                    <p
                      className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}
                    >
                      Choose how much of the payment processing fee you absorb. The rest is passed to customers.
                    </p>
                    <div className="mt-3">
                      <div className="flex justify-center">
                        <span
                          className={`text-sm font-bold tabular-nums ${isDark ? 'text-white' : 'text-slate-900'}`}
                        >
                          {storeDisplaySettings.feeAbsorption}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={storeDisplaySettings.feeAbsorption}
                        onChange={(e) =>
                          setStoreDisplaySettings((s) => ({ ...s, feeAbsorption: Number(e.target.value) }))
                        }
                        className="w-full h-2 mt-2 rounded-lg appearance-none cursor-pointer accent-violet-600"
                        aria-label="Fee absorption percentage"
                      />
                      <div className="flex justify-between text-[10px] sm:text-xs gap-1 mt-1.5 text-center">
                        <span
                          className={`shrink-0 text-left min-w-0 max-w-[45%] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}
                        >
                          Customer pays all fees
                        </span>
                        <span
                          className={`shrink-0 text-right min-w-0 max-w-[45%] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}
                        >
                          You absorb all fees
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        const raw = JSON.stringify(storeDisplaySettings);
                        localStorage.setItem('dataplus_store_display_v1', raw);
                        persistPublicStoreSnapshot();
                        if (isSignedIn && api.getToken()) {
                          flushStoreToApi();
                          setStoreSettingsMessage('Store settings saved and synced to the server.');
                        } else {
                          setStoreSettingsMessage('Store settings saved on this device. Sign in to sync to the server.');
                        }
                        if (typeof window !== 'undefined') {
                          window.setTimeout(() => setStoreSettingsMessage(null), 3000);
                        }
                      } catch {
                        setStoreSettingsMessage(
                          'Could not save (storage full?). Try a smaller logo or clear site data.',
                        );
                        if (typeof window !== 'undefined') {
                          window.setTimeout(() => setStoreSettingsMessage(null), 5000);
                        }
                      }
                    }}
                    className="w-full rounded-xl py-3 px-4 text-sm font-semibold bg-violet-600 text-white hover:bg-violet-500 shadow-sm"
                  >
                    Save store settings
                  </button>
                  <div
                    className={`pt-1 border-t space-y-3 ${isDark ? 'border-white/10' : 'border-slate-200'}`}
                  >
                    <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end sm:gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setStoreDisplaySettings(loadStoreDisplaySettings());
                          setStoreLogoError(null);
                          setStoreSettingsMessage('Restored to last saved store settings.');
                          if (typeof window !== 'undefined') {
                            window.setTimeout(() => setStoreSettingsMessage(null), 2500);
                          }
                        }}
                        className={`w-full sm:w-auto rounded-xl border py-2.5 px-4 text-sm font-medium ${
                          isDark
                            ? 'border-white/20 text-slate-200 bg-white/5 hover:bg-white/10'
                            : 'border-slate-200 text-slate-800 bg-white hover:bg-slate-50'
                        }`}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (storeLinkEditOpen) {
                            applyStorePathOverride(storePathSlugDraft);
                            setStoreLinkEditOpen(false);
                          }
                          setStoreLinkSettingsMessage('Profile settings saved');
                          if (typeof window !== 'undefined') {
                            window.setTimeout(() => setStoreLinkSettingsMessage(null), 2800);
                          }
                          setStoreSettingsMessage('Public store link updated from Overview. Open Overview to change URL.');
                          if (typeof window !== 'undefined') {
                            window.setTimeout(() => setStoreSettingsMessage(null), 3200);
                          }
                          persistPublicStoreSnapshot();
                        }}
                        className="w-full sm:w-auto sm:min-w-[10rem] rounded-xl py-2.5 px-3 sm:px-4 text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 shadow-sm"
                      >
                        Save profile settings
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : currentPage === 'join-us' ? (
          <>
            <div className="pt-14 sm:pt-20 pb-4 sm:pb-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <h1 className="page-title text-2xl sm:text-3xl truncate">Join Us</h1>
              </div>
              <button
                type="button"
                onClick={() => setCurrentPage('dashboard')}
                className={`flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0 transition-colors ${isDark ? 'text-white/80 hover:bg-white/10' : 'text-slate-700 hover:bg-slate-200'}`}
                aria-label="Back to dashboard"
              >
                <Svg.ArrowLeft width={24} height={24} aria-hidden className="shrink-0" />
              </button>
            </div>

            {hasAdminRole && adminRoute ? (
              <div className={`rounded-[1.75rem] overflow-hidden border max-w-sm mx-auto ${isDark ? 'bg-white/[0.06] border-white/10' : 'bg-white border-slate-200/80 shadow-sm'}`}>
                <div className="px-5 py-12 flex flex-col items-center text-center min-h-[200px]" />
              </div>
            ) : (
              <div className={`rounded-[1.75rem] overflow-hidden border max-w-sm mx-auto ${isDark ? 'bg-white/[0.06] border-white/10' : 'bg-white border-slate-200/80 shadow-sm'}`}>
                <div className="px-5 py-6 flex flex-col items-center text-center">
                  <div className="w-24 h-24 rounded-full overflow-hidden flex-shrink-0 mb-4 bg-slate-200">
                    <img src={brandLogoUrl} alt="DataPlus" className="w-full h-full object-cover" />
                  </div>
                  <h2 className={`text-lg font-semibold tracking-tight mb-0.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>DataPlus</h2>
                  <p className={`text-xs mb-4 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Updates, offers, and support on WhatsApp</p>
                  <a
                    href="https://whatsapp.com/channel/0029VbCDPkSCMY0KfEF3LC2T"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center px-5 py-2 rounded-full text-sm font-medium bg-[#25D366] hover:bg-[#20bd5a] text-[#0a3d1e] transition-colors"
                  >
                    Open WhatsApp
                  </a>
                  <p className={`text-xs mt-3 max-w-[220px] ${isDark ? 'text-white/40' : 'text-slate-400'}`}>
                    Opens WhatsApp in a new tab.
                  </p>
                </div>
              </div>
            )}
          </>
        ) : currentPage === 'dashboard' ? (
          <>
            <div className="pt-14 sm:pt-20 pb-4 sm:pb-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h1 className={`page-title dashboard-animated-title text-2xl sm:text-3xl transition-all duration-300 ${dashboardHeadlineVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1'}`}>
                    {DASHBOARD_HEADLINES[dashboardHeadlineIndex]}
                  </h1>
                </div>
                <div className="relative w-4 h-4 flex items-center justify-center">
                  <div className="absolute w-4 h-4 rounded-full bg-green-500 status-dot" />
                  <div className="relative w-3 h-3 rounded-full bg-green-400" />
                </div>
              </div>
            </div>

            <div
              className={`rounded-xl sm:rounded-2xl p-5 sm:p-7 mb-5 sm:mb-6 text-white balance-card-live ${isDark ? 'border border-white/10' : ''}`}
            >
              <div className="flex justify-between mb-5 sm:mb-6 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-white/10' : 'bg-neutral-800'}`}>
                    <Svg.Wallet stroke="#ffffff" />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm ${isDark ? 'text-white/70' : 'text-neutral-400'}`}>Balance</p>
                    <p className="text-xl sm:text-3xl font-bold truncate">¢ {dashboardBalance.toFixed(2)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-white/10' : 'bg-neutral-800'}`}>
                    <Svg.Cart stroke="#ffffff" />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm ${isDark ? 'text-white/70' : 'text-neutral-400'}`}>Today's Spent</p>
                    <p className="text-xl sm:text-3xl font-bold truncate">¢ {dashboardTodaySpent.toFixed(2)}</p>
                  </div>
                </div>
              </div>
              {isPinOnlyAdminSession && (
                <p className={`mb-3 text-xs ${isDark ? 'text-white/75' : 'text-neutral-500'}`}>
                  Admin PIN mode active. Personal wallet figures are hidden unless signed in with an admin account.
                </p>
              )}
              <button
                type="button"
                onClick={() => setCurrentPage(isPinOnlyAdminSession ? 'admin-analytics' : 'topup')}
                className={`w-full py-3 sm:py-4 rounded-xl transition-colors flex items-center justify-center gap-2 font-medium text-base ${isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-neutral-800 hover:bg-neutral-700'}`}
              >
                <Svg.Plus /> {isPinOnlyAdminSession ? 'Open Admin Analytics' : 'Top Up Wallet'}
              </button>
            </div>

            <div className="rounded-xl sm:rounded-2xl p-5 sm:p-7 mb-5 sm:mb-6 bg-black text-white">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
                {[
                  { label: 'Wallet Balance', value: `¢ ${dashboardBalance.toFixed(2)}` },
                  { label: "Today's Orders", value: String(dashboardTodayOrders) },
                  { label: "Today's Amount", value: `¢ ${dashboardTodayAmount.toFixed(2)}` },
                  { label: "Today's Bundle", value: `${dashboardTodayBundles} GB` },
                ].map((item, i) => (
                  <div key={item.label} className={`text-center ${i < 2 ? 'pb-4 sm:pb-6 border-b md:border-b-0 md:pb-0' : 'pt-4 sm:pt-6'} ${i < 3 ? 'md:border-r' : ''} border-white/10`}>
                    <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-full flex items-center justify-center mx-auto mb-3 bg-white/10">
                      <Svg.Wallet stroke="#ffffff" />
                    </div>
                    <p className="text-sm font-medium opacity-80">{item.label}</p>
                    <p className="text-lg sm:text-xl font-bold">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div
              className={`relative flex gap-1 p-1.5 rounded-2xl mb-5 sm:mb-6 overflow-x-auto overflow-y-hidden scrollbar-hide ${isDark ? 'bg-white/[0.07] backdrop-blur-xl border border-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]' : 'bg-white/40 backdrop-blur-xl border border-white/20 shadow-[0_0_0_1px_rgba(255,255,255,0.5)]'}`}
              role="tablist"
              aria-label="Network providers"
            >
              {[
                { id: 'mtn', label: 'MTN' },
                { id: 'telecel', label: 'Telecel' },
                { id: 'bigtime', label: 'AT BigTime' },
                { id: 'ishare', label: 'AT iShare' },
              ].map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveTab(tab.id)}
                    className={`
                      relative flex-1 min-w-0 py-2.5 sm:py-3 px-3 sm:px-4 rounded-xl text-sm sm:text-base font-semibold
                      transition-all duration-300 ease-out
                      ${isActive
                        ? isDark
                          ? 'bg-white text-black shadow-lg shadow-white/10'
                          : 'bg-slate-900 text-white shadow-lg shadow-slate-900/20'
                        : isDark
                          ? 'text-white/50 hover:text-white/80 hover:bg-white/5'
                          : 'text-slate-500 hover:text-slate-800 hover:bg-white/60'
                      }
                    `}
                  >
                    {isActive && (
                      <span
                        className={`absolute inset-0 rounded-xl ring-2 pointer-events-none ${isDark ? 'ring-white/20' : 'ring-slate-300/50'}`}
                        aria-hidden
                      />
                    )}
                    <span className="relative truncate block text-center tracking-tight">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5 pb-16 sm:pb-20">
              {displayBundles.map((bundle, index) => (
                <div
                  key={index}
                  className="rounded-xl sm:rounded-2xl p-5 sm:p-6 text-white relative overflow-hidden group hover:scale-[1.01] sm:hover:scale-[1.02] transition-transform bg-cover bg-center"
                  style={{ backgroundImage: (isBigTime || isIshare) ? 'url(https://files.catbox.moe/riugtj.png)' : isTelecel ? 'url(https://files.catbox.moe/yzcokj.jpg)' : 'url(https://files.catbox.moe/r1m0uh.png)' }}
                >
                  <div className="absolute inset-0 bg-black/50 rounded-xl sm:rounded-2xl" aria-hidden="true" />
                  {adminStoreTools && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingBundle({ network: activeTab, index });
                        setEditBundleForm({ size: bundle.size, price: typeof bundle.price === 'number' ? bundle.price : parseFloat(bundle.price) || 0 });
                        setAdminBundlesMessage(null);
                      }}
                      className="absolute top-3 right-3 z-20 w-9 h-9 rounded-lg flex items-center justify-center bg-white/20 hover:bg-white/40 text-white border border-white/40 shadow-lg"
                      title="Edit package"
                      aria-label="Edit package"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                    </button>
                  )}
                  <div className="relative z-10 flex flex-col h-full">
                    <div className="flex justify-between items-start mb-4 gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium opacity-90 drop-shadow-sm">{isBigTime ? 'AT BigTime' : isIshare ? 'AT iShare' : isTelecel ? 'Telecel' : 'MTN'}</p>
                        <h3 className="text-xl sm:text-2xl font-bold drop-shadow-md">{bundle.size}</h3>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-medium opacity-90 drop-shadow-sm">Price</p>
                        <p className="text-lg sm:text-xl font-bold drop-shadow-md">¢ {bundle.price}</p>
                      </div>
                    </div>
                    <div className="mt-auto flex flex-col gap-2">
                      <button type="button" onClick={() => setBuyBundle({ ...bundle, network: activeTab })} className={`w-full py-3 sm:py-4 rounded-xl font-semibold text-base transition-colors shadow-lg ${(isBigTime || isIshare) ? 'bg-white/95 hover:bg-white text-blue-600' : isTelecel ? 'bg-white/95 hover:bg-white text-red-700' : 'bg-white/95 hover:bg-white text-slate-800'}`}>
                        Buy
                      </button>
                      {adminStoreTools && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingBundle({ network: activeTab, index });
                            setEditBundleForm({ size: bundle.size, price: typeof bundle.price === 'number' ? bundle.price : parseFloat(bundle.price) || 0 });
                            setAdminBundlesMessage(null);
                          }}
                          className="w-full py-2 rounded-xl font-medium text-sm bg-white/20 hover:bg-white/30 text-white border border-white/30"
                        >
                          Edit price
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : currentPage === 'transactions' ? (
          (() => {
            const now = new Date();
            const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
            const getRange = () => {
              if (transactionDateFilter === 'Today') {
                const s = startOfDay(now);
                return { start: s.getTime(), end: now.getTime() + 86400000 };
              }
              if (transactionDateFilter === 'Yesterday') {
                const s = startOfDay(now);
                return { start: s.getTime() - 86400000, end: s.getTime() };
              }
              if (transactionDateFilter === 'Last 7 Days') {
                return { start: now.getTime() - 7 * 86400000, end: now.getTime() + 86400000 };
              }
              if (transactionDateFilter === 'This Month') {
                const s = new Date(now.getFullYear(), now.getMonth(), 1);
                return { start: s.getTime(), end: now.getTime() + 86400000 };
              }
              if (transactionDateFilter === 'Custom' && transactionCustomStart && transactionCustomEnd) {
                const start = new Date(transactionCustomStart).getTime();
                const end = new Date(transactionCustomEnd).getTime() + 86400000;
                return { start, end };
              }
              return { start: 0, end: Infinity };
            };
            const { start, end } = getRange();
            const searchLower = transactionSearch.trim().toLowerCase();
            const normalizeStatus = (raw) => {
              const s = String(raw || '').trim().toLowerCase();
              if (!s) return 'completed';
              if (['success', 'successful', 'completed', 'complete', 'done', 'paid'].includes(s)) return 'completed';
              if (['pending', 'processing', 'in-progress', 'queued'].includes(s)) return 'pending';
              if (['failed', 'error', 'rejected', 'cancelled', 'canceled'].includes(s)) return 'failed';
              return s;
            };
            const typeLabel = (t) => {
              const typ = String(t.type || '').toLowerCase();
              if (typ === 'topup') return 'Credit';
              if (typ === 'payment') return 'Order payment';
              return t.type || '—';
            };
            const modeLabel = (t) => {
              if (t.mode) return String(t.mode);
              const ref = String(t.reference || '').toUpperCase();
              if (ref.startsWith('WT-') || ref.startsWith('PAYSTACK') || ref.startsWith('PS-')) return 'Paystack';
              if (ref.startsWith('TOPUP-') || ref.startsWith('ADMIN-') || ref.startsWith('DP-')) return 'Wallet';
              if (String(t.type || '').toLowerCase() === 'topup') return 'Wallet';
              return 'Wallet';
            };
            const narrationLabel = (t) =>
              (t.description || t.narration || t.note || (String(t.type || '').toLowerCase() === 'topup' ? 'Wallet top-up' : 'Order payment')).toString();
            const txStatusLabel = (t) => {
              const s = normalizeStatus(t.status);
              return s.charAt(0).toUpperCase() + s.slice(1);
            };

            const filtered = transactions.filter((t) => {
              const tTime = t.created_at ? new Date(t.created_at).getTime() : 0;
              if (tTime < start || tTime >= end) return false;
              if (transactionTypeFilter !== 'All Types' && typeLabel(t) !== transactionTypeFilter) return false;
              if (transactionStatusFilter !== 'All Status' && txStatusLabel(t) !== transactionStatusFilter) return false;
              if (!searchLower) return true;
              const type = typeLabel(t).toLowerCase();
              const mode = modeLabel(t).toLowerCase();
              const narration = narrationLabel(t).toLowerCase();
              const status = txStatusLabel(t).toLowerCase();
              const ref = (t.reference || '').toLowerCase();
              const amt = String(t.amount || '');
              return (
                type.includes(searchLower) ||
                mode.includes(searchLower) ||
                narration.includes(searchLower) ||
                status.includes(searchLower) ||
                ref.includes(searchLower) ||
                amt.includes(searchLower)
              );
            });
            const creditsTotal = filtered.filter((t) => Number(t.amount) > 0).reduce((s, t) => s + (Number(t.amount) || 0), 0);
            const debitsTotal = filtered.filter((t) => Number(t.amount) < 0).reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
            const creditsCount = filtered.filter((t) => Number(t.amount) > 0).length;
            const debitsCount = filtered.filter((t) => Number(t.amount) < 0).length;
            const net = creditsTotal - debitsTotal;

            const openPrintView = () => {
              const win = window.open('', '_blank', 'width=800,height=600');
              if (!win) return;
              win.document.write(`
                <!DOCTYPE html><html><head><title>Transactions</title>
                <style>body{font-family:system-ui,sans-serif;padding:24px;color:#111}.meta{margin-bottom:16px;color:#666}.table{width:100%;border-collapse:collapse}.table th,.table td{border:1px solid #ddd;padding:10px 12px;text-align:left}.table th{background:#f5f5f5}.table tr:nth-child(even){background:#fafafa}.amount--pos{color:#059669}.amount--neg{color:#dc2626}</style></head><body>
                <div class="meta">Generated ${new Date().toLocaleString()} · ${filtered.length} transaction(s)</div>
                <table class="table"><thead><tr><th>Date</th><th>Type</th><th>Narration</th><th>Mode</th><th>Amount</th><th>Status</th></tr></thead><tbody>
                ${filtered.map((t) => {
                  const d = t.created_at ? new Date(t.created_at).toLocaleString() : '—';
                  const amt = t.amount >= 0 ? `+¢ ${t.amount.toFixed(2)}` : `−¢ ${Math.abs(t.amount).toFixed(2)}`;
                  const amtClass = t.amount >= 0 ? 'amount--pos' : 'amount--neg';
                  return `<tr><td>${d}</td><td>${typeLabel(t)}</td><td>${narrationLabel(t)}</td><td>${modeLabel(t)}</td><td class="${amtClass}">${amt}</td><td>${txStatusLabel(t)}</td></tr>`;
                }).join('')}
                </tbody></table></body></html>`);
              win.document.close();
              win.focus();
              setTimeout(() => { win.print(); }, 300);
            };

            return (
              <>
                <div className="pt-14 sm:pt-20 pb-4 sm:pb-5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <h1 className="page-title text-2xl sm:text-3xl truncate">Transactions</h1>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCurrentPage('dashboard')}
                    className={`flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0 transition-colors ${isDark ? 'text-white/80 hover:bg-white/10' : 'text-slate-700 hover:bg-slate-200'}`}
                    aria-label="Back to dashboard"
                  >
                    <Svg.ArrowLeft width={24} height={24} aria-hidden className="shrink-0" />
                  </button>
                </div>

                <p className={`text-sm mb-4 ${isDark ? 'text-white/60' : 'text-slate-600'}`}>Search and filter your transaction history. Download as PDF to save a copy.</p>

                <div className={`flex flex-wrap gap-2 mb-4 ${isDark ? 'text-white/80' : 'text-slate-600'}`}>
                  {['Today', 'Yesterday', 'Last 7 Days', 'This Month', 'Custom'].map((label) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setTransactionDateFilter(label)}
                      className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${transactionDateFilter === label ? (isDark ? 'bg-white text-black' : 'bg-black text-white') : isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {transactionDateFilter === 'Custom' && (
                  <div className={`flex flex-wrap items-center gap-3 mb-4 ${isDark ? 'text-white/80' : 'text-slate-700'}`}>
                    <label className="flex items-center gap-2 text-sm">
                      From
                      <input type="date" value={transactionCustomStart} onChange={(e) => setTransactionCustomStart(e.target.value)} className={`px-3 py-2 rounded-lg border text-sm ${isDark ? 'bg-black border-white/20 text-white' : 'bg-white border-slate-200 text-slate-900'}`} />
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      To
                      <input type="date" value={transactionCustomEnd} onChange={(e) => setTransactionCustomEnd(e.target.value)} className={`px-3 py-2 rounded-lg border text-sm ${isDark ? 'bg-black border-white/20 text-white' : 'bg-white border-slate-200 text-slate-900'}`} />
                    </label>
                  </div>
                )}

                <div className="mb-4">
                  <input
                    type="search"
                    value={transactionSearch}
                    onChange={(e) => setTransactionSearch(e.target.value)}
                    placeholder="Search by type, reference, or amount..."
                    className={`w-full px-4 py-3 rounded-xl border text-sm placeholder:opacity-60 ${isDark ? 'bg-black/30 border-white/10 text-white placeholder:text-white/50' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`}
                    aria-label="Search transactions"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  <select
                    value={transactionTypeFilter}
                    onChange={(e) => setTransactionTypeFilter(e.target.value)}
                    className={`w-full px-4 py-3 rounded-xl border text-sm ${isDark ? 'bg-black/30 border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                    aria-label="Filter transaction type"
                  >
                    <option>All Types</option>
                    <option>Credit</option>
                    <option>Order payment</option>
                  </select>
                  <select
                    value={transactionStatusFilter}
                    onChange={(e) => setTransactionStatusFilter(e.target.value)}
                    className={`w-full px-4 py-3 rounded-xl border text-sm ${isDark ? 'bg-black/30 border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                    aria-label="Filter transaction status"
                  >
                    <option>All Status</option>
                    <option>Completed</option>
                    <option>Pending</option>
                    <option>Failed</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                  <div className={`rounded-xl p-4 border ${isDark ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-emerald-50 border-emerald-200'}`}>
                    <p className={`text-xs uppercase tracking-wide ${isDark ? 'text-emerald-200/80' : 'text-emerald-700'}`}>Credits</p>
                    <p className={`text-2xl font-bold ${isDark ? 'text-emerald-200' : 'text-emerald-700'}`}>¢ {creditsTotal.toFixed(2)}</p>
                    <p className={`text-xs ${isDark ? 'text-emerald-200/70' : 'text-emerald-700/80'}`}>Count: {creditsCount}</p>
                  </div>
                  <div className={`rounded-xl p-4 border ${isDark ? 'bg-amber-500/10 border-amber-500/20' : 'bg-amber-50 border-amber-200'}`}>
                    <p className={`text-xs uppercase tracking-wide ${isDark ? 'text-amber-200/80' : 'text-amber-700'}`}>Debits</p>
                    <p className={`text-2xl font-bold ${isDark ? 'text-amber-200' : 'text-amber-700'}`}>¢ {debitsTotal.toFixed(2)}</p>
                    <p className={`text-xs ${isDark ? 'text-amber-200/70' : 'text-amber-700/80'}`}>Count: {debitsCount}</p>
                  </div>
                  <div className={`rounded-xl p-4 border ${isDark ? 'bg-violet-500/10 border-violet-500/20' : 'bg-violet-50 border-violet-200'}`}>
                    <p className={`text-xs uppercase tracking-wide ${isDark ? 'text-violet-200/80' : 'text-violet-700'}`}>Net</p>
                    <p className={`text-2xl font-bold ${net >= 0 ? (isDark ? 'text-violet-200' : 'text-violet-700') : (isDark ? 'text-red-300' : 'text-red-600')}`}>¢ {net.toFixed(2)}</p>
                    <p className={`text-xs ${isDark ? 'text-violet-200/70' : 'text-violet-700/80'}`}>{transactionDateFilter}</p>
                  </div>
                </div>

                <div className="flex justify-end mb-4">
                  <button
                    type="button"
                    onClick={openPrintView}
                    disabled={filtered.length === 0}
                    className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${filtered.length === 0 ? 'opacity-50 cursor-not-allowed ' : ''}${isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'}`}
                  >
                    Download as PDF
                  </button>
                </div>

                <div className={`rounded-xl sm:rounded-2xl overflow-hidden border ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                  <div className={`overflow-x-auto ${isDark ? 'bg-white/[0.02]' : 'bg-slate-50'}`}>
                    {filtered.length === 0 ? (
                      <div className={`py-12 text-center text-sm ${isDark ? 'text-white/50' : 'text-slate-500'}`}>
                        {transactions.length === 0 ? 'No transactions yet. Your top-ups and payments will appear here.' : 'No transactions match your filter or search.'}
                      </div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className={`border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                            <th className={`text-left py-3 px-4 font-semibold ${isDark ? 'text-white/70' : 'text-slate-600'}`}>Date</th>
                            <th className={`text-left py-3 px-4 font-semibold ${isDark ? 'text-white/70' : 'text-slate-600'}`}>Type</th>
                            <th className={`text-left py-3 px-4 font-semibold ${isDark ? 'text-white/70' : 'text-slate-600'}`}>Narration</th>
                            <th className={`text-left py-3 px-4 font-semibold ${isDark ? 'text-white/70' : 'text-slate-600'}`}>Mode</th>
                            <th className={`text-right py-3 px-4 font-semibold ${isDark ? 'text-white/70' : 'text-slate-600'}`}>Amount</th>
                            <th className={`text-left py-3 px-4 font-semibold ${isDark ? 'text-white/70' : 'text-slate-600'}`}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((t) => (
                            <tr key={t.id} className={`border-b last:border-b-0 ${isDark ? 'border-white/10 hover:bg-white/[0.04]' : 'border-slate-200 hover:bg-slate-50'}`}>
                              <td className={`py-3 px-4 ${isDark ? 'text-white/90' : 'text-slate-800'}`}>{t.created_at ? new Date(t.created_at).toLocaleString() : '—'}</td>
                              <td className={`py-3 px-4 ${isDark ? 'text-white/90' : 'text-slate-800'}`}>{typeLabel(t)}</td>
                              <td className={`py-3 px-4 ${isDark ? 'text-white/80' : 'text-slate-600'}`}>{narrationLabel(t)}</td>
                              <td className={`py-3 px-4 ${isDark ? 'text-white/80' : 'text-slate-600'}`}>{modeLabel(t)}</td>
                              <td className={`py-3 px-4 text-right font-medium ${t.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>{t.amount >= 0 ? '+' : ''}¢ {Math.abs(t.amount).toFixed(2)}</td>
                              <td className={`py-3 px-4 ${txStatusLabel(t) === 'Completed' ? 'text-emerald-500' : txStatusLabel(t) === 'Pending' ? 'text-amber-500' : 'text-red-500'}`}>{txStatusLabel(t)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </>
            );
          })()
        ) : currentPage === 'topup' ? (
          <>
            <div className="pt-14 sm:pt-20 pb-4 sm:pb-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <h1 className="page-title text-2xl sm:text-3xl truncate">Top Up Wallet</h1>
              </div>
              <button
                type="button"
                onClick={() => setCurrentPage('dashboard')}
                className={`flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0 transition-colors ${isDark ? 'text-white/80 hover:bg-white/10' : 'text-slate-700 hover:bg-slate-200'}`}
                aria-label="Back to dashboard"
              >
                <Svg.ArrowLeft width={24} height={24} aria-hidden className="shrink-0" />
              </button>
            </div>

            <div className={`rounded-xl sm:rounded-2xl p-5 sm:p-6 mb-5 border ${isDark ? 'bg-black border-white/10' : 'bg-white border-slate-200'}`}>
              <h2 className={`text-lg font-bold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>Top Up Wallet</h2>
              <p className={`text-sm mb-4 ${isDark ? 'text-white/60' : 'text-slate-500'}`}>
                {paystackPublicKey
                  ? 'Enter an amount, then continue — you will be taken to Paystack to pay. After payment you return here and your balance updates automatically.'
                  : 'Enter an amount and continue to complete your payment (instant balance only when the server has no Paystack keys).'}
              </p>
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Amount (GHS)</label>
              <input
                type="number"
                min={MIN_WALLET_TOPUP_GHS}
                step="0.01"
                placeholder="1.00"
                value={topUpAmount}
                onChange={(e) => { setTopUpAmount(e.target.value); setTopUpError(null); setTopUpSuccess(null); }}
                className={`w-full px-4 py-3 rounded-xl border text-base placeholder:opacity-60 ${isDark ? 'bg-black border-white/10 text-white placeholder:text-white/50' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`}
              />
              <p className={`text-xs mt-1.5 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Minimum amount: GHS {MIN_WALLET_TOPUP_GHS}</p>
              {topUpSuccess && (
                <p className="text-sm text-emerald-500 mt-2" role="status">
                  {topUpSuccess}
                </p>
              )}
              {topUpError && <p className="text-sm text-red-500 mt-2">{topUpError}</p>}
              <button
                type="button"
                disabled={topUpBusy || paystackConfigLoading}
                onClick={async () => {
                  const amt = parseFloat(topUpAmount);
                  if (!Number.isFinite(amt) || amt < MIN_WALLET_TOPUP_GHS) {
                    setTopUpError(`Minimum amount is GHS ${MIN_WALLET_TOPUP_GHS}`);
                    return;
                  }
                  setTopUpError(null);
                  setTopUpSuccess(null);
                  setTopUpBusy(true);
                  const pk = paystackPublicKey || import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;
                  try {
                    if (pk) {
                      const init = await api.initPaystackWalletTopUp(amt);
                      const url = init.authorization_url && String(init.authorization_url).trim();
                      if (!url) {
                        throw new Error('Paystack did not return a checkout URL');
                      }
                      setTopUpBusy(false);
                      window.location.assign(url);
                    } else {
                      const data = await api.topUp(amt);
                      setWalletBalance(data.balance);
                      setTopUpAmount('');
                      const list = await api.getTransactions();
                      setTransactions(list);
                      setTopUpBusy(false);
                    }
                  } catch (err) {
                    if (/unauthorized|expired|401/i.test(String(err?.message || ''))) {
                      clearSession();
                    }
                    setTopUpError(err.message || 'Top-up failed');
                    setTopUpBusy(false);
                  }
                }}
                className={`w-full mt-4 py-3 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/90'}`}
              >
                {topUpBusy
                  ? paystackPublicKey || import.meta.env.VITE_PAYSTACK_PUBLIC_KEY
                    ? 'Contacting server…'
                    : 'Please wait…'
                  : paystackPublicKey || import.meta.env.VITE_PAYSTACK_PUBLIC_KEY
                    ? 'Continue to Paystack'
                    : 'Top Up'}
              </button>
            </div>

            <div className={`rounded-xl sm:rounded-2xl p-5 sm:p-6 mb-5 border ${isDark ? 'bg-black border-white/10' : 'bg-white border-slate-200'}`}>
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${isDark ? 'text-white/70' : 'text-slate-500'}`}>Current Balance</span>
                <span className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>¢ {walletBalance.toFixed(2)}</span>
              </div>
            </div>

            <div className={`rounded-xl sm:rounded-2xl p-5 sm:p-6 border ${isDark ? 'bg-black border-white/10' : 'bg-white border-slate-200'}`}>
              <h3 className={`text-base font-semibold mb-3 ${isDark ? 'text-white' : 'text-slate-900'}`}>Recent transactions</h3>
              {transactions.length > 0 ? (
                <ul className="space-y-2">
                  {transactions.map((t) => (
                    <li key={t.id} className={`flex justify-between items-center gap-2 py-2 border-b last:border-b-0 ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                      <div className="min-w-0">
                        <span className={`text-sm font-medium ${t.amount >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                          {t.amount >= 0 ? '+' : ''}¢ {Math.abs(t.amount).toFixed(2)}
                        </span>
                        <span className={`text-xs block ${isDark ? 'text-white/50' : 'text-slate-500'}`}>{t.type}{t.reference ? ` · ${t.reference}` : ''}</span>
                      </div>
                      <span className={`text-xs flex-shrink-0 ${isDark ? 'text-white/40' : 'text-slate-400'}`}>{t.created_at ? new Date(t.created_at).toLocaleDateString() : ''}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className={`py-8 text-center rounded-xl border border-dashed ${isDark ? 'border-white/10 text-white/40' : 'border-slate-200 text-slate-400'}`}>
                  <p className="text-sm">No transactions yet</p>
                  <p className="text-xs mt-1">Your top-ups and payments will appear here</p>
                </div>
              )}
            </div>
          </>
        ) : currentPage === 'orders' ? (
          (() => {
            const now = new Date();
            const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
            const getOrderRange = () => {
              if (orderDateFilter === 'Today') {
                const s = startOfDay(now);
                return { start: s.getTime(), end: now.getTime() + 86400000 };
              }
              if (orderDateFilter === 'Yesterday') {
                const s = startOfDay(now);
                return { start: s.getTime() - 86400000, end: s.getTime() };
              }
              if (orderDateFilter === 'Last 7 Days') {
                return { start: now.getTime() - 7 * 86400000, end: now.getTime() + 86400000 };
              }
              if (orderDateFilter === 'This Month') {
                const s = new Date(now.getFullYear(), now.getMonth(), 1);
                return { start: s.getTime(), end: now.getTime() + 86400000 };
              }
              if (orderDateFilter === 'Custom' && orderCustomStart && orderCustomEnd) {
                const start = new Date(orderCustomStart).getTime();
                const end = new Date(orderCustomEnd).getTime() + 86400000;
                return { start, end };
              }
              return { start: 0, end: Infinity };
            };
            const { start, end } = getOrderRange();
            const inRange = (iso) => {
              if (!iso) return true;
              const t = Date.parse(iso);
              if (!Number.isFinite(t)) return true;
              return t >= start && t < end;
            };
            const formatOrderDate = (iso) => {
              if (!iso) return { date: '—', time: '—' };
              const d = new Date(iso);
              if (Number.isNaN(d.getTime())) return { date: '—', time: '—' };
              return {
                date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                time: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
              };
            };
            const normalized = orders.map((o) => {
              const dateIso = getOrderCreatedAtIso(o);
              const orderDisplayId = formatOrderDisplayId(o, dateIso);
              return {
                id: String(o.id),
                orderDisplayId,
                recipientNumber: o.recipient_number || '',
                network: o.network ? (typeof o.network === 'string' && o.network.length > 3 ? o.network : networkLabel(o.network)) : networkLabel('mtn'),
                bundleSize: o.bundle_size || '',
                amount: typeof o.bundle_price === 'number' ? o.bundle_price.toFixed(2) : String(o.bundle_price || '0'),
                dateIso,
                status: (() => {
                  const s = (o.status || '').toString().toLowerCase();
                  if (s === 'completed' || s === 'success') return 'Completed';
                  if (s === 'failed' || s === 'cancelled' || s === 'reversed') return 'Failed';
                  return 'Processing';
                })(),
              };
            });
            const byStatus = (o) => orderStatusFilter === 'all' || o.status.toLowerCase() === orderStatusFilter;
            const searchLower = orderHistorySearch.trim().toLowerCase();
            const bySearch = (o) => {
              if (!searchLower) return true;
              const ord = (o.orderDisplayId || '').toLowerCase();
              return (o.recipientNumber && o.recipientNumber.includes(searchLower)) ||
                (o.network && o.network.toLowerCase().includes(searchLower)) ||
                (o.bundleSize && o.bundleSize.toLowerCase().includes(searchLower)) ||
                ord.includes(searchLower);
            };
            const rangedOrders = normalized.filter((o) => inRange(o.dateIso));
            const completedOrders = rangedOrders.filter((o) => o.status === 'Completed');
            const filteredHistory = completedOrders.filter(bySearch);
            const ordersToShow = rangedOrders.filter(byStatus).filter(bySearch);

            return (
              <>
                <div className="pt-14 sm:pt-20 pb-4 sm:pb-5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <h1 className="page-title text-2xl sm:text-3xl truncate">Orders</h1>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCurrentPage('dashboard')}
                    className={`flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0 transition-colors ${isDark ? 'text-white/80 hover:bg-white/10' : 'text-slate-700 hover:bg-slate-200'}`}
                    aria-label="Back to dashboard"
                  >
                    <Svg.ArrowLeft width={24} height={24} aria-hidden className="shrink-0" />
                  </button>
                </div>

                <p className={`text-sm mb-4 ${isDark ? 'text-white/60' : 'text-slate-600'}`}>View order status and your completed order history.</p>

                <div className={`flex flex-wrap gap-2 mb-4 ${isDark ? 'text-white/80' : 'text-slate-600'}`}>
                  {['Today', 'Yesterday', 'Last 7 Days', 'This Month', 'Custom'].map((label) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setOrderDateFilter(label)}
                      className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${orderDateFilter === label ? (isDark ? 'bg-white text-black' : 'bg-black text-white') : isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {orderDateFilter === 'Custom' && (
                  <div className={`flex flex-wrap items-center gap-3 mb-4 ${isDark ? 'text-white/80' : 'text-slate-700'}`}>
                    <label className="flex items-center gap-2 text-sm">
                      From
                      <input type="date" value={orderCustomStart} onChange={(e) => setOrderCustomStart(e.target.value)} className={`px-3 py-2 rounded-lg border text-sm ${isDark ? 'bg-black border-white/20 text-white' : 'bg-white border-slate-200 text-slate-900'}`} />
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      To
                      <input type="date" value={orderCustomEnd} onChange={(e) => setOrderCustomEnd(e.target.value)} className={`px-3 py-2 rounded-lg border text-sm ${isDark ? 'bg-black border-white/20 text-white' : 'bg-white border-slate-200 text-slate-900'}`} />
                    </label>
                  </div>
                )}

                <div className={`relative flex gap-0.5 p-0.5 rounded-2xl mb-5 sm:mb-6 overflow-hidden ${isDark ? 'bg-white/5 border border-white/10' : 'bg-slate-100 border border-slate-200'}`} role="tablist" aria-label="Order status filter">
                  {['all', 'processing', 'completed', 'failed'].map((status) => {
                    const label = status === 'all' ? 'All' : status === 'processing' ? 'Processing' : status === 'completed' ? 'Completed' : 'Failed';
                    const active = orderStatusFilter === status;
                    return (
                      <button
                        key={status}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setOrderStatusFilter(status)}
                        className={`flex-1 min-w-0 py-3 px-4 rounded-xl text-sm font-medium transition-all ${active ? (isDark ? 'bg-white text-black shadow-sm' : 'bg-white text-slate-900 shadow-sm border border-slate-200') : isDark ? 'text-white/70 hover:text-white hover:bg-white/5' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'}`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                <div className="mb-6">
                  <h2 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Order status</h2>
                  <div className="space-y-3">
                    {ordersLoading ? (
                      <div className={`rounded-xl py-8 text-center text-sm ${isDark ? 'text-white/50 bg-white/5 border border-white/10' : 'text-slate-500 bg-slate-100 border border-slate-200'}`}>
                        Loading orders…
                      </div>
                    ) : ordersToShow.length === 0 ? (
                      <div className={`rounded-xl py-8 text-center text-sm ${isDark ? 'text-white/50 bg-white/5 border border-white/10' : 'text-slate-500 bg-slate-100 border border-slate-200'}`}>
                        {normalized.length === 0 ? 'No orders yet. Your orders will appear here after you checkout.' : orderHistorySearch.trim() ? 'No orders match your search.' : 'No orders in this filter.'}
                      </div>
                    ) : (
                      ordersToShow.map((order) => {
                        const { date, time } = formatOrderDate(order.dateIso);
                        const isCompleted = order.status === 'Completed';
                        const isFailed = order.status === 'Failed';
                        const processingSteps = ['Submitted', 'Confirming', 'Completing'];
                        return (
                          <div
                            key={order.id}
                            className={`rounded-xl border p-4 sm:p-5 transition-colors ${
                              isFailed
                                ? (isDark ? 'bg-red-500/10 border-red-500/40 hover:bg-red-500/15' : 'bg-red-50 border-red-200 hover:border-red-300')
                                : isCompleted
                                  ? (isDark ? 'bg-emerald-500/10 border-emerald-500/35 hover:bg-emerald-500/15' : 'bg-emerald-50 border-emerald-200 hover:border-emerald-300')
                                : isDark
                                  ? 'bg-white/[0.04] border-white/10 hover:bg-white/[0.06]'
                                  : 'bg-white border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${
                                  isFailed ? (isDark ? 'text-red-300/90' : 'text-red-700') : (isDark ? 'text-indigo-300/90' : 'text-indigo-700')
                                }`}>{order.orderDisplayId}</p>
                                <p className={`font-mono text-base font-medium ${
                                  isFailed ? (isDark ? 'text-red-200' : 'text-red-900') : (isDark ? 'text-white' : 'text-slate-900')
                                }`}>{order.recipientNumber}</p>
                                <p className={`text-sm mt-0.5 ${
                                  isFailed ? (isDark ? 'text-red-200/80' : 'text-red-700') : (isDark ? 'text-white/60' : 'text-slate-500')
                                }`}>{order.network} · {order.bundleSize}</p>
                                <p className={`text-xs mt-2 ${
                                  isFailed ? (isDark ? 'text-red-300/70' : 'text-red-600/80') : (isDark ? 'text-white/40' : 'text-slate-400')
                                }`}>{date} · {time}</p>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {isCompleted ? (
                                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${isDark ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-100 text-emerald-800'}`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                    Completed
                                  </span>
                                ) : isFailed ? (
                                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${isDark ? 'bg-red-500/20 text-red-300' : 'bg-red-100 text-red-800'}`}>
                                    Failed
                                  </span>
                                ) : (
                                  <span className="text-xs font-medium text-green-600 dark:text-green-400">Processing</span>
                                )}
                                <span className={`font-semibold ${
                                  isFailed
                                    ? (isDark ? 'text-red-200' : 'text-red-700')
                                    : isCompleted
                                      ? (isDark ? 'text-emerald-300' : 'text-emerald-700')
                                      : (isDark ? 'text-white' : 'text-slate-900')
                                }`}>¢ {order.amount}</span>
                              </div>
                            </div>
                            {!isCompleted && !isFailed && (
                              <div className={`mt-4 pt-4 border-t ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  {processingSteps.map((step, i) => (
                                    <span key={step} className={`text-xs font-medium ${i < 2 ? (isDark ? 'text-white/80' : 'text-slate-700') : (isDark ? 'text-white/40' : 'text-slate-400')}`}>
                                      {step}
                                    </span>
                                  ))}
                                </div>
                                <div className="relative h-2 rounded-full overflow-hidden bg-green-500/20">
                                  <div
                                    className="h-full rounded-full bg-green-500"
                                    style={{ width: '66%' }}
                                  />
                                  <div
                                    className="absolute inset-0 opacity-40"
                                    style={{
                                      background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
                                      backgroundSize: '200% 100%',
                                      backgroundPosition: '200% 0',
                                      animation: 'shimmer 1.8s ease-in-out infinite',
                                    }}
                                  />
                                </div>
                                <div className="flex justify-between mt-1.5">
                                  <span className={`text-[10px] uppercase tracking-wider ${isDark ? 'text-white/50' : 'text-slate-400'}`}>Confirming with network</span>
                                  <span className={`text-[10px] ${isDark ? 'text-white/40' : 'text-slate-400'}`}>Step 2 of 3</span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {completedOrders.length > 0 ? (
                  <div className={`rounded-xl sm:rounded-2xl overflow-hidden border ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                    <div className={`px-4 py-3 border-b ${isDark ? 'border-white/10 bg-white/[0.02]' : 'border-slate-200 bg-slate-50'}`}>
                      <h2 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-white/70' : 'text-slate-700'}`}>Completed orders · History</h2>
                      <input
                        type="search"
                        value={orderHistorySearch}
                        onChange={(e) => setOrderHistorySearch(e.target.value)}
                        placeholder="Search by order number, phone, network, or bundle..."
                        className={`w-full px-4 py-2.5 rounded-xl border text-sm placeholder:opacity-60 ${isDark ? 'bg-black/30 border-white/10 text-white placeholder:text-white/50' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`}
                        aria-label="Search completed orders"
                      />
                    </div>
                    <div className={`divide-y max-h-[280px] overflow-y-auto ${isDark ? 'divide-white/10' : 'divide-slate-200'}`}>
                      {filteredHistory.length === 0 ? (
                        <div className={`py-8 text-center text-sm ${isDark ? 'text-white/50' : 'text-slate-500'}`}>
                          No matching completed orders.
                        </div>
                      ) : (
                        filteredHistory.map((order) => {
                          const { date, time } = formatOrderDate(order.dateIso);
                          return (
                            <div key={order.id} className={`px-4 py-3.5 flex flex-wrap items-center justify-between gap-2 ${isDark ? 'hover:bg-white/[0.03]' : 'hover:bg-slate-50'}`}>
                              <div className="min-w-0">
                                <p className={`text-[11px] font-semibold uppercase tracking-wide mb-0.5 ${isDark ? 'text-indigo-300/90' : 'text-indigo-700'}`}>{order.orderDisplayId}</p>
                                <p className={`font-mono text-sm font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{order.recipientNumber}</p>
                                <p className={`text-xs ${isDark ? 'text-white/50' : 'text-slate-500'}`}>{date} at {time}</p>
                              </div>
                              <div className={`text-sm ${isDark ? 'text-white/80' : 'text-slate-600'}`}>
                                {order.network} {order.bundleSize} · <span className="font-semibold">¢ {order.amount}</span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : null}
              </>
            );
          })()
        ) : (['admin', 'admin-users', 'admin-orders', 'admin-packages', 'admin-all-transactions', 'admin-wallet', 'admin-applications', 'admin-broadcasts', 'admin-support', 'admin-analytics'].includes(currentPage) && ((adminRoute && adminPinVerified) || (isSignedIn && user?.role === 'admin'))) ? (
          <>
            {(() => {
              const adminPageTitles = {
                admin: 'ULTRAXAS MODE',
                'admin-users': 'User Management',
                'admin-orders': 'Order Management',
                'admin-packages': 'Data Packages',
                'admin-all-transactions': 'All Transactions',
                'admin-wallet': 'Wallet Management',
                'admin-applications': 'Agent Applications',
                'admin-broadcasts': 'Broadcasts',
                'admin-support': 'Messages',
                'admin-analytics': 'Analytics',
              };
              const adminPageSubtitles = {
                admin: null,
                'admin-users': 'Manage users and roles',
                'admin-orders': 'Manage and approve customer orders.',
                'admin-packages': 'Manage data packages',
                'admin-all-transactions': 'View all transactions',
                'admin-wallet': 'Manage user wallet balances',
                'admin-applications': 'Manage agent membership applications',
                'admin-broadcasts': 'Pop-up announcements for customers — image, caption, optional link button, and timing',
                'admin-support': 'Customer conversations — tap a thread to open and reply',
                'admin-analytics': 'Dashboard overview, metrics, and recent users',
              };
              const title = adminPageTitles[currentPage] || 'Admin';
              const subtitle = adminPageSubtitles[currentPage];
              return (
                <div className="pt-14 sm:pt-20 pb-4 sm:pb-5">
                  {currentPage === 'admin-applications' || currentPage === 'admin-broadcasts' ? (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <div className="min-w-0 flex-1">
                        <h1 className="page-title text-2xl sm:text-3xl truncate">{title}</h1>
                        {subtitle ? (
                          <p className={`text-sm mt-1 ${isDark ? 'text-white/60' : 'text-slate-600'}`}>{subtitle}</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentPage('admin-analytics');
                          setSelectedMenu('admin-analytics');
                        }}
                        className={`shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${isDark ? 'border-white/20 bg-white/5 text-white hover:bg-white/10' : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50 shadow-sm'}`}
                        aria-label="Back to admin dashboard"
                      >
                        <Svg.ArrowLeft width={18} height={18} aria-hidden className="shrink-0 opacity-90" />
                        Admin overview
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => { navigate('/'); setCurrentPage('dashboard'); setSelectedMenu('dashboard'); }}
                        className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold mb-3 border transition-colors ${isDark ? 'border-white/15 bg-white/5 text-white/90 hover:bg-white/10' : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50 shadow-sm'}`}
                        aria-label="Back to dashboard"
                      >
                        <Svg.ArrowLeft width={18} height={18} aria-hidden className="shrink-0 opacity-90" />
                        Dashboard
                      </button>
                      <h1 className="page-title text-2xl sm:text-3xl truncate">{title}</h1>
                      {subtitle ? (
                        <p className={`text-sm mt-1 ${isDark ? 'text-white/60' : 'text-slate-600'}`}>{subtitle}</p>
                      ) : null}
                    </>
                  )}
                </div>
              );
            })()}

            {currentPage === 'admin-analytics' && adminStatsError && (
              <div className={`mb-4 p-4 rounded-xl ${isDark ? 'bg-red-500/10 border border-red-500/30 text-red-200' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                {adminStatsError}
              </div>
            )}

            {currentPage === 'admin-users' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <input
                    type="search"
                    placeholder="Search by name, email or phone..."
                    value={adminUsersSearch}
                    onChange={(e) => setAdminUsersSearch(e.target.value)}
                    className={`flex-1 min-w-0 px-4 py-2.5 rounded-xl border text-base ${isDark ? 'bg-white/5 border-white/20 text-white placeholder-white/40' : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'}`}
                    aria-label="Search users"
                  />
                  <p className={`text-sm font-medium shrink-0 ${isDark ? 'text-white/70' : 'text-slate-600'}`}>
                    {(() => {
                      const q = (adminUsersSearch || '').trim().toLowerCase();
                      const filtered = q
                        ? adminUsers.filter((u) => {
                            const name = (u.full_name || '').toLowerCase();
                            const email = (u.email || '').toLowerCase();
                            const phone = (u.phone || '').replace(/\D/g, '');
                            const searchNum = q.replace(/\D/g, '');
                            return name.includes(q) || email.includes(q) || (u.phone || '').toLowerCase().includes(q) || (searchNum && phone.includes(searchNum));
                          })
                        : adminUsers;
                      return `${filtered.length} user${filtered.length !== 1 ? 's' : ''}`;
                    })()}
                  </p>
                </div>
                <div className={`rounded-xl sm:rounded-2xl overflow-hidden border ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'}`}>
                  {adminUsersLoading ? (
                    <div className={`px-4 py-8 text-center ${isDark ? 'text-white/60' : 'text-slate-500'}`}>Loading users…</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className={`border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                            <th className={`px-4 py-3 font-medium ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Name</th>
                            <th className={`px-4 py-3 font-medium ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Email</th>
                            <th className={`px-4 py-3 font-medium ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Phone</th>
                            <th className={`px-4 py-3 font-medium ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Role</th>
                            <th className={`px-4 py-3 font-medium ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Date joined</th>
                            <th className={`px-4 py-3 font-medium ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const q = (adminUsersSearch || '').trim().toLowerCase();
                            const filtered = q
                              ? adminUsers.filter((u) => {
                                  const name = (u.full_name || '').toLowerCase();
                                  const email = (u.email || '').toLowerCase();
                                  const phone = (u.phone || '').replace(/\D/g, '');
                                  const searchNum = q.replace(/\D/g, '');
                                  return name.includes(q) || email.includes(q) || (u.phone || '').toLowerCase().includes(q) || (searchNum && phone.includes(searchNum));
                                })
                              : adminUsers;
                            if (filtered.length === 0) {
                              return (
                                <tr>
                                  <td colSpan={6} className={`px-4 py-8 text-center ${isDark ? 'text-white/50' : 'text-slate-500'}`}>
                                    No users found
                                  </td>
                                </tr>
                              );
                            }
                            return filtered.map((u) => (
                              <tr key={u.id} className={`border-b last:border-0 ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
                                <td className={`px-4 py-3 ${isDark ? 'text-white' : 'text-slate-900'}`}>{u.full_name || '—'}</td>
                                <td className={`px-4 py-3 ${isDark ? 'text-white/90' : 'text-slate-700'}`}>{u.email || '—'}</td>
                                <td className={`px-4 py-3 ${isDark ? 'text-white/80' : 'text-slate-600'}`}>{u.phone || '—'}</td>
                                <td className={`px-4 py-3 ${isDark ? 'text-white/80' : 'text-slate-600'}`}>{u.role || 'user'}</td>
                                <td className={`px-4 py-3 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>{u.created_at ? new Date(u.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' }) : '—'}</td>
                                <td className="px-4 py-3">
                                  {(() => {
                                    const currentRole = (u.role || 'user').toLowerCase();
                                    const nextRole = currentRole === 'admin' ? 'user' : 'admin';
                                    const isSelf = String(u.id) === String(user?.id);
                                    return (
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          disabled={adminRoleUpdating === u.id || adminDeleteUserUpdating === u.id}
                                          onClick={async () => {
                                            setAdminRoleUpdating(u.id);
                                            try {
                                              await api.updateUserRole(u.id, nextRole);
                                              setAdminUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role: nextRole } : x)));
                                              if (isSelf) {
                                                setUser((prev) => (prev ? { ...prev, role: nextRole } : prev));
                                                if (nextRole === 'user') {
                                                  api.clearAdminToken();
                                                  setAdminPinVerified(false);
                                                  setCurrentPage('dashboard');
                                                }
                                              }
                                            } catch (err) {
                                              alert(err?.message || 'Failed to update role');
                                            } finally {
                                              setAdminRoleUpdating(null);
                                            }
                                          }}
                                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                                            nextRole === 'admin'
                                              ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                              : (isDark ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-red-600 hover:bg-red-700 text-white')
                                          }`}
                                        >
                                          {adminRoleUpdating === u.id ? '…' : (nextRole === 'admin' ? 'Make admin' : 'Demote')}
                                        </button>
                                        {!isSelf && (
                                          <button
                                            type="button"
                                            disabled={adminRoleUpdating === u.id || adminDeleteUserUpdating === u.id}
                                            onClick={async () => {
                                              const label = (u.full_name || u.email || 'this user').trim();
                                              const ok = window.confirm(`Delete ${label}'s account?\\n\\nThey will no longer be able to log in.`);
                                              if (!ok) return;
                                              setAdminDeleteUserUpdating(u.id);
                                              try {
                                                await api.deleteAdminUser(u.id);
                                                setAdminUsers((prev) => prev.filter((x) => x.id !== u.id));
                                              } catch (err) {
                                                alert(err?.message || 'Failed to delete user');
                                              } finally {
                                                setAdminDeleteUserUpdating(null);
                                              }
                                            }}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                                              isDark ? 'bg-rose-700 hover:bg-rose-600 text-white' : 'bg-rose-700 hover:bg-rose-800 text-white'
                                            }`}
                                          >
                                            {adminDeleteUserUpdating === u.id ? '…' : 'Delete'}
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </td>
                              </tr>
                            ));
                          })()}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {currentPage === 'admin-orders' && (
              <div className="space-y-4">
                <div className="relative">
                  <span className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-white/40' : 'text-slate-400'}`} aria-hidden>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.3-4.3" />
                    </svg>
                  </span>
                  <input
                    type="search"
                    value={adminOrdersSearch}
                    onChange={(e) => setAdminOrdersSearch(e.target.value)}
                    placeholder="Search orders by order number, phone, reference, or customer…"
                    className={`w-full pl-10 pr-4 py-3 rounded-xl border text-sm placeholder:opacity-70 ${isDark ? 'bg-white/5 border-white/15 text-white placeholder:text-white/45' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`}
                    aria-label="Search orders"
                  />
                </div>

                {adminOrdersError && (
                  <div className={`p-4 rounded-xl text-sm ${isDark ? 'bg-amber-500/15 border border-amber-500/30 text-amber-100' : 'bg-amber-50 border border-amber-200 text-amber-900'}`}>
                    {adminOrdersError}
                  </div>
                )}
                {agentApplicationsError && (
                  <div className={`p-4 rounded-xl text-sm ${isDark ? 'bg-amber-500/15 border border-amber-500/30 text-amber-100' : 'bg-amber-50 border border-amber-200 text-amber-900'}`}>
                    {agentApplicationsError}
                  </div>
                )}

                <div className={`rounded-xl sm:rounded-2xl border overflow-hidden ${isDark ? 'bg-white/[0.04] border-white/10' : 'bg-white border-slate-200'}`}>
                  <div className={`px-4 py-3 border-b flex items-center gap-2 ${isDark ? 'border-white/10 bg-white/[0.02]' : 'border-slate-200 bg-slate-50'}`}>
                    <span className={isDark ? 'text-white/90' : 'text-slate-800'} aria-hidden>
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="9" cy="21" r="1" />
                        <circle cx="20" cy="21" r="1" />
                        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                      </svg>
                    </span>
                    <h2 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      Orders ({(() => {
                        const q = (adminOrdersSearch || '').trim().toLowerCase();
                        const rows = (adminOrders || []).map(normalizeAdminOrderRow);
                        const filtered = !q ? rows : rows.filter((r) => {
                          const blob = [r.orderIdDisplay, r.reference, r.recipient, r.customer, r.customerSub, r.packageTitle, r.packageSub, r.packageFull, r.amount, r.statusLabel, r.placedAtDate, r.placedAtTime, r.dateIso || ''].join(' ').toLowerCase();
                          return blob.includes(q);
                        });
                        return filtered.length;
                      })()})
                    </h2>
                  </div>

                  {adminOrdersLoading ? (
                    <div className={`px-4 py-12 text-center text-sm ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Loading orders…</div>
                  ) : (() => {
                    const q = (adminOrdersSearch || '').trim().toLowerCase();
                    const rows = (adminOrders || []).map(normalizeAdminOrderRow);
                    const filtered = !q ? rows : rows.filter((r) => {
                      const blob = [r.orderIdDisplay, r.reference, r.recipient, r.customer, r.customerSub, r.packageTitle, r.packageSub, r.packageFull, r.amount, r.statusLabel, r.placedAtDate, r.placedAtTime, r.dateIso || ''].join(' ').toLowerCase();
                      return blob.includes(q);
                    });
                    if (filtered.length === 0) {
                      return (
                        <div className={`px-4 py-14 text-center text-sm max-w-md mx-auto ${isDark ? 'text-white/50' : 'text-slate-500'}`}>
                          <p className={`font-medium mb-1 ${isDark ? 'text-white/70' : 'text-slate-700'}`}>
                            {adminOrders.length === 0 && !adminOrdersError ? 'No orders yet' : 'No matching orders'}
                          </p>
                          <p className="text-xs leading-relaxed">
                            {adminOrders.length === 0 && !adminOrdersError
                              ? 'After customers pay from wallet checkout, each order will list here with order ID, reference, date and time placed, name, package, phone, amount, and status.'
                              : 'Try another search term.'}
                          </p>
                        </div>
                      );
                    }
                    const statusPill = (row) => (
                      row.statusLabel === 'Completed' ? (
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${isDark ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-100 text-emerald-800'}`}>Completed</span>
                      ) : row.statusLabel === 'Failed' ? (
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${isDark ? 'bg-red-500/20 text-red-300' : 'bg-red-100 text-red-800'}`}>Failed</span>
                      ) : (
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${isDark ? 'bg-sky-500/20 text-sky-300' : 'bg-sky-100 text-sky-800'}`}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                          Processing
                        </span>
                      )
                    );
                    return (
                      <>
                        <div className="hidden md:block overflow-x-auto max-h-[min(85vh,1200px)] overflow-y-auto">
                          <table className="w-full text-left text-sm min-w-[1040px]">
                            <thead className={`sticky top-0 z-[1] ${isDark ? 'bg-zinc-900/95 border-b border-white/10' : 'bg-slate-100 border-b border-slate-200'}`}>
                              <tr>
                                <th className={`px-4 py-3 font-semibold whitespace-nowrap ${isDark ? 'text-white/90' : 'text-slate-800'}`}>Order ID</th>
                                <th className={`px-4 py-3 font-semibold whitespace-nowrap ${isDark ? 'text-white/90' : 'text-slate-800'}`}>Placed</th>
                                <th className={`px-4 py-3 font-semibold whitespace-nowrap ${isDark ? 'text-white/90' : 'text-slate-800'}`}>Reference</th>
                                <th className={`px-4 py-3 font-semibold whitespace-nowrap ${isDark ? 'text-white/90' : 'text-slate-800'}`}>Customer</th>
                                <th className={`px-4 py-3 font-semibold min-w-[180px] ${isDark ? 'text-white/90' : 'text-slate-800'}`}>Package</th>
                                <th className={`px-4 py-3 font-semibold whitespace-nowrap ${isDark ? 'text-white/90' : 'text-slate-800'}`}>Phone</th>
                                <th className={`px-4 py-3 font-semibold whitespace-nowrap ${isDark ? 'text-white/90' : 'text-slate-800'}`}>Amount</th>
                                <th className={`px-4 py-3 font-semibold whitespace-nowrap ${isDark ? 'text-white/90' : 'text-slate-800'}`}>Status</th>
                                <th className={`px-4 py-3 font-semibold whitespace-nowrap text-right ${isDark ? 'text-white/90' : 'text-slate-800'}`}>Action</th>
                              </tr>
                            </thead>
                            <tbody className={isDark ? 'divide-y divide-white/10' : 'divide-y divide-slate-200'}>
                              {filtered.map((row) => (
                                <tr key={row.key} className={isDark ? 'hover:bg-white/[0.04]' : 'hover:bg-slate-50'}>
                                  <td className={`px-4 py-3.5 font-semibold align-top ${isDark ? 'text-white' : 'text-slate-900'}`}>{row.orderIdDisplay}</td>
                                  <td className={`px-4 py-3.5 align-top whitespace-nowrap ${isDark ? 'text-white/85' : 'text-slate-800'}`}>
                                    <span className="font-medium block">{row.placedAtDate}</span>
                                    <span className={`text-xs block mt-0.5 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>{row.placedAtTime}</span>
                                  </td>
                                  <td className={`px-4 py-3.5 font-mono text-xs align-top break-all max-w-[140px] ${isDark ? 'text-white/70' : 'text-slate-700'}`}>{row.reference}</td>
                                  <td className={`px-4 py-3.5 align-top ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                    <span className="font-medium block">{row.customer}</span>
                                    <span className={`text-xs block mt-0.5 ${isDark ? 'text-white/45' : 'text-slate-500'}`}>{row.customerSub}</span>
                                  </td>
                                  <td className={`px-4 py-3.5 align-top ${isDark ? 'text-white/90' : 'text-slate-800'}`}>
                                    <span className="font-medium block">{row.packageTitle}</span>
                                    <span className={`text-xs block mt-0.5 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>{row.packageSub}</span>
                                  </td>
                                  <td className={`px-4 py-3.5 font-mono align-top ${isDark ? 'text-white/90' : 'text-slate-800'}`}>{row.recipient || '—'}</td>
                                  <td className={`px-4 py-3.5 font-semibold align-top ${isDark ? 'text-indigo-300' : 'text-indigo-600'}`}>₵{row.amount}</td>
                                  <td className="px-4 py-3.5 align-top">{statusPill(row)}</td>
                                  <td className="px-4 py-3.5 align-top text-right">
                                    <div className="inline-flex items-center gap-1">
                                      <button
                                        type="button"
                                        disabled={adminOrderStatusUpdating === row.id || row.statusLabel === 'Processing'}
                                        onClick={async () => {
                                          setAdminOrderStatusUpdating(row.id);
                                          try {
                                            await api.updateAdminOrderStatus(row.id, 'processing');
                                            setAdminOrders((prev) => prev.map((o) => String(o.id) === String(row.id) ? { ...o, status: 'processing' } : o));
                                          } catch (err) {
                                            setAdminOrdersError(err?.message || 'Failed to update order');
                                          } finally {
                                            setAdminOrderStatusUpdating(null);
                                          }
                                        }}
                                        className={`px-2 py-1 rounded-lg text-[11px] font-semibold ${isDark ? 'bg-sky-500/20 text-sky-300 disabled:opacity-40' : 'bg-sky-100 text-sky-800 disabled:opacity-40'}`}
                                      >
                                        Processing
                                      </button>
                                      <button
                                        type="button"
                                        disabled={adminOrderStatusUpdating === row.id || row.statusLabel === 'Completed'}
                                        onClick={async () => {
                                          setAdminOrderStatusUpdating(row.id);
                                          try {
                                            await api.updateAdminOrderStatus(row.id, 'completed');
                                            setAdminOrders((prev) => prev.map((o) => String(o.id) === String(row.id) ? { ...o, status: 'completed' } : o));
                                          } catch (err) {
                                            setAdminOrdersError(err?.message || 'Failed to update order');
                                          } finally {
                                            setAdminOrderStatusUpdating(null);
                                          }
                                        }}
                                        className={`px-2 py-1 rounded-lg text-[11px] font-semibold ${isDark ? 'bg-emerald-500/20 text-emerald-300 disabled:opacity-40' : 'bg-emerald-100 text-emerald-800 disabled:opacity-40'}`}
                                      >
                                        Completed
                                      </button>
                                      <button
                                        type="button"
                                        disabled={adminOrderStatusUpdating === row.id || row.statusLabel === 'Failed'}
                                        onClick={async () => {
                                          setAdminOrderStatusUpdating(row.id);
                                          try {
                                            await api.updateAdminOrderStatus(row.id, 'failed');
                                            setAdminOrders((prev) => prev.map((o) => String(o.id) === String(row.id) ? { ...o, status: 'failed' } : o));
                                          } catch (err) {
                                            setAdminOrdersError(err?.message || 'Failed to update order');
                                          } finally {
                                            setAdminOrderStatusUpdating(null);
                                          }
                                        }}
                                        className={`px-2 py-1 rounded-lg text-[11px] font-semibold ${isDark ? 'bg-red-500/20 text-red-300 disabled:opacity-40' : 'bg-red-100 text-red-800 disabled:opacity-40'}`}
                                      >
                                        Failed
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className={`md:hidden divide-y max-h-[min(85vh,1200px)] overflow-y-auto ${isDark ? 'divide-white/10' : 'divide-slate-200'}`}>
                          {filtered.map((row) => (
                            <div key={row.key} className={`p-4 space-y-3 ${isDark ? 'hover:bg-white/[0.03]' : 'hover:bg-slate-50/90'}`}>
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-white/45' : 'text-slate-500'}`}>Order ID</p>
                                  <p className={`font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>{row.orderIdDisplay}</p>
                                </div>
                                {statusPill(row)}
                              </div>
                              <div>
                                <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-white/45' : 'text-slate-500'}`}>Placed</p>
                                <p className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{row.placedAtDate}</p>
                                <p className={`text-xs mt-0.5 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>{row.placedAtTime}</p>
                              </div>
                              <div>
                                <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-white/45' : 'text-slate-500'}`}>Reference</p>
                                <p className={`text-xs font-mono break-all ${isDark ? 'text-white/75' : 'text-slate-700'}`}>{row.reference}</p>
                              </div>
                              <div>
                                <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-white/45' : 'text-slate-500'}`}>Customer name</p>
                                <p className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{row.customer}</p>
                                <p className={`text-xs mt-0.5 ${isDark ? 'text-white/45' : 'text-slate-500'}`}>{row.customerSub}</p>
                              </div>
                              <div>
                                <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-white/45' : 'text-slate-500'}`}>Package</p>
                                <p className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{row.packageTitle}</p>
                                <p className={`text-xs mt-0.5 ${isDark ? 'text-white/55' : 'text-slate-600'}`}>{row.packageSub}</p>
                              </div>
                              <div className="flex flex-wrap gap-4 justify-between">
                                <div>
                                  <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-white/45' : 'text-slate-500'}`}>Phone number</p>
                                  <p className={`font-mono text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>{row.recipient || '—'}</p>
                                </div>
                                <div>
                                  <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-white/45' : 'text-slate-500'}`}>Amount (GHS)</p>
                                  <p className={`text-lg font-bold ${isDark ? 'text-indigo-300' : 'text-indigo-600'}`}>₵{row.amount}</p>
                                </div>
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                <button
                                  type="button"
                                  disabled={adminOrderStatusUpdating === row.id || row.statusLabel === 'Processing'}
                                  onClick={async () => {
                                    setAdminOrderStatusUpdating(row.id);
                                    try {
                                      await api.updateAdminOrderStatus(row.id, 'processing');
                                      setAdminOrders((prev) => prev.map((o) => String(o.id) === String(row.id) ? { ...o, status: 'processing' } : o));
                                    } catch (err) {
                                      setAdminOrdersError(err?.message || 'Failed to update order');
                                    } finally {
                                      setAdminOrderStatusUpdating(null);
                                    }
                                  }}
                                  className={`px-2 py-2 rounded-lg text-xs font-semibold ${isDark ? 'bg-sky-500/20 text-sky-300 disabled:opacity-40' : 'bg-sky-100 text-sky-800 disabled:opacity-40'}`}
                                >
                                  Processing
                                </button>
                                <button
                                  type="button"
                                  disabled={adminOrderStatusUpdating === row.id || row.statusLabel === 'Completed'}
                                  onClick={async () => {
                                    setAdminOrderStatusUpdating(row.id);
                                    try {
                                      await api.updateAdminOrderStatus(row.id, 'completed');
                                      setAdminOrders((prev) => prev.map((o) => String(o.id) === String(row.id) ? { ...o, status: 'completed' } : o));
                                    } catch (err) {
                                      setAdminOrdersError(err?.message || 'Failed to update order');
                                    } finally {
                                      setAdminOrderStatusUpdating(null);
                                    }
                                  }}
                                  className={`px-2 py-2 rounded-lg text-xs font-semibold ${isDark ? 'bg-emerald-500/20 text-emerald-300 disabled:opacity-40' : 'bg-emerald-100 text-emerald-800 disabled:opacity-40'}`}
                                >
                                  Completed
                                </button>
                                <button
                                  type="button"
                                  disabled={adminOrderStatusUpdating === row.id || row.statusLabel === 'Failed'}
                                  onClick={async () => {
                                    setAdminOrderStatusUpdating(row.id);
                                    try {
                                      await api.updateAdminOrderStatus(row.id, 'failed');
                                      setAdminOrders((prev) => prev.map((o) => String(o.id) === String(row.id) ? { ...o, status: 'failed' } : o));
                                    } catch (err) {
                                      setAdminOrdersError(err?.message || 'Failed to update order');
                                    } finally {
                                      setAdminOrderStatusUpdating(null);
                                    }
                                  }}
                                  className={`px-2 py-2 rounded-lg text-xs font-semibold ${isDark ? 'bg-red-500/20 text-red-300 disabled:opacity-40' : 'bg-red-100 text-red-800 disabled:opacity-40'}`}
                                >
                                  Failed
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>
                <div className={`rounded-xl sm:rounded-2xl border overflow-hidden ${isDark ? 'bg-white/[0.04] border-white/10' : 'bg-white border-slate-200'}`}>
                  <div className={`px-4 py-3 border-b flex items-center justify-between gap-2 ${isDark ? 'border-white/10 bg-white/[0.02]' : 'border-slate-200 bg-slate-50'}`}>
                    <h2 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>AFA Registrations ({agentApplications.length})</h2>
                  </div>
                  {agentApplicationsLoading ? (
                    <div className={`px-4 py-10 text-center text-sm ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Loading AFA registrations…</div>
                  ) : agentApplications.length === 0 ? (
                    <div className={`px-4 py-10 text-center text-sm ${isDark ? 'text-white/50' : 'text-slate-500'}`}>No AFA registrations yet.</div>
                  ) : (
                    <div className={`divide-y max-h-[480px] overflow-y-auto ${isDark ? 'divide-white/10' : 'divide-slate-100'}`}>
                      {agentApplications.map((row) => (
                        <div key={row.id} className="px-4 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className={`font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>{row.full_name || '—'}</p>
                              <p className={`text-xs ${isDark ? 'text-white/50' : 'text-slate-500'}`}>{row.phone || '—'} · {row.ghana_card_number || '—'}</p>
                              <p className={`text-xs ${isDark ? 'text-white/40' : 'text-slate-500'}`}>{row.occupation || '—'} · DOB: {row.date_of_birth || '—'}</p>
                            </div>
                            <div className="text-right">
                              <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>₵{Number(row.payment_amount ?? 0).toFixed(2)}</p>
                              <p className={`text-xs capitalize ${isDark ? 'text-white/60' : 'text-slate-500'}`}>{row.status || 'pending'}</p>
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-2">
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const updated = await api.patchAgentApplication(row.id, { status: 'pending' });
                                  setAgentApplications((prev) => prev.map((x) => String(x.id) === String(row.id) ? updated : x));
                                } catch (err) {
                                  setAgentApplicationsError(err?.message || 'Failed to update AFA registration');
                                }
                              }}
                              className={`px-2 py-2 rounded-lg text-xs font-semibold ${isDark ? 'bg-sky-500/20 text-sky-300' : 'bg-sky-100 text-sky-800'}`}
                            >
                              Pending
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const updated = await api.patchAgentApplication(row.id, { status: 'approved' });
                                  setAgentApplications((prev) => prev.map((x) => String(x.id) === String(row.id) ? updated : x));
                                } catch (err) {
                                  setAgentApplicationsError(err?.message || 'Failed to update AFA registration');
                                }
                              }}
                              className={`px-2 py-2 rounded-lg text-xs font-semibold ${isDark ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-100 text-emerald-800'}`}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const updated = await api.patchAgentApplication(row.id, { status: 'rejected' });
                                  setAgentApplications((prev) => prev.map((x) => String(x.id) === String(row.id) ? updated : x));
                                } catch (err) {
                                  setAgentApplicationsError(err?.message || 'Failed to update AFA registration');
                                }
                              }}
                              className={`px-2 py-2 rounded-lg text-xs font-semibold ${isDark ? 'bg-red-500/20 text-red-300' : 'bg-red-100 text-red-800'}`}
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {currentPage === 'admin-packages' && (
              <div className="space-y-4 pb-8">
                <p className={`text-sm ${isDark ? 'text-white/70' : 'text-slate-600'}`}>
                  Packages are stored on the server. Add, edit, or remove rows here — the dashboard and cart update for all users.
                </p>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div
                    className={`relative flex gap-1 p-1.5 rounded-2xl overflow-x-auto overflow-y-hidden scrollbar-hide ${isDark ? 'bg-white/[0.07] backdrop-blur-xl border border-white/10' : 'bg-white/40 backdrop-blur-xl border border-white/20'}`}
                    role="tablist"
                    aria-label="Network for packages"
                  >
                    {[
                      { id: 'mtn', label: 'MTN' },
                      { id: 'telecel', label: 'Telecel' },
                      { id: 'bigtime', label: 'AT BigTime' },
                      { id: 'ishare', label: 'AT iShare' },
                    ].map((tab) => {
                      const isActive = adminPackagesNetwork === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          role="tab"
                          aria-selected={isActive}
                          onClick={() => setAdminPackagesNetwork(tab.id)}
                          className={`
                            relative flex-1 min-w-0 py-2.5 sm:py-3 px-3 sm:px-4 rounded-xl text-sm sm:text-base font-semibold
                            transition-all duration-300 ease-out
                            ${isActive
                              ? isDark
                                ? 'bg-white text-black shadow-lg shadow-white/10'
                                : 'bg-slate-900 text-white shadow-lg shadow-slate-900/20'
                              : isDark
                                ? 'text-white/50 hover:text-white/80 hover:bg-white/5'
                                : 'text-slate-500 hover:text-slate-800 hover:bg-white/60'
                            }
                          `}
                        >
                          <span className="relative truncate block text-center tracking-tight">{tab.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingBundle({ network: adminPackagesNetwork, index: -1 });
                      setEditBundleForm({ size: '', price: 0 });
                      setAdminBundlesMessage(null);
                    }}
                    className={`shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/90'}`}
                  >
                    <Svg.Plus stroke="currentColor" />
                    Add package
                  </button>
                </div>
                <div className={`rounded-xl sm:rounded-2xl overflow-hidden border ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'}`}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm min-w-[320px]">
                      <thead>
                        <tr className={`border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                          <th className={`px-4 py-3 font-medium ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Size</th>
                          <th className={`px-4 py-3 font-medium ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Price (¢)</th>
                          <th className={`px-4 py-3 font-medium text-right ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const list = (bundlesData && Array.isArray(bundlesData.mtn) ? bundlesData : defaultBundles)[adminPackagesNetwork] || [];
                          if (list.length === 0) {
                            return (
                              <tr>
                                <td colSpan={3} className={`px-4 py-8 text-center ${isDark ? 'text-white/50' : 'text-slate-500'}`}>
                                  No packages for {networkLabel(adminPackagesNetwork)}. Add one above.
                                </td>
                              </tr>
                            );
                          }
                          return list.map((bundle, index) => (
                            <tr key={`${adminPackagesNetwork}-${index}-${bundle.size}`} className={`border-b last:border-0 ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
                              <td className={`px-4 py-3 font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{bundle.size}</td>
                              <td className={`px-4 py-3 ${isDark ? 'text-white/90' : 'text-slate-700'}`}>¢ {bundle.price}</td>
                              <td className="px-4 py-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingBundle({ network: adminPackagesNetwork, index });
                                    setEditBundleForm({
                                      size: bundle.size,
                                      price: typeof bundle.price === 'number' ? bundle.price : parseFloat(bundle.price) || 0,
                                    });
                                    setAdminBundlesMessage(null);
                                  }}
                                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${isDark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-slate-100 text-slate-800 hover:bg-slate-200'}`}
                                >
                                  Edit
                                </button>
                              </td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {currentPage === 'admin-all-transactions' && (
              <div className="space-y-4 pb-8">
                <p className={`text-sm ${isDark ? 'text-white/70' : 'text-slate-600'}`}>
                  All customer wallet activity: top-ups (credits) and bundle payments (debits), with dates and users when the API provides them.
                </p>
                <div className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 ${isDark ? 'bg-sky-500/10 border-sky-500/30 text-sky-100' : 'bg-sky-50 border-sky-200 text-sky-900'}`}>
                  <p className="text-xs sm:text-sm">
                    This page is only for wallet transaction history. To approve order delivery, open <span className="font-semibold">Order Management</span> and use the Processing/Completed/Failed action buttons.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentPage('admin-orders');
                      setSelectedMenu('admin-orders');
                    }}
                    className={`shrink-0 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold ${isDark ? 'bg-sky-400/25 text-sky-100 hover:bg-sky-400/35' : 'bg-sky-100 text-sky-900 hover:bg-sky-200'}`}
                  >
                    Go to Order Management
                  </button>
                </div>

                {adminAllTxError && (
                  <div className={`p-4 rounded-xl text-sm ${isDark ? 'bg-amber-500/15 border border-amber-500/30 text-amber-100' : 'bg-amber-50 border border-amber-200 text-amber-900'}`}>
                    {adminAllTxError}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                  <input
                    type="search"
                    value={adminAllTxSearch}
                    onChange={(e) => setAdminAllTxSearch(e.target.value)}
                    placeholder="Search by user, reference, type, amount…"
                    className={`flex-1 min-w-0 px-4 py-3 rounded-xl border text-sm placeholder:opacity-70 ${isDark ? 'bg-white/5 border-white/15 text-white placeholder:text-white/45' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`}
                    aria-label="Search all transactions"
                  />
                  <button
                    type="button"
                    disabled={adminAllTxLoading}
                    onClick={() => {
                      setAdminAllTxLoading(true);
                      setAdminAllTxError(null);
                      api.getAdminTransactions()
                        .then((list) => setAdminAllTransactions(Array.isArray(list) ? list : []))
                        .catch((err) => {
                          setAdminAllTxError(err?.message || 'Failed to load transactions');
                          setAdminAllTransactions([]);
                        })
                        .finally(() => setAdminAllTxLoading(false));
                    }}
                    className={`shrink-0 px-4 py-3 rounded-xl text-sm font-semibold ${isDark ? 'bg-white/10 text-white hover:bg-white/20 disabled:opacity-50' : 'bg-slate-100 text-slate-800 hover:bg-slate-200 disabled:opacity-50'}`}
                  >
                    {adminAllTxLoading ? 'Refreshing…' : 'Refresh'}
                  </button>
                </div>

                {(() => {
                  const rows = (adminAllTransactions || []).map(normalizeAdminTxRow);
                  const sorted = [...rows].sort((a, b) => b.time - a.time);
                  const q = (adminAllTxSearch || '').trim().toLowerCase();
                  const filtered = !q
                    ? sorted
                    : sorted.filter((r) => {
                        const blob = [r.userLine, r.reference, r.narration, r.type, r.statusLabel, String(r.amount)].join(' ').toLowerCase();
                        return blob.includes(q);
                      });
                  const totalCredits = sorted.reduce((s, r) => s + (r.amount > 0 ? r.amount : 0), 0);
                  const totalDebts = sorted.reduce((s, r) => s + (r.amount < 0 ? Math.abs(r.amount) : 0), 0);
                  const net = sorted.reduce((s, r) => s + r.amount, 0);
                  const typeLabel = (r) => (r.type === 'topup' ? 'Top-up' : r.type === 'payment' ? 'Payment' : r.type || '—');
                  const fmt = (n) => (Number.isFinite(n) ? n.toFixed(2) : '0.00');
                  const statusPill = (row) =>
                    row.statusLabel === 'Completed' ? (
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${isDark ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-100 text-emerald-800'}`}>Completed</span>
                    ) : row.statusLabel === 'Failed' ? (
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${isDark ? 'bg-red-500/20 text-red-300' : 'bg-red-100 text-red-800'}`}>Failed</span>
                    ) : (
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${isDark ? 'bg-sky-500/20 text-sky-300' : 'bg-sky-100 text-sky-800'}`}>{row.statusLabel}</span>
                    );

                  return (
                    <>
                      <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4`}>
                        {[
                          { label: 'Total transactions', value: String(sorted.length), key: 'count' },
                          { label: 'Total credits (¢)', value: fmt(totalCredits), key: 'cred', accent: 'text-emerald-500' },
                          { label: 'Total debits (¢)', value: fmt(totalDebts), key: 'deb', accent: 'text-red-500' },
                          { label: 'Net (¢)', value: `${net >= 0 ? '+' : ''}${fmt(net)}`, key: 'net', accent: net >= 0 ? 'text-emerald-400' : 'text-red-400' },
                        ].map(({ label, value, key, accent }) => (
                          <div key={key} className={`rounded-xl sm:rounded-2xl p-4 sm:p-5 border ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200 shadow-sm'}`}>
                            <p className={`text-xs font-medium uppercase tracking-wider mb-1 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>{label}</p>
                            <p className={`text-xl sm:text-2xl font-bold ${accent || ''} ${isDark && !accent ? 'text-white' : !accent ? 'text-slate-900' : ''}`}>{value}</p>
                          </div>
                        ))}
                      </div>

                      <div className={`rounded-xl sm:rounded-2xl border overflow-hidden ${isDark ? 'bg-white/[0.04] border-white/10' : 'bg-white border-slate-200'}`}>
                        <div className={`px-4 py-3 border-b flex items-center justify-between gap-2 ${isDark ? 'border-white/10 bg-white/[0.02]' : 'border-slate-200 bg-slate-50'}`}>
                          <h2 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            Activity ({filtered.length}{q ? ` of ${sorted.length}` : ''})
                          </h2>
                        </div>
                        {adminAllTxLoading && sorted.length === 0 ? (
                          <div className={`px-4 py-12 text-center text-sm ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Loading transactions…</div>
                        ) : filtered.length === 0 ? (
                          <div className={`px-4 py-14 text-center text-sm max-w-md mx-auto ${isDark ? 'text-white/50' : 'text-slate-500'}`}>
                            <p className={`font-medium mb-1 ${isDark ? 'text-white/70' : 'text-slate-700'}`}>
                              {sorted.length === 0 && !adminAllTxError ? 'No transactions yet' : 'No matching rows'}
                            </p>
                            <p className="text-xs leading-relaxed">
                              {sorted.length === 0 && !adminAllTxError
                                ? 'Customer top-ups and wallet payments will appear here once your backend records them.'
                                : 'Try another search term.'}
                            </p>
                          </div>
                        ) : (
                          <>
                            <div className="hidden lg:block overflow-x-auto max-h-[min(75vh,900px)] overflow-y-auto">
                              <table className="w-full text-left text-sm min-w-[880px]">
                                <thead className={`sticky top-0 z-[1] ${isDark ? 'bg-zinc-900/95 border-b border-white/10' : 'bg-slate-100 border-b border-slate-200'}`}>
                                  <tr>
                                    <th className={`px-4 py-3 font-semibold whitespace-nowrap ${isDark ? 'text-white/90' : 'text-slate-800'}`}>Date</th>
                                    <th className={`px-4 py-3 font-semibold ${isDark ? 'text-white/90' : 'text-slate-800'}`}>User</th>
                                    <th className={`px-4 py-3 font-semibold whitespace-nowrap ${isDark ? 'text-white/90' : 'text-slate-800'}`}>Type</th>
                                    <th className={`px-4 py-3 font-semibold min-w-[160px] ${isDark ? 'text-white/90' : 'text-slate-800'}`}>Narration</th>
                                    <th className={`px-4 py-3 font-semibold ${isDark ? 'text-white/90' : 'text-slate-800'}`}>Reference</th>
                                    <th className={`px-4 py-3 font-semibold text-right whitespace-nowrap ${isDark ? 'text-white/90' : 'text-slate-800'}`}>Amount (¢)</th>
                                    <th className={`px-4 py-3 font-semibold whitespace-nowrap ${isDark ? 'text-white/90' : 'text-slate-800'}`}>Status</th>
                                  </tr>
                                </thead>
                                <tbody className={isDark ? 'divide-y divide-white/10' : 'divide-y divide-slate-200'}>
                                  {filtered.map((row) => (
                                    <tr key={row.key} className={isDark ? 'hover:bg-white/[0.04]' : 'hover:bg-slate-50'}>
                                      <td className={`px-4 py-3.5 align-top whitespace-nowrap ${isDark ? 'text-white/90' : 'text-slate-800'}`}>
                                        {row.created_at ? new Date(row.created_at).toLocaleString() : '—'}
                                      </td>
                                      <td className={`px-4 py-3.5 align-top text-sm ${isDark ? 'text-white/90' : 'text-slate-800'}`}>{row.userLine}</td>
                                      <td className={`px-4 py-3.5 align-top ${isDark ? 'text-white/90' : 'text-slate-800'}`}>{typeLabel(row)}</td>
                                      <td className={`px-4 py-3.5 align-top ${isDark ? 'text-white/75' : 'text-slate-600'}`}>{row.narration}</td>
                                      <td className={`px-4 py-3.5 align-top font-mono text-xs break-all max-w-[140px] ${isDark ? 'text-white/60' : 'text-slate-600'}`}>{row.reference || '—'}</td>
                                      <td className={`px-4 py-3.5 align-top text-right font-semibold ${row.amount >= 0 ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : (isDark ? 'text-red-400' : 'text-red-600')}`}>
                                        {row.amount >= 0 ? '+' : '−'}¢ {Math.abs(row.amount).toFixed(2)}
                                      </td>
                                      <td className="px-4 py-3.5 align-top">{statusPill(row)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <div className={`lg:hidden divide-y max-h-[min(75vh,900px)] overflow-y-auto ${isDark ? 'divide-white/10' : 'divide-slate-200'}`}>
                              {filtered.map((row) => (
                                <div key={row.key} className={`p-4 space-y-2 ${isDark ? 'hover:bg-white/[0.03]' : 'hover:bg-slate-50/90'}`}>
                                  <div className="flex flex-wrap justify-between gap-2">
                                    <span className={`text-xs ${isDark ? 'text-white/50' : 'text-slate-500'}`}>{row.created_at ? new Date(row.created_at).toLocaleString() : '—'}</span>
                                    {statusPill(row)}
                                  </div>
                                  <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{row.userLine}</p>
                                  <p className={`text-xs ${isDark ? 'text-white/55' : 'text-slate-600'}`}>
                                    {typeLabel(row)} · {row.narration}
                                  </p>
                                  {row.reference ? (
                                    <p className={`text-xs font-mono break-all ${isDark ? 'text-white/45' : 'text-slate-500'}`}>{row.reference}</p>
                                  ) : null}
                                  <p className={`text-lg font-bold ${row.amount >= 0 ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : (isDark ? 'text-red-400' : 'text-red-600')}`}>
                                    {row.amount >= 0 ? '+' : '−'}¢ {Math.abs(row.amount).toFixed(2)}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {currentPage === 'admin-wallet' && (
              <div className="space-y-4 pb-8">
                {adminWalletsError && (
                  <div className={`p-4 rounded-xl text-sm ${isDark ? 'bg-amber-500/15 border border-amber-500/30 text-amber-100' : 'bg-amber-50 border border-amber-200 text-amber-900'}`}>
                    {adminWalletsError}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                  <input
                    type="search"
                    value={adminWalletsSearch}
                    onChange={(e) => setAdminWalletsSearch(e.target.value)}
                    placeholder="Search by name, email, or user ID…"
                    className={`flex-1 min-w-0 px-4 py-3 rounded-xl border text-sm placeholder:opacity-70 ${isDark ? 'bg-white/5 border-white/15 text-white placeholder:text-white/45' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`}
                    aria-label="Search wallets"
                  />
                  <button
                    type="button"
                    disabled={adminWalletsLoading}
                    onClick={() => {
                      setAdminWalletsLoading(true);
                      setAdminWalletsError(null);
                      api.getAdminWallets()
                        .then((list) => setAdminWallets(Array.isArray(list) ? list : []))
                        .catch((err) => {
                          setAdminWalletsError(err?.message || 'Failed to load wallets');
                          setAdminWallets([]);
                        })
                        .finally(() => setAdminWalletsLoading(false));
                    }}
                    className={`shrink-0 px-4 py-3 rounded-xl text-sm font-semibold ${isDark ? 'bg-white/10 text-white hover:bg-white/20 disabled:opacity-50' : 'bg-slate-100 text-slate-800 hover:bg-slate-200 disabled:opacity-50'}`}
                  >
                    {adminWalletsLoading ? 'Refreshing…' : 'Refresh'}
                  </button>
                </div>

                {(() => {
                  const fmtWalletDate = (iso) => {
                    if (!iso) return '—';
                    const t = Date.parse(iso);
                    if (Number.isNaN(t)) return '—';
                    return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                  };
                  const q = (adminWalletsSearch || '').trim().toLowerCase();
                  const base = Array.isArray(adminWallets) ? adminWallets : [];
                  const filtered = !q
                    ? base
                    : base.filter((w) => {
                        const blob = [w.full_name, w.email, String(w.id ?? '')].join(' ').toLowerCase();
                        return blob.includes(q);
                      });
                  const count = filtered.length;
                  const balNum = (b) => (typeof b === 'number' ? b : parseFloat(b)) || 0;

                  return (
                    <>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`flex items-center justify-center w-11 h-11 rounded-xl shrink-0 ${isDark ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-800'}`}>
                          <Svg.Wallet stroke="currentColor" />
                        </div>
                        <div className="min-w-0">
                          <h2 className={`text-lg sm:text-xl font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            User Wallets ({count})
                          </h2>
                          <p className={`text-xs sm:text-sm ${isDark ? 'text-white/55' : 'text-slate-500'}`}>
                            Balances in ₵ (same units as the app). Credit and debit are recorded for All Transactions.
                          </p>
                        </div>
                      </div>

                      <div className={`rounded-xl sm:rounded-2xl border overflow-hidden ${isDark ? 'bg-white/[0.04] border-white/10' : 'bg-white border-slate-200 shadow-sm'}`}>
                        <div className={`hidden md:grid grid-cols-12 gap-2 px-4 py-3 text-xs font-semibold uppercase tracking-wide border-b ${isDark ? 'border-white/10 bg-white/[0.06] text-white/50' : 'border-slate-200 bg-slate-100 text-slate-500'}`}>
                          <div className="col-span-4">User details</div>
                          <div className="col-span-2 text-center">Balance</div>
                          <div className="col-span-2">Created</div>
                          <div className="col-span-2">Last updated</div>
                          <div className="col-span-2 text-right">Actions</div>
                        </div>

                        {adminWalletsLoading && base.length === 0 ? (
                          <div className={`px-4 py-14 text-center text-sm ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Loading wallets…</div>
                        ) : filtered.length === 0 ? (
                          <div className={`px-4 py-14 text-center text-sm ${isDark ? 'text-white/50' : 'text-slate-500'}`}>
                            {base.length === 0 ? 'No users yet.' : 'No matching users.'}
                          </div>
                        ) : (
                          <div className={`divide-y max-h-[min(78vh,920px)] overflow-y-auto ${isDark ? 'divide-white/10' : 'divide-slate-100'}`}>
                            {filtered.map((w) => {
                              const name = (w.full_name || '').trim() || 'Unknown User';
                              const email = (w.email || '').trim() || 'Unknown';
                              const created = fmtWalletDate(w.created_at);
                              const updated = fmtWalletDate(w.wallet_updated_at);
                              const bal = balNum(w.balance);
                              return (
                                <div key={w.id}>
                                  <div className={`hidden md:grid grid-cols-12 gap-2 items-center px-4 py-4 ${isDark ? 'hover:bg-white/[0.04]' : 'hover:bg-slate-50'}`}>
                                    <div className="col-span-4 min-w-0">
                                      <p className={`font-semibold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{name}</p>
                                      <p className={`text-xs mt-0.5 flex items-center gap-1 truncate ${isDark ? 'text-white/45' : 'text-slate-500'}`}>
                                        <span aria-hidden>✉</span>
                                        <span className="truncate">{email}</span>
                                      </p>
                                      <p className={`text-[11px] mt-0.5 font-mono ${isDark ? 'text-white/35' : 'text-slate-400'}`}>User ID: {w.id}</p>
                                    </div>
                                    <div className="col-span-2 flex justify-center">
                                      <span className="inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold text-white bg-violet-600 shadow-sm">
                                        ₵{bal.toFixed(2)}
                                      </span>
                                    </div>
                                    <div className={`col-span-2 text-sm ${isDark ? 'text-white/70' : 'text-slate-600'}`}>{created}</div>
                                    <div className={`col-span-2 text-sm ${isDark ? 'text-white/70' : 'text-slate-600'}`}>{updated}</div>
                                    <div className="col-span-2 flex justify-end gap-2 flex-wrap">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setWalletAdjust({ row: w, mode: 'credit' });
                                          setWalletAdjustAmount('');
                                          setWalletAdjustError(null);
                                        }}
                                        className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 transition-colors"
                                      >
                                        <Svg.Plus stroke="currentColor" className="w-3.5 h-3.5" /> Credit
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setWalletAdjust({ row: w, mode: 'debit' });
                                          setWalletAdjustAmount('');
                                          setWalletAdjustError(null);
                                        }}
                                        className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors"
                                      >
                                        − Debit
                                      </button>
                                    </div>
                                  </div>
                                  <div className={`md:hidden p-4 space-y-3 ${isDark ? 'border-b border-white/10' : 'border-b border-slate-100'}`}>
                                    <div className="flex justify-between items-start gap-3">
                                      <div className="min-w-0 flex-1">
                                        <p className={`font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>{name}</p>
                                        <p className={`text-xs mt-1 flex items-center gap-1 ${isDark ? 'text-white/45' : 'text-slate-500'}`}>
                                          <span aria-hidden>✉</span>
                                          <span className="break-all">{email}</span>
                                        </p>
                                        <p className={`text-[11px] mt-0.5 font-mono ${isDark ? 'text-white/35' : 'text-slate-400'}`}>User ID: {w.id}</p>
                                      </div>
                                      <span className="inline-flex shrink-0 items-center rounded-full px-3 py-1 text-sm font-semibold text-white bg-violet-600 shadow-sm">
                                        ₵{bal.toFixed(2)}
                                      </span>
                                    </div>
                                    <div className={`grid grid-cols-2 gap-2 text-xs ${isDark ? 'text-white/55' : 'text-slate-500'}`}>
                                      <div>
                                        <span className="font-medium opacity-80">Created</span>
                                        <p className={isDark ? 'text-white/80' : 'text-slate-700'}>{created}</p>
                                      </div>
                                      <div>
                                        <span className="font-medium opacity-80">Last updated</span>
                                        <p className={isDark ? 'text-white/80' : 'text-slate-700'}>{updated}</p>
                                      </div>
                                    </div>
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setWalletAdjust({ row: w, mode: 'credit' });
                                          setWalletAdjustAmount('');
                                          setWalletAdjustError(null);
                                        }}
                                        className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2.5 rounded-xl text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500"
                                      >
                                        <Svg.Plus stroke="currentColor" className="w-4 h-4" /> Credit
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setWalletAdjust({ row: w, mode: 'debit' });
                                          setWalletAdjustAmount('');
                                          setWalletAdjustError(null);
                                        }}
                                        className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600"
                                      >
                                        − Debit
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}

                {walletAdjust != null && (
                  <div className="fixed inset-0 z-[85] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { if (!walletAdjustSaving) setWalletAdjust(null); }} aria-hidden="true" />
                    <div className={`relative w-full max-w-sm rounded-2xl p-5 sm:p-6 shadow-2xl ${isDark ? 'bg-black border border-white/10' : 'bg-white border border-slate-200'}`} onClick={(e) => e.stopPropagation()}>
                      <h3 className={`text-lg font-semibold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        {walletAdjust.mode === 'credit' ? 'Credit wallet' : 'Debit wallet'}
                      </h3>
                      <p className={`text-sm mb-4 ${isDark ? 'text-white/65' : 'text-slate-600'}`}>
                        {(walletAdjust.row.full_name || 'User').trim() || 'User'} · {(walletAdjust.row.email || '').trim() || '—'}
                      </p>
                      <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-white/90' : 'text-slate-700'}`}>Amount (₵)</label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={walletAdjustAmount}
                        onChange={(e) => setWalletAdjustAmount(e.target.value)}
                        className={`w-full px-4 py-2.5 rounded-xl border text-base mb-3 ${isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
                        placeholder="0.00"
                        autoFocus
                      />
                      {walletAdjustError && (
                        <p className={`text-sm mb-3 ${isDark ? 'text-red-400' : 'text-red-600'}`}>{walletAdjustError}</p>
                      )}
                      <div className="flex gap-3 mt-2">
                        <button
                          type="button"
                          disabled={walletAdjustSaving}
                          onClick={() => { if (!walletAdjustSaving) setWalletAdjust(null); }}
                          className={`flex-1 py-2.5 rounded-xl font-medium ${isDark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-slate-200 text-slate-800 hover:bg-slate-300'}`}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={walletAdjustSaving}
                          onClick={async () => {
                            const amt = parseFloat(walletAdjustAmount);
                            if (!Number.isFinite(amt) || amt <= 0) {
                              setWalletAdjustError('Enter a valid amount greater than 0.');
                              return;
                            }
                            setWalletAdjustSaving(true);
                            setWalletAdjustError(null);
                            try {
                              const uid = walletAdjust.row.id;
                              const data =
                                walletAdjust.mode === 'credit'
                                  ? await api.adminWalletCredit(uid, amt)
                                  : await api.adminWalletDebit(uid, amt);
                              setAdminWallets((prev) =>
                                prev.map((x) =>
                                  x.id === uid
                                    ? { ...x, balance: data.balance, wallet_updated_at: data.updated_at || x.wallet_updated_at }
                                    : x
                                )
                              );
                              setWalletAdjust(null);
                            } catch (err) {
                              setWalletAdjustError(err?.message || 'Request failed');
                            } finally {
                              setWalletAdjustSaving(false);
                            }
                          }}
                          className={`flex-1 py-2.5 rounded-xl font-semibold text-white ${walletAdjust.mode === 'credit' ? 'bg-violet-600 hover:bg-violet-500' : 'bg-red-500 hover:bg-red-600'} disabled:opacity-50`}
                        >
                          {walletAdjustSaving ? 'Saving…' : 'Confirm'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {currentPage === 'admin-applications' && (
              <div className="space-y-4 pb-8">
                {agentApplicationsError && (
                  <div className={`p-4 rounded-xl text-sm ${isDark ? 'bg-amber-500/15 border border-amber-500/30 text-amber-100' : 'bg-amber-50 border border-amber-200 text-amber-900'}`}>
                    {agentApplicationsError}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                  <div className="relative flex-1 min-w-0">
                    <span className={`absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${isDark ? 'text-white/40' : 'text-slate-400'}`} aria-hidden>
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.3-4.3" />
                      </svg>
                    </span>
                    <input
                      type="search"
                      value={agentApplicationsSearch}
                      onChange={(e) => setAgentApplicationsSearch(e.target.value)}
                      placeholder="Search by name, phone, status, or pay"
                      className={`w-full pl-10 pr-4 py-3 rounded-xl border text-sm placeholder:opacity-70 ${isDark ? 'bg-white/5 border-white/15 text-white placeholder:text-white/45' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`}
                      aria-label="Search applications"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={agentApplicationsLoading}
                    onClick={() => {
                      setAgentApplicationsLoading(true);
                      setAgentApplicationsError(null);
                      api
                        .getAgentApplications()
                        .then((list) => setAgentApplications(Array.isArray(list) ? list : []))
                        .catch((err) => {
                          setAgentApplicationsError(err?.message || 'Failed to load applications');
                          setAgentApplications([]);
                        })
                        .finally(() => setAgentApplicationsLoading(false));
                    }}
                    className={`shrink-0 px-4 py-3 rounded-xl text-sm font-semibold ${isDark ? 'bg-white/10 text-white hover:bg-white/20 disabled:opacity-50' : 'bg-slate-100 text-slate-800 hover:bg-slate-200 disabled:opacity-50'}`}
                  >
                    {agentApplicationsLoading ? 'Refreshing…' : 'Refresh'}
                  </button>
                </div>

                {(() => {
                  const shortId = (id) => {
                    const s = String(id || '').replace(/-/g, '');
                    if (s.length <= 8) return s || '—';
                    return `${s.slice(0, 8)}…`;
                  };
                  const fmtApplied = (iso) => {
                    if (!iso) return '—';
                    const t = Date.parse(iso);
                    if (Number.isNaN(t)) return '—';
                    return new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
                  };
                  const q = (agentApplicationsSearch || '').trim().toLowerCase();
                  const base = Array.isArray(agentApplications) ? agentApplications : [];
                  const filtered = !q
                    ? base
                    : base.filter((row) => {
                        const name = (row.full_name || '').toLowerCase();
                        const phone = (row.phone || '').toLowerCase().replace(/\s/g, '');
                        const st = (row.status || '').toLowerCase();
                        const pay = String(row.payment_amount ?? '');
                        const qDigits = q.replace(/\D/g, '');
                        return (
                          name.includes(q) ||
                          phone.includes(q.replace(/\s/g, '')) ||
                          st.includes(q) ||
                          pay.includes(q) ||
                          (qDigits && phone.replace(/\D/g, '').includes(qDigits))
                        );
                      });
                  const statusBadge = (st) => {
                    const s = (st || 'pending').toLowerCase();
                    if (s === 'approved') {
                      return (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${isDark ? 'bg-emerald-500/20 text-emerald-200' : 'bg-emerald-100 text-emerald-800'}`}>
                          approved
                        </span>
                      );
                    }
                    if (s === 'rejected') {
                      return (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${isDark ? 'bg-red-500/20 text-red-200' : 'bg-red-100 text-red-800'}`}>
                          rejected
                        </span>
                      );
                    }
                    return (
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${isDark ? 'bg-sky-500/20 text-sky-200' : 'bg-sky-100 text-sky-800'}`}>
                        <Svg.Clock stroke="currentColor" className="w-3 h-3 shrink-0" />
                        pending
                      </span>
                    );
                  };

                  return (
                    <>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`flex items-center justify-center w-11 h-11 rounded-xl shrink-0 ${isDark ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-800'}`}>
                          <Svg.User stroke="currentColor" />
                        </div>
                        <div className="min-w-0">
                          <h2 className={`text-lg sm:text-xl font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            Applications ({base.length})
                          </h2>
                        </div>
                      </div>

                      <div className={`rounded-xl sm:rounded-2xl border overflow-hidden ${isDark ? 'bg-white/[0.04] border-white/10' : 'bg-white border-slate-200 shadow-sm'}`}>
                        <div className={`hidden md:grid grid-cols-12 gap-2 px-4 py-3 text-xs font-semibold border-b ${isDark ? 'border-white/10 bg-white/[0.06] text-white/50' : 'border-slate-200 bg-slate-100 text-slate-500'}`}>
                          <div className="col-span-4">Applicant</div>
                          <div className="col-span-2">Contact</div>
                          <div className="col-span-2">Payment</div>
                          <div className="col-span-2">Applied</div>
                          <div className="col-span-2 text-right">Actions</div>
                        </div>

                        {agentApplicationsLoading && base.length === 0 ? (
                          <div className={`px-4 py-14 text-center text-sm ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Loading applications…</div>
                        ) : filtered.length === 0 ? (
                          <div className={`px-4 py-14 text-center text-sm ${isDark ? 'text-white/50' : 'text-slate-500'}`}>
                            {base.length === 0 ? 'No applications yet.' : 'No matching applications.'}
                          </div>
                        ) : (
                          <div className={`divide-y max-h-[min(78vh,920px)] overflow-y-auto ${isDark ? 'divide-white/10' : 'divide-slate-100'}`}>
                            {filtered.map((row) => (
                              <div key={row.id}>
                                <div className={`hidden md:grid grid-cols-12 gap-2 items-center px-4 py-4 ${isDark ? 'hover:bg-white/[0.04]' : 'hover:bg-slate-50'}`}>
                                  <div className="col-span-4 min-w-0">
                                    <p className={`font-semibold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{(row.full_name || '').trim() || '—'}</p>
                                    <p className={`text-xs mt-0.5 ${isDark ? 'text-white/45' : 'text-slate-500'}`}>ID: {shortId(row.id)}</p>
                                  </div>
                                  <div className={`col-span-2 text-sm font-mono ${isDark ? 'text-white/85' : 'text-slate-800'}`}>{row.phone || '—'}</div>
                                  <div className="col-span-2">
                                    <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>₵{Number(row.payment_amount ?? 0).toFixed(0)}</p>
                                    <div className="mt-1">{statusBadge(row.status)}</div>
                                  </div>
                                  <div className={`col-span-2 text-sm ${isDark ? 'text-white/70' : 'text-slate-600'}`}>{fmtApplied(row.applied_at)}</div>
                                  <div className="col-span-2 flex justify-end">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setAgentAppReview(row);
                                        setAgentAppReviewError(null);
                                      }}
                                      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border ${isDark ? 'border-white/20 bg-white/5 text-white hover:bg-white/10' : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'}`}
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                                        <circle cx="12" cy="12" r="3" />
                                      </svg>
                                      Review
                                    </button>
                                  </div>
                                </div>
                                <div className={`md:hidden p-4 space-y-3 ${isDark ? 'border-b border-white/10' : 'border-b border-slate-100'}`}>
                                  <div className="flex justify-between items-start gap-2">
                                    <div className="min-w-0">
                                      <p className={`font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>{(row.full_name || '').trim() || '—'}</p>
                                      <p className={`text-xs mt-0.5 ${isDark ? 'text-white/45' : 'text-slate-500'}`}>ID: {shortId(row.id)}</p>
                                    </div>
                                    {statusBadge(row.status)}
                                  </div>
                                  <p className={`text-sm font-mono ${isDark ? 'text-white/80' : 'text-slate-700'}`}>{row.phone || '—'}</p>
                                  <p className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>₵{Number(row.payment_amount ?? 0).toFixed(0)}</p>
                                  <p className={`text-xs ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Applied {fmtApplied(row.applied_at)}</p>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setAgentAppReview(row);
                                      setAgentAppReviewError(null);
                                    }}
                                    className={`w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold border ${isDark ? 'border-white/20 bg-white/5 text-white hover:bg-white/10' : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'}`}
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                                      <circle cx="12" cy="12" r="3" />
                                    </svg>
                                    Review
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}

                {agentAppReview != null && (
                  <div className="fixed inset-0 z-[85] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { if (!agentAppReviewSaving) setAgentAppReview(null); }} aria-hidden="true" />
                    <div className={`relative w-full max-w-md rounded-2xl p-5 sm:p-6 shadow-2xl ${isDark ? 'bg-black border border-white/10' : 'bg-white border border-slate-200'}`} onClick={(e) => e.stopPropagation()}>
                      <h3 className={`text-lg font-semibold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>Review application</h3>
                      <p className={`text-sm mb-4 ${isDark ? 'text-white/65' : 'text-slate-600'}`}>
                        {(agentAppReview.full_name || '').trim() || 'Applicant'} · {agentAppReview.phone || '—'}
                      </p>
                      <dl className={`space-y-2 text-sm mb-4 ${isDark ? 'text-white/80' : 'text-slate-700'}`}>
                        <div className="flex justify-between gap-4">
                          <dt className={isDark ? 'text-white/50' : 'text-slate-500'}>Ghana card</dt>
                          <dd className="font-medium">{agentAppReview.ghana_card_number || '—'}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className={isDark ? 'text-white/50' : 'text-slate-500'}>Occupation</dt>
                          <dd className="font-medium">{agentAppReview.occupation || '—'}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className={isDark ? 'text-white/50' : 'text-slate-500'}>Date of birth</dt>
                          <dd className="font-medium">{agentAppReview.date_of_birth || '—'}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className={isDark ? 'text-white/50' : 'text-slate-500'}>Payment</dt>
                          <dd className="font-semibold">₵{Number(agentAppReview.payment_amount ?? 0).toFixed(0)}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className={isDark ? 'text-white/50' : 'text-slate-500'}>Applied</dt>
                          <dd>{agentAppReview.applied_at ? new Date(agentAppReview.applied_at).toLocaleString() : '—'}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className={isDark ? 'text-white/50' : 'text-slate-500'}>Status</dt>
                          <dd className="capitalize">{agentAppReview.status || 'pending'}</dd>
                        </div>
                      </dl>
                      {agentAppReviewError && (
                        <p className={`text-sm mb-3 ${isDark ? 'text-red-400' : 'text-red-600'}`}>{agentAppReviewError}</p>
                      )}
                      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                        <button
                          type="button"
                          disabled={agentAppReviewSaving}
                          onClick={() => { if (!agentAppReviewSaving) setAgentAppReview(null); }}
                          className={`flex-1 py-2.5 rounded-xl font-medium ${isDark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-slate-200 text-slate-800 hover:bg-slate-300'}`}
                        >
                          Close
                        </button>
                        <button
                          type="button"
                          disabled={agentAppReviewSaving || (agentAppReview.status || '').toLowerCase() === 'approved'}
                          onClick={async () => {
                            setAgentAppReviewSaving(true);
                            setAgentAppReviewError(null);
                            try {
                              const updated = await api.patchAgentApplication(agentAppReview.id, { status: 'approved' });
                              setAgentApplications((prev) => prev.map((x) => (String(x.id) === String(updated.id) ? { ...x, ...updated } : x)));
                              setAgentAppReview(null);
                            } catch (err) {
                              setAgentAppReviewError(err?.message || 'Request failed');
                            } finally {
                              setAgentAppReviewSaving(false);
                            }
                          }}
                          className="flex-1 py-2.5 rounded-xl font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
                        >
                          {agentAppReviewSaving ? 'Saving…' : 'Approve'}
                        </button>
                        <button
                          type="button"
                          disabled={agentAppReviewSaving || (agentAppReview.status || '').toLowerCase() === 'rejected'}
                          onClick={async () => {
                            setAgentAppReviewSaving(true);
                            setAgentAppReviewError(null);
                            try {
                              const updated = await api.patchAgentApplication(agentAppReview.id, { status: 'rejected' });
                              setAgentApplications((prev) => prev.map((x) => (String(x.id) === String(updated.id) ? { ...x, ...updated } : x)));
                              setAgentAppReview(null);
                            } catch (err) {
                              setAgentAppReviewError(err?.message || 'Request failed');
                            } finally {
                              setAgentAppReviewSaving(false);
                            }
                          }}
                          className="flex-1 py-2.5 rounded-xl font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {currentPage === 'admin-broadcasts' && (
              <div className="space-y-6 pb-10">
                {adminBroadcastsError && (
                  <div className={`p-4 rounded-xl text-sm ${isDark ? 'bg-rose-500/15 border border-rose-500/35 text-rose-100' : 'bg-rose-50 border border-rose-200 text-rose-900'}`}>
                    {adminBroadcastsError}
                  </div>
                )}

                <div
                  id="broadcast-editor-card"
                  className={`rounded-xl sm:rounded-2xl border p-4 sm:p-6 ${isDark ? 'bg-white/[0.06] border-white/10' : 'bg-white border-slate-200 shadow-sm'}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
                    <h2 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      {broadcastEditingId ? 'Edit broadcast' : 'New broadcast'}
                    </h2>
                    {broadcastEditingId ? (
                      <button
                        type="button"
                        onClick={() => {
                          setBroadcastEditingId(null);
                          setBroadcastForm({
                            title: '',
                            caption: '',
                            image_url: '',
                            active: true,
                            popup_delay_seconds: 2,
                            auto_close_seconds: 0,
                            reshow_after_hours: 0,
                            cta_url: '',
                            cta_label: '',
                            cta_open_new_tab: true,
                          });
                        }}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg border ${isDark ? 'border-white/20 text-white/90 hover:bg-white/10' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                      >
                        Cancel edit
                      </button>
                    ) : null}
                  </div>
                  <p className={`text-sm mb-4 ${isDark ? 'text-white/60' : 'text-slate-600'}`}>
                    Upload an image, add a headline and optional message, then publish. Use Edit on a row below to load it here and save changes. Add a button link (https only), delay, auto-close, and how soon the promo can show again after they dismiss it.
                  </p>
                  <input
                    ref={broadcastFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (!f || !f.type.startsWith('image/')) return;
                      if (f.size > 900 * 1024) {
                        setAdminBroadcastsError('Image too large (max ~900KB). Choose a smaller file.');
                        return;
                      }
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        const url = typeof reader.result === 'string' ? reader.result : '';
                        setBroadcastForm((prev) => ({ ...prev, image_url: url }));
                      };
                      reader.readAsDataURL(f);
                    }}
                  />
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => broadcastFileInputRef.current?.click()}
                        className={`px-4 py-2.5 rounded-xl text-sm font-semibold border ${isDark ? 'border-white/20 bg-white/5 text-white hover:bg-white/10' : 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100'}`}
                      >
                        Choose image
                      </button>
                    </div>
                    {broadcastForm.image_url ? (
                      <div className="flex gap-3 items-start">
                        <img src={broadcastForm.image_url} alt="Preview" className="w-24 h-24 rounded-lg object-cover border border-white/10" />
                        <button
                          type="button"
                          title="Remove image"
                          aria-label="Remove image"
                          onClick={() => setBroadcastForm((p) => ({ ...p, image_url: '' }))}
                          className={`shrink-0 w-10 h-10 rounded-xl border flex items-center justify-center transition-colors ${
                            isDark
                              ? 'border-white/20 text-red-300 hover:bg-red-500/15 hover:border-red-400/40'
                              : 'border-slate-200 text-red-600 hover:bg-red-50 hover:border-red-200'
                          }`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M3 6h18" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            <line x1="10" y1="11" x2="10" y2="17" />
                            <line x1="14" y1="11" x2="14" y2="17" />
                          </svg>
                        </button>
                      </div>
                    ) : null}
                    <label className={`block text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-white/50' : 'text-slate-500'}`}>
                      Title (headline)
                    </label>
                    <input
                      type="text"
                      value={broadcastForm.title}
                      onChange={(e) => setBroadcastForm((p) => ({ ...p, title: e.target.value.slice(0, 160) }))}
                      placeholder="e.g. New data bundles, Holiday promo"
                      maxLength={160}
                      className={`w-full px-4 py-3 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-violet-500/45 focus:border-violet-500/55 ${
                        isDark ? 'bg-white/5 border-white/15 text-white placeholder:text-white/40' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'
                      }`}
                    />
                    <p className={`text-[11px] ${isDark ? 'text-white/35' : 'text-slate-500'}`}>
                      Shown as the main line under the image. If empty, customers see “Announcement from DataPlus”.
                    </p>
                    <label className={`block text-xs font-semibold uppercase tracking-wide mt-3 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>
                      Message (optional)
                    </label>
                    <BroadcastRichEditor
                      value={broadcastForm.caption}
                      onChange={(html) => setBroadcastForm((p) => ({ ...p, caption: html }))}
                      isDark={isDark}
                      placeholder="Paste or type supporting text. URLs like https://… show as buttons in the customer popup."
                    />
                    <label className={`block text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Button link (optional)</label>
                    <input
                      type="text"
                      inputMode="url"
                      autoComplete="url"
                      value={broadcastForm.cta_url}
                      onChange={(e) => setBroadcastForm((p) => ({ ...p, cta_url: e.target.value }))}
                      placeholder="yoursite.com/page or https://…"
                      className={`w-full px-4 py-3 rounded-xl border text-sm ${isDark ? 'bg-white/5 border-white/15 text-white placeholder:text-white/40' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`}
                    />
                    <p className={`text-[11px] mt-1 ${isDark ? 'text-white/40' : 'text-slate-500'}`}>
                      If you omit https://, it is added automatically. Only http(s) links work for the button.
                    </p>
                    <label className={`block text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Button label</label>
                    <input
                      type="text"
                      value={broadcastForm.cta_label}
                      onChange={(e) => setBroadcastForm((p) => ({ ...p, cta_label: e.target.value.slice(0, 80) }))}
                      placeholder="e.g. Shop now, View plans"
                      maxLength={80}
                      className={`w-full px-4 py-3 rounded-xl border text-sm ${isDark ? 'bg-white/5 border-white/15 text-white placeholder:text-white/40' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`}
                    />
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={broadcastForm.cta_open_new_tab}
                        onChange={(e) => setBroadcastForm((p) => ({ ...p, cta_open_new_tab: e.target.checked }))}
                        className="rounded border-slate-300"
                      />
                      <span className={`text-sm ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Open link in new tab</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={broadcastForm.active}
                        onChange={(e) => setBroadcastForm((p) => ({ ...p, active: e.target.checked }))}
                        className="rounded border-slate-300"
                      />
                      <span className={`text-sm ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Active (show to users)</span>
                    </label>
                    <div className="grid sm:grid-cols-3 gap-3">
                      <div>
                        <label className={`block text-xs font-semibold uppercase tracking-wide mb-1 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Delay before popup (sec)</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          autoCorrect="off"
                          spellCheck={false}
                          aria-label="Delay before popup in seconds"
                          placeholder="e.g. 2"
                          value={broadcastForm.popup_delay_seconds === 0 ? '' : String(broadcastForm.popup_delay_seconds)}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, '').slice(0, 3);
                            if (digits === '') {
                              setBroadcastForm((p) => ({ ...p, popup_delay_seconds: 0 }));
                              return;
                            }
                            const n = Math.min(600, Math.max(0, parseInt(digits, 10)));
                            setBroadcastForm((p) => ({ ...p, popup_delay_seconds: n }));
                          }}
                          className={`broadcast-timing-input w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/45 focus:border-violet-500/60 ${
                            isDark
                              ? 'bg-white/5 border-white/15 text-white placeholder:text-white/35'
                              : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'
                          }`}
                        />
                      </div>
                      <div>
                        <label className={`block text-xs font-semibold uppercase tracking-wide mb-1 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>
                          Auto-close (seconds)
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          autoCorrect="off"
                          spellCheck={false}
                          aria-label="Auto-close after seconds, empty for off"
                          placeholder="Off"
                          value={broadcastForm.auto_close_seconds === 0 ? '' : String(broadcastForm.auto_close_seconds)}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, '').slice(0, 5);
                            if (digits === '') {
                              setBroadcastForm((p) => ({ ...p, auto_close_seconds: 0 }));
                              return;
                            }
                            const n = Math.min(86400, Math.max(0, parseInt(digits, 10)));
                            setBroadcastForm((p) => ({ ...p, auto_close_seconds: n }));
                          }}
                          className={`broadcast-timing-input w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/45 focus:border-violet-500/60 ${
                            isDark
                              ? 'bg-white/5 border-white/15 text-white placeholder:text-white/35'
                              : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'
                          }`}
                        />
                        <p className={`text-[10px] mt-1 ${isDark ? 'text-white/35' : 'text-slate-400'}`}>Leave empty to keep the popup open until the user closes it.</p>
                      </div>
                      <div>
                        <label className={`block text-xs font-semibold uppercase tracking-wide mb-1 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>
                          Show again after (hours)
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          autoCorrect="off"
                          spellCheck={false}
                          aria-label="Show again after hours, empty for never"
                          placeholder="Never"
                          value={broadcastForm.reshow_after_hours === 0 ? '' : String(broadcastForm.reshow_after_hours)}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
                            if (digits === '') {
                              setBroadcastForm((p) => ({ ...p, reshow_after_hours: 0 }));
                              return;
                            }
                            const n = Math.min(8760, Math.max(0, parseInt(digits, 10)));
                            setBroadcastForm((p) => ({ ...p, reshow_after_hours: n }));
                          }}
                          className={`broadcast-timing-input w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/45 focus:border-violet-500/60 ${
                            isDark
                              ? 'bg-white/5 border-white/15 text-white placeholder:text-white/35'
                              : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'
                          }`}
                        />
                        <p className={`text-[10px] mt-1 ${isDark ? 'text-white/35' : 'text-slate-400'}`}>
                          Leave empty so after close it never shows again.
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center pt-1">
                    <button
                      type="button"
                      disabled={broadcastSaving || !String(broadcastForm.image_url || '').trim()}
                      onClick={async () => {
                        setBroadcastSaving(true);
                        setAdminBroadcastsError(null);
                        try {
                          const ctaWant = String(broadcastForm.cta_url || '').trim();
                          const ctaNormalized = normalizeBroadcastCtaUrlForApi(broadcastForm.cta_url);
                          if (ctaWant && !ctaNormalized) {
                            setAdminBroadcastsError(
                              'Button link must be a valid website address (e.g. dataplus.com or https://…).'
                            );
                            setBroadcastSaving(false);
                            return;
                          }
                          const payload = {
                            title: broadcastForm.title,
                            caption: broadcastForm.caption,
                            image_url: broadcastForm.image_url.trim(),
                            active: broadcastForm.active,
                            popup_delay_seconds: broadcastForm.popup_delay_seconds,
                            auto_close_seconds: broadcastForm.auto_close_seconds,
                            reshow_after_hours: broadcastForm.reshow_after_hours,
                            cta_url: ctaNormalized,
                            cta_label: broadcastForm.cta_label.trim(),
                            cta_open_new_tab: broadcastForm.cta_open_new_tab,
                          };
                          if (broadcastEditingId) {
                            await api.updateAdminBroadcast(broadcastEditingId, payload);
                          } else {
                            await api.createAdminBroadcast(payload);
                          }
                          setBroadcastEditingId(null);
                          setBroadcastForm({
                            title: '',
                            caption: '',
                            image_url: '',
                            active: true,
                            popup_delay_seconds: 2,
                            auto_close_seconds: 0,
                            reshow_after_hours: 0,
                            cta_url: '',
                            cta_label: '',
                            cta_open_new_tab: true,
                          });
                          const list = await api.getAdminBroadcasts();
                          setAdminBroadcasts(Array.isArray(list) ? list : []);
                          try {
                            const pub = await api.getBroadcasts();
                            if (mountedRef.current) setPublicBroadcasts(Array.isArray(pub) ? pub : []);
                          } catch {
                            /* ignore */
                          }
                        } catch (err) {
                          setAdminBroadcastsError(err?.message || 'Failed to save');
                        } finally {
                          setBroadcastSaving(false);
                        }
                      }}
                      className="w-full sm:w-auto px-6 py-3 rounded-xl font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-50"
                    >
                      {broadcastSaving
                        ? broadcastEditingId
                          ? 'Saving…'
                          : 'Publishing…'
                        : broadcastEditingId
                          ? 'Save changes'
                          : 'Publish broadcast'}
                    </button>
                    <button
                      type="button"
                      disabled={!String(broadcastForm.image_url || '').trim()}
                      onClick={() =>
                        setAdminBroadcastPreview({
                          id: '__draft__',
                          image_url: broadcastForm.image_url.trim(),
                          title: broadcastForm.title,
                          caption: broadcastForm.caption,
                          active: broadcastForm.active,
                          cta_url: broadcastForm.cta_url,
                          cta_label: broadcastForm.cta_label,
                          cta_open_new_tab: broadcastForm.cta_open_new_tab,
                        })
                      }
                      className={`w-full sm:w-auto px-6 py-3 rounded-xl font-semibold border transition-colors disabled:opacity-50 ${isDark ? 'border-violet-400/40 text-violet-200 hover:bg-white/10' : 'border-violet-200 text-violet-800 bg-white hover:bg-violet-50'}`}
                    >
                      Preview (unsaved)
                    </button>
                    </div>
                  </div>
                </div>

                <div className={`rounded-xl sm:rounded-2xl border overflow-hidden ${isDark ? 'bg-white/[0.04] border-white/10' : 'bg-white border-slate-200 shadow-sm'}`}>
                  <div className={`px-4 py-3 border-b flex justify-between items-center ${isDark ? 'border-white/10 bg-white/[0.06]' : 'border-slate-200 bg-slate-50'}`}>
                    <h3 className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>All broadcasts</h3>
                    <button
                      type="button"
                      disabled={adminBroadcastsLoading}
                      onClick={() => {
                        setAdminBroadcastsLoading(true);
                        api
                          .getAdminBroadcasts()
                          .then((list) => setAdminBroadcasts(Array.isArray(list) ? list : []))
                          .catch((err) => setAdminBroadcastsError(err?.message || 'Refresh failed'))
                          .finally(() => setAdminBroadcastsLoading(false));
                      }}
                      className={`text-sm font-semibold ${isDark ? 'text-violet-300' : 'text-violet-600'}`}
                    >
                      {adminBroadcastsLoading ? '…' : 'Refresh'}
                    </button>
                  </div>
                  {adminBroadcastsLoading && adminBroadcasts.length === 0 ? (
                    <div className={`p-10 text-center text-sm ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Loading…</div>
                  ) : adminBroadcasts.length === 0 ? (
                    <div className={`p-10 text-center text-sm ${isDark ? 'text-white/50' : 'text-slate-500'}`}>No broadcasts yet.</div>
                  ) : (
                    <ul className={`divide-y max-h-[min(70vh,640px)] overflow-y-auto ${isDark ? 'divide-white/10' : 'divide-slate-100'}`}>
                      {adminBroadcasts.map((row) => (
                        <li key={row.id} className={`p-4 flex flex-col sm:flex-row gap-4 ${isDark ? 'hover:bg-white/[0.04]' : 'hover:bg-slate-50'}`}>
                          <img src={row.image_url} alt="" className="w-full sm:w-28 h-40 sm:h-28 rounded-lg object-cover shrink-0 border border-black/10" />
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                              {sanitizeBroadcastTitle(row.title) ||
                                broadcastPlainTextPreview(row.caption) ||
                                '(no title or message)'}
                            </p>
                            {sanitizeBroadcastTitle(row.title) && broadcastPlainTextPreview(row.caption) ? (
                              <p className={`text-xs mt-1 line-clamp-2 ${isDark ? 'text-white/55' : 'text-slate-600'}`}>
                                {broadcastPlainTextPreview(row.caption)}
                              </p>
                            ) : null}
                            <p className={`text-xs mt-1 ${isDark ? 'text-white/45' : 'text-slate-500'}`}>
                              {row.active === false ? <span className="text-amber-500 font-semibold">Inactive · </span> : null}
                              {row.created_at ? new Date(row.created_at).toLocaleString() : ''}
                            </p>
                            <p className={`text-xs mt-1 ${isDark ? 'text-violet-300/80' : 'text-violet-700'}`}>
                              Popup after {row.popup_delay_seconds ?? 2}s · Auto-close{' '}
                              {Number(row.auto_close_seconds) > 0 ? `${row.auto_close_seconds}s` : 'off'} · After close:{' '}
                              {Number(row.reshow_after_hours) > 0 ? `show again after ${row.reshow_after_hours}h` : 'never again'}
                            </p>
                            {String(row.cta_url || '').trim() ? (
                              <p className={`text-xs mt-1 ${isDark ? 'text-emerald-300/85' : 'text-emerald-800'}`}>
                                Link button: “{String(row.cta_label || '').trim() || 'Learn more'}”
                                {row.cta_open_new_tab === false ? ' · same tab' : ' · new tab'}
                              </p>
                            ) : null}
                            <div className="flex flex-wrap gap-2 mt-3">
                              <button
                                type="button"
                                onClick={() => setAdminBroadcastPreview(row)}
                                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border ${isDark ? 'border-violet-400/35 text-violet-200 bg-violet-500/15 hover:bg-violet-500/25' : 'border-violet-200 text-violet-800 bg-violet-50 hover:bg-violet-100'}`}
                              >
                                Preview
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setBroadcastEditingId(String(row.id));
                                  setAdminBroadcastsError(null);
                                  setBroadcastForm({
                                    title: sanitizeBroadcastTitle(row.title) || '',
                                    caption: String(row.caption || ''),
                                    image_url: String(row.image_url || '').trim(),
                                    active: row.active !== false,
                                    popup_delay_seconds:
                                      Number(row.popup_delay_seconds) >= 0 ? Number(row.popup_delay_seconds) : 2,
                                    auto_close_seconds:
                                      Number(row.auto_close_seconds) >= 0 ? Number(row.auto_close_seconds) : 0,
                                    reshow_after_hours:
                                      Number(row.reshow_after_hours) >= 0 ? Number(row.reshow_after_hours) : 0,
                                    cta_url: String(row.cta_url || ''),
                                    cta_label: String(row.cta_label || ''),
                                    cta_open_new_tab: row.cta_open_new_tab !== false,
                                  });
                                  document.getElementById('broadcast-editor-card')?.scrollIntoView({
                                    behavior: 'smooth',
                                    block: 'start',
                                  });
                                }}
                                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border ${isDark ? 'border-sky-400/40 text-sky-100 bg-sky-500/15 hover:bg-sky-500/25' : 'border-sky-200 text-sky-900 bg-sky-50 hover:bg-sky-100'}`}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    const nextActive = !row.active;
                                    await api.updateAdminBroadcast(row.id, { active: nextActive });
                                    setAdminBroadcasts((prev) =>
                                      prev.map((x) => (String(x.id) === String(row.id) ? { ...x, active: nextActive } : x))
                                    );
                                    try {
                                      const pub = await api.getBroadcasts();
                                      if (mountedRef.current) setPublicBroadcasts(Array.isArray(pub) ? pub : []);
                                    } catch {
                                      /* ignore */
                                    }
                                    if (nextActive) {
                                      clearBroadcastDismissEntry(row.id);
                                      setBroadcastDismissTick((t) => t + 1);
                                    }
                                  } catch (err) {
                                    setAdminBroadcastsError(err?.message || 'Update failed');
                                  }
                                }}
                                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border ${isDark ? 'border-white/20 text-white' : 'border-slate-200 text-slate-800'}`}
                              >
                                {row.active === false ? 'Activate' : 'Deactivate'}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const t = (sanitizeBroadcastTitle(row.title) || '').trim();
                                  setBroadcastDeleteConfirm({
                                    id: row.id,
                                    title: t || 'Untitled broadcast',
                                  });
                                }}
                                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-500/90 text-white hover:bg-red-600"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {!['admin', 'admin-analytics', 'admin-users', 'admin-orders', 'admin-packages', 'admin-all-transactions', 'admin-wallet', 'admin-applications', 'admin-broadcasts', 'admin-support'].includes(currentPage) && (
              <div className={`rounded-xl sm:rounded-2xl p-8 text-center border ${isDark ? 'bg-white/5 border-white/10 text-white/70' : 'bg-white border-slate-200 text-slate-500'}`}>
                <p className="text-base">Details for this section will be added here.</p>
              </div>
            )}

            {currentPage === 'admin' && (
              <div className="pt-2 sm:pt-4">
                <div className="telesopy-chat-row">
                  <div className="telesopy-grid-btn-wrap">
                    <input
                      ref={ultraxasFileInputRef}
                      type="file"
                      accept="image/*"
                      className="telesopy-file-input"
                      onChange={(e) => { e.target.value = ''; }}
                    />
                    <button type="button" className="telesopy-sidebar-btn" aria-label="Upload image" onClick={handleUltraxasUploadClick}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </button>
                  </div>
                  <div className="telesopy-chat-bar-wrap">
                    <UltraxasChatBar
                      value={ultraxasChatInput}
                      onChange={setUltraxasChatInput}
                      onSubmit={sendUltraxasChatMessage}
                      placeholder="Ask anything"
                      isDark={isDark}
                    />
                  </div>
                </div>
              </div>
            )}

            {currentPage === 'admin-analytics' && adminStatsLoading ? (
              <div className={`rounded-xl p-8 text-center ${isDark ? 'text-white/60' : 'text-slate-500'}`}>Loading admin stats…</div>
            ) : currentPage === 'admin-analytics' && adminStats ? (
              <>
                <section className="mb-8">
                  <h2 className={`text-lg font-semibold mb-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>Today&apos;s overview</h2>
                  <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 sm:gap-4 mb-4`}>
                    {[
                      { label: 'Daily orders', value: adminStats.dailyOrders ?? 0, key: 'dailyOrders' },
                      { label: 'Processing (today)', value: adminStats.dailyProcessing ?? 0, key: 'dailyProcessing' },
                      { label: 'Completed (today)', value: adminStats.dailyCompleted ?? 0, key: 'dailyCompleted' },
                      { label: 'Daily revenue (¢)', value: Number(adminStats.dailyRevenue ?? 0).toFixed(2), key: 'dailyRevenue' },
                      { label: 'Daily transactions', value: adminStats.dailyTransactionCount ?? 0, key: 'dailyTx' },
                      { label: 'Net flow (¢)', value: Number(adminStats.dailyNetFlow ?? 0).toFixed(2), key: 'dailyNetFlow' },
                      { label: 'Credits in (¢)', value: Number(adminStats.dailyTopUps ?? 0).toFixed(2), key: 'dailyCredits' },
                    ].map(({ label, value, key }) => (
                      <div key={key} className={`rounded-xl sm:rounded-2xl p-4 sm:p-5 border ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200 shadow-sm'}`}>
                        <p className={`text-xs font-medium uppercase tracking-wider mb-1 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>{label}</p>
                        <p className={`text-xl sm:text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{value}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="mb-8">
                  <h2 className={`text-lg font-semibold mb-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>All-time analysis</h2>
                  <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-3 sm:gap-4 mb-4`}>
                    {[
                      { label: 'Total users', value: adminStats.userCount ?? 0, key: 'users' },
                      { label: 'Total orders', value: adminStats.orderCount ?? 0, key: 'orders' },
                      { label: 'Processing', value: adminStats.processingOrders ?? 0, key: 'processing' },
                      { label: 'Completed', value: adminStats.completedOrders ?? 0, key: 'completed' },
                      { label: 'Revenue (¢)', value: Number(adminStats.totalRevenue ?? 0).toFixed(2), key: 'revenue' },
                      { label: 'Top-ups / credits (¢)', value: Number(adminStats.totalTopUps ?? 0).toFixed(2), key: 'topups' },
                      { label: 'Total wallet balance (¢)', value: Number(adminTotalWalletBalance ?? 0).toFixed(2), key: 'walletBal' },
                      { label: 'Data packages sold', value: adminStats.orderCount ?? 0, key: 'packages' },
                      { label: 'Admins', value: adminStats.adminCount ?? 0, key: 'admins' },
                    ].map(({ label, value, key }) => (
                      <div key={key} className={`rounded-xl sm:rounded-2xl p-4 sm:p-5 border ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200 shadow-sm'}`}>
                        <p className={`text-xs font-medium uppercase tracking-wider mb-1 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>{label}</p>
                        <p className={`text-xl sm:text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{value}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <h2 className={`text-lg font-semibold mb-3 ${isDark ? 'text-white' : 'text-slate-900'}`}>Recent users</h2>
                <div className={`rounded-xl sm:rounded-2xl overflow-hidden border ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'}`}>
                  {!recentUsersExpanded ? (
                    <div className={`px-4 py-4 flex items-center justify-between gap-4 ${isDark ? 'text-white/80' : 'text-slate-600'}`}>
                      <span className="text-sm">
                        {adminUsers.length === 0 ? 'No users' : `${adminUsers.length} user${adminUsers.length === 1 ? '' : 's'}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => setRecentUsersExpanded(true)}
                        className={`text-sm font-medium underline underline-offset-2 ${isDark ? 'text-white hover:text-white/90' : 'text-slate-700 hover:text-slate-900'}`}
                      >
                        See all
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className={`overflow-x-auto`}>
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className={`border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                              <th className={`px-4 py-3 font-medium ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Email</th>
                              <th className={`px-4 py-3 font-medium ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Name</th>
                              <th className={`px-4 py-3 font-medium ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Role</th>
                              <th className={`px-4 py-3 font-medium ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Joined</th>
                              <th className={`px-4 py-3 font-medium ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {adminUsers.length === 0 ? (
                              <tr><td colSpan={5} className={`px-4 py-6 text-center ${isDark ? 'text-white/50' : 'text-slate-500'}`}>No users</td></tr>
                            ) : (
                              adminUsers.map((u) => (
                                <tr key={u.id} className={`border-b last:border-0 ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
                                  <td className={`px-4 py-3 ${isDark ? 'text-white' : 'text-slate-900'}`}>{u.email}</td>
                                  <td className={`px-4 py-3 ${isDark ? 'text-white/80' : 'text-slate-600'}`}>{u.full_name || '—'}</td>
                                  <td className={`px-4 py-3 ${isDark ? 'text-white/80' : 'text-slate-600'}`}>{u.role || 'user'}</td>
                                  <td className={`px-4 py-3 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                                  <td className="px-4 py-3">
                                    {String(u.id) === String(user?.id) ? (
                                      <span className={`text-xs ${isDark ? 'text-white/40' : 'text-slate-400'}`}>—</span>
                                    ) : (
                                      <button
                                        type="button"
                                        disabled={adminDeleteUserUpdating === u.id || adminRoleUpdating === u.id}
                                        onClick={async () => {
                                          const label = (u.full_name || u.email || 'this user').trim();
                                          const ok = window.confirm(`Delete ${label}'s account?\n\nThey will no longer be able to log in.`);
                                          if (!ok) return;
                                          setAdminDeleteUserUpdating(u.id);
                                          try {
                                            await api.deleteAdminUser(u.id);
                                            setAdminUsers((prev) => prev.filter((x) => x.id !== u.id));
                                          } catch (err) {
                                            alert(err?.message || 'Failed to delete user');
                                          } finally {
                                            setAdminDeleteUserUpdating(null);
                                          }
                                        }}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                                          isDark ? 'bg-rose-700 hover:bg-rose-600 text-white' : 'bg-rose-700 hover:bg-rose-800 text-white'
                                        }`}
                                      >
                                        {adminDeleteUserUpdating === u.id ? '…' : 'Delete'}
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                      <div className={`px-4 py-2 border-t ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                        <button
                          type="button"
                          onClick={() => setRecentUsersExpanded(false)}
                          className={`text-sm font-medium underline underline-offset-2 ${isDark ? 'text-white/80 hover:text-white' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                          Show less
                        </button>
                      </div>
                    </>
                  )}
                </div>

              </>
            ) : null}

          </>
        ) : (
          <>
            <div className="pt-14 sm:pt-20 pb-5 sm:pb-6 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <h1 className="page-title text-2xl sm:text-3xl truncate">Profile</h1>
              </div>
              <button
                type="button"
                onClick={() => setCurrentPage('dashboard')}
                className={`flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0 transition-colors ${isDark ? 'text-white/80 hover:bg-white/10' : 'text-slate-700 hover:bg-slate-200'}`}
                aria-label="Back to dashboard"
              >
                <Svg.ArrowLeft width={24} height={24} aria-hidden className="shrink-0" />
              </button>
            </div>

            <div className="mb-5 sm:mb-6">
              <h2 className={`text-2xl sm:text-3xl font-bold mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>My Profile</h2>
              <p className={`text-base ${isDark ? 'text-white/70' : 'text-slate-500'}`}>Manage your account settings and preferences</p>
            </div>

            <div className={`rounded-xl sm:rounded-2xl overflow-hidden mb-5 sm:mb-6 ${isDark ? 'bg-black border border-white/10' : 'bg-white border border-slate-200'}`}>
              <div className={`p-5 sm:p-6 border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                <h3 className={`text-xl font-semibold mb-1.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>Profile Information</h3>
                <p className={`text-sm ${isDark ? 'text-white/70' : 'text-slate-500'}`}>Update your account's profile information and email address.</p>
              </div>
              <div className="p-5 sm:p-6 flex flex-col items-center">
                <div className="relative mb-4">
                  <div
                    className={`w-40 h-40 sm:w-48 sm:h-48 rounded-full flex items-center justify-center text-white text-4xl sm:text-5xl font-bold shadow-lg overflow-hidden cursor-pointer ${adminAvatarSrc ? 'bg-gradient-to-br from-blue-500 to-purple-600' : (isDark ? 'bg-white/5 border-2 border-dashed border-white/25' : 'bg-slate-100 border-2 border-dashed border-slate-300')}`}
                    onClick={triggerFileInput}
                  >
                    {adminAvatarSrc ? (
                      <img src={adminAvatarSrc} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-2">
                        <span className={`text-sm font-semibold ${isDark ? 'text-white/80' : 'text-slate-500'}`}>No photo</span>
                        <span className={`text-xs ${isDark ? 'text-white/60' : 'text-slate-500'}`}>Tap + to upload</span>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="absolute bottom-0 right-0 w-10 h-10 rounded-full flex items-center justify-center border-2 border-white shadow cursor-pointer bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                    onClick={(e) => { e.stopPropagation(); triggerFileInput(); }}
                    aria-label="Add or change photo"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  </button>
                </div>
                <h3 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{profileDisplayName}</h3>
                <p className={`text-base ${isDark ? 'text-white/70' : 'text-slate-500'}`}>Account</p>
              </div>
              <div className="px-5 sm:px-6 pb-5 sm:pb-6 space-y-5">
                {[
                  ['Full Name', profileDisplayName || '—'],
                  ['Email Address', user?.email || '—'],
                  ['Phone Number', user?.phone || '—'],
                  ['User ID', profileUserId],
                  ['Account Status', 'Active'],
                  ['Member Since', (() => {
                    const raw = user?.created_at;
                    if (raw == null || String(raw).trim() === '') return '—';
                    const s = String(raw).trim();
                    const iso = s.includes('T') ? s : s.replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/, '$1T$2');
                    const d = new Date(iso);
                    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
                  })()],
                ].map(([label, value], i) => (
                  <div key={i}>
                    <p className={`text-sm font-medium mb-1.5 ${isDark ? 'text-white/70' : 'text-slate-500'}`}>{label}</p>
                    <p className={`text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>{value}</p>
                  </div>
                ))}
                <div className="pt-5 space-y-3">
                  <button
                    type="button"
                    onClick={() => {
                      setProfileEditFullName(profileDisplayName || '');
                      setProfileEditEmail(user?.email || '');
                      setProfileEditPhone(user?.phone || '');
                      setProfileEditError(null);
                      setEditProfileOpen(true);
                    }}
                    className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-base transition-colors flex items-center justify-center gap-2"
                  >
                    <Svg.Edit stroke="currentColor" /> EDIT PROFILE
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPasswordCurrent('');
                      setPasswordNew('');
                      setPasswordConfirm('');
                      setPasswordError(null);
                      setChangePasswordOpen(true);
                    }}
                    className={`w-full py-3.5 rounded-xl font-semibold text-base transition-colors flex items-center justify-center gap-2 ${isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-slate-700 hover:bg-slate-600 text-white'}`}
                  >
                    <Svg.Link /> CHANGE PASSWORD
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-4 pb-16 sm:pb-20">
              <div className={`rounded-xl sm:rounded-2xl p-5 sm:p-6 flex items-center gap-4 ${isDark ? 'bg-black border border-white/10' : 'bg-white border border-slate-200'}`}>
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                  <Svg.Chart />
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${isDark ? 'text-white/70' : 'text-slate-500'}`}>Total Orders</p>
                  <p className={`text-xl sm:text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>0</p>
                </div>
              </div>
              <div className={`rounded-xl sm:rounded-2xl p-5 sm:p-6 flex items-center gap-4 ${isDark ? 'bg-black border border-white/10' : 'bg-white border border-slate-200'}`}>
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-green-100 flex items-center justify-center text-green-600 shrink-0">
                  <Svg.Dollar stroke="currentColor" />
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${isDark ? 'text-white/70' : 'text-slate-500'}`}>Wallet Balance</p>
                  <p className={`text-xl sm:text-2xl font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>¢{walletBalance.toFixed(2)}</p>
                </div>
              </div>
              <div className={`rounded-xl sm:rounded-2xl p-5 sm:p-6 flex items-center gap-4 ${isDark ? 'bg-black border border-white/10' : 'bg-white border border-slate-200'}`}>
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 shrink-0">
                  <Svg.Chart />
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${isDark ? 'text-white/70' : 'text-slate-500'}`}>Total Spent</p>
                  <p className={`text-xl sm:text-2xl font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>¢0.00</p>
                </div>
              </div>
            </div>
          </>
        )}

        <footer
          role="contentinfo"
          className="mt-6 w-full max-w-full -mx-3 px-3 sm:-mx-4 sm:px-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8"
        >
          <UltraxasAdBanner isDark={isDark} />
        </footer>

        </main>
      </div>

      {/* Profile dropdown - fixed overlay */}
      <div
        className={`fixed top-12 right-3 sm:top-16 sm:right-6 z-50 w-56 sm:w-60 rounded-xl transition-all duration-300 overflow-hidden ${profileOpen ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-95 pointer-events-none'} ${isDark ? 'bg-black/40 border border-white/20' : 'bg-white/50 border border-slate-200/60'} backdrop-blur-xl shadow-2xl`}
        style={{ top: 'max(3rem, calc(env(safe-area-inset-top) + 2.5rem))', right: 'max(0.75rem, env(safe-area-inset-right))' }}
      >
        <div className="p-4">
          <div className={`flex items-center gap-3 mb-4 pb-4 border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-base font-bold shadow-lg flex-shrink-0 overflow-hidden">
              {adminAvatarSrc ? (
                <img src={adminAvatarSrc} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                ((profileDisplayName || 'User').trim()[0] || 'U').toUpperCase()
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className={`font-semibold text-base truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{profileDisplayName}</h3>
              <p className={`text-sm truncate ${isDark ? 'text-white/70' : 'text-slate-500'}`}>{hasAdminRole ? 'Admin' : 'User'}</p>
            </div>
          </div>
          <nav className="space-y-0.5">
            <a href="#" onClick={(e) => { e.preventDefault(); handleMenuSelect('profile-page'); }} className={`flex items-center gap-3 py-2.5 px-3 rounded-lg text-base transition-colors ${isDark ? 'text-white/80 hover:bg-white/10 hover:text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
              <Svg.User stroke="currentColor" /> <span>Profile</span>
            </a>
            <a href="#" onClick={(e) => { e.preventDefault(); handleMenuSelect('my-orders'); }} className={`flex items-center gap-3 py-2.5 px-3 rounded-lg text-base transition-colors ${isDark ? 'text-white/80 hover:bg-white/10 hover:text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
              <Svg.File /> <span>My Orders</span>
            </a>
            <a href="#" onClick={(e) => { e.preventDefault(); handleMenuSelect('wallet'); }} className={`flex items-center gap-3 py-2.5 px-3 rounded-lg text-base transition-colors ${isDark ? 'text-white/80 hover:bg-white/10 hover:text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
              <Svg.Dollar /> <span>Transactions</span>
            </a>
            <a href="#" onClick={(e) => { e.preventDefault(); handleMenuSelect('wallet'); }} className={`flex items-center gap-3 py-2.5 px-3 rounded-lg text-base transition-colors ${isDark ? 'text-white/80 hover:bg-white/10 hover:text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
              <Svg.Card /> <span>My Wallet</span>
            </a>
          </nav>
          <div className={`mt-4 pt-4 border-t ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
            <button
              type="button"
              onClick={() => {
                clearSession();
              }}
              className="w-full flex items-center gap-3 py-2.5 px-3 rounded-lg text-base transition-colors text-red-500 hover:bg-red-500/10 font-medium"
            >
              <Svg.LogOut /> Sign Out
            </button>
          </div>
        </div>
      </div>

      {editingBundle != null && adminStoreTools && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setEditingBundle(null); setAdminBundlesMessage(null); }} aria-hidden="true" />
          <div className={`relative w-full max-w-sm rounded-2xl p-5 sm:p-6 shadow-2xl ${isDark ? 'bg-black border border-white/10' : 'bg-white border border-slate-200'}`} onClick={(e) => e.stopPropagation()}>
            <h3 className={`text-lg font-semibold mb-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {editingBundle.index === -1 ? 'Add package' : 'Edit package'}
            </h3>
            <p className={`text-sm mb-3 ${isDark ? 'text-white/70' : 'text-slate-600'}`}>
              {networkLabel(editingBundle.network)} · changes apply for everyone.
            </p>
            <div className="space-y-3">
              <label className={`block text-sm font-medium ${isDark ? 'text-white/90' : 'text-slate-700'}`}>Size</label>
              <input
                type="text"
                value={editBundleForm.size}
                onChange={(e) => setEditBundleForm((f) => ({ ...f, size: e.target.value }))}
                className={`w-full px-4 py-2.5 rounded-xl border text-base ${isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
                placeholder="e.g. 10 GB"
              />
              <label className={`block text-sm font-medium ${isDark ? 'text-white/90' : 'text-slate-700'}`}>Price (¢)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={editBundleForm.price}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setEditBundleForm((f) => ({ ...f, price: Number.isFinite(v) ? v : 0 }));
                }}
                className={`w-full px-4 py-2.5 rounded-xl border text-base ${isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
                placeholder="0"
              />
            </div>
            {adminBundlesMessage && (
              <p className={`text-sm mt-3 ${adminBundlesMessage.type === 'success' ? (isDark ? 'text-green-400' : 'text-green-600') : (isDark ? 'text-red-400' : 'text-red-600')}`}>
                {adminBundlesMessage.text}
              </p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap mt-5">
              <button
                type="button"
                onClick={() => { setEditingBundle(null); setAdminBundlesMessage(null); }}
                className={`flex-1 min-w-[6rem] py-2.5 rounded-xl font-medium ${isDark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-slate-200 text-slate-800 hover:bg-slate-300'}`}
              >
                Cancel
              </button>
              {editingBundle.index >= 0 && (
                <button
                  type="button"
                  disabled={adminBundlesSaving}
                  onClick={async () => {
                    if (!window.confirm('Remove this package for everyone?')) return;
                    setAdminBundlesSaving(true);
                    setAdminBundlesMessage(null);
                    try {
                      const source = bundlesData && Array.isArray(bundlesData.mtn) ? bundlesData : defaultBundles;
                      const next = JSON.parse(JSON.stringify(source));
                      const arr = [...(next[editingBundle.network] || [])];
                      if (editingBundle.index < 0 || editingBundle.index >= arr.length) {
                        setAdminBundlesMessage({ type: 'error', text: 'Invalid row' });
                        return;
                      }
                      arr.splice(editingBundle.index, 1);
                      next[editingBundle.network] = arr;
                      await api.updateBundles(next);
                      try {
                        const b = await api.getBundles();
                        setBundlesData(b && typeof b === 'object' ? b : next);
                      } catch {
                        setBundlesData(next);
                      }
                      setEditingBundle(null);
                    } catch (err) {
                      setAdminBundlesMessage({ type: 'error', text: err?.message || 'Failed to delete' });
                    } finally {
                      setAdminBundlesSaving(false);
                    }
                  }}
                  className={`flex-1 min-w-[6rem] py-2.5 rounded-xl font-semibold ${isDark ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30' : 'bg-red-100 text-red-800 hover:bg-red-200'} disabled:opacity-50`}
                >
                  Delete
                </button>
              )}
              <button
                type="button"
                disabled={adminBundlesSaving}
                onClick={async () => {
                  setAdminBundlesSaving(true);
                  setAdminBundlesMessage(null);
                  try {
                    const source = bundlesData && Array.isArray(bundlesData.mtn) ? bundlesData : defaultBundles;
                    const next = JSON.parse(JSON.stringify(source));
                    const arr = [...(next[editingBundle.network] || [])];
                    if (editingBundle.index === -1) {
                      arr.push({
                        size: editBundleForm.size.trim() || '1 GB',
                        price: editBundleForm.price,
                      });
                    } else if (arr[editingBundle.index]) {
                      arr[editingBundle.index] = {
                        ...arr[editingBundle.index],
                        size: editBundleForm.size.trim() || arr[editingBundle.index].size,
                        price: editBundleForm.price,
                      };
                    } else {
                      setAdminBundlesMessage({ type: 'error', text: 'Invalid row' });
                      return;
                    }
                    next[editingBundle.network] = arr;
                    await api.updateBundles(next);
                    try {
                      const b = await api.getBundles();
                      setBundlesData(b && typeof b === 'object' ? b : next);
                    } catch {
                      setBundlesData(next);
                    }
                    setEditingBundle(null);
                  } catch (err) {
                    setAdminBundlesMessage({ type: 'error', text: err?.message || 'Failed to save' });
                  } finally {
                    setAdminBundlesSaving(false);
                  }
                }}
                className={`flex-1 min-w-[6rem] py-2.5 rounded-xl font-semibold ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/90'} disabled:opacity-50`}
              >
                {adminBundlesSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Support chat FAB — same look/position stack as cart; hidden on /admin */}
      {typeof document !== 'undefined' && isSignedIn && !adminRoute && api.getToken() && createPortal(
        <>
          {supportChatOpen && (
            <div className="fixed inset-0 z-[99990] flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={() => {
                  cancelSupportOutbound();
                  setSupportChatOpen(false);
                  setSupportEditingMessageId(null);
                  setSupportDraft('');
                  setSupportPendingImage(null);
                  setSupportReplyTo(null);
                  setSupportError(null);
                  setSupportMsgActionsMenu(null);
                  setSupportSending(false);
                }}
                aria-hidden="true"
              />
              <div
                className={`relative w-full max-w-md rounded-2xl shadow-2xl flex flex-col max-h-[min(560px,85vh)] ${isDark ? 'bg-black border border-white/10' : 'bg-slate-50 border border-slate-200'}`}
                role="dialog"
                aria-labelledby="support-chat-title"
                aria-label={`${APP_BRAND_DISPLAY_NAME} support chat`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className={`flex items-center justify-between gap-2 p-4 border-b shrink-0 rounded-t-2xl ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <SupportInboxAvatar
                      src={brandLogoUrl}
                      initial={supportInboxAvatarInitial(APP_BRAND_DISPLAY_NAME, 'Support')}
                      isDark={isDark}
                      className="h-11 w-11"
                    />
                    <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <h2
                          id="support-chat-title"
                          className={`text-lg font-semibold tracking-tight truncate ${isDark ? 'text-white' : 'text-slate-900'}`}
                        >
                          {APP_BRAND_DISPLAY_NAME}
                        </h2>
                        <span
                          className="inline-flex h-[1.35rem] w-[1.35rem] shrink-0 items-center justify-center drop-shadow-sm"
                          title="Verified official support"
                          role="img"
                          aria-label="Verified official"
                        >
                          {isDark ? (
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              className="h-full w-full pointer-events-none select-none"
                              aria-hidden
                            >
                              <path
                                fill="#38bdf8"
                                fillRule="evenodd"
                                d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.491 4.491 0 01-3.497-1.307 4.491 4.491 0 01-1.307-3.497A4.49 4.49 0 012.25 12a4.49 4.49 0 011.549-3.397 4.491 4.491 0 011.307-3.497 4.491 4.491 0 013.497-1.307z"
                                clipRule="evenodd"
                              />
                              <path
                                fill="#fff"
                                d="M15.59 9.792a.75.75 0 01.544 1.331l-4.5 4.5a.75.75 0 01-1.212-.192l-1.5-2.25a.75.75 0 111.212-.884l.96 1.44 3.738-3.739a.75.75 0 011.354.588z"
                              />
                            </svg>
                          ) : (
                            <img
                              src={`${import.meta.env.BASE_URL}verified-support-badge.png`}
                              alt=""
                              width={22}
                              height={22}
                              draggable={false}
                              className="h-full w-full object-contain pointer-events-none select-none"
                            />
                          )}
                        </span>
                      </div>
                      <p className={`text-xs font-medium ${isDark ? 'text-white/55' : 'text-slate-500'}`}>Support</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      cancelSupportOutbound();
                      setSupportChatOpen(false);
                      setSupportEditingMessageId(null);
                      setSupportDraft('');
                      setSupportPendingImage(null);
                      setSupportReplyTo(null);
                      setSupportError(null);
                      setSupportMsgActionsMenu(null);
                      setSupportSending(false);
                    }}
                    className={`p-2 rounded-lg shrink-0 ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
                    aria-label="Close support chat"
                  >
                    <Svg.Close stroke={stroke} />
                  </button>
                </div>
                {supportAgentJoinedBanner ? (
                  <div
                    role="status"
                    aria-live="polite"
                    className={`support-agent-joined-banner mx-3 mt-2 rounded-lg px-3 py-2 text-center text-[11px] font-normal leading-snug tracking-wide ${isDark ? 'text-white/40 bg-white/[0.03]' : 'text-slate-500/85 bg-slate-200/35'}`}
                  >
                    An agent has joined the chat.
                  </div>
                ) : null}
                <div
                  className={`flex-1 min-h-0 overflow-y-auto p-4 space-y-3 min-h-[160px] max-h-[320px] ${isDark ? 'text-white/90' : 'text-slate-800'}`}
                >
                  {supportError ? (
                    <p className={`text-sm ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>{supportError}</p>
                  ) : null}
                  {supportMessagesUi.length === 0 && !supportError ? (
                    <SupportAssistantIdle
                      isDark={isDark}
                      avatar={
                        <SupportInboxAvatar
                          src={brandLogoUrl}
                          initial={supportInboxAvatarInitial(APP_BRAND_DISPLAY_NAME, 'Support')}
                          isDark={isDark}
                          className="h-7 w-7 shrink-0"
                        />
                      }
                    />
                  ) : null}
                  {supportMessagesUi.map((m) => {
                    const isUser = m.role === 'user';
                    const isAdmin = m.role === 'admin';
                    const msgIso = supportMsgIso(m);
                    const timeLabel = supportMessageTimestamp(msgIso);
                    const timeMuted = isDark ? 'text-white/40' : 'text-slate-400';
                    const supportTeamAvatarEl = isAdmin ? (
                      <SupportInboxAvatar
                        src={brandLogoUrl}
                        initial={supportInboxAvatarInitial(APP_BRAND_DISPLAY_NAME, 'Support')}
                        isDark={isDark}
                        className="h-7 w-7 shrink-0"
                      />
                    ) : null;
                    const bubble = isUser
                      ? 'bg-indigo-600 text-white ml-8'
                      : isAdmin
                        ? ''
                        : isDark
                          ? 'bg-white/10 text-white/90 mr-8'
                          : 'bg-slate-200/80 text-slate-800 mr-8';
                    if (m.image) {
                      const captionInCard =
                        isUser && m.body
                          ? isDark
                            ? 'px-3 py-2.5 text-sm whitespace-pre-wrap border-t border-indigo-500/25 bg-indigo-950/35 text-white/95'
                            : 'px-3 py-2.5 text-sm whitespace-pre-wrap border-t border-indigo-100 bg-indigo-50/95 text-slate-900'
                          : isAdmin && m.body
                            ? isDark
                              ? 'px-3 py-2.5 text-sm whitespace-pre-wrap border-t border-white/10 bg-white/5 text-white/90'
                              : 'px-3 py-2.5 text-sm whitespace-pre-wrap border-t border-slate-100 bg-slate-50/95 text-slate-800'
                            : m.body
                              ? isDark
                                ? 'px-3 py-2.5 text-sm whitespace-pre-wrap border-t border-white/10 text-white/90'
                                : 'px-3 py-2.5 text-sm whitespace-pre-wrap border-t border-slate-100 text-slate-800'
                              : '';
                      return (
                        <div
                          key={m.id || `${msgIso}-${String(m.body || '').slice(0, 24)}`}
                          className={`flex items-end gap-1.5 touch-pan-y ${isUser ? 'justify-end' : 'justify-start'}`}
                          onPointerDown={(e) => supportThreadSwipeDown(e, m)}
                          onPointerUp={(e) => supportThreadSwipeUp(e, m)}
                          onPointerCancel={supportThreadSwipeCancel}
                        >
                          {!isUser && isAdmin ? supportTeamAvatarEl : null}
                          <div
                            className={`flex flex-col gap-0.5 max-w-[95%] ${isUser ? 'items-end ml-8' : 'items-start mr-8'}${
                              isUser && m.role === 'user' && m.id
                                ? ' touch-manipulation select-none [-webkit-tap-highlight-color:transparent]'
                                : ''
                            }`}
                            onDoubleClick={
                              isUser && m.role === 'user' && m.id
                                ? (e) => handleSupportOwnBubbleInteract(e, m.id)
                                : undefined
                            }
                            onTouchEnd={
                              isUser && m.role === 'user' && m.id
                                ? (e) => handleSupportOwnBubbleInteract(e, m.id)
                                : undefined
                            }
                            {...(isUser && m.role === 'user' && m.id
                              ? { 'aria-label': 'Double-tap message for edit or delete' }
                              : {})}
                          >
                            <div
                              className={`max-w-full overflow-hidden rounded-xl ring-1 ${isDark ? 'ring-white/10 bg-zinc-900' : 'ring-slate-200/90 bg-white'}`}
                            >
                              <SupportReplyQuoteInBubble m={m} isDark={isDark} viewerIsUser inImageCard />
                              <div className={isDark ? 'bg-zinc-950/40' : 'bg-slate-50'}>
                                <img src={m.image} alt="" className="block max-h-48 max-w-full object-contain" />
                              </div>
                              {m.body ? (
                                <div className={captionInCard}>
                                  {m.role === 'system' ? supportInlineBold(m.body) : m.body}
                                </div>
                              ) : null}
                            </div>
                            {timeLabel || m.editedAt ? (
                              <div
                                className={`flex flex-wrap items-center gap-x-1 px-0.5 ${isUser ? 'justify-end' : 'justify-start'}`}
                              >
                                {timeLabel ? (
                                  <time
                                    dateTime={msgIso || undefined}
                                    className={`text-[10px] font-medium tabular-nums leading-none ${timeMuted}`}
                                  >
                                    {timeLabel}
                                  </time>
                                ) : null}
                                {m.editedAt ? (
                                  <span className={`text-[10px] font-medium ${timeMuted}`}>· edited</span>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div
                        key={m.id || `${msgIso}-${String(m.body || '').slice(0, 24)}`}
                        className={`flex items-end gap-1.5 touch-pan-y ${isUser ? 'justify-end' : 'justify-start'}`}
                        onPointerDown={(e) => supportThreadSwipeDown(e, m)}
                        onPointerUp={(e) => supportThreadSwipeUp(e, m)}
                        onPointerCancel={supportThreadSwipeCancel}
                      >
                        {!isUser && isAdmin ? supportTeamAvatarEl : null}
                        <div
                          className={`flex flex-col gap-0.5 max-w-[95%] ${isUser ? 'items-end ml-8' : 'items-start mr-8'}${
                            isUser && m.role === 'user' && m.id
                              ? ' touch-manipulation select-none [-webkit-tap-highlight-color:transparent]'
                              : ''
                          }`}
                          onDoubleClick={
                            isUser && m.role === 'user' && m.id
                              ? (e) => handleSupportOwnBubbleInteract(e, m.id)
                              : undefined
                          }
                          onTouchEnd={
                            isUser && m.role === 'user' && m.id
                              ? (e) => handleSupportOwnBubbleInteract(e, m.id)
                              : undefined
                          }
                          {...(isUser && m.role === 'user' && m.id
                            ? { 'aria-label': 'Double-tap message for edit or delete' }
                            : {})}
                        >
                          <div
                            className={
                              isAdmin
                                ? supportAdminReplyBubbleClass(isDark)
                                : `rounded-2xl px-3 py-2 text-sm max-w-full whitespace-pre-wrap ${bubble}`
                            }
                          >
                            <SupportReplyQuoteInBubble m={m} isDark={isDark} viewerIsUser />
                            {m.role === 'system' ? supportInlineBold(m.body) : m.body || null}
                          </div>
                          {timeLabel || m.editedAt ? (
                            <div
                              className={`flex flex-wrap items-center gap-x-1 px-0.5 ${isUser ? 'justify-end' : 'justify-start'}`}
                            >
                              {timeLabel ? (
                                <time
                                  dateTime={msgIso || undefined}
                                  className={`text-[10px] font-medium tabular-nums leading-none ${timeMuted}`}
                                >
                                  {timeLabel}
                                </time>
                              ) : null}
                              {m.editedAt ? (
                                <span className={`text-[10px] font-medium ${timeMuted}`}>· edited</span>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                  {supportAdminTyping ? (
                    <SupportTypingIndicator
                      align="start"
                      isDark={isDark}
                      avatar={
                        <SupportInboxAvatar
                          src={brandLogoUrl}
                          initial={supportInboxAvatarInitial(APP_BRAND_DISPLAY_NAME, 'Support')}
                          isDark={isDark}
                          className="h-7 w-7 shrink-0"
                        />
                      }
                    />
                  ) : null}
                </div>
                {supportNeedsHuman ? (
                  <p className={`px-4 pb-2 text-xs ${isDark ? 'text-amber-300/90' : 'text-amber-800'}`}>Team notified — replies appear here.</p>
                ) : null}
                <div className={`border-t shrink-0 rounded-b-2xl relative z-[2] ${isDark ? 'border-white/10 bg-black/40' : 'border-slate-200 bg-white'}`}>
                  <div className="p-3">
                  {supportEditingMessageId ? (
                    <div
                      className={`mb-2 flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-xs ${isDark ? 'bg-sky-500/15 text-sky-100/95' : 'bg-sky-50 text-sky-950'}`}
                    >
                      <span className="font-medium min-w-0">Editing a message — send to save.</span>
                      <button
                        type="button"
                        className={`shrink-0 font-semibold underline-offset-2 hover:underline ${isDark ? 'text-sky-200' : 'text-sky-800'}`}
                        onClick={() => {
                          setSupportEditingMessageId(null);
                          setSupportDraft('');
                          setSupportPendingImage(null);
                          setSupportError(null);
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : null}
                  {(() => {
                    const inReplyCard = !!(supportReplyTo && !supportEditingMessageId);
                    const chatRow = (
                    <div
                      className={
                        inReplyCard
                          ? 'telesopy-chat-row text-white'
                          : `telesopy-chat-row ${isDark ? 'text-white' : 'text-slate-800'}`
                      }
                    >
                    <div className="telesopy-grid-btn-wrap">
                      <input
                        ref={supportAttachmentInputRef}
                        type="file"
                        accept="image/*"
                        className="telesopy-file-input"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          if (!f || !f.type.startsWith('image/')) return;
                          if (f.size > 900 * 1024) {
                            setSupportError('Image too large (max ~900KB).');
                            return;
                          }
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            const url = typeof reader.result === 'string' ? reader.result : '';
                            if (!url.startsWith('data:image/')) return;
                            setSupportError(null);
                            setSupportPendingImage(url);
                          };
                          reader.readAsDataURL(f);
                        }}
                      />
                      <button
                        type="button"
                        className="telesopy-sidebar-btn"
                        disabled={supportSending}
                        title="Attach image"
                        aria-label="Attach image"
                        onClick={() => supportAttachmentInputRef.current?.click()}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      </button>
                    </div>
                    <div className="telesopy-chat-bar-wrap">
                      <UltraxasChatBar
                        value={supportDraft}
                        onChange={setSupportDraft}
                        onSubmit={() => {
                          if (supportSending) return;
                          const finishOutbound = (ac) => {
                            if (supportOutboundAbortRef.current === ac) supportOutboundAbortRef.current = null;
                            setSupportSending(false);
                          };
                          if (supportEditingMessageId) {
                            const mid = supportEditingMessageId;
                            const orig = supportMessages.find((x) => String(x.id) === String(mid));
                            const hadImage = !!(orig && orig.image);
                            if (supportPendingImage) {
                              const caption = supportDraft.trim();
                              supportOutboundAbortRef.current?.abort();
                              const ac = new AbortController();
                              supportOutboundAbortRef.current = ac;
                              setSupportSending(true);
                              setSupportError(null);
                              const img = supportPendingImage;
                              setSupportPendingImage(null);
                              api
                                .patchSupportMessage({
                                  messageId: mid,
                                  text: caption,
                                  image: img,
                                  signal: ac.signal,
                                })
                                .then((d) => {
                                  void api.postSupportTyping(false).catch(() => {});
                                  const inc = Array.isArray(d.messages) ? d.messages : [];
                                  setSupportMessages((prev) => mergeSupportReplyMetaFromPrev(prev, inc));
                                  setSupportNeedsHuman(!!d.needsHuman);
                                  setSupportDraft('');
                                  setSupportEditingMessageId(null);
                                })
                                .catch((err) => {
                                  if (supportIsAbortError(err)) {
                                    setSupportPendingImage(img);
                                    return;
                                  }
                                  setSupportError(err?.message || 'Update failed');
                                  setSupportPendingImage(img);
                                })
                                .finally(() => finishOutbound(ac));
                              return;
                            }
                            if (hadImage && !supportPendingImage) {
                              const t = supportDraft.trim();
                              if (!t) {
                                setSupportError('Add text after removing the photo, or keep a photo.');
                                return;
                              }
                              supportOutboundAbortRef.current?.abort();
                              const ac = new AbortController();
                              supportOutboundAbortRef.current = ac;
                              setSupportSending(true);
                              setSupportError(null);
                              api
                                .patchSupportMessage({
                                  messageId: mid,
                                  text: t,
                                  removeImage: true,
                                  signal: ac.signal,
                                })
                                .then((d) => {
                                  void api.postSupportTyping(false).catch(() => {});
                                  const inc = Array.isArray(d.messages) ? d.messages : [];
                                  setSupportMessages((prev) => mergeSupportReplyMetaFromPrev(prev, inc));
                                  setSupportNeedsHuman(!!d.needsHuman);
                                  setSupportDraft('');
                                  setSupportEditingMessageId(null);
                                })
                                .catch((err) => {
                                  if (!supportIsAbortError(err)) {
                                    setSupportError(err?.message || 'Update failed');
                                  }
                                })
                                .finally(() => finishOutbound(ac));
                              return;
                            }
                            const t = supportDraft.trim();
                            if (!t) return;
                            supportOutboundAbortRef.current?.abort();
                            const ac = new AbortController();
                            supportOutboundAbortRef.current = ac;
                            setSupportSending(true);
                            setSupportError(null);
                            api
                              .patchSupportMessage({ messageId: mid, text: t, signal: ac.signal })
                              .then((d) => {
                                void api.postSupportTyping(false).catch(() => {});
                                const inc = Array.isArray(d.messages) ? d.messages : [];
                                setSupportMessages((prev) => mergeSupportReplyMetaFromPrev(prev, inc));
                                setSupportNeedsHuman(!!d.needsHuman);
                                setSupportDraft('');
                                setSupportEditingMessageId(null);
                              })
                              .catch((err) => {
                                if (!supportIsAbortError(err)) {
                                  setSupportError(err?.message || 'Update failed');
                                }
                              })
                              .finally(() => finishOutbound(ac));
                            return;
                          }
                          if (supportPendingImage) {
                            const caption = supportDraft.trim();
                            supportOutboundAbortRef.current?.abort();
                            const ac = new AbortController();
                            supportOutboundAbortRef.current = ac;
                            setSupportSending(true);
                            setSupportError(null);
                            const img = supportPendingImage;
                            const replySnap = supportReplyTo;
                            const replyToId = replySnap?.id;
                            setSupportPendingImage(null);
                            api
                              .postSupportMessage({
                                text: caption,
                                image: img,
                                requestHuman: false,
                                replyToMessageId: replyToId,
                                replyToPreview: replySnap?.preview,
                                replyToRole: replySnap?.role,
                                signal: ac.signal,
                              })
                              .then((d) => {
                                void api.postSupportTyping(false).catch(() => {});
                                const inc = Array.isArray(d.messages) ? d.messages : [];
                                setSupportMessages((prev) => {
                                  const merged = mergeSupportReplyMetaFromPrev(prev, inc);
                                  return injectUserReplyMetaIfMissing(merged, replySnap);
                                });
                                setSupportNeedsHuman(!!d.needsHuman);
                                setSupportDraft('');
                                clearPersistedSupportReplyDraft();
                                setSupportReplyTo(null);
                              })
                              .catch((err) => {
                                if (supportIsAbortError(err)) {
                                  setSupportPendingImage(img);
                                  return;
                                }
                                setSupportError(err?.message || 'Send failed');
                                setSupportPendingImage(img);
                              })
                              .finally(() => finishOutbound(ac));
                            return;
                          }
                          const t = supportDraft.trim();
                          if (!t) return;
                          supportOutboundAbortRef.current?.abort();
                          const ac = new AbortController();
                          supportOutboundAbortRef.current = ac;
                          setSupportSending(true);
                          setSupportError(null);
                          const replySnap = supportReplyTo;
                          const replyToText = replySnap?.id;
                          api
                            .postSupportMessage({
                              text: t,
                              requestHuman: false,
                              replyToMessageId: replyToText,
                              replyToPreview: replySnap?.preview,
                              replyToRole: replySnap?.role,
                              signal: ac.signal,
                            })
                            .then((d) => {
                              void api.postSupportTyping(false).catch(() => {});
                              const inc = Array.isArray(d.messages) ? d.messages : [];
                              setSupportMessages((prev) => {
                                const merged = mergeSupportReplyMetaFromPrev(prev, inc);
                                return injectUserReplyMetaIfMissing(merged, replySnap);
                              });
                              setSupportNeedsHuman(!!d.needsHuman);
                              setSupportDraft('');
                              clearPersistedSupportReplyDraft();
                              setSupportReplyTo(null);
                            })
                            .catch((err) => {
                              if (!supportIsAbortError(err)) {
                                setSupportError(err?.message || 'Send failed');
                              }
                            })
                            .finally(() => finishOutbound(ac));
                        }}
                        placeholder={
                          supportEditingMessageId
                            ? supportPendingImage
                              ? 'Optional note…'
                              : 'Update your message…'
                            : supportPendingImage
                              ? 'Optional message with your photo…'
                              : 'Message support…'
                        }
                        sending={supportSending}
                        onCancelSend={cancelSupportOutbound}
                        isDark={isDark}
                        allowSendEmpty={!!supportPendingImage}
                        onInputFocusChange={setSupportComposerFocused}
                      />
                    </div>
                    </div>
                    );
                    if (inReplyCard) {
                      return (
                        <div
                          className={`mb-2 overflow-hidden rounded-2xl text-white shadow-md ring-1 ${isDark ? 'bg-indigo-950 ring-indigo-400/25' : 'bg-indigo-600 ring-indigo-500/35'}`}
                        >
                          <div className="px-3 pt-3 pb-1">
                            <SupportComposerReplyPreview
                              replyTo={supportReplyTo}
                              isDark={isDark}
                              viewerIsUser
                              embedded
                              onDismiss={() => {
                                clearPersistedSupportReplyDraft();
                                setSupportReplyTo(null);
                              }}
                            />
                          </div>
                          {supportPendingImage ? (
                            <div className="px-3 pb-2">
                              <div className="relative inline-block">
                                <div
                                  className={`h-10 w-14 shrink-0 overflow-hidden rounded-md ring-1 ${isDark ? 'ring-white/25' : 'ring-white/35'}`}
                                >
                                  <img src={supportPendingImage} alt="" className="h-full w-full object-cover" />
                                </div>
                                <button
                                  type="button"
                                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-xs font-light leading-none bg-white/25 text-white ring-1 ring-white/30 hover:bg-white/35"
                                  onClick={() => {
                                    setSupportPendingImage(null);
                                    setSupportError(null);
                                  }}
                                  aria-label="Remove attachment"
                                >
                                  ×
                                </button>
                              </div>
                            </div>
                          ) : null}
                          <div
                            className={`border-t px-2 py-2 ${isDark ? 'border-white/15 bg-black/20' : 'border-white/20 bg-indigo-700/35'}`}
                          >
                            {chatRow}
                          </div>
                        </div>
                      );
                    }
                    return (
                      <>
                        {supportReplyTo && supportEditingMessageId ? (
                          <SupportComposerReplyPreview
                            replyTo={supportReplyTo}
                            isDark={isDark}
                            viewerIsUser
                            onDismiss={() => {
                              clearPersistedSupportReplyDraft();
                              setSupportReplyTo(null);
                            }}
                          />
                        ) : null}
                        {supportPendingImage ? (
                          <div className="mb-2">
                            <div className="relative inline-block">
                              <div
                                className={`h-10 w-14 shrink-0 overflow-hidden rounded-md ${isDark ? 'ring-1 ring-white/15' : 'ring-1 ring-slate-200/90'}`}
                              >
                                <img src={supportPendingImage} alt="" className="h-full w-full object-cover" />
                              </div>
                              <button
                                type="button"
                                className={`absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-xs font-light leading-none shadow ${isDark ? 'bg-zinc-800 text-white ring-1 ring-white/20 hover:bg-zinc-700' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'}`}
                                onClick={() => {
                                  setSupportPendingImage(null);
                                  setSupportError(null);
                                }}
                                aria-label="Remove attachment"
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        ) : null}
                        <div className="flex flex-col gap-2 w-full">{chatRow}</div>
                      </>
                    );
                  })()}
                  <div className="mt-2 px-3 pb-3 text-center">
                    <button
                      type="button"
                      disabled={supportSending || !!supportEditingMessageId}
                      onClick={async () => {
                        setSupportPendingImage(null);
                        setSupportSending(true);
                        setSupportError(null);
                        try {
                          const replySnap = supportReplyTo;
                          const d = await api.postSupportMessage({
                            text: '',
                            requestHuman: true,
                            replyToMessageId: replySnap?.id,
                            replyToPreview: replySnap?.preview,
                            replyToRole: replySnap?.role,
                          });
                          void api.postSupportTyping(false).catch(() => {});
                          const inc = Array.isArray(d.messages) ? d.messages : [];
                          setSupportMessages((prev) => {
                            const merged = mergeSupportReplyMetaFromPrev(prev, inc);
                            return injectUserReplyMetaIfMissing(merged, replySnap);
                          });
                          setSupportNeedsHuman(!!d.needsHuman);
                          clearPersistedSupportReplyDraft();
                          setSupportReplyTo(null);
                        } catch (err) {
                          setSupportError(err?.message || 'Request failed');
                        } finally {
                          setSupportSending(false);
                        }
                      }}
                      className={`text-xs font-semibold underline-offset-2 hover:underline disabled:opacity-50 ${isDark ? 'text-amber-300/90' : 'text-amber-800'}`}
                    >
                      Request a human
                    </button>
                  </div>
                </div>
              </div>
            </div>
            </div>
          )}
          <button
            ref={supportChatFabRef}
            type="button"
            onClick={handleSupportChatFabClick}
            onMouseDown={handleSupportChatFabDragStart}
            onTouchStart={handleSupportChatFabDragStart}
            className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white text-slate-900 shadow-xl flex items-center justify-center hover:scale-110 transition-all relative cursor-grab active:cursor-grabbing ${supportChatIntroOpen ? `ring-4 ring-sky-500 ring-offset-2 scale-110 shadow-lg ${isDark ? 'ring-offset-zinc-950' : 'ring-offset-slate-50'}` : ''}`}
            style={{
              position: 'fixed',
              zIndex: supportChatIntroOpen ? 100000 : 99999,
              ...(supportChatFabPosition
                ? { left: supportChatFabPosition.x, top: supportChatFabPosition.y, right: 'auto', bottom: 'auto' }
                : {
                    bottom: 'calc(max(4rem, env(safe-area-inset-bottom) + 3rem) + 3.75rem)',
                    right: 'max(0.75rem, env(safe-area-inset-right))',
                    left: 'auto',
                    top: 'auto',
                  }),
            }}
            aria-label="Open support chat"
          >
            <Svg.Message stroke="currentColor" className="pointer-events-none w-[22px] h-[22px] sm:w-[26px] sm:h-[26px]" />
            {supportUnreadUser > 0 ? (
              <span className="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1 rounded-full text-xs font-bold flex items-center justify-center pointer-events-none bg-rose-500 text-white">
                {supportUnreadUser > 9 ? '9+' : supportUnreadUser}
              </span>
            ) : null}
          </button>
          {supportMsgActionsMenu && supportChatOpen ? (
            <SupportMessageActionsMenu
              anchor={supportMsgActionsMenu}
              isDark={isDark}
              align="end"
              disabled={
                supportSending ||
                String(supportEditingMessageId) === String(supportMsgActionsMenu.messageId)
              }
              onClose={closeSupportMsgActionsMenu}
              onEdit={() => {
                const mid = supportMsgActionsMenu.messageId;
                const row = supportMessages.find((x) => String(x.id) === String(mid));
                if (!row || supportSending) return;
                setSupportEditingMessageId(row.id);
                setSupportDraft(row.body || '');
                setSupportPendingImage(row.image || null);
                setSupportError(null);
              }}
              onDelete={() => {
                const mid = supportMsgActionsMenu.messageId;
                if (supportSending) return;
                setSupportDeleteConfirmMessageId(mid);
                setSupportMsgActionsMenu(null);
              }}
            />
          ) : null}
          {supportDeleteConfirmMessageId && supportChatOpen ? (
            <div
              className="fixed inset-0 z-[100000] flex items-center justify-center p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="support-delete-msg-title"
            >
              <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={() => {
                  if (!supportSending) setSupportDeleteConfirmMessageId(null);
                }}
                aria-hidden="true"
              />
              <div
                className={`relative w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl p-5 sm:p-6 border ${isDark ? 'bg-zinc-950 border-white/15' : 'bg-white border-slate-200'}`}
                onClick={(e) => e.stopPropagation()}
              >
                <h3
                  id="support-delete-msg-title"
                  className={`text-lg font-bold mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}
                >
                  Delete this message?
                </h3>
                <p className={`text-sm mb-6 leading-relaxed ${isDark ? 'text-white/75' : 'text-slate-600'}`}>
                  This removes the message from the chat. You can’t undo this.
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={supportSending}
                    onClick={() => setSupportDeleteConfirmMessageId(null)}
                    className={`flex-1 py-2.5 rounded-xl font-semibold transition-colors disabled:opacity-50 ${isDark ? 'bg-white/10 text-white hover:bg-white/20 border border-white/15' : 'bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200'}`}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={supportSending}
                    onClick={() => {
                      const mid = supportDeleteConfirmMessageId;
                      if (!mid || supportSending) return;
                      const clearComposer = String(supportEditingMessageId) === String(mid);
                      setSupportSending(true);
                      setSupportError(null);
                      setSupportDeleteConfirmMessageId(null);
                      api
                        .deleteSupportMessage(mid)
                        .then((d) => {
                          const inc = Array.isArray(d.messages) ? d.messages : [];
                          setSupportMessages((prev) => mergeSupportReplyMetaFromPrev(prev, inc));
                          setSupportNeedsHuman(!!d.needsHuman);
                          setSupportEditingMessageId((prev) => (String(prev) === String(mid) ? null : prev));
                          if (clearComposer) {
                            setSupportDraft('');
                            setSupportPendingImage(null);
                          }
                          setSupportMsgActionsMenu(null);
                        })
                        .catch((err) => setSupportError(err?.message || 'Delete failed'))
                        .finally(() => setSupportSending(false));
                    }}
                    className="flex-1 py-2.5 rounded-xl font-semibold transition-colors disabled:opacity-60 bg-red-600 text-white hover:bg-red-500 border border-red-500/80"
                  >
                    {supportSending ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </>,
        document.body
      )}

      {/* Admin inbox: same floating pattern as user support — centered modal + FAB (no full-page route) */}
      {typeof document !== 'undefined' &&
        showAdminNav &&
        createPortal(
          <>
            {adminSupportModalOpen && (
              <div className="fixed inset-0 z-[99990] flex items-center justify-center p-4">
                <div
                  className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                  onClick={() => {
                    setAdminSupportModalOpen(false);
                    setAdminSupportEditingMessageId(null);
                    setAdminSupportReplyDraft('');
                    setAdminSupportPendingImage(null);
                    setAdminSupportReplyTo(null);
                    setAdminSupportMsgActionsMenu(null);
                  }}
                  aria-hidden="true"
                />
                <div
                  className={`relative w-full max-w-md rounded-2xl shadow-2xl flex flex-col min-h-0 max-h-[min(640px,min(90dvh,90vh))] overflow-hidden ${isDark ? 'bg-black border border-white/10' : 'bg-slate-50 border border-slate-200'}`}
                  role="dialog"
                  aria-labelledby="admin-inbox-title"
                  aria-label="Admin support inbox"
                  onClick={(e) => e.stopPropagation()}
                >
                  {adminSupportPhase === 'inbox' ? (
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl">
                      <div className={`flex items-center justify-between gap-2 p-4 border-b shrink-0 rounded-t-2xl ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                        <div className="min-w-0 flex-1">
                          <h2
                            id="admin-inbox-title"
                            className={`text-lg font-semibold tracking-tight truncate ${isDark ? 'text-white' : 'text-slate-900'}`}
                          >
                            Messages
                          </h2>
                          <p className={`text-xs font-medium ${isDark ? 'text-white/55' : 'text-slate-500'}`}>
                            {adminSupportLoading && adminSupportInbox.length === 0
                              ? 'Loading…'
                              : `${adminSupportInbox.length} conversation${adminSupportInbox.length === 1 ? '' : 's'}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={adminSupportLoading}
                            onClick={() => {
                              setAdminSupportLoading(true);
                              api
                                .getAdminSupportInbox()
                                .then((list) => setAdminSupportInbox(Array.isArray(list) ? list : []))
                                .catch(() => {})
                                .finally(() => setAdminSupportLoading(false));
                            }}
                            className={`p-2 rounded-lg shrink-0 transition-colors disabled:opacity-50 border ${isDark ? 'text-white/80 hover:bg-white/10 border-white/10' : 'text-slate-700 hover:bg-slate-100 border-slate-200'}`}
                            aria-label="Refresh inbox"
                            title="Refresh"
                          >
                            <Svg.RefreshCw
                              stroke={stroke}
                              width={18}
                              height={18}
                              className={`pointer-events-none ${adminSupportLoading ? 'animate-spin' : ''}`}
                              aria-hidden
                            />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAdminSupportModalOpen(false);
                              setAdminSupportEditingMessageId(null);
                              setAdminSupportReplyDraft('');
                              setAdminSupportPendingImage(null);
                              setAdminSupportReplyTo(null);
                            }}
                            className={`p-2 rounded-lg shrink-0 ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
                            aria-label="Close inbox"
                          >
                            <Svg.Close stroke={stroke} />
                          </button>
                        </div>
                      </div>
                      {adminSupportError ? (
                        <div className={`mx-3 mt-3 rounded-xl p-3 text-sm shrink-0 ${isDark ? 'bg-rose-500/15 border border-rose-500/35 text-rose-100' : 'bg-rose-50 border border-rose-200 text-rose-900'}`}>
                          {adminSupportError}
                        </div>
                      ) : null}
                      <div
                        className={`min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-y-contain p-2 [-webkit-overflow-scrolling:touch] ${isDark ? 'text-white/90' : 'text-slate-800'}`}
                      >
                        {adminSupportLoading && adminSupportInbox.length === 0 ? (
                          <p className={`px-3 py-8 text-center text-sm ${isDark ? 'text-white/45' : 'text-slate-500'}`}>Loading…</p>
                        ) : adminSupportInbox.length === 0 ? (
                          <p className={`px-3 py-8 text-center text-sm ${isDark ? 'text-white/45' : 'text-slate-500'}`}>
                            No conversations yet. Customer threads appear here when they message support.
                          </p>
                        ) : (
                          adminSupportInbox.map((row) => {
                            const primary = (row.userName || row.userEmail || 'Customer').toString().trim() || 'Customer';
                            const secondary =
                              row.userName && row.userEmail
                                ? String(row.userEmail)
                                : `User ID ${String(row.userId)}`;
                            const unread = (row.unreadForAdmin || 0) > 0;
                            const timeLabel = supportInboxRelativeTime(row.updatedAt);
                            const initial = supportInboxAvatarInitial(row.userName, row.userEmail);
                            return (
                              <button
                                key={row.userId}
                                type="button"
                                onClick={() => {
                                  setAdminSupportSelectedUserId(String(row.userId));
                                  setAdminSupportPhase('thread');
                                }}
                                className={`w-full text-left rounded-xl px-2.5 py-2.5 mb-1 transition-all duration-150 ${isDark ? 'hover:bg-white/[0.06]' : 'hover:bg-slate-100'}`}
                              >
                                <div className="flex gap-3">
                                  <SupportInboxAvatar
                                    src={row.profileAvatar}
                                    initial={initial}
                                    isDark={isDark}
                                    className="h-10 w-10"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-2">
                                      <span className={`text-sm font-semibold leading-tight truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                        {primary}
                                      </span>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        {unread ? (
                                          <span
                                            className="min-w-[1.125rem] h-[1.125rem] px-1 rounded-full text-[10px] font-bold flex items-center justify-center bg-rose-500 text-white tabular-nums"
                                            title="Unread"
                                          >
                                            {row.unreadForAdmin > 9 ? '9+' : row.unreadForAdmin}
                                          </span>
                                        ) : null}
                                        {timeLabel ? (
                                          <span
                                            className={`text-[10px] font-medium tabular-nums uppercase tracking-wide ${isDark ? 'text-white/35' : 'text-slate-400'}`}
                                          >
                                            {timeLabel}
                                          </span>
                                        ) : null}
                                      </div>
                                    </div>
                                    <p className={`text-[11px] mt-0.5 truncate ${isDark ? 'text-white/45' : 'text-slate-500'}`}>{secondary}</p>
                                    <div className="flex flex-wrap items-center gap-1 mt-1.5">
                                      {row.needsHuman ? (
                                        <span
                                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md ${isDark ? 'bg-amber-500/15 text-amber-200/95 border border-amber-500/25' : 'bg-amber-50 text-amber-900 border border-amber-200/80'}`}
                                        >
                                          Human requested
                                        </span>
                                      ) : null}
                                    </div>
                                    <p className={`text-xs mt-1.5 line-clamp-2 leading-snug ${isDark ? 'text-white/48' : 'text-slate-600'}`}>
                                      {row.lastSnippet || '—'}
                                    </p>
                                  </div>
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  ) : adminSupportPhase === 'thread' && adminSupportSelectedUserId ? (
                    <div className="flex flex-col flex-1 min-h-0 overflow-hidden rounded-2xl">
                      <div className={`flex items-start justify-between gap-2 p-3 border-b shrink-0 ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => {
                              setAdminSupportPhase('inbox');
                              setAdminSupportSelectedUserId(null);
                              setAdminSupportThreadMessages([]);
                              setAdminSupportThreadMeta(null);
                              setAdminSupportEditingMessageId(null);
                              setAdminSupportReplyDraft('');
                              setAdminSupportPendingImage(null);
                              setAdminSupportReplyTo(null);
                              setAdminSupportMsgActionsMenu(null);
                            }}
                            className={`p-2 rounded-xl shrink-0 mt-0.5 ${isDark ? 'hover:bg-white/10 text-white' : 'hover:bg-slate-100 text-slate-800'}`}
                            aria-label="Back to inbox"
                          >
                            <Svg.ArrowLeft width={22} height={22} aria-hidden />
                          </button>
                          <SupportInboxAvatar
                            src={adminSupportThreadMeta?.profileAvatar}
                            initial={supportInboxAvatarInitial(
                              adminSupportThreadMeta?.userName,
                              adminSupportThreadMeta?.userEmail,
                            )}
                            isDark={isDark}
                            className="h-9 w-9 mt-0.5"
                          />
                          <div className="min-w-0 flex-1">
                            <p className={`font-semibold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                              {adminSupportThreadMeta?.userName || adminSupportThreadMeta?.userEmail || 'Conversation'}
                            </p>
                            <p className={`text-xs mt-0.5 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>
                              {adminSupportThreadMeta?.userEmail ? `${adminSupportThreadMeta.userEmail} · ` : ''}User ID{' '}
                              {String(adminSupportSelectedUserId)}
                            </p>
                            {adminSupportThreadMeta?.needsHuman ? (
                              <p className={`text-xs mt-1 font-semibold ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>
                                Flagged for human support
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setAdminSupportModalOpen(false);
                            setAdminSupportEditingMessageId(null);
                            setAdminSupportReplyDraft('');
                            setAdminSupportPendingImage(null);
                            setAdminSupportReplyTo(null);
                            setAdminSupportMsgActionsMenu(null);
                          }}
                          className={`p-2 rounded-lg shrink-0 ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
                          aria-label="Close"
                        >
                          <Svg.Close stroke={stroke} />
                        </button>
                      </div>
                      <div
                        className={`flex flex-wrap items-center gap-2 px-3 py-2 border-b shrink-0 text-xs ${isDark ? 'border-white/10 bg-black/20' : 'border-slate-200 bg-slate-50/80'}`}
                      >
                        <span className={`font-medium shrink-0 ${isDark ? 'text-white/70' : 'text-slate-600'}`}>
                          Auto-clear chat
                        </span>
                        {adminSupportThreadMeta?.autoClearAt ? (
                          <span
                            className={`tabular-nums shrink-0 ${isDark ? 'text-amber-200/95' : 'text-amber-800'}`}
                            title={String(adminSupportThreadMeta.autoClearAt)}
                          >
                            in {formatSupportAutoClearRemaining(adminSupportThreadMeta.autoClearAt)}
                          </span>
                        ) : (
                          <span className={isDark ? 'text-white/40' : 'text-slate-500'}>Off</span>
                        )}
                        <button
                          type="button"
                          disabled={adminSupportAutoClearBusy || !adminSupportThreadMeta?.autoClearAt}
                          onClick={() => applyAdminSupportAutoClear({ cancel: true })}
                          className={`shrink-0 px-2 py-1 rounded-lg font-medium disabled:opacity-40 ${isDark ? 'bg-white/10 hover:bg-white/15 text-white' : 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-800'}`}
                        >
                          Clear timer
                        </button>
                        <select
                          key={`support-ac-${adminSupportSelectedUserId}-${adminSupportThreadMeta?.autoClearAt || 'off'}`}
                          defaultValue=""
                          disabled={adminSupportAutoClearBusy}
                          aria-label="Schedule chat clear"
                          onChange={(e) => {
                            const v = e.target.value;
                            e.target.value = '';
                            if (!v.startsWith('ds:')) return;
                            const n = Number(v.slice(3));
                            if (!Number.isFinite(n)) return;
                            applyAdminSupportAutoClear({ durationSeconds: n });
                          }}
                          className={`min-w-[9rem] max-w-full rounded-lg px-2 py-1 border text-[11px] ${isDark ? 'bg-zinc-900 border-white/15 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                        >
                          <option value="">Quick schedule…</option>
                          <option value="ds:30">30 seconds</option>
                          <option value="ds:60">1 minute</option>
                          <option value="ds:120">2 minutes</option>
                          <option value="ds:300">5 minutes</option>
                          <option value="ds:900">15 minutes</option>
                          <option value="ds:3600">1 hour</option>
                          <option value="ds:21600">6 hours</option>
                          <option value="ds:86400">24 hours</option>
                          <option value="ds:604800">7 days</option>
                        </select>
                        <span className={`shrink-0 ${isDark ? 'text-white/40' : 'text-slate-400'}`}>·</span>
                        <span className={`shrink-0 ${isDark ? 'text-white/55' : 'text-slate-500'}`}>Custom</span>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          inputMode="numeric"
                          placeholder="0"
                          value={adminSupportAutoClearCustomMin}
                          onChange={(e) => setAdminSupportAutoClearCustomMin(e.target.value)}
                          disabled={adminSupportAutoClearBusy}
                          aria-label="Custom minutes"
                          className={`w-11 rounded-md border px-1.5 py-1 text-center tabular-nums text-[11px] ${isDark ? 'bg-zinc-900 border-white/15 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                        />
                        <span className={isDark ? 'text-white/45' : 'text-slate-500'}>m</span>
                        <input
                          type="number"
                          min={0}
                          max={59}
                          step={1}
                          inputMode="numeric"
                          placeholder="0"
                          value={adminSupportAutoClearCustomSec}
                          onChange={(e) => setAdminSupportAutoClearCustomSec(e.target.value)}
                          disabled={adminSupportAutoClearBusy}
                          aria-label="Custom seconds"
                          className={`w-11 rounded-md border px-1.5 py-1 text-center tabular-nums text-[11px] ${isDark ? 'bg-zinc-900 border-white/15 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                        />
                        <span className={isDark ? 'text-white/45' : 'text-slate-500'}>s</span>
                        <button
                          type="button"
                          disabled={adminSupportAutoClearBusy}
                          onClick={() => {
                            const m =
                              adminSupportAutoClearCustomMin === ''
                                ? 0
                                : Number(adminSupportAutoClearCustomMin);
                            const s =
                              adminSupportAutoClearCustomSec === ''
                                ? 0
                                : Number(adminSupportAutoClearCustomSec);
                            applyAdminSupportAutoClear({
                              minutes: Number.isFinite(m) ? m : 0,
                              seconds: Number.isFinite(s) ? s : 0,
                            });
                          }}
                          className={`shrink-0 px-2 py-1 rounded-lg font-medium disabled:opacity-40 ${isDark ? 'bg-sky-600/35 hover:bg-sky-600/45 text-sky-50' : 'bg-sky-600 text-white hover:bg-sky-700'}`}
                        >
                          Apply
                        </button>
                      </div>
                      {adminSupportError ? (
                        <div className={`mx-3 mt-2 rounded-xl p-2 text-xs shrink-0 ${isDark ? 'bg-rose-500/15 border border-rose-500/35 text-rose-100' : 'bg-rose-50 border border-rose-200 text-rose-900'}`}>
                          {adminSupportError}
                        </div>
                      ) : null}
                      <div
                        className={`min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-y-contain p-3 space-y-3 [-webkit-overflow-scrolling:touch] ${isDark ? 'text-white/90' : 'text-slate-800'}`}
                      >
                        {adminSupportMessagesUi.map((m) => {
                          const isUser = m.role === 'user';
                          const isAdm = m.role === 'admin';
                          const msgIso = supportMsgIso(m);
                          const timeLabel = supportMessageTimestamp(msgIso);
                          const timeMuted = isDark ? 'text-white/40' : 'text-slate-400';
                          const bubble = isUser
                            ? isDark
                              ? 'bg-sky-600/40 text-sky-50'
                              : 'bg-sky-100 text-sky-950 border border-sky-200'
                            : isAdm
                              ? ''
                              : isDark
                                ? 'bg-white/10 text-white/85'
                                : 'bg-slate-200/80 text-slate-800';
                          const customerAv = adminSupportThreadMeta?.profileAvatar;
                          const customerInitial = supportInboxAvatarInitial(
                            adminSupportThreadMeta?.userName,
                            adminSupportThreadMeta?.userEmail,
                          );
                          const customerAvatarEl = isUser ? (
                            <SupportInboxAvatar
                              src={customerAv}
                              initial={customerInitial}
                              isDark={isDark}
                              className="h-7 w-7"
                            />
                          ) : null;
                          const timeRowEl =
                            timeLabel || m.editedAt ? (
                              <div
                                className={`flex flex-wrap items-center gap-x-1 px-0.5 ${isUser ? 'justify-end' : 'justify-start'}`}
                              >
                                {timeLabel ? (
                                  <time
                                    dateTime={msgIso || undefined}
                                    className={`text-[10px] font-medium tabular-nums leading-none ${timeMuted}`}
                                  >
                                    {timeLabel}
                                  </time>
                                ) : null}
                                {m.editedAt ? (
                                  <span className={`text-[10px] font-medium ${timeMuted}`}>· edited</span>
                                ) : null}
                              </div>
                            ) : null;
                          if (m.image) {
                            const captionInCard =
                              isUser && m.body
                                ? isDark
                                  ? 'px-3 py-2.5 text-sm whitespace-pre-wrap border-t border-sky-500/25 bg-sky-950/30 text-sky-50'
                                  : 'px-3 py-2.5 text-sm whitespace-pre-wrap border-t border-sky-200 bg-sky-50/95 text-sky-950'
                                : isAdm && m.body
                                  ? isDark
                                    ? 'px-3 py-2.5 text-sm whitespace-pre-wrap border-t border-white/10 bg-white/5 text-white/90'
                                    : 'px-3 py-2.5 text-sm whitespace-pre-wrap border-t border-slate-100 bg-slate-50/95 text-slate-800'
                                  : m.body
                                    ? isDark
                                      ? 'px-3 py-2.5 text-sm whitespace-pre-wrap border-t border-white/10 text-white/90'
                                      : 'px-3 py-2.5 text-sm whitespace-pre-wrap border-t border-slate-100 text-slate-800'
                                    : '';
                            const imageCard = (
                              <div
                                className={`max-w-full overflow-hidden rounded-xl ring-1 ${isDark ? 'ring-white/10 bg-zinc-900' : 'ring-slate-200/90 bg-white'}`}
                              >
                                <SupportReplyQuoteInBubble m={m} isDark={isDark} viewerIsUser={false} inImageCard />
                                <div className={isDark ? 'bg-zinc-950/40' : 'bg-slate-50'}>
                                  <img src={m.image} alt="" className="block max-h-40 max-w-full object-contain" />
                                </div>
                                {m.body ? (
                                  <div className={captionInCard}>
                                    {m.role === 'system' ? supportInlineBold(m.body) : m.body}
                                  </div>
                                ) : null}
                              </div>
                            );
                            return (
                              <div
                                key={m.id}
                                className={`flex items-end gap-1.5 touch-pan-y ${isUser ? 'justify-end' : 'justify-start'}`}
                                onPointerDown={(e) => adminSupportThreadSwipeDown(e, m)}
                                onPointerUp={(e) => adminSupportThreadSwipeUp(e, m)}
                                onPointerCancel={adminSupportThreadSwipeCancel}
                              >
                                {isUser ? (
                                  <>
                                    <div className="flex flex-col gap-0.5 items-end max-w-[92%]">
                                      {imageCard}
                                      {timeRowEl}
                                    </div>
                                    {customerAvatarEl}
                                  </>
                                ) : (
                                  <div
                                    className={`flex flex-col gap-0.5 items-start max-w-[92%] mr-6${
                                      isAdm && m.id && adminSupportSelectedUserId
                                        ? ' touch-manipulation select-none [-webkit-tap-highlight-color:transparent]'
                                        : ''
                                    }`}
                                    onDoubleClick={
                                      isAdm && m.id && adminSupportSelectedUserId
                                        ? (e) => handleAdminOwnBubbleInteract(e, m.id)
                                        : undefined
                                    }
                                    onTouchEnd={
                                      isAdm && m.id && adminSupportSelectedUserId
                                        ? (e) => handleAdminOwnBubbleInteract(e, m.id)
                                        : undefined
                                    }
                                    {...(isAdm && m.id && adminSupportSelectedUserId
                                      ? { 'aria-label': 'Double-tap message for edit or delete' }
                                      : {})}
                                  >
                                    {imageCard}
                                    {timeRowEl}
                                  </div>
                                )}
                              </div>
                            );
                          }
                          return (
                            <div
                              key={m.id}
                              className={`flex items-end gap-1.5 touch-pan-y ${isUser ? 'justify-end' : 'justify-start'}`}
                              onPointerDown={(e) => adminSupportThreadSwipeDown(e, m)}
                              onPointerUp={(e) => adminSupportThreadSwipeUp(e, m)}
                              onPointerCancel={adminSupportThreadSwipeCancel}
                            >
                              {isUser ? (
                                <>
                                  <div className="flex flex-col gap-0.5 items-end max-w-[92%]">
                                    <div className={`rounded-2xl px-3 py-2 text-sm max-w-full whitespace-pre-wrap ${bubble}`}>
                                      <SupportReplyQuoteInBubble m={m} isDark={isDark} viewerIsUser={false} />
                                      {m.role === 'system' ? supportInlineBold(m.body) : m.body || null}
                                    </div>
                                    {timeRowEl}
                                  </div>
                                  {customerAvatarEl}
                                </>
                              ) : (
                                <div
                                  className={`flex flex-col gap-0.5 items-start max-w-[92%] mr-6${
                                    isAdm && m.id && adminSupportSelectedUserId
                                      ? ' touch-manipulation select-none [-webkit-tap-highlight-color:transparent]'
                                      : ''
                                  }`}
                                  onDoubleClick={
                                    isAdm && m.id && adminSupportSelectedUserId
                                      ? (e) => handleAdminOwnBubbleInteract(e, m.id)
                                      : undefined
                                  }
                                  onTouchEnd={
                                    isAdm && m.id && adminSupportSelectedUserId
                                      ? (e) => handleAdminOwnBubbleInteract(e, m.id)
                                      : undefined
                                  }
                                  {...(isAdm && m.id && adminSupportSelectedUserId
                                    ? { 'aria-label': 'Double-tap message for edit or delete' }
                                    : {})}
                                >
                                  <div
                                    className={
                                      isAdm
                                        ? supportAdminReplyBubbleClass(isDark)
                                        : `rounded-2xl px-3 py-2 text-sm max-w-full whitespace-pre-wrap ${bubble}`
                                    }
                                  >
                                    <SupportReplyQuoteInBubble m={m} isDark={isDark} viewerIsUser={false} />
                                    {m.role === 'system' ? supportInlineBold(m.body) : m.body || null}
                                  </div>
                                  {timeRowEl}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {adminSupportUserTyping ? (
                          <SupportTypingIndicator
                            align="end"
                            isDark={isDark}
                            avatar={
                              <SupportInboxAvatar
                                src={adminSupportThreadMeta?.profileAvatar}
                                initial={supportInboxAvatarInitial(
                                  adminSupportThreadMeta?.userName,
                                  adminSupportThreadMeta?.userEmail,
                                )}
                                isDark={isDark}
                                className="h-7 w-7 shrink-0"
                              />
                            }
                          />
                        ) : null}
                      </div>
                      <div className={`border-t shrink-0 rounded-b-2xl relative z-[2] ${isDark ? 'border-white/10 bg-black/40' : 'border-slate-200 bg-white'}`}>
                        <div className="p-3">
                        {adminSupportReplyTo ? (
                          <SupportComposerReplyPreview
                            replyTo={adminSupportReplyTo}
                            isDark={isDark}
                            viewerIsUser={false}
                            onDismiss={() => {
                              clearPersistedAdminReplyDraft(adminSupportSelectedUserId);
                              setAdminSupportReplyTo(null);
                            }}
                          />
                        ) : null}
                        {adminSupportPendingImage ? (
                          <div className="mb-2">
                            <div className="relative inline-block">
                              <div
                                className={`h-10 w-14 shrink-0 overflow-hidden rounded-md ${isDark ? 'ring-1 ring-white/15' : 'ring-1 ring-slate-200/90'}`}
                              >
                                <img src={adminSupportPendingImage} alt="" className="h-full w-full object-cover" />
                              </div>
                              <button
                                type="button"
                                className={`absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-xs font-light leading-none shadow ${isDark ? 'bg-zinc-800 text-white ring-1 ring-white/20 hover:bg-zinc-700' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'}`}
                                onClick={() => {
                                  setAdminSupportPendingImage(null);
                                  setAdminSupportError(null);
                                }}
                                aria-label="Remove attachment"
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        ) : null}
                        {adminSupportEditingMessageId ? (
                          <div
                            className={`mb-2 flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-xs ${isDark ? 'bg-sky-500/15 text-sky-100/95' : 'bg-sky-50 text-sky-950'}`}
                          >
                            <span className="font-medium min-w-0">Editing a message — send to save.</span>
                            <button
                              type="button"
                              className={`shrink-0 font-semibold underline-offset-2 hover:underline ${isDark ? 'text-sky-200' : 'text-sky-800'}`}
                              onClick={() => {
                                setAdminSupportEditingMessageId(null);
                                setAdminSupportReplyDraft('');
                                setAdminSupportPendingImage(null);
                                clearPersistedAdminReplyDraft(adminSupportSelectedUserId);
                                setAdminSupportReplyTo(null);
                                setAdminSupportError(null);
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : null}
                        <div className={`telesopy-chat-row ${isDark ? 'text-white' : 'text-slate-800'}`}>
                          <div className="telesopy-grid-btn-wrap">
                            <input
                              ref={adminSupportAttachmentInputRef}
                              type="file"
                              accept="image/*"
                              className="telesopy-file-input"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                e.target.value = '';
                                if (!f || !f.type.startsWith('image/')) return;
                                if (f.size > 900 * 1024) {
                                  setAdminSupportError('Image too large (max ~900KB).');
                                  return;
                                }
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                  const url = typeof reader.result === 'string' ? reader.result : '';
                                  if (!url.startsWith('data:image/')) return;
                                  setAdminSupportError(null);
                                  setAdminSupportPendingImage(url);
                                };
                                reader.readAsDataURL(f);
                              }}
                            />
                            <button
                              type="button"
                              className="telesopy-sidebar-btn"
                              disabled={adminSupportReplySending}
                              title="Attach image"
                              aria-label="Attach image"
                              onClick={() => adminSupportAttachmentInputRef.current?.click()}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <path d="M12 5v14M5 12h14" />
                              </svg>
                            </button>
                          </div>
                          <div className="telesopy-chat-bar-wrap">
                            <UltraxasChatBar
                              value={adminSupportReplyDraft}
                              onChange={setAdminSupportReplyDraft}
                              onSubmit={async () => {
                                if (adminSupportReplySending || !adminSupportSelectedUserId) return;
                                const uid = adminSupportSelectedUserId;
                                if (adminSupportEditingMessageId) {
                                  const mid = adminSupportEditingMessageId;
                                  const orig = adminSupportThreadMessages.find(
                                    (x) => String(x.id) === String(mid),
                                  );
                                  const hadImage = !!(orig && orig.image);
                                  if (adminSupportPendingImage) {
                                    const caption = adminSupportReplyDraft.trim();
                                    setAdminSupportReplySending(true);
                                    setAdminSupportError(null);
                                    const img = adminSupportPendingImage;
                                    setAdminSupportPendingImage(null);
                                    try {
                                      const d = await api.patchAdminSupportMessage(uid, {
                                        messageId: mid,
                                        text: caption,
                                        image: img,
                                      });
                                      void api.postAdminSupportTyping(uid, false).catch(() => {});
                                      const inc = Array.isArray(d.messages) ? d.messages : [];
                                      setAdminSupportThreadMessages((prev) =>
                                        mergeSupportReplyMetaFromPrev(prev, inc),
                                      );
                                      setAdminSupportReplyDraft('');
                                      setAdminSupportEditingMessageId(null);
                                      const list = await api.getAdminSupportInbox();
                                      setAdminSupportInbox(Array.isArray(list) ? list : []);
                                    } catch (err) {
                                      setAdminSupportError(err?.message || 'Update failed');
                                      setAdminSupportPendingImage(img);
                                    } finally {
                                      setAdminSupportReplySending(false);
                                    }
                                    return;
                                  }
                                  if (hadImage && !adminSupportPendingImage) {
                                    const t = adminSupportReplyDraft.trim();
                                    if (!t) {
                                      setAdminSupportError(
                                        'Add text after removing the photo, or keep a photo.',
                                      );
                                      return;
                                    }
                                    setAdminSupportReplySending(true);
                                    setAdminSupportError(null);
                                    try {
                                      const d = await api.patchAdminSupportMessage(uid, {
                                        messageId: mid,
                                        text: t,
                                        removeImage: true,
                                      });
                                      void api.postAdminSupportTyping(uid, false).catch(() => {});
                                      const inc = Array.isArray(d.messages) ? d.messages : [];
                                      setAdminSupportThreadMessages((prev) =>
                                        mergeSupportReplyMetaFromPrev(prev, inc),
                                      );
                                      setAdminSupportReplyDraft('');
                                      setAdminSupportEditingMessageId(null);
                                      const list = await api.getAdminSupportInbox();
                                      setAdminSupportInbox(Array.isArray(list) ? list : []);
                                    } catch (err) {
                                      setAdminSupportError(err?.message || 'Update failed');
                                    } finally {
                                      setAdminSupportReplySending(false);
                                    }
                                    return;
                                  }
                                  const t = adminSupportReplyDraft.trim();
                                  if (!t) return;
                                  setAdminSupportReplySending(true);
                                  setAdminSupportError(null);
                                  try {
                                    const d = await api.patchAdminSupportMessage(uid, {
                                      messageId: mid,
                                      text: t,
                                    });
                                    void api.postAdminSupportTyping(uid, false).catch(() => {});
                                    const inc = Array.isArray(d.messages) ? d.messages : [];
                                    setAdminSupportThreadMessages((prev) =>
                                      mergeSupportReplyMetaFromPrev(prev, inc),
                                    );
                                    setAdminSupportReplyDraft('');
                                    setAdminSupportEditingMessageId(null);
                                    const list = await api.getAdminSupportInbox();
                                    setAdminSupportInbox(Array.isArray(list) ? list : []);
                                  } catch (err) {
                                    setAdminSupportError(err?.message || 'Update failed');
                                  } finally {
                                    setAdminSupportReplySending(false);
                                  }
                                  return;
                                }
                                if (adminSupportPendingImage) {
                                  const caption = adminSupportReplyDraft.trim();
                                  setAdminSupportReplySending(true);
                                  setAdminSupportError(null);
                                  const img = adminSupportPendingImage;
                                  const replySnap = adminSupportReplyTo;
                                  const replyToId = replySnap?.id;
                                  setAdminSupportPendingImage(null);
                                  try {
                                    const d = await api.postAdminSupportReply(
                                      uid,
                                      caption,
                                      img,
                                      replyToId,
                                      replySnap ? { preview: replySnap.preview, role: replySnap.role } : null,
                                    );
                                    void api.postAdminSupportTyping(uid, false).catch(() => {});
                                    const injected = injectAdminReplyMetaIfMissing(
                                      Array.isArray(d.messages) ? d.messages : [],
                                      replySnap,
                                    );
                                    setAdminSupportThreadMessages((prev) =>
                                      mergeSupportReplyMetaFromPrev(prev, injected),
                                    );
                                    setAdminSupportReplyDraft('');
                                    clearPersistedAdminReplyDraft(uid);
                                    setAdminSupportReplyTo(null);
                                    const list = await api.getAdminSupportInbox();
                                    setAdminSupportInbox(Array.isArray(list) ? list : []);
                                  } catch (err) {
                                    setAdminSupportError(err?.message || 'Reply failed');
                                    setAdminSupportPendingImage(img);
                                  } finally {
                                    setAdminSupportReplySending(false);
                                  }
                                  return;
                                }
                                const t = adminSupportReplyDraft.trim();
                                if (!t) return;
                                setAdminSupportReplySending(true);
                                setAdminSupportError(null);
                                const replySnap = adminSupportReplyTo;
                                try {
                                  const d = await api.postAdminSupportReply(
                                    uid,
                                    t,
                                    undefined,
                                    replySnap?.id,
                                    replySnap ? { preview: replySnap.preview, role: replySnap.role } : null,
                                  );
                                  void api.postAdminSupportTyping(uid, false).catch(() => {});
                                  const injected = injectAdminReplyMetaIfMissing(
                                    Array.isArray(d.messages) ? d.messages : [],
                                    replySnap,
                                  );
                                  setAdminSupportThreadMessages((prev) =>
                                    mergeSupportReplyMetaFromPrev(prev, injected),
                                  );
                                  setAdminSupportReplyDraft('');
                                  clearPersistedAdminReplyDraft(uid);
                                  setAdminSupportReplyTo(null);
                                  const list = await api.getAdminSupportInbox();
                                  setAdminSupportInbox(Array.isArray(list) ? list : []);
                                } catch (err) {
                                  setAdminSupportError(err?.message || 'Reply failed');
                                } finally {
                                  setAdminSupportReplySending(false);
                                }
                              }}
                              placeholder={
                                adminSupportEditingMessageId
                                  ? adminSupportPendingImage
                                    ? 'Optional caption…'
                                    : 'Update your reply…'
                                  : adminSupportPendingImage
                                    ? 'Optional caption…'
                                    : 'Reply to customer…'
                              }
                              disabled={adminSupportReplySending}
                              isDark={isDark}
                              allowSendEmpty={!!adminSupportPendingImage}
                              onInputFocusChange={setAdminSupportComposerFocused}
                            />
                          </div>
                        </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
            {!adminSupportModalOpen && (
              <button
                ref={adminInboxFabRef}
                type="button"
                onClick={handleAdminInboxFabClick}
                onMouseDown={handleAdminInboxFabDragStart}
                onTouchStart={handleAdminInboxFabDragStart}
                className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full shadow-xl flex items-center justify-center hover:scale-110 active:scale-95 transition-transform relative cursor-grab active:cursor-grabbing ${isDark ? 'bg-zinc-800 text-white ring-1 ring-white/15' : 'bg-white text-slate-900'}`}
                style={{
                  position: 'fixed',
                  zIndex: supportChatIntroOpen ? 99984 : 99999,
                  ...(adminInboxFabPosition
                    ? { left: adminInboxFabPosition.x, top: adminInboxFabPosition.y, right: 'auto', bottom: 'auto' }
                    : {
                        bottom:
                          isSignedIn && !adminRoute && api.getToken()
                            ? 'calc(max(4rem, env(safe-area-inset-bottom) + 3rem) + 7.5rem)'
                            : 'calc(max(4rem, env(safe-area-inset-bottom) + 3rem) + 3.75rem)',
                        right: 'max(0.75rem, env(safe-area-inset-right))',
                        left: 'auto',
                        top: 'auto',
                      }),
                }}
                aria-label="Open admin inbox"
                title="Inbox"
              >
                <Svg.Inbox stroke="currentColor" className="pointer-events-none w-[22px] h-[22px] sm:w-[26px] sm:h-[26px]" />
                {(() => {
                  const n = adminSupportInbox.reduce((acc, r) => acc + (Number(r.unreadForAdmin) > 0 ? Number(r.unreadForAdmin) : 0), 0);
                  if (n <= 0) return null;
                  return (
                    <span className="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1 rounded-full text-xs font-bold flex items-center justify-center pointer-events-none bg-rose-500 text-white tabular-nums">
                      {n > 99 ? '99+' : n}
                    </span>
                  );
                })()}
              </button>
            )}
            {adminSupportMsgActionsMenu &&
            adminSupportModalOpen &&
            adminSupportPhase === 'thread' &&
            adminSupportSelectedUserId ? (
              <SupportMessageActionsMenu
                anchor={adminSupportMsgActionsMenu}
                isDark={isDark}
                align="start"
                disabled={
                  adminSupportReplySending ||
                  String(adminSupportEditingMessageId) === String(adminSupportMsgActionsMenu.messageId)
                }
                onClose={closeAdminSupportMsgActionsMenu}
                onEdit={() => {
                  const mid = adminSupportMsgActionsMenu.messageId;
                  const row = adminSupportThreadMessages.find((x) => String(x.id) === String(mid));
                  if (!row || adminSupportReplySending) return;
                  setAdminSupportEditingMessageId(row.id);
                  setAdminSupportReplyDraft(row.body || '');
                  setAdminSupportPendingImage(row.image || null);
                  setAdminSupportError(null);
                }}
                onDelete={() => {
                  const mid = adminSupportMsgActionsMenu.messageId;
                  if (adminSupportReplySending) return;
                  setAdminSupportDeleteConfirmMessageId(mid);
                  setAdminSupportMsgActionsMenu(null);
                }}
              />
            ) : null}
            {adminSupportDeleteConfirmMessageId &&
            adminSupportModalOpen &&
            adminSupportPhase === 'thread' &&
            adminSupportSelectedUserId ? (
              <div
                className="fixed inset-0 z-[100000] flex items-center justify-center p-4"
                role="dialog"
                aria-modal="true"
                aria-labelledby="admin-support-delete-msg-title"
              >
                <div
                  className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                  onClick={() => {
                    if (!adminSupportReplySending) setAdminSupportDeleteConfirmMessageId(null);
                  }}
                  aria-hidden="true"
                />
                <div
                  className={`relative w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl p-5 sm:p-6 border ${isDark ? 'bg-zinc-950 border-white/15' : 'bg-white border-slate-200'}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3
                    id="admin-support-delete-msg-title"
                    className={`text-lg font-bold mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}
                  >
                    Delete this message?
                  </h3>
                  <p className={`text-sm mb-6 leading-relaxed ${isDark ? 'text-white/75' : 'text-slate-600'}`}>
                    This removes the message from the customer’s thread. You can’t undo this.
                  </p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      disabled={adminSupportReplySending}
                      onClick={() => setAdminSupportDeleteConfirmMessageId(null)}
                      className={`flex-1 py-2.5 rounded-xl font-semibold transition-colors disabled:opacity-50 ${isDark ? 'bg-white/10 text-white hover:bg-white/20 border border-white/15' : 'bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200'}`}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={adminSupportReplySending}
                      onClick={() => {
                        const mid = adminSupportDeleteConfirmMessageId;
                        const uid = adminSupportSelectedUserId;
                        if (!mid || !uid || adminSupportReplySending) return;
                        const clearComposer = String(adminSupportEditingMessageId) === String(mid);
                        setAdminSupportReplySending(true);
                        setAdminSupportError(null);
                        setAdminSupportDeleteConfirmMessageId(null);
                        api
                          .deleteAdminSupportMessage(uid, mid)
                          .then(async (d) => {
                            const inc = Array.isArray(d.messages) ? d.messages : [];
                            setAdminSupportThreadMessages((prev) =>
                              mergeSupportReplyMetaFromPrev(prev, inc),
                            );
                            setAdminSupportEditingMessageId((prev) =>
                              String(prev) === String(mid) ? null : prev,
                            );
                            if (clearComposer) {
                              setAdminSupportReplyDraft('');
                              setAdminSupportPendingImage(null);
                            }
                            const list = await api.getAdminSupportInbox();
                            setAdminSupportInbox(Array.isArray(list) ? list : []);
                            setAdminSupportMsgActionsMenu(null);
                          })
                          .catch((err) => setAdminSupportError(err?.message || 'Delete failed'))
                          .finally(() => setAdminSupportReplySending(false));
                      }}
                      className="flex-1 py-2.5 rounded-xl font-semibold transition-colors disabled:opacity-60 bg-red-600 text-white hover:bg-red-500 border border-red-500/80"
                    >
                      {adminSupportReplySending ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </>,
          document.body
        )}

      {/* Cart FAB - portaled so it can be dragged anywhere on the viewport */}
      {typeof document !== 'undefined' &&
        createPortal(
        <button
          ref={cartButtonRef}
          onClick={handleCartButtonClick}
          onMouseDown={handleCartButtonDragStart}
          onTouchStart={handleCartButtonDragStart}
          className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white text-slate-900 shadow-xl flex items-center justify-center hover:scale-110 transition-transform relative cursor-grab active:cursor-grabbing"
          style={{
            position: 'fixed',
            zIndex: supportChatIntroOpen ? 99984 : 99998,
            ...(cartButtonPosition
              ? { left: cartButtonPosition.x, top: cartButtonPosition.y, right: 'auto', bottom: 'auto' }
              : { bottom: 'max(4rem, calc(env(safe-area-inset-bottom) + 3rem))', right: 'max(0.75rem, env(safe-area-inset-right))', left: 'auto', top: 'auto' }
            ),
          }}
          aria-label="Cart"
        >
          <Svg.Cart stroke="currentColor" className="pointer-events-none" />
          {cart.length > 0 && (
            <span className={`absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1 rounded-full text-xs font-bold flex items-center justify-center pointer-events-none ${isDark ? 'bg-white text-black' : 'bg-black text-white'}`}>
              {cart.length > 9 ? '9+' : cart.length}
            </span>
          )}
        </button>,
        document.body
      )}

      {/* Cart dialog - centered modal like the buy dialog */}
      {cartOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setCartOpen(false)} aria-hidden="true" />
          <div className={`relative w-full max-w-md rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col ${isDark ? 'bg-black' : 'bg-slate-50'}`}>
            <div className={`flex items-center justify-between p-4 border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
              <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>Cart ({cart.length})</h2>
              <button type="button" onClick={() => setCartOpen(false)} className={`p-2 rounded-lg shrink-0 ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`} aria-label="Close cart">
                <Svg.Close stroke={stroke} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 min-h-0">
              {cart.length === 0 ? (
                <p className={`text-center py-8 text-sm ${isDark ? 'text-white/60' : 'text-slate-500'}`}>Your cart is empty</p>
              ) : (
                <ul className="space-y-3">
                  {cart.map((item) => {
                    const arr = bundlesData && bundlesData[item.bundle.network];
                    const bundleIdx = Array.isArray(arr) ? arr.findIndex((b) => String(b.size) === String(item.bundle.size)) : -1;
                    return (
                      <li key={item.id} className={`flex items-center justify-between gap-3 p-3 rounded-xl ${isDark ? 'bg-white/5 border border-white/10' : 'bg-slate-50 border border-slate-200'}`}>
                        <div className="min-w-0">
                          <p className={`font-medium truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{networkLabel(item.bundle.network)} {item.bundle.size}</p>
                          <p className={`text-sm truncate ${isDark ? 'text-white/60' : 'text-slate-500'}`}>{item.recipientNumber}</p>
                          <p className={`text-sm font-medium ${isDark ? 'text-white/90' : 'text-slate-700'}`}>¢ {item.bundle.price}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {adminStoreTools && bundleIdx >= 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const b = arr[bundleIdx];
                                setEditingBundle({ network: item.bundle.network, index: bundleIdx });
                                setEditBundleForm({ size: b.size, price: typeof b.price === 'number' ? b.price : parseFloat(b.price) || 0 });
                                setAdminBundlesMessage(null);
                              }}
                              className={`p-2 rounded-lg ${isDark ? 'text-white/80 hover:bg-white/10' : 'text-slate-600 hover:bg-slate-200'}`}
                              aria-label="Edit package"
                              title="Edit package (updates for everyone)"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                            </button>
                          )}
                          <button type="button" onClick={() => removeFromCart(item.id)} className={`p-2 rounded-lg shrink-0 ${isDark ? 'text-red-400 hover:bg-white/10' : 'text-red-600 hover:bg-slate-200'}`} aria-label="Remove">
                            <Svg.Trash stroke="currentColor" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {cart.length > 0 && (
              <div className={`p-4 border-t shrink-0 ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                <p className={`text-sm mb-3 ${isDark ? 'text-white/70' : 'text-slate-600'}`}>
                  Total: <span className="font-bold">¢ {cart.reduce((sum, i) => sum + parseFloat(i.bundle.price), 0).toFixed(2)}</span>
                </p>
                <button type="button" onClick={() => { setConfirmCheckoutOpen(true); setConfirmError(null); }} className={`w-full py-3 rounded-xl font-semibold transition-colors ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/90'}`}>
                  Checkout
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirm Order dialog - shown after clicking Checkout */}
      {confirmCheckoutOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setConfirmCheckoutOpen(false); setConfirmError(null); }} aria-hidden="true" />
          <div className={`relative w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl p-5 sm:p-6 ${isDark ? 'bg-black border border-white/10' : 'bg-white'}`}>
            <h3 className={`text-lg font-bold mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>Confirm Order</h3>
            <p className={`text-base mb-2 ${isDark ? 'text-white/80' : 'text-slate-600'}`}>
              You are about to pay ¢ {cart.reduce((sum, i) => sum + parseFloat(i.bundle.price), 0).toFixed(2)} with your wallet.
            </p>
            {confirmError && (
              <p className="text-sm text-red-500 dark:text-red-400 mb-4 font-medium">{confirmError}</p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setConfirmCheckoutOpen(false); setConfirmError(null); }}
                className={`flex-1 py-2.5 rounded-xl font-medium transition-colors ${isDark ? 'bg-white/10 text-white hover:bg-white/20 border border-white/10' : 'bg-slate-200 text-slate-800 hover:bg-slate-300 border border-slate-200'}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const total = cart.reduce((sum, i) => sum + parseFloat(i.bundle.price), 0);
                  if (walletBalance < total) {
                    setConfirmError(`Insufficient balance. You have ¢ ${walletBalance.toFixed(2)} but the total is ¢ ${total.toFixed(2)}. Top up your wallet or remove items from the cart.`);
                    return;
                  }
                  setConfirmError(null);
                  try {
                    const data = await api.createOrders(cart);
                    setWalletBalance(data.balance);
                    setConfirmCheckoutOpen(false);
                    setCartOpen(false);
                    setCart([]);
                    fetchWallet();
                    api.getOrders().then((list) => setOrders(stabilizeOrdersList(list))).catch(() => {});
                    if (adminPinVerified || user?.role === 'admin') {
                      api.getAdminOrders()
                        .then((list) => setAdminOrders(Array.isArray(list) ? list : []))
                        .catch(() => {});
                    }
                  } catch (err) {
                    setConfirmError(err.message || 'Payment failed. Try again.');
                  }
                }}
                className={`flex-1 py-2.5 rounded-xl font-medium transition-colors border border-transparent ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/90'}`}
              >
                Confirm & Pay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete broadcast — in-app confirm (avoids native browser dialog) */}
      {broadcastDeleteConfirm && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="broadcast-delete-title"
        >
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => {
              if (!broadcastDeleteBusy) setBroadcastDeleteConfirm(null);
            }}
            aria-hidden="true"
          />
          <div
            className={`relative w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl p-5 sm:p-6 border ${isDark ? 'bg-zinc-950 border-white/15' : 'bg-white border-slate-200'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="broadcast-delete-title" className={`text-lg font-bold mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Delete this broadcast?
            </h3>
            <p className={`text-sm mb-6 leading-relaxed ${isDark ? 'text-white/75' : 'text-slate-600'}`}>
              This permanently removes “{broadcastDeleteConfirm.title}”. Customers will no longer see it.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                disabled={broadcastDeleteBusy}
                onClick={() => setBroadcastDeleteConfirm(null)}
                className={`flex-1 py-2.5 rounded-xl font-semibold transition-colors disabled:opacity-50 ${isDark ? 'bg-white/10 text-white hover:bg-white/20 border border-white/15' : 'bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200'}`}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={broadcastDeleteBusy}
                onClick={async () => {
                  const rowId = broadcastDeleteConfirm.id;
                  setBroadcastDeleteBusy(true);
                  setAdminBroadcastsError(null);
                  try {
                    await api.deleteAdminBroadcast(rowId);
                    setAdminBroadcastPreview((p) => (p && String(p.id) === String(rowId) ? null : p));
                    if (String(broadcastEditingId) === String(rowId)) {
                      setBroadcastEditingId(null);
                      setBroadcastForm({
                        title: '',
                        caption: '',
                        image_url: '',
                        active: true,
                        popup_delay_seconds: 2,
                        auto_close_seconds: 0,
                        reshow_after_hours: 0,
                        cta_url: '',
                        cta_label: '',
                        cta_open_new_tab: true,
                      });
                    }
                    setAdminBroadcasts((prev) => prev.filter((x) => String(x.id) !== String(rowId)));
                    setBroadcastDeleteConfirm(null);
                  } catch (err) {
                    setAdminBroadcastsError(err?.message || 'Delete failed');
                  } finally {
                    setBroadcastDeleteBusy(false);
                  }
                }}
                className="flex-1 py-2.5 rounded-xl font-semibold transition-colors disabled:opacity-60 bg-red-600 text-white hover:bg-red-500 border border-red-500/80"
              >
                {broadcastDeleteBusy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Profile modal */}
      {editProfileOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setEditProfileOpen(false); setProfileEditError(null); }} aria-hidden="true" />
          <div className={`relative w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl p-5 sm:p-6 ${isDark ? 'bg-black border border-white/10' : 'bg-white'}`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Edit Profile</h3>
              <button type="button" onClick={() => { setEditProfileOpen(false); setProfileEditError(null); }} className={`p-2 rounded-lg shrink-0 ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`} aria-label="Close">
                <Svg.Close stroke={stroke} />
              </button>
            </div>
            {profileEditError && <p className="text-sm text-red-500 mb-3">{profileEditError}</p>}
            <div className="space-y-3">
              <label className={`block text-sm font-medium ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Full Name</label>
              <input
                type="text"
                value={profileEditFullName}
                onChange={(e) => setProfileEditFullName(e.target.value)}
                className={`w-full px-4 py-2.5 rounded-xl border text-base ${isDark ? 'bg-black border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                placeholder="Full name"
              />
              <label className={`block text-sm font-medium ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Email</label>
              <input
                type="email"
                value={profileEditEmail}
                onChange={(e) => setProfileEditEmail(e.target.value)}
                className={`w-full px-4 py-2.5 rounded-xl border text-base ${isDark ? 'bg-black border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                placeholder="Email"
              />
              <label className={`block text-sm font-medium ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Phone Number</label>
              <input
                type="tel"
                value={profileEditPhone}
                onChange={(e) => setProfileEditPhone(e.target.value)}
                className={`w-full px-4 py-2.5 rounded-xl border text-base ${isDark ? 'bg-black border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                placeholder="Phone number"
              />
            </div>
            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={() => { setEditProfileOpen(false); setProfileEditError(null); }}
                className={`flex-1 py-2.5 rounded-xl font-medium ${isDark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-slate-200 text-slate-800 hover:bg-slate-300'}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setProfileEditError(null);
                  const fullName = profileEditFullName.trim();
                  const email = profileEditEmail.trim();
                  if (!email) {
                    setProfileEditError('Email is required');
                    return;
                  }
                  try {
                    const updated = await api.updateProfile({ fullName: fullName || undefined, email, phone: profileEditPhone.trim() || undefined });
                    setUser((prev) => (prev ? { ...prev, ...updated } : updated));
                    setEditProfileOpen(false);
                  } catch (err) {
                    setProfileEditError(err.message || 'Failed to update profile');
                  }
                }}
                className="flex-1 py-2.5 rounded-xl font-medium bg-blue-600 hover:bg-blue-700 text-white"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Password modal - new password must be different from current */}
      {changePasswordOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setChangePasswordOpen(false); setPasswordError(null); }} aria-hidden="true" />
          <div className={`relative w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl p-5 sm:p-6 ${isDark ? 'bg-black border border-white/10' : 'bg-white'}`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Change Password</h3>
              <button type="button" onClick={() => { setChangePasswordOpen(false); setPasswordError(null); }} className={`p-2 rounded-lg shrink-0 ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`} aria-label="Close">
                <Svg.Close stroke={stroke} />
              </button>
            </div>
            {passwordError && <p className="text-sm text-red-500 mb-3">{passwordError}</p>}
            <p className={`text-sm mb-3 ${isDark ? 'text-white/60' : 'text-slate-500'}`}>Enter your current password and choose a new one. The new password must be different from your current password.</p>
            <div className="space-y-3">
              <label className={`block text-sm font-medium ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Current password</label>
              <input
                type="password"
                value={passwordCurrent}
                onChange={(e) => setPasswordCurrent(e.target.value)}
                className={`w-full px-4 py-2.5 rounded-xl border text-base ${isDark ? 'bg-black border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                placeholder="Current password"
              />
              <label className={`block text-sm font-medium ${isDark ? 'text-white/80' : 'text-slate-700'}`}>New password</label>
              <input
                type="password"
                value={passwordNew}
                onChange={(e) => setPasswordNew(e.target.value)}
                className={`w-full px-4 py-2.5 rounded-xl border text-base ${isDark ? 'bg-black border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                placeholder="New password (min 6 characters)"
              />
              <label className={`block text-sm font-medium ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Confirm new password</label>
              <input
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                className={`w-full px-4 py-2.5 rounded-xl border text-base ${isDark ? 'bg-black border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                placeholder="Confirm new password"
              />
            </div>
            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={() => { setChangePasswordOpen(false); setPasswordError(null); }}
                className={`flex-1 py-2.5 rounded-xl font-medium ${isDark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-slate-200 text-slate-800 hover:bg-slate-300'}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setPasswordError(null);
                  if (!passwordCurrent.trim()) {
                    setPasswordError('Enter your current password');
                    return;
                  }
                  if (!passwordNew.trim()) {
                    setPasswordError('Enter a new password');
                    return;
                  }
                  if (passwordNew.length < 6) {
                    setPasswordError('New password must be at least 6 characters');
                    return;
                  }
                  if (passwordNew !== passwordConfirm) {
                    setPasswordError('New password and confirm do not match');
                    return;
                  }
                  try {
                    await api.changePassword({ currentPassword: passwordCurrent, newPassword: passwordNew });
                    setChangePasswordOpen(false);
                    setPasswordCurrent('');
                    setPasswordNew('');
                    setPasswordConfirm('');
                  } catch (err) {
                    setPasswordError(err.message || 'Failed to change password');
                  }
                }}
                className="flex-1 py-2.5 rounded-xl font-medium bg-blue-600 hover:bg-blue-700 text-white"
              >
                Change Password
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}

const EyeIcon = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const EyeOffIcon = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

function AdminPinPage({ isDark, onVerified, appSettings }) {
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputClass = `w-full px-4 py-3 rounded-xl border text-base placeholder:opacity-60 ${isDark ? 'bg-black border-white/10 text-white placeholder:text-white/50' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`;
  const logoUrl = appSettings?.sidebarLogoUrl || 'https://files.catbox.moe/l3islw.jpg';

  const handleSubmit = async () => {
    setError('');
    if (!pin.trim()) {
      setError('Please enter your PIN.');
      return;
    }
    setLoading(true);
    try {
      const data = await api.verifyAdminPin(pin);
      api.setAdminToken(data.token);
      onVerified(data.token);
    } catch (err) {
      setError(err?.message || 'Invalid PIN. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-full w-full p-6">
      <img
        src={logoUrl}
        alt="DataPlus"
        className={`w-20 h-20 rounded-full object-cover border mb-6 ${isDark ? 'border-white/10' : 'border-slate-200'}`}
      />
      <h1 className={`text-2xl font-bold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>𝒟𝒶𝓉𝒶𝒫𝓁𝓊𝓈</h1>
      <p className={`text-sm mb-8 ${isDark ? 'text-white/60' : 'text-slate-500'}`}>
        Admin — enter your PIN to continue
      </p>
      <div className="w-full max-w-sm space-y-4">
        <div className="relative">
          <input
            type={showPin ? 'text' : 'password'}
            inputMode="numeric"
            autoComplete="off"
            placeholder="PIN"
            value={pin}
            onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 8)); setError(''); }}
            maxLength={8}
            className={`${inputClass} pr-11 text-center tracking-[0.4em] placeholder:tracking-normal`}
            disabled={loading}
          />
          <button
            type="button"
            onClick={() => setShowPin((p) => !p)}
            aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
            className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg transition-colors ${isDark ? 'text-white/60 hover:text-white' : 'text-slate-400 hover:text-slate-600'}`}
          >
            {showPin ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
        {error && (
          <p className="text-sm text-red-500 text-center" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          className={`w-full py-3 rounded-xl font-semibold transition-colors disabled:opacity-60 ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/90'}`}
        >
          {loading ? 'Checking…' : 'Continue'}
        </button>
      </div>
      <footer className="mt-8 w-full max-w-lg px-1 sm:px-0" role="contentinfo">
        <UltraxasAdBanner isDark={isDark} />
      </footer>
    </div>
  );
}

function SignInPage({ isDark, onSignIn, appSettings }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'register'
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const inputClass = `w-full px-4 py-3 rounded-xl border text-base placeholder:opacity-60 ${isDark ? 'bg-black border-white/10 text-white placeholder:text-white/50' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`;
  const linkClass = `text-sm font-medium transition-colors ${isDark ? 'text-white/80 hover:text-white' : 'text-slate-700 hover:text-slate-900'}`;
  const isRegister = mode === 'register';
  const networkLogo = (network) => (
    network === 'telecel'
      ? 'https://files.catbox.moe/yzcokj.jpg'
      : (network === 'bigtime' || network === 'ishare')
        ? 'https://files.catbox.moe/riugtj.png'
        : 'https://files.catbox.moe/r1m0uh.png'
  );
  const profileOrbitBubbles = [
    { id: 'mtn', network: 'mtn', x: '-24%', y: '-6%', delay: '0s', duration: '6.2s' },
    { id: 'telecel', network: 'telecel', x: '68%', y: '-8%', delay: '0.7s', duration: '6.8s' },
    { id: 'bigtime', network: 'bigtime', x: '-26%', y: '56%', delay: '1.1s', duration: '7.3s' },
    { id: 'ishare', network: 'ishare', x: '66%', y: '58%', delay: '1.8s', duration: '7.0s' },
  ];

  const clearError = () => {
    setError('');
    setSuccess('');
  };

  const handleSubmit = async () => {
    setError('');
    setSuccess('');
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (isRegister) {
      const trimmedName = fullName.trim();
      if (!trimmedName) {
        setError('Please enter your full name.');
        return;
      }
      const trimmedPhone = phone.trim();
      if (!trimmedPhone) {
        setError('Please enter your phone number.');
        return;
      }
      if (String(trimmedPhone).replace(/\D/g, '').length < 8) {
        setError('Please enter a valid phone number (at least 8 digits).');
        return;
      }
      if (!trimmedEmail) {
        setError('Please enter your email.');
        return;
      }
      if (!trimmedPassword) {
        setError('Please enter a password.');
        return;
      }
      if (trimmedPassword.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
      if (trimmedPassword !== confirmPassword.trim()) {
        setError('Passwords do not match. Please try again.');
        return;
      }
      setLoading(true);
      try {
        await api.register({
          email: trimmedEmail,
          password: trimmedPassword,
          fullName: trimmedName,
          phone: trimmedPhone,
        });
        setSuccess('Account created. Please sign in.');
        setMode('signin');
        setPassword('');
        setConfirmPassword('');
      } catch (err) {
        setError(err.message || 'Registration failed.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!trimmedEmail) {
      setError('Please enter your email or phone.');
      return;
    }
    if (!trimmedPassword) {
      setError('Please enter your password.');
      return;
    }
    setLoading(true);
    try {
      const result = await api.login({ email: trimmedEmail, password: trimmedPassword });
      onSignIn(result);
    } catch (err) {
      const msg = err.message || 'Invalid email or password. Please try again or register.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex-1 flex flex-col items-center justify-center min-h-full w-full p-6 overflow-hidden">
      <div className="relative mb-6 w-24 h-24 flex items-center justify-center">
        <div className="pointer-events-none absolute -inset-6 sm:-inset-12 block" aria-hidden>
          {profileOrbitBubbles.map((bubble) => (
            <img
              key={bubble.id}
              src={networkLogo(bubble.network)}
              alt={`${bubble.network} logo`}
              className="absolute w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover shadow-[0_8px_20px_-8px_rgba(0,0,0,0.45)]"
              style={{
                left: bubble.x,
                top: bubble.y,
                animation: `datapod-float ${bubble.duration} ease-in-out infinite`,
                animationDelay: bubble.delay,
              }}
            />
          ))}
        </div>
        <img
          src={appSettings?.sidebarLogoUrl || 'https://files.catbox.moe/l3islw.jpg'}
          alt="DataPlus"
          className={`w-20 h-20 rounded-full object-cover border ${isDark ? 'border-white/10' : 'border-slate-200'}`}
        />
      </div>
      <h1 className={`text-2xl font-bold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>𝒟𝒶𝓉𝒶𝒫𝓁𝓊𝓈</h1>
      <p className={`text-sm mb-8 ${isDark ? 'text-white/60' : 'text-slate-500'}`}>
        {isRegister ? 'Create an account' : 'Sign in to your account'}
      </p>
      <div className="w-full max-w-sm space-y-4">
        {isRegister && (
          <input
            type="text"
            placeholder="Full name"
            value={fullName}
            onChange={(e) => { setFullName(e.target.value); clearError(); }}
            className={inputClass}
          />
        )}
        {isRegister && (
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="Phone number"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); clearError(); }}
            className={inputClass}
          />
        )}
        <input
          type="email"
          placeholder={isRegister ? 'Email' : 'Email or phone'}
          value={email}
          onChange={(e) => { setEmail(e.target.value); clearError(); }}
          className={inputClass}
        />
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              clearError();
            }}
            className={`${inputClass} pr-11`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((p) => !p)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg transition-colors ${isDark ? 'text-white/60 hover:text-white' : 'text-slate-400 hover:text-slate-600'}`}
          >
            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
        {isRegister && (
          <div className="relative">
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); clearError(); }}
              className={`${inputClass} pr-11`}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((p) => !p)}
              aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg transition-colors ${isDark ? 'text-white/60 hover:text-white' : 'text-slate-400 hover:text-slate-600'}`}
            >
              {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        )}
        {success && (
          <p className="text-sm text-green-600 dark:text-green-400 text-center" role="status">
            {success}
          </p>
        )}
        {error && (
          <p className="text-sm text-red-500 text-center" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          className={`w-full py-3 rounded-xl font-semibold transition-colors disabled:opacity-60 ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/90'}`}
        >
          {loading ? (isRegister ? 'Registering…' : 'Signing in…') : (isRegister ? 'Register' : 'Sign In')}
        </button>
        {isRegister && (
          <p className={`text-center text-sm pt-4 mt-2 border-t ${isDark ? 'border-white/10 text-white/60' : 'border-slate-200 text-slate-500'}`}>
            Already have an account?{' '}
            <button type="button" onClick={() => { setMode('signin'); setError(''); }} className={linkClass}>
              Login
            </button>
          </p>
        )}
        {!isRegister && (
          <p className={`text-center text-sm pt-2 ${isDark ? 'text-white/60' : 'text-slate-500'}`}>
            Don&apos;t have an account?{' '}
            <button type="button" onClick={() => { setMode('register'); setError(''); }} className={linkClass}>
              Register
            </button>
          </p>
        )}
      </div>
      <footer className="mt-6 w-full max-w-lg px-1 sm:px-0" role="contentinfo">
        <UltraxasAdBanner isDark={isDark} />
      </footer>
    </div>
  );
}
