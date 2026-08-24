import { Suspense } from "react"
import { WorkerStudio } from "@/components/studio/worker-studio"
import { getRuntimeMode } from "@/lib/runtime-mode"

export default function StudioPage() {
  // computed here (a real Server Component) — WorkerStudio is a
  // Client Component and renders StudioShell directly, so the
  // server-only runtime-mode computation cannot happen inside it.
  const runtimeMode = getRuntimeMode()
  // WorkerStudio reads ?worker= via useSearchParams (to land on the
  // exact worker Assemble Worker just created) — Next requires that
  // behind a Suspense boundary so the shell can still prerender.
  return (
    <Suspense fallback={null}>
      <WorkerStudio runtimeMode={runtimeMode} />
    </Suspense>
  )
}
