import "server-only"

/* ================================================================== *
 * The LlmProvider abstraction moved to lib/ai/llm (shared platform)
 * when Knowledge also needed to call a model — see that module's
 * header for why duplicating it was the worse option.
 *
 * This file stays as the re-export Workforce code already imports, so
 * the move touched no skill and no runtime. What did NOT move is in
 * ./development.ts: its fixtures encode Workforce skill JSON shapes and
 * belong to this product, not to the platform.
 * ================================================================== */

export type {
  LlmCallDeps,
  LlmCallInput,
  LlmCallOutput,
  LlmFailureReason,
  LlmProvider,
  LlmResult,
} from "@/lib/ai/llm/types"
