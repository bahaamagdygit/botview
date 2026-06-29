import * as cheerio from 'cheerio';
import { MAX_BODY_TEXT_CHARS, MAX_HTML_SAMPLE_CHARS, MAX_ITEMS_PER_SECTION, toAbsoluteUrl, truncateText } from './security';
import type {
  ContentSnapshot,
  HeadingsSnapshot,
  HreflangItem,
  ImageItem,
  JsonLdItem,
  LinkItem,
  MetadataSnapshot,
  MetaRobotsTag
} from './types';

export function extractContentSnapshot(html: string, baseUrl: string): ContentSnapshot {
  const $ = cheerio.load(html);
  const textDom = cheerio.load(html);
  textDom('script, style, template, noscript, svg, canvas').remove();

  const rawBodyText = normalizeWhitespace(textDom('body').text());
  const body = truncateText(rawBodyText, MAX_BODY_TEXT_CHARS);

  return {
    finalUrl: baseUrl,
    htmlLength: html.length,
    htmlSample: html.slice(0, MAX_HTML_SAMPLE_CHARS),
    bodyText: body.text,
    bodyTextLength: rawBodyText.length,
    bodyTextTruncated: body.truncated,
    metadata: extractMetadata($, baseUrl),
    headings: extractHeadings($),
    links: extractLinks($, baseUrl),
    images: extractImages($, baseUrl)
  };
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function extractMetadata($: cheerio.CheerioAPI, baseUrl: string): MetadataSnapshot {
  const openGraph: Record<string, string[]> = {};
  const twitterCard: Record<string, string[]> = {};
  const metaRobots: MetaRobotsTag[] = [];

  $('meta').each((_index, element) => {
    const name = ($(element).attr('name') || '').trim();
    const property = ($(element).attr('property') || '').trim();
    const key = (property || name).toLowerCase();
    const content = ($(element).attr('content') || '').trim();

    if (!key || !content) return;

    if (key === 'robots' || key === 'googlebot' || key === 'bingbot') {
      metaRobots.push({ name: key, content });
    }

    if (key.startsWith('og:')) {
      pushRecord(openGraph, key, content);
    }

    if (key.startsWith('twitter:')) {
      pushRecord(twitterCard, key, content);
    }
  });

  const canonical = firstLinkHref($, baseUrl, 'canonical');

  return {
    title: normalizeWhitespace($('title').first().text()) || null,
    metaDescription: firstMetaContent($, 'description'),
    metaRobots,
    canonical,
    openGraph,
    twitterCard,
    hreflang: extractHreflang($, baseUrl),
    jsonLd: extractJsonLd($)
  };
}

function firstMetaContent($: cheerio.CheerioAPI, name: string): string | null {
  const value = $(`meta[name="${name}" i]`).first().attr('content');
  return value ? normalizeWhitespace(value) : null;
}

function firstLinkHref($: cheerio.CheerioAPI, baseUrl: string, rel: string): string | null {
  const link = $(`link[rel~="${rel}" i]`).first().attr('href');
  return toAbsoluteUrl(link, baseUrl);
}

function extractHreflang($: cheerio.CheerioAPI, baseUrl: string): HreflangItem[] {
  const items: HreflangItem[] = [];
  $('link[rel~="alternate" i][hreflang]').each((_index, element) => {
    const hreflang = ($(element).attr('hreflang') || '').trim();
    const href = toAbsoluteUrl($(element).attr('href'), baseUrl);
    if (hreflang && href) {
      items.push({ hreflang, href });
    }
  });
  return items.slice(0, MAX_ITEMS_PER_SECTION);
}

function extractJsonLd($: cheerio.CheerioAPI): JsonLdItem[] {
  const items: JsonLdItem[] = [];

  $('script[type="application/ld+json" i]').each((_index, element) => {
    const raw = $(element).text().trim();
    if (!raw) return;

    try {
      items.push({ raw, parsed: JSON.parse(raw) as unknown });
    } catch (error) {
      items.push({
        raw,
        parsed: null,
        error: error instanceof Error ? error.message : 'Invalid JSON-LD'
      });
    }
  });

  return items.slice(0, 50);
}

function extractHeadings($: cheerio.CheerioAPI): HeadingsSnapshot {
  return {
    h1: extractHeadingList($, 'h1'),
    h2: extractHeadingList($, 'h2'),
    h3: extractHeadingList($, 'h3')
  };
}

function extractHeadingList($: cheerio.CheerioAPI, selector: 'h1' | 'h2' | 'h3'): string[] {
  const headings: string[] = [];
  $(selector).each((_index, element) => {
    const text = normalizeWhitespace($(element).text());
    if (text) headings.push(text);
  });
  return headings.slice(0, MAX_ITEMS_PER_SECTION);
}

function extractLinks($: cheerio.CheerioAPI, baseUrl: string): LinkItem[] {
  const base = new URL(baseUrl);
  const links: LinkItem[] = [];

  $('a[href]').each((_index, element) => {
    const href = toAbsoluteUrl($(element).attr('href'), baseUrl);
    if (!href) return;

    const rel = parseRel($(element).attr('rel'));
    const linkUrl = new URL(href);
    const internal = sameRegistrableTarget(base, linkUrl);

    links.push({
      href,
      text: normalizeWhitespace($(element).text()).slice(0, 180),
      rel,
      nofollow: rel.includes('nofollow'),
      internal,
      external: !internal
    });
  });

  return dedupeBy(links, (link) => `${link.href}|${link.text}|${link.rel.join(',')}`).slice(0, MAX_ITEMS_PER_SECTION);
}

function extractImages($: cheerio.CheerioAPI, baseUrl: string): ImageItem[] {
  const images: ImageItem[] = [];

  $('img').each((_index, element) => {
    const rawSrc = $(element).attr('src') || firstSrcFromSrcset($(element).attr('srcset'));
    const src = toAbsoluteUrl(rawSrc, baseUrl);
    if (!src) return;

    const alt = $(element).attr('alt');
    images.push({
      src,
      alt: alt ?? null,
      missingAlt: !alt || alt.trim().length === 0,
      width: $(element).attr('width') ?? null,
      height: $(element).attr('height') ?? null
    });
  });

  return dedupeBy(images, (image) => image.src).slice(0, MAX_ITEMS_PER_SECTION);
}

function firstSrcFromSrcset(srcset: string | undefined): string | undefined {
  if (!srcset) return undefined;
  const firstCandidate = srcset.split(',')[0]?.trim();
  return firstCandidate?.split(/\s+/)[0];
}

function parseRel(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/\s+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function pushRecord(target: Record<string, string[]>, key: string, value: string): void {
  target[key] = target[key] || [];
  target[key].push(value);
}

function dedupeBy<T>(items: T[], keyFactory: (item: T) => string): T[] {
  const seen = new Set<string>();
  const output: T[] = [];

  for (const item of items) {
    const key = keyFactory(item);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }

  return output;
}

function sameRegistrableTarget(a: URL, b: URL): boolean {
  return a.hostname.replace(/^www\./i, '') === b.hostname.replace(/^www\./i, '');
}
