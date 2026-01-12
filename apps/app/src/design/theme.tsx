/**
 * Design system theme constants.
 * Used by both web and native platforms.
 */

// =============================================================================
// Spacing
// =============================================================================

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 32,
  xl: 64,
} as const;

// =============================================================================
// Typography
// =============================================================================

export const fontFamily = {
  sans: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  serif: "'Crimson Pro', Georgia, serif",
  mono: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
} as const;

/**
 * Font sizes in pixels.
 */
export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
} as const;

/**
 * Header sizes in pixels.
 */
export const headerSize = {
  sm: 18,
  md: 22,
  lg: 28,
  xl: 36,
  '2xl': 48,
} as const;

/**
 * Font weights.
 */
export const fontWeight = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

/**
 * Line heights as multipliers.
 */
export const lineHeight = {
  tight: 1.25,
  normal: 1.5,
  relaxed: 1.75,
} as const;

// =============================================================================
// Colors
// =============================================================================

export interface ThemeColors {
  // Backgrounds
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  // Interactive
  interactivePrimary: string;
  interactiveHover: string;
  interactiveActive: string;
  // Accent
  accent: string;
  accentHover: string;
  // Borders
  border: string;
  borderStrong: string;
  // Status
  success: string;
  successBg: string;
  warning: string;
  error: string;
  errorBg: string;
}

export const colors: { light: ThemeColors; dark: ThemeColors } = {
  light: {
    bgPrimary: '#ffffff',
    bgSecondary: '#f5f5f5',
    bgTertiary: '#e8e8e8',
    textPrimary: '#1a1a1a',
    textSecondary: '#666666',
    textMuted: '#999999',
    interactivePrimary: '#c41e3a',
    interactiveHover: '#a01830',
    interactiveActive: '#8a1528',
    accent: '#c41e3a',
    accentHover: '#a01830',
    border: '#e0e0e0',
    borderStrong: '#cccccc',
    success: '#2e7d32',
    successBg: 'rgba(46, 125, 50, 0.1)',
    warning: '#ed6c02',
    error: '#d32f2f',
    errorBg: 'rgba(211, 47, 47, 0.1)',
  },
  dark: {
    bgPrimary: '#121212',
    bgSecondary: '#1e1e1e',
    bgTertiary: '#2a2a2a',
    textPrimary: '#f0f0f0',
    textSecondary: '#a0a0a0',
    textMuted: '#707070',
    interactivePrimary: '#e63950',
    interactiveHover: '#ff5a6e',
    interactiveActive: '#ff7a8a',
    accent: '#e63950',
    accentHover: '#ff5a6e',
    border: '#333333',
    borderStrong: '#444444',
    success: '#66bb6a',
    successBg: 'rgba(102, 187, 106, 0.1)',
    warning: '#ffa726',
    error: '#f44336',
    errorBg: 'rgba(244, 67, 54, 0.1)',
  },
};

// =============================================================================
// Border Radius
// =============================================================================

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  full: 9999,
} as const;
