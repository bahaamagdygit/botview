import robotsParser from 'robots-parser';
import { CRAWLER_PROFILES } from './crawlers';
import { extractContentSnapshot } from './extract';
import { fetchHtmlWithRedirects, getHeader } from './fetcher';
import { renderWithPlaywright } from './render';
import {
  MAX_HTML_BYTES,
  MAX_ROBOTS_BYTES,
  REQUEST_TIMEOUT_MS,
  assertUrlIsSafe,
  parseAndValidateHttpUrl,
  truncateText
} from './security';
import type {
  AnalyzeRequestBody,
  AnalyzeResult,
  ComparisonSummary,
  ContentSnapshot,
  CrawlerProfile,
  IndexabilitySummary,
  MetaRobotsTag,
  RenderSummary,
  RobotsSummary
} from './types';

export async function analyzeUrl(input: AnalyzeRequestBody): Promise<AnalyzeResult> {
  const requestedUrl = parseAndValidateHttpUrl(input.url);
  await assertUrlIsSafe(requestedUrl);

  const crawler = CRAWLER_PROFILES[input.crawlerMode];
  const rawFetch = await fetchHtmlWithRedirects({
    url: requestedUrl.toString(),
    userAgent: crawler.userAgent,
    maxBytes: MAX_HTML_BYTES,
    timeoutMs: REQUEST_TIMEOUT_MS
  });

  const xRobotsTag = splitHeaderDirectives(getHeader(rawFetch.headers, 'x-robots-tag'));
  const rawSnapshot = extractContentSnapshot(rawFetch.body, rawFetch.finalUrl);
  const robots = await checkRobots(rawFetch.finalUrl, crawler);

  let renderedSnapshot: ContentSnapshot;
  let renderSummary: RenderSummary;

  try {
    const rendered = await renderWithPlaywright(rawFetch.finalUrl, crawler);
    renderedSnapshot = extractContentSnapshot(rendered.html, rendered.finalUrl);
    renderedSnapshot = {
      ...renderedSnapshot,
      bodyText: rendered.bodyText,
      bodyTextLength: rendered.bodyTextLength,
      bodyTextTruncated: rendered.bodyTextTruncated
    };
    renderSummary = rendered.summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    renderedSnapshot = emptyRenderedSnapshot(rawFetch.finalUrl);
    renderSummary = {
      status: null,
      finalUrl: rawFetch.finalUrl,
      blockedRequests: [],
      failedRequests: [],
      timedOut: false,
      error: message
    };
  }

  const comparison = compareSnapshots(rawSnapshot, renderedSnapshot, Boolean(renderSummary.error));
  const indexability = decideIndexability({
    status: rawFetch.status,
    robots,
    raw: rawSnapshot,
    rendered: renderedSnapshot,
    xRobotsTag,
    crawler
  });
  const warnings = buildWarnings({
    crawler,
    raw: rawSnapshot,
    rendered: renderedSnapshot,
    comparison,
    indexability,
    robots,
    xRobotsTag,
    status: rawFetch.status,
    rawHtmlTruncated: rawFetch.truncated,
    renderSummary
  });

  return {
    requestedUrl: requestedUrl.toString(),
    fetchedAt: new Date().toISOString(),
    crawler,
    http: {
      status: rawFetch.status,
      statusText: rawFetch.statusText,
      finalUrl: rawFetch.finalUrl,
      redirectChain: rawFetch.redirectChain,
      contentType: getHeader(rawFetch.headers, 'content-type'),
      xRobotsTag,
      rawHtmlBytes: rawFetch.bytes,
      rawHtmlTruncated: rawFetch.truncated
    },
    robots,
    render: renderSummary,
    raw: rawSnapshot,
    rendered: renderedSnapshot,
    comparison,
    indexability,
    warnings,
    limitations: [
      'Googlebot and Bingbot modes are simulations based on user-agent and viewport; they are not verified search-engine crawler identities.',
      'BotView does not solve CAPTCHAs, bypass Cloudflare challenges, access paywalled content, use login cookies, or forward user-supplied headers.',
      'JavaScript rendering is a best-effort Chromium render and may differ from how a search engine schedules rendering.',
      'Network SSRF checks are applied in the app. For high-risk deployments, also enforce outbound egress controls at the network layer.'
    ]
  };
}

