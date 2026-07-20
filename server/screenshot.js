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

// Scroll through the page to trigger lazy-loaded images before capturing
async function autoScroll(page) {
  await page.evaluate(async (max) => {
    const step = window.innerHeight;
    for (let y = 0; y < Math.min(document.body.scrollHeight, max); y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  }, MAX_HEIGHT);
  await new Promise((r) => setTimeout(r, 400));
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
