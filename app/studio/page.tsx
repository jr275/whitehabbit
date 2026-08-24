import { WorkerStudio } from "@/components/studio/worker-studio"
import { getRuntimeMode } from "@/lib/runtime-mode"

export default function StudioPage() {
  // computed here (a real Server Component) — WorkerStudio is a
  // Client Component and renders StudioShell directly, so the
  // server-only runtime-mode computation cannot happen inside it.
  const runtimeMode = getRuntimeMode()
  return <WorkerStudio runtimeMode={runtimeMode} />
}
