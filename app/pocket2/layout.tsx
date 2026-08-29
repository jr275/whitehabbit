import type { Metadata, Viewport } from "next"
import { Source_Serif_4 } from "next/font/google"
import "./pocket2.css"
import { THEME_ROOT_ATTR, THEME_STORAGE_KEY } from "@/components/pocket2/theme"

/* ================================================================== *
 * POCKET2 SHELL
 *
 * Everything Pocket2 renders lives inside this [data-pocket2] element,
 * which is what scopes the design system (app/pocket2/pocket2.css)
 * away from the rest of the application. That scoping is what lets
 * Pocket2 ship a complete light+dark theme without touching the other
 * product's dark-only tokens.
 * ================================================================== */

/* The reading serif. Loaded here rather than in the root layout so the
 * other product does not pay for a font it never renders. The CSS
 * declares a real fallback stack (Charter, Iowan, Georgia) so the
 * Reader is legible before — and if — this ever fails to load. */
const readingSerif = Source_Serif_4({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-p2-serif",
  weight: ["400", "600"],
  style: ["normal", "italic"],
})

export const metadata: Metadata = {
  title: { default: "Pocket2 — Save the internet. Keep what matters.", template: "%s · Pocket2" },
  description:
    "One beautiful place to save, organize, search and revisit everything worth keeping from the web.",
}

/* The root layout pins colorScheme to dark for the other product.
 * Pocket2 supports both, so it overrides that here — nested viewport
 * exports merge over the parent's. */
export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfbf9" },
    { media: "(prefers-color-scheme: dark)", color: "#12151a" },
  ],
}

/* Runs before first paint, so a returning dark-mode user never sees a
 * white flash. Kept to the minimum that must happen synchronously:
 * read one key, stamp one attribute. Wrapped in try/catch because
 * localStorage throws outright in some privacy configurations, and a
 * theme preference must never be able to break the page. */
const NO_FLASH_SCRIPT = `
(function(){try{
  var t = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
  if (t === "light" || t === "dark") {
    document.currentScript.parentElement.setAttribute(${JSON.stringify(THEME_ROOT_ATTR)}, t);
  }
}catch(e){}})();
`

export default function Pocket2Layout({ children }: { children: React.ReactNode }) {
  return (
    <div data-pocket2 className={`${readingSerif.variable} min-h-dvh`}>
      <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
      {children}
    </div>
  )
}
