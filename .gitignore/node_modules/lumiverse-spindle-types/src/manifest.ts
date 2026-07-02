export interface SpindleManifest {
  /** Semver version string */
  version: string;
  /** Display name */
  name: string;
  /** Global identifier (lowercase, underscores only: /^[a-z][a-z0-9_]*$/) */
  identifier: string;
  /** Extension author */
  author: string;
  /** GitHub repository URL */
  github: string;
  /** Extension homepage URL */
  homepage: string;
  /** Short description */
  description?: string;
  /** Requested permissions (gated capabilities) */
  permissions: SpindlePermission[];
  /**
   * Declared backend capabilities that opt this extension out of specific
   * Spindle heuristic-scanner blocks. See `SpindleCapability` for the
   * available values. Distinct from `permissions`: permissions gate runtime
   * API surfaces; capabilities suppress install-time scanner false positives
   * for patterns the extension legitimately needs.
   */
  requested_capabilities?: SpindleCapability[];
  /** Backend entry point (default: "dist/backend.js") */
  entry_backend?: string;
  /** Frontend entry point (default: "dist/frontend.js") */
  entry_frontend?: string;
  /** Minimum Lumiverse version required */
  minimum_lumiverse_version?: string;
  /** Files/directories to seed into extension storage on install/import/update */
  storage_seed_files?: SpindleStorageSeedFile[];
  /**
   * Maximum wall-clock time (milliseconds) the host will wait for this
   * extension's interceptor to return a result before aborting with an error.
   * Overrides the user-level `spindleSettings.interceptorTimeoutMs` setting.
   * Clamped to [1000, 300000] by the host.
   */
  interceptorTimeoutMs?: number;
}

export interface SpindleStorageSeedFile {
  /** Source path relative to extension repo root */
  from: string;
  /** Destination path relative to extension storage root (defaults to `from`) */
  to?: string;
  /** If true, overwrite existing storage content at destination */
  overwrite?: boolean;
  /** If true, fail install/import/update when source path is missing */
  required?: boolean;
}

export type SpindlePermission = import("./permissions").SpindlePermission;
export type SpindleCapability = import("./capabilities").SpindleCapability;

/** Regex for validating extension identifiers */
export const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*$/;

export function validateIdentifier(id: string): boolean {
  return IDENTIFIER_PATTERN.test(id);
}
