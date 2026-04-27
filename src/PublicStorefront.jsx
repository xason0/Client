import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from './api.js';

const SITE_PAD = 'px-3 sm:px-4 md:px-6 lg:px-8';

/** Same fields as the signed-in AFA page (`/afa-registration`) modal. */
const AFA_FORM_INITIAL = { full_name: '', phone: '', ghana_card_number: '', occupation: '', date_of_birth: '' };
const AFA_FIELD_ROWS = [
  ['full_name', 'Full name', 'e.g. Kwame Mensah', 'text'],
  ['phone', 'Phone number', 'e.g. 0244 123 456', 'tel'],
  ['ghana_card_number', 'Ghana card number', 'GHA-XXXXXXXXX-X', 'text'],
  ['occupation', 'Occupation', 'What you do for work or study', 'text'],
  ['date_of_birth', 'Date of birth', '', 'date'],
];
const PUBLIC_KEY = 'dataplus_store_public_v1';
const HERO_CTA_LABEL = 'Buy data now';
/** Must match the signed-in “buy” modal (`App.jsx`). */
const RECIPIENT_PHONE_LEN = 10;
function publicStoreNetworkLabel(netId) {
  return { mtn: 'MTN', telecel: 'Telecel', bigtime: 'AT BigTime', ishare: 'AT iShare' }[netId] || 'Data';
}
function publicStoreNetworkBgImage(netId) {
  if (netId === 'telecel') return "url('https://files.catbox.moe/yzcokj.jpg')";
  if (netId === 'bigtime' || netId === 'ishare') return "url('https://files.catbox.moe/riugtj.png')";
  return "url('https://files.catbox.moe/r1m0uh.png')";
}

export function readPublicStoreSnapshot(wantSlug) {
  if (typeof window === 'undefined' || !wantSlug) return null;
  try {
    const raw = localStorage.getItem(PUBLIC_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p && typeof p === 'object' && p.slug && String(p.slug) === String(wantSlug)) return p;
  } catch {
    // ignore
  }
  return null;
}

/** Public tabs: id, display name; bundle cards use `PublicStoreNetLivePill` (green, animated). */
const NETS = [
  { id: 'mtn', name: 'MTN', tabLabel: 'MTN', sub: 'MTN Master Bundle', subDays: '90 days' },
  { id: 'telecel', name: 'Telecel', tabLabel: 'TELECEL', sub: null, subDays: null },
  { id: 'bigtime', name: 'Big Time', tabLabel: 'BIG TIME', sub: null, subDays: null },
  { id: 'ishare', name: 'Ishare', tabLabel: 'ISHARE', sub: null, subDays: null },
];

/** How many bars (1–4) are “in range” at each step — like a phone’s cellular meter stepping up/down, not a music equalizer. */
const SIGNAL_LEVEL_SEQUENCE = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 3, 2, 2, 1, 1, 0];
/** Bar heights in px, low→high: classic phone status-bar shape; kept larger so it’s readable. */
const SIGNAL_BAR_HEIGHTS = [5, 8, 12, 16];
const SIGNAL_TICK_MS = 400;

/** 4G / 5G next to the signal — not the carrier name. */
function networkGenLabel(netId) {
  if (netId === 'mtn' || netId === 'ishare') return '5G';
  return '4G';
}

export function PublicStoreNetLivePill({ genLabel, isDark, variant = 'default' }) {
  const onHero = variant === 'onHero';
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setStep((s) => (s + 1) % SIGNAL_LEVEL_SEQUENCE.length),
      SIGNAL_TICK_MS
    );
    return () => clearInterval(t);
  }, []);
  const level = SIGNAL_LEVEL_SEQUENCE[step] ?? 0;
  const on = onHero
    ? { hi: 'bg-emerald-200', lo: 'bg-white/30' }
    : isDark
      ? { hi: 'bg-emerald-400', lo: 'bg-emerald-500/32' }
      : { hi: 'bg-emerald-600', lo: 'bg-emerald-400/50' };
  const loOpacity = onHero ? 'opacity-50' : isDark ? 'opacity-50' : 'opacity-40';
  return (
    <span className="inline-flex items-end justify-center gap-1.5 min-w-0 max-w-full">
      <span className="sr-only normal-case">
        {genLabel} · signal {level} of 4 bars.{' '}
      </span>
      <span
        className="inline-flex shrink-0 items-end justify-center gap-1 sm:gap-1.5 h-4 w-[1.4rem] sm:w-[1.5rem] sm:h-5"
        aria-hidden
      >
        {SIGNAL_BAR_HEIGHTS.map((hPx, i) => {
          const active = i < level;
          return (
            <span
              key={`sig-${i}`}
              className={`w-0.5 sm:w-1 min-w-0.5 sm:min-w-1 self-end rounded-sm transition-all duration-200 ease-out ${
                active ? on.hi : on.lo
              } ${active ? 'opacity-100' : loOpacity} ${onHero && active ? 'drop-shadow-sm' : ''}`}
              style={{ height: `${hPx}px` }}
            />
          );
        })}
      </span>
      <span
        className={`leading-none text-[10px] sm:text-xs font-extrabold tabular-nums tracking-tight ${
          onHero
            ? 'text-emerald-100 [text-shadow:0_1px_8px_rgba(0,0,0,0.4)] sm:text-sm'
            : isDark
              ? 'text-emerald-300'
              : 'text-emerald-700'
        }`}
      >
        {genLabel}
      </span>
    </span>
  );
}

function bundleKey(net, size) {
  return `${net}|${size}`;
}

function isBundleActiveInStore(activeMap, k) {
  if (!activeMap || typeof activeMap !== 'object') return true;
  const v = activeMap[k];
  if (v === false) return false;
  if (v === 0 || v === '0') return false;
  if (v === 'false' || v === 'FALSE') return false;
  return true;
}

function displayPriceGhs({ base, customStr, activeMap, net, size }) {
  const k = bundleKey(net, size);
  if (!isBundleActiveInStore(activeMap, k)) return { hidden: true, price: null, label: null };
  const c = customStr && String(customStr).trim() !== '' ? Number.parseFloat(String(customStr), 10) : NaN;
  const p = Number.isFinite(c) && c >= 0 ? c : Number(base);
  if (!Number.isFinite(p)) return { hidden: true, price: null, label: null };
  return { hidden: false, price: p, label: `GHS ${p.toFixed(2)}` };
}

/** Default matches app chrome (`violet-600` CTAs) when seller has not set a custom accent. */
const DEFAULT_STORE_ACCENT = '#7c3aed';

