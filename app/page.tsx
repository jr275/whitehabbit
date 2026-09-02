import { redirect } from "next/navigation"

/* Knowledge is the standalone product experience for this app, so the
 * root simply opens it. The Workforce launcher/components remain in the
 * repository and reachable by their own routes, but users are never
 * routed into a product picker. */
export default function HomePage() {
  redirect("/knowledge")
}
