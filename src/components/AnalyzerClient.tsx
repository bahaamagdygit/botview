'use client';

import { FormEvent, useMemo, useState } from 'react';
import type {
  AnalyzeApiResponse,
  AnalyzeResult,
  ContentSnapshot,
  CrawlerMode,
  ImageItem,
  LinkItem
} from '@/lib/types';

const tabs = [
  ['overview', 'Overview'],
  ['metadata', 'Metadata'],
  ['body', 'Body Text'],
  ['headings', 'Headings'],
  ['links', 'Links'],
  ['images', 'Images'],
  ['robots', 'Robots & Indexability'],
  ['compare', 'Raw vs Rendered'],
  ['json', 'JSON Output']
] as const;

type TabId = (typeof tabs)[number][0];

const crawlerOptions: Array<{ value: CrawlerMode; label: string; note: string }> = [
  { value: 'browser', label: 'Normal browser', note: 'Desktop Chromium user agent' },
  { value: 'googlebot-smartphone', label: 'Simulated Googlebot Smartphone', note: 'Simulated only' },
  { value: 'bingbot', label: 'Simulated Bingbot', note: 'Simulated only' }
];

export default function AnalyzerClient() {
  const [url, setUrl] = useState('https://example.com/');
  const [crawlerMode, setCrawlerMode] = useState<CrawlerMode>('browser');
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const json = useMemo(() => (result ? JSON.stringify(result, null, 2) : ''), [result]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setCopied(null);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, crawlerMode })
      });
      const payload = (await response.json()) as AnalyzeApiResponse;

      if (!payload.ok) {
        setResult(null);
        setError(payload.error.message);
        return;
      }

      setResult(payload.data);
      setActiveTab('overview');
    } catch (requestError) {
      setResult(null);
      setError(requestError instanceof Error ? requestError.message : 'The analysis request failed.');
    } finally {
      setLoading(false);
    }
  }

  async function copyText(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1600);
  }

  function downloadJson() {
    if (!result) return;
    const blob = new Blob([json], { type: 'application/json' });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `botview-${new URL(result.http.finalUrl).hostname}-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-8 sm:px-6 lg:px-8">
      <section className="mb-8 overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-soft">
        <div className="grid gap-8 p-6 md:grid-cols-[1.2fr_0.8fr] md:p-10">
          <div>
            <div className="mb-4 flex items-center gap-3">
              <BotLogo className="h-11 w-11 shrink-0" />
              <div className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-800">
                BotView MVP
              </div>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-5xl">
              SEO Bot Visibility Checker
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
              Enter a URL, choose a crawler mode, then compare raw server HTML with a Playwright-rendered page. Googlebot and Bingbot modes are clearly simulated.
            </p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-bold uppercase tracking-wide text-slate-500">Security posture</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Only http/https URLs are accepted. Localhost, private networks, loopback ranges, internal hostnames, cloud metadata IPs, arbitrary headers, cookies, and bypass behavior are blocked by design.
            </p>
          </div>
        </div>
      </section>

      <form onSubmit={submit} className="mb-6 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_18rem_auto]">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">URL</span>
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://www.example.com/page"
              className="h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">Crawler mode</span>
            <select
              value={crawlerMode}
              onChange={(event) => setCrawlerMode(event.target.value as CrawlerMode)}
              className="h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            >
              {crawlerOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={loading}
            className="h-12 self-end rounded-2xl bg-slate-950 px-6 font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {loading ? 'Analyzing…' : 'Analyze URL'}
          </button>
        </div>
        {crawlerMode !== 'browser' ? (
          <p className="mt-3 text-sm font-medium text-amber-700">
            {crawlerOptions.find((option) => option.value === crawlerMode)?.label} is simulated through user-agent and viewport. It is not an official crawler verification.
          </p>
        ) : null}
      </form>

      {error ? (
        <div className="mb-6 rounded-3xl border border-red-200 bg-red-50 p-5 text-red-800">
          <p className="font-bold">Analysis failed</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      ) : null}

      {copied ? (
        <div className="fixed bottom-5 right-5 z-50 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-xl">
          Copied {copied}
        </div>
      ) : null}

      {!result ? (
        <EmptyState />
      ) : (
        <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-soft">
          <div className="border-b border-slate-200 bg-slate-50 p-3">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {tabs.map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={cn(
                    'whitespace-nowrap rounded-2xl px-4 py-2 text-sm font-bold transition',
                    activeTab === id ? 'bg-slate-950 text-white' : 'bg-white text-slate-600 hover:bg-blue-50 hover:text-blue-800'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-5 md:p-8">
            {activeTab === 'overview' ? <OverviewTab result={result} /> : null}
            {activeTab === 'metadata' ? <MetadataTab result={result} /> : null}
            {activeTab === 'body' ? <BodyTextTab result={result} onCopy={copyText} /> : null}
            {activeTab === 'headings' ? <HeadingsTab result={result} /> : null}
            {activeTab === 'links' ? <LinksTab result={result} /> : null}
            {activeTab === 'images' ? <ImagesTab result={result} /> : null}
            {activeTab === 'robots' ? <RobotsTab result={result} /> : null}
            {activeTab === 'compare' ? <CompareTab result={result} /> : null}
            {activeTab === 'json' ? <JsonTab json={json} onCopy={() => copyText(json, 'JSON')} onDownload={downloadJson} /> : null}
          </div>
        </section>
      )}

      <footer className="mt-10 flex flex-col items-center gap-2 border-t border-slate-200 pt-6 text-center">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
          <BotLogo className="h-5 w-5" />
          <span>BotView — SEO Bot Visibility Checker</span>
        </div>
        <p className="text-sm text-slate-500">
          Developed by <span className="font-bold text-slate-800">Eng. Bahaa Magdy</span>
        </p>
      </footer>
    </main>
  );
}

function BotLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#020617" />
      <rect x="16" y="22" width="32" height="24" rx="6" fill="#2563eb" />
      <circle cx="26" cy="33" r="3.5" fill="#ffffff" />
      <circle cx="38" cy="33" r="3.5" fill="#ffffff" />
      <rect x="26" y="41" width="12" height="2.5" rx="1.25" fill="#bfdbfe" />
      <line x1="32" y1="14" x2="32" y2="22" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" />
      <circle cx="32" cy="12" r="3" fill="#22c55e" />
      <line x1="13" y1="30" x2="16" y2="30" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" />
      <line x1="48" y1="30" x2="51" y2="30" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function EmptyState() {
  return (
    <section className="rounded-[2rem] border border-dashed border-slate-300 bg-white/70 p-8 text-center text-slate-500">
      <p className="font-semibold text-slate-700">No report yet</p>
      <p className="mt-2 text-sm">Run an analysis to see crawlability, metadata, rendered text, robots.txt, links, images, and indexability signals.</p>
    </section>
  );
}

function OverviewTab({ result }: { result: AnalyzeResult }) {
  const statusTone = result.indexability.probablyIndexable ? 'green' : 'red';
  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-3xl border border-slate-200 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill tone={statusTone}>{result.indexability.probablyIndexable ? 'Probably indexable' : 'Probably not indexable'}</StatusPill>
            <StatusPill tone="slate">{result.indexability.confidence} confidence</StatusPill>
            {result.crawler.simulated ? <StatusPill tone="amber">Simulated crawler</StatusPill> : null}
          </div>
          <h2 className="mt-4 text-2xl font-black text-slate-950">{result.http.finalUrl}</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            BotView makes a probability call from HTTP status, robots.txt, meta robots, X-Robots-Tag, canonical, and visible rendered content. It does not guarantee search-engine indexing.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
          <Metric label="HTTP" value={String(result.http.status)} />
          <Metric label="Redirects" value={String(result.http.redirectChain.length)} />
          <Metric label="Raw text" value={formatNumber(result.raw.bodyTextLength)} />
          <Metric label="Rendered text" value={formatNumber(result.rendered.bodyTextLength)} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ReasonCard title="Why" items={result.indexability.reasons} empty="No positive signals found." tone="green" />
        <ReasonCard title="Blockers" items={result.indexability.blockers} empty="No hard blockers detected." tone="red" />
      </div>

      <Section title="Plain-language SEO warnings">
        {result.warnings.length ? (
          <ul className="space-y-2">
            {result.warnings.map((warning) => (
              <li key={warning} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {warning}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No major warnings detected.</p>
        )}
      </Section>
    </div>
  );
}

function MetadataTab({ result }: { result: AnalyzeResult }) {
  const metadata = result.rendered.bodyTextLength > 0 ? result.rendered.metadata : result.raw.metadata;
  return (
    <div className="space-y-6">
      <Section title="Primary metadata">
        <KeyValue label="Title" value={metadata.title} />
        <KeyValue label="Meta description" value={metadata.metaDescription} />
        <KeyValue label="Canonical" value={metadata.canonical} />
        <KeyValue label="Meta robots" value={metadata.metaRobots.length ? metadata.metaRobots.map((tag) => `${tag.name}: ${tag.content}`).join(' | ') : null} />
        <KeyValue label="X-Robots-Tag" value={result.http.xRobotsTag.length ? result.http.xRobotsTag.join(' | ') : null} />
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <TagRecord title="Open Graph" record={metadata.openGraph} />
        <TagRecord title="Twitter Card" record={metadata.twitterCard} />
      </div>

      <Section title="Hreflang alternates">
        {metadata.hreflang.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr><th className="py-2 pr-4">hreflang</th><th className="py-2">href</th></tr>
              </thead>
              <tbody>
                {metadata.hreflang.map((item) => (
                  <tr key={`${item.hreflang}-${item.href}`} className="border-t border-slate-100">
                    <td className="py-2 pr-4 font-semibold">{item.hreflang}</td>
                    <td className="break-all py-2 text-slate-600">{item.href}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500">No hreflang tags found.</p>
        )}
      </Section>

      <Section title="JSON-LD structured data">
        {metadata.jsonLd.length ? (
          <div className="space-y-3">
            {metadata.jsonLd.map((item, index) => (
              <details key={`${index}-${item.raw.slice(0, 20)}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <summary className="cursor-pointer font-bold text-slate-800">
                  Block {index + 1} {item.error ? <span className="text-red-700">— invalid JSON</span> : <span className="text-green-700">— parsed</span>}
                </summary>
                {item.error ? <p className="mt-2 text-sm text-red-700">{item.error}</p> : null}
                <pre className="mt-3 max-h-96 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(item.parsed ?? item.raw, null, 2)}</pre>
              </details>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No JSON-LD blocks found.</p>
        )}
      </Section>
    </div>
  );
}

