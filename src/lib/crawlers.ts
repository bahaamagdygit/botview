import type { CrawlerMode, CrawlerProfile } from './types';

export const CRAWLER_PROFILES: Record<CrawlerMode, CrawlerProfile> = {
  browser: {
    mode: 'browser',
    label: 'Normal browser',
    simulated: false,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    robotsUserAgent: '*',
    viewport: { width: 1365, height: 900 },
    isMobile: false
  },
  'googlebot-smartphone': {
    mode: 'googlebot-smartphone',
    label: 'Simulated Googlebot Smartphone',
    simulated: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    robotsUserAgent: 'Googlebot',
    viewport: { width: 412, height: 915 },
    isMobile: true
  },
  bingbot: {
    mode: 'bingbot',
    label: 'Simulated Bingbot',
    simulated: true,
    userAgent: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    robotsUserAgent: 'bingbot',
    viewport: { width: 1365, height: 900 },
    isMobile: false
  }
};
