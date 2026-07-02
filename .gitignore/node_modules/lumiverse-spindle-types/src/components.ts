/**
 * Host-provided shared UI components.
 *
 * These types describe an API surface that lets a frontend extension mount
 * instances of Lumiverse's first-party React components inside extension-owned
 * DOM nodes (drawer tabs, float widgets, dock panels, app mounts, message
 * widgets, etc.). The host renders the real React component into the supplied
 * target element — extensions never need to depend on React themselves.
 *
 * Common shape:
 *   - Each `mountX(target, options)` call returns a `SpindleMountedComponent`
 *     handle scoped to the supplied target.
 *   - Options carry initial values plus user-event callbacks (e.g. `onChange`).
 *   - The host owns internal state and re-renders on user interaction. To
 *     programmatically change inputs from the extension side, call
 *     `handle.update({ ... })`. To read current state, call `handle.getValue()`
 *     where available.
 *   - Calling `handle.destroy()` unmounts the React tree and removes any host
 *     resources. The supplied target element is not removed from the DOM —
 *     extensions own placement and lifetime of the container.
 *
 * Components inherit the active Lumiverse theme via CSS variables, so they
 * visually match the rest of the host UI without any additional wiring.
 */

// ──────────────────────────────────────────────────────────────────────────
// Shared base shapes
// ──────────────────────────────────────────────────────────────────────────

/**
 * Common handle shape returned by every `ctx.components.mount*` call.
 *
 * @template TOptions Options shape used at mount time. `update()` accepts a
 *   partial of the same shape so callers get IntelliSense for every field they
 *   are allowed to change post-mount.
 */
export interface SpindleMountedComponent<TOptions> {
  /** Host-assigned component instance ID, unique per extension. */
  readonly componentId: string;
  /** The container element the component was mounted into. Same node passed as `target`. */
  readonly element: HTMLElement;
  /**
   * Merge a partial set of options into the live component. Pass any subset of
   * the original mount options — undefined fields are ignored.
   */
  update(patch: Partial<TOptions>): void;
  /** Unmount the React tree and release host resources. The target element is left in place. */
  destroy(): void;
}

/** Mount-time target. Either a CSS selector resolved against the extension-owned DOM, or an Element. */
export type SpindleComponentTarget = string | Element;

/** Connection kinds the host can wire shared pickers up to. */
export type SpindleConnectionKind = "llm" | "image" | "tts" | "embedding";

/**
 * Reference to a host-managed connection profile.
 *
 * When supplied to a connection-aware picker (e.g. {@link SpindleModelComboboxOptions}),
 * the host populates available choices, loading state, and refresh behavior
 * from its own connection registry. The extension does not need to fetch or
 * cache anything itself.
 */
