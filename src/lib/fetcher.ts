import http from 'node:http';
import https from 'node:https';
import { TextDecoder } from 'node:util';
import {
  assertUrlIsSafe,
  MAX_HTML_BYTES,
  MAX_REDIRECTS,
  REQUEST_TIMEOUT_MS,
  normalizeHostname,
  type SafeAddress
} from './security';
import type { RedirectStep } from './types';

interface LimitedResponse {
  url: string;
  status: number;
  statusText: string;
  headers: http.IncomingHttpHeaders;
  body: string;
  bytes: number;
  truncated: boolean;
}

export interface FetchHtmlResult extends LimitedResponse {
  finalUrl: string;
  redirectChain: RedirectStep[];
}

export async function fetchHtmlWithRedirects(options: {
  url: string;
  userAgent: string;
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
}): Promise<FetchHtmlResult> {
  const maxBytes = options.maxBytes ?? MAX_HTML_BYTES;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;

  let currentUrl = new URL(options.url);
  const redirectChain: RedirectStep[] = [];

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const response = await requestOnce({
      url: currentUrl,
      userAgent: options.userAgent,
      maxBytes,
      timeoutMs
    });

    const location = getHeader(response.headers, 'location');
    const isRedirect = response.status >= 300 && response.status < 400 && Boolean(location);

    if (!isRedirect) {
      return {
        ...response,
        finalUrl: currentUrl.toString(),
        redirectChain
      };
    }

    if (redirectCount === maxRedirects) {
      throw new Error(`Too many redirects. The limit is ${maxRedirects}.`);
    }

    const nextUrl = new URL(location as string, currentUrl);
    redirectChain.push({
      from: currentUrl.toString(),
      to: nextUrl.toString(),
      status: response.status
    });
    currentUrl = nextUrl;
  }

  throw new Error(`Too many redirects. The limit is ${maxRedirects}.`);
}

async function requestOnce(options: {
  url: URL;
  userAgent: string;
  maxBytes: number;
  timeoutMs: number;
}): Promise<LimitedResponse> {
  const safeAddresses = await assertUrlIsSafe(options.url);
  const address = safeAddresses[0];
  const client = options.url.protocol === 'https:' ? https : http;
  const hostname = normalizeHostname(options.url.hostname);
  const path = `${options.url.pathname || '/'}${options.url.search}`;
  const port = options.url.port ? Number(options.url.port) : undefined;

  return new Promise((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    let bytes = 0;
    let truncated = false;
    const chunks: Buffer[] = [];

    const finish = (response: http.IncomingMessage) => {
      if (settled) return;
      settled = true;
      const body = decodeBuffer(Buffer.concat(chunks), getHeader(response.headers, 'content-type'));
      resolve({
        url: options.url.toString(),
        status: response.statusCode ?? 0,
        statusText: response.statusMessage ?? '',
        headers: response.headers,
        body,
        bytes,
        truncated
      });
    };

    const request = client.request({
      protocol: options.url.protocol,
      hostname,
      port,
      path,
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Connection: 'close',
        Host: options.url.host,
        'User-Agent': options.userAgent
      },
      timeout: options.timeoutMs,
      lookup: safeLookup(address)
    });

    request.on('timeout', () => {
      timedOut = true;
      request.destroy(new Error(`Request timed out after ${options.timeoutMs}ms.`));
    });

    request.on('error', (error) => {
      if (settled) return;
      settled = true;
      reject(timedOut ? new Error(`Request timed out after ${options.timeoutMs}ms.`) : error);
    });

    request.on('response', (response) => {
      const contentLengthHeader = getHeader(response.headers, 'content-length');
      const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null;
      const isRedirect = (response.statusCode ?? 0) >= 300 && (response.statusCode ?? 0) < 400;

      if (isRedirect) {
        response.resume();
        response.on('end', () => finish(response));
        response.on('close', () => finish(response));
        return;
      }

      if (contentLength && contentLength > options.maxBytes) {
        truncated = true;
      }

      response.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        const currentSize = chunks.reduce((total, item) => total + item.length, 0);
        const remaining = options.maxBytes - currentSize;

        if (remaining > 0) {
          chunks.push(chunk.length <= remaining ? chunk : chunk.subarray(0, remaining));
        }

        if (bytes > options.maxBytes) {
          truncated = true;
          response.destroy();
        }
      });

      response.on('end', () => finish(response));
      response.on('close', () => finish(response));
      response.on('error', (error) => {
        if (truncated) {
          finish(response);
          return;
        }
        if (!settled) {
          settled = true;
          reject(error);
        }
      });
    });

    request.end();
  });
}

function safeLookup(address: SafeAddress): http.RequestOptions['lookup'] {
  return (_hostname, _options, callback) => {
    callback(null, address.address, address.family);
  };
}

export function getHeader(headers: http.IncomingHttpHeaders, headerName: string): string | null {
  const value = headers[headerName.toLowerCase()];
  if (!value) return null;
  return Array.isArray(value) ? value.join(', ') : String(value);
}

function decodeBuffer(buffer: Buffer, contentType: string | null): string {
  const charset = contentType?.match(/charset=([^;]+)/i)?.[1]?.trim().replace(/["']/g, '') || 'utf-8';

  try {
    return new TextDecoder(charset, { fatal: false }).decode(buffer);
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  }
}
