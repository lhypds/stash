import puppeteer from "puppeteer";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const VIEWPORT = { width: 1280, height: 900 };
// Cap the capture so infinite feeds don't produce hundred-thousand-pixel images
const MAX_HEIGHT = 8000;
const IDLE_CLOSE_MS = 60000;

let browserPromise = null;
let active = 0;
let idleTimer = null;

function getBrowser() {
  if (!browserPromise) {
    // Server runs the process as root, and Chrome's sandbox refuses to start
    // under root without this flag
    browserPromise = puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    browserPromise
      .then((browser) => browser.on("disconnected", () => (browserPromise = null)))
      .catch(() => (browserPromise = null));
  }
  return browserPromise;
}

function scheduleIdleClose() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    if (active > 0 || !browserPromise) return;
    const pending = browserPromise;
    browserPromise = null;
    try {
      (await pending).close();
    } catch {
      /* already gone */
    }
  }, IDLE_CLOSE_MS);
  idleTimer.unref?.();
}

// Some app-style share pages set their title only after client-side rendering.
// Reuse the screenshot browser so analyzers can read that final document title
// without launching a separate Chrome process.
export async function readRenderedTitle(url, transientTitles = []) {
  active++;
  clearTimeout(idleTimer);
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport(VIEWPORT);
    await page.setUserAgent(UA);
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    } catch (err) {
      if (err.name !== "TimeoutError") throw err;
    }
    let initialTitle = (await page.title()).trim();
    if (!initialTitle) {
      await page.waitForFunction(() => document.title.trim().length > 0, { timeout: 10000 }).catch(() => {});
      initialTitle = (await page.title()).trim();
    }
    if (initialTitle && transientTitles.includes(initialTitle)) {
      await page
        .waitForFunction((initial) => document.title.trim().length > 0 && document.title.trim() !== initial, { timeout: 10000 }, initialTitle)
        .catch(() => {});
    }
    const title = (await page.title()).trim();
    if (!title) throw new Error("no page title");
    return { title, finalUrl: page.url() || url };
  } finally {
    await page.close().catch(() => {});
    active--;
    if (active === 0) scheduleIdleClose();
  }
}

// Scroll through the page to trigger lazy-loaded images before capturing.
// App-style pages such as ChatGPT and Doubao keep the conversation inside
// their own viewport-height scroll root, so window.scrollTo never reaches it.
async function autoScroll(page) {
  await page.evaluate(async (max) => {
    const explicit = document.querySelector("[data-scroll-root]");
    const nested =
      explicit?.scrollHeight > explicit?.clientHeight
        ? explicit
        : [...document.querySelectorAll("body *")]
            .filter((el) => {
              const overflowY = getComputedStyle(el).overflowY;
              return (overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight + 1;
            })
            .sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    const target = nested?.scrollHeight > nested?.clientHeight ? nested : document.scrollingElement;
    const step = target === document.scrollingElement ? window.innerHeight : target.clientHeight;
    for (let y = 0; y < Math.min(target.scrollHeight, max); y += step) {
      if (target === document.scrollingElement) window.scrollTo(0, y);
      else target.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    if (target === document.scrollingElement) window.scrollTo(0, 0);
    else target.scrollTo(0, 0);
  }, MAX_HEIGHT);
  await new Promise((r) => setTimeout(r, 400));
}

// Puppeteer's `fullPage` captures the document's scroll height, but app-style
// pages may keep the document at viewport height and scroll a nested element.
// Expand the explicit ChatGPT root, or otherwise the largest scroll container,
// so the browser exposes the whole conversation as normal document content.
async function expandNestedScrollRoot(page) {
  return page.evaluate((max) => {
    const explicit = document.querySelector("[data-scroll-root]");
    const useExplicit = explicit?.scrollHeight > explicit?.clientHeight;
    const root =
      useExplicit
        ? explicit
        : [...document.querySelectorAll("body *")]
            .filter((el) => {
              const overflowY = getComputedStyle(el).overflowY;
              return (overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight + 1;
            })
            .sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    if (!root || root.scrollHeight <= root.clientHeight + 1) return false;

    const height = Math.min(Math.ceil(root.scrollHeight), max);
    const position = getComputedStyle(root).position;
    if (!useExplicit && (position === "fixed" || position === "absolute")) {
      root.style.setProperty("position", "relative", "important");
      root.style.setProperty("inset", "auto", "important");
    }
    root.style.setProperty("height", `${height}px`, "important");
    root.style.setProperty("min-height", `${height}px`, "important");
    root.style.setProperty("max-height", "none", "important");
    root.style.setProperty("flex", "0 0 auto", "important");
    root.style.setProperty("overflow", "hidden", "important");

    for (let ancestor = root.parentElement; ancestor; ancestor = ancestor.parentElement) {
      ancestor.style.setProperty("height", "auto", "important");
      ancestor.style.setProperty("max-height", "none", "important");
      ancestor.style.setProperty("overflow", "visible", "important");
    }
    return true;
  }, MAX_HEIGHT);
}

export async function captureFullPage(url, filePath) {
  active++;
  clearTimeout(idleTimer);
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport(VIEWPORT);
    await page.setUserAgent(UA);
    try {
      await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    } catch (err) {
      // Pages with long-polling never go network-idle; capture what has loaded
      if (err.name !== "TimeoutError") throw err;
    }
    await autoScroll(page);
    await expandNestedScrollRoot(page);

    const height = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
    const shot = { path: filePath, type: "jpeg", quality: 82 };
    if (height > MAX_HEIGHT) {
      await page.screenshot({ ...shot, clip: { x: 0, y: 0, width: VIEWPORT.width, height: MAX_HEIGHT } });
    } else {
      await page.screenshot({ ...shot, fullPage: true });
    }
  } finally {
    await page.close().catch(() => {});
    active--;
    if (active === 0) scheduleIdleClose();
  }
}
