import { Headphones } from "lucide-react"
import { ComingSoon } from "@/components/knowledge/coming-soon"

export const metadata = {
  title: "Listen · Knowledge",
  description: "Listen to your saves like a podcast.",
}

export default function AudioPage() {
  return (
    <ComingSoon
      eyebrow="Audio"
      title="Listen to your saves like a podcast."
      description="Turn saved articles into narrated audio and play them as a queue."
      icon={Headphones}
      bullets={[
        "Text-to-speech narration of extracted article text",
        "A continuous listening queue built from your unread saves",
        "Playback speed and resume-where-you-left-off",
      ]}
    />
  )
}
