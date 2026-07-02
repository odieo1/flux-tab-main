/**
 * Memory Cortex & Long-Term Chat Memory DTOs.
 *
 * Surfaces the Lumiverse hybrid memory architecture to extensions via the
 * `memories` permission. Covers:
 *
 *  - Memory Cortex
 *      • config (entity tracking, salience scoring, retrieval tuning)
 *      • retrieval (cortex query, linked-cortex query, vault query)
 *      • entity graph (entities, relations, mentions)
 *      • consolidations & salience records
 *      • vaults (snapshots of cortex state) and chat links (vault attach /
 *        bidirectional interlinks)
 *      • ingestion / maintenance telemetry
 *
 *  - Long-Term Chat Memory
 *      • vectorized chat chunks (list, get, warm)
 *      • cached retrieval result for the {{memories}} macro
 *
 * Service-layer shapes use camelCase; SQLite row shapes (snake_case) are not
 * exposed to extensions — DTOs are normalised here.
 */

// ─── Enums ─────────────────────────────────────────────────────────────

export type EntityTypeDTO =
  | "character"
  | "location"
  | "item"
  | "faction"
  | "concept"
  | "event";

export type EntityStatusDTO =
  | "active"
  | "inactive"
  | "deceased"
  | "destroyed"
  | "unknown";

export type MentionRoleDTO =
  | "subject"
  | "object"
  | "present"
  | "referenced"
  | "absent";

export type RelationTypeDTO =
  | "ally"
  | "enemy"
  | "lover"
  | "parent"
  | "child"
  | "sibling"
  | "mentor"
  | "rival"
  | "owns"
  | "member_of"
  | "located_in"
  | "fears"
  | "serves"
  | "custom";

export type RelationStatusDTO = "active" | "broken" | "dormant" | "former";

export type EmotionalTagDTO =
  | "grief"
  | "joy"
  | "tension"
  | "dread"
  | "intimacy"
  | "betrayal"
  | "revelation"
  | "resolve"
  | "humor"
  | "melancholy"
  | "awe"
  | "fury";

export type NarrativeFlagDTO =
  | "first_meeting"
  | "death"
  | "promise"
  | "confession"
  | "departure"
  | "transformation"
  | "battle"
  | "discovery"
  | "reunion"
  | "loss";

export type ContradictionFlagDTO = "none" | "temporal" | "complex" | "suspect";

export type FactExtractionStatusDTO = "never" | "attempted_empty" | "ok";

export type EntityConfidenceDTO = "confirmed" | "provisional";

export type SalienceSourceDTO = "heuristic" | "sidecar";

export type ChatLinkTypeDTO = "vault" | "interlink";

// ─── Entity Graph ──────────────────────────────────────────────────────

export interface SalienceBreakdownDTO {
  mentionComponent: number;
  arcComponent: number;
  graphComponent: number;
  total: number;
}

export interface MemoryEntityDTO {
  id: string;
  chatId: string;
  name: string;
  entityType: EntityTypeDTO;
  aliases: string[];
  description: string;
  firstSeenChunkId: string | null;
  lastSeenChunkId: string | null;
  firstSeenAt: number | null;
  lastSeenAt: number | null;
  mentionCount: number;
  salienceAvg: number;
  status: EntityStatusDTO;
  statusChangedAt: number | null;
  facts: string[];
  emotionalValence: Record<string, number>;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  factExtractionStatus: FactExtractionStatusDTO;
  factExtractionLastAttempt: number | null;
  salienceBreakdown: SalienceBreakdownDTO;
  lastMentionTimestamp: number | null;
  recentMentionCount: number;
  confidence: EntityConfidenceDTO;
  userEditedAt: number | null;
}

/**
 * Input shape for upserting an entity. Matches the heuristic / sidecar
 * extraction shape so an extension can replay its own NER results into the
 * graph. `confidence` is the raw [0, 1] extractor confidence; entities below
 * the configured threshold are dropped by the host.
 */
export interface MemoryEntityUpsertDTO {
  name: string;
  type: EntityTypeDTO;
  aliases?: string[];
  confidence?: number;
  role?: MentionRoleDTO;
  /** Marks the entity as needing corroboration before promotion. */
  provisional?: boolean;
}

