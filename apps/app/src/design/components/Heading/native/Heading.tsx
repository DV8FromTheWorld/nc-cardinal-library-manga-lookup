/**
 * Heading component for React Native.
 * Renders text with heading-appropriate typography.
 */

import type { ReactNode } from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import { StyleSheet, Text, useColorScheme } from 'react-native';

import {
  colors,
  fontFamily,
  fontSize,
  fontWeight as fontWeightValues,
  headerSize,
} from '../../../theme';
import type { TextColor, TextVariant } from '../../../types';
import { parseVariant } from '../../Text/variant';

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

interface HeadingProps {
  /** Heading level (1-6) - determines default typography styling */
  level: HeadingLevel;
  /** Optional text variant to override default heading styles */
  variant?: TextVariant | undefined;
  /** Text color from the design system */
  color?: TextColor | undefined;
  /** Content to render */
  children: ReactNode;
  /** Additional styles */
  style?: StyleProp<TextStyle> | undefined;
  /** Number of lines before truncating */
  numberOfLines?: number | undefined;
}

/**
 * Default styles for each heading level.
 */
const levelStyles: Record<HeadingLevel, TextStyle> = {
  1: {
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 38,
  },
  2: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 34,
  },
  3: {
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 28,
  },
  4: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 24,
  },
  5: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  6: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
};

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

  if (parsed.type === 'text' && parsed.size != null) {
    const size = fontSize[parsed.size as keyof typeof fontSize];
    return {
      fontFamily: 'DM Sans',
      fontSize: size,
      lineHeight: size * 1.5,
    };
  }

  if (parsed.type === 'header' && parsed.size != null) {
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

  if (parsed.weight != null) {
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
  themeColors: typeof colors.light
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

export function Heading({
  level,
  variant,
  color = 'text-primary',
  children,
  style,
  numberOfLines,
}: HeadingProps): JSX.Element {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeColors = isDark ? colors.dark : colors.light;

  // Determine styles based on variant or level
  let typographyStyles: TextStyle;
  let weightStyles: TextStyle = {};

  if (variant != null) {
    typographyStyles = getVariantStyles(variant);
    weightStyles = getWeightStyle(variant);
  } else {
    typographyStyles = levelStyles[level];
  }

  const colorValue = getColorValue(color, themeColors);

  return (
    <Text
      style={[
        styles.base,
        typographyStyles,
        weightStyles,
        colorValue != null ? { color: colorValue } : undefined,
        style,
      ]}
      numberOfLines={numberOfLines}
      accessibilityRole="header"
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    fontFamily: fontFamily.serif,
  },
});
