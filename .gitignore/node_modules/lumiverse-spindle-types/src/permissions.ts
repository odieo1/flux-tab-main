/**
 * Gated permissions that extensions must declare in spindle.json.
 *
 * Free tier (no declaration needed): events, storage, macros, dom, variables
 *
 * Gated tier (must declare):
 * - "generation"           — fire generations on behalf of user
 * - "interceptor"          — pre-generation prompt modification
 * - "tools"                — register LLM tools
 * - "cors_proxy"           — use CORS proxy
 * - "context_handler"      — register global context middleware
 * - "generation_parameters" — inject parameters into in-flight generations via interceptors
 * - "characters"           — CRUD on character cards
 * - "chats"                — CRUD on chat sessions
 * - "presets"              — CRUD on user presets and prompt blocks
 * - "personas"             — CRUD on personas
 * - "databanks"            — CRUD on databanks and their documents
 * - "memories"             — CRUD on the Memory Cortex (entities, relations, vaults, chat
 *                            links, consolidations) and long-term chat memory (vectorized
 *                            chat-chunk retrieval, warmup, cache).
 * - "macro_interceptor"    — transform raw templates before macro parsing/dispatch
 * - "web_search"           — execute searches via the user's configured web search
 *                            provider (e.g. SearXNG) and read the safe view of their
 *                            web search settings (never the API key).
 * - "unsafe_eval"          — opt a sandboxed widget frame into CSP 'unsafe-eval'
 *                            (eval / new Function) for runtime-compiling frameworks.
 */
export type SpindlePermission =
  | "generation"
  | "interceptor"
  | "tools"
  | "cors_proxy"
  | "context_handler"
  | "ephemeral_storage"
  | "chat_mutation"
  | "event_tracking"
  | "ui_panels"
  | "app_manipulation"
  | "oauth"
  | "characters"
  | "chats"
  | "presets"
  | "world_books"
  | "regex_scripts"
  | "databanks"
  | "memories"
  | "personas"
  | "push_notification"
  | "image_gen"
  | "images"
  | "generation_parameters"
  | "macro_interceptor"
  | "web_search"
  | "unsafe_eval";

export const ALL_PERMISSIONS: readonly SpindlePermission[] = [
  "generation",
  "interceptor",
  "tools",
  "cors_proxy",
  "context_handler",
  "ephemeral_storage",
  "chat_mutation",
  "event_tracking",
  "ui_panels",
  "app_manipulation",
  "oauth",
  "characters",
  "chats",
  "presets",
  "world_books",
  "regex_scripts",
  "databanks",
  "memories",
  "personas",
  "push_notification",
  "image_gen",
  "images",
  "generation_parameters",
  "macro_interceptor",
  "web_search",
  "unsafe_eval",
] as const;

export function isValidPermission(p: string): p is SpindlePermission {
  return (ALL_PERMISSIONS as readonly string[]).includes(p);
}
