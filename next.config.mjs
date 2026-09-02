import { knowledgeSecurityHeaders } from "./lib/knowledge/security-headers.ts"

/** @type {import('next').NextConfig} */
const nextConfig = {
  // NOTE: `typescript.ignoreBuildErrors` was removed deliberately.
  //
  // It was set to true, which makes `next build` print "Skipping
  // validation of types" and ship whatever compiles. Measured before
  // removing it: with a clean .next, `tsc --noEmit` reports zero errors
  // across all 240 project files both before and after a build — the
  // flag was hiding nothing and had become an escape hatch nobody
  // needed. Without it, a type error fails the build, which is the
  // point.
  //
  // If this ever needs to come back, the honest move is to fix the
  // errors or to name the exact ones being deferred — not to turn the
  // check off wholesale.
  images: {
    unoptimized: true,
  },

  // ---- Security headers — Knowledge only ------------------------------
  //
  // Applied via next.config's own headers(), not middleware. Next
  // applies these at its routing layer to every matching response
  // (page, RSC and API route alike), identically in `next dev` and on
  // Vercel — there is nothing an Edge middleware would add here, and
  // middleware.ts already exists for an unrelated reason (the /studio,
  // /outputs, /launch, /onboarding auth gate) with its own matcher that
  // does not and should not cover /knowledge. Adding a second concern
  // to that file, or a second middleware, for a plain response-header
  // set would be the wrong trade.
  //
  // Scoped to exactly Knowledge's own routes — /knowledge itself, every
  // path under it, and every Knowledge API route — not applied
  // globally. Workforce is untouched: components/ui/chart.tsx (the one
  // place in this codebase that injects an inline <style>) needs
  // 'unsafe-inline' in style-src and lives only under Workforce pages,
  // which this header set never reaches. See lib/knowledge/security-
  // headers.ts for the full, audited reasoning behind every directive.
  async headers() {
    const isProduction = process.env.NODE_ENV === "production"
    const headers = knowledgeSecurityHeaders(isProduction)
    return [
      { source: "/knowledge", headers },
      { source: "/knowledge/:path*", headers },
      { source: "/api/knowledge", headers },
      { source: "/api/knowledge/:path*", headers },
    ]
  },
}

export default nextConfig
