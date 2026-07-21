// iPadOS reports itself as Mac, hence the maxTouchPoints check.
export const isIOS =
  /iP(ad|hone|od)/.test(navigator.userAgent) ||
  (navigator.userAgent.includes("Mac") && navigator.maxTouchPoints > 1);