export interface MemoryEntityStatusUpdateDTO {
  status: EntityStatusDTO;
  statusChangedAt?: number;
}

export interface MemoryMentionDTO {
  id: string;
  entityId: string;
  chunkId: string;
  chatId: string;
  role: MentionRoleDTO;
  excerpt: string | null;
  sentiment: number;
  createdAt: number;
}

// ─── Relations ─────────────────────────────────────────────────────────

export interface MemoryRelationDTO {
  id: string;
  chatId: string;
  sourceEntityId: string;
  targetEntityId: string;
  relationType: RelationTypeDTO;
  relationLabel: string | null;
  strength: number;
  sentiment: number;
  evidenceChunkIds: string[];
  firstEstablishedAt: number | null;
  lastReinforcedAt: number | null;
  status: RelationStatusDTO;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  contradictionFlag: ContradictionFlagDTO;
  contradictionPeerId: string | null;
  sentimentRange: [number, number] | null;
  supersededBy: string | null;
  arcIds: string[];
  firstSeenArcId: string | null;
  lastSeenArcId: string | null;
  lastEvidenceTimestamp: number | null;
  decayRate: number;
  edgeSalience: number;
  labelAliases: string[];
  canonicalEdgeId: string | null;
  mergedInto: string | null;
}

/**
 * Input shape for upserting a relation. Uses entity *names* (not ids) so
 * extensions can produce relations symbolically — the host resolves canonical
 * ids server-side. Both endpoints must already exist in the entity graph;
 * the relation is silently dropped otherwise.
 */
export interface MemoryRelationUpsertDTO {
  source: string;
  target: string;
  type: RelationTypeDTO;
  label: string;
  sentiment: number;
}

// ─── Salience ──────────────────────────────────────────────────────────

export interface StatusChangeDTO {
  entity: string;
  change: string;
  detail: string;
}

export interface MemorySalienceDTO {
  chunkId: string;
  chatId: string;
  score: number;
  scoreSource: SalienceSourceDTO;
  emotionalTags: EmotionalTagDTO[];
  statusChanges: StatusChangeDTO[];
  narrativeFlags: NarrativeFlagDTO[];
  hasDialogue: boolean;
  hasAction: boolean;
  hasInternalThought: boolean;
  wordCount: number;
  scoredAt: number;
  scoredBy: string | null;
}

// ─── Consolidations ────────────────────────────────────────────────────

export interface MemoryConsolidationDTO {
  id: string;
  chatId: string;
  tier: number;
  title: string | null;
  summary: string;
  sourceChunkIds: string[];
  sourceConsolidationIds: string[];
  entityIds: string[];
  messageRangeStart: number | null;
  messageRangeEnd: number | null;
  timeRangeStart: number | null;
  timeRangeEnd: number | null;
  salienceAvg: number;
  emotionalTags: EmotionalTagDTO[];
  tokenCount: number;
  vectorizedAt: number | null;
  vectorModel: string | null;
  createdAt: number;
  updatedAt: number;
}

// ─── Cortex Retrieval ──────────────────────────────────────────────────

/**
 * Input to a Memory Cortex retrieval query.
 *
 * The `userId` field is normally inferred from the calling extension's
 * effective user; pass it explicitly only for operator-scoped extensions.
 */
export interface CortexQueryDTO {
  chatId: string;
  queryText: string;
  entityFilter?: string[];
  timeRange?: { start?: number; end?: number };
  emotionalContext?: EmotionalTagDTO[];
  generationType?: string;
  topK?: number;
  includeConsolidations?: boolean;
  includeRelationships?: boolean;
  excludeMessageIds?: string[];
  userId?: string;
}

export interface CortexMemoryComponentsDTO {
  semantic: number;
  salience: number;
  recency: number;
  reinforcement: number;
  emotional: number;
  entity: number;
}

export interface CortexMemoryDTO {
  source: "chunk" | "consolidation";
  sourceId: string;
  content: string;
  finalScore: number;
  components: CortexMemoryComponentsDTO;
  emotionalTags: EmotionalTagDTO[];
  entityNames: string[];
  messageRange: [number, number];
  timeRange: [number, number];
}

