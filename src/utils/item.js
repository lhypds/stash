import { sourceName } from "./url";

// The meta line shown under an item's name (on the card and in the detail
// modal): an optional source bracket followed by a type label. The source is
// suppressed for pages, which already carry their domain in the title/byline.
// Apps keep the source because App Store and Google Play now share one type.
export function itemMeta(item, t) {
  const typeLabel = item.kind && item.kind !== "app" ? t(`app.kinds.${item.kind}`) : t(`app.kinds.${item.store}`);
  const source = item.kind === "page" ? null : sourceName(item.url);
  return source ? `[${source}] ${typeLabel}` : typeLabel;
}
