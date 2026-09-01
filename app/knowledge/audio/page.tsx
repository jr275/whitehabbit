import type { Metadata } from "next"
import { PageHeader } from "@/components/knowledge/page-header"
import { AudioView } from "@/components/knowledge/audio-view"

export const metadata: Metadata = {
  title: "Listen · Knowledge",
  description: "Listen to your saves like a podcast.",
}

export default function AudioPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-10">
      <PageHeader
        eyebrow="Audio"
        title="Listen"
        description="Turn your library into a queue. The system narrates articles so you can listen anywhere."
      />
      <AudioView />
    </div>
  )
}
