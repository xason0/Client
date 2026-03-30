/**
 * Shared broadcast text sanitization (client preview + Node API).
 * Keep server and UI in sync — only formatting tags, no scripts or handlers.
 */

const MAX_TITLE_LEN = 160;
const MAX_RICH_HTML_LEN = 8000;

const ALLOWED_BLOCK = new Set(['a', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'p', 'div', 'span', 'br']);

function escapeHtmlAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function escapeHtmlTextContent(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Visible label for auto-detected / inline caption links (not raw URL). */
export function broadcastLinkButtonLabel(href) {
  if (!href) return 'Open link';
  try {
    const u = new URL(href);
    const host = u.hostname.replace(/^www\./i, '');
    if (host) return `Open ${host}`;
  } catch {
    /* ignore */
  }
  return 'Open link';
}

/** http(s) only; prepend https:// when missing — matches client CTA rules. */
export function sanitizeBroadcastLinkHref(raw) {
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

/** Plain heading line — no HTML. */
export function sanitizeBroadcastTitle(raw) {
  return String(raw ?? '')
    .replace(/[\u0000-\u001F\u007F<>]/g, '')
    .trim()
    .slice(0, MAX_TITLE_LEN);
}

function sanitizeSpanStyle(styleStr) {
  const out = [];
  const parts = String(styleStr || '').split(';');
  const allowedFamilies = new Set([
    'serif',
    'sans-serif',
    'monospace',
    'georgia',
    'times new roman',
    'arial',
    'verdana',
    'system-ui',
    'tahoma',
    'trebuchet ms',
    'courier new',
    'ui-monospace',
    'ui-sans-serif',
  ]);
  for (const part of parts) {
    const idx = part.indexOf(':');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim().toLowerCase();
    let v = part.slice(idx + 1).trim();
    if (!k || !v) continue;
    v = v.replace(/!important/gi, '').trim();
    const vl = v.toLowerCase();
    if (k === 'font-weight' && (vl === 'bold' || vl === '700' || vl === '600' || vl === 'bolder')) {
      out.push('font-weight:700');
    } else if (k === 'font-style' && vl === 'italic') {
      out.push('font-style:italic');
    } else if (k === 'text-decoration' && (vl === 'underline' || vl.includes('underline'))) {
      out.push('text-decoration:underline');
    } else if (k === 'font-family') {
      const families = v
        .split(',')
        .map((x) => x.replace(/["']/g, '').trim())
        .filter(Boolean);
      const ok = families.filter((f) => allowedFamilies.has(f.toLowerCase()));
      if (ok.length) {
        out.push(
          `font-family:${ok.map((f) => (/\s/.test(f) ? `"${f}"` : f)).join(', ')}`
        );
      }
    }
  }
  return out.join(';').slice(0, 400);
}

function normalizeTagChunk(html) {
  let s = html;
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, '');
  s = s.replace(/<\s*\/\s*script\s*>/gi, '');
  s = s.replace(/<\s*script\b[\s\S]*?$/gi, '');
  s = s.replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  s = s.replace(/javascript:/gi, '');
  s = s.replace(/data:/gi, '');

  let prev;
  let guard = 0;
  do {
    prev = s;
    s = s.replace(/<\s*([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (full, tagName, attrs) => {
      const tag = String(tagName).toLowerCase();
      if (tag === 'br') return '<br />';
      if (!ALLOWED_BLOCK.has(tag)) return '';
      if (['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'p', 'div'].includes(tag)) {
        return `<${tag}>`;
      }
      if (tag === 'a') {
        const m =
          attrs.match(/\shref\s*=\s*"([^"]*)"/i) ||
          attrs.match(/\shref\s*=\s*'([^']*)'/i) ||
          attrs.match(/\shref\s*=\s*([^\s>]+)/i);
        let raw = m ? String(m[1]).trim() : '';
        raw = raw.replace(/^['"]|['"]$/g, '');
        const href = sanitizeBroadcastLinkHref(raw);
        if (!href) return '';
        return `<a href="${escapeHtmlAttr(href)}" target="_blank" rel="noopener noreferrer" class="broadcast-caption-link-btn">`;
      }
      if (tag === 'span') {
        const m = attrs.match(/\sstyle\s*=\s*"([^"]*)"/i) || attrs.match(/\sstyle\s*=\s*'([^']*)'/i);
        const st = m ? sanitizeSpanStyle(m[1]) : '';
        return st ? `<span style="${st}">` : '<span>';
      }
      return '';
    });
    s = s.replace(/<\s*\/\s*([a-zA-Z][a-zA-Z0-9]*)\s*>/g, (full, tagName) => {
      const tag = String(tagName).toLowerCase();
      if (tag === 'br') return '';
      return ALLOWED_BLOCK.has(tag) && tag !== 'br' ? `</${tag}>` : '';
    });
    guard += 1;
  } while (s !== prev && guard < 24);

  return s.trim();
}

/** Safe subset of HTML for broadcast body (bold, italic, underline, fonts). */
export function sanitizeBroadcastRichHtml(raw) {
  let s = String(raw ?? '');
  if (s.length > MAX_RICH_HTML_LEN) s = s.slice(0, MAX_RICH_HTML_LEN);
  s = normalizeTagChunk(s);
  if (/<\s*script|<\s*iframe|javascript:\s*|data:\s*text\/html/i.test(s)) {
    return normalizeTagChunk(s.replace(/<\s*script[\s\S]*/gi, ''));
  }
  return s;
}

const URL_IN_TEXT_RE = /\b(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;

function linkifyPlainUrlsInBroadcastHtml(html) {
  if (!html) return '';
  return html.split(/(<[^>]*>)/g).map((chunk) => {
    if (!chunk || chunk.startsWith('<')) return chunk;
    return chunk.replace(URL_IN_TEXT_RE, (full) => {
      let m = full;
      let trailing = '';
      const tm = m.match(/([.,;:!?)]+)$/);
      if (tm) {
        trailing = tm[1];
        m = m.slice(0, -tm[1].length);
      }
      const href = sanitizeBroadcastLinkHref(m);
      if (!href) return full;
      const label = broadcastLinkButtonLabel(href);
      return `<a href="${escapeHtmlAttr(href)}" target="_blank" rel="noopener noreferrer" class="broadcast-caption-link-btn">${escapeHtmlTextContent(label)}</a>${trailing}`;
    });
  }).join('');
}

/** Replace empty or URL-as-text inside caption buttons with a proper label. */
function relabelCaptionLinkButtonText(html) {
  if (!html) return '';
  return html.replace(/<a\s+([^>]+)>\s*([\s\S]*?)\s*<\/a>/gi, (full, attrs, inner) => {
    if (!/\bclass="broadcast-caption-link-btn"/i.test(attrs)) return full;
    const hrefM = attrs.match(/\bhref="([^"]*)"/i);
    if (!hrefM) return full;
    const href = sanitizeBroadcastLinkHref(hrefM[1]);
    if (!href) return full;
    if (inner.includes('<')) return full;
    const plain = inner.replace(/&nbsp;/gi, ' ').trim();
    if (plain === '' || /^https?:\/\//i.test(plain) || /^www\./i.test(plain)) {
      return `<a ${attrs}>${escapeHtmlTextContent(broadcastLinkButtonLabel(href))}</a>`;
    }
    return full;
  });
}

/** Sanitize then turn bare http(s)/www URLs in text into violet link buttons (popup / preview). */
export function formatBroadcastCaptionForDisplay(raw) {
  const safe = sanitizeBroadcastRichHtml(raw);
  if (!safe) return '';
  return relabelCaptionLinkButtonText(linkifyPlainUrlsInBroadcastHtml(safe));
}

/** For list previews: strip tags, collapse whitespace. */
export function broadcastPlainTextPreview(htmlOrText) {
  const s = String(htmlOrText ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s.slice(0, 200);
}

const PACK_MAX_JSON = MAX_RICH_HTML_LEN + 600;

function utf8ToBase64(str) {
  const s = String(str ?? '');
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(s, 'utf8').toString('base64');
  }
  if (typeof btoa === 'function') {
    return btoa(unescape(encodeURIComponent(s)));
  }
  return '';
}

function base64ToUtf8(b64) {
  const s = String(b64 ?? '');
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(s, 'base64').toString('utf8');
  }
  if (typeof atob === 'function') {
    return decodeURIComponent(escape(atob(s)));
  }
  return '';
}

/**
 * Wire format for POST body.caption: embeds headline so legacy APIs that only persist `caption`
 * still round-trip the title. Body HTML is base64 (dpv:2) so servers that HTML-sanitize the
 * whole caption string do not destroy JSON with `<` in body.
 */
export function packBroadcastCaption(title, bodyHtml) {
  const t = sanitizeBroadcastTitle(title);
  const body = String(bodyHtml ?? '');
  if (!t) {
    return body.length > MAX_RICH_HTML_LEN ? body.slice(0, MAX_RICH_HTML_LEN) : body;
  }
  const b64 = utf8ToBase64(body);
  const packed = JSON.stringify({ dpv: 2, title: t, b64 });
  return packed.length > PACK_MAX_JSON ? packed.slice(0, PACK_MAX_JSON) : packed;
}

/**
 * Parse stored caption + optional top-level row title (newer servers) into display fields.
 */
export function splitBroadcastCaption(rawCaption, rowTitle) {
  const rowT = sanitizeBroadcastTitle(rowTitle);
  const s = String(rawCaption ?? '').trim();
  if (s.startsWith('{')) {
    try {
      const o = JSON.parse(s);
      if (o && Number(o.dpv) === 2 && typeof o.b64 === 'string') {
        let html = '';
        try {
          html = base64ToUtf8(o.b64);
        } catch {
          html = '';
        }
        return {
          title: rowT || sanitizeBroadcastTitle(o.title),
          captionHtml: sanitizeBroadcastRichHtml(html),
        };
      }
      if (o && Number(o.dpv) === 1 && typeof o.title === 'string') {
        return {
          title: rowT || sanitizeBroadcastTitle(o.title),
          captionHtml: sanitizeBroadcastRichHtml(String(o.body ?? '')),
        };
      }
    } catch {
      /* fall through */
    }
  }
  return {
    title: rowT,
    captionHtml: sanitizeBroadcastRichHtml(s),
  };
}

/** Server: normalize caption field before save (packed JSON or loose HTML). */
export function normalizeBroadcastCaptionForStorage(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (s.startsWith('{')) {
    try {
      const o = JSON.parse(s);
      if (o && Number(o.dpv) === 2 && typeof o.b64 === 'string') {
        let html = '';
        try {
          html = base64ToUtf8(o.b64);
        } catch {
          html = '';
        }
        const safe = sanitizeBroadcastRichHtml(html);
        return JSON.stringify({
          dpv: 2,
          title: sanitizeBroadcastTitle(o.title),
          b64: utf8ToBase64(safe),
        });
      }
      if (o && Number(o.dpv) === 1) {
        return JSON.stringify({
          dpv: 1,
          title: sanitizeBroadcastTitle(o.title),
          body: sanitizeBroadcastRichHtml(String(o.body ?? '')),
        });
      }
    } catch {
      /* fall through */
    }
  }
  return sanitizeBroadcastRichHtml(s);
}

export function extractPackedTitleFromCaption(stored) {
  const s = String(stored ?? '').trim();
  if (!s.startsWith('{')) return '';
  try {
    const o = JSON.parse(s);
    if (o && (Number(o.dpv) === 2 || Number(o.dpv) === 1)) {
      return sanitizeBroadcastTitle(o.title);
    }
  } catch {
    /* ignore */
  }
  return '';
}
