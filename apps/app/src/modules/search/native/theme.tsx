/**
 * Theme constants for React Native.
 * Mirrors the web CSS variables.
 */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 32,
  xl: 64,
} as const;

/**
 * Theme color values.
 */
export interface ThemeColors {
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentHover: string;
  accentAlpha: string;
  border: string;
  borderStrong: string;
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
    accent: '#c41e3a',
    accentHover: '#a01830',
    accentAlpha: 'rgba(196, 30, 58, 0.1)',
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
    accent: '#e63950',
    accentHover: '#ff5a6e',
    accentAlpha: 'rgba(230, 57, 80, 0.1)',
    border: '#333333',
    borderStrong: '#444444',
    success: '#66bb6a',
    successBg: 'rgba(102, 187, 106, 0.1)',
    warning: '#ffa726',
    error: '#f44336',
    errorBg: 'rgba(244, 67, 54, 0.1)',
  },
};
