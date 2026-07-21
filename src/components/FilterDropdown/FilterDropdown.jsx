import { useEffect, useRef, useState } from "react";
import styles from "./filter.module.css";

// A custom dropdown (not a native <select>) matching the top bar's selector
// look. The `label` caption sits beside the box (e.g. "Store:"); the trigger
// shows the current selection — one of `options`, or the `allLabel` catch-all
// (null). `getLabel` turns an option value into its display text.
export default function FilterDropdown({ label, allLabel, value, options, getLabel = (v) => v, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on an outside tap/click or Escape
  useEffect(() => {
    function handleOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function handleKey(e) {
      if (e.key === "Escape" && ref.current?.contains(document.activeElement)) {
        setOpen(false);
        ref.current.querySelector("button")?.focus();
      }
    }
    document.addEventListener("pointerdown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  // Open on ArrowDown, then move focus between options (they're real buttons,
  // so Enter/Space just work)
  function handleKeyDown(e) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    if (!open) {
      setOpen(true);
      return;
    }
    const opts = [...ref.current.querySelectorAll('[role="option"]')];
    const i = opts.indexOf(document.activeElement);
    const next = e.key === "ArrowDown" ? i + 1 : i - 1;
    opts[(next + opts.length) % opts.length]?.focus();
  }

  function pick(next) {
    onChange(next);
    setOpen(false);
  }

  const current = value ? getLabel(value) : allLabel;

  return (
    <div className={styles.field}>
      <span className={styles.label} aria-hidden="true">
        {label}:
      </span>
      <div className={styles.filter} ref={ref} data-open={open} onMouseLeave={() => setOpen(false)} onKeyDown={handleKeyDown}>
        <button
          type="button"
          className={styles.trigger}
          onClick={() => setOpen((v) => !v)}
          aria-label={`${label}: ${current}`}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          {current}
          <span className={styles.caret}>▾</span>
        </button>
        <div className={styles.menu} role="listbox">
          <button type="button" role="option" aria-selected={!value} data-active={!value} onClick={() => pick(null)}>
            {allLabel}
          </button>
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              role="option"
              aria-selected={opt === value}
              data-active={opt === value}
              onClick={() => pick(opt)}
            >
              {getLabel(opt)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
