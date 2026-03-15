import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { api } from './api';

function getTheme() {
  if (typeof window === 'undefined') return 'light';
  const s = localStorage.getItem('theme');
  if (s === 'dark' || s === 'light') return s;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch (_) {
    return window.__INITIAL_THEME__ || 'light';
  }
}

export default function App() {
  const [theme, setTheme] = useState(() => (typeof window !== 'undefined' && window.__INITIAL_THEME__) || getTheme());
  const [token, setToken] = useState(() => (typeof window !== 'undefined' ? api.getToken() : null));
  const [user, setUser] = useState(null);
  const [isSignedIn, setIsSignedIn] = useState(!!token);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [ordersExpanded, setOrdersExpanded] = useState(false);
  const [selectedMenu, setSelectedMenu] = useState('dashboard');
  const [activeTab, setActiveTab] = useState('mtn');
  const [scrolled, setScrolled] = useState(false);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [profileImage, setProfileImage] = useState(null);
  const [isEditingImage, setIsEditingImage] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [buyBundle, setBuyBundle] = useState(null);
  const [recipientNumber, setRecipientNumber] = useState('');
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [confirmCheckoutOpen, setConfirmCheckoutOpen] = useState(false);
  const [confirmError, setConfirmError] = useState(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [topUpError, setTopUpError] = useState(null);
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
  const fileInputRef = useRef(null);

  const fetchWallet = () => {
    if (!api.getToken()) return;
    api.getWallet().then((d) => setWalletBalance(d.balance)).catch(() => {});
  };

  useEffect(() => {
    if (!token) {
      setIsSignedIn(false);
      setUser(null);
      setWalletBalance(0);
      return;
    }
    api.me()
      .then((u) => {
        setUser(u);
        setIsSignedIn(true);
        fetchWallet();
      })
      .catch(() => {
        api.setToken(null);
        setToken(null);
        setIsSignedIn(false);
        setUser(null);
        setWalletBalance(0);
        localStorage.removeItem('dataplus_signed_in');
      });
  }, [token]);

  useEffect(() => {
    if (currentPage === 'topup' && api.getToken()) {
      api.getTransactions().then(setTransactions).catch(() => setTransactions([]));
    }
  }, [currentPage]);

  const addToCart = () => {
    if (!buyBundle) return;
    setCart((prev) => [...prev, { id: Date.now(), bundle: buyBundle, recipientNumber: recipientNumber.trim() || '—' }]);
    setBuyBundle(null);
    setRecipientNumber('');
  };

  const removeFromCart = (id) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
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

  useEffect(() => {
    const savedImage = localStorage.getItem('profileImage');
    if (savedImage) setProfileImage(savedImage);
  }, []);

  // Apply theme before first paint and subscribe to system preference
  useLayoutEffect(() => {
    const resolved = getTheme();
    setTheme(resolved);
    document.documentElement.setAttribute('data-theme', resolved);
  }, []);

  // When system dark/light mode changes, always follow it and clear any manual override
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const applySystemTheme = () => {
      const next = mq.matches ? 'dark' : 'light';
      localStorage.removeItem('theme');
      setTheme(next);
      document.documentElement.setAttribute('data-theme', next);
    };
    mq.addEventListener('change', applySystemTheme);
    return () => mq.removeEventListener('change', applySystemTheme);
  }, []);

  // When user returns to the tab, re-sync theme (in case system changed while tab was in background)
  useEffect(() => {
    const onVisible = () => {
      const resolved = getTheme();
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

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);
  const toggleProfile = () => setProfileOpen((prev) => !prev);
  const toggleOrders = () => setOrdersExpanded((prev) => !prev);
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', next);
    document.documentElement.setAttribute('data-theme', next);
    setTheme(next);
  };

  const handleMenuSelect = (menu) => {
    setSelectedMenu(menu);
    if (menu === 'profile-page') {
      setCurrentPage('profile');
      setProfileOpen(false);
    } else if (menu === 'dashboard') {
      setCurrentPage('dashboard');
      setProfileOpen(false);
    } else if (menu === 'wallet' || menu === 'topup') {
      setCurrentPage('topup');
      setProfileOpen(false);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result;
        setProfileImage(base64String);
        localStorage.setItem('profileImage', base64String);
        setIsEditingImage(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setProfileImage(null);
    localStorage.removeItem('profileImage');
    setIsEditingImage(false);
  };

  const triggerFileInput = () => fileInputRef.current?.click();

  const isDark = theme === 'dark';

  const bundles = [
    { size: '1 GB', price: '4.20' },
    { size: '2 GB', price: '8.40' },
    { size: '3 GB', price: '12.30' },
    { size: '4 GB', price: '16.20' },
    { size: '5 GB', price: '20.50' },
    { size: '6 GB', price: '25.00' },
    { size: '7 GB', price: '28.80' },
    { size: '8 GB', price: '33.00' },
    { size: '10 GB', price: '41.00' },
    { size: '15 GB', price: '61.00' },
    { size: '20 GB', price: '80.00' },
    { size: '25 GB', price: '98.00' },
    { size: '30 GB', price: '118.00' },
    { size: '40 GB', price: '154.00' },
    { size: '50 GB', price: '193.00' },
  ];

  const MenuItem = ({ id, icon, label, hasSubmenu = false }) => {
    const isSelected = selectedMenu === id;
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
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
      </svg>
    ),
    Chart: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </svg>
    ),
  };

  const stroke = isDark ? '#ffffff' : '#000000';

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
      `}</style>

      {!isSignedIn ? (
        <div className="flex-1 flex flex-col w-full min-h-full">
          <SignInPage
            isDark={isDark}
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
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 md:hidden"
          onClick={() => {
            setSidebarOpen(false);
            setProfileOpen(false);
          }}
        />
      )}

      <div
        className={`fixed top-0 left-0 h-full w-72 z-[60] md:z-50 transition-transform duration-300 rounded-r-3xl shadow-xl ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} ${isDark ? 'bg-black border-r border-white/10' : 'bg-white border-r border-slate-200'}`}
      >
        <div className="p-4 pt-5 h-full overflow-y-auto no-scrollbar flex flex-col items-stretch">
          {/* Datafy Hub: circle + details in line with close button, no card */}
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-4 min-w-0 flex-1">
              <img
                src="https://files.catbox.moe/l3islw.jpg"
                alt="DataPlus"
                className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover flex-shrink-0 border ${isDark ? 'border-white/10' : 'border-slate-200'}`}
              />
              <div className="min-w-0">
                <h2 className={`text-lg font-semibold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>𝒟𝒶𝓉𝒶𝒫𝓁𝓊𝓈</h2>
                <p className={`text-sm truncate ${isDark ? 'text-white/70' : 'text-slate-500'}`}>Agent Console</p>
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
          <div className={`w-10 h-px mx-auto mb-4 ${isDark ? 'bg-white/10' : 'bg-slate-200'}`} />

          <p className={`text-xs uppercase tracking-wider mb-2 font-medium ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Menu</p>
          <nav className="space-y-1.5">
            <MenuItem id="dashboard" icon={<Svg.Grid stroke={stroke} />} label="Dashboard" />
            <MenuItem id="bulk-orders" icon={<Svg.Phone stroke={stroke} />} label="Bulk Orders (MTN)" />
            <MenuItem id="afa-registration" icon={<Svg.Phone stroke={stroke} />} label="AFA Registration" />
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
                  <a href="#" onClick={() => handleMenuSelect('pending-orders')} className={`block py-2.5 px-3 rounded-lg text-base ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-200'} ${selectedMenu === 'pending-orders' ? (isDark ? 'bg-white/10' : 'bg-slate-200') : ''}`}>Pending Orders</a>
                  <a href="#" onClick={() => handleMenuSelect('completed-orders')} className={`block py-2.5 px-3 rounded-lg text-base ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-200'} ${selectedMenu === 'completed-orders' ? (isDark ? 'bg-white/10' : 'bg-slate-200') : ''}`}>Completed Orders</a>
                </div>
              )}
            </div>
            <MenuItem id="transactions" icon={<Svg.Clock stroke={stroke} />} label="Transactions" />
            <MenuItem id="join-us" icon={<Svg.Message stroke={stroke} />} label="Join Us" />
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
      </div>

      <div
        className={`fixed top-12 right-3 sm:top-16 sm:right-6 z-50 w-56 sm:w-60 rounded-xl transition-all duration-300 overflow-hidden ${profileOpen ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-95 pointer-events-none'} ${isDark ? 'bg-black/40 border border-white/20' : 'bg-white/50 border border-slate-200/60'} backdrop-blur-xl shadow-2xl`}
        style={{ top: 'max(3rem, calc(env(safe-area-inset-top) + 2.5rem))', right: 'max(0.75rem, env(safe-area-inset-right))' }}
      >
        <div className="p-4">
          <div className={`flex items-center gap-3 mb-4 pb-4 border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-base font-bold shadow-lg flex-shrink-0 overflow-hidden">
              {profileImage ? <img src={profileImage} alt="Profile" className="w-full h-full object-cover" /> : 'J'}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className={`font-semibold text-base truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>James Owusu</h3>
              <p className={`text-sm truncate ${isDark ? 'text-white/70' : 'text-slate-500'}`}>Agent</p>
            </div>
          </div>
          <nav className="space-y-0.5">
            <a href="#" onClick={(e) => { e.preventDefault(); handleMenuSelect('profile-page'); }} className={`flex items-center gap-3 py-2.5 px-3 rounded-lg text-base transition-colors ${isDark ? 'text-white/80 hover:bg-white/10 hover:text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
              <Svg.User stroke="currentColor" /> <span>Profile</span>
            </a>
            <a href="#" className={`flex items-center gap-3 py-2.5 px-3 rounded-lg text-base transition-colors ${isDark ? 'text-white/80 hover:bg-white/10 hover:text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
              <Svg.File /> <span>My Orders</span>
            </a>
            <a href="#" className={`flex items-center gap-3 py-2.5 px-3 rounded-lg text-base transition-colors ${isDark ? 'text-white/80 hover:bg-white/10 hover:text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
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
                api.setToken(null);
                setToken(null);
                setUser(null);
                setIsSignedIn(false);
                setProfileOpen(false);
                setWalletBalance(0);
                localStorage.removeItem('dataplus_signed_in');
              }}
              className="w-full flex items-center gap-3 py-2.5 px-3 rounded-lg text-base transition-colors text-red-500 hover:bg-red-500/10 font-medium"
            >
              <Svg.LogOut /> Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Buy bundle modal: summary + recipient details */}
      {buyBundle && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setBuyBundle(null); setRecipientNumber(''); }} aria-hidden="true" />
          <div className={`relative w-full max-w-md rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto ${isDark ? 'bg-black' : 'bg-slate-50'}`}>
            {/* Top card: purchase summary */}
            <div className="rounded-xl sm:rounded-2xl mx-3 mt-3 sm:mx-4 sm:mt-4 p-5 sm:p-6 text-white relative overflow-hidden bg-cover bg-center" style={{ backgroundImage: 'url(https://files.catbox.moe/r1m0uh.png)' }}>
              <div className="absolute inset-0 bg-black/50 rounded-xl sm:rounded-2xl" aria-hidden="true" />
              <div className="relative z-10 flex justify-between items-start mb-4">
                <div>
                  <p className="text-sm font-medium opacity-90">MTN</p>
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
            {/* Bottom card: recipient details */}
            <div className={`mx-3 mb-3 sm:mx-4 sm:mb-4 mt-3 rounded-xl sm:rounded-2xl p-5 sm:p-6 border ${isDark ? 'bg-black border-white/10' : 'bg-white border-slate-200'}`}>
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-white' : 'text-slate-700'}`}>Recipient number</label>
              <input
                type="tel"
                value={recipientNumber}
                onChange={(e) => setRecipientNumber(e.target.value)}
                placeholder="e.g. 024 000 0000"
                className={`w-full px-4 py-3 rounded-xl border text-base placeholder:opacity-60 ${isDark ? 'bg-black border-white/10 text-white placeholder:text-white/50' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`}
              />
              <div className="flex gap-3 mt-5 justify-end">
                <button
                  type="button"
                  onClick={() => { setBuyBundle(null); setRecipientNumber(''); }}
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

      <main className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden max-w-md mx-auto w-full pb-20 sm:pb-24 px-3 sm:px-4 md:max-w-none md:mx-0 md:px-6 lg:px-8 ${sidebarOpen ? 'md:ml-72' : ''}`}>
        <header
          className={`fixed top-0 left-0 right-0 z-50 h-14 sm:h-16 transition-all duration-300 flex items-center justify-between px-3 sm:px-4 md:px-6 backdrop-blur-xl ${sidebarOpen ? 'md:left-72' : ''} ${isDark ? 'bg-black/90' : 'bg-white/40'} ${scrolled ? 'shadow-lg' : ''}`}
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
            𝒟𝒶𝓉𝒶𝒫𝓁𝓊𝓈
          </h1>
          <button
            onClick={toggleProfile}
            className={`w-11 h-11 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center overflow-hidden transition-colors flex-shrink-0 ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-200'}`}
            aria-label="Toggle profile"
          >
            {profileImage ? (
              <img src={profileImage} alt="" className="w-full h-full object-cover" />
            ) : (
              <Svg.User stroke={stroke} width={24} height={24} />
            )}
          </button>
        </header>

        {currentPage === 'dashboard' ? (
          <>
            <div className="pt-14 sm:pt-20 pb-4 sm:pb-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 sm:p-2.5 rounded-lg ${isDark ? 'bg-black border border-white/10' : 'bg-white'}`}>
                    <Svg.Home stroke={stroke} />
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-bold">Dashboard</h1>
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
                    <p className="text-xl sm:text-3xl font-bold truncate">¢ {walletBalance.toFixed(2)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-white/10' : 'bg-neutral-800'}`}>
                    <Svg.Cart stroke="#ffffff" />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm ${isDark ? 'text-white/70' : 'text-neutral-400'}`}>Today's Spent</p>
                    <p className="text-xl sm:text-3xl font-bold truncate">¢ 0.00</p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCurrentPage('topup')}
                className={`w-full py-3 sm:py-4 rounded-xl transition-colors flex items-center justify-center gap-2 font-medium text-base ${isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-neutral-800 hover:bg-neutral-700'}`}
              >
                <Svg.Plus /> Top Up Wallet
              </button>
            </div>

            <div className="rounded-xl sm:rounded-2xl p-5 sm:p-7 mb-5 sm:mb-6 bg-black text-white">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
                {['Wallet Balance', "Today's Orders", "Today's Amount", "Today's Bundle"].map((label, i) => (
                  <div key={i} className={`text-center ${i < 2 ? 'pb-4 sm:pb-6 border-b md:border-b-0 md:pb-0' : 'pt-4 sm:pt-6'} ${i < 3 ? 'md:border-r' : ''} border-white/10`}>
                    <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-full flex items-center justify-center mx-auto mb-3 bg-white/10">
                      <Svg.Wallet stroke="#ffffff" />
                    </div>
                    <p className="text-sm font-medium opacity-80">{label}</p>
                    <p className="text-lg sm:text-xl font-bold">{i === 0 ? `¢ ${walletBalance.toFixed(2)}` : i === 1 ? '0' : i === 2 ? '¢ 0.00' : '0 GB'}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className={`flex p-1.5 rounded-xl mb-5 sm:mb-6 ${isDark ? 'bg-black border border-white/10' : 'bg-slate-200'}`}>
              <button
                onClick={() => setActiveTab('mtn')}
                className={`flex-1 py-2.5 sm:py-3 rounded-lg text-sm sm:text-base font-medium transition-all ${activeTab === 'mtn' ? (isDark ? 'bg-white text-black shadow-lg' : 'bg-black text-white shadow-lg') : 'text-white/60 hover:text-white/90'}`}
              >
                MTN
              </button>
              <button
                onClick={() => setActiveTab('telecel')}
                className={`flex-1 py-2.5 sm:py-3 rounded-lg text-sm sm:text-base font-medium transition-all ${activeTab === 'telecel' ? 'bg-purple-600 text-white shadow-lg' : 'text-white/60 hover:text-white/90'}`}
              >
                Telecel
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5 pb-16 sm:pb-20">
              {bundles.map((bundle, index) => (
                <div
                key={index}
                className="rounded-xl sm:rounded-2xl p-5 sm:p-6 text-white relative overflow-hidden group hover:scale-[1.01] sm:hover:scale-[1.02] transition-transform bg-cover bg-center"
                style={{ backgroundImage: 'url(https://files.catbox.moe/r1m0uh.png)' }}
              >
                  <div className="absolute inset-0 bg-black/50 rounded-xl sm:rounded-2xl" aria-hidden="true" />
                  <div className="relative z-10 flex flex-col h-full">
                    <div className="flex justify-between items-start mb-4 gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium opacity-90 drop-shadow-sm">MTN</p>
                        <h3 className="text-xl sm:text-2xl font-bold drop-shadow-md">{bundle.size}</h3>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-medium opacity-90 drop-shadow-sm">Price</p>
                        <p className="text-lg sm:text-xl font-bold drop-shadow-md">¢ {bundle.price}</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => setBuyBundle(bundle)} className="mt-auto w-full py-3 sm:py-4 rounded-xl bg-white/95 hover:bg-white text-slate-800 font-semibold text-base transition-colors shadow-lg">
                      Buy
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : currentPage === 'topup' ? (
          <>
            <div className="pt-14 sm:pt-20 pb-4 sm:pb-5">
              <button
                type="button"
                onClick={() => setCurrentPage('dashboard')}
                className={`flex items-center gap-2 mb-4 text-sm font-medium ${isDark ? 'text-white/70 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}
                aria-label="Back to dashboard"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                Back
              </button>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 sm:p-2.5 rounded-lg ${isDark ? 'bg-black border border-white/10' : 'bg-white border border-slate-200'}`}>
                    <Svg.Wallet stroke={stroke} />
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-bold">Top Up Wallet</h1>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative w-2.5 h-2.5 rounded-full bg-green-500" />
                  <span className="text-sm font-medium text-green-600 dark:text-green-400">Open now</span>
                </div>
              </div>
            </div>

            <div className={`rounded-xl sm:rounded-2xl p-5 sm:p-6 mb-5 border ${isDark ? 'bg-black border-white/10' : 'bg-white border-slate-200'}`}>
              <h2 className={`text-lg font-bold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>Top Up Wallet</h2>
              <p className={`text-sm mb-4 ${isDark ? 'text-white/60' : 'text-slate-500'}`}>
                Enter an amount and continue to Paystack to complete your payment.
              </p>
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Amount (GHS)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
                className={`w-full px-4 py-3 rounded-xl border text-base placeholder:opacity-60 ${isDark ? 'bg-black border-white/10 text-white placeholder:text-white/50' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`}
              />
              {topUpError && <p className="text-sm text-red-500 mt-2">{topUpError}</p>}
              <button
                type="button"
                onClick={async () => {
                  const amt = parseFloat(topUpAmount);
                  if (!Number.isFinite(amt) || amt <= 0) return;
                  setTopUpError(null);
                  try {
                    const data = await api.topUp(amt);
                    setWalletBalance(data.balance);
                    setTopUpAmount('');
                    const list = await api.getTransactions();
                    setTransactions(list);
                  } catch (err) {
                    setTopUpError(err.message || 'Top-up failed');
                  }
                }}
                className="w-full mt-4 py-3 rounded-xl font-medium text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
              >
                Top Up
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
        ) : (
          <>
            <div className="pt-14 sm:pt-20 pb-5 sm:pb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 sm:p-2.5 rounded-lg ${isDark ? 'bg-black border border-white/10' : 'bg-white'}`}>
                    <Svg.User stroke={stroke} />
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-bold">Profile</h1>
                </div>
                <div className="relative w-4 h-4 flex items-center justify-center">
                  <div className="absolute w-4 h-4 rounded-full bg-green-500 status-dot" />
                  <div className="relative w-3 h-3 rounded-full bg-green-400" />
                </div>
              </div>
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
                <div className="relative mb-4 group">
                  <div
                    className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-3xl font-bold shadow-lg overflow-hidden cursor-pointer"
                    onClick={triggerFileInput}
                  >
                    {profileImage ? <img src={profileImage} alt="Profile" className="w-full h-full object-cover" /> : 'J'}
                  </div>
                  <div
                    className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    onClick={() => setIsEditingImage(!isEditingImage)}
                  >
                    <Svg.Edit />
                  </div>
                  <div className="absolute bottom-1 right-1 w-5 h-5 bg-green-500 border-2 border-white rounded-full" />
                </div>
                {isEditingImage && (
                  <div className="flex gap-3 mb-4">
                    <button onClick={triggerFileInput} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">
                      Upload Photo
                    </button>
                    {profileImage && (
                      <button onClick={handleRemoveImage} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors">
                        Remove
                      </button>
                    )}
                    <button onClick={() => setIsEditingImage(false)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-900'}`}>
                      Cancel
                    </button>
                  </div>
                )}
                <h3 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>James Owusu</h3>
                <p className={`text-base ${isDark ? 'text-white/70' : 'text-slate-500'}`}>Agent</p>
              </div>
              <div className="px-5 sm:px-6 pb-5 sm:pb-6 space-y-5">
                {[
                  ['Full Name', 'James Owusu'],
                  ['Email Address', 'leoagain0700@gmail.com'],
                  ['Agent ID', 'DF-4398'],
                  ['Account Status', 'Active'],
                  ['Member Since', 'Nov 08, 2025'],
                ].map(([label, value], i) => (
                  <div key={i}>
                    <p className={`text-sm font-medium mb-1.5 ${isDark ? 'text-white/70' : 'text-slate-500'}`}>{label}</p>
                    <p className={`text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>{value}</p>
                  </div>
                ))}
                <div className="pt-5 space-y-3">
                  <button className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-base transition-colors flex items-center justify-center gap-2">
                    <Svg.Edit stroke="currentColor" /> EDIT PROFILE
                  </button>
                  <button className={`w-full py-3.5 rounded-xl font-semibold text-base transition-colors flex items-center justify-center gap-2 ${isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-slate-700 hover:bg-slate-600 text-white'}`}>
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

        </main>

      {/* Cart FAB - portaled so it can be dragged anywhere on the viewport */}
      {typeof document !== 'undefined' && createPortal(
        <button
          ref={cartButtonRef}
          onClick={handleCartButtonClick}
          onMouseDown={handleCartButtonDragStart}
          onTouchStart={handleCartButtonDragStart}
          className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white text-slate-900 shadow-xl flex items-center justify-center hover:scale-110 transition-transform relative cursor-grab active:cursor-grabbing"
          style={{
            position: 'fixed',
            zIndex: 99998,
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
                  {cart.map((item) => (
                    <li key={item.id} className={`flex items-center justify-between gap-3 p-3 rounded-xl ${isDark ? 'bg-white/5 border border-white/10' : 'bg-slate-50 border border-slate-200'}`}>
                      <div className="min-w-0">
                        <p className={`font-medium truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>MTN {item.bundle.size}</p>
                        <p className={`text-sm truncate ${isDark ? 'text-white/60' : 'text-slate-500'}`}>{item.recipientNumber}</p>
                        <p className={`text-sm font-medium ${isDark ? 'text-white/90' : 'text-slate-700'}`}>¢ {item.bundle.price}</p>
                      </div>
                      <button type="button" onClick={() => removeFromCart(item.id)} className={`p-2 rounded-lg shrink-0 ${isDark ? 'text-red-400 hover:bg-white/10' : 'text-red-600 hover:bg-slate-200'}`} aria-label="Remove">
                        <Svg.Trash stroke="currentColor" />
                      </button>
                    </li>
                  ))}
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
                  } catch (err) {
                    setConfirmError(err.message || 'Payment failed. Try again.');
                  }
                }}
                className="flex-1 py-2.5 rounded-xl font-medium text-white bg-emerald-600 hover:bg-emerald-700 transition-colors border border-transparent"
              >
                Confirm & Pay
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

function SignInPage({ isDark, onSignIn }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'register'
  const [fullName, setFullName] = useState('');
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

  const clearError = () => { setError(''); setSuccess(''); };

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
      if (!trimmedEmail) {
        setError('Please enter your email or phone.');
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
        await api.register({ email: trimmedEmail, password: trimmedPassword, fullName: trimmedName });
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
      setError(err.message || 'Invalid email or password. Please try again or register.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-full w-full p-6">
      <img
        src="https://files.catbox.moe/l3islw.jpg"
        alt="DataPlus"
        className={`w-20 h-20 rounded-full object-cover border mb-6 ${isDark ? 'border-white/10' : 'border-slate-200'}`}
      />
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
        <input
          type="email"
          placeholder="Email or phone"
          value={email}
          onChange={(e) => { setEmail(e.target.value); clearError(); }}
          className={inputClass}
        />
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); clearError(); }}
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
    </div>
  );
}