export interface EntitySnapshotRelationshipDTO {
  targetName: string;
  type: RelationTypeDTO;
  label: string | null;
  strength: number;
  sentiment: number;
}

export interface EntitySnapshotDTO {
  id: string;
  name: string;
  type: EntityTypeDTO;
  status: EntityStatusDTO;
  description: string;
  lastSeenAt: number | null;
  mentionCount: number;
  topFacts: string[];
  emotionalProfile: Record<string, number>;
  relationships: EntitySnapshotRelationshipDTO[];
}

export interface RelationEdgeDTO {
  sourceName: string;
  targetName: string;
  type: RelationTypeDTO;
  label: string | null;
  strength: number;
  sentiment: number;
}

export interface CortexStatsDTO {
  candidatePoolSize: number;
  vectorSearchResults: number;
  entitiesMatched: number;
  scoreFusionApplied: boolean;
  topScore: number;
  retrievalTimeMs: number;
  /** Set when the retrieval hit its internal time budget. */
  timedOut?: boolean;
  /** Set when retrieval bailed out because the caller's AbortSignal fired. */
  aborted?: boolean;
}

export interface CortexResultDTO {
  memories: CortexMemoryDTO[];
  entityContext: EntitySnapshotDTO[];
  activeRelationships: RelationEdgeDTO[];
  arcContext: string | null;
  stats: CortexStatsDTO;
}

// ─── Vaults & Linked Cortex ────────────────────────────────────────────

export interface VaultDTO {
  id: string;
  userId: string;
  sourceChatId: string | null;
  sourceChatName: string | null;
  name: string;
  description: string;
  entityCount: number;
  relationCount: number;
  chunkCount: number;
  createdAt: number;
}

export interface VaultChunkDTO {
  id: string;
  vaultId: string;
  sourceChunkId: string;
  content: string;
  salienceScore: number | null;
  emotionalTags: string[];
  entityNames: string[];
  sourceCreatedAt: number;
  copiedAt: number;
}

export interface VaultEntityDTO {
  id: string;
  vaultId: string;
  name: string;
  entityType: EntityTypeDTO;
  aliases: string[];
  description: string;
  status: EntityStatusDTO;
  facts: string[];
  emotionalValence: Record<string, number>;
  salienceAvg: number;
}

export interface VaultRelationDTO {
  id: string;
  vaultId: string;
  sourceEntityName: string;
  targetEntityName: string;
  relationType: RelationTypeDTO;
  relationLabel: string | null;
  strength: number;
  sentiment: number;
  status: RelationStatusDTO;
}

export interface VaultCreateDTO {
  chatId: string;
  name: string;
  description?: string;
}

export interface VaultWithContentsDTO {
  vault: VaultDTO;
  entities: VaultEntityDTO[];
  relations: VaultRelationDTO[];
}

export interface VaultReindexResultDTO {
  mode: string;
  chunkCount: number;
}

export interface ChatLinkDTO {
  id: string;
  userId: string;
  chatId: string;
  linkType: ChatLinkTypeDTO;
  vaultId: string | null;
  vaultName: string | null;
  vaultEntityCount: number | null;
  vaultRelationCount: number | null;
  targetChatId: string | null;
  targetChatName: string | null;
  targetChatExists: boolean;
  label: string;
  enabled: boolean;
  priority: number;
  createdAt: number;
}

export interface ChatLinkAttachDTO {
  chatId: string;
  linkType: ChatLinkTypeDTO;
  vaultId?: string;
  targetChatId?: string;
  label?: string;
  /** Interlinks only. When true, also creates the reverse link on the target chat. */
  bidirectional?: boolean;
}

export interface VaultCortexDataDTO {
  vaultId: string;
  vaultName: string;
  sourceChatId?: string;
  entities: EntitySnapshotDTO[];
  relations: RelationEdgeDTO[];
  /** Retrieved memories from the vault's chunk snapshot (when queryText supplied). */
  memories?: CortexMemoryDTO[];
  arcContext?: string | null;
}

