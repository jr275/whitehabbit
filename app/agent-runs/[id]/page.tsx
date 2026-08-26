import { AgentRunDetail } from "@/components/agent-runs/agent-run-detail"

export default async function AgentRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <AgentRunDetail id={id} />
}