export interface SpindleConnectionRef {
  /** Which connection family the picker should bind to. */
  kind: SpindleConnectionKind;
  /**
   * Specific connection ID. If omitted, the host binds to the currently
   * active connection of the given `kind` and follows live changes when the
   * user switches active connections.
   */
  id?: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Text inputs
// ──────────────────────────────────────────────────────────────────────────

export interface SpindleTextInputOptions {
  /** Initial value. */
  value?: string;
  /** Fired whenever the user changes the input. */
  onChange?: (value: string) => void;
  /** Placeholder text shown when value is empty. */
  placeholder?: string;
  /** Focus the input on mount. */
  autoFocus?: boolean;
  /** Disable user interaction. */
  disabled?: boolean;
  /** Additional CSS class merged onto the input element. */
  className?: string;
  /** Optional accessible label. Surfaces as `aria-label` on the input. */
  ariaLabel?: string;
}

export interface SpindleTextInputHandle extends SpindleMountedComponent<SpindleTextInputOptions> {
  /** Read the current value. */
  getValue(): string;
  /** Programmatically focus the input. */
  focus(): void;
  /** Programmatically blur the input. */
  blur(): void;
}

export interface SpindleTextAreaOptions {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  /** Visible row count. Default: `4`. */
  rows?: number;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

export interface SpindleTextAreaHandle extends SpindleMountedComponent<SpindleTextAreaOptions> {
  getValue(): string;
  focus(): void;
  blur(): void;
}

// ──────────────────────────────────────────────────────────────────────────
// Numeric inputs
// ──────────────────────────────────────────────────────────────────────────

export interface SpindleNumericInputOptions {
  /** Initial value, or `null` for empty. */
  value?: number | null;
  /** Fired whenever the value changes. `null` means the field is empty. */
  onChange?: (value: number | null) => void;
  /** Allow the field to be empty (`null`). Default: `false`. */
  allowEmpty?: boolean;
  /** Restrict input to integers. Default: `false`. */
  integer?: boolean;
  /** Minimum allowed value. */
  min?: number;
  /** Maximum allowed value. */
  max?: number;
  /** Step size used by the underlying `<input type="number">`. */
  step?: number;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

export interface SpindleNumericInputHandle extends SpindleMountedComponent<SpindleNumericInputOptions> {
  getValue(): number | null;
  focus(): void;
  blur(): void;
}

export interface SpindleNumberStepperOptions {
  value?: number | null;
  onChange?: (value: number | null) => void;
  min?: number;
  max?: number;
  /** Increment/decrement step. Default: `1`. */
  step?: number;
  allowEmpty?: boolean;
  integer?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export interface SpindleNumberStepperHandle extends SpindleMountedComponent<SpindleNumberStepperOptions> {
  getValue(): number | null;
}

/**
 * Declarative formatting for the value displayed in a range slider's header.
 *
 * Composed as `prefix + formatted-number + suffix`. The number portion respects
 * `decimals` if provided; otherwise it follows the slider's `step` (integer
 * sliders show whole numbers; floats show as many decimals as `step` implies).
 *
 * For more complex formatting (e.g. localized strings, range-dependent units),
 * omit the `label` field and render your own header outside the slider while
 * using {@link SpindleRangeSliderOptions.onDragValue} to track the live value.
 */
export interface SpindleRangeSliderFormat {
  /** Number of decimal places to show. Defaults to whatever `step` implies. */
  decimals?: number;
  /** String appended after the value (e.g. `"%"`, `"ms"`, `" tokens"`). */
  suffix?: string;
  /** String prepended before the value. */
  prefix?: string;
}

export interface SpindleRangeSliderOptions {
  /** Inclusive lower bound. */
  min: number;
  /** Inclusive upper bound. */
  max: number;
  /** Initial committed value. Defaults to `min` if omitted. */
  value?: number;
  /** Snap increment. Default: `1`. */
  step?: number;
  /** Round to integers regardless of `step` formatting. Default: `false`. */
  integer?: boolean;
  /**
   * Fired once when a drag ends with a new value (mouse release, touch lift,
   * or tap-to-jump). Not fired during the drag itself — that's `onDragValue`.
   */
  onCommit?: (value: number) => void;
  /**
   * Fired with the live value during a gesture, and with `null` if the gesture
   * ends without committing (e.g. cancelled touch). Use this to mirror the
   * value into a sibling label or for previews; the host already updates the
   * built-in header in real time when {@link label} is provided.
   */
  onDragValue?: (value: number | null) => void;
  /** Optional header label rendered above the track. */
  label?: string;
  /** Optional helper text rendered below the header. */
  hint?: string;
  /**
   * Declarative formatting for the displayed value when {@link label} is
   * provided. Ignored if no `label` is set.
   */
  format?: SpindleRangeSliderFormat;
  disabled?: boolean;
  className?: string;
}

export interface SpindleRangeSliderHandle extends SpindleMountedComponent<SpindleRangeSliderOptions> {
  /** Read the current committed value. */
  getValue(): number;
}

// ──────────────────────────────────────────────────────────────────────────
// Boolean inputs
// ──────────────────────────────────────────────────────────────────────────

export interface SpindleCheckboxOptions {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  /** Label rendered next to the checkbox. */
  label?: string;
  /** Optional helper text rendered below the label. */
  hint?: string;
  disabled?: boolean;
  className?: string;
}

export interface SpindleCheckboxHandle extends SpindleMountedComponent<SpindleCheckboxOptions> {
  getValue(): boolean;
}

export interface SpindleSwitchOptions {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  /** Visual size. Default: `"md"`. */
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

export interface SpindleSwitchHandle extends SpindleMountedComponent<SpindleSwitchOptions> {
  getValue(): boolean;
}

// ──────────────────────────────────────────────────────────────────────────
// Pickers & selects
// ──────────────────────────────────────────────────────────────────────────

/**
 * Declarative leading-cell content for a select option (avatar, icon, swatch, initial).
 *
 * Rendered by the host in the fixed leading slot of both the dropdown row and
 * the selected-value trigger. Extensions describe what they want declaratively
 * — they do not pass React nodes themselves.
 *
 * Common patterns:
 * - Persona/character avatars with initial fallback: pick `{ type: "image", src, fallback }`.
 *   The host shows the image when it loads successfully; if `src` is empty or
 *   the image fails to load, the host falls back to the supplied initial.
 * - Provider icons / brand marks: `{ type: "icon-svg" }` or `{ type: "icon-url" }`.
 * - Color tags / category swatches: `{ type: "swatch", color }`.
 * - Plain text bubble (initials, single emoji): `{ type: "initial", text }`.
 */
export type SpindleSelectOptionLeading =
  | {
      type: "image";
      /** Image URL. Anything `<img src>` accepts, including data URLs. */
      src: string;
      /** Alt text for accessibility. Defaults to empty (decorative). */
      alt?: string;
      /** Render the image as a circle. Default: `true`. Useful for avatars. */
      rounded?: boolean;
      /**
       * Fallback rendered when `src` is empty or fails to load. Typically a
       * one-character initial. If omitted, the slot collapses on failure.
       */
      fallback?: {
        /** Fallback text — usually a single character / initial. */
        text: string;
        /** Optional background color for the fallback bubble. */
        background?: string;
        /** Optional text color for the fallback bubble. */
        color?: string;
      };
    }
  | {
      type: "icon-svg";
      /** Inline SVG string. The host sanitizes and inlines the SVG. */
      svg: string;
      /** Optional foreground color applied via `currentColor`. */
      color?: string;
    }
  | {
      type: "icon-url";
      /** URL to an icon image (PNG / SVG / WebP). */
      url: string;
      alt?: string;
    }
  | {
      type: "swatch";
      /** Any CSS color string. Rendered as a small filled circle. */
      color: string;
    }
  | {
      type: "initial";
      /** Text shown inside the leading bubble — typically one character. */
      text: string;
      /** Background color for the bubble. */
      background?: string;
      /** Text color inside the bubble. */
      color?: string;
    };

/** A single option in a select-style picker. */
export interface SpindleSelectOption {
  /** Stable value emitted to `onChange`. */
  value: string;
  /** Display label. */
  label: string;
  /** Secondary text rendered beneath the label. */
  sublabel?: string;
  /**
   * Optional leading-cell content rendered before the label in both the
   * dropdown row and the selected-value trigger. See {@link SpindleSelectOptionLeading}
   * for the supported variants (avatar image with initial fallback, inline
   * SVG icon, icon URL, color swatch, plain initial bubble).
   */
  leading?: SpindleSelectOptionLeading;
  /** Group key. Options sharing a group are visually clustered with a header. */
  group?: string;
  /** Render as disabled. */
  disabled?: boolean;
}

export interface SpindleSelectOptionsBase {
  /** Available options. */
  options?: SpindleSelectOption[];
  /** Placeholder text shown when no value is selected. */
  placeholder?: string;
  /** Placeholder for the search field inside the dropdown. */
  searchPlaceholder?: string;
  /** Minimum option count before the search field is shown. Default: `8`. */
  searchThreshold?: number;
  /**
   * Message rendered when the option list itself is empty (i.e. no options
   * were supplied). For "no matches against the current search" use
   * {@link noResultsMessage} instead.
   */
  emptyMessage?: string;
  /** Message rendered when the search query has no matching options. */
  noResultsMessage?: string;
  /**
   * Force a specific trigger label, ignoring whichever option is currently
   * selected. Useful for "+ Add", "Filter…" style triggers.
   */
  triggerLabel?: string;
  /**
   * Custom trigger icon. Replaces the default chevron. Accepts the same
   * declarative shape as option leading cells — typically `{ type: "icon-svg" }`
   * for a brand mark or chevron alternative.
   */
  triggerIcon?: SpindleSelectOptionLeading;
  /** Accessible label for the trigger button. Surfaces as `aria-label`. */
  ariaLabel?: string;
  /** Additional CSS class merged onto the trigger button. */
  triggerClassName?: string;
  /**
   * Render the dropdown into a React portal anchored to `document.body` so it
   * escapes containers with `overflow:hidden`. Default: `true`.
   */
  portal?: boolean;
  /** Dropdown horizontal alignment relative to the trigger. Default: `"left"`. */
  align?: "left" | "right";
  /** Maximum dropdown height in CSS pixels. */
  maxHeight?: number;
  /** Minimum dropdown width in CSS pixels. */
  minWidth?: number;
  disabled?: boolean;
  className?: string;
}

export interface SpindleSelectOptions extends SpindleSelectOptionsBase {
  /** Initial value. */
  value?: string;
  onChange?: (value: string) => void;
  /**
   * Show a "None" / clear option pinned to the top of the dropdown. Selecting
   * it emits `onChange("")`. Single-select only.
   */
  clearable?: boolean;
  /** Label shown for the clear option. Default: `"None"`. */
  clearLabel?: string;
}

export interface SpindleSelectHandle extends SpindleMountedComponent<SpindleSelectOptions> {
  getValue(): string;
  /** Open the dropdown programmatically. */
  open(): void;
  /** Close the dropdown programmatically. */
  close(): void;
}

export interface SpindleMultiSelectOptions extends SpindleSelectOptionsBase {
  /** Initial value. */
  value?: string[];
  onChange?: (value: string[]) => void;
}

export interface SpindleMultiSelectHandle extends SpindleMountedComponent<SpindleMultiSelectOptions> {
  getValue(): string[];
  open(): void;
  close(): void;
}

/**
 * Connection-aware model picker.
 *
 * **Recommended (connection-bound) mode:** supply `connection` and the host
 * will populate `models`, drive the refresh button, manage loading state, and
 * react to live connection changes.
 *
 * **Manual mode:** supply `models`, `loading`, and `onRefresh` directly. Use
 * this when the extension fetches model lists from its own backend or proxy.
 *
 * The two modes are mutually exclusive. If both `connection` and `models` are
 * supplied, `connection` wins and the manual fields are ignored.
 */
export interface SpindleModelComboboxOptions {
  /** Currently entered model ID. */
  value?: string;
  /** Fired when the user types or selects a model. */
  onChange?: (value: string) => void;

