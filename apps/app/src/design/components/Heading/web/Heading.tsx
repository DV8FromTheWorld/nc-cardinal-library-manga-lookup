/**
 * Heading component for web.
 * Renders semantic h1-h6 elements with consistent typography.
 */

import type { ReactNode, CSSProperties } from 'react';
import type { TextVariant, TextColor } from '../../../types';
import { parseVariant } from '../../Text/variant';
import styles from './Heading.module.css';

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

interface HeadingProps {
  /** Heading level (1-6) - renders the corresponding h1-h6 tag */
  level: HeadingLevel;
  /** Optional text variant to override default heading styles */
  variant?: TextVariant | undefined;
  /** Text color from the design system */
  color?: TextColor | undefined;
  /** Content to render */
  children: ReactNode;
  /** Additional CSS class name */
  className?: string | undefined;
  /** Inline styles (use sparingly) */
  style?: CSSProperties | undefined;
  /** Accessibility: element ID */
  id?: string | undefined;
}

/**
 * Get the CSS class for a size variant.
 */
function getSizeClass(variant: TextVariant): string {
  const parsed = parseVariant(variant);

  if (parsed.type === 'code') {
    return styles.code ?? '';
  }

  if (parsed.type === 'text') {
    return styles[`text-${parsed.size}`] ?? '';
  }

  if (parsed.type === 'header') {
    return styles[`header-${parsed.size}`] ?? '';
  }

  return '';
}

/**
 * Get the CSS class for a font weight.
 */
function getWeightClass(variant: TextVariant): string {
  const parsed = parseVariant(variant);

  if (parsed.type === 'code') {
    return styles['weight-normal'] ?? '';
  }

  if (parsed.weight) {
    return styles[`weight-${parsed.weight}`] ?? '';
  }

  return '';
}

/**
 * Get the CSS class for a color.
 */
function getColorClass(color: TextColor): string {
  const classKey = `color-${color}`;
  return styles[classKey] ?? '';
}

export function Heading({
  level,
  variant,
  color = 'text-primary',
  children,
  className,
  style,
  id,
}: HeadingProps): JSX.Element {
  const Tag = `h${level}` as const;

  // Build class list
  const classes: string[] = [];
  const headingClass = styles.heading;
  if (headingClass) classes.push(headingClass);

  if (variant) {
    // Use variant-based styling
    const sizeClass = getSizeClass(variant);
    const weightClass = getWeightClass(variant);
    if (sizeClass) classes.push(sizeClass);
    if (weightClass) classes.push(weightClass);
  } else {
    // Use level-based default styling
    const levelClass = styles[`h${level}`];
    if (levelClass) classes.push(levelClass);
  }

  const colorClass = getColorClass(color);
  if (colorClass) classes.push(colorClass);

  if (className) {
    classes.push(className);
  }

  const combinedClassName = classes.filter(Boolean).join(' ');

  return (
    <Tag className={combinedClassName} style={style} id={id}>
      {children}
    </Tag>
  );
}
