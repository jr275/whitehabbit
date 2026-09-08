/**
 * Harbor SEO OAuth Callback Handler
 * Processes the callback from Harbor SEO after user authorization
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToHarbor } from '@/lib/harbor';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Handle error responses from Harbor
    if (error) {
      console.error('Harbor OAuth error:', error);
      return NextResponse.redirect(
        new URL(`/harbor/connect?error=${encodeURIComponent(error)}`, request.url)
      );
    }

    if (!code) {
      return NextResponse.redirect(
        new URL('/harbor/connect?error=missing_code', request.url)
      );
    }

    // Exchange code for access token and connect to Harbor
    const result = await connectToHarbor({
      apiKey: code,
    });

    if (result.success) {
      // Store connection info in session/cookie if needed
      const response = NextResponse.redirect(
        new URL('/harbor/connected', request.url)
      );
      
      // Optionally set a cookie to track connected state
      response.cookies.set('harbor_connected', 'true', {
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60, // 7 days
      });

      return response;
    } else {
      return NextResponse.redirect(
        new URL(
          `/harbor/connect?error=${encodeURIComponent(result.error || 'connection_failed')}`,
          request.url
        )
      );
    }
  } catch (error) {
    console.error('Harbor callback error:', error);
    return NextResponse.redirect(
      new URL(
        `/harbor/connect?error=${encodeURIComponent('internal_error')}`,
        request.url
      )
    );
  }
}