  /**
   * Bind to a host-managed connection. The host populates the model list,
   * handles the refresh affordance, and reports loading state automatically.
   *
   * Pass just `{ kind }` to follow the user's currently active connection of
   * that kind. Pass `{ kind, id }` to pin to a specific connection.
   */
  connection?: SpindleConnectionRef;

  /** Manual mode: explicit model list. Ignored when `connection` is set. */
  models?: string[];
  /** Manual mode: optional map of model ID → human-readable label. */
  modelLabels?: Record<string, string>;
  /** Manual mode: surface the host spinner inside the refresh affordance. */
  loading?: boolean;
  /** Manual mode: render a refresh button that invokes this handler when clicked. */
  onRefresh?: () => void;

  /** Trigger an auto-refresh the first time the input gains focus (manual mode only). */
  autoRefreshOnFocus?: boolean;
  /** Opaque key — when it changes, the host re-arms the autoRefreshOnFocus guard. */
  refreshKey?: string;

  /** Visual density. `"compact"` matches inline rows; `"standard"` matches form rows; `"editor"` matches the prompt editor. */
  appearance?: "compact" | "standard" | "editor";
  placeholder?: string;
  emptyMessage?: string;
  loadingMessage?: string;
  /** Optional hint shown beneath the input (e.g. "Search the catalog"). */
  browseHint?: string;
  disabled?: boolean;
  className?: string;
}

export interface SpindleModelComboboxHandle extends SpindleMountedComponent<SpindleModelComboboxOptions> {
  getValue(): string;
  /** Force a refresh of the host-managed model list. No-op in manual mode unless `onRefresh` is set. */
  refresh(): void;
}

export interface SpindleFolderDropdownOptions {
  /** Available folder names. */
  folders?: string[];
  /** Currently selected folder. */
  value?: string;
  onChange?: (folder: string) => void;
  /** Fired when the user creates a new folder via the inline affordance. */
  onCreateFolder?: (name: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export interface SpindleFolderDropdownHandle extends SpindleMountedComponent<SpindleFolderDropdownOptions> {
  getValue(): string;
}

// ──────────────────────────────────────────────────────────────────────────
// Display & layout
// ──────────────────────────────────────────────────────────────────────────

export type SpindleBadgeColor = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

export interface SpindleBadgeOptions {
  /** Badge text. */
  text?: string;
  /** Accent color. Default: `"neutral"`. */
  color?: SpindleBadgeColor;
  /** Visual size. Default: `"md"`. */
  size?: "sm" | "md" | "pill";
  className?: string;
}

export type SpindleBadgeHandle = SpindleMountedComponent<SpindleBadgeOptions>;

export interface SpindleSpinnerOptions {
  /** Diameter in CSS pixels. Default: `16`. */
  size?: number;
  /** Use the faster rotation variant for impatient contexts. */
  fast?: boolean;
  className?: string;
}

export type SpindleSpinnerHandle = SpindleMountedComponent<SpindleSpinnerOptions>;

export interface SpindleCollapsibleSectionOptions {
  /** Section title rendered in the collapsible header. */
  title: string;
  /** Inline SVG string for an optional leading icon. */
  iconSvg?: string;
  /** URL to an icon image. Mutually exclusive with `iconSvg`. */
  iconUrl?: string;
  /** Optional badge text shown next to the title. */
  badge?: string | number;
  /** Initial expanded state. Default: `true`. */
  defaultExpanded?: boolean;
  /** Fired whenever the user toggles the section. */
  onToggle?: (expanded: boolean) => void;
  className?: string;
}

export interface SpindleCollapsibleSectionHandle extends SpindleMountedComponent<SpindleCollapsibleSectionOptions> {
  /**
   * Body container the extension owns. Append child elements here — the host
   * renders the collapsible chrome around them.
   */
  readonly body: HTMLElement;
  /** Returns the current expanded state. */
  isExpanded(): boolean;
  /** Expand the section. */
  expand(): void;
  /** Collapse the section. */
  collapse(): void;
  /** Toggle the section. */
  toggle(): void;
}

export interface SpindlePaginationOptions {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Optional items-per-page selector. Omit to hide the selector entirely. */
  perPage?: number;
  perPageOptions?: number[];
  onPerPageChange?: (perPage: number) => void;
  /** Total item count for the "Showing X–Y of N" summary. Omit to hide the summary. */
  totalItems?: number;
  className?: string;
}

export type SpindlePaginationHandle = SpindleMountedComponent<SpindlePaginationOptions>;

export interface SpindleCloseButtonOptions {
  onClick?: () => void;
  /** Visual size. Default: `"md"`. */
  size?: "sm" | "md";
  /** Visual variant. Default: `"subtle"`. */
  variant?: "subtle" | "solid";
  /** Positioning behavior. Default: `"static"`. */
  position?: "static" | "absolute";
  /** Icon size override in CSS pixels. */
  iconSize?: number;
  ariaLabel?: string;
  className?: string;
}

export type SpindleCloseButtonHandle = SpindleMountedComponent<SpindleCloseButtonOptions>;

// ──────────────────────────────────────────────────────────────────────────
// Aggregator
// ──────────────────────────────────────────────────────────────────────────

/**
 * Mount points for host-rendered shared components.
 *
 * Each method takes a `target` (the DOM node or selector inside the
 * extension-owned tree to render into) and an `options` object. The returned
 * handle exposes `update()`, `destroy()`, and component-specific helpers.
 *
 * @example
 * ```ts
 * // Inside a drawer tab
 * const tab = ctx.ui.registerDrawerTab({ id: "settings", title: "My Tab" })
 * const wrap = ctx.dom.createElement("div")
 * tab.root.appendChild(wrap)
 *
 * const picker = ctx.components.mountModelCombobox(wrap, {
 *   value: "",
 *   connection: { kind: "llm" },
 *   appearance: "standard",
 *   onChange: (model) => ctx.sendToBackend({ type: "set_model", model }),
 * })
 *
 * // Later — force the input to a specific value
 * picker.update({ value: "claude-opus-4-7" })
 * ```
 */
export interface SpindleComponentsHelper {
  // Text inputs
  mountTextInput(target: SpindleComponentTarget, options?: SpindleTextInputOptions): SpindleTextInputHandle;
  mountTextArea(target: SpindleComponentTarget, options?: SpindleTextAreaOptions): SpindleTextAreaHandle;

  // Numeric inputs
  mountNumericInput(target: SpindleComponentTarget, options?: SpindleNumericInputOptions): SpindleNumericInputHandle;
  mountNumberStepper(target: SpindleComponentTarget, options?: SpindleNumberStepperOptions): SpindleNumberStepperHandle;
  mountRangeSlider(target: SpindleComponentTarget, options: SpindleRangeSliderOptions): SpindleRangeSliderHandle;

  // Boolean inputs
  mountCheckbox(target: SpindleComponentTarget, options?: SpindleCheckboxOptions): SpindleCheckboxHandle;
  mountSwitch(target: SpindleComponentTarget, options?: SpindleSwitchOptions): SpindleSwitchHandle;

  // Pickers & selects
  mountSelect(target: SpindleComponentTarget, options: SpindleSelectOptions): SpindleSelectHandle;
  mountMultiSelect(target: SpindleComponentTarget, options: SpindleMultiSelectOptions): SpindleMultiSelectHandle;
  mountModelCombobox(target: SpindleComponentTarget, options: SpindleModelComboboxOptions): SpindleModelComboboxHandle;
  mountFolderDropdown(target: SpindleComponentTarget, options: SpindleFolderDropdownOptions): SpindleFolderDropdownHandle;

  // Display & layout
  mountBadge(target: SpindleComponentTarget, options: SpindleBadgeOptions): SpindleBadgeHandle;
  mountSpinner(target: SpindleComponentTarget, options?: SpindleSpinnerOptions): SpindleSpinnerHandle;
  mountCollapsibleSection(target: SpindleComponentTarget, options: SpindleCollapsibleSectionOptions): SpindleCollapsibleSectionHandle;
  mountPagination(target: SpindleComponentTarget, options: SpindlePaginationOptions): SpindlePaginationHandle;
  mountCloseButton(target: SpindleComponentTarget, options?: SpindleCloseButtonOptions): SpindleCloseButtonHandle;
}
