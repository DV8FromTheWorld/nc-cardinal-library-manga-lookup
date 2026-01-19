/**
 * Text component for web platform.
 * Enforces consistent typography across the app.
 */

import type { CSSProperties, ReactNode } from 'react';

import type { TextColor, TextTag, TextVariant } from '../../../types';
import { parseVariant } from '../variant';
import styles from './Text.module.css';

export interface TextProps {
  /** The text variant defining size and weight */
  variant: TextVariant;
  /** Text color from the design system */
  color?: TextColor | undefined;
  /** HTML tag to render (web only) */
  tag?: TextTag | undefined;
  /** Child content */
  children: ReactNode;
  /** Additional CSS class names */
  className?: string | undefined;
  /** Inline styles (use sparingly) */
  style?: CSSProperties | undefined;
  /** Accessibility: element ID */
  id?: string | undefined;
  /** Accessibility: aria-label */
  'aria-label'?: string | undefined;
  /** Accessibility: aria-describedby */
  'aria-describedby'?: string | undefined;
  /** For label elements: htmlFor attribute */
  htmlFor?: string | undefined;
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

  if (parsed.weight != null) {
    return styles[`weight-${parsed.weight}`] ?? '';
  }

  return '';
}

/**
 * Get the CSS class for a color.
 */
function getColorClass(color: TextColor): string {
  // Convert color token to CSS class name
  const classKey = `color-${color}`;
  return styles[classKey] ?? '';
}

export function Text({
  variant,
  color = 'text-primary',
  tag: Tag = 'span',
  children,
  className,
  style,
  id,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  htmlFor,
}: TextProps): JSX.Element {
  const sizeClass = getSizeClass(variant);
  const weightClass = getWeightClass(variant);
  const colorClass = getColorClass(color);

  const combinedClassName = [styles.text, sizeClass, weightClass, colorClass, className]
    .filter((s): s is string => s != null && s !== '')
    .join(' ');

  // Build props object, only including defined values
  const elementProps: Record<string, unknown> = {
    className: combinedClassName,
  };

  if (style != null) elementProps.style = style;
  if (id != null && id !== '') elementProps.id = id;
  if (ariaLabel != null && ariaLabel !== '') elementProps['aria-label'] = ariaLabel;
  if (ariaDescribedBy != null && ariaDescribedBy !== '')
    elementProps['aria-describedby'] = ariaDescribedBy;
  if (htmlFor != null && htmlFor !== '' && Tag === 'label') elementProps.htmlFor = htmlFor;

  return <Tag {...elementProps}>{children}</Tag>;
}
