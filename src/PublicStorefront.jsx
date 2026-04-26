import React, { useMemo, useState } from 'react';

/** Same horizontal padding as `App.jsx` main so /store/ width matches the signed-in app. */
const SITE_PAD = 'px-3 sm:px-4 md:px-6 lg:px-8';
const PUBLIC_KEY = 'dataplus_store_public_v1';

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

const NETS = [
  { id: 'mtn', name: 'MTN', badgeClass: 'bg-amber-400 text-amber-900 font-bold', sub: 'MTN Master Bundle', subDays: '90 days' },
  { id: 'telecel', name: 'Telecel', badgeClass: 'bg-red-500 text-white font-bold', sub: null, subDays: null },
  { id: 'bigtime', name: 'Big Time', badgeClass: 'bg-sky-600 text-white font-bold', sub: null, subDays: null },
  { id: 'ishare', name: 'Ishare', badgeClass: 'bg-violet-600 text-white font-bold', sub: null, subDays: null },
];

function bundleKey(net, size) {
  return `${net}|${size}`;
}

/** Inactive = hidden from the public store (not shown, no price). API/local may use false, 0, or string "false". */
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

const DEFAULT_STORE_ACCENT = '#0ea5e9';
const THEME_IDS = new Set(['default', 'gradient', 'glass', 'neon', 'minimal', 'bold']);

function publicStoreAccent(display) {
  if (!display || typeof display.accentColor !== 'string') return DEFAULT_STORE_ACCENT;
  const s = display.accentColor.trim();
  return /^#[0-9A-Fa-f]{6}$/.test(s) ? s : DEFAULT_STORE_ACCENT;
}

function publicStoreCardTheme(display) {
  const t = display && typeof display.theme === 'string' ? display.theme : 'default';
  return THEME_IDS.has(t) ? t : 'default';
}

/** Styling for each package row — driven by the seller’s accent and layout choice. */
function packageTileStyle(themeId, accent, isDark) {
  const a = accent;
  if (themeId === 'gradient') {
    return {
      background: isDark ? `linear-gradient(145deg, ${a}20, #09090b 85%)` : `linear-gradient(145deg, ${a}1f, #ffffff 90%)`,
      borderWidth: 2,
      borderStyle: 'solid',
      borderColor: `${a}6b`,
    };
  }
  if (themeId === 'glass') {
    return {
      background: isDark ? 'rgba(38, 38, 45, 0.55)' : 'rgba(255, 255, 255, 0.72)',
      backdropFilter: 'blur(10px)',
      borderWidth: 2,
      borderStyle: 'solid',
      borderColor: `${a}45`,
    };
  }
  if (themeId === 'neon') {
    return {
      background: isDark ? '#0c0c0e' : '#ffffff',
      borderWidth: 2,
      borderStyle: 'solid',
      borderColor: a,
      boxShadow: `0 0 12px ${a}55, inset 0 0 20px ${a}14`,
    };
  }
  if (themeId === 'minimal') {
    return {
      background: isDark ? 'rgb(9, 9, 11)' : '#ffffff',
      borderWidth: 1,
      borderStyle: 'solid',
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(148, 163, 184, 0.45)',
    };
  }
  if (themeId === 'bold') {
    return {
      background: isDark ? 'rgb(9, 9, 11)' : '#ffffff',
      borderWidth: 3,
      borderStyle: 'solid',
      borderColor: a,
      boxShadow: isDark ? `0 3px 0 ${a}50` : `0 3px 0 ${a}35`,
    };
  }
  return {
    background: isDark ? 'rgb(9, 9, 11)' : '#ffffff',
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: `${a}45`,
  };
}

/**
 * Customer-facing /store/:slug storefront.
 * `data` from live owner state, API, or `readPublicStoreSnapshot`.
 */
const storeIconSvg = (
  <svg width="40" height="40" className="text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" />
    <path d="M9 22V12h6v10" />
  </svg>
);

