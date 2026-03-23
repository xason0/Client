import React, { useState } from 'react';
import styles from './UltraxasChatBar.module.css';

export default function UltraxasChatBar({ value, onChange, onSubmit, placeholder = 'Ask anything', disabled = false, isDark = true }) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <div className={styles.chatBarRoot}>
      <form
        className={styles.container}
        onSubmit={(e) => {
          e.preventDefault();
          if (!disabled) onSubmit?.();
        }}
      >
        <div className={`${styles.wrapper} ${isDark ? styles.wrapperDark : styles.wrapperLight} ${isFocused ? styles.focused : ''}`}>
          <button type="button" className={styles.emojiBtn} aria-label="Emoji">
            😊
          </button>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            disabled={disabled}
            className={`${styles.input} ${isDark ? styles.inputDark : styles.inputLight}`}
            aria-label="Chat input"
          />
          <button type="submit" className={styles.sendBtn} aria-label="Send" disabled={disabled || !value.trim()}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V6M5 12l7-7 7 7" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
