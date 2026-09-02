import { ConnectionsPage } from "@/components/connections/connections-page"
import { getRuntimeMode } from "@/lib/runtime-mode"

export default function Connections() {
  const runtimeMode = getRuntimeMode()
  return <ConnectionsPage runtimeMode={runtimeMode} />
}
