import { chromium, type Browser, type Response as PlaywrightResponse } from 'playwright';
import { assertUrlIsSafe, MAX_HTML_SAMPLE_CHARS, PLAYWRIGHT_IDLE_TIMEOUT_MS, REQUEST_TIMEOUT_MS, truncateText } from './security';
import type { CrawlerProfile, RenderSummary } from './types';

export interface RenderedPageResult {
  html: string;
  bodyText: string;
  bodyTextLength: number;
  bodyTextTruncated: boolean;
  finalUrl: string;
  summary: RenderSummary;
}

export async function renderWithPlaywright(url: string, crawler: CrawlerProfile): Promise<RenderedPageResult> {
  let browser: Browser | null = null;
  const blockedRequests: string[] = [];
  const failedRequests: string[] = [];
  let timedOut = false;
  let mainResponse: PlaywrightResponse | null = null;

  try {
    await assertUrlIsSafe(url);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: crawler.userAgent,
      viewport: crawler.viewport,
      isMobile: crawler.isMobile,
      javaScriptEnabled: true,
      ignoreHTTPSErrors: false,
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    await context.route('**/*', async (route) => {
      const requestUrl = route.request().url();
      try {
        const parsed = new URL(requestUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          blockedRequests.push(requestUrl);
          await route.abort('blockedbyclient');
          return;
        }
        await assertUrlIsSafe(parsed);
        await route.continue();
      } catch {
        blockedRequests.push(requestUrl);
        await route.abort('blockedbyclient').catch(() => undefined);
      }
    });

    const page = await context.newPage();
    page.setDefaultTimeout(REQUEST_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(REQUEST_TIMEOUT_MS);

    page.on('requestfailed', (request) => {
      const failure = request.failure();
      const line = `${request.url()}${failure ? ` — ${failure.errorText}` : ''}`;
      if (failedRequests.length < 50) failedRequests.push(line);
    });

    try {
      mainResponse = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: REQUEST_TIMEOUT_MS
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      timedOut = message.toLowerCase().includes('timeout');
      if (!timedOut) {
        throw error;
      }
    }

    try {
      await page.waitForLoadState('networkidle', { timeout: PLAYWRIGHT_IDLE_TIMEOUT_MS });
    } catch {
      // Modern pages often keep analytics or streaming requests open. A short network-idle miss is not fatal.
    }

    const html = await page.content();
    const bodyText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
    const truncatedBody = truncateText(bodyText);

    return {
      html,
      bodyText: truncatedBody.text,
      bodyTextLength: bodyText.length,
      bodyTextTruncated: truncatedBody.truncated,
      finalUrl: page.url() || url,
      summary: {
        status: mainResponse?.status() ?? null,
        finalUrl: page.url() || url,
        blockedRequests: blockedRequests.slice(0, 50),
        failedRequests: failedRequests.slice(0, 50),
        timedOut,
        error: null
      }
    };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

export function htmlSample(html: string): string {
  return html.slice(0, MAX_HTML_SAMPLE_CHARS);
}
