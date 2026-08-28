import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Fraunces, Geist, Geist_Mono } from 'next/font/google'
import { AuthSessionProvider } from '@/components/auth-session-provider'
import './globals.css'

const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })
// Editorial display serif — object titles/headlines only (Object UI,
// docs/remax-knowledge-design-reference.md §1.2): pairs with Geist Sans
// for UI/body, never replaces it. The single strongest signal that
// separates "intelligence publication" from "SaaS app" identified in
// the RE/MAX Knowledge reference.
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', axes: ['opsz', 'SOFT'] })

export const metadata: Metadata = {
  title: 'Menlo Whitehabbit — Sistema Operacional de Inteligência',
  description:
    'O que o sistema sabe, o que mudou e o que fazer a seguir — uma plataforma de inteligência operacional baseada em objetos, relações e evidências.',
  generator: 'v0.app',
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#0a0b12',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} bg-background`}>
      <body className="font-sans antialiased">
        <AuthSessionProvider>{children}</AuthSessionProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
