export const CRAWLER_MODES = ['browser', 'googlebot-smartphone', 'bingbot'] as const;

export type CrawlerMode = (typeof CRAWLER_MODES)[number];

export interface CrawlerProfile {
  mode: CrawlerMode;
  label: string;
  simulated: boolean;
  userAgent: string;
  robotsUserAgent: string;
  viewport: {
    width: number;
    height: number;
  };
  isMobile: boolean;
}

export interface AnalyzeRequestBody {
  url: string;
  crawlerMode: CrawlerMode;
}

export interface RedirectStep {
  from: string;
  to: string;
  status: number;
}

export interface HttpSummary {
  status: number;
  statusText: string;
  finalUrl: string;
  redirectChain: RedirectStep[];
  contentType: string | null;
  xRobotsTag: string[];
  rawHtmlBytes: number;
  rawHtmlTruncated: boolean;
}

export interface MetaRobotsTag {
  name: string;
  content: string;
}

export interface HreflangItem {
  hreflang: string;
  href: string;
}

export interface JsonLdItem {
  raw: string;
  parsed: unknown | null;
  error?: string;
}

export interface MetadataSnapshot {
  title: string | null;
  metaDescription: string | null;
  metaRobots: MetaRobotsTag[];
  canonical: string | null;
  openGraph: Record<string, string[]>;
  twitterCard: Record<string, string[]>;
  hreflang: HreflangItem[];
  jsonLd: JsonLdItem[];
}

export interface HeadingsSnapshot {
  h1: string[];
  h2: string[];
  h3: string[];
}

export interface LinkItem {
  href: string;
  text: string;
  rel: string[];
  nofollow: boolean;
  internal: boolean;
  external: boolean;
}

export interface ImageItem {
  src: string;
  alt: string | null;
  missingAlt: boolean;
  width?: string | null;
  height?: string | null;
}

export interface ContentSnapshot {
  finalUrl: string;
  htmlLength: number;
  htmlSample: string;
  bodyText: string;
  bodyTextLength: number;
  bodyTextTruncated: boolean;
  metadata: MetadataSnapshot;
  headings: HeadingsSnapshot;
  links: LinkItem[];
  images: ImageItem[];
}

export interface RenderSummary {
  status: number | null;
  finalUrl: string;
  blockedRequests: string[];
  failedRequests: string[];
  timedOut: boolean;
  error: string | null;
}

export interface RobotsSummary {
  robotsUrl: string;
  status: number | null;
  exists: boolean;
  allowed: boolean | null;
  userAgent: string;
  crawlDelay: number | null;
  sitemaps: string[];
  error: string | null;
}

export interface ComparisonSummary {
  rawBodyTextLength: number;
  renderedBodyTextLength: number;
  renderedAddedCharacters: number;
  renderedToRawRatio: number | null;
  rawLinkCount: number;
  renderedLinkCount: number;
  rawImageCount: number;
  renderedImageCount: number;
  rawHeadingCount: number;
  renderedHeadingCount: number;
  titleChanged: boolean;
  metaDescriptionChanged: boolean;
  canonicalChanged: boolean;
  javascriptDependentContent: boolean;
  notes: string[];
}

export interface IndexabilitySummary {
  probablyIndexable: boolean;
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
  blockers: string[];
}

export interface AnalyzeResult {
  requestedUrl: string;
  fetchedAt: string;
  crawler: CrawlerProfile;
  http: HttpSummary;
  robots: RobotsSummary;
  render: RenderSummary;
  raw: ContentSnapshot;
  rendered: ContentSnapshot;
  comparison: ComparisonSummary;
  indexability: IndexabilitySummary;
  warnings: string[];
  limitations: string[];
}

export type AnalyzeApiResponse =
  | { ok: true; data: AnalyzeResult }
  | { ok: false; error: { code: string; message: string; details?: unknown } };
