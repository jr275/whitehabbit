import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { connection } from 'next/server'
import { Geist, Geist_Mono } from 'next/font/google'
import { AuthSessionProvider } from '@/components/auth-session-provider'
import './globals.css'

const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })

export const metadata: Metadata = {
  title: 'Menlo Whitehabbit — AI Agent Factory',
  description:
    'Build, deploy, and operate an AI workforce from one observable operating layer.',
  generator: 'v0.app',
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#0a0b12',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // EVERY PAGE RENDERS PER REQUEST — a requirement of the
  // Content-Security-Policy in proxy.ts, not a preference. That policy
  // authorises scripts by a per-request nonce, and Next can only stamp
  // a nonce onto markup it generates while a request exists. A page
  // built ahead of any request ships <script> tags with no nonce, and
  // a strict policy blocks every one of them: the page loads and then
  // does nothing.
  //
  // `export const dynamic = "force-dynamic"` is NOT enough on this
  // version — measured, not assumed: with it, responses still came
  // back x-nextjs-prerender and their scripts still had no nonce,
  // because Next serves a prerendered SHELL. connection() is what
  // actually waits for the request.
  //
  // The cost was measured before committing to it: these are
  // authenticated shells that fetch their data client-side, so
  // prerendering was saving a render of markup containing no data —
  // single-digit milliseconds, against a policy that decides whether
  // an injected script can execute at all.
  //
  // Removing this line breaks the CSP silently rather than breaking
  // the build, which is why it is here with its reason attached.
  await connection()

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} bg-background`}>
      <body className="font-sans antialiased">
        <AuthSessionProvider>{children}</AuthSessionProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
