import { useEffect, useRef } from "react";
import styles from "./modal.module.css";

// Number of currently open modals; scroll unlocks only when the last one closes
let lockCount = 0;
const openModals = [];

const Modal = ({ isOpen, onClose, title, children, closeOnOverlay = false, className }) => {
  // Whether the current press started on the overlay itself (a genuine
  // backdrop click) vs. a drag that began inside the modal
  const pressedOnOverlay = useRef(false);
  const modalId = useRef(Symbol("modal"));

  // Escape closes only the topmost dialog. Listen during capture so other
  // page-level Escape shortcuts do not also run for the same key press.
  useEffect(() => {
    if (!isOpen || !onClose) return;
    const id = modalId.current;
    openModals.push(id);

    const handleKeyDown = (e) => {
      if (e.key !== "Escape" || openModals.at(-1) !== id) return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      const index = openModals.lastIndexOf(id);
      if (index !== -1) openModals.splice(index, 1);
    };
  }, [isOpen, onClose]);

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
      <div className={[styles.modal, className].filter(Boolean).join(" ")}>
        <div className={styles.header}>
          {title && <span className={styles.title}>{title}</span>}
          <button className={styles.closeButton} onClick={onClose} disabled={!onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
};

export default Modal;