export default function PublicStorefront({
  isDark,
  onToggleTheme,
  slug,
  data,
  onOpenSignIn,
  onBrowseOther,
}) {
  const goBrowse = typeof onBrowseOther === 'function' ? onBrowseOther : onOpenSignIn;
  const [openId, setOpenId] = useState('mtn');
  const [viewMode, setViewMode] = useState('grid');
  const [selectedBundle, setSelectedBundle] = useState(null);

  const ownerLabel = useMemo(() => {
    const n = data?.display?.storeName && String(data.display.storeName).trim();
    return n || 'Store';
  }, [data]);
  const accent = useMemo(() => publicStoreAccent(data?.display), [data]);
  const cardTheme = useMemo(() => publicStoreCardTheme(data?.display), [data]);

  const isStoreClosed = data?.availability === false;
  const logo = data?.display?.logoDataUrl;
  const desc = data?.display?.storeDescription || '';
  const wa = (data?.display?.whatsapp || '').trim();
  const afa = data?.service;
  const showAfa = afa?.afaEnabled && afa && data;
  const showAfaBlock = showAfa && !isStoreClosed;
  const afaPrice = Number.parseFloat(String(afa?.afaPrice || ''), 10);
  const afaShow = showAfa && Number.isFinite(afaPrice) ? afaPrice : 15;
  const bundles = data?.bundles || null;
  const customP = data?.customBundlePrices || {};
  const customA = data?.customBundleActive || {};

  if (!data) {
    return (
      <div
        className={`min-h-full flex flex-col items-center justify-center py-10 w-full min-w-0 max-w-full ${SITE_PAD} ${isDark ? 'bg-zinc-950 text-white' : 'bg-slate-100 text-slate-900'}`}
      >
        <p className="text-center text-sm w-full max-w-full sm:max-w-2xl">
          This store is not set up in this browser yet. Ask the seller to save their store, or open this link in the
          same browser they used to publish.
        </p>
        {typeof onOpenSignIn === 'function' ? (
          <button
            type="button"
            onClick={onOpenSignIn}
            className="mt-6 rounded-xl bg-sky-500 text-white px-5 py-2.5 text-sm font-semibold"
          >
            Sign in
          </button>
        ) : null}
        <p className="mt-4 text-xs opacity-60">/store/{slug}</p>
      </div>
    );
  }

  return (
    <div
      className={`w-full min-h-full flex flex-col ${isDark ? 'bg-zinc-950 text-white' : 'bg-slate-100 text-slate-900'}`}
    >
      <header
        className={`sticky top-0 z-20 border-b py-3 w-full min-w-0 max-w-full ${SITE_PAD} ${isDark ? 'bg-zinc-950/95 border-white/10' : 'bg-white/90 border-slate-200'}`}
      >
        <div className="w-full min-w-0 max-w-full flex items-center justify-between gap-2">
          <div className="flex-1" />
          <div className="flex flex-col items-center gap-1 min-w-0">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ color: accent, background: isDark ? `${accent}33` : `${accent}22` }}
              aria-hidden
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" />
                <path d="M9 22V12h6v10" />
              </svg>
            </div>
            <span
              className={`text-xs font-semibold truncate max-w-full text-center max-w-[9rem] ${isDark ? 'text-white' : 'text-slate-800'}`}
            >
              {ownerLabel}
            </span>
          </div>
          <div className="flex-1 flex justify-end">
            {typeof onToggleTheme === 'function' ? (
              <button
                type="button"
                onClick={onToggleTheme}
                className={`p-2 rounded-full ${isDark ? 'text-amber-300 hover:bg-white/10' : 'text-slate-600 hover:bg-slate-200'}`}
                aria-label={isDark ? 'Light mode' : 'Dark mode'}
              >
                {isDark ? '☀️' : '🌙'}
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {isStoreClosed ? (
        <main
          className={`flex-1 w-full min-w-0 max-w-full min-h-0 flex flex-col items-stretch sm:items-center justify-center ${SITE_PAD} py-8 sm:py-10`}
          role="status"
        >
          <div className="w-full min-w-0 max-w-full">
            <div
              className={`rounded-3xl border p-6 sm:p-8 text-center shadow-md ${
                isDark ? 'bg-zinc-900 border-white/10' : 'bg-white border-slate-200/90'
              }`}
            >
              <div
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden border-0 flex items-center justify-center mx-auto"
                style={{
                  background: `linear-gradient(160deg, ${accent} 0%, #0f172a 100%)`,
                  boxShadow: `0 6px 24px ${accent}44`,
                }}
              >
                {logo ? (
                  <img src={logo} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white flex items-center justify-center [&>svg]:w-10 [&>svg]:h-10 sm:[&>svg]:w-11 sm:[&>svg]:h-11">
                    {storeIconSvg}
                  </span>
                )}
              </div>
              <h1
                className={`mt-5 text-xl sm:text-2xl font-bold tracking-tight uppercase ${isDark ? 'text-white' : 'text-slate-900'}`}
              >
                {ownerLabel}
              </h1>
              <p
                className="mt-2 inline-block rounded-full px-3.5 py-1 text-sm font-medium text-white"
                style={{ background: `${accent}e0` }}
              >
                Currently closed
              </p>
              <div
                className={`mt-5 rounded-2xl border p-3.5 text-left ${
                  isDark ? 'border-zinc-600/80 bg-zinc-950/40' : 'border-slate-200 bg-slate-50/80'
                }`}
              >
                <div className="flex gap-3">
                  <div
                    className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      isDark ? 'bg-zinc-800 text-slate-300' : 'bg-slate-200 text-slate-600'
                    }`}
                    aria-hidden
                  >
                    i
                  </div>
                  <div className="min-w-0">
                    <p className={`font-bold text-sm sm:text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      Store Offline
                    </p>
                    <p className={`text-sm mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                      Store is currently offline. Please try again later.
                    </p>
                  </div>
                </div>
              </div>
              {typeof goBrowse === 'function' ? (
                <button
                  type="button"
                  onClick={goBrowse}
                  className={`mt-5 w-full rounded-2xl border-2 py-3 px-4 text-sm sm:text-base font-semibold transition ${
                    isDark
                      ? 'border-zinc-600 bg-zinc-900/80 text-white hover:bg-zinc-800'
                      : 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  Browse Other Options
                </button>
              ) : (
                <a
                  href="/"
                  className={`mt-5 block w-full rounded-2xl border-2 py-3 px-4 text-sm sm:text-base font-semibold text-center ${
                    isDark ? 'border-zinc-600 bg-zinc-900/80 text-white' : 'border-slate-200 bg-white text-slate-900'
                  }`}
                >
                  Browse Other Options
                </a>
              )}
            </div>
          </div>
        </main>
      ) : null}

      {!isStoreClosed ? (
      <main className={`w-full min-w-0 max-w-full flex-1 ${SITE_PAD} pb-12 pt-4 space-y-4`}>
        <div
          className={`rounded-2xl border p-4 shadow-sm ${isDark ? 'bg-zinc-900 border-white/10' : 'bg-white border-slate-200'}`}
        >
          <div className="flex flex-col items-center text-center">
            <div
              className="w-24 h-24 rounded-full overflow-hidden border-2 border-white/25 flex items-center justify-center"
              style={{
                background: `linear-gradient(160deg, ${accent} 0%, #0f172a 100%)`,
                boxShadow: `0 8px 28px ${accent}4d`,
              }}
            >
              {logo ? (
                <img src={logo} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-white flex items-center justify-center [&>svg]:w-10 [&>svg]:h-10">
                  {storeIconSvg}
                </span>
              )}
            </div>
            <h1
              className={`mt-3 text-lg sm:text-xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}
            >
              {ownerLabel}
            </h1>
            {desc ? <p className={`text-sm mt-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{desc}</p> : null}
            <div className="mt-3">
              <span
                className="inline-flex items-center gap-1.5 rounded-full text-white text-xs font-semibold px-3 py-1.5"
                style={{ background: `${accent}ee` }}
              >
                <span aria-hidden>✦</span>
                Open for orders
              </span>
            </div>
            <div className="mt-4 flex items-center justify-center gap-2">
              {wa ? (
                <a
                  href={`https://wa.me/${wa.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-11 h-11 rounded-xl border-2 border-emerald-500 text-emerald-600 flex items-center justify-center"
                  aria-label="WhatsApp"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M12 2C6.48 2 2 6.48 2 12c0 1.78.45 3.45 1.25 4.9L2 22l5.2-1.4A9.9 9.9 0 0 0 12 22h.05c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18h-.04a7.9 7.9 0 0 1-3.7-.9l-.26-.15-2.87.8.8-2.8-.2-.3A6.97 6.97 0 0 1 4 12c0-3.86 3.14-7 7-7s7 3.14 7 7-3.14 7-7 7z" />
                  </svg>
                </a>
              ) : (
                <div className="w-11 h-11 rounded-xl border border-dashed border-slate-300" aria-hidden />
              )}
              <div className="w-11 h-11 rounded-xl border flex items-center justify-center opacity-50" title="Order history" aria-label="Order history (sign in)">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 6v6l3 2" />
                </svg>
              </div>
              <div
                className={`w-11 h-11 rounded-xl border flex items-center justify-center ${
                  isDark ? 'border-white/20' : 'border-slate-300'
                }`}
                aria-label="Cart"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <circle cx="8" cy="20" r="1.5" />
                  <circle cx="17" cy="20" r="1.5" />
                  <path d="M3 3h2l1 10h10l1-5H5" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        <div
          className={`rounded-2xl border p-3 ${isDark ? 'bg-zinc-900 border-white/10' : 'bg-white border-slate-200'}`}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="shrink-0" style={{ color: accent }} aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M7 2v2h1l1.5 7H18l2-4H6.2L5.1 2H2V0h3.2l.9 2z" />
                </svg>
              </span>
              <h2 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Select a package</h2>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className="p-1.5 rounded-lg"
                style={
                  viewMode === 'grid'
                    ? { background: accent, color: '#fff' }
                    : { color: isDark ? 'rgb(148, 163, 184)' : 'rgb(100, 116, 139)' }
                }
                aria-pressed={viewMode === 'grid'}
                aria-label="Grid"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className="p-1.5 rounded-lg"
                style={
                  viewMode === 'list'
                    ? { background: accent, color: '#fff' }
                    : { color: isDark ? 'rgb(148, 163, 184)' : 'rgb(100, 116, 139)' }
                }
                aria-pressed={viewMode === 'list'}
                aria-label="List"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M4 6h16" />
                  <path d="M4 12h16" />
                  <path d="M4 18h16" />
                </svg>
              </button>
            </div>
          </div>

          <ul
            className="space-y-2 list-none p-0 m-0"
            role="list"
          >
            {NETS.map((net) => {
              const list = bundles && Array.isArray(bundles[net.id]) ? bundles[net.id] : [];
              if (!list.length) return null;
              const offers = list.filter(
                (b) =>
                  !displayPriceGhs({
                    base: b.price,
                    customStr: customP[bundleKey(net.id, b.size)],
                    activeMap: customA,
                    net: net.id,
                    size: b.size,
                  }).hidden
              );
              if (offers.length === 0) return null;
              const open = openId === net.id;
              return (
                <li
                  key={net.id}
                  className={`rounded-xl border ${isDark ? 'border-white/10 bg-zinc-950/40' : 'border-slate-200 bg-slate-50'}`}
                >
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
                    onClick={() => setOpenId(open ? null : net.id)}
                    aria-expanded={open}
                  >
                    <span
                      className={`shrink-0 w-8 h-6 rounded flex items-center justify-center text-[9px] sm:text-[10px] ${net.badgeClass}`}
                    >
                      {net.name.length > 6 ? net.name.split(' ').map((w) => w[0]).join('') : net.name}
                    </span>
                    <span className="flex-1 min-w-0 text-sm font-medium text-slate-800 dark:text-white">
                      {offers.length} offer{offers.length === 1 ? '' : 's'}
                    </span>
                    <span className="shrink-0" aria-hidden>
                      <svg width="16" height="16" className={open ? 'rotate-180' : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </span>
                  </button>
                  {open && list.length > 0 ? (
                    <div className="px-3 pb-3 pt-0">
                      {net.sub ? (
                        <div
                          className={`flex items-center flex-wrap gap-1.5 text-xs mb-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}
                        >
                          <span className="font-medium">{net.sub}</span>
                          {net.subDays ? (
                            <>
                              <span aria-hidden>·</span>
                              <span className="inline-flex items-center gap-0.5">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                                  <circle cx="12" cy="12" r="9" />
                                  <path d="M12 6v6l3 2" />
                                </svg>
                                {net.subDays}
                              </span>
                            </>
                          ) : null}
                        </div>
                      ) : null}
                      <div
                        className={
                          viewMode === 'grid' ? 'grid grid-cols-2 gap-2' : 'flex flex-col gap-1.5'
                        }
                      >
                        {offers.map((b) => {
                          const d = displayPriceGhs({
                            base: b.price,
                            customStr: customP[bundleKey(net.id, b.size)],
                            activeMap: customA,
                            net: net.id,
                            size: b.size,
                          });
                          if (d.hidden) return null;
                          const tile = packageTileStyle(cardTheme, accent, isDark);
                          return (
                            <button
                              key={b.size}
                              type="button"
                              onClick={() => setSelectedBundle({ network: net.name, size: b.size, price: d.price })}
                              className={`text-left rounded-xl p-2.5 transition w-full ${
                                viewMode === 'list' ? 'flex items-center justify-between' : ''
                              }`}
                              style={tile}
                            >
                              <p className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{b.size}</p>
                              <p
                                className={`text-sm font-bold ${viewMode === 'list' ? '' : 'mt-0.5'}`}
                                style={{ color: accent }}
                              >
                                {d.label}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>

        {showAfaBlock ? (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-slate-500" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h3l1 2h2M4 8h16" />
                </svg>
              </span>
              <h2 className="text-sm font-bold">Additional services</h2>
            </div>
            <div
              className={`relative overflow-hidden rounded-2xl p-4 border ${isDark ? 'bg-amber-950/30 border-amber-800/30' : 'bg-amber-50 border-amber-200'}`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-white bg-gradient-to-br from-orange-400 to-orange-600"
                  aria-hidden
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <rect x="5" y="2" width="14" height="20" rx="1" />
                    <path d="M8 6h6M8 9h3" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900 dark:text-white">AFA registration</p>
                  <div className="mt-0.5 flex items-center gap-1">
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-300 text-amber-950 font-bold">MTN</span>
                    <span className="text-amber-600" aria-hidden>
                    ✦
                    </span>
                  </div>
                  <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    {afa?.afaDescription || 'Register for MTN AFA to enjoy bundle benefits.'}
                  </p>
                </div>
                <div className="shrink-0 sm:text-right">
                  <p className="text-base font-bold text-amber-700 dark:text-amber-300">GHS {afaShow.toFixed(2)}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (typeof onOpenSignIn === 'function') onOpenSignIn();
                }}
                className="mt-3 w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl py-2.5 px-4 text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-amber-600"
              >
                Register
                <span aria-hidden>→</span>
              </button>
            </div>
          </div>
        ) : null}

        <div
          className={`rounded-2xl border p-4 min-h-[140px] ${isDark ? 'bg-zinc-900 border-white/10' : 'bg-white border-slate-200'}`}
        >
          <div className="flex items-center gap-2 mb-3">
            <span style={{ color: accent }} aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 2h2l.6 2M6 2h2l-1.5 9" />
                <path d="M2 2h1l.6 2" />
                <rect x="4" y="8" width="16" height="12" rx="1" />
                <circle cx="8" cy="20" r="1" />
                <circle cx="16" cy="20" r="1" />
              </svg>
            </span>
            <h2 className="text-sm font-bold">Quick purchase</h2>
          </div>
          {selectedBundle ? (
            <div>
              <p className="text-sm font-medium">
                {selectedBundle.network} · {selectedBundle.size}
              </p>
              <p className="font-bold" style={{ color: accent }}>GHS {Number(selectedBundle.price).toFixed(2)}</p>
              <p className="text-xs mt-2 text-slate-500">Open the app and sign in to complete checkout with your wallet.</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-slate-400 text-sm text-center">
              <svg
                className="w-10 h-10 opacity-50 mb-2"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden
              >
                <rect x="4" y="6" width="16" height="12" rx="1" />
                <path d="M4 9h16" />
              </svg>
              Select a package to continue
            </div>
          )}
        </div>

        <p className={`text-center text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
          © {new Date().getFullYear()} {String(ownerLabel)}. All rights reserved.
        </p>
      </main>
      ) : null}
    </div>
  );
}

