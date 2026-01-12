/**
 * Text variant parsing utilities.
 * Shared between web and native Text components.
 */

import type { TextVariant, TextSize, HeaderSize, FontWeight } from '../../types';

/**
 * Parsed variant structure.
 */
export interface ParsedVariant {
  type: 'text' | 'header' | 'code';
  size: TextSize | HeaderSize | null;
  weight: FontWeight | null;
}

/**
 * Parse a text variant string into its components.
 */
export function parseVariant(variant: TextVariant): ParsedVariant {
  if (variant === 'code') {
    return { type: 'code', size: null, weight: null };
  }

  const [typeSize, weight] = variant.split('/') as [string, FontWeight];
  const [type, size] = typeSize.split('-') as [
    'text' | 'header',
    TextSize | HeaderSize,
  ];

  return { type, size, weight };
}
