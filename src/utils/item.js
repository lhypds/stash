import { sourceName } from "./url";

// The name to show for an item. Two kinds can be nameless: a note stashed as an
// image with no text at all, which falls back to a plain "Image"; and a video
// whose author gave it no caption, which shows no title at all — its thumbnail
// and type line already say what it is, so a stand-in would only add noise.
// Resolved here rather than stored so the label follows the viewer's language,
// the way every other generated label in the app does.
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
