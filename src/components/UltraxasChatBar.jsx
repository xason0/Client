import React, { useState, useRef, useEffect } from 'react';
import styles from './UltraxasChatBar.module.css';

/** Curated grid — full Unicode picker would need a dependency; this covers common chat reactions. */
const EMOJI_GRID = [
  '😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊',
  '😇', '🙂', '😉', '😍', '🥰', '😘', '😗', '😋',
  '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫',
  '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧',
  '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐',
  '🥳', '😎', '🤓', '🧐', '😕', '😟', '🙁', '😤',
  '😠', '😡', '🤬', '😈', '👿', '💀', '☠️', '💩',
  '🤡', '👹', '👺', '👻', '👽', '👾', '🤖', '😺',
  '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾',
  '👍', '👎', '👊', '✊', '🤛', '🤜', '🤝', '🙏',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
  '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘',
  '✨', '⭐', '🌟', '💫', '🔥', '💯', '✅', '❌',
  '⚠️', '💬', '👋', '🙌', '👏', '🫶', '💪', '🎉',
  '🎊', '🎁', '🏆', '🥇', '⚽', '🏀', '🎮', '🎯',
];

export default function UltraxasChatBar({
  value,
  onChange,
  onSubmit,
  placeholder = 'Ask anything',
  disabled = false,
  isDark = true,
  onInputFocusChange,
  /** When true, Send stays enabled with an empty input (e.g. photo attached, message optional). */
  allowSendEmpty = false,
  /** While a message is sending: show pause/stop control instead of send. */
  sending = false,
  onCancelSend,
}) {
  const [isFocused, setIsFocused] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const rootRef = useRef(null);
  const blurFocusTimerRef = useRef(null);

  const clearBlurTimer = () => {
    if (blurFocusTimerRef.current) {
      clearTimeout(blurFocusTimerRef.current);
      blurFocusTimerRef.current = null;
    }
  };

  useEffect(() => () => clearBlurTimer(), []);

  useEffect(() => {
    if (!emojiOpen) return undefined;
    const close = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setEmojiOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [emojiOpen]);

  const appendEmoji = (ch) => {
    onChange?.(`${value ?? ''}${ch}`);
    setEmojiOpen(false);
  };

  return (
    <div className={styles.chatBarRoot} ref={rootRef}>
      {emojiOpen && !disabled && !sending ? (
        <div
          className={`${styles.emojiPopover} ${isDark ? styles.emojiPopoverDark : styles.emojiPopoverLight}`}
          role="listbox"
          aria-label="Emoji picker"
        >
          {EMOJI_GRID.map((emoji, i) => (
            <button
              key={`${emoji}-${i}`}
              type="button"
              role="option"
              className={`${styles.emojiCell} ${isDark ? styles.emojiCellDark : styles.emojiCellLight}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => appendEmoji(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}
      <form
        className={styles.container}
        onSubmit={(e) => {
          e.preventDefault();
          if (sending || disabled) return;
          onSubmit?.();
        }}
      >
        <div className={`${styles.wrapper} ${isDark ? styles.wrapperDark : styles.wrapperLight} ${isFocused ? styles.focused : ''}`}>
          <button
            type="button"
            className={styles.emojiBtn}
            aria-label="Choose emoji"
            aria-expanded={emojiOpen}
            aria-haspopup="listbox"
            disabled={disabled || sending}
            onClick={() => !(disabled || sending) && setEmojiOpen((o) => !o)}
          >
            😊
          </button>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            onFocus={() => {
              clearBlurTimer();
              setIsFocused(true);
              onInputFocusChange?.(true);
            }}
            onBlur={() => {
              setIsFocused(false);
              clearBlurTimer();
              blurFocusTimerRef.current = setTimeout(() => {
                blurFocusTimerRef.current = null;
                onInputFocusChange?.(false);
              }, 180);
            }}
            placeholder={placeholder}
            disabled={disabled || sending}
            className={`${styles.input} ${isDark ? styles.inputDark : styles.inputLight}`}
            aria-label="Chat input"
          />
          {sending && onCancelSend ? (
            <button
              type="button"
              className={`${styles.sendBtn} ${isDark ? styles.sendBtnOnDarkBar : styles.sendBtnOnLightBar}`}
              aria-label="Stop sending"
              title="Stop sending"
              onClick={(e) => {
                e.preventDefault();
                onCancelSend();
              }}
            >
              <svg
                className={styles.sendBtnIcon}
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden
              >
                <rect x="6" y="5" width="4.5" height="14" rx="1.2" />
                <rect x="13.5" y="5" width="4.5" height="14" rx="1.2" />
              </svg>
            </button>
          ) : (
            <button
              type="submit"
              className={`${styles.sendBtn} ${isDark ? styles.sendBtnOnDarkBar : styles.sendBtnOnLightBar}`}
              aria-label="Send"
              disabled={disabled || sending || (!allowSendEmpty && !String(value ?? '').trim())}
            >
              <svg
                className={styles.sendBtnIcon}
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M12 19V6M5 12l7-7 7 7" />
              </svg>
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
