declare module 'robots-parser' {
  export interface RobotsParserInstance {
    isAllowed(url: string, userAgent?: string): boolean | undefined;
    getSitemaps(): string[];
    getCrawlDelay(userAgent?: string): number | undefined;
  }

  export default function robotsParser(url: string, contents: string): RobotsParserInstance;
}