function BodyTextTab({ result, onCopy }: { result: AnalyzeResult; onCopy: (value: string, label: string) => void }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <TextPanel title="Raw HTML body text" snapshot={result.raw} onCopy={() => onCopy(result.raw.bodyText, 'raw body text')} />
      <TextPanel title="Rendered visible body text" snapshot={result.rendered} onCopy={() => onCopy(result.rendered.bodyText, 'rendered body text')} />
    </div>
  );
}

function TextPanel({ title, snapshot, onCopy }: { title: string; snapshot: ContentSnapshot; onCopy: () => void }) {
  return (
    <Section title={title} action={<button onClick={onCopy} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white">Copy body text</button>}>
      <p className="mb-3 text-sm text-slate-500">
        {formatNumber(snapshot.bodyTextLength)} characters{snapshot.bodyTextTruncated ? ' — truncated in report' : ''}
      </p>
      <textarea readOnly value={snapshot.bodyText} className="h-[32rem] w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-6 text-slate-800" />
    </Section>
  );
}

function HeadingsTab({ result }: { result: AnalyzeResult }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <HeadingSnapshot title="Raw headings" snapshot={result.raw} />
      <HeadingSnapshot title="Rendered headings" snapshot={result.rendered} />
    </div>
  );
}

function HeadingSnapshot({ title, snapshot }: { title: string; snapshot: ContentSnapshot }) {
  return (
    <Section title={title}>
      {(['h1', 'h2', 'h3'] as const).map((level) => (
        <div key={level} className="mb-5 last:mb-0">
          <h3 className="mb-2 text-sm font-black uppercase tracking-wide text-slate-500">{level.toUpperCase()} ({snapshot.headings[level].length})</h3>
          {snapshot.headings[level].length ? (
            <ol className="space-y-2">
              {snapshot.headings[level].map((heading, index) => (
                <li key={`${level}-${heading}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  {heading}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-slate-400">None found.</p>
          )}
        </div>
      ))}
    </Section>
  );
}

function LinksTab({ result }: { result: AnalyzeResult }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Internal links" value={String(result.rendered.links.filter((link) => link.internal).length)} />
        <Metric label="External links" value={String(result.rendered.links.filter((link) => link.external).length)} />
        <Metric label="Nofollow links" value={String(result.rendered.links.filter((link) => link.nofollow).length)} />
      </div>
      <LinkTable title="Rendered links" links={result.rendered.links} />
      <LinkTable title="Raw links" links={result.raw.links} />
    </div>
  );
}

function LinkTable({ title, links }: { title: string; links: LinkItem[] }) {
  return (
    <Section title={`${title} (${links.length})`}>
      {links.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr><th className="py-2 pr-4">Type</th><th className="py-2 pr-4">Rel</th><th className="py-2 pr-4">Text</th><th className="py-2">URL</th></tr>
            </thead>
            <tbody>
              {links.map((link, index) => (
                <tr key={`${link.href}-${index}`} className="border-t border-slate-100 align-top">
                  <td className="py-3 pr-4"><StatusPill tone={link.external ? 'amber' : 'blue'}>{link.external ? 'External' : 'Internal'}</StatusPill></td>
                  <td className="py-3 pr-4 text-slate-600">{link.rel.length ? link.rel.join(', ') : '—'}{link.nofollow ? <span className="ml-2 font-bold text-red-700">nofollow</span> : null}</td>
                  <td className="max-w-xs py-3 pr-4 text-slate-700">{link.text || '—'}</td>
                  <td className="break-all py-3 text-slate-600">{link.href}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-slate-500">No crawlable http/https links found.</p>
      )}
    </Section>
  );
}

function ImagesTab({ result }: { result: AnalyzeResult }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Rendered images" value={String(result.rendered.images.length)} />
        <Metric label="Missing alt" value={String(result.rendered.images.filter((image) => image.missingAlt).length)} />
        <Metric label="Raw images" value={String(result.raw.images.length)} />
      </div>
      <ImageTable title="Rendered images" images={result.rendered.images} />
      <ImageTable title="Raw images" images={result.raw.images} />
    </div>
  );
}

function ImageTable({ title, images }: { title: string; images: ImageItem[] }) {
  return (
    <Section title={`${title} (${images.length})`}>
      {images.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr><th className="py-2 pr-4">Alt status</th><th className="py-2 pr-4">Alt text</th><th className="py-2">Source</th></tr>
            </thead>
            <tbody>
              {images.map((image, index) => (
                <tr key={`${image.src}-${index}`} className="border-t border-slate-100 align-top">
                  <td className="py-3 pr-4"><StatusPill tone={image.missingAlt ? 'red' : 'green'}>{image.missingAlt ? 'Missing' : 'Present'}</StatusPill></td>
                  <td className="max-w-md py-3 pr-4 text-slate-700">{image.alt || '—'}</td>
                  <td className="break-all py-3 text-slate-600">{image.src}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-slate-500">No images found.</p>
      )}
    </Section>
  );
}

function RobotsTab({ result }: { result: AnalyzeResult }) {
  return (
    <div className="space-y-6">
      <Section title="robots.txt">
        <KeyValue label="robots.txt URL" value={result.robots.robotsUrl} />
        <KeyValue label="HTTP status" value={result.robots.status === null ? 'Unknown' : String(result.robots.status)} />
        <KeyValue label="Crawler user-agent used" value={result.robots.userAgent} />
        <KeyValue label="Allowed" value={result.robots.allowed === null ? 'Unknown' : result.robots.allowed ? 'Yes' : 'No'} />
        <KeyValue label="Crawl delay" value={result.robots.crawlDelay === null ? null : String(result.robots.crawlDelay)} />
        <KeyValue label="Sitemaps" value={result.robots.sitemaps.length ? result.robots.sitemaps.join(' | ') : null} />
        {result.robots.error ? <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm text-amber-800">{result.robots.error}</p> : null}
      </Section>
      <div className="grid gap-4 md:grid-cols-2">
        <ReasonCard title="Indexability reasons" items={result.indexability.reasons} empty="No reasons found." tone="green" />
        <ReasonCard title="Indexability blockers" items={result.indexability.blockers} empty="No blockers found." tone="red" />
      </div>
    </div>
  );
}

function CompareTab({ result }: { result: AnalyzeResult }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Raw body chars" value={formatNumber(result.comparison.rawBodyTextLength)} />
        <Metric label="Rendered body chars" value={formatNumber(result.comparison.renderedBodyTextLength)} />
        <Metric label="Added by render" value={formatNumber(result.comparison.renderedAddedCharacters)} />
        <Metric label="Rendered/raw ratio" value={result.comparison.renderedToRawRatio === null ? 'N/A' : `${result.comparison.renderedToRawRatio}×`} />
      </div>
      <Section title="Raw vs rendered signals">
        <div className="grid gap-3 md:grid-cols-3">
          <BooleanSignal label="JavaScript-dependent content" value={result.comparison.javascriptDependentContent} />
          <BooleanSignal label="Title changed" value={result.comparison.titleChanged} />
          <BooleanSignal label="Canonical changed" value={result.comparison.canonicalChanged} />
        </div>
        <ul className="mt-5 space-y-2">
          {result.comparison.notes.map((note) => (
            <li key={note} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{note}</li>
          ))}
        </ul>
      </Section>
      <Section title="Count comparison">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr><th className="py-2">Signal</th><th className="py-2">Raw</th><th className="py-2">Rendered</th></tr>
            </thead>
            <tbody>
              <CompareRow label="Links" raw={result.comparison.rawLinkCount} rendered={result.comparison.renderedLinkCount} />
              <CompareRow label="Images" raw={result.comparison.rawImageCount} rendered={result.comparison.renderedImageCount} />
              <CompareRow label="H1-H3 headings" raw={result.comparison.rawHeadingCount} rendered={result.comparison.renderedHeadingCount} />
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function JsonTab({ json, onCopy, onDownload }: { json: string; onCopy: () => void; onDownload: () => void }) {
  return (
    <Section
      title="Full JSON report"
      action={
        <div className="flex gap-2">
          <button onClick={onCopy} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white">Copy JSON</button>
          <button onClick={onDownload} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700">Download JSON</button>
        </div>
      }
    >
      <pre className="max-h-[42rem] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs leading-5 text-slate-100">{json}</pre>
    </Section>
  );
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-black text-slate-950">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid gap-2 border-t border-slate-100 py-3 first:border-t-0 md:grid-cols-[12rem_1fr]">
      <dt className="text-sm font-bold text-slate-500">{label}</dt>
      <dd className="break-words text-sm text-slate-800">{value || <span className="text-slate-400">Not found</span>}</dd>
    </div>
  );
}

function ReasonCard({ title, items, empty, tone }: { title: string; items: string[]; empty: string; tone: 'green' | 'red' }) {
  return (
    <Section title={title}>
      {items.length ? (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item} className={cn('rounded-2xl px-4 py-3 text-sm', tone === 'green' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800')}>
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">{empty}</p>
      )}
    </Section>
  );
}

function TagRecord({ title, record }: { title: string; record: Record<string, string[]> }) {
  const entries = Object.entries(record);
  return (
    <Section title={title}>
      {entries.length ? (
        <dl>
          {entries.map(([key, values]) => (
            <KeyValue key={key} label={key} value={values.join(' | ')} />
          ))}
        </dl>
      ) : (
        <p className="text-sm text-slate-500">No {title} tags found.</p>
      )}
    </Section>
  );
}

function StatusPill({ tone, children }: { tone: 'green' | 'red' | 'amber' | 'blue' | 'slate'; children: React.ReactNode }) {
  const styles = {
    green: 'bg-green-100 text-green-800',
    red: 'bg-red-100 text-red-800',
    amber: 'bg-amber-100 text-amber-800',
    blue: 'bg-blue-100 text-blue-800',
    slate: 'bg-slate-100 text-slate-700'
  }[tone];

  return <span className={cn('inline-flex rounded-full px-3 py-1 text-xs font-black', styles)}>{children}</span>;
}

function BooleanSignal({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-bold text-slate-600">{label}</p>
      <p className={cn('mt-2 text-lg font-black', value ? 'text-amber-700' : 'text-green-700')}>{value ? 'Yes' : 'No'}</p>
    </div>
  );
}

function CompareRow({ label, raw, rendered }: { label: string; raw: number; rendered: number }) {
  return (
    <tr className="border-t border-slate-100">
      <td className="py-3 font-bold text-slate-700">{label}</td>
      <td className="py-3 text-slate-600">{formatNumber(raw)}</td>
      <td className="py-3 text-slate-600">{formatNumber(rendered)}</td>
    </tr>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
