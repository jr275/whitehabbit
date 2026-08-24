import { notFound } from "next/navigation"
import { ProductOnboardingForm } from "@/components/products/product-onboarding-form"
import { getProductBySlug } from "@/lib/products/catalog"
import { getRuntimeMode } from "@/lib/runtime-mode"

export default async function ProductOnboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const product = getProductBySlug(slug)
  if (!product) notFound()
  const runtimeMode = getRuntimeMode()
  return <ProductOnboardingForm product={product} runtimeMode={runtimeMode} />
}
