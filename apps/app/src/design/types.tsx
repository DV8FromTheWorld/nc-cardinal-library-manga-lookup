/**
 * Design system shared types.
 */

// =============================================================================
// Text Variants
// =============================================================================

/**
 * Text size categories.
 */
export type TextSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/**
 * Header size categories.
 */
export type HeaderSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

/**
 * Font weight categories.
 */
export type FontWeight = 'normal' | 'medium' | 'semibold' | 'bold';

/**
 * Text variant format: `text-{size}/{weight}` or `header-{size}/{weight}` or `code`
 * 
 * Examples:
 * - `text-md/normal` - Medium body text, normal weight
 * - `text-sm/medium` - Small body text, medium weight
 * - `header-lg/bold` - Large header, bold weight
 * - `code` - Monospace code text
 */
export type TextVariant =
  | `text-${TextSize}/${FontWeight}`
  | `header-${HeaderSize}/${FontWeight}`
  | 'code';

// =============================================================================
// Text Colors
// =============================================================================

/**
 * Semantic text colors.
 */
export type TextSemanticColor =
  | 'text-primary'
  | 'text-secondary'
  | 'text-muted';

/**
 * Interactive state colors.
 */
export type InteractiveColor =
  | 'interactive-primary'
  | 'interactive-hover'
  | 'interactive-active';

/**
 * Status/accent colors.
 */
export type StatusColor =
  | 'accent'
  | 'success'
  | 'warning'
  | 'error';

/**
 * Special color values.
 */
export type SpecialColor =
  | 'currentColor'
  | 'none';

/**
 * All allowed text colors.
 */
export type TextColor =
  | TextSemanticColor
  | InteractiveColor
  | StatusColor
  | SpecialColor;

// =============================================================================
// Text Tags (Web only)
// =============================================================================

/**
 * Allowed HTML tags for the Text component on web.
 */
export type TextTag = 'span' | 'div' | 'p' | 'strong' | 'li' | 'label' | 'summary';
