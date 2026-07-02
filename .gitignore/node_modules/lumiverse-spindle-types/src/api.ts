import type { SpindleManifest } from "./manifest";
import type { CouncilMemberContext } from "./council";
import type {
  ChatLinkAttachDTO,
  CortexQueryDTO,
  MemoryCortexConfigDTO,
  MemoryEntityStatusUpdateDTO,
  MemoryEntityUpsertDTO,
  MemoryRelationUpsertDTO,
  VaultCreateDTO,
} from "./memories";

// ─── DTO types for messages ──────────────────────────────────────────────

export type LlmMessagePartDTO =
  | { type: "text"; text: string; cache_control?: Record<string, unknown> }
  | { type: "image"; data: string; mime_type: string; cache_control?: Record<string, unknown> }
  | { type: "audio"; data: string; mime_type: string; cache_control?: Record<string, unknown> }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown>; cache_control?: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean; cache_control?: Record<string, unknown> };

export interface LlmMessageDTO {
  role: "system" | "user" | "assistant";
  content: string | LlmMessagePartDTO[];
  name?: string;
  /**
   * Thinking-mode reasoning content from the previous assistant turn, echoed
   * back on the next request. Required by DeepSeek's thinking-mode models
   * (`deepseek-reasoner`, `deepseek-chat` with thinking enabled) **on
   * tool-call continuations** — DeepSeek's API rejects a continuation when
   * an assistant turn invoked a tool call and the echo doesn't carry its
   * reasoning_content back. Plain-text continuations don't need this; nor
   * do non-thinking models. Other openai-compatible providers that route
   * DeepSeek (NanoGPT, OpenRouter, etc.) inherit the same requirement;
   * providers without a reasoning_content notion ignore the field. Set
   * only on `role: 'assistant'` messages.
   */
  reasoning_content?: string;
  /**
   * True when this message is a chat-history turn (as opposed to a depth-injected 
   * world-info/preset/author's-note block that was spliced into the chat-history 
   * range). Set by the host only on the messages passed to the interceptor pipeline, 
   * so an extension applying prompt-target regex inline can reproduce the host's depth
   * frame exactly.
   */
  __isChatHistory?: boolean;
  /**
   * Id of the originating chat message, set only on chat-history turns. Lets 
   * interceptors map back to the source message without matching on 
   * (macro/regex-mutated) content. Stripped before the LLM payload. 
   */
  sourceMessageId?: string;
  /**
   * Source message's `index_in_chat`, paired with `sourceMessageId`. 
   */
  sourceIndexInChat?: number;
}

export type SpindleUserRoleDTO = "operator" | "admin" | "user";

/**
 * Optional metadata returned by an interceptor so Lumiverse can surface
 * extension-injected prompt messages as first-class items in Prompt Breakdown.
 *
 * `messageIndex` points at the message inside the interceptor's returned
 * `messages` array. The host resolves role/content/extension attribution from
 * that message and from the installed extension manifest, so extensions only
 * need to identify which injected messages should appear in the breakdown.
 */
export interface InterceptorBreakdownEntryDTO {
  messageIndex: number;
  /** Optional human label for this injected prompt block. */
  name?: string;
}

/**
 * Return type for interceptor handlers.
 * Interceptors may return either a plain `LlmMessageDTO[]` (backwards-compatible)
 * or this object to also inject generation parameters (requires `generation_parameters` permission).
 */
export interface InterceptorResultDTO {
  messages: LlmMessageDTO[];
  /** Provider parameters merged into the outgoing LLM request. Requires `generation_parameters` permission. */
  parameters?: Record<string, unknown>;
  /** Optional prompt-breakdown entries for injected messages. */
  breakdown?: InterceptorBreakdownEntryDTO[];
}

export interface MacroDefinitionDTO {
  name: string;
  category: string;
  description: string;
  returnType?: "string" | "integer" | "number" | "boolean";
  args?: { name: string; description?: string; required?: boolean }[];
  handler: string; // serialized function body (executed in worker context)
  /** Set true when the macro returns different output across calls with the same args (time, randomness, idle duration). The display-regex cache will not store resolutions that include this macro. */
  volatile?: boolean;
}

/** Minimal shape exposed to extension macro handlers. Additional fields may be present. */
export interface MacroInvocationContextDTO {
  /** False when the host is performing a dry / non-committing resolve. */
  commit: boolean;
  [key: string]: unknown;
}

export interface MacroResolveOptionsDTO {
  chatId?: string;
  characterId?: string;
  /** For operator-scoped extensions only. */
  userId?: string;
  /** Defaults to true. Set false to request a dry / non-committing resolve. */
  commit?: boolean;
}

export interface MacroResolveResultDTO {
  text: string;
  diagnostics: Array<{ message: string; offset: number; length: number }>;
}

// ─── Macro Interceptor (permission: "macro_interceptor") ────────────────

/**
 * Where a macro evaluation originated. Useful for interceptors that only
 * want to fire for certain call sites (e.g. prompt assembly vs. response
 * post-processing vs. display-time resolution).
 */
export type MacroInterceptorPhase =
  | "prompt"
  | "display"
  | "response"
  | "other";

/**
 * Structured-clone snapshot of the live macro evaluation environment,
 * passed to a macro interceptor. All values are read-only copies — mutating
 * them has no effect on the real environment. Persist state via
 * `spindle.variables.*` helpers instead.
 */
export interface MacroInterceptorEnvDTO {
  readonly commit: boolean;
  readonly names: Record<string, string>;
  readonly character: Record<string, unknown>;
  readonly chat: Record<string, unknown>;
  readonly system: Record<string, unknown>;
  readonly variables: {
    readonly local: Record<string, string>;
    readonly global: Record<string, string>;
    readonly chat: Record<string, string>;
  };
  /**
   * Per-call dynamic macros injected by the caller (e.g. display-regex
   * pre-resolution passes `chat_index` here). Keys merge into the macro
   * lookup table for the duration of one resolve() call.
   */
  readonly dynamicMacros: Record<string, string>;
  readonly extra: Record<string, unknown>;
}

/**
 * Context passed to a macro interceptor handler on every iteration of
 * `MacroEvaluator.evaluate()`. The handler receives the current raw
 * template (already transformed by any earlier interceptors in the chain)
 * and returns either a transformed template string or `void` to pass through.
 */
export interface MacroInterceptorCtxDTO {
  readonly template: string;
  readonly env: MacroInterceptorEnvDTO;
  readonly commit: boolean;
  readonly phase: MacroInterceptorPhase;
  readonly sourceHint?: string;
  /**
   * User ID that initiated the macro resolution (when available). Relevant
   * for operator-scoped extensions that need to route work through other
   * Spindle APIs on that user's behalf.
   */
  readonly userId?: string;
}

/**
 * Lets an interceptor that resolves the template report its real cache 
 * dependencies so the host's display-regex cache can store the result 
 * and invalidate it precisely.
 */
export interface MacroInterceptorRichResultDTO {
  text: string;
  touchedVars?: readonly string[];
  volatile?: boolean;
}

/**
 * Return value of a macro interceptor handler.
 *  - `string` replaces the template for subsequent interceptors + parsing.
 *    (forces a non-cacheable resolution when it changes the template).
 *  - {@link MacroInterceptorRichResultDTO}
 *  - `void` / `undefined` passes the template through unchanged.
 */
export type MacroInterceptorResultDTO = string | MacroInterceptorRichResultDTO | void;

// ─── Message Content Processor (permission: "chat_mutation") ───────────

/**
 * Which content-write path triggered a message content processor run.
 * `"create"` covers both user-initiated `POST .../messages` writes and
 * auto-inserted greeting rows.
 */
export type MessageContentProcessorOrigin =
  | "create"
  | "update"
  | "swipe_add"
  | "swipe_update"
  | "render";

/**
 * Context passed to a message content processor before a user-initiated
 * message write reaches SQLite. Handlers can inspect this and return a
 * patch (new `content` / merged `extra`) to transform what is stored and
 * what WebSocket subscribers observe on first paint.
 */
export interface MessageContentProcessorCtxDTO {
  chatId: string;
  /** Undefined for `"create"` origins (the row doesn't exist yet). */
  messageId?: string;
  content: string;
  extra?: Record<string, unknown>;
  origin: MessageContentProcessorOrigin;
  /** Set for `"swipe_update"` only — the zero-based index of the swipe being rewritten. */
  swipeIndex?: number;
  /** Owning user for the write. Pass this through to operator-scoped Spindle calls. */
  userId: string;
}

/**
 * Return value for a message content processor handler. Return `undefined`
 * / `void` to pass through, or a partial patch to modify the write:
 *  - `content` (if present) replaces the content for downstream processors
 *    and the DB write.
 *  - `extra` (if present) shallow-merges into the existing `extra` — keys
 *    you omit are preserved. Ignored on swipe origins (swipes share the
 *    parent message's `extra`).
 */
export interface MessageContentProcessorResultDTO {
  content?: string;
  extra?: Record<string, unknown>;
}

export interface ToolRegistrationDTO {
  name: string;
  display_name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
  council_eligible?: boolean;
  /** Whether the tool is available for inline function calling during generation */
  inline_available?: boolean;
}

