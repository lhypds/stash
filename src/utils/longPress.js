import { useEffect, useRef } from "react";

// How long a press is held before it counts as a long press, and how far the
// pointer may drift meanwhile — a finger that slides off to scroll the page was
// never really pressing the button.
const HOLD_MS = 500;
const DRIFT_PX = 10;

// Press-and-hold as a second gesture on a button: the touch counterpart of an
// Option-click, which a phone has no way to express. The long press fires while
// the finger is still down, so the gesture visibly lands before the release,
// and the click that the release produces is then swallowed — otherwise the
// button's plain action would run on top of it.
export function useLongPress({ onClick, onLongPress }) {
  const timer = useRef(null);
  const origin = useRef(null);
  const fired = useRef(false);

  useEffect(() => () => clearTimeout(timer.current), []);

  function cancel() {
    clearTimeout(timer.current);
    timer.current = null;
  }

  return {
    onPointerDown: (e) => {
      // Only a primary press arms the hold; a right-click is the browser's
      if (!onLongPress || e.button > 0) return;
      cancel();
      fired.current = false;
      origin.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => {
        fired.current = true;
        onLongPress();
      }, HOLD_MS);
    },
    onPointerMove: (e) => {
      if (!timer.current) return;
      if (Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) > DRIFT_PX) cancel();
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    // A press held on a touch screen otherwise raises the selection callout or
    // context menu over the dialog it just opened.
    onContextMenu: (e) => e.preventDefault(),
    onClick: (e) => {
      if (fired.current) {
        fired.current = false;
        e.stopPropagation();
        return;
      }
      onClick?.(e);
    },
  };
}
