import { sourceName } from "./url";

// The name to show for an item. Everything analyzed from a source carries its
// own name; only a note can be nameless — one stashed as an image with no text
// at all — and that falls back to a plain "Image". It's resolved here rather
// than stored so the label follows the viewer's language, the way every other
// generated label in the app does.
export function itemTitle(item, t) {
  return item.name || (item.kind === "note" ? t("app.image") : "");
}

// The meta line shown under an item's name (on the card and in the detail
// modal): an optional source bracket followed by a type label. The source is
// suppressed for pages, which already carry their domain in the title/byline,
// and for notes, which have no source at all — the author shows up as the
// byline instead. Apps keep the source because App Store and Google Play now
// share one type.
export function itemMeta(item, t) {
  const typeLabel = item.kind && item.kind !== "app" ? t(`app.kinds.${item.kind}`) : t(`app.kinds.${item.store}`);
  const source = item.kind === "page" || item.kind === "note" ? null : sourceName(item.url);
  return source ? `[${source}] ${typeLabel}` : typeLabel;
}