/** Tool/function schema passed to LLM for inline function calling. */
export interface ToolSchemaDTO {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

/** A single function call made by the LLM. */
export interface ToolCallDTO {
  /** Tool name (as given in the schema). */
  name: string;
  /** Parsed JSON arguments as returned by the LLM. */
  args: Record<string, unknown>;
  /** Provider call ID (e.g. Anthropic `id`, OpenAI `id`). Synthetic UUID for providers that don't supply one (e.g. Google). */
  call_id: string;
}

export interface GenerationRequestDTO {
  type: "raw" | "quiet" | "batch";
  messages?: LlmMessageDTO[];
  parameters?: Record<string, unknown>;
  connection_id?: string;
  /** Optional tool/function definitions for inline function calling (raw/quiet only). */
  tools?: ToolSchemaDTO[];
  /**
   * Optional per-request override of the user's reasoning ("extended thinking")
   * settings. When omitted (or `{ source: "inherit" }`) the backend resolves
   * the effective settings the same way a normal chat generation does:
   * the resolved connection's `reasoning_bindings` win, falling back to the
   * user's global `reasoningSettings`.
   *
   * Use this to bypass that resolution for a single request — e.g. to force
   * `"off"` for a quick, cheap call, or to dial the effort up/down with
   * `source: "custom"`. The backend translates the high-level intent into
   * the provider-specific knobs (`thinking`, `thinkingConfig`,
   * `reasoning_effort`, `reasoning.effort`, etc.) so the extension doesn't
   * need to know the per-provider quirks.
   *
   * Raw values supplied in `parameters` still take precedence at the field
   * level — this override only fills in what hasn't already been set,
   * except `source: "off"` which unconditionally strips reasoning fields.
   */
  reasoning?: GenerationReasoningOverrideDTO;
  /**
   * For operator-scoped extensions: the user ID whose connection profiles
   * and generation context should be used. For user-scoped extensions this
   * is inferred from the extension owner and can be omitted.
   */
  userId?: string;
  /**
   * Optional `AbortSignal` to cancel an in-flight generation. When the
   * signal fires, the upstream LLM HTTP request is torn down and the
   * returned promise rejects with an `AbortError` (`err.name === "AbortError"`).
   *
   * The signal is consumed inside the extension worker and never crosses
   * the host boundary — it is stripped before the RPC message is posted.
   * The worker notifies the host via an internal `cancel_generation`
   * message so the host can abort the in-flight request.
   *
   * @example
   * ```ts
   * const controller = new AbortController()
   * const timer = setTimeout(() => controller.abort(), 10_000)
   * try {
   *   const result = await spindle.generate.raw({
   *     provider: "openai",
   *     model: "gpt-4o-mini",
   *     messages: [{ role: "user", content: "hello" }],
   *     signal: controller.signal,
   *   })
   * } catch (err) {
   *   if (err instanceof Error && err.name === "AbortError") {
   *     // user/timeout cancelled — not an error condition
   *   }
   * } finally {
   *   clearTimeout(timer)
   * }
   * ```
   */
  signal?: AbortSignal;
}

/** Options passed to chat generation when `spindle.chat.appendMessage()` starts a normal reply. */
export interface ChatAppendGenerationOptionsDTO {
  /** Omit to use the user's default connection profile. */
  connection_id?: string;
  /** Omit to use the user's active persona setting. */
  persona_id?: string;
  persona_addon_states?: Record<string, boolean>;
  /** Omit to use the user's active Loom preset; if unset, the connection preset is used. */
  preset_id?: string;
  force_preset_id?: boolean;
  parameters?: Record<string, unknown>;
  target_character_id?: string;
  retain_council?: boolean;
}

/** Optional third argument for `spindle.chat.appendMessage()`. */
export type ChatAppendMessageOptionsDTO =
  | boolean
  | {
      triggerGeneration?: boolean;
      generation?: ChatAppendGenerationOptionsDTO;
    };

/**
 * Streamed chunk yielded by `spindle.generate.rawStream()` and
 * `spindle.generate.quietStream()`.
 *
 * The stream emits one or more `token` / `reasoning` chunks and then
 * exactly one terminal `done` chunk carrying the aggregated response.
 * If the stream fails or is aborted, the async generator rejects instead
 * of emitting `done`.
 */
export type StreamChunkDTO =
  /** Incremental content token. */
  | { type: "token"; token: string }
  /** Incremental chain-of-thought / reasoning token. */
  | { type: "reasoning"; token: string }
  /** Terminal chunk — emitted exactly once, on successful completion. */
  | {
      type: "done";
      content: string;
      reasoning?: string;
      finish_reason: string;
      tool_calls?: ToolCallDTO[];
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
    };

export interface RequestInitDTO {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** When `"arraybuffer"`, the response body is returned as a base64-encoded string
   *  with `encoding: "base64"`. Used by the sandboxed-widget transparent proxy. */
  responseType?: "text" | "arraybuffer";
  /** Restricts transparent binary proxy responses to a browser-renderable media class. */
  mediaType?: "image" | "audio";
}

/**
 * Reasoning effort tier. Provider mapping:
 * - Anthropic adaptive (Claude 4.6+): `low | medium | high | max` (+ `xhigh` on Opus 4.7) → `output_config.effort`.
 * - Anthropic legacy: mapped to `thinking.budget_tokens` (low=2048, medium=8192, high=16384, max=32768).
 * - Google (Gemini / Vertex): `minimal | low | medium | high` → `thinkingConfig.thinkingLevel`.
 * - DeepSeek: `low | medium | high` → `"high"`, `max | xhigh` → `"max"` (`reasoning_effort`).
 * - OpenRouter: `none | minimal | low | medium | high | xhigh` → `reasoning.effort`.
 * - NanoGPT: `none | minimal | low | medium | high` → `reasoning.effort`.
 * - Moonshot / Z.AI: toggle-only — effort ignored, just enables `thinking`.
 * - Generic OpenAI-compatible: passed verbatim as `reasoning.effort`.
 *
 * `"auto"` defers to the user's preset/global setting or the provider's
 * model-specific default and is the safest value to use when you don't
 * have a specific tier in mind.
 */
export type ReasoningEffortDTO =
  | "auto"
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "max"
  | "xhigh";

/**
 * Anthropic-only display mode for thinking blocks. Maps to `thinking.display`
 * in the Messages API. `"auto"` omits the field so Anthropic applies its
 * model-specific default (`"omitted"` on Opus 4.7 / Mythos Preview,
 * `"summarized"` elsewhere). Ignored by every other provider.
 */
export type ThinkingDisplayDTO = "auto" | "summarized" | "omitted";

/**
 * Full reasoning settings snapshot. Mirrors the user-level setting that
 * Lumiverse stores under `reasoningSettings`. Surfaced on
 * `ConnectionProfileDTO.reasoning_bindings.settings` when a connection has
 * a binding attached.
 *
 * Only `apiReasoning` / `reasoningEffort` / `thinkingDisplay` influence the
 * outgoing provider request — the remaining fields drive delimited-reasoning
 * parsing (`prefix`, `suffix`, `autoParse`) and chat-history pruning
 * (`keepInHistory`) and are included for inspection / round-tripping.
 */
export interface ReasoningSettingsDTO {
  /** Master switch: whether the provider should produce thinking output. */
  apiReasoning: boolean;
  /** Effort tier — see {@link ReasoningEffortDTO}. */
  reasoningEffort: ReasoningEffortDTO;
  /** Anthropic-only. */
  thinkingDisplay: ThinkingDisplayDTO;
  /** Opening delimiter used by the delimited-reasoning parser (e.g. `"<think>\n"`). */
  prefix: string;
  /** Closing delimiter used by the delimited-reasoning parser (e.g. `"\n</think>"`). */
  suffix: string;
  /** Whether to auto-parse delimited reasoning out of the assistant content stream. */
  autoParse: boolean;
  /**
   * How many recent reasoning blocks to retain in assembled prompt history.
   * `0` strips all, `-1` keeps everything, `N` keeps the last N.
   */
  keepInHistory: number;
}

/**
 * Reasoning settings bound to a specific connection profile. When present,
 * these override the user's global `reasoningSettings` during normal chat
 * generation on this connection.
 */
export interface ConnectionReasoningBindingsDTO {
  /** Reasoning settings snapshot captured at bind time. */
  settings: ReasoningSettingsDTO;
  /**
   * Optional "Start Reply With" assistant prefill captured alongside the
   * reasoning snapshot. When present, overrides the user's global
   * `promptBias` setting for this connection.
   */
  promptBias?: string;
}

/**
 * Per-request reasoning override for `spindle.generate.*` calls. Use the
 * `source` discriminator to pick how the backend resolves the effective
 * reasoning settings:
 *
 *  - `"inherit"` (default if `source` is omitted): apply the connection's
 *    `reasoning_bindings` if any, else the user's global setting. Same as
 *    leaving the `reasoning` field off entirely. Useful when you want to
 *    document intent without changing behaviour.
 *  - `"off"`: short-circuit. The provider's no-reasoning off-switch is
 *    applied unconditionally — even if `parameters` already carry an
 *    explicit `thinking` / `reasoning` block from the caller.
 *  - `"custom"`: use the explicit `apiReasoning` / `effort` / `thinkingDisplay`
 *    fields below for this request only. Omitted fields use their defaults
 *    (`apiReasoning: true`, `effort: "auto"`, `thinkingDisplay: "auto"`).
 *    Raw values supplied via `parameters` still win at the field level —
 *    the override only fills in unset fields, exactly like the inherited
 *    settings would.
 */
export interface GenerationReasoningOverrideDTO {
  source?: "inherit" | "off" | "custom";
  apiReasoning?: boolean;
  effort?: ReasoningEffortDTO;
  thinkingDisplay?: ThinkingDisplayDTO;
}

/**
 * Safe representation of a user's connection profile exposed to extensions.
 * Never contains the actual API key — only `has_api_key` boolean.
 */
export interface ConnectionProfileDTO {
  id: string;
  name: string;
  provider: string;
  api_url: string;
  model: string;
  preset_id: string | null;
  is_default: boolean;
  has_api_key: boolean;
  /**
   * Raw provider-specific metadata bag stored on the connection. Includes
   * provider-quirk flags (Anthropic prompt caching, Google thinking budget
   * config, etc.) and the original `reasoningBindings` blob — `reasoning_bindings`
   * below is the parsed, typed view of that same blob.
   */
  metadata: Record<string, unknown>;
  /**
   * Typed view of the connection's bound reasoning settings, parsed from
   * `metadata.reasoningBindings`. `null` when the connection has no binding
   * (in which case generation falls back to the user's global
   * `reasoningSettings`).
   */
  reasoning_bindings: ConnectionReasoningBindingsDTO | null;
  created_at: number;
  updated_at: number;
}

// ─── Image Generation DTOs ──────────────────────────────────────────────

/**
 * Safe representation of an image generation connection profile.
 * Never contains the actual API key — only `has_api_key` boolean.
 */
export interface ImageGenConnectionDTO {
  id: string;
  name: string;
  provider: string;
  api_url: string;
  model: string;
  is_default: boolean;
  has_api_key: boolean;
  default_parameters: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

/** Parameter schema for a single image gen provider parameter. */
export interface ImageGenParameterSchemaDTO {
  type: "number" | "integer" | "boolean" | "string" | "select" | "image_array";
  default?: unknown;
  min?: number;
  max?: number;
  step?: number;
  description: string;
  required?: boolean;
  options?: Array<{ id: string; label: string }>;
  group?: string;
}

/** Capabilities exposed by an image generation provider. */
export interface ImageGenProviderDTO {
  id: string;
  name: string;
  capabilities: {
    parameters: Record<string, ImageGenParameterSchemaDTO>;
    apiKeyRequired: boolean;
    modelListStyle: "static" | "dynamic" | "google";
    staticModels?: Array<{ id: string; label: string }>;
    defaultUrl: string;
  };
}

/** Input for `spindle.imageGen.generate()` */
export interface ImageGenRequestDTO {
  /** Connection profile ID to use. If omitted, uses the user's default image gen connection. */
  connection_id?: string;
  /** Text prompt for image generation. */
  prompt: string;
  /** Negative prompt (provider-dependent). */
  negativePrompt?: string;
  /** Model override. If omitted, uses the connection profile's model. */
  model?: string;
  /** Provider-specific parameters. Merged with the connection's default_parameters. */
  parameters?: Record<string, unknown>;
  /** Optional character ownership tag for the persisted result image. */
  owner_character_id?: string;
  /** Optional chat ownership tag for the persisted result image. */
  owner_chat_id?: string;
  /** For operator-scoped extensions. */
  userId?: string;
}

/** Result from `spindle.imageGen.generate()` */
export interface ImageGenResultDTO {
  imageDataUrl: string;
  model: string;
  provider: string;
  /** Persisted image ID in the images table (for gallery, backgrounds, etc.) */
  imageId?: string;
  /** Public URL for the image — works without authentication. Suitable for push notification `image` field. */
  imageUrl?: string;
}

// ─── Image DTOs ─────────────────────────────────────────────────────────

export type ImageSpecificityDTO = "full" | "sm" | "lg";

export interface ImageListOptionsDTO {
  limit?: number;
  offset?: number;
  /** Which image URL size should be returned in each DTO. */
  specificity?: ImageSpecificityDTO;
  /** Restrict results to images created by the current extension. */
  onlyOwned?: boolean;
  /** Restrict results to images tagged to a specific character. */
  characterId?: string;
  /** Restrict results to images tagged to a specific chat. */
  chatId?: string;
  /** For operator-scoped extensions. */
  userId?: string;
}

export interface ImageGetOptionsDTO {
  /** Which image URL size should be returned in the DTO. */
  specificity?: ImageSpecificityDTO;
  /** Restrict lookup to images created by the current extension. */
  onlyOwned?: boolean;
  /** Restrict lookup to images tagged to a specific character. */
  characterId?: string;
  /** Restrict lookup to images tagged to a specific chat. */
  chatId?: string;
  /** For operator-scoped extensions. */
  userId?: string;
}

/** Safe representation of an image exposed to extensions. */
export interface ImageDTO {
  id: string;
  original_filename: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  has_thumbnail: boolean;
  /** Relative authenticated URL for this image, already sized to `specificity`. */
  url: string;
  specificity: ImageSpecificityDTO;
  owner_extension_identifier: string | null;
  owner_character_id: string | null;
  owner_chat_id: string | null;
  created_at: number;
}

/** Upload payload for `spindle.images.upload()` */
export interface ImageUploadDTO {
  /** Raw image bytes. */
  data: Uint8Array;
  /** Optional filename used to preserve the extension/MIME when storing the image. */
  filename?: string;
  /** Optional content type. Defaults to image/png when not inferable. */
  mime_type?: string;
  /** Optional character ownership tag for the persisted image. */
  owner_character_id?: string;
  /** Optional chat ownership tag for the persisted image. */
  owner_chat_id?: string;
}

export interface ImageUploadFromDataUrlOptionsDTO {
  originalFilename?: string;
  /** Optional character ownership tag for the persisted image. */
  owner_character_id?: string;
  /** Optional chat ownership tag for the persisted image. */
  owner_chat_id?: string;
  /** For operator-scoped extensions. */
  userId?: string;
}

// ─── Character DTOs ─────────────────────────────────────────────────────

/**
 * Safe representation of a character exposed to extensions.
 * Includes the full `extensions` blob so extensions can read and write
 * their own namespaced keys alongside the allowlisted `world_book_ids`.
 */
export interface CharacterDTO {
  id: string;
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  creator_notes: string;
  system_prompt: string;
  post_history_instructions: string;
  tags: string[];
  alternate_greetings: string[];
  creator: string;
  image_id: string | null;
  /**
   * IDs of world books attached directly to this character. The legacy
   * single-id form is auto-migrated, so consumers can rely on the array.
   */
  world_book_ids: string[];
  /** The raw extensions object. Extensions should namespace their keys. */
  extensions: Record<string, any>;
  created_at: number;
  updated_at: number;
}

export interface CharacterCreateDTO {
  name: string;
  description?: string;
  personality?: string;
  scenario?: string;
  first_mes?: string;
  mes_example?: string;
  creator_notes?: string;
  system_prompt?: string;
  post_history_instructions?: string;
  tags?: string[];
  alternate_greetings?: string[];
  creator?: string;
  /** Optional initial world book attachments. */
  world_book_ids?: string[];
  /** Optional initial extension data. */
  extensions?: Record<string, any>;
}

export interface CharacterUpdateDTO {
  name?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  first_mes?: string;
  mes_example?: string;
  creator_notes?: string;
  system_prompt?: string;
  post_history_instructions?: string;
  tags?: string[];
  alternate_greetings?: string[];
  creator?: string;
  /**
   * Replace the character's world book attachments. Pass an empty array to
   * detach all books. Omit the field to leave attachments unchanged.
   */
  world_book_ids?: string[];
  /**
   * Shallow-merged into the character's existing extensions.
   * Extension-provided keys overwrite existing ones; omitting a key leaves it
   * untouched. Pass an empty object to make no changes, or omit entirely.
   */
  extensions?: Record<string, any>;
}

export interface CharacterAvatarUploadDTO {
  /** Raw avatar bytes. Extensions can source these from fetch(), storage, etc. */
  data: Uint8Array;
  /** Optional filename used to preserve the extension/MIME when storing the image. */
  filename?: string;
  /** Optional content type for the uploaded avatar. Defaults to image/png. */
  mime_type?: string;
}

// ─── Chat DTOs ──────────────────────────────────────────────────────────

/**
 * Safe representation of a chat session exposed to extensions.
 */
export interface ChatDTO {
  id: string;
  character_id: string;
  name: string;
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface ChatUpdateDTO {
  name?: string;
  metadata?: Record<string, unknown>;
}

/** Payload for `CHAT_SWITCHED` events. */
export interface ChatSwitchedPayloadDTO {
  /** The chat the user switched to, or `null` when returning to the home screen. */
  chatId: string | null;
}

/** Payload for `CHAT_CHANGED` events. */
export interface ChatChangedPayloadDTO {
  /** The chat after the change. */
  chat: { id: string; [key: string]: unknown };
  /** Optional. Dot-paths of fields that differed between the prior and new chat (e.g. `metadata.macro_variables.local.foo`, `name`, `metadata.last_message_id`). Absent on events emitted by sources that don't compute the diff. */
  changedFields?: string[];
}

/**
 * Payload for `CHAT_FORKED` events. Emitted when a chat is forked (branched)
 * from a specific message — the messages up to and including the fork point are
 * copied into a brand-new chat that shares the source chat's character.
 */
export interface ChatForkedPayloadDTO {
  /** Id of the source chat that was forked. */
  sourceChatId: string;
  /** Id of the newly created forked chat. Equal to `chat.id`. */
  forkedChatId: string;
  /** The new forked chat row, including its `metadata` (carries `branched_from` and `branch_at_message`). */
  chat: { id: string; [key: string]: unknown };
  /** The `branch_id` assigned to every message copied into the forked chat. */
  branchId: string;
  /** Id of the message in the source chat the fork was taken at. Messages up to and including this one were copied into the forked chat. */
  forkedAtMessageId: string;
  /** Zero-based index of the fork-point message within the source chat. */
  forkedAtMessageIndex: number;
}

// ─── User Preset DTOs ───────────────────────────────────────────────────

/** Option entry for `select` and `multiselect` prompt variables. */
export interface PromptVariableOptionDTO {
  id: string;
  label: string;
  value: string;
}

export type PromptVariableDefDTO =
  | {
      id: string;
      name: string;
      label: string;
      type: "text";
      defaultValue: string;
      description?: string;
    }
  | {
      id: string;
      name: string;
      label: string;
      type: "textarea";
      defaultValue: string;
      rows?: number;
      description?: string;
    }
  | {
      id: string;
      name: string;
      label: string;
      type: "number";
      defaultValue: number;
      min?: number;
      max?: number;
      step?: number;
      description?: string;
    }
  | {
      id: string;
      name: string;
      label: string;
      type: "slider";
      defaultValue: number;
      min: number;
      max: number;
      step?: number;
      description?: string;
    }
  | {
      id: string;
      name: string;
      label: string;
      type: "select";
      /** Stored selection: an option id. */
      defaultValue: string;
      options: PromptVariableOptionDTO[];
      description?: string;
    }
  | {
      id: string;
      name: string;
      label: string;
      type: "switch";
      /** 0 (off) or 1 (on). */
      defaultValue: 0 | 1;
      description?: string;
    }
  | {
      id: string;
      name: string;
      label: string;
      type: "multiselect";
      /** Stored selection: array of option ids. */
      defaultValue: string[];
      options: PromptVariableOptionDTO[];
      /** String inserted between joined option values. Defaults to two newlines. */
      separator?: string;
      description?: string;
    };

export type PromptVariableTypeDTO = PromptVariableDefDTO["type"];
export type PromptVariableValueDTO = string | number | string[];
export type PromptVariableValuesDTO = Record<string, Record<string, PromptVariableValueDTO>>;
export type PromptBlockRoleDTO = "system" | "user" | "assistant" | "user_append" | "assistant_append";
export type PromptBlockPositionDTO = "pre_history" | "post_history" | "in_history";
export type PromptBlockCategoryModeDTO = "radio" | "checkbox" | null;

export interface PromptBlockDTO {
  id: string;
  name: string;
  content: string;
  role: PromptBlockRoleDTO;
  enabled: boolean;
  position: PromptBlockPositionDTO;
  depth: number;
  /** `"category"` marks a structural category header; other strings are structural insertion markers. */
  marker: string | null;
  isLocked: boolean;
  color: string | null;
  injectionTrigger: string[];
  group: string | null;
  /** Only meaningful when `marker === "category"`. Radio categories allow one enabled child; checkbox categories allow many. */
  categoryMode?: PromptBlockCategoryModeDTO;
  variables?: PromptVariableDefDTO[];
}

export interface PromptBlockCategoryGroupDTO {
  /** The category header block, or null for uncategorized leading blocks. */
  categoryBlock: PromptBlockDTO | null;
  /** Non-category blocks after the header until the next category header. */
  children: PromptBlockDTO[];
}

export interface UserPresetDTO {
  id: string;
  name: string;
  provider: string;
  engine: string;
  parameters: Record<string, unknown>;
  prompt_order: PromptBlockDTO[];
  prompts: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface UserPresetCreateDTO {
  name: string;
  provider: string;
  engine?: string;
  parameters?: Record<string, unknown>;
  prompt_order?: PromptBlockDTO[];
  prompts?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export type UserPresetUpdateDTO = Partial<UserPresetCreateDTO>;
export type PromptBlockCreateDTO = Partial<PromptBlockDTO>;
export type PromptBlockUpdateDTO = Partial<Omit<PromptBlockDTO, "id">>;

// ─── World Book DTOs ─────────────────────────────────────────────────────

/**
 * Safe representation of a world book exposed to extensions.
 */
export interface WorldBookDTO {
  id: string;
  name: string;
  description: string;
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface WorldBookCreateDTO {
  name: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface WorldBookUpdateDTO {
  name?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Full representation of a world book entry exposed to extensions.
 */
export interface WorldBookEntryDTO {
  id: string;
  world_book_id: string;
  uid: string;
  key: string[];
  keysecondary: string[];
  content: string;
  comment: string;
  position: number;
  depth: number;
  role: string | null;
  order_value: number;
  selective: boolean;
  constant: boolean;
  disabled: boolean;
  group_name: string;
  group_override: boolean;
  group_weight: number;
  probability: number;
  scan_depth: number | null;
  case_sensitive: boolean;
  match_whole_words: boolean;
  automation_id: string | null;
  use_regex: boolean;
  prevent_recursion: boolean;
  exclude_recursion: boolean;
  delay_until_recursion: boolean;
  priority: number;
  sticky: number;
  cooldown: number;
  delay: number;
  selective_logic: number;
  use_probability: boolean;
  vectorized: boolean;
  extensions: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface WorldBookEntryCreateDTO {
  key?: string[];
  keysecondary?: string[];
  content?: string;
  comment?: string;
  position?: number;
  depth?: number;
  role?: string;
  order_value?: number;
  selective?: boolean;
  constant?: boolean;
  disabled?: boolean;
  group_name?: string;
  group_override?: boolean;
  group_weight?: number;
  probability?: number;
  scan_depth?: number;
  case_sensitive?: boolean;
  match_whole_words?: boolean;
  automation_id?: string;
  use_regex?: boolean;
  prevent_recursion?: boolean;
  exclude_recursion?: boolean;
  delay_until_recursion?: boolean;
  priority?: number;
  sticky?: number;
  cooldown?: number;
  delay?: number;
  selective_logic?: number;
  use_probability?: boolean;
  vectorized?: boolean;
  extensions?: Record<string, unknown>;
}

export type WorldBookEntryUpdateDTO = WorldBookEntryCreateDTO;

// ─── Regex Script DTOs ──────────────────────────────────────────────────

export type RegexPlacementDTO = "user_input" | "ai_output" | "world_info" | "reasoning";
export type RegexScopeDTO = "global" | "character" | "chat";
export type RegexTargetDTO = "prompt" | "response" | "display";
export type RegexMacroModeDTO = "none" | "raw" | "escaped" | "after";

export interface RegexScriptDTO {
  id: string;
  name: string;
  script_id: string;
  find_regex: string;
  replace_string: string;
  flags: string;
  placement: RegexPlacementDTO[];
  scope: RegexScopeDTO;
  scope_id: string | null;
  target: RegexTargetDTO;
  min_depth: number | null;
  max_depth: number | null;
  trim_strings: string[];
  run_on_edit: boolean;
  substitute_macros: RegexMacroModeDTO;
  disabled: boolean;
  sort_order: number;
  description: string;
  folder: string;
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface RegexScriptListOptionsDTO {
  scope?: RegexScopeDTO;
  scopeId?: string;
  target?: RegexTargetDTO;
  limit?: number;
  offset?: number;
  userId?: string;
}

export interface RegexScriptActiveOptionsDTO {
  target: RegexTargetDTO;
  characterId?: string;
  chatId?: string;
  userId?: string;
}

export interface RegexScriptCreateDTO {
  name: string;
  find_regex: string;
  replace_string?: string;
  flags?: string;
  placement?: RegexPlacementDTO[];
  scope?: RegexScopeDTO;
  scope_id?: string | null;
  target?: RegexTargetDTO;
  min_depth?: number | null;
  max_depth?: number | null;
  trim_strings?: string[];
  run_on_edit?: boolean;
  substitute_macros?: RegexMacroModeDTO;
  disabled?: boolean;
  sort_order?: number;
  description?: string;
  folder?: string;
  metadata?: Record<string, unknown>;
  script_id?: string;
}

export type RegexScriptUpdateDTO = Partial<RegexScriptCreateDTO>;

// ─── World Info Interceptor (permission: "generation") ─────────────────

/**
 * One world info entry exposed to a `registerWorldInfoInterceptor` handler.
 * Subset of `WorldBookEntryDTO` covering the fields the interceptor needs to
 * inspect for activation gating.
 */
export interface WorldInfoInterceptorEntryDTO {
  readonly id: string;
  readonly world_book_id: string;
  readonly comment: string;
  readonly disabled: boolean;
  readonly constant: boolean;
  readonly extensions: Readonly<Record<string, unknown>>;
  readonly key: readonly string[];
  readonly keysecondary: readonly string[];
  readonly position: number;
  readonly depth: number;
  readonly priority: number;
  readonly probability: number;
  readonly use_probability: boolean;
  readonly content: string;
  readonly automation_id: string | null;
  readonly selective: boolean;
  readonly selective_logic: number;
  readonly match_whole_words: boolean;
  readonly case_sensitive: boolean;
  readonly use_regex: boolean;
  readonly prevent_recursion: boolean;
  readonly exclude_recursion: boolean;
  readonly delay_until_recursion: boolean;
  readonly scan_depth: number | null;
  readonly order_value: number;
  /** Attachment scope that contributed the entry's book to this chat. */
  readonly book_source?: WorldBookSourceDTO;
}

/**
 * One chat message exposed to a `registerWorldInfoInterceptor` handler.
 * `index_in_chat` is the zero-based position in the chat's message list and
 * `is_greeting` is true for the synthetic greeting row at index 0.
 */
export interface WorldInfoInterceptorMessageDTO {
  readonly id: string;
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
  readonly is_user: boolean;
  readonly is_greeting: boolean;
  readonly greeting_index?: number;
  readonly swipe_id: number;
  readonly index_in_chat: number;
}

/**
 * Context passed to a `registerWorldInfoInterceptor` handler. Fires inside
 * `assemblePrompt` immediately before `activateWorldInfo` runs, so any
 * `disabled` / `enabled` / `forced` votes affect activation and downstream
 * token-budget calculation.
 */
export interface WorldInfoInterceptorCtxDTO {
  readonly chatId: string;
  readonly characterId: string;
  readonly userId?: string;
  readonly entries: readonly WorldInfoInterceptorEntryDTO[];
  readonly messages: readonly WorldInfoInterceptorMessageDTO[];
  readonly chatTurn: number;
  readonly chatMetadata: Readonly<Record<string, unknown>>;
}

/**
 * Per-entry content override emitted by a `registerWorldInfoInterceptor`
 * handler. `content` replaces the entry's `content` for this prompt only.
 */
export interface WorldInfoInterceptorMutationDTO {
  readonly id: string;
  readonly content?: string;
}

/**
 * Return value of a `registerWorldInfoInterceptor` handler. Each list is
 * additive — handlers chain in priority order and a later handler sees the
 * prior handlers' votes applied.
 */
export interface WorldInfoInterceptorResultDTO {
  readonly disabled?: readonly string[];
  readonly enabled?: readonly string[];
  readonly forced?: readonly string[];
  readonly mutated?: readonly WorldInfoInterceptorMutationDTO[];
}

// ─── Databank DTOs ───────────────────────────────────────────────────────

export type DatabankScopeDTO = "global" | "character" | "chat";
export type DatabankDocumentStatusDTO = "pending" | "processing" | "ready" | "error";

/** Safe representation of a databank exposed to extensions. */
export interface DatabankDTO {
  id: string;
  name: string;
  description: string;
  scope: DatabankScopeDTO;
  scope_id: string | null;
  enabled: boolean;
  metadata: Record<string, unknown>;
  document_count?: number;
  created_at: number;
  updated_at: number;
}

export interface DatabankCreateDTO {
  name: string;
  description?: string;
  scope: DatabankScopeDTO;
  scope_id?: string | null;
}

export interface DatabankUpdateDTO {
  name?: string;
  description?: string;
  enabled?: boolean;
}

/** Safe representation of a databank document exposed to extensions. */
export interface DatabankDocumentDTO {
  id: string;
  databank_id: string;
  name: string;
  slug: string;
  mime_type: string;
  file_size: number;
  content_hash: string;
  total_chunks: number;
  status: DatabankDocumentStatusDTO;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface DatabankDocumentCreateDTO {
  /** Raw file bytes. */
  data: Uint8Array;
  /** Original filename including extension. */
  filename: string;
  /** Optional MIME type recorded on the document. */
  mime_type?: string;
  /** Optional display name override. Defaults to the filename without extension. */
  name?: string;
}

export interface DatabankDocumentUpdateDTO {
  /** Renames the document display name (and derived slug). */
  name: string;
}

// ─── Persona DTOs ──────────────────────────────────────────────────────

/**
 * Safe representation of a persona exposed to extensions.
 * Omits avatar_path (internal filesystem path) — use image_id for avatar access.
 */
export interface LumiaItemDTO {
  id: string;
  pack_id: string;
  name: string;
  avatar_url: string | null;
  author_name: string;
  definition: string;
  personality: string;
  behavior: string;
  gender_identity: 0 | 1 | 2 | 3; // 0=feminine, 1=masculine, 2=neutral, 3=any
  version: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface PersonaDTO {
  id: string;
  name: string;
  title: string;
  description: string;
  image_id: string | null;
  attached_world_book_id: string | null;
  folder: string;
  is_default: boolean;
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface PersonaCreateDTO {
  name: string;
  title?: string;
  description?: string;
  folder?: string;
  is_default?: boolean;
  attached_world_book_id?: string;
  metadata?: Record<string, unknown>;
}

export interface PersonaUpdateDTO {
  name?: string;
  title?: string;
  description?: string;
  folder?: string;
  is_default?: boolean;
  attached_world_book_id?: string;
  metadata?: Record<string, unknown>;
}

export interface GlobalAddonDTO {
  id: string;
  label: string;
  content: string;
  sort_order: number;
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface GlobalAddonUpdateDTO {
  label?: string;
  content?: string;
  sort_order?: number;
  metadata?: Record<string, unknown>;
}

// ─── Activated World Info DTOs ─────────────────────────────────────────

/**
 * Which attachment scope contributed a world book to prompt assembly.
 * When a book is attached at multiple scopes the narrowest one wins:
 * character → persona → chat → global.
 */
export type WorldBookSourceDTO = "character" | "persona" | "chat" | "global";

/**
 * Lightweight summary of an activated world info entry.
 * Safe subset — no raw entry content or internal fields exposed.
 */
export interface ActivatedWorldInfoEntryDTO {
  id: string;
  comment: string;
  keys: string[];
  source: "keyword" | "vector";
  score?: number;
  /** ID of the world book the entry belongs to. */
  bookId?: string;
  /** Attachment scope that contributed the entry's book. */
  bookSource?: WorldBookSourceDTO;
}

/** Payload of the `WORLD_INFO_ACTIVATED` event. */
export interface WorldInfoActivatedEventDTO {
  chatId: string;
  entries: ActivatedWorldInfoEntryDTO[];
  stats?: Record<string, unknown>;
}

// ─── Dry Run DTOs ──────────────────────────────────────────────────────

export interface DryRunRequestDTO {
  chatId: string;
  connectionId?: string;
  personaId?: string;
  presetId?: string;
  generationType?: string;
  parameters?: Record<string, unknown>;
}

export interface AssemblyBreakdownEntryDTO {
  type: string;
  name: string;
  role?: string;
  content?: string;
  blockId?: string;
  marker?: string;
  messageCount?: number;
  firstMessageIndex?: number;
  preCountedTokens?: number;
  excludeFromTotal?: boolean;
  extensionId?: string;
  extensionName?: string;
}

export interface ActivationStatsDTO {
  totalCandidates: number;
  activatedBeforeBudget: number;
  activatedAfterBudget: number;
  evictedByBudget: number;
  evictedByMinPriority: number;
  estimatedTokens: number;
  recursionPassesUsed: number;
}

export interface MemoryStatsDTO {
  enabled: boolean;
  chunksRetrieved: number;
  chunksAvailable: number;
  chunksPending: number;
  injectionMethod: "macro" | "fallback" | "disabled";
  /**
   * How the chunks were retrieved: a real vector/hybrid search ("vector") or
   * the recency fallback ("recency", e.g. when the query embedding failed).
   * Absent until the chat-memory cache has been populated.
   */
  retrievalMode?: "vector" | "recency" | "empty" | "disabled";
  retrievedChunks: Array<{
    /**
     * Vector distance (lower = more similar). `null` for keyword-only or
     * recency-fallback hits, which have no vector distance — do not treat a
     * missing score as a perfect (zero-distance) match.
     */
    score: number | null;
    tokenEstimate: number;
    messageRange: [number, number];
    preview: string;
  }>;
  queryPreview: string;
  settingsSource: "global" | "per_chat";
}

export interface DryRunTokenCountDTO {
  total_tokens: number;
  breakdown: Array<{
    name: string;
    type: string;
    tokens: number;
    role?: string;
    extensionId?: string;
    extensionName?: string;
  }>;
  tokenizer_id: string | null;
  tokenizer_name: string | null;
}

export interface DryRunResultDTO {
  messages: LlmMessageDTO[];
  breakdown: AssemblyBreakdownEntryDTO[];
  parameters: Record<string, unknown>;
  model: string;
  provider: string;
  tokenCount?: DryRunTokenCountDTO;
  worldInfoStats?: ActivationStatsDTO;
  memoryStats?: MemoryStatsDTO;
}

// ─── Chat Memory DTOs ──────────────────────────────────────────────────

export interface ChatMemoryChunkDTO {
  content: string;
  /**
   * Vector distance (lower = more similar). `null` for keyword-only or
   * recency-fallback hits, which have no vector distance — do not treat a
   * missing score as a perfect (zero-distance) match.
   */
  score: number | null;
  metadata: Record<string, unknown>;
}

export interface ChatMemoryResultDTO {
  chunks: ChatMemoryChunkDTO[];
  formatted: string;
  count: number;
  enabled: boolean;
  queryPreview: string;
  settingsSource: "global" | "per_chat";
  chunksAvailable: number;
  chunksPending: number;
  /** How chunks were retrieved (real vector search vs. recency fallback). */
  retrievalMode?: "vector" | "recency" | "empty" | "disabled";
}

/**
 * Structured error code included in permission-denied error messages.
 * Extensions can check `error.startsWith("PERMISSION_DENIED:")` to
 * programmatically distinguish permission errors from runtime failures.
 */
export const PERMISSION_DENIED_PREFIX = "PERMISSION_DENIED:" as const;

/**
 * Detail object delivered via the `permission_denied` host→worker message
 * when a fire-and-forget registration is blocked by a missing grant.
 */
export interface PermissionDeniedDetail {
  /** The permission that was required but not granted */
  permission: string;
  /** Human-readable description of the operation that was blocked */
  operation: string;
}

/**
 * Detail object delivered via the `permission_changed` host→worker message
 * when a permission is granted or revoked at runtime (without restart).
 */
export interface PermissionChangedDetail {
  /** Identifier of the extension whose permission changed */
  extensionId: string;
  /** The permission that changed */
  permission: string;
  /** Whether the permission was granted (true) or revoked (false) */
  granted: boolean;
  /** The full list of currently granted permissions after the change */
  allGranted: string[];
}

// ─── Web Search DTOs ────────────────────────────────────────────────────

/** Identifies which provider backs the user's configured web search engine. */
export type WebSearchProviderDTO = "searxng";

/**
 * Safe view of a user's web search configuration. The raw API key is never
 * exposed — only `hasApiKey` indicates whether one is on file.
 */
export interface WebSearchSettingsDTO {
  enabled: boolean;
  provider: WebSearchProviderDTO;
  apiUrl: string;
  requestTimeoutMs: number;
  defaultResultCount: number;
  maxResultCount: number;
  maxPagesToScrape: number;
  maxCharsPerPage: number;
  language: string;
  safeSearch: 0 | 1 | 2;
  engines: string[];
  hasApiKey: boolean;
}

/** A single search result row, normalized across providers. */
export interface WebSearchResultDTO {
  title: string;
  url: string;
  snippet: string;
  /** Provider-reported engine identifier when available (e.g. `"google"`, `"bing"`). */
  engine?: string;
  /** Provider-reported relevance score when available. */
  score?: number;
}

/**
 * A search result enriched with scraped page content. Only present when the
 * query was run with `scrape: true` (the default).
 */
export interface WebSearchDocumentDTO {
  title: string;
  url: string;
  snippet: string;
  /** How the page content was extracted (e.g. `"html"`, `"pdf"`). */
  sourceType?: string;
  /** Extracted page text, clipped to `WebSearchSettingsDTO.maxCharsPerPage`. */
  content?: string;
  /** Length of the source page content before clipping. */
  contentLength?: number;
  /** Populated when scraping failed for this result; `content` is then absent. */
  error?: string;
}

/** Options forwarded to `spindle.webSearch.query()`. */
export interface WebSearchRequestDTO {
  /** Free-text search query. Trimmed by the host; empty values are rejected. */
  query: string;
  /**
   * Desired number of results. Clamped to `WebSearchSettingsDTO.maxResultCount`
   * on the host; omit to use the user's `defaultResultCount`.
   */
  count?: number;
  /**
   * When `true` (default), the host scrapes the first
   * `WebSearchSettingsDTO.maxPagesToScrape` results, fills in
   * `documents[].content`, and assembles the `context` block. Set to `false`
   * to skip scraping entirely — only `results` are returned, and
   * `documents` / `context` are omitted from the response. Useful when the
   * extension only needs titles, URLs, and snippets.
   */
  scrape?: boolean;
  /** For operator-scoped extensions; ignored on user-scoped extensions. */
  userId?: string;
}

/**
 * Result of a successful `spindle.webSearch.query()` call. `documents` and
 * `context` are omitted when the request was issued with `scrape: false`.
 */
export interface WebSearchResponseDTO {
  /** The (trimmed) query that was executed. */
  query: string;
  /** Raw normalized results from the search provider. */
  results: WebSearchResultDTO[];
  /** Per-result scraped page content. Absent when `scrape: false`. */
  documents?: WebSearchDocumentDTO[];
  /**
   * Pre-assembled, prompt-ready context block summarizing the query plus the
   * scraped documents. Absent when `scrape: false`.
   */
  context?: string;
}

// ─── Theme DTOs ──────────────────────────────────────────────────────────

/**
 * Theme override payload sent by extensions to customize the UI appearance.
 * Overrides are applied on top of the user's current theme and automatically
 * removed when the extension is disabled or unloaded.
 */
export interface ThemeOverrideDTO {
  /**
   * Direct CSS variable overrides applied regardless of light/dark mode.
   * Keys are CSS custom property names (e.g. `--lumiverse-primary`).
   * Values must be valid CSS values.
   *
   * Common variable groups:
   * - **Primary accent**: `--lumiverse-primary`, `--lumiverse-primary-hover`, `-text`, `-muted`, `-light`, `-010`…`-050`, `-contrast`
   * - **Backgrounds**: `--lumiverse-bg`, `-elevated`, `-hover`, `-dark`, `-darker`, `-deep`, `-040`…`-070`
   * - **Text**: `--lumiverse-text`, `-muted`, `-dim`, `-hint`
   * - **Borders**: `--lumiverse-border`, `-hover`, `-light`, `-neutral`, `-neutral-hover`
   * - **Status**: `--lumiverse-danger`, `--lumiverse-success`, `--lumiverse-warning` (+ `-015`, `-020`, `-050` variants)
   * - **Glass**: `--lcs-glass-bg`, `-bg-hover`, `-border`, `-border-hover`, `-blur`, `-soft-blur`, `-strong-blur`
   * - **Prose**: `--lumiverse-prose-italic`, `-bold`, `-dialogue`, `-blockquote`, `-link`
   * - **Shadows**: `--lumiverse-shadow`, `-sm`, `-md`, `-lg`, `-xl`
   * - **Radii**: `--lumiverse-radius`, `-sm`, `-md`, `-lg`, `-xl`, `--lcs-radius`, `-sm`, `-xs`
   * - **Fills**: `--lumiverse-fill`, `-subtle`, `-hover`, `-medium`, `-strong`, `-heavy`, `-deepest`
   * - **Cards**: `--lumiverse-card-bg`, `--lumiverse-card-image-bg`
   * - **Icons**: `--lumiverse-icon`, `-muted`, `-dim`
   * - **Modals**: `--lumiverse-modal-backdrop`, `--lumiverse-gradient-modal`, `--lumiverse-swatch-border`
   * - **Typography**: `--lumiverse-font-family`, `--lumiverse-font-mono`, `--lumiverse-font-scale`
   * - **Transitions**: `--lumiverse-transition`, `--lumiverse-transition-fast`, `--lcs-transition`, `--lcs-transition-fast`
   */
  variables?: Record<string, string>;

  /**
   * Mode-specific CSS variable overrides. When the user switches between
   * light and dark mode, the frontend selects the matching set.
   * Mode-specific values override flat `variables` for the same key.
   */
  variablesByMode?: {
    dark?: Record<string, string>;
    light?: Record<string, string>;
  };
}

/**
 * RGB color value (0–255 per channel).
 */
export interface ColorRGB {
  r: number;
  g: number;
  b: number;
}

/**
 * HSL color value (h: 0–360, s: 0–100, l: 0–100).
 */
export interface ColorHSL {
  h: number;
  s: number;
  l: number;
}

/**
 * Result of extracting colors from an image.
 * Each region's dominant color is returned along with metadata.
 */
export interface ColorExtractionResult {
  /** Overall dominant color of the full image */
  dominant: ColorRGB;
  /** Dominant color per sampled region */
  regions: {
    top: ColorRGB;
    center: ColorRGB;
    bottom: ColorRGB;
    left: ColorRGB;
    right: ColorRGB;
  };
  /** Per-region flatness score (0–1). High values = monotone/solid region. */
  flatness: {
    top: number;
    center: number;
    bottom: number;
    left: number;
    right: number;
    full: number;
  };
  /** Simple average color across all sampled pixels */
  average: ColorRGB;
  /** Whether the dominant color is perceived as light (luminance > 152) */
  isLight: boolean;
  /** HSL representation of the dominant color */
  dominantHsl: ColorHSL;
}

/**
 * Read-only snapshot of the user's current theme configuration.
 */
export interface ThemeInfoDTO {
  /** Theme preset ID (e.g. `"lumiverse-purple"`, `"character-aware"`) */
  id: string;
  /** Display name of the theme */
  name: string;
  /** Resolved mode — always `"light"` or `"dark"`, never `"system"` */
  mode: "light" | "dark";
  /** Primary accent color in HSL (hue 0-360, saturation 0-100, lightness 0-100) */
  accent: { h: number; s: number; l: number };
  /** Whether glassmorphic backdrop-filter effects are enabled */
  enableGlass: boolean;
  /** Border radius multiplier (1.0 = default) */
  radiusScale: number;
  /** Font size multiplier (1.0 = default) */
  fontScale: number;
  /** Full UI zoom multiplier (1.0 = default, affects all elements via CSS zoom) */
  uiScale: number;
  /** Whether the theme dynamically adapts to the active character's avatar */
  characterAware: boolean;
}

/**
 * Input config for `spindle.theme.generateVariables()`.
 *
 * Mirrors the inputs that Lumiverse's theme engine uses to produce the full
 * set of ~80+ CSS variables. Extensions can use the result as a complete,
 * coherent override set for `spindle.theme.apply()`.
 */
export interface ThemeVariablesConfigDTO {
  /** Primary accent color in HSL. */
  accent: { h: number; s: number; l: number };
  /** Resolved color mode. */
  mode: "dark" | "light";
  /** Enable glassmorphic backdrop-filter tokens (default: `true`). */
  enableGlass?: boolean;
  /** Border radius multiplier (default: `1`). */
  radiusScale?: number;
  /** Font size multiplier (default: `1`). */
  fontScale?: number;
  /** Full UI zoom multiplier (default: `1`). */
  uiScale?: number;
  /** Optional base color overrides. Each value is a CSS color string. */
  baseColors?: {
    primary?: string;
    secondary?: string;
    background?: string;
    text?: string;
    danger?: string;
    success?: string;
    warning?: string;
    /** Dialogue / speech color override. */
    speech?: string;
    /** Italic / thoughts color override. */
    thoughts?: string;
  };
  /** Status color overrides (danger, success, warning). */
  statusColors?: {
    danger?: string;
    success?: string;
    warning?: string;
  };
}

/**
 * Input config for `spindle.theme.applyPalette()`.
 *
 * This is the safe, presentation-owned path for live extension theming.
 * Extensions provide palette intent only; Lumiverse preserves the user's
 * radius, glass, font, and UI-scale settings and generates the final
 * mode-aware variable maps itself. Pass `null` to clear a previously applied
 * palette override when no valid color data is available.
 */
export interface ThemePaletteConfigDTO {
  /** Primary accent color in HSL. */
  accent: { h: number; s: number; l: number };
}

// ─── Modal content items (used by backend-initiated modals) ─────────────

/**
 * Structured content items for backend-initiated modals (`spindle.modal.open`).
 * The host renders these into the modal body using system theming.
 * For full DOM control, use the frontend `ctx.ui.showModal()` API instead.
 */
export type SpindleModalItemDTO =
  /** A block of text content. Supports multiline via newlines. */
  | { type: "text"; content: string; muted?: boolean }
  /** A horizontal divider line. */
  | { type: "divider" }
  /** A label–value pair displayed in a horizontal row. */
  | { type: "key_value"; label: string; value: string }
  /** A section heading within the modal body. */
  | { type: "heading"; content: string }
  /** A themed card/container that groups child items. */
  | { type: "card"; items: SpindleModalItemDTO[] };

// ─── Command Palette DTOs ──────────────────────────────────────────────

/**
 * Command registration payload sent by extensions to add entries
 * to the Lumiverse command palette (Cmd/Ctrl+K).
 *
 * Commands are contextual — extensions can register different sets
 * based on the current chat, page, or app state by calling
 * `spindle.commands.register()` with an updated list at any time.
 * Each call replaces all previously registered commands from that extension.
 */
export interface SpindleCommandDTO {
  /** Unique identifier for this command within the extension (e.g. `"summarize-chat"`). */
  id: string;
  /** Display label shown in the command palette. Max 80 characters. */
  label: string;
  /** Description shown below the label. Max 200 characters. */
  description: string;
  /** Optional search keywords for fuzzy matching. Max 10 keywords, 30 chars each. */
  keywords?: string[];
  /**
   * Scope restriction controlling when the command appears.
   * - `'global'` — always visible (default)
   * - `'chat'` — only when viewing a chat
   * - `'chat-idle'` — only when in a chat and not streaming
   * - `'landing'` — only on the home page
   * - `'character'` — only on character pages
   */
  scope?: "global" | "chat" | "chat-idle" | "landing" | "character";
}

/**
 * Context snapshot sent to the extension when a command is invoked
 * from the command palette. Contains the frontend's current UI state
 * so the extension can act on the right chat/character/page.
 */
export interface SpindleCommandContextDTO {
  /** Current route path (e.g. `"/chat/abc-123"`, `"/"`, `"/characters/xyz"`). */
  route: string;
  /** Active chat ID, if the user is in a chat view. */
  chatId?: string;
  /** Active character ID, if available. */
  characterId?: string;
  /** Whether the active chat is a group chat. */
  isGroupChat?: boolean;
}

// ─── UI Automation DTOs ─────────────────────────────────────────────────

/**
 * Read-only snapshot of a drawer tab discoverable via
 * {@link SpindleAPI.ui.getDrawerTabs}. Mirrors the metadata used by the
 * built-in Command Palette to render the "Panels" group.
 */
export interface SpindleUIDrawerTabDTO {
  /** Stable id used by `openDrawerTab(id)`. */
  id: string;
  /** Short label shown beneath the sidebar icon (max ~8 characters). */
  shortName: string;
  /** Full title shown in menus and the command palette. */
  tabName: string;
  /** One-line description shown in the command palette. */
  tabDescription: string;
  /** Keywords used for command-palette fuzzy search. */
  keywords: string[];
  /** Whether the tab is built into Lumiverse or contributed by another extension. */
  source: "builtin" | "extension";
  /** For extension-contributed tabs, the owning extension's identifier. */
  extensionId?: string;
}

/**
 * Read-only snapshot of a settings tab discoverable via
 * {@link SpindleAPI.ui.getSettingsTabs}. Restricted entries (`role` set) are
 * filtered out when the call resolves to a user that lacks the required role.
 */
export interface SpindleUISettingsTabDTO {
  /** Stable id used by `openSettings(id)`. */
  id: string;
  /** Short label shown in the settings sidebar. */
  shortName: string;
  /** Full title shown in the settings header / command palette. */
  tabName: string;
  /** One-line description shown in the command palette. */
  tabDescription: string;
  /** Keywords used for command-palette fuzzy search. */
  keywords: string[];
  /** Set when the tab is only visible to certain roles. */
  role?: "admin" | "owner";
}

// ─── Frontend Process Lifecycle DTOs ────────────────────────────────────

/** High-level lifecycle state for a frontend process tracked by the backend host. */
export type FrontendProcessStateDTO =
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "completed"
  | "failed"
  | "timed_out";

/** Terminal reason attached to lifecycle events and snapshots when available. */
export type FrontendProcessExitReasonDTO =
  | "completed"
  | "failed"
  | "stopped"
  | "timed_out"
  | "frontend_unloaded"
  | "backend_unloaded"
  | "replaced";

/** Options used when spawning a tracked frontend process from the backend worker. */
export interface FrontendProcessSpawnOptionsDTO {
  /** Frontend handler key registered via `ctx.processes.register(kind, ...)`. */
  kind: string;
  /** Optional extension-defined stable key used for dedupe / replacement semantics. */
  key?: string;
  /** Optional process-scoped startup payload delivered to the frontend handler. */
  payload?: unknown;
  /** Arbitrary metadata stored alongside the process snapshot for backend bookkeeping. */
  metadata?: Record<string, unknown>;
  /** For operator-scoped extensions only. */
  userId?: string;
  /** Reject spawn if the frontend does not call `process.ready()` within this window. */
  startupTimeoutMs?: number;
  /** Mark the process timed out if the frontend stops heartbeating for this long after ready. */
  heartbeatTimeoutMs?: number;
  /** Replace any existing process with the same `key` for the target user. */
  replaceExisting?: boolean;
}

/** Filter used for controller list queries. */
export interface FrontendProcessListOptionsDTO {
  userId?: string;
  kind?: string;
  key?: string;
  state?: FrontendProcessStateDTO;
}

/** Current host-tracked snapshot of a frontend process. */
export interface FrontendProcessInfoDTO {
  processId: string;
  kind: string;
  key?: string;
  state: FrontendProcessStateDTO;
  userId?: string;
  metadata?: Record<string, unknown>;
  startedAt: string;
  readyAt?: string;
  lastHeartbeatAt?: string;
  endedAt?: string;
  exitReason?: FrontendProcessExitReasonDTO;
  error?: string;
}

/** Lifecycle event emitted to backend workers for tracked frontend processes. */
export interface FrontendProcessLifecycleEventDTO {
  processId: string;
  kind: string;
  key?: string;
  userId?: string;
  state: FrontendProcessStateDTO;
  previousState?: FrontendProcessStateDTO;
  at: string;
  exitReason?: FrontendProcessExitReasonDTO;
  error?: string;
  metadata?: Record<string, unknown>;
}

/** Options for graceful process termination. */
export interface FrontendProcessStopOptionsDTO {
  userId?: string;
  /** Optional reason surfaced to the frontend process' stop handler. */
  reason?: string;
}

// ─── Backend Process Lifecycle DTOs ─────────────────────────────────────

/** High-level lifecycle state for an isolated backend subprocess tracked by the host. */
export type BackendProcessStateDTO =
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "completed"
  | "failed"
  | "timed_out";

/** Terminal reason attached to backend-process lifecycle events and snapshots when available. */
export type BackendProcessExitReasonDTO =
  | "completed"
  | "failed"
  | "stopped"
  | "timed_out"
  | "backend_unloaded"
  | "replaced";

/** Options used when spawning an isolated backend subprocess from the backend worker. */
export interface BackendProcessSpawnOptionsDTO {
  /** Built JS entry file under the extension repo, typically in `dist/`. */
  entry: string;
  /** Optional logical label used for lifecycle filtering and dedupe semantics. Defaults to `entry`. */
  kind?: string;
  /** Optional extension-defined stable key used for dedupe / replacement semantics. */
  key?: string;
  /** Optional process-scoped startup payload delivered to the subprocess entry. */
  payload?: unknown;
  /** Arbitrary metadata stored alongside the process snapshot for backend bookkeeping. */
  metadata?: Record<string, unknown>;
  /** For operator-scoped extensions only. */
  userId?: string;
  /** Reject spawn if the subprocess does not call `process.ready()` within this window. */
  startupTimeoutMs?: number;
  /** Mark the subprocess timed out if it stops heartbeating for this long after ready. */
  heartbeatTimeoutMs?: number;
  /** Replace any existing process with the same `key` for the target user. */
  replaceExisting?: boolean;
}

/** Filter used for backend subprocess list queries. */
export interface BackendProcessListOptionsDTO {
  userId?: string;
  kind?: string;
  key?: string;
  state?: BackendProcessStateDTO;
}

/** Current host-tracked snapshot of an isolated backend subprocess. */
export interface BackendProcessInfoDTO {
  processId: string;
  entry: string;
  kind: string;
  key?: string;
  state: BackendProcessStateDTO;
  userId?: string;
  metadata?: Record<string, unknown>;
  startedAt: string;
  readyAt?: string;
  lastHeartbeatAt?: string;
  endedAt?: string;
  exitReason?: BackendProcessExitReasonDTO;
  error?: string;
}

/** Lifecycle event emitted to backend workers for isolated backend subprocesses. */
export interface BackendProcessLifecycleEventDTO {
  processId: string;
  entry: string;
  kind: string;
  key?: string;
  userId?: string;
  state: BackendProcessStateDTO;
  previousState?: BackendProcessStateDTO;
  at: string;
  exitReason?: BackendProcessExitReasonDTO;
  error?: string;
  metadata?: Record<string, unknown>;
}

/** Options for graceful isolated-backend-process termination. */
export interface BackendProcessStopOptionsDTO {
  userId?: string;
  /** Optional reason surfaced to the subprocess stop handler. */
  reason?: string;
}

// ─── Generation Event Payload DTOs ──────────────────────────────────────

/** Payload for `GENERATION_STARTED` events. */
export interface GenerationStartedPayloadDTO {
  generationId: string;
  chatId: string;
  model: string;
  targetMessageId?: string;
  characterId?: string;
  characterName?: string;
  breakdown?: AssemblyBreakdownEntryDTO[];
  /** The type of generation: normal, continue, regenerate, swipe, or impersonate. */
  generationType?: string;
}

/** Payload for `STREAM_TOKEN_RECEIVED` events. */
export interface StreamTokenPayloadDTO {
  generationId: string;
  chatId: string;
  /** The token text chunk. */
  token: string;
  /** Monotonic sequence number for deduplication on reconnect. */
  seq: number;
  /** Present and set to `"reasoning"` for chain-of-thought tokens. */
  type?: "reasoning";
}

/** Payload for `GENERATION_ENDED` events. */
export interface GenerationEndedPayloadDTO {
  generationId: string;
  chatId: string;
  /** ID of the saved message (absent on error). */
  messageId?: string;
  /** Final generated content (absent on error). */
  content?: string;
  /** Error message when the generation failed. */
  error?: string;
  /** The type of generation: normal, continue, regenerate, swipe, or impersonate. */
  generationType?: string;
}

/** Payload for `GENERATION_STOPPED` events (user-initiated stop). */
export interface GenerationStoppedPayloadDTO {
  generationId: string;
  chatId: string;
  /** Partial content accumulated before the stop. */
  content?: string;
}

// ─── Chat Message Event Payload DTOs ────────────────────────────────────

/**
 * Wire shape of a chat message as delivered in WebSocket event payloads
 * (e.g. `MESSAGE_SENT`, `MESSAGE_EDITED`, `MESSAGE_SWIPED`).
 *
 * `spindle.chat.getMessages()` returns this backend shape plus normalized
 * convenience fields such as `role` and `metadata`.
 */
export interface ChatMessageDTO {
  id: string;
  chat_id: string;
  index_in_chat: number;
  is_user: boolean;
  name: string;
  /** The currently active swipe content (mirrors `swipes[swipe_id]`). */
  content: string;
  send_date: number;
  /** Index of the active swipe in `swipes`. `0` when the message has no alternates. */
  swipe_id: number;
  /** All swipe variants for this message, including the currently active one. */
  swipes: string[];
  /** Per-swipe creation timestamps (unix epoch seconds), aligned with `swipes`. */
  swipe_dates: number[];
  /** Free-form metadata bag (attachments, spindle metadata, reasoning, etc.). */
  extra: Record<string, unknown>;
  parent_message_id: string | null;
  branch_id: string | null;
  created_at: number;
}

/**
 * Distinguishes the four ways a `MESSAGE_SWIPED` event can be triggered.
 *
 *  - `'added'`     — a new swipe variant was created (e.g. regenerate, manual add)
 *  - `'updated'`   — an existing swipe's content was edited in place
 *  - `'deleted'`   — a swipe variant was removed from the message
 *  - `'navigated'` — the user (or an extension) cycled the active swipe slot
 */
export type MessageSwipeAction = "added" | "updated" | "deleted" | "navigated";

/**
 * Payload for `MESSAGE_SWIPED` events.
 *
 * The discriminator fields (`action`, `swipeId`, `previousSwipeId`) let
 * extensions tell the four swipe operations apart and maintain swipe-keyed
 * state correctly without diffing the `swipes` array on every event.
 */
export interface MessageSwipedPayloadDTO {
  chatId: string;
  /** The full message after the mutation. */
  message: ChatMessageDTO;
  /** Distinguishes which swipe operation produced this event. */
  action: MessageSwipeAction;
  /**
   * The swipe index this event concerns. Semantics depend on `action`:
   *
   *  - `'added'`     — index of the new swipe (equal to `message.swipe_id` post-add)
   *  - `'updated'`   — index of the edited swipe (may or may not equal `message.swipe_id`)
   *  - `'deleted'`   — index that was removed. Note: this slot is no longer present
   *                    in `message.swipes`, and `message.swipe_id` may have shifted
   *                    if the deleted slot was at or before the previously active one.
   *  - `'navigated'` — destination index (equal to `message.swipe_id`)
   */
  swipeId: number;
  /**
   * For `'navigated'` and `'deleted'` events: the active swipe index *before*
   * the change. Useful for direction detection on navigation, and for detecting
   * whether the active slot was the one removed on deletion. Omitted for
   * `'added'` and `'updated'`.
   */
  previousSwipeId?: number;
}

/**
 * Payload for `SWIPE_EDITED` events.
 *
 * Fires when `spindle.chat.updateMessage()` explicitly supplies one or more
 * swipe-shaped fields (`swipes`, `swipe_id`, or `swipe_dates`). Plain content
 * edits that mirror into the active swipe slot continue to emit only
 * `MESSAGE_EDITED` — this event is for extension-driven rewrites of the
 * swipe array itself, index navigation, or date-array rewrites.
 *
 * `MESSAGE_SWIPED` still fires for the dedicated swipe REST routes
 * (`addSwipe`, `updateSwipe`, `deleteSwipe`, `cycleSwipe`) with its
 * `action` discriminator. Consumers that need fine-grained action semantics
 * should prefer `MESSAGE_SWIPED`; `SWIPE_EDITED` is intentionally coarser.
 */
export interface SwipeEditedPayloadDTO {
  chatId: string;
  /** The full message after the mutation. */
  message: ChatMessageDTO;
  /** Active swipe index before the mutation. Equals `message.swipe_id` when navigation did not occur. */
  previousSwipeId: number;
}

/**
 * Payload delivered to `spindle.on("TOOL_INVOCATION", ...)` handlers.
 *
 * Fires whenever an extension-registered tool is invoked by Lumiverse. Handlers
 * must return a string (or promise thereof) with the tool's result — the host
 * coerces `undefined` / `null` to an empty string.
 *
 * `councilMember` is populated when the invocation originates from a council
 * execution cycle, providing the assigned member's identity, role, chance,
 * avatar URL, and Lumia personality fields. It is `undefined` for all other
 * invocation paths.
 *
 * `contextMessages` is populated when the invocation originates from a council
 * execution cycle — carrying the structured chat context (system enrichment +
 * chat history) that was assembled for this member. Extensions can inspect
 * role boundaries directly instead of re-parsing the flattened `args.context`
 * string. Multi-part message content is flattened to its text portion before
 * being delivered. `undefined` for non-council invocation paths.
 */
export interface ToolInvocationPayloadDTO {
  /** The bare (unqualified) tool name, matching what was passed to `registerTool`. */
  toolName: string;
  /** Arguments delivered to the tool. Shape depends on the tool's JSON Schema. */
  args: Record<string, unknown>;
  /** Host-side correlation id for this invocation. */
  requestId: string;
  /** Council member snapshot when invoked via council — otherwise `undefined`. */
  councilMember?: CouncilMemberContext;
  /**
   * Structured chat context for council invocations — preserves role
   * boundaries lost by the flattened `args.context` string. `undefined` for
   * non-council paths.
   */
  contextMessages?: LlmMessageDTO[];
}

/**
 * Observer handle returned by `spindle.generate.observe()`.
 * Provides a high-level API for watching an in-flight generation on a
 * specific chat, with automatic token accumulation and lifecycle callbacks.
 */
export interface GenerationObserver {
  /** Register a callback for when a generation starts on the observed chat. */
  onStart(handler: (info: GenerationStartedPayloadDTO) => void): void;
  /** Register a callback for each streamed token (content or reasoning). */
  onToken(handler: (token: StreamTokenPayloadDTO) => void): void;
  /** Register a callback for when the generation completes (success or error). */
  onEnd(handler: (result: GenerationEndedPayloadDTO) => void): void;
  /** Register a callback for when the generation is stopped by the user. */
  onStop(handler: (result: GenerationStoppedPayloadDTO) => void): void;
  /** Accumulated content tokens so far. */
  readonly content: string;
  /** Accumulated reasoning tokens so far. */
  readonly reasoning: string;
  /** The active generation ID, or `null` if idle. */
  readonly generationId: string | null;
  /** Stop observing and unsubscribe from all events. */
  dispose(): void;
}

// ─── Token Count DTOs ───────────────────────────────────────────────────

/** Where the model used for server-side token counting came from. */
export type TokenModelSourceDTO = "main" | "sidecar" | "explicit";

/** Optional settings for Spindle token count helpers. */
export interface TokenCountOptionsDTO {
  /**
   * Explicit model ID to resolve the tokenizer against.
   *
   * When provided, this takes precedence over `modelSource`.
   */
  model?: string;
  /**
   * Which configured model to use when resolving the tokenizer.
   *
    * - `"main"`    → the user's default main connection profile model
    * - `"sidecar"` → the user's selected sidecar model (or its backing connection model)
   *
   * Defaults to `"main"`.
   */
  modelSource?: TokenModelSourceDTO;
  /** For operator-scoped extensions. */
  userId?: string;
}

/** Server-resolved token count result for a text or chat payload. */
export interface TokenCountResultDTO {
  total_tokens: number;
  /** Model ID that was actually used to resolve the tokenizer. */
  model: string;
  /** Whether the model came from the main connection, sidecar selection, or an explicit override. */
  modelSource: TokenModelSourceDTO;
  /** Null when no exact tokenizer match was found and an approximate fallback was used. */
  tokenizer_id: string | null;
  tokenizer_name: string;
  /** True when Lumiverse had to fall back to its approximate char/4 heuristic. */
  approximate: boolean;
}

/** A completed resumable upload read back by `spindle.uploads.get`. */
export interface SpindleUploadDTO {
  fileName: string;
  size: number;
  data: Uint8Array;
}

/** Context delivered to an on-request shared RPC endpoint handler. */
export interface SharedRpcRequestContextDTO {
  /** Fully-qualified endpoint name (for example `weather_ext.status.current`). */
  endpoint: string;
  /** Identifier of the extension requesting the value. */
  requesterExtensionId: string;
  /** Gated permissions available while this delegated handler request is running. */
  effectivePermissions: readonly string[];
}

/** Optional read policy for a shared RPC endpoint. Omit to require legacy owner-permission inheritance. */
export interface SharedRpcEndpointPolicyDTO {
  /** Gated permissions both owner and requester must have; `[]` means no gated permissions are delegated. */
  requires?: readonly string[];
}

// ─── Worker → Host messages ──────────────────────────────────────────────

export type WorkerToHost =
  | { type: "subscribe_event"; event: string }
  | { type: "unsubscribe_event"; event: string }
  | { type: "register_macro"; definition: MacroDefinitionDTO }
  | { type: "unregister_macro"; name: string }
  | { type: "update_macro_value"; name: string; value: string }
  | { type: "register_interceptor"; priority?: number }
  | {
      type: "intercept_result";
      requestId: string;
      messages: LlmMessageDTO[];
      parameters?: Record<string, unknown>;
      breakdown?: InterceptorBreakdownEntryDTO[];
    }
  | { type: "register_tool"; tool: ToolRegistrationDTO }
  | { type: "unregister_tool"; name: string }
  | { type: "request_generation"; requestId: string; input: GenerationRequestDTO }
  /**
   * Start a streaming generation. The host responds asynchronously with
   * one or more `generation_stream_chunk` messages, terminating with a
   * `done` chunk on success or a `generation_stream_error` on failure.
   */
  | { type: "request_generation_stream"; requestId: string; input: GenerationRequestDTO }
  /**
   * Cancel an in-flight generation started via `request_generation` or
   * `request_generation_stream`. `requestId` matches the original request.
   * The host aborts the upstream LLM fetch and responds with an `AbortError`.
   */
  | { type: "cancel_generation"; requestId: string }
  | { type: "storage_read"; requestId: string; path: string }
  | { type: "storage_write"; requestId: string; path: string; data: string }
  | { type: "storage_read_binary"; requestId: string; path: string }
  | {
      type: "storage_write_binary";
      requestId: string;
      path: string;
      data: Uint8Array;
    }
  | { type: "storage_delete"; requestId: string; path: string }
  | { type: "storage_list"; requestId: string; prefix?: string }
  | { type: "storage_exists"; requestId: string; path: string }
  | { type: "storage_mkdir"; requestId: string; path: string }
  | { type: "storage_move"; requestId: string; from: string; to: string }
  | { type: "storage_stat"; requestId: string; path: string }
  | { type: "ephemeral_read"; requestId: string; path: string }
  | {
      type: "ephemeral_write";
      requestId: string;
      path: string;
      data: string;
      ttlMs?: number;
      reservationId?: string;
    }
  | { type: "ephemeral_read_binary"; requestId: string; path: string }
  | {
      type: "ephemeral_write_binary";
      requestId: string;
      path: string;
      data: Uint8Array;
      ttlMs?: number;
      reservationId?: string;
    }
  | { type: "ephemeral_delete"; requestId: string; path: string }
  | { type: "ephemeral_list"; requestId: string; prefix?: string }
  | { type: "ephemeral_stat"; requestId: string; path: string }
  | { type: "ephemeral_clear_expired"; requestId: string }
  | { type: "ephemeral_pool_status"; requestId: string }
  | {
      type: "ephemeral_request_block";
      requestId: string;
      sizeBytes: number;
      ttlMs?: number;
      reason?: string;
    }
  | {
      type: "ephemeral_release_block";
      requestId: string;
      reservationId: string;
    }
  | { type: "permissions_get_granted"; requestId: string }
  | { type: "rpc_pool_sync"; endpoint: string; value: unknown; policy?: SharedRpcEndpointPolicyDTO; rpcPermissionScopeId?: string }
  | { type: "rpc_pool_register_handler"; endpoint: string; policy?: SharedRpcEndpointPolicyDTO; rpcPermissionScopeId?: string }
  | { type: "rpc_pool_unregister"; endpoint: string }
  | { type: "rpc_pool_read"; requestId: string; endpoint: string; rpcPermissionScopeId?: string }
  | {
      type: "rpc_pool_handler_result";
      requestId: string;
      result?: unknown;
      error?: string;
      rpcPermissionScopeId?: string;
    }
  | { type: "connections_list"; requestId: string; userId?: string }
  | { type: "connections_get"; requestId: string; connectionId: string; userId?: string }
  | { type: "chat_get_messages"; requestId: string; chatId: string }
  | {
      type: "chat_append_message";
      requestId: string;
      chatId: string;
      message: {
        role: "system" | "user" | "assistant";
        content: string;
        metadata?: Record<string, unknown>;
      };
      options?: ChatAppendMessageOptionsDTO;
    }
  | {
      type: "chat_update_message";
      requestId: string;
      chatId: string;
      messageId: string;
      patch: {
        content?: string;
        metadata?: Record<string, unknown>;
        swipes?: string[];
        swipe_id?: number;
        swipe_dates?: number[];
        reasoning?: { text?: string | null; duration?: number | null };
        skipChunkRebuild?: boolean;
      };
    }
  | {
      type: "chat_delete_message";
      requestId: string;
      chatId: string;
      messageId: string;
    }
  | {
      type: "chat_set_message_hidden";
      requestId: string;
      chatId: string;
      messageId: string;
      hidden: boolean;
    }
  | {
      type: "chat_set_messages_hidden";
      requestId: string;
      chatId: string;
      messageIds: string[];
      hidden: boolean;
    }
  | {
      type: "chat_is_message_hidden";
      requestId: string;
      chatId: string;
      messageId: string;
    }
  | {
      type: "chat_set_style_mode";
      requestId: string;
      chatId: string;
      mode: "bounded" | "extension-relaxed";
      userId?: string;
    }
  | {
      type: "events_track";
      requestId: string;
      eventName: string;
      payload?: Record<string, unknown>;
      options?: {
        level?: "debug" | "info" | "warn" | "error";
        chatId?: string;
        retentionDays?: number;
      };
    }
  | {
      type: "events_query";
      requestId: string;
      filter?: {
        eventName?: string;
        chatId?: string;
        since?: string;
        until?: string;
        level?: "debug" | "info" | "warn" | "error";
        limit?: number;
      };
    }
  | {
      type: "events_replay";
      requestId: string;
      filter?: {
        eventName?: string;
        chatId?: string;
        since?: string;
        until?: string;
        level?: "debug" | "info" | "warn" | "error";
        limit?: number;
      };
    }
  | {
      type: "events_get_latest_state";
      requestId: string;
      keys: string[];
    }
  | { type: "cors_request"; requestId: string; url: string; options: RequestInitDTO }
  | { type: "register_context_handler"; priority?: number }
  | {
      type: "context_handler_result";
      requestId: string;
      context: unknown;
    }
  // ─── Macro Interceptor (gated: "macro_interceptor") ────────────────
  | { type: "register_macro_interceptor"; priority?: number }
  | {
      type: "macro_interceptor_result";
      requestId: string;
      result: MacroInterceptorResultDTO;
    }
  // ─── World Info Interceptor (gated: "generation") ──────────────────
  | { type: "register_world_info_interceptor"; priority?: number }
  | {
      type: "world_info_interceptor_result";
      requestId: string;
      result: WorldInfoInterceptorResultDTO | null;
    }
  // ─── Message Content Processor (gated: "chat_mutation") ────────────
  | { type: "register_message_content_processor"; priority?: number }
  | {
      type: "message_content_processor_result";
      requestId: string;
      result: MessageContentProcessorResultDTO | void;
    }
  | {
      type: "macro_result";
      requestId: string;
      result?: string;
      error?: string;
    }
  | { type: "frontend_message"; payload: unknown; userId?: string }
  | { type: "user_storage_read"; requestId: string; path: string; userId?: string }
  | { type: "user_storage_write"; requestId: string; path: string; data: string; userId?: string }
  | { type: "user_storage_read_binary"; requestId: string; path: string; userId?: string }
  | {
      type: "user_storage_write_binary";
      requestId: string;
      path: string;
      data: Uint8Array;
      userId?: string;
    }
  | { type: "user_storage_delete"; requestId: string; path: string; userId?: string }
  | { type: "user_storage_list"; requestId: string; prefix?: string; userId?: string }
  | { type: "user_storage_exists"; requestId: string; path: string; userId?: string }
  | { type: "user_storage_mkdir"; requestId: string; path: string; userId?: string }
  | { type: "user_storage_move"; requestId: string; from: string; to: string; userId?: string }
  | { type: "user_storage_stat"; requestId: string; path: string; userId?: string }
  | { type: "enclave_put"; requestId: string; key: string; value: string; userId?: string }
  | { type: "enclave_get"; requestId: string; key: string; userId?: string }
  | { type: "enclave_delete"; requestId: string; key: string; userId?: string }
  | { type: "enclave_has"; requestId: string; key: string; userId?: string }
  | { type: "enclave_list"; requestId: string; userId?: string }
  | {
      type: "oauth_callback_result";
      requestId: string;
      html?: string;
      error?: string;
    }
  | { type: "tool_invocation_result"; requestId: string; result?: string; error?: string }
  | { type: "create_oauth_state"; requestId: string }
  | { type: "log"; level: "info" | "warn" | "error"; message: string }
  // ─── Variables (free tier) ──────────────────────────────────────────
  | { type: "vars_get_local"; requestId: string; chatId: string; key: string }
  | { type: "vars_set_local"; requestId: string; chatId: string; key: string; value: string }
  | { type: "vars_delete_local"; requestId: string; chatId: string; key: string }
  | { type: "vars_list_local"; requestId: string; chatId: string }
  | { type: "vars_has_local"; requestId: string; chatId: string; key: string }
  | { type: "vars_get_global"; requestId: string; key: string; userId?: string }
  | { type: "vars_set_global"; requestId: string; key: string; value: string; userId?: string }
  | { type: "vars_delete_global"; requestId: string; key: string; userId?: string }
  | { type: "vars_list_global"; requestId: string; userId?: string }
  | { type: "vars_has_global"; requestId: string; key: string; userId?: string }
  | { type: "vars_get_chat"; requestId: string; chatId: string; key: string }
  | { type: "vars_set_chat"; requestId: string; chatId: string; key: string; value: string }
  | { type: "vars_delete_chat"; requestId: string; chatId: string; key: string }
  | { type: "vars_list_chat"; requestId: string; chatId: string }
  | { type: "vars_has_chat"; requestId: string; chatId: string; key: string }
  // ─── Characters (gated: "characters") ──────────────────────────────
  | { type: "characters_list"; requestId: string; limit?: number; offset?: number; userId?: string }
  | { type: "characters_get"; requestId: string; characterId: string; userId?: string }
  | { type: "characters_create"; requestId: string; input: CharacterCreateDTO; userId?: string }
  | { type: "characters_set_avatar"; requestId: string; characterId: string; avatar: CharacterAvatarUploadDTO; userId?: string }
  | { type: "characters_update"; requestId: string; characterId: string; input: CharacterUpdateDTO; userId?: string }
  | { type: "characters_delete"; requestId: string; characterId: string; userId?: string }
  // ─── Chats (gated: "chats") ────────────────────────────────────────
  | { type: "chats_list"; requestId: string; characterId?: string; limit?: number; offset?: number; userId?: string }
  | { type: "chats_get"; requestId: string; chatId: string; userId?: string }
  | { type: "chats_get_active"; requestId: string; userId?: string }
  | { type: "chats_update"; requestId: string; chatId: string; input: ChatUpdateDTO; userId?: string }
  | { type: "chats_delete"; requestId: string; chatId: string; userId?: string }
  // ─── User Presets (gated: "presets") ────────────────────────────────
  | { type: "presets_list"; requestId: string; limit?: number; offset?: number; userId?: string }
  | { type: "presets_get"; requestId: string; presetId: string; userId?: string }
  | { type: "presets_create"; requestId: string; input: UserPresetCreateDTO; userId?: string }
  | { type: "presets_update"; requestId: string; presetId: string; input: UserPresetUpdateDTO; userId?: string }
  | { type: "presets_delete"; requestId: string; presetId: string; userId?: string }
  | { type: "preset_blocks_list"; requestId: string; presetId: string; userId?: string }
  | { type: "preset_blocks_get"; requestId: string; presetId: string; blockId: string; userId?: string }
  | { type: "preset_blocks_create"; requestId: string; presetId: string; input: PromptBlockCreateDTO; index?: number; userId?: string }
  | { type: "preset_blocks_update"; requestId: string; presetId: string; blockId: string; input: PromptBlockUpdateDTO; userId?: string }
  | { type: "preset_blocks_delete"; requestId: string; presetId: string; blockId: string; userId?: string }
  | { type: "preset_categories_list"; requestId: string; presetId: string; userId?: string }
  // ─── World Books (gated: "world_books") ──────────────────────────────
  | { type: "world_books_list"; requestId: string; limit?: number; offset?: number; userId?: string }
  | { type: "world_books_get"; requestId: string; worldBookId: string; userId?: string }
  | { type: "world_books_create"; requestId: string; input: WorldBookCreateDTO; userId?: string }
  | { type: "world_books_update"; requestId: string; worldBookId: string; input: WorldBookUpdateDTO; userId?: string }
  | { type: "world_books_delete"; requestId: string; worldBookId: string; userId?: string }
  // ─── World Book Entries (gated: "world_books") ───────────────────────
  | { type: "world_book_entries_list"; requestId: string; worldBookId: string; limit?: number; offset?: number; userId?: string }
  | { type: "world_book_entries_get"; requestId: string; entryId: string; userId?: string }
  | { type: "world_book_entries_create"; requestId: string; worldBookId: string; input: WorldBookEntryCreateDTO; userId?: string }
  | { type: "world_book_entries_update"; requestId: string; entryId: string; input: WorldBookEntryUpdateDTO; userId?: string }
  | { type: "world_book_entries_delete"; requestId: string; entryId: string; userId?: string }
  // ─── Databanks (gated: "databanks") ───────────────────────────────────
  | { type: "databanks_list"; requestId: string; limit?: number; offset?: number; scope?: DatabankScopeDTO; scopeId?: string | null; userId?: string }
  | { type: "databanks_get"; requestId: string; databankId: string; userId?: string }
  | { type: "databanks_create"; requestId: string; input: DatabankCreateDTO; userId?: string }
  | { type: "databanks_update"; requestId: string; databankId: string; input: DatabankUpdateDTO; userId?: string }
  | { type: "databanks_delete"; requestId: string; databankId: string; userId?: string }
  // ─── Databank Documents (gated: "databanks") ─────────────────────────
  | { type: "databank_documents_list"; requestId: string; databankId: string; limit?: number; offset?: number; userId?: string }
  | { type: "databank_documents_get"; requestId: string; documentId: string; userId?: string }
  | { type: "databank_documents_create"; requestId: string; databankId: string; input: DatabankDocumentCreateDTO; userId?: string }
  | { type: "databank_documents_update"; requestId: string; documentId: string; input: DatabankDocumentUpdateDTO; userId?: string }
  | { type: "databank_documents_delete"; requestId: string; documentId: string; userId?: string }
  | { type: "databank_documents_get_content"; requestId: string; documentId: string; userId?: string }
  | { type: "databank_documents_reprocess"; requestId: string; documentId: string; userId?: string }
  // ─── Personas (gated: "personas") ────────────────────────────────────
  | { type: "personas_list"; requestId: string; limit?: number; offset?: number; userId?: string }
  | { type: "personas_get"; requestId: string; personaId: string; userId?: string }
  | { type: "personas_get_default"; requestId: string; userId?: string }
  | { type: "personas_get_active"; requestId: string; userId?: string }
  | { type: "personas_create"; requestId: string; input: PersonaCreateDTO; userId?: string }
  | { type: "personas_update"; requestId: string; personaId: string; input: PersonaUpdateDTO; userId?: string }
  | { type: "personas_delete"; requestId: string; personaId: string; userId?: string }
  | { type: "personas_switch"; requestId: string; personaId: string | null; userId?: string }
  | { type: "personas_get_world_book"; requestId: string; personaId: string; userId?: string }
  // ─── Global Add-ons (gated: "personas") ──────────────────────────
  | { type: "global_addons_list"; requestId: string; limit?: number; offset?: number; userId?: string }
  | { type: "global_addons_get"; requestId: string; addonId: string; userId?: string }
  | { type: "global_addons_update"; requestId: string; addonId: string; input: GlobalAddonUpdateDTO; userId?: string }
  // ─── Council (free tier, read-only) ──────────────────────────────
  | { type: "council_get_settings"; requestId: string; userId?: string }
  | { type: "council_get_members"; requestId: string; userId?: string }
  | { type: "council_get_available_lumia_items"; requestId: string; userId?: string }
  // ─── Activated World Info (gated: "world_books") ───────────────────
  | { type: "world_books_get_activated"; requestId: string; chatId: string; userId?: string }
  // ─── Global World Books (gated: "world_books") ───────────────────────
  | { type: "world_books_get_global"; requestId: string; userId?: string }
  | { type: "world_books_set_global"; requestId: string; worldBookIds: string[]; userId?: string }
  | { type: "world_books_activate_global"; requestId: string; worldBookId: string; userId?: string }
  | { type: "world_books_deactivate_global"; requestId: string; worldBookId: string; userId?: string }
  // ─── Regex Scripts (gated: "regex_scripts") ────────────────────────
  | { type: "regex_scripts_list"; requestId: string; scope?: RegexScopeDTO; scopeId?: string; target?: RegexTargetDTO; limit?: number; offset?: number; userId?: string }
  | { type: "regex_scripts_get"; requestId: string; scriptId: string; userId?: string }
  | { type: "regex_scripts_get_active"; requestId: string; target: RegexTargetDTO; characterId?: string; chatId?: string; userId?: string }
  | { type: "regex_scripts_create"; requestId: string; input: RegexScriptCreateDTO; userId?: string }
  | { type: "regex_scripts_update"; requestId: string; scriptId: string; input: RegexScriptUpdateDTO; userId?: string }
  | { type: "regex_scripts_delete"; requestId: string; scriptId: string; userId?: string }
  // ─── Dry Run (gated: "generation") ────────────────────────────────
  | { type: "generate_dry_run"; requestId: string; input: DryRunRequestDTO; userId?: string }
  // ─── Chat Memories (gated: "chats") ───────────────────────────────
  | { type: "chats_get_memories"; requestId: string; chatId: string; topK?: number; userId?: string }
  // ─── Memory Cortex & Long-Term Chat Memory (gated: "memories") ────
  | { type: "memories_config_get"; requestId: string; userId?: string }
  | { type: "memories_config_put"; requestId: string; patch: Partial<MemoryCortexConfigDTO>; userId?: string }
  | { type: "memories_query_cortex"; requestId: string; query: CortexQueryDTO }
  | { type: "memories_query_linked"; requestId: string; chatId: string; queryText?: string; userId?: string }
  | { type: "memories_get_cached"; requestId: string; chatId: string }
  | { type: "memories_get_cached_linked"; requestId: string; chatId: string }
  | { type: "memories_invalidate_cache"; requestId: string; chatId: string }
  | { type: "memories_invalidate_linked_cache"; requestId: string; chatId: string }
  | { type: "memories_entities_list"; requestId: string; chatId: string; activeOnly?: boolean; limit?: number; userId?: string }
  | { type: "memories_entities_get"; requestId: string; entityId: string; userId?: string }
  | { type: "memories_entities_find_by_name"; requestId: string; chatId: string; name: string; userId?: string }
  | { type: "memories_entities_upsert"; requestId: string; chatId: string; entity: MemoryEntityUpsertDTO; chunkId?: string | null; createdAt?: number; userId?: string }
  | { type: "memories_entities_update_status"; requestId: string; entityId: string; patch: MemoryEntityStatusUpdateDTO; userId?: string }
  | { type: "memories_entities_add_facts"; requestId: string; entityId: string; facts: string[]; userId?: string }
  | { type: "memories_entities_get_facts"; requestId: string; entityId: string; userId?: string }
  | { type: "memories_entities_update_emotional_valence"; requestId: string; entityId: string; valence: Record<string, number>; userId?: string }
  | { type: "memories_relations_list"; requestId: string; chatId: string; userId?: string }
  | { type: "memories_relations_list_all"; requestId: string; chatId: string; userId?: string }
  | { type: "memories_relations_for_entity"; requestId: string; chatId: string; entityId: string; userId?: string }
  | { type: "memories_relations_for_entities"; requestId: string; chatId: string; entityIds: string[]; limit?: number; userId?: string }
  | { type: "memories_relations_upsert"; requestId: string; chatId: string; relation: MemoryRelationUpsertDTO; chunkId?: string | null; userId?: string }
  | { type: "memories_consolidations_list"; requestId: string; chatId: string; tier?: number; userId?: string }
  | { type: "memories_consolidations_latest_arc"; requestId: string; chatId: string; userId?: string }
  | { type: "memories_consolidations_run"; requestId: string; chatId: string; userId?: string }
  | { type: "memories_salience_get"; requestId: string; chatId: string; limit?: number; offset?: number; userId?: string }
  | { type: "memories_vaults_list"; requestId: string; userId?: string }
  | { type: "memories_vaults_get"; requestId: string; vaultId: string; userId?: string }
  | { type: "memories_vaults_get_chunks"; requestId: string; vaultId: string; userId?: string }
  | { type: "memories_vaults_create"; requestId: string; input: VaultCreateDTO; userId?: string }
  | { type: "memories_vaults_rename"; requestId: string; vaultId: string; name: string; userId?: string }
  | { type: "memories_vaults_delete"; requestId: string; vaultId: string; userId?: string }
  | { type: "memories_vaults_reindex"; requestId: string; vaultId: string; userId?: string }
  | { type: "memories_links_list"; requestId: string; chatId: string; userId?: string }
  | { type: "memories_links_attach"; requestId: string; input: ChatLinkAttachDTO; userId?: string }
  | { type: "memories_links_remove"; requestId: string; chatId: string; linkId: string; userId?: string }
  | { type: "memories_links_toggle"; requestId: string; chatId: string; linkId: string; enabled: boolean; userId?: string }
  | { type: "memories_chat_chunks_list"; requestId: string; chatId: string; userId?: string }
  | { type: "memories_chat_memory_get"; requestId: string; chatId: string; topK?: number; userId?: string }
  | { type: "memories_chat_memory_warm"; requestId: string; chatId: string; force?: boolean; userId?: string }
  | { type: "memories_chat_memory_invalidate"; requestId: string; chatId: string; userId?: string }
  | { type: "memories_stats_usage"; requestId: string; chatId: string; userId?: string }
  | { type: "memories_stats_ingestion_status"; requestId: string; chatId: string; userId?: string }
  | { type: "memories_stats_ingestion_telemetry"; requestId: string; chatId: string; userId?: string }
  // ─── Toast (free tier) ───────────────────────────────────────────────
  | { type: "toast_show"; toastType: "success" | "warning" | "error" | "info"; message: string; title?: string; duration?: number; userId?: string }
  // ─── Push Notifications (gated: "push_notification") ────────────────
  | { type: "push_send"; requestId: string; title: string; body: string; tag?: string; url?: string; userId?: string; icon?: string; rawTitle?: boolean; image?: string }
  | { type: "push_get_status"; requestId: string; userId?: string }
  // ─── User Context (free tier) ──────────────────────────────────────
  | { type: "user_is_visible"; requestId: string; userId?: string }
  | { type: "user_get_role"; requestId: string; userId?: string }
  // ─── Text Editor (free tier) ───────────────────────────────────────
  | { type: "text_editor_open"; requestId: string; title?: string; value?: string; placeholder?: string; userId?: string }
  // ─── Modal (free tier) ────────────────────────────────────────────
  | { type: "modal_open"; requestId: string; modalRequestId?: string; title: string; items: SpindleModalItemDTO[]; width?: number; maxHeight?: number; persistent?: boolean; userId?: string }
  | { type: "modal_close"; requestId: string; openRequestId: string; userId?: string }
  | { type: "confirm_open"; requestId: string; title: string; message: string; variant?: "info" | "warning" | "danger" | "success"; confirmLabel?: string; cancelLabel?: string; userId?: string }
  | { type: "input_prompt_open"; requestId: string; title: string; message?: string; placeholder?: string; defaultValue?: string; submitLabel?: string; cancelLabel?: string; multiline?: boolean; userId?: string }
  // ─── Frontend Process Lifecycle (free tier) ───────────────────────────
  | { type: "frontend_process_spawn"; requestId: string; options: FrontendProcessSpawnOptionsDTO }
  | { type: "frontend_process_list"; requestId: string; filter?: FrontendProcessListOptionsDTO }
  | { type: "frontend_process_get"; requestId: string; processId: string }
  | { type: "frontend_process_stop"; requestId: string; processId: string; options?: FrontendProcessStopOptionsDTO }
  | { type: "frontend_process_send"; processId: string; payload: unknown; userId?: string }
  // ─── Backend Process Lifecycle (free tier) ────────────────────────────
  | { type: "backend_process_spawn"; requestId: string; options: BackendProcessSpawnOptionsDTO }
  | { type: "backend_process_list"; requestId: string; filter?: BackendProcessListOptionsDTO }
  | { type: "backend_process_get"; requestId: string; processId: string }
  | { type: "backend_process_stop"; requestId: string; processId: string; options?: BackendProcessStopOptionsDTO }
  | { type: "backend_process_send"; processId: string; payload: unknown; userId?: string }
  // ─── Macro Resolution (free tier) ──────────────────────────────────
  | { type: "macros_resolve"; requestId: string; template: string; chatId?: string; characterId?: string; userId?: string; commit?: boolean }
  // ─── Image Generation (gated: "image_gen") ──────────────────────────
  | { type: "image_gen_generate"; requestId: string; input: ImageGenRequestDTO }
  | { type: "image_gen_providers"; requestId: string; userId?: string }
  | { type: "image_gen_connections_list"; requestId: string; userId?: string }
  | { type: "image_gen_connections_get"; requestId: string; connectionId: string; userId?: string }
  | { type: "image_gen_models"; requestId: string; connectionId: string; userId?: string }
  // ─── Images (gated: "images") ────────────────────────────────────────
  | {
      type: "images_list";
      requestId: string;
      limit?: number;
      offset?: number;
      specificity?: ImageSpecificityDTO;
      onlyOwned?: boolean;
      characterId?: string;
      chatId?: string;
      userId?: string;
    }
  | {
      type: "images_get";
      requestId: string;
      imageId: string;
      specificity?: ImageSpecificityDTO;
      onlyOwned?: boolean;
      characterId?: string;
      chatId?: string;
      userId?: string;
    }
  | { type: "images_upload"; requestId: string; input: ImageUploadDTO; userId?: string }
  | {
      type: "images_upload_many";
      requestId: string;
      items: ImageUploadDTO[];
      userId?: string;
      concurrency?: number;
    }
  | {
      type: "images_upload_from_data_url";
      requestId: string;
      dataUrl: string;
      originalFilename?: string;
      owner_character_id?: string;
      owner_chat_id?: string;
      userId?: string;
    }
  | { type: "images_delete"; requestId: string; imageId: string; userId?: string }
  // ─── Theme (gated: "app_manipulation") ──────────────────────────────────
  | { type: "theme_apply"; requestId: string; overrides: ThemeOverrideDTO; userId?: string }
  | { type: "theme_apply_palette"; requestId: string; palette: ThemePaletteConfigDTO | null; userId?: string }
  | { type: "theme_clear"; requestId: string; userId?: string }
  | { type: "theme_get_current"; requestId: string; userId?: string }
  // ─── Color Extraction (gated: "app_manipulation") ─────────────────────
  | { type: "color_extract"; requestId: string; imageId: string; userId?: string }
  // ─── Theme Variable Generation (gated: "app_manipulation") ────────────
  | { type: "theme_generate_variables"; requestId: string; config: ThemeVariablesConfigDTO }
  // ─── Commands (free tier) ──────────────────────────────────────────────
  | { type: "commands_register"; commands: SpindleCommandDTO[] }
  | { type: "commands_unregister"; commandIds: string[] }
  // ─── Version (free tier) ───────────────────────────────────────────────
  | { type: "version_get_backend"; requestId: string }
  | { type: "version_get_frontend"; requestId: string }
  // ─── Token Counting (free tier) ───────────────────────────────────────
  | {
      type: "tokens_count_text";
      requestId: string;
      text: string;
      model?: string;
      modelSource?: TokenModelSourceDTO;
      userId?: string;
    }
  | {
      type: "tokens_count_messages";
      requestId: string;
      messages: Array<Pick<LlmMessageDTO, "role" | "content">>;
      model?: string;
      modelSource?: TokenModelSourceDTO;
      userId?: string;
    }
  | {
      type: "tokens_count_chat";
      requestId: string;
      chatId: string;
      model?: string;
      modelSource?: TokenModelSourceDTO;
      userId?: string;
    }
  // ─── Web Search (gated: "web_search") ─────────────────────────────────
  | {
      type: "web_search_query";
      requestId: string;
      query: string;
      count?: number;
      scrape?: boolean;
      userId?: string;
    }
  | { type: "web_search_get_settings"; requestId: string; userId?: string }
  // ─── UI Automation (free tier) ────────────────────────────────────────
  | { type: "ui_get_drawer_tabs"; requestId: string; userId?: string }
  | { type: "ui_get_settings_tabs"; requestId: string; userId?: string }
  | {
      type: "ui_navigate";
      requestId: string;
      action:
        | "open_drawer_tab"
        | "close_drawer"
        | "open_settings"
        | "close_settings"
        | "open_command_palette"
        | "close_command_palette";
      tabId?: string;
      viewId?: string;
      userId?: string;
    };

// ─── Host → Worker messages ──────────────────────────────────────────────

export type HostToWorker =
  | { type: "init"; manifest: SpindleManifest; storagePath: string }
  | { type: "event"; event: string; payload: unknown; userId?: string }
  | {
      type: "rpc_pool_request";
      requestId: string;
      endpoint: string;
      requesterExtensionId: string;
      rpcPermissionScopeId: string;
      effectivePermissions: string[];
    }
  | {
      type: "intercept_request";
      requestId: string;
      messages: LlmMessageDTO[];
      context: unknown;
    }
  | {
      type: "context_handler_request";
      requestId: string;
      context: unknown;
    }
  | {
      type: "macro_interceptor_request";
      requestId: string;
      ctx: MacroInterceptorCtxDTO;
    }
  | {
      type: "world_info_interceptor_request";
      requestId: string;
      ctx: WorldInfoInterceptorCtxDTO;
    }
  | {
      type: "message_content_processor_request";
      requestId: string;
      ctx: MessageContentProcessorCtxDTO;
    }
  | {
      type: "response";
      requestId: string;
      result?: unknown;
      error?: string;
    }
  | {
      type: "permission_denied";
      permission: string;
      operation: string;
    }
  | {
      type: "permission_changed";
      /** Extension identifier for the worker receiving this scoped change */
      extensionId?: string;
      permission: string;
      granted: boolean;
      allGranted: string[];
    }
  | {
      type: "tool_invocation";
      requestId: string;
      toolName: string;
      args: Record<string, unknown>;
      /**
       * Populated when the invocation originates from a council execution
       * cycle — carries the assigned council member's identity, role, chance,
       * avatar URL, and Lumia personality fields so the extension can tailor
       * its tool pipeline to the member on whose behalf it is running.
       *
       * Undefined for non-council invocation paths.
       */
      councilMember?: CouncilMemberContext;
      /**
       * Structured chat context for council invocations — the same messages
       * that populated `args.context` (flattened string), but with role
       * boundaries preserved so extensions can re-render or filter them
       * without parsing. Undefined for non-council invocation paths.
       */
      contextMessages?: LlmMessageDTO[];
    }
  | { type: "shutdown" }
  | { type: "frontend_message"; payload: unknown; userId: string }
  | { type: "frontend_process_lifecycle"; event: FrontendProcessLifecycleEventDTO }
  | { type: "frontend_process_message"; processId: string; payload: unknown; userId: string }
  | { type: "backend_process_lifecycle"; event: BackendProcessLifecycleEventDTO }
  | { type: "backend_process_message"; processId: string; payload: unknown; userId: string }
  | {
      type: "oauth_callback";
      requestId: string;
      params: Record<string, string>;
    }
  | {
      type: "command_invoked";
      commandId: string;
      context: SpindleCommandContextDTO;
      userId: string;
    }
  /**
   * One streamed chunk for a generation started via
   * `request_generation_stream`. Multiple `token` / `reasoning` chunks
   * may arrive, terminating with exactly one `done` chunk on success.
   */
  | { type: "generation_stream_chunk"; requestId: string; chunk: StreamChunkDTO }
  /**
   * Terminal failure for a generation started via
   * `request_generation_stream`. Mutually exclusive with the `done`
   * chunk in `generation_stream_chunk`. Aborts surface here too.
   */
  | { type: "generation_stream_error"; requestId: string; error: string };