async function checkRobots(finalUrl: string, crawler: CrawlerProfile): Promise<RobotsSummary> {
  const pageUrl = new URL(finalUrl);
  const robotsUrl = `${pageUrl.origin}/robots.txt`;

  try {
    const response = await fetchHtmlWithRedirects({
      url: robotsUrl,
      userAgent: crawler.userAgent,
      maxBytes: MAX_ROBOTS_BYTES,
      timeoutMs: REQUEST_TIMEOUT_MS,
      maxRedirects: 3
    });

    if (response.status === 404 || response.status === 410) {
      return {
        robotsUrl,
        status: response.status,
        exists: false,
        allowed: true,
        userAgent: crawler.robotsUserAgent,
        crawlDelay: null,
        sitemaps: [],
        error: null
      };
    }

    if (response.status < 200 || response.status >= 300) {
      return {
        robotsUrl,
        status: response.status,
        exists: false,
        allowed: null,
        userAgent: crawler.robotsUserAgent,
        crawlDelay: null,
        sitemaps: [],
        error: `robots.txt returned HTTP ${response.status}.`
      };
    }

    const parser = robotsParser(robotsUrl, response.body);
    const isAllowed = parser.isAllowed(finalUrl, crawler.robotsUserAgent);
    const crawlDelay = parser.getCrawlDelay(crawler.robotsUserAgent);

    return {
      robotsUrl,
      status: response.status,
      exists: true,
      allowed: isAllowed !== false,
      userAgent: crawler.robotsUserAgent,
      crawlDelay: typeof crawlDelay === 'number' ? crawlDelay : null,
      sitemaps: parser.getSitemaps() || [],
      error: null
    };
  } catch (error) {
    return {
      robotsUrl,
      status: null,
      exists: false,
      allowed: null,
      userAgent: crawler.robotsUserAgent,
      crawlDelay: null,
      sitemaps: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function compareSnapshots(raw: ContentSnapshot, rendered: ContentSnapshot, renderFailed: boolean): ComparisonSummary {
  const rawHeadingCount = headingCount(raw);
  const renderedHeadingCount = headingCount(rendered);
  const renderedAddedCharacters = Math.max(rendered.bodyTextLength - raw.bodyTextLength, 0);
  const renderedToRawRatio = raw.bodyTextLength > 0 ? Number((rendered.bodyTextLength / raw.bodyTextLength).toFixed(2)) : null;
  const notes: string[] = [];

  const javascriptDependentContent = !renderFailed && (
    (renderedAddedCharacters > 500 && (renderedToRawRatio ?? 0) > 1.2) ||
    (raw.bodyTextLength < 150 && rendered.bodyTextLength > 500) ||
    (rawHeadingCount === 0 && renderedHeadingCount > 0) ||
    (rendered.links.length - raw.links.length > 20)
  );

  if (renderFailed) {
    notes.push('Rendering failed, so raw-vs-rendered comparison is incomplete.');
  } else if (javascriptDependentContent) {
    notes.push('A meaningful amount of visible content appears only after JavaScript rendering.');
  } else {
    notes.push('Raw and rendered content are broadly similar by text, heading, and link counts.');
  }

  if (raw.metadata.title !== rendered.metadata.title) {
    notes.push('The title differs between raw HTML and rendered HTML.');
  }

  if (raw.metadata.canonical !== rendered.metadata.canonical) {
    notes.push('The canonical URL differs between raw HTML and rendered HTML.');
  }

  return {
    rawBodyTextLength: raw.bodyTextLength,
    renderedBodyTextLength: rendered.bodyTextLength,
    renderedAddedCharacters,
    renderedToRawRatio,
    rawLinkCount: raw.links.length,
    renderedLinkCount: rendered.links.length,
    rawImageCount: raw.images.length,
    renderedImageCount: rendered.images.length,
    rawHeadingCount,
    renderedHeadingCount,
    titleChanged: raw.metadata.title !== rendered.metadata.title,
    metaDescriptionChanged: raw.metadata.metaDescription !== rendered.metadata.metaDescription,
    canonicalChanged: raw.metadata.canonical !== rendered.metadata.canonical,
    javascriptDependentContent,
    notes
  };
}

function decideIndexability(options: {
  status: number;
  robots: RobotsSummary;
  raw: ContentSnapshot;
  rendered: ContentSnapshot;
  xRobotsTag: string[];
  crawler: CrawlerProfile;
}): IndexabilitySummary {
  const blockers: string[] = [];
  const reasons: string[] = [];
  const effectiveSnapshot = options.rendered.bodyTextLength > 0 ? options.rendered : options.raw;

  if (options.status !== 200) {
    blockers.push(`The raw server response is HTTP ${options.status}, not HTTP 200.`);
  } else {
    reasons.push('The raw server response returned HTTP 200.');
  }

  if (options.robots.allowed === false) {
    blockers.push(`robots.txt disallows ${options.robots.userAgent} from crawling this URL.`);
  } else if (options.robots.allowed === true) {
    reasons.push(`robots.txt allows ${options.robots.userAgent} to crawl this URL.`);
  } else {
    reasons.push('robots.txt could not be conclusively evaluated, so this check has lower confidence.');
  }

  const metaNoindex = metaRobotsHasDirective(effectiveSnapshot.metadata.metaRobots, options.crawler, 'noindex');
  const xRobotsNoindex = xRobotsHasDirective(options.xRobotsTag, options.crawler, 'noindex');

  if (metaNoindex) {
    blockers.push('A matching meta robots tag contains noindex.');
  } else {
    reasons.push('No matching meta robots noindex directive was found.');
  }

  if (xRobotsNoindex) {
    blockers.push('The X-Robots-Tag header contains noindex for this crawler.');
  } else {
    reasons.push('No matching X-Robots-Tag noindex directive was found.');
  }

  const canonical = effectiveSnapshot.metadata.canonical;
  if (canonical && !sameUrlIgnoringHash(canonical, effectiveSnapshot.finalUrl)) {
    blockers.push(`The canonical URL points to a different URL: ${canonical}`);
  } else if (canonical) {
    reasons.push('The canonical URL is self-referencing.');
  } else {
    reasons.push('No canonical tag was found. This is not a hard blocker, but it weakens canonicalization signals.');
  }

  if (effectiveSnapshot.bodyTextLength < 80) {
    reasons.push('Very little visible body text was detected. That is not a strict indexing blocker, but it lowers confidence.');
  }

  const hardBlockers = blockers.filter((blocker) => !blocker.startsWith('The canonical URL points'));
  const probablyIndexable = blockers.length === 0;
  const confidence = hardBlockers.length > 0 ? 'high' : blockers.length > 0 ? 'medium' : options.robots.allowed === null ? 'medium' : 'high';

  return {
    probablyIndexable,
    confidence,
    reasons,
    blockers
  };
}

function buildWarnings(options: {
  crawler: CrawlerProfile;
  raw: ContentSnapshot;
  rendered: ContentSnapshot;
  comparison: ComparisonSummary;
  indexability: IndexabilitySummary;
  robots: RobotsSummary;
  xRobotsTag: string[];
  status: number;
  rawHtmlTruncated: boolean;
  renderSummary: RenderSummary;
}): string[] {
  const warnings: string[] = [];
  const effectiveSnapshot = options.rendered.bodyTextLength > 0 ? options.rendered : options.raw;

  if (options.crawler.simulated) {
    warnings.push(`${options.crawler.label} is simulated. This app does not verify itself as an official crawler.`);
  }

  if (options.status !== 200) {
    warnings.push(`Search engines may not index this page normally because the raw HTTP status is ${options.status}.`);
  }

  if (options.renderSummary.error) {
    warnings.push(`JavaScript rendering failed: ${options.renderSummary.error}`);
  }

  if (options.renderSummary.timedOut) {
    warnings.push('Rendering timed out before the page reached a stable loaded state. Results may be partial.');
  }

  if (options.rawHtmlTruncated) {
    warnings.push('The raw HTML response hit the response-size limit, so extraction may be incomplete.');
  }

  if (options.robots.error) {
    warnings.push(`robots.txt could not be fully evaluated: ${options.robots.error}`);
  }

  if (options.robots.allowed === false) {
    warnings.push(`robots.txt blocks ${options.robots.userAgent}; the crawler may not be able to see the page content.`);
  }

  if (metaRobotsHasDirective(effectiveSnapshot.metadata.metaRobots, options.crawler, 'noindex')) {
    warnings.push('Meta robots includes noindex for the selected crawler.');
  }

  if (xRobotsHasDirective(options.xRobotsTag, options.crawler, 'noindex')) {
    warnings.push('X-Robots-Tag includes noindex for the selected crawler.');
  }

  if (!effectiveSnapshot.metadata.title) {
    warnings.push('No title tag was found.');
  } else if (effectiveSnapshot.metadata.title.length > 65) {
    warnings.push('The title tag is long and may be truncated in search results.');
  }

  if (!effectiveSnapshot.metadata.metaDescription) {
    warnings.push('No meta description was found.');
  } else if (effectiveSnapshot.metadata.metaDescription.length > 170) {
    warnings.push('The meta description is long and may be truncated in search results.');
  }

  if (effectiveSnapshot.headings.h1.length === 0) {
    warnings.push('No H1 heading was found.');
  } else if (effectiveSnapshot.headings.h1.length > 1) {
    warnings.push(`Multiple H1 headings were found (${effectiveSnapshot.headings.h1.length}).`);
  }

  if (!effectiveSnapshot.metadata.canonical) {
    warnings.push('No canonical tag was found.');
  } else if (!sameUrlIgnoringHash(effectiveSnapshot.metadata.canonical, effectiveSnapshot.finalUrl)) {
    warnings.push(`Canonical points to a different URL: ${effectiveSnapshot.metadata.canonical}`);
  }

  const missingAltCount = effectiveSnapshot.images.filter((image) => image.missingAlt).length;
  if (missingAltCount > 0) {
    warnings.push(`${missingAltCount} image${missingAltCount === 1 ? '' : 's'} have missing or empty alt text.`);
  }

  const invalidJsonLd = effectiveSnapshot.metadata.jsonLd.filter((item) => item.error).length;
  if (invalidJsonLd > 0) {
    warnings.push(`${invalidJsonLd} JSON-LD block${invalidJsonLd === 1 ? '' : 's'} could not be parsed.`);
  }

  if (options.comparison.javascriptDependentContent) {
    warnings.push('Important visible content appears to depend on JavaScript rendering. Make sure search engines can render it reliably.');
  }

  if (options.renderSummary.blockedRequests.length > 0) {
    warnings.push(`${options.renderSummary.blockedRequests.length} render request${options.renderSummary.blockedRequests.length === 1 ? '' : 's'} were blocked by SSRF protections or non-http protocols.`);
  }

  if (!options.indexability.probablyIndexable) {
    warnings.push(`Likely not indexable: ${options.indexability.blockers.join(' ')}`);
  }

  return Array.from(new Set(warnings));
}

function headingCount(snapshot: ContentSnapshot): number {
  return snapshot.headings.h1.length + snapshot.headings.h2.length + snapshot.headings.h3.length;
}

function splitHeaderDirectives(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(/\n|,(?=\s*[a-z0-9_-]+\s*:)/i)
    .map((item) => item.trim())
    .filter(Boolean);
}

function metaRobotsHasDirective(tags: MetaRobotsTag[], crawler: CrawlerProfile, directive: string): boolean {
  const names = metaRobotsNamesForCrawler(crawler);
  return tags.some((tag) => names.includes(tag.name.toLowerCase()) && directiveList(tag.content).includes(directive));
}

function xRobotsHasDirective(headers: string[], crawler: CrawlerProfile, directive: string): boolean {
  const crawlerNames = xRobotsNamesForCrawler(crawler);

  for (const header of headers) {
    let scope = '*';
    const parts = header.split(',');

    for (const part of parts) {
      const trimmed = part.trim().toLowerCase();
      if (!trimmed) continue;

      const scoped = trimmed.match(/^([a-z0-9_-]+)\s*:\s*(.+)$/);
      let directiveText = trimmed;

      if (scoped) {
        scope = scoped[1];
        directiveText = scoped[2];
      }

      const applies = scope === '*' || crawlerNames.includes(scope);
      if (applies && directiveList(directiveText).includes(directive)) {
        return true;
      }
    }
  }

  return false;
}

function directiveList(content: string): string[] {
  return content
    .toLowerCase()
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function metaRobotsNamesForCrawler(crawler: CrawlerProfile): string[] {
  if (crawler.mode === 'googlebot-smartphone') return ['robots', 'googlebot'];
  if (crawler.mode === 'bingbot') return ['robots', 'bingbot'];
  return ['robots'];
}

function xRobotsNamesForCrawler(crawler: CrawlerProfile): string[] {
  if (crawler.mode === 'googlebot-smartphone') return ['googlebot'];
  if (crawler.mode === 'bingbot') return ['bingbot'];
  return ['*', 'botview'];
}

function sameUrlIgnoringHash(a: string, b: string): boolean {
  try {
    const left = new URL(a);
    const right = new URL(b);
    left.hash = '';
    right.hash = '';
    return left.toString() === right.toString();
  } catch {
    return a === b;
  }
}

function emptyRenderedSnapshot(finalUrl: string): ContentSnapshot {
  const body = truncateText('');
  return {
    finalUrl,
    htmlLength: 0,
    htmlSample: '',
    bodyText: body.text,
    bodyTextLength: 0,
    bodyTextTruncated: body.truncated,
    metadata: {
      title: null,
      metaDescription: null,
      metaRobots: [],
      canonical: null,
      openGraph: {},
      twitterCard: {},
      hreflang: [],
      jsonLd: []
    },
    headings: { h1: [], h2: [], h3: [] },
    links: [],
    images: []
  };
}
