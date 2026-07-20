let _show = null;
let _hide = null;

export const show = (content = "", duration = 3000, position = "bottom") => _show?.(content, duration, position);
export const hide = () => _hide?.();

export function register(showFn, hideFn) {
  _show = showFn;
  _hide = hideFn;
  return () => { _show = null; _hide = null; };
}
