import dns from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

export const REQUEST_TIMEOUT_MS = 15_000;
export const PLAYWRIGHT_IDLE_TIMEOUT_MS = 3_000;
export const MAX_REDIRECTS = 5;
export const MAX_HTML_BYTES = 2_000_000;
export const MAX_ROBOTS_BYTES = 512_000;
export const MAX_BODY_TEXT_CHARS = 100_000;
export const MAX_HTML_SAMPLE_CHARS = 20_000;
export const MAX_ITEMS_PER_SECTION = 250;

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal'
]);

const BLOCKED_EXACT_IPS = new Set([
  '169.254.169.254', // AWS/GCP/Azure-style metadata service
  '169.254.170.2',
  '168.63.129.16', // Azure platform IP
  '100.100.100.200', // Alibaba metadata service
  'fd00:ec2::254'
]);

export interface SafeAddress {
  address: string;
  family: 4 | 6;
}

export class SecurityError extends Error {
  code = 'SECURITY_BLOCKED_URL';

  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}

export function parseAndValidateHttpUrl(input: string): URL {
  let url: URL;

  try {
    url = new URL(input.trim());
  } catch {
    throw new SecurityError('Enter a valid absolute URL, including http:// or https://.');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new SecurityError('Only http:// and https:// URLs are supported.');
  }

  if (url.username || url.password) {
    throw new SecurityError('URLs with embedded credentials are not allowed.');
  }

  if (!url.hostname) {
    throw new SecurityError('The URL must include a hostname.');
  }

  return url;
}

export async function assertUrlIsSafe(input: string | URL): Promise<SafeAddress[]> {
  const url = typeof input === 'string' ? parseAndValidateHttpUrl(input) : input;
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new SecurityError('Only http:// and https:// URLs are supported.');
  }

  const hostname = normalizeHostname(url.hostname);

  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost') || hostname.endsWith('.internal')) {
    throw new SecurityError('Localhost and internal hostnames are blocked.');
  }

  const addresses = await resolveHostname(hostname);

  if (addresses.length === 0) {
    throw new SecurityError('The hostname did not resolve to a public IP address.');
  }

  for (const record of addresses) {
    assertPublicAddress(record.address);
  }

  return addresses;
}

export function assertPublicAddress(address: string): void {
  const normalizedAddress = normalizeIpAddress(address);

  if (BLOCKED_EXACT_IPS.has(normalizedAddress)) {
    throw new SecurityError('Cloud metadata service IP addresses are blocked.');
  }

  if (!ipaddr.isValid(normalizedAddress)) {
    throw new SecurityError('The hostname resolved to an invalid IP address.');
  }

  let parsed = ipaddr.parse(normalizedAddress);
  if (parsed.kind() === 'ipv6' && 'isIPv4MappedAddress' in parsed && parsed.isIPv4MappedAddress()) {
    parsed = parsed.toIPv4Address();
  }

  const range = parsed.range();
  const blockedRanges = new Set([
    'unspecified',
    'broadcast',
    'multicast',
    'linkLocal',
    'loopback',
    'private',
    'reserved',
    'carrierGradeNat',
    'uniqueLocal'
  ]);

  if (blockedRanges.has(range)) {
    throw new SecurityError(`Blocked non-public network address range: ${range}.`);
  }
}

export async function resolveHostname(hostname: string): Promise<SafeAddress[]> {
  const normalizedHostname = normalizeHostname(hostname);

  if (ipaddr.isValid(normalizedHostname)) {
    const parsed = ipaddr.parse(normalizedHostname);
    const family = parsed.kind() === 'ipv4' ? 4 : 6;
    return [{ address: normalizeIpAddress(normalizedHostname), family }];
  }

  const records = await dns.lookup(normalizedHostname, { all: true, verbatim: false });
  return records.map((record) => ({
    address: normalizeIpAddress(record.address),
    family: record.family === 6 ? 6 : 4
  }));
}

export function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
}

export function normalizeIpAddress(address: string): string {
  const cleaned = address.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
  if (!ipaddr.isValid(cleaned)) {
    return cleaned;
  }

  const parsed = ipaddr.parse(cleaned);
  if (parsed.kind() === 'ipv6' && 'isIPv4MappedAddress' in parsed && parsed.isIPv4MappedAddress()) {
    return parsed.toIPv4Address().toString();
  }

  return parsed.toString();
}

export function truncateText(input: string, maxChars = MAX_BODY_TEXT_CHARS): { text: string; truncated: boolean } {
  if (input.length <= maxChars) {
    return { text: input, truncated: false };
  }

  return { text: input.slice(0, maxChars), truncated: true };
}

export function toAbsoluteUrl(value: string | undefined, baseUrl: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, baseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}
