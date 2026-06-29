import { NextResponse } from 'next/server';
import { z } from 'zod';
import { analyzeUrl } from '@/lib/analyzer';
import { SecurityError } from '@/lib/security';
import { CRAWLER_MODES } from '@/lib/types';
import type { AnalyzeApiResponse } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const analyzeSchema = z.object({
  url: z.string().trim().min(1, 'URL is required').max(2048, 'URL is too long'),
  crawlerMode: z.enum(CRAWLER_MODES).default('browser')
});

export async function POST(request: Request): Promise<NextResponse<AnalyzeApiResponse>> {
  try {
    const body = await request.json().catch(() => null);
    const parsed = analyzeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'The request body is invalid.',
            details: parsed.error.flatten()
          }
        },
        { status: 400 }
      );
    }

    const data = await analyzeUrl(parsed.data);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const isSecurityError = error instanceof SecurityError;
    const message = error instanceof Error ? error.message : 'Unexpected analysis failure.';

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: isSecurityError ? error.code : 'ANALYSIS_FAILED',
          message
        }
      },
      { status: isSecurityError ? 400 : 500 }
    );
  }
}

export function GET(): NextResponse<AnalyzeApiResponse> {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Use POST with JSON: { "url": "https://example.com", "crawlerMode": "browser" }.'
      }
    },
    { status: 405 }
  );
}
