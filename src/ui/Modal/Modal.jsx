import { useEffect, useRef } from "react";
import styles from "./modal.module.css";

// Number of currently open modals; scroll unlocks only when the last one closes
let lockCount = 0;
const openModals = [];

const Modal = ({ isOpen, onClose, onSubmit, title, children, closeOnOverlay = false, className, headerActions }) => {
  // Whether the current press started on the overlay itself (a genuine
  // backdrop click) vs. a drag that began inside the modal
  const pressedOnOverlay = useRef(false);
  const modalId = useRef(Symbol("modal"));

  // The dialogs currently up, in the order they opened, so the keys below act
  // on the topmost one only. Registration depends on `isOpen` alone: the
  // handlers are inline arrows at most call sites, and re-registering whenever
  // one of those changes identity would shuffle a modal back to the top of the
  // stack on any re-render — while another modal sits above it.
  useEffect(() => {
    if (!isOpen) return;
    const id = modalId.current;
    openModals.push(id);
    return () => {
      const index = openModals.lastIndexOf(id);
      if (index !== -1) openModals.splice(index, 1);
    };
  }, [isOpen]);

  // Escape closes the topmost dialog, Cmd+Enter saves it. Listen during
  // capture so other page-level shortcuts do not also run for the same key
  // press, and so a writing area never sees the keys either.
  useEffect(() => {
    if (!isOpen) return;
    const id = modalId.current;

    const handleKeyDown = (e) => {
      // Mid-composition both keys belong to the IME — Escape drops the reading
      // being typed, Enter commits it — so neither is ours to take.
      if (e.isComposing || e.keyCode === 229) return;
      if (openModals.at(-1) !== id) return;

      let action = null;
      if (e.key === "Escape") action = onClose;
      // Plain Enter is a newline in the writing areas in here, so saving takes
      // a modifier: Cmd on a Mac, Ctrl everywhere else.
      else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) action = onSubmit;
      if (!action) return;

      e.preventDefault();
      e.stopPropagation();
      action();
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen, onClose, onSubmit]);

  // Prevent touchmove on background
  // allow scroll on textarea/input/select but prevent on the rest of the background
  useEffect(() => {
    if (!isOpen) return;
    const isScrollable = (el) => {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      const overflowY = style.overflowY;
      return (overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight;
    };
    const allowTags = ["TEXTAREA", "INPUT", "SELECT"];
    const handleTouchMove = (e) => {
      let el = e.target;
      while (el && el !== document.body) {
        if (allowTags.includes(el.tagName) || isScrollable(el)) {
          return; // allow scroll/touchmove on scrollable elements
        }
        el = el.parentElement;
      }
      e.preventDefault(); // prevent background scroll
    };
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    lockCount++;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.removeEventListener("touchmove", handleTouchMove);
      lockCount--;
      if (lockCount === 0) {
        document.body.style.overflow = "";
        document.documentElement.style.overflow = "";
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // A plain click closes on the backdrop, but `click` fires on the common
  // ancestor of the press and release — so selecting text in a field and
  // releasing outside the modal targets the overlay and would close it.
  // Require the press to have started on the overlay too.
  const handleOverlayPointerDown = (e) => {
    pressedOnOverlay.current = e.target === e.currentTarget;
  };
  const handleOverlayClick = (e) => {
    if (closeOnOverlay && e.target === e.currentTarget && pressedOnOverlay.current) {
      onClose();
    }
    pressedOnOverlay.current = false;
  };

  return (
    <div className={styles.overlay} onPointerDown={handleOverlayPointerDown} onClick={handleOverlayClick}>
      <div
        className={[styles.modal, className].filter(Boolean).join(" ")}
        role="dialog"
        aria-modal="true"
        aria-label={title || "Dialog"}
      >
        <div className={styles.header}>
          {title && <span className={styles.title}>{title}</span>}
          <div className={styles.headerRight}>
            {headerActions}
            <button className={styles.closeButton} onClick={onClose} disabled={!onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </div>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
};

export default Modal;
