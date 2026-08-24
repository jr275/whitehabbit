import { ProductsHub } from "@/components/products/products-hub"
import { getRuntimeMode } from "@/lib/runtime-mode"

export default function ProductsPage() {
  const runtimeMode = getRuntimeMode()
  return <ProductsHub runtimeMode={runtimeMode} />
}