export interface InterlinkCortexDataDTO {
  targetChatId: string;
  targetChatName: string;
  result: CortexResultDTO;
}

export interface LinkedCortexResultDTO {
  vaults: VaultCortexDataDTO[];
  interlinks: InterlinkCortexDataDTO[];
}

// ─── Cortex Config ─────────────────────────────────────────────────────

/**
 * Memory Cortex configuration.
 *
 * The host owns the canonical schema (see `MemoryCortexConfig` in the
 * backend). The DTO is intentionally permissive — only the top-level toggles
 * extensions are likely to flip are typed, and the index signature passes
 * advanced fields (retrieval tuning, sidecar configuration, decay curves,
 * consolidation thresholds, entity pruning, etc.) straight through. New
 * fields added by the host are visible immediately to extensions without
 * a coordinated type bump.
 */
export interface MemoryCortexConfigDTO {
  enabled: boolean;
  entityTracking: boolean;
  entityExtractionMode: string;
  salienceScoring: boolean;
  salienceScoringMode?: string;
  thoughtMarkers?: unknown;
  entityWhitelist?: string[];
  entityExtractionFilters?: unknown;
  retrieval?: Record<string, unknown>;
  decay?: Record<string, unknown>;
  consolidation?: Record<string, unknown>;
  entityPruning?: Record<string, unknown>;
  sidecar?: Record<string, unknown>;
  sidecarTimeoutMs?: number;
  retrievalTimeoutMs?: number;
  [key: string]: unknown;
}

// ─── Telemetry & Stats ─────────────────────────────────────────────────

export interface CortexUsageStatsDTO {
  entityCount: number;
  relationCount: number;
  salienceRecordCount: number;
  consolidationCount: number;
  /** Advanced fields exposed by the host's gc module (mention counts, last
   *  GC timestamp, etc.) pass through unchanged. */
  [key: string]: number | string | boolean | null | undefined;
}

export interface CortexIngestionTimingsDTO {
  mode: "heuristic" | "sidecar" | "mixed";
  fontMs: number;
  heuristicMs: number;
  heuristicSalienceMs: number;
  heuristicEntityMs: number;
  heuristicRelationshipMs: number;
  heuristicAliasMs: number;
  sidecarMs: number;
  graphMs: number;
  dbMs: number;
  totalMs: number;
  completedAt: number;
  chunkId: string;
}

export interface CortexIngestionStatusDTO {
  chatId: string;
  status: "idle" | "processing" | "complete" | "error";
  phase:
    | "queued"
    | "font"
    | "heuristics"
    | "sidecar"
    | "persisting"
    | "complete"
    | "error";
  chunkId: string | null;
  startedAt: number | null;
  updatedAt: number;
  pendingJobs: number;
  error?: string;
  timings?: CortexIngestionTimingsDTO | null;
}

export interface CortexIngestionTelemetryDTO {
  samples: number;
  last: CortexIngestionTimingsDTO | null;
  averages: {
    fontMs: number;
    heuristicMs: number;
    sidecarMs: number;
    graphMs: number;
    dbMs: number;
    totalMs: number;
  };
}

// ─── Long-Term Chat Memory ─────────────────────────────────────────────

/**
 * A vectorized chat chunk — the basic unit of long-term chat memory. Chunks
 * are produced from contiguous same-role messages bounded by token target
 * and scene-break heuristics; the {{memories}} macro retrieves the top-K
 * chunks by hybrid vector + BM25 score during prompt assembly.
 */
export interface ChatChunkDTO {
  id: string;
  chatId: string;
  startMessageId: string;
  endMessageId: string;
  messageIds: string[];
  content: string;
  tokenCount: number;
  messageCount: number;
  vectorizedAt: number | null;
  vectorModel: string | null;
  retrievalCount: number;
  lastRetrievedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * Result of a long-term chat memory warmup. `status` describes the action
 * taken; `reason` is a short human-readable string useful for diagnostics
 * when nothing was queued.
 */
export interface ChatMemoryWarmupResultDTO {
  status: "skipped" | "complete" | "rebuilding" | "queued" | "error";
  reason?: string;
  rebuilt?: boolean;
  vectorizationsQueued?: number;
}