function parseHex6(s) {
  const t = String(s || '')
    .trim()
    .replace(/^#/, '');
  if (!/^[0-9A-Fa-f]{6}$/.test(t)) return null;
  return [parseInt(t.slice(0, 2), 16), parseInt(t.slice(2, 4), 16), parseInt(t.slice(4, 6), 16)];
}
function mixHex6(to, from, t) {
  const A = parseHex6(to);
  const B = parseHex6(from);
  if (!A || !B) return to;
  const m = (i) => Math.round(B[i] + (A[i] - B[i]) * t);
  return `#${[m(0), m(1), m(2)]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('')}`;
}
/** Drives hero sheet so the gradient follows the same accent as the rest of the app / store settings. */
function heroGradientStops(accent) {
  const a =
    typeof accent === 'string' && /^#[0-9A-Fa-f]{6}$/i.test(accent) ? accent : DEFAULT_STORE_ACCENT;
  return `linear-gradient(180deg, ${a} 0%, ${mixHex6('#0a1628', a, 0.55)} 45%, #0a1628 100%)`;
}

function publicStoreAccent(display) {
  if (!display || typeof display.accentColor !== 'string') return DEFAULT_STORE_ACCENT;
  const s = display.accentColor.trim();
  return /^#[0-9A-Fa-f]{6}$/.test(s) ? s : DEFAULT_STORE_ACCENT;
}

/** Must match `networkBrandLogoUrl` in App.jsx (store pricing). */
function networkBrandLogoUrl(netId) {
  if (netId === 'telecel') return 'https://files.catbox.moe/yzcokj.jpg';
  if (netId === 'bigtime' || netId === 'ishare') return 'https://files.catbox.moe/riugtj.png';
  return 'https://files.catbox.moe/r1m0uh.png';
}

const storeIconSvg = (
  <svg width="28" height="28" className="text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" />
    <path d="M9 22V12h6v10" />
  </svg>
);

function IconSearch({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
function IconChevronRight({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
function IconClose({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function publicOrderStatusUi(status) {
  const s = String(status || 'processing').toLowerCase();
  if (s === 'completed' || s === 'complete' || s === 'done') {
    return { label: 'Done', sub: 'Your order is complete.', key: 'done' };
  }
  if (s === 'failed' || s === 'fail' || s === 'cancelled' || s === 'canceled') {
    return { label: "Couldn't go through", sub: 'The seller or support may have left a note. Contact the store if you need help.', key: 'bad' };
  }
  return { label: 'In progress', sub: 'The team is still working on this. Check again later for updates.', key: 'wait' };
}
function useVisibleNetworkIds(bundles, customP, customA) {
  return useCallback(
    (netId) => {
      const list = bundles && Array.isArray(bundles[netId]) ? bundles[netId] : [];
      return list.some((b) => {
        if (
          displayPriceGhs({
            base: b.price,
            customStr: customP[bundleKey(netId, b.size)],
            activeMap: customA,
            net: netId,
            size: b.size,
          }).hidden
        ) {
          return false;
        }
        return true;
      });
    },
    [bundles, customP, customA]
  );
}

const WHATSAPP_BRAND_SVG_D =
  'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z';

/**
 * `display.whatsapp` may be raw digits, +233…, or a full `https://wa.me/…` URL.
 * `display.whatsappGroup` may be a group invite. Returns a single href or null.
 */
export function resolvePublicStoreWhatsappHref(display) {
  if (!display || typeof display !== 'object') return null;
  const tryWhatsappishUrl = (s) => {
    const t = String(s || '').trim();
    if (!t || !/^https?:\/\//i.test(t)) return null;
    if (/wa\.me|api\.whatsapp\.com|web\.whatsapp\.com|chat\.whatsapp\.com/i.test(t)) return t;
    try {
      const h = new URL(t).hostname.replace(/^www\./, '');
      if (h === 'wa.me' || h.endsWith('.whatsapp.com') || h.endsWith('.whatsapp.net')) return t;
    } catch {
      // ignore
    }
    return null;
  };
  const fromWa = String(display.whatsapp || '').trim();
  if (fromWa) {
    const u = tryWhatsappishUrl(fromWa);
    if (u) return u;
    const digits = fromWa.replace(/\D/g, '');
    // Any saved digits = show the FAB (same as earlier waDigits / wa.me/…)
    if (digits.length > 0) return `https://wa.me/${digits}`;
  }
  return tryWhatsappishUrl(display.whatsappGroup);
}

/**
 * Renders via `createPortal(…, document.body)` so it is never clipped by the scroll area.
 * `PublicStorefront` mounts it after the main content so the FAB stays in the “store page” tree.
 */
export function PublicStoreWhatsappFloat({ href }) {
  if (!href) return null;
  if (typeof document === 'undefined') return null;
  return createPortal(
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed z-[200] w-14 h-14 rounded-full bg-[#25D366] text-white flex items-center justify-center shadow-xl shadow-black/20 active:scale-95 focus:outline-none focus:ring-2 focus:ring-violet-500/50 pointer-events-auto"
      style={{
        bottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))',
        right: 'max(1rem, env(safe-area-inset-right, 0px))',
        left: 'auto',
        top: 'auto',
      }}
      title="WhatsApp"
      aria-label="Chat on WhatsApp"
    >
      <svg width="30" height="30" viewBox="0 0 24 24" className="text-white" fill="currentColor" aria-hidden>
        <path fillRule="evenodd" clipRule="evenodd" d={WHATSAPP_BRAND_SVG_D} />
      </svg>
    </a>,
    document.body
  );
}

/**
 * Public /store/:slug — mobile-first layout: blue hero, white sheet, network tabs, 2-col bundle cards, WhatsApp FAB.
 */
export default function PublicStorefront({ isDark, slug, data, onOpenSignIn, onBrowseOther }) {
  const goBrowse = typeof onBrowseOther === 'function' ? onBrowseOther : onOpenSignIn;
  const bundlesRef = useRef(null);
  const [activeNetId, setActiveNetId] = useState('mtn');
  const [selectedBundle, setSelectedBundle] = useState(null);
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [purchaseRecipient, setPurchaseRecipient] = useState('');
  const [purchaseRecipientError, setPurchaseRecipientError] = useState(null);
  /** Shown in-modal after a successful *local* pre-check (Paystack return uses `storePaystackBanner`). */
  const [paystackReadyInfo, setPaystackReadyInfo] = useState(null);
  const [paystackInitLoading, setPaystackInitLoading] = useState(false);
  /** Shown when returning from Paystack with ?reference= on `/store/...` */
  const [storePaystackBanner, setStorePaystackBanner] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !slug) return;
    const path = window.location.pathname || '';
    if (!path.startsWith('/store/')) return;
    const params = new URLSearchParams(window.location.search);
    const ref = (params.get('reference') || params.get('trxref') || '').trim();
    if (!ref) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await api.verifyPublicStorePaystack(ref);
        if (cancelled) return;
        if (r?.kind === 'afa') {
          setStorePaystackBanner({
            type: 'success',
            text: r?.already
              ? 'We already have that payment on record. Your AFA details are with the team.'
              : 'Thanks! Your AFA application went through. The seller will follow up as usual.',
          });
        } else {
          setStorePaystackBanner({
            type: 'success',
            text: r?.already
              ? 'We already have that payment on record. Your bundle order is in place.'
              : 'Thanks! Your payment went through. The data bundle is queued for the number you shared.',
          });
        }
        setAfaForm(AFA_FORM_INITIAL);
        setPaystackReadyInfo(null);
      } catch (e) {
        if (!cancelled) {
          setStorePaystackBanner({
            type: 'error',
            text:
              e?.message ||
              'We couldn’t confirm that payment. If money left your account, contact the seller and keep your payment text or bank alert handy.',
          });
        }
      } finally {
        if (!cancelled && typeof window !== 'undefined') {
          const p = window.location.pathname || '/';
          window.history.replaceState({}, '', p + (window.location.hash || ''));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const ownerLabel = useMemo(() => {
    const n = data?.display?.storeName && String(data.display.storeName).trim();
    return n || 'Store';
  }, [data]);

  const heroTitle = useMemo(() => {
    const t = data?.display?.heroTitle && String(data.display.heroTitle).trim();
    if (t) return t;
    return 'Data packages';
  }, [data]);

  const heroTagline = useMemo(() => {
    const t = data?.display?.heroTagline && String(data.display.heroTagline).trim();
    if (t) return t;
    const d = data?.display?.storeDescription && String(data.display.storeDescription).trim();
    if (d) {
      const line = d.split('\n').map((x) => x.trim()).find(Boolean);
      if (line) return line;
    }
    return 'Affordable, reliable and faster delivery';
  }, [data]);

  const accent = useMemo(() => publicStoreAccent(data?.display), [data]);
  const isStoreClosed = data?.availability === false;
  const logo = data?.display?.logoDataUrl;
  const afa = data?.service;
  const showAfa = afa?.afaEnabled && afa && data;
  const showAfaBlock = showAfa && !isStoreClosed;
  const afaPrice = Number.parseFloat(String(afa?.afaPrice || ''), 10);
  const afaShow = showAfa && Number.isFinite(afaPrice) ? afaPrice : 15;
  const bundles = data?.bundles || null;
  const customP = data?.customBundlePrices || {};
  const customA = data?.customBundleActive || {};
  const hasAnyOffer = useVisibleNetworkIds(bundles, customP, customA);

  const visibleNets = useMemo(
    () => NETS.filter((n) => hasAnyOffer(n.id)),
    [hasAnyOffer]
  );

  useEffect(() => {
    if (visibleNets.length === 0) return;
    if (visibleNets.some((n) => n.id === activeNetId)) return;
    setActiveNetId(visibleNets[0].id);
  }, [visibleNets, activeNetId]);

  const activeNet = useMemo(
    () => NETS.find((n) => n.id === activeNetId) || visibleNets[0] || NETS[0],
    [activeNetId, visibleNets]
  );

  const [afaModalOpen, setAfaModalOpen] = useState(false);
  const [afaForm, setAfaForm] = useState(AFA_FORM_INITIAL);
  const [afaError, setAfaError] = useState(null);
  const [afaSuccess, setAfaSuccess] = useState(null);
  /** Public AFA: Paystack redirect, no wallet / no account. */
  const [afaPaystackLoading, setAfaPaystackLoading] = useState(false);

  const [trackModalOpen, setTrackModalOpen] = useState(false);
  const [trackPhone, setTrackPhone] = useState('');
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackError, setTrackError] = useState(null);
  const [trackOrders, setTrackOrders] = useState(null);

  const closeAfaModal = useCallback(() => {
    setAfaModalOpen(false);
    setAfaPaystackLoading(false);
  }, []);
  const closePurchaseModal = useCallback(() => {
    setPurchaseModalOpen(false);
    setPaystackInitLoading(false);
    setPaystackReadyInfo(null);
    setPurchaseRecipientError(null);
  }, []);
  useEffect(() => {
    const onPageShow = (e) => {
      if (e.persisted) {
        setPaystackInitLoading(false);
        setAfaPaystackLoading(false);
      }
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  const runTrackOrderLookup = useCallback(async () => {
    setTrackError(null);
    const d = String(trackPhone || '').replace(/\D/g, '');
    if (d.length < 8) {
      setTrackError('Please type the number you used for the person receiving the bundle (at least 8 digits).');
      return;
    }
    if (!slug) {
      setTrackError("This page isn't linked to a store. Open your link again.");
      return;
    }
    setTrackLoading(true);
    setTrackOrders(null);
    try {
      const r = await api.trackPublicStoreOrders({ storeSlug: slug, phone: d });
      setTrackOrders(r?.orders && Array.isArray(r.orders) ? r.orders : []);
    } catch (e) {
      setTrackError(e?.message || 'Could not look that up. Try again.');
    } finally {
      setTrackLoading(false);
    }
  }, [trackPhone, slug]);

  useEffect(() => {
    if (!afaModalOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') closeAfaModal();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [afaModalOpen, closeAfaModal]);

  useEffect(() => {
    if (!trackModalOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && !trackLoading) setTrackModalOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [trackModalOpen, trackLoading]);

  const afaRegisterFee = afaShow;

  const continueAfaToPaystack = useCallback(async () => {
    setAfaError(null);
    const f = afaForm;
    if (!f.full_name?.trim() || !f.phone?.trim() || !f.ghana_card_number?.trim() || !f.occupation?.trim() || !f.date_of_birth?.trim()) {
      setAfaError('Please fill in all fields.');
      return;
    }
    if (String(f.phone).replace(/\D/g, '').length < 8) {
      setAfaError('Please enter a full phone number so we can reach you.');
      return;
    }
    if (!slug) {
      setAfaError('Store is not available.');
      return;
    }
    setAfaPaystackLoading(true);
    try {
      const r = await api.initPublicStoreAfaPaystack({
        storeSlug: slug,
        full_name: f.full_name,
        phone: f.phone,
        ghana_card_number: f.ghana_card_number,
        occupation: f.occupation,
        date_of_birth: f.date_of_birth,
      });
      const url = r?.authorization_url;
      if (!url) throw new Error('We could not open the payment page. Please try again in a moment.');
      window.location.assign(url);
    } catch (err) {
      setAfaError(err?.message || 'Something went wrong. Please try again.');
      setAfaPaystackLoading(false);
    }
  }, [afaForm, slug]);

  useEffect(() => {
    if (!purchaseModalOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') closePurchaseModal();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [purchaseModalOpen, closePurchaseModal]);

  const continueToPaystack = useCallback(async () => {
    setPurchaseRecipientError(null);
    setPaystackReadyInfo(null);
    setStorePaystackBanner(null);
    const d = String(purchaseRecipient || '').replace(/\D/g, '');
    if (d.length !== RECIPIENT_PHONE_LEN) {
      setPurchaseRecipientError(
        'That number looks too short. Please use a full Ghana mobile number (starting with 0). We only keep the numbers you type.'
      );
      return;
    }
    if (!selectedBundle?.networkId || !selectedBundle.size || !slug) {
      setPurchaseRecipientError('Choose a package again, then try paying.');
      return;
    }
    setPaystackInitLoading(true);
    try {
      const r = await api.initPublicStoreBundlePaystack({
        storeSlug: slug,
        network: selectedBundle.networkId,
        bundleSize: selectedBundle.size,
        recipientPhone: d,
      });
      const url = r?.authorization_url;
      if (!url) throw new Error('We could not open the payment page. Please try again in a moment.');
      window.location.assign(url);
    } catch (err) {
      setPaystackInitLoading(false);
      setPurchaseRecipientError(err?.message || 'Something went wrong. Please try again.');
    }
  }, [purchaseRecipient, selectedBundle, slug]);

  if (!data) {
    return (
      <div
        className={`min-h-full flex flex-col items-center justify-center py-10 w-full min-w-0 max-w-full ${SITE_PAD} ${isDark ? 'bg-zinc-950 text-white' : 'bg-slate-50 text-slate-900'}`}
      >
        {storePaystackBanner ? (
          <p
            className={`text-center text-sm w-full max-w-md mb-4 px-3 py-2 rounded-xl ${
              storePaystackBanner.type === 'error'
                ? isDark
                  ? 'bg-red-500/20 text-red-200'
                  : 'bg-red-50 text-red-800'
                : isDark
                  ? 'bg-emerald-500/20 text-emerald-200'
                  : 'bg-emerald-50 text-emerald-900'
            }`}
            role="status"
          >
            {storePaystackBanner.text}
          </p>
        ) : null}
        <p className="text-center text-sm w-full max-w-full sm:max-w-2xl">
          This store is not set up in this browser yet. Ask the seller to save their store, or open this link in the
          same browser they used to publish.
        </p>
        {typeof onOpenSignIn === 'function' ? (
          <button
            type="button"
            onClick={onOpenSignIn}
            className="mt-6 rounded-full bg-violet-600 text-white px-6 py-2.5 text-sm font-semibold active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-violet-500/60"
          >
            Sign in
          </button>
        ) : null}
        <p className="mt-4 text-xs opacity-60">/store/{slug}</p>
      </div>
    );
  }

  const pageBg = isDark ? 'bg-zinc-950' : 'bg-slate-50';
  /** Near-black in dark mode so the bundle sheet feels clearly darker than the old slate-900 panel. */
  const sheet = isDark ? 'bg-black text-slate-100' : 'bg-white text-slate-900';
  const subText = isDark ? 'text-slate-500' : 'text-slate-500';

  const openHeroGradient = { background: heroGradientStops(accent) };
  const logoRing = {
    background: `linear-gradient(160deg, ${accent} 0%, rgb(15, 23, 42) 100%)`,
    boxShadow: `0 10px 28px ${accent}55`,
  };

  const packSectionTitle = 'Data packages';

  const buyScroll = () => {
    try {
      bundlesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      /* ignore */
    }
  };

  return (
    <div className={`w-full min-h-full flex flex-col font-display ${pageBg}`}>
      {storePaystackBanner ? (
        <div
          className={`w-full shrink-0 z-20 ${SITE_PAD} pt-3 ${
            storePaystackBanner.type === 'error'
              ? isDark
                ? 'bg-red-950/90 text-red-200 border-b border-red-500/30'
                : 'bg-red-50 text-red-900 border-b border-red-200/90'
              : isDark
                ? 'bg-emerald-950/50 text-emerald-200 border-b border-emerald-500/20'
                : 'bg-emerald-50 text-emerald-900 border-b border-emerald-200/90'
          }`}
          role="status"
        >
          <p className="text-sm max-w-3xl mx-auto text-center py-1">{storePaystackBanner.text}</p>
        </div>
      ) : null}
      {isStoreClosed ? (
        <div className="flex-1 w-full min-w-0">
          <section
            className="w-full pt-8 pb-20 sm:pt-10 min-h-[40vh] flex flex-col items-center rounded-b-[2.5rem] overflow-hidden"
            style={openHeroGradient}
          >
            <div className={`w-full max-w-md mx-auto ${SITE_PAD} flex flex-col items-center`}>
              <div className="mt-2 inline-flex items-center gap-3 bg-white/95 shadow-lg rounded-full pl-2 pr-5 py-2 border border-white/40">
                <div
                  className="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center overflow-hidden shrink-0"
                  style={logoRing}
                >
                  {logo ? <img src={logo} alt="" className="w-full h-full object-cover" /> : <span className="flex items-center justify-center [&>svg]:w-7 [&>svg]:h-7">{storeIconSvg}</span>}
                </div>
                <span className="text-lg sm:text-xl font-bold text-slate-800 text-left line-clamp-2">{ownerLabel}</span>
              </div>
            </div>
          </section>
          <div className="relative -mt-10 z-10 w-full max-w-lg mx-auto">
            <div
              className={`${SITE_PAD} ${sheet} rounded-[2.5rem] shadow-xl p-4 sm:p-5 text-center ${
                isDark ? 'border border-white/10' : 'border border-slate-200/90'
              }`}
            >
              <p
                className="inline-block text-sm font-medium text-white px-3.5 py-1 rounded-full mb-4"
                style={{ background: `${accent}dd` }}
              >
                Store is closed
              </p>
              <p className={subText}>The seller has paused this store. Check back later.</p>
              {goBrowse ? (
                <button
                  type="button"
                  onClick={goBrowse}
                  className="mt-4 w-full rounded-2xl border-2 border-slate-200 py-3 font-semibold active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-violet-500/60"
                >
                  Browse other options
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <>
          <header
            className="w-full pt-6 pb-12 sm:pb-16 flex flex-col items-center rounded-b-[2.5rem] overflow-hidden"
            style={openHeroGradient}
          >
            <div className={`w-full max-w-lg mx-auto ${SITE_PAD} flex flex-col items-center gap-5`}>
              <div className="mt-1 inline-flex items-center w-full max-w-sm min-w-0 justify-center sm:justify-start bg-white shadow-xl rounded-full pl-2.5 pr-5 sm:pr-7 py-2.5 sm:py-3 border border-white/60 gap-3">
                <div
                  className="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center overflow-hidden shrink-0"
                  style={logoRing}
                >
                  {logo ? (
                    <img src={logo} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="flex items-center justify-center [&>svg]:w-6 [&>svg]:h-6">
                      {storeIconSvg}
                    </span>
                  )}
                </div>
                <span className="text-left text-lg sm:text-xl font-bold text-slate-800 min-w-0 line-clamp-2 leading-tight tracking-wide">{ownerLabel}</span>
              </div>

              <div className="w-full max-w-md">
                <div
                  className="mx-auto w-full max-w-full rounded-2xl sm:rounded-3xl border-2 border-dotted border-white/55 px-4 py-3.5 sm:px-5 sm:py-4 text-center bg-transparent"
                >
                  <h1
                    className="flex min-w-0 flex-col items-center justify-center gap-2.5 text-center sm:flex-row sm:gap-4"
                    aria-label={heroTitle}
                  >
                    <span
                      className="min-w-0 text-2xl font-bold leading-tight tracking-[0.14em] text-white/95 [text-shadow:0_2px_24px_rgba(0,0,0,0.25)] sm:text-4xl sm:leading-tight sm:tracking-[0.1em] uppercase"
                      aria-hidden="true"
                    >
                      {Array.from(heroTitle).map((ch, i) =>
                        ch === ' ' ? (
                          <span key={`hero-sp-${i}`} className="inline-block w-2 sm:w-2.5" />
                        ) : (
                          <span
                            key={i}
                            className="public-store-hero-title-char"
                            style={{ animationDelay: `${(i * 0.045).toFixed(3)}s` }}
                          >
                            {ch}
                          </span>
                        )
                      )}
                    </span>
                    <span className="inline-flex shrink-0 self-center" aria-hidden="true">
                      <PublicStoreNetLivePill
                        genLabel={networkGenLabel(activeNet.id)}
                        isDark={isDark}
                        variant="onHero"
                      />
                    </span>
                  </h1>
                </div>
              </div>
              <p className="text-xs sm:text-sm text-white/90 text-center max-w-sm px-2 font-medium leading-relaxed tracking-[0.12em] sm:tracking-[0.1em]">
                {heroTagline}
              </p>

              <div className="w-full max-w-sm space-y-3">
                <div className="public-store-cta-outer">
                  <div className="public-store-cta-ambient" aria-hidden />
                  <button
                    type="button"
                    onClick={buyScroll}
                    aria-label={HERO_CTA_LABEL}
                    className="public-store-cta group relative w-full flex min-h-[3.25rem] items-center justify-center gap-3 py-3.5 px-6 sm:px-7 rounded-full border border-white/50 bg-gradient-to-b from-white from-15% via-white to-slate-100/95 text-violet-950 text-sm sm:text-base font-semibold tracking-[0.18em] uppercase transition-all duration-200 ease-out hover:brightness-[1.03] active:scale-[0.99] active:translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-violet-950/40"
                    style={{
                      boxShadow: `inset 0 1px 0 0 rgba(255,255,255,0.72), 0 1px 0 0 rgba(15,23,42,0.06), 0 10px 36px -2px ${accent}38, 0 6px 20px rgba(0,0,0,0.2)`,
                    }}
                  >
                    <span
                      className="public-store-cta-bolt flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-600/8 ring-1 ring-violet-500/20 shadow-inner"
                      style={{ color: accent, boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.4)' }}
                      aria-hidden
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="opacity-95" aria-hidden>
                        <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" />
                      </svg>
                    </span>
                    <span className="pr-0.5" aria-hidden>
                      {Array.from(HERO_CTA_LABEL).map((ch, i) =>
                        ch === ' ' ? (
                          <span key={`sp-${i}`} className="inline-block w-1.5 sm:w-2" />
                        ) : (
                          <span
                            key={i}
                            className="public-store-cta-char"
                            style={{ animationDelay: `${(i * 0.05).toFixed(2)}s` }}
                          >
                            {ch}
                          </span>
                        )
                      )}
                    </span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setTrackModalOpen(true);
                    setTrackError(null);
                    setTrackOrders(null);
                    setTrackPhone('');
                  }}
                  className="w-full text-center text-sm text-white/95 font-medium flex items-center justify-center gap-2 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-violet-500/50 rounded-lg py-1.5"
                >
                  <IconSearch className="h-4 w-4 opacity-95" aria-hidden />
                  Track your order
                  <IconChevronRight className="h-4 w-4 text-white/85" aria-hidden />
                </button>
              </div>
            </div>
          </header>

          <main
            id="store-bundles"
            ref={bundlesRef}
            className={`flex-1 w-full min-w-0 max-w-2xl mx-auto -mt-10 z-10 relative ${SITE_PAD} pb-32`}
          >
            <div
              className={`${sheet} rounded-[2.5rem] p-4 sm:p-5 space-y-5 ${
                isDark
                  ? 'border border-white/10 ring-1 ring-inset ring-white/[0.04] shadow-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)]'
                  : 'border border-slate-200/90 shadow-2xl ring-1 ring-slate-200/30'
              }`}
            >
              {visibleNets.length === 0 ? (
                <p className={`text-center text-sm ${subText}`}>No data packages on sale yet. Check back soon.</p>
              ) : (
                <>
                  <div
                    className="flex flex-nowrap items-center gap-2 overflow-x-auto -mx-1 px-1 pb-1"
                    style={{ WebkitOverflowScrolling: 'touch' }}
                    role="tablist"
                    aria-label="Networks"
                  >
                    {visibleNets.map((net) => {
                      const sel = net.id === activeNetId;
                      return (
                        <button
                          key={net.id}
                          type="button"
                          role="tab"
                          aria-selected={sel}
                          onClick={() => setActiveNetId(net.id)}
                          className={`shrink-0 min-h-[2.5rem] px-4 sm:px-5 rounded-full text-xs sm:text-sm font-bold transition active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-violet-500/50 ${
                            sel
                              ? isDark
                                ? 'text-white shadow-md'
                                : 'text-white shadow-md'
                              : isDark
                                ? 'bg-zinc-900/95 text-slate-300'
                                : 'bg-slate-200 text-slate-600'
                          }`}
                          style={
                            sel ? { background: accent, boxShadow: `0 4px 12px ${accent}40` } : undefined
                          }
                        >
                          {net.tabLabel}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-2 py-0.5">
                    <h2 className={`text-sm font-bold tracking-tight ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                      {packSectionTitle}
                    </h2>
                  </div>

                  {activeNet
                    ? (() => {
                        const list = bundles && Array.isArray(bundles[activeNet.id]) ? bundles[activeNet.id] : [];
                        const offers = list.filter(
                          (b) =>
                            !displayPriceGhs({
                              base: b.price,
                              customStr: customP[bundleKey(activeNet.id, b.size)],
                              activeMap: customA,
                              net: activeNet.id,
                              size: b.size,
                            }).hidden
                        );
                        if (offers.length === 0) {
                          return (
                            <p className={`text-center text-sm ${subText}`}>
                              No packages from this network right now.
                            </p>
                          );
                        }
                        return (
                          <ul className="grid grid-cols-2 gap-3" role="list">
                            {offers.map((b) => {
                              const d = displayPriceGhs({
                                base: b.price,
                                customStr: customP[bundleKey(activeNet.id, b.size)],
                                activeMap: customA,
                                net: activeNet.id,
                                size: b.size,
                              });
                              if (d.hidden) return null;
                              return (
                                <li key={b.size}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedBundle({
                                        network: activeNet.name,
                                        networkId: activeNet.id,
                                        size: b.size,
                                        price: d.price,
                                        label: d.label,
                                      });
                                      setPurchaseRecipient('');
                                      setPurchaseRecipientError(null);
                                      setPaystackReadyInfo(null);
                                      setPaystackInitLoading(false);
                                      setPurchaseModalOpen(true);
                                    }}
                                    className={`w-full text-left p-2.5 sm:p-3 flex flex-col items-stretch min-h-0 border-0 rounded-none bg-transparent transition active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:ring-inset ${
                                      isDark ? 'active:bg-zinc-900/70' : 'active:bg-slate-100/80'
                                    }`}
                                    style={
                                      selectedBundle &&
                                      selectedBundle.networkId === activeNet.id &&
                                      String(selectedBundle.size) === String(b.size)
                                        ? { boxShadow: `inset 0 0 0 2px ${accent}aa` }
                                        : undefined
                                    }
                                  >
                                    <div className="flex justify-center mb-2">
                                      <PublicStoreNetLivePill genLabel={networkGenLabel(activeNet.id)} isDark={isDark} />
                                    </div>
                                    <div
                                      className={`mx-auto w-16 h-16 sm:w-[4.5rem] sm:h-[4.5rem] rounded-full overflow-hidden mb-2 ${
                                        isDark ? 'ring-1 ring-zinc-800' : 'ring-1 ring-slate-200/90 bg-slate-50'
                                      }`}
                                    >
                                      <img
                                        src={networkBrandLogoUrl(activeNet.id)}
                                        alt=""
                                        className="h-full w-full object-cover"
                                        width={72}
                                        height={72}
                                        loading="lazy"
                                        decoding="async"
                                      />
                                    </div>
                                    <p className={`text-center text-base sm:text-lg mt-0.5 line-clamp-2 font-bold ${subText}`}>
                                      {b.size}
                                    </p>
                                    <p
                                      className={`text-center text-lg sm:text-xl font-extrabold tabular-nums mt-auto pt-1 ${
                                        isDark ? 'text-violet-300' : ''
                                      }`}
                                      style={!isDark ? { color: accent } : undefined}
                                    >
                                      {d.label}
                                    </p>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        );
                      })()
                    : null}
                </>
              )}

              {showAfaBlock ? (
                <div className="pt-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className={`text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                      More services
                    </h3>
                  </div>
                  <div
                    className={`relative overflow-hidden rounded-2xl p-4 ${
                      isDark
                        ? 'bg-black border border-white/10 ring-1 ring-inset ring-white/[0.04] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]'
                        : 'bg-black border border-zinc-800/90 ring-1 ring-inset ring-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold text-slate-100">AFA registration</p>
                      <p
                        className={`text-base font-bold ${
                          isDark ? 'text-amber-200' : 'text-amber-300'
                        }`}
                      >
                        GHS {afaShow.toFixed(2)}
                      </p>
                    </div>
                    <p className="text-xs mt-1 text-slate-400">
                      {afa?.afaDescription || 'MTN AFA service.'}
                    </p>
                    {afaSuccess ? (
                      <p className="mt-3 text-sm font-medium text-emerald-400">{afaSuccess}</p>
                    ) : null}
                    {afaError && !afaModalOpen ? (
                      <p className="mt-2 text-xs text-amber-300/90">{afaError}</p>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        setAfaError(null);
                        setAfaSuccess(null);
                        setAfaPaystackLoading(false);
                        setAfaModalOpen(true);
                      }}
                      className="mt-3 w-full rounded-xl py-2.5 text-sm font-semibold text-white active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-violet-500/55 focus:ring-offset-2 focus:ring-offset-black transition hover:brightness-110"
                      style={{ background: accent, boxShadow: `0 4px 16px ${accent}45` }}
                    >
                      Register
                    </button>
                  </div>
                </div>
              ) : null}

              {selectedBundle && (
                <p className={`text-center text-xs ${subText} border-t pt-3`}>
                  You’ve picked {selectedBundle.network} — {selectedBundle.size} ({selectedBundle.label}). Tap the same
                  pack again to open payment and finish your purchase.
                </p>
              )}

              <div className="pt-2 text-center space-y-1">
                <p className={`text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{ownerLabel}</p>
                <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                  © {new Date().getFullYear()} {ownerLabel}. All rights reserved.
                </p>
              </div>
            </div>
          </main>

          <PublicStoreWhatsappFloat href={resolvePublicStoreWhatsappHref(data?.display)} />
        </>
      )}
      {showAfaBlock
        ? createPortal(
            afaModalOpen ? (
              <div className="fixed inset-0 z-[210] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="public-afa-title">
                <div
                  className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                  onClick={closeAfaModal}
                  aria-hidden
                />
                <div
                  className={`relative w-full sm:max-w-lg max-h-[min(100dvh,100vh)] sm:max-h-[90vh] sm:rounded-2xl border overflow-hidden flex flex-col ${
                    isDark
                      ? 'sm:border-white/10 bg-zinc-950'
                      : 'sm:border-slate-200 sm:shadow-2xl bg-white'
                  }`}
                >
                  <div className={`shrink-0 flex items-center justify-between gap-3 border-b ${isDark ? 'border-white/10 bg-black px-4 py-3' : 'border-slate-200 bg-slate-50 px-4 py-3'}`}>
                    <h2 id="public-afa-title" className={`text-base font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      AFA registration
                    </h2>
                    <button
                      type="button"
                      onClick={closeAfaModal}
                      className={`shrink-0 -mr-1 p-1.5 rounded-lg transition-colors ${
                        isDark
                          ? 'text-white/80 hover:text-white hover:bg-white/10'
                          : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/80'
                      }`}
                      aria-label="Close"
                    >
                      <IconClose className="h-5 w-5" />
                    </button>
                  </div>
                  <div className={`min-h-0 flex-1 overflow-y-auto ${isDark ? 'bg-zinc-950' : 'bg-white'} p-4 sm:p-5 space-y-4`}>
                    <div
                      className={`rounded-xl p-3 border ${
                        isDark ? 'border-white/10 bg-black/50' : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                          Registration fee
                        </span>
                        <span className="text-lg font-bold tabular-nums text-amber-300">GHS {afaRegisterFee.toFixed(2)}</span>
                      </div>
                      <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        Pay here with card or mobile money. You don’t need a store login or a wallet on this page.
                      </p>
                    </div>
                    <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                      {afa?.afaDescription ||
                        'Complete the form, then you’ll go to a secure page to pay the registration fee in one step.'}
                    </p>
                    {afaError && (
                      <p className={`text-sm ${isDark ? 'text-red-300' : 'text-red-600'}`} role="alert">
                        {afaError}
                      </p>
                    )}
                    <div className="space-y-3.5">
                      {AFA_FIELD_ROWS.map(([key, label, placeholder, type]) => (
                        <div key={key}>
                          <label
                            className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}
                            htmlFor={`public-afa-${key}`}
                          >
                            {label}
                          </label>
                          <input
                            id={`public-afa-${key}`}
                            type={type}
                            name={key}
                            value={afaForm[key]}
                            onChange={(e) => {
                              setAfaForm((p) => ({ ...p, [key]: e.target.value }));
                              setAfaError(null);
                            }}
                            placeholder={placeholder}
                            disabled={afaPaystackLoading}
                            className={`w-full px-3 py-2.5 rounded-xl border text-base ${
                              isDark
                                ? 'bg-black/50 border-white/10 text-white placeholder:text-slate-500'
                                : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'
                            } disabled:opacity-60`}
                            autoComplete={key === 'phone' ? 'tel' : 'off'}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div
                    className={`shrink-0 flex flex-col sm:flex-row gap-2.5 p-4 border-t ${
                      isDark ? 'border-white/10 bg-black' : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={closeAfaModal}
                      className={`flex-1 min-h-[44px] py-2.5 rounded-xl text-sm font-semibold ${
                        isDark ? 'bg-white/10 text-white' : 'bg-slate-200 text-slate-800'
                      } hover:brightness-95 active:scale-[0.99]`}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={afaPaystackLoading}
                      onClick={continueAfaToPaystack}
                      className="flex-1 min-h-[44px] py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition hover:brightness-105"
                      style={{ background: accent, boxShadow: `0 4px 12px ${accent}44` }}
                    >
                      {afaPaystackLoading ? 'Opening the payment page…' : 'Continue to payment'}
                    </button>
                  </div>
                </div>
              </div>
            ) : null,
            document.body
          )
        : null}
      {createPortal(
        purchaseModalOpen && selectedBundle && selectedBundle.networkId ? (
          <div className="fixed inset-0 z-[215] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="public-buy-title">
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={closePurchaseModal}
              aria-hidden
            />
            <div
              className={`relative w-full max-w-md rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto ${
                isDark ? 'bg-black' : 'bg-slate-50'
              }`}
            >
              <h2 id="public-buy-title" className="sr-only">
                Buy {selectedBundle.size} for {publicStoreNetworkLabel(selectedBundle.networkId)}
              </h2>
              <div
                className="rounded-xl sm:rounded-2xl mx-3 mt-3 sm:mx-4 sm:mt-4 p-5 sm:p-6 text-white relative overflow-hidden bg-cover bg-center"
                style={{ backgroundImage: publicStoreNetworkBgImage(selectedBundle.networkId) }}
              >
                <div className="absolute inset-0 bg-black/50 rounded-xl sm:rounded-2xl" aria-hidden />
                <div className="relative z-10 flex justify-between items-start mb-4">
                  <div>
                    <p className="text-sm font-medium opacity-90">{publicStoreNetworkLabel(selectedBundle.networkId)}</p>
                    <h3 className="text-xl sm:text-2xl font-bold">{selectedBundle.size}</h3>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium opacity-90">Price</p>
                    <p className="text-lg sm:text-xl font-bold">{selectedBundle.label}</p>
                  </div>
                </div>
                <p className="relative z-10 w-full text-center text-xs text-white/80 mb-2">
                  Type the number that should receive the bundle, then continue to pay safely online. One package at a
                  time.
                </p>
                <div className="relative z-10 w-full py-3 sm:py-3.5 rounded-xl text-center bg-white/20 text-white px-2">
                  <p className="text-lg sm:text-xl font-bold tabular-nums">{selectedBundle.label}</p>
                  <p className="text-xs sm:text-sm font-medium text-white/80 mt-1">Next, add their number just below</p>
                </div>
              </div>
              <div className={`mx-3 mb-3 sm:mx-4 sm:mb-4 mt-3 rounded-xl sm:rounded-2xl p-5 sm:p-6 border ${isDark ? 'bg-black border-white/10' : 'bg-white border-slate-200'}`}>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-white' : 'text-slate-700'}`} htmlFor="public-buy-recipient">
                  Their phone number
                </label>
                <input
                  id="public-buy-recipient"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  value={purchaseRecipient}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, RECIPIENT_PHONE_LEN);
                    setPurchaseRecipient(digits);
                    setPurchaseRecipientError(null);
                    setPaystackReadyInfo(null);
                  }}
                  placeholder="e.g. 05XX XXX XXXX"
                  maxLength={RECIPIENT_PHONE_LEN}
                  className={`w-full px-4 py-3 rounded-xl border text-base placeholder:opacity-60 ${
                    purchaseRecipientError
                      ? 'border-red-500 focus:border-red-500'
                      : isDark
                        ? 'border-white/10'
                        : 'border-slate-200'
                  } ${
                    isDark ? 'bg-black text-white placeholder:text-white/50' : 'bg-white text-slate-900 placeholder:text-slate-400'
                  }`}
                />
                <p className={`text-xs mt-1.5 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>
                  Use a normal Ghana mobile number (the one they use for calls and MoMo). Type it with a leading 0 — no
                  +233 or country code.
                </p>
                {purchaseRecipientError && <p className="text-sm text-red-500 mt-1.5">{purchaseRecipientError}</p>}
                {paystackReadyInfo && (
                  <p className={`text-sm mt-3 ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`} role="status">
                    {paystackReadyInfo}
                  </p>
                )}
                <div className="flex flex-col-reverse sm:flex-row gap-3 mt-5 sm:justify-end">
                  <button
                    type="button"
                    onClick={closePurchaseModal}
                    className={`w-full sm:w-auto px-5 py-2.5 rounded-xl font-medium text-base transition-colors ${
                      isDark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-slate-200 text-slate-800 hover:bg-slate-300'
                    } active:scale-[0.99]`}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={continueToPaystack}
                    disabled={paystackInitLoading}
                    className={`w-full sm:w-auto px-5 py-2.5 rounded-xl font-medium text-base transition-colors text-white ${
                      isDark ? 'bg-violet-600 hover:bg-violet-500' : 'bg-violet-600 hover:bg-violet-500'
                    } disabled:opacity-60 disabled:pointer-events-none`}
                    style={{ boxShadow: `0 4px 16px ${accent}44` }}
                  >
                    {paystackInitLoading ? 'Opening the payment page…' : 'Continue to payment'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null,
        document.body
      )}
      {createPortal(
        trackModalOpen && slug ? (
          <div
            className="fixed inset-0 z-[220] flex items-end sm:items-center justify-center p-0 sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="public-track-title"
          >
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => {
                if (!trackLoading) setTrackModalOpen(false);
              }}
              aria-hidden
            />
            <div
              className={`relative w-full sm:max-w-md max-h-[min(100dvh,100vh)] sm:max-h-[90vh] sm:rounded-2xl border overflow-hidden flex flex-col ${
                isDark ? 'sm:border-white/10 bg-zinc-950' : 'sm:border-slate-200 sm:shadow-2xl bg-white'
              }`}
            >
              <div
                className={`shrink-0 flex items-center justify-between gap-3 border-b ${
                  isDark ? 'border-white/10 bg-black px-4 py-3' : 'border-slate-200 bg-slate-50 px-4 py-3'
                }`}
              >
                <h2
                  id="public-track-title"
                  className={`text-base font-bold pr-2 ${isDark ? 'text-white' : 'text-slate-900'}`}
                >
                  Track your order
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    if (!trackLoading) setTrackModalOpen(false);
                  }}
                  className={`shrink-0 -mr-1 p-1.5 rounded-lg transition-colors ${
                    isDark
                      ? 'text-white/80 hover:text-white hover:bg-white/10'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/80'
                  } ${trackLoading ? 'opacity-50 pointer-events-none' : ''}`}
                  aria-label="Close"
                >
                  <IconClose className="h-5 w-5" />
                </button>
              </div>
              <div
                className={`min-h-0 flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 ${isDark ? 'bg-zinc-950' : 'bg-white'}`}
              >
                <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  Enter the <strong>same phone number the bundle is going to</strong> — the one you typed at checkout, not
                  the payment number unless they’re the same.
                </p>
                <label
                  className={`block text-sm font-medium mb-1.5 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}
                  htmlFor="public-track-phone"
                >
                  Recipient phone
                </label>
                <input
                  id="public-track-phone"
                  type="tel"
                  inputMode="numeric"
                  value={trackPhone}
                  onChange={(e) => {
                    setTrackPhone(e.target.value.replace(/\D/g, '').slice(0, 15));
                    setTrackError(null);
                  }}
                  disabled={trackLoading}
                  placeholder="e.g. 05XX XXX XXXX"
                  className={`w-full px-4 py-3 rounded-xl border text-base ${
                    isDark
                      ? 'bg-black/50 border-white/10 text-white placeholder:text-slate-500'
                      : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'
                  } disabled:opacity-60`}
                  autoComplete="tel-national"
                />
                {trackError ? (
                  <p className="text-sm text-red-500" role="alert">
                    {trackError}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={runTrackOrderLookup}
                  disabled={trackLoading}
                  className="w-full min-h-[44px] rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: accent, boxShadow: `0 4px 12px ${accent}44` }}
                >
                  {trackLoading ? 'Looking that up…' : 'Show status'}
                </button>
                {Array.isArray(trackOrders) && trackOrders.length > 0 ? (
                  <ul className="space-y-3 pt-1" role="list">
                    {trackOrders.map((o) => {
                      const sui = publicOrderStatusUi(o.status);
                      const chipClass =
                        sui.key === 'done'
                          ? isDark
                            ? 'bg-emerald-500/20 text-emerald-200'
                            : 'bg-emerald-100 text-emerald-900'
                          : sui.key === 'bad'
                            ? isDark
                              ? 'bg-red-500/20 text-red-200'
                              : 'bg-red-100 text-red-800'
                            : isDark
                              ? 'bg-amber-500/20 text-amber-100'
                              : 'bg-amber-100 text-amber-900';
                      const when = (() => {
                        const t = o?.created_at ? Date.parse(String(o.created_at)) : NaN;
                        if (Number.isNaN(t)) return '—';
                        return new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
                      })();
                      return (
                        <li
                          key={o.id}
                          className={`rounded-2xl border p-3.5 ${
                            isDark ? 'border-white/10 bg-black/40' : 'border-slate-200 bg-slate-50/90'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                {o.bundleLabel || o.orderRef}
                              </p>
                              <p
                                className={`text-xs font-mono tabular-nums mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}
                              >
                                {o.orderRef}
                              </p>
                            </div>
                            <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-lg ${chipClass}`}>
                              {sui.label}
                            </span>
                          </div>
                          <p className={`text-xs mt-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{sui.sub}</p>
                          <p className={`text-xs mt-1.5 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                            Placed: {when}
                            {o.priceGhs != null && Number.isFinite(Number(o.priceGhs)) ? (
                              <> · GHS {Number(o.priceGhs).toFixed(2)}</>
                            ) : null}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
                {Array.isArray(trackOrders) && trackOrders.length === 0 && !trackLoading ? (
                  <p
                    className={`text-sm text-center ${isDark ? 'text-slate-400' : 'text-slate-600'}`}
                    role="status"
                  >
                    We don’t see a recent order for this number on {ownerLabel}’s store. Check the digits, or the bundle
                    may not have been sent through this page yet.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null,
        document.body
      )}
    </div>
  );
}
