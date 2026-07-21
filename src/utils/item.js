import { sourceName } from "./url";

// The meta line shown under an item's name (on the card and in the detail
// modal): an optional source bracket followed by a type label. The source is
// suppressed where it would just be noise — pages carry their domain in the
// title/byline, and an app's store name IS the type label (so
// "iOS App [apps.apple.com]" is redundant).
export function itemMeta(item, t) {
  const typeLabel = item.kind && item.kind !== "app" ? t(`app.kinds.${item.kind}`) : t(`app.kinds.${item.store}`);
  const source = item.kind === "page" || item.kind === "app" ? null : sourceName(item.url);
  return source ? `[${source}] ${typeLabel}` : typeLabel;
}
