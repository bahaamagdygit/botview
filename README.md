# BotView — SEO Bot Visibility Checker

BotView is a production-minded MVP web app that checks what a crawler can see on a URL. It fetches raw server HTML, renders the page with Playwright, compares raw vs rendered content, evaluates robots/indexability signals, and presents a plain-language SEO report.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Node.js runtime route handler at `/api/analyze`
- Playwright for JavaScript rendering
- Cheerio for HTML extraction
- robots-parser for robots.txt evaluation
- zod for request validation
- ipaddr.js for SSRF-oriented IP classification

## Features

- Fetches raw server HTML with redirect tracking.
- Renders the final page with Playwright.
- Supports crawler modes:
  - Normal browser
  - Simulated Googlebot Smartphone
  - Simulated Bingbot
- Extracts:
  - HTTP status
  - Redirect chain
  - Final URL
  - Title
  - Meta description
  - Meta robots
  - X-Robots-Tag
  - Canonical
  - Open Graph tags
  - Twitter Card tags
  - hreflang
  - JSON-LD structured data
  - H1/H2/H3 headings
  - Raw body text
  - Rendered visible body text
  - Internal links
  - External links
  - Nofollow links
  - Images and missing alt text
- Checks robots.txt and whether the selected crawler user-agent is allowed.
- Compares raw HTML vs rendered HTML.
- Flags likely JavaScript-dependent content.
- Produces a likely-indexable decision with reasons and blockers.
- Provides plain-language SEO warnings.
- Includes UI actions:
  - Copy JSON
  - Download JSON
  - Copy raw/rendered body text

## Getting started

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

`npm install` runs `playwright install chromium` through the `postinstall` script. If your network blocks Playwright's browser download, run this manually after dependency installation:

```bash
npx playwright install chromium
```

Optional checks:

```bash
npm run typecheck
npm run build
npm run start
```

## API usage

### `POST /api/analyze`

Request body:

```json
{
  "url": "https://example.com/",
  "crawlerMode": "googlebot-smartphone"
}
```

Valid `crawlerMode` values:

- `browser`
- `googlebot-smartphone`
- `bingbot`

Successful response:

```json
{
  "ok": true,
  "data": {
    "requestedUrl": "https://example.com/",
    "crawler": {
      "label": "Simulated Googlebot Smartphone"
    },
    "indexability": {
      "probablyIndexable": true,
      "confidence": "high",
      "reasons": [],
      "blockers": []
    }
  }
}
```

Error response:

```json
{
  "ok": false,
  "error": {
    "code": "SECURITY_BLOCKED_URL",
    "message": "Localhost and internal hostnames are blocked."
  }
}
```

## Security notes

BotView is intentionally conservative.

Implemented safeguards:

- Accepts only `http://` and `https://` URLs.
- Blocks embedded URL credentials.
- Blocks localhost and `.localhost` hostnames.
- Blocks `.internal` hostnames.
- Blocks cloud metadata hostnames such as `metadata.google.internal`.
- Resolves hostnames and blocks private, loopback, link-local, multicast, reserved, carrier-grade NAT, unique-local, and cloud metadata IP ranges using `ipaddr.js`.
- Uses a fixed allowlisted set of request headers.
- Does not forward user cookies.
- Does not accept arbitrary user-supplied headers.
- Limits redirects.
- Adds request timeouts.
- Limits raw response size.
- Applies SSRF checks to raw fetches, robots.txt fetches, and Playwright-routed network requests.
- Does not solve CAPTCHA, bypass Cloudflare, access paywalls, submit login forms, or evade bot protections.

Production deployment recommendation: keep these app-level controls, then also enforce outbound network egress controls at the infrastructure layer. Browser automation can have edge cases, and network-level deny rules are the right last line of defense.

## Crawler mode limitations

Googlebot and Bingbot modes are simulations. The app sets user-agent and viewport only. It does not prove that the request came from Google or Bing, and it does not reproduce every internal search-engine rendering or indexing decision.

The indexability verdict is a probability call, not a guarantee. Search engines may choose not to index a page for reasons outside this report, including quality, duplication, spam systems, canonical clustering, crawl budget, rendering delays, or site-level signals.

## Response-size and extraction limitations

- Raw HTML is capped at 2 MB.
- robots.txt is capped at 512 KB.
- Body text returned in JSON is capped at 100,000 characters per snapshot.
- Link, image, heading, hreflang, and JSON-LD lists are capped to keep the API response usable.
- Cheerio raw extraction cannot compute CSS visibility. Rendered extraction uses browser `innerText`, which is closer to visible text.
- Some sites block automation or require user interaction. BotView reports the failure rather than bypassing it.

## Project structure

```text
src/app/page.tsx                 UI entry
src/app/api/analyze/route.ts     API route handler
src/components/AnalyzerClient.tsx
src/lib/analyzer.ts              Orchestration, robots, indexability, warnings
src/lib/fetcher.ts               Raw fetch with redirect/size/timeout controls
src/lib/render.ts                Playwright render with request blocking
src/lib/extract.ts               Cheerio metadata/content extraction
src/lib/security.ts              URL, DNS, IP, SSRF protections
src/lib/types.ts                 Shared TypeScript types
```

## Practical roadmap after MVP

- Add persistent report history.
- Add HTML diff highlighting instead of count-based comparison only.
- Add sitemap discovery and URL inspection batches.
- Add Lighthouse-style performance context.
- Add allowlisted outbound proxy or worker isolation for hardened multi-tenant deployments.
- Add authentication and rate limiting before public launch.
