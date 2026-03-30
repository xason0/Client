import React, { useRef, useLayoutEffect, useCallback } from 'react';
import { sanitizeBroadcastRichHtml } from '../../shared/broadcastSanitize.js';

export default function BroadcastRichEditor({ value, onChange, isDark, placeholder }) {
  const ref = useRef(null);
  const savedRangeRef = useRef(null);

  const captureSelection = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return;
    try {
      savedRangeRef.current = range.cloneRange();
    } catch {
      savedRangeRef.current = null;
    }
  }, []);

  const restoreSelection = useCallback(() => {
    const el = ref.current;
    const r = savedRangeRef.current;
    if (!el || !r) return false;
    try {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      return true;
    } catch {
      return false;
    }
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || document.activeElement === el) return;
    const next = sanitizeBroadcastRichHtml(value);
    const cur = sanitizeBroadcastRichHtml(el.innerHTML);
    if (cur !== next) el.innerHTML = next || '';
  }, [value]);

  const pushChange = useCallback(() => {
    const el = ref.current;
    if (el) onChange(el.innerHTML);
  }, [onChange]);

  const onBlur = useCallback(() => {
    const el = ref.current;
    if (el) onChange(sanitizeBroadcastRichHtml(el.innerHTML));
  }, [onChange]);

  const onPaste = useCallback(
    (e) => {
      const el = ref.current;
      if (!el) return;
      const html = e.clipboardData?.getData('text/html');
      const plain = e.clipboardData?.getData('text/plain') ?? '';
      if (!html || !String(html).trim()) {
        e.preventDefault();
        el.focus();
        restoreSelection();
        try {
          document.execCommand('insertText', false, plain);
        } catch {
          /* ignore */
        }
        pushChange();
        captureSelection();
        return;
      }
      e.preventDefault();
      el.focus();
      restoreSelection();
      const clean = sanitizeBroadcastRichHtml(html);
      try {
        if (clean) {
          document.execCommand('insertHTML', false, clean);
        } else if (plain) {
          document.execCommand('insertText', false, plain);
        }
      } catch {
        try {
          if (plain) document.execCommand('insertText', false, plain);
        } catch {
          /* ignore */
        }
      }
      pushChange();
      captureSelection();
    },
    [captureSelection, pushChange, restoreSelection]
  );

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      data-placeholder={placeholder || ''}
      onInput={pushChange}
      onPaste={onPaste}
      onMouseUp={captureSelection}
      onKeyUp={captureSelection}
      onSelect={captureSelection}
      onBlur={onBlur}
      className={`broadcast-rich-editor w-full px-4 py-3 rounded-xl border text-sm min-h-[100px] outline-none focus:ring-2 focus:ring-violet-500/40 select-text ${
        isDark ? 'bg-white/5 border-white/15 text-white' : 'bg-white border-slate-200 text-slate-900'
      }`}
    />
  );
}
