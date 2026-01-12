/**
 * Text component for React Native platform.
 * Enforces consistent typography across the app.
 */

import { Text as RNText, StyleSheet, useColorScheme } from 'react-native';
import type { ReactNode } from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import type { TextVariant, TextColor } from '../../../types';
import { parseVariant } from '../variant';
import {
  colors,
  fontSize,
  headerSize,
  fontWeight as fontWeightValues,
} from '../../../theme';

export interface TextProps {
  /** The text variant defining size and weight */
  variant: TextVariant;
  /** Text color from the design system */
  color?: TextColor | undefined;
  /** Child content */
  children: ReactNode;
  /** Additional styles */
  style?: StyleProp<TextStyle> | undefined;
  /** Number of lines before truncating */
  numberOfLines?: number | undefined;
  /** Whether text is selectable */
  selectable?: boolean | undefined;
  /** Accessibility label */
  accessibilityLabel?: string | undefined;
  /** Accessibility role */
  accessibilityRole?: 'text' | 'header' | 'link' | undefined;
}

/**
 * Get text styles for a variant.
 */
function getVariantStyles(variant: TextVariant): TextStyle {
  const parsed = parseVariant(variant);

  if (parsed.type === 'code') {
    return {
      fontFamily: 'JetBrains Mono',
      fontSize: 13,
      lineHeight: 13 * 1.5,
      fontWeight: '400',
    };
  }

  if (parsed.type === 'text' && parsed.size) {
    const size = fontSize[parsed.size as keyof typeof fontSize];
    return {
      fontFamily: 'DM Sans',
      fontSize: size,
      lineHeight: size * 1.5,
    };
  }

  if (parsed.type === 'header' && parsed.size) {
    const size = headerSize[parsed.size as keyof typeof headerSize];
    return {
      fontFamily: 'Crimson Pro',
      fontSize: size,
      lineHeight: size * 1.25,
    };
  }

  return {};
}

/**
 * Get font weight style.
 */
function getWeightStyle(variant: TextVariant): TextStyle {
  const parsed = parseVariant(variant);

  if (parsed.type === 'code') {
    return { fontWeight: '400' };
  }

  if (parsed.weight) {
    const weight = fontWeightValues[parsed.weight];
    return { fontWeight: String(weight) as TextStyle['fontWeight'] };
  }

  return {};
}

/**
 * Get color value for a color token.
 */
function getColorValue(
  colorToken: TextColor,
  themeColors: typeof colors.light,
): string | undefined {
  switch (colorToken) {
    case 'text-primary':
      return themeColors.textPrimary;
    case 'text-secondary':
      return themeColors.textSecondary;
    case 'text-muted':
      return themeColors.textMuted;
    case 'interactive-primary':
      return themeColors.interactivePrimary;
    case 'interactive-hover':
      return themeColors.interactiveHover;
    case 'interactive-active':
      return themeColors.interactiveActive;
    case 'accent':
      return themeColors.accent;
    case 'success':
      return themeColors.success;
    case 'warning':
      return themeColors.warning;
    case 'error':
      return themeColors.error;
    case 'currentColor':
    case 'none':
      return undefined; // Inherit from parent
    default:
      return themeColors.textPrimary;
  }
}

export function Text({
  variant,
  color = 'text-primary',
  children,
  style,
  numberOfLines,
  selectable,
  accessibilityLabel,
  accessibilityRole,
}: TextProps): JSX.Element {
  const colorScheme = useColorScheme();
  const themeColors = colorScheme === 'dark' ? colors.dark : colors.light;

  const variantStyles = getVariantStyles(variant);
  const weightStyles = getWeightStyle(variant);
  const colorValue = getColorValue(color, themeColors);

  const combinedStyles: StyleProp<TextStyle> = [
    styles.base,
    variantStyles,
    weightStyles,
    colorValue ? { color: colorValue } : undefined,
    style,
  ];

  return (
    <RNText
      style={combinedStyles}
      numberOfLines={numberOfLines}
      selectable={selectable}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
    >
      {children}
    </RNText>
  );
}

const styles = StyleSheet.create({
  base: {
    // Reset any default margins
  },
});
