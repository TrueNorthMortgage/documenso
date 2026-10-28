import { describe, expect, it } from 'vitest';

import { FIELD_INITIALS_META_DEFAULT_VALUES, resolveFieldOverflowMode } from '../../types/field-meta';
import { calculateOverflowLayout } from './calculate-overflow-layout';

// A 36px square has room to wrap 12px initials onto multiple lines in auto mode.
describe('initials in a square field', () => {
  it.each([
    'left',
    'center',
    'right',
  ] as const)('keeps long %s-aligned initials on one line beyond the field', (textAlign) => {
    const overflowMode = resolveFieldOverflowMode(FIELD_INITIALS_META_DEFAULT_VALUES, 'INITIALS');
    expect(overflowMode).toBe('horizontal');
    const layout = calculateOverflowLayout({
      overflowMode,
      isLabel: false,
      textToRender: 'JDSSCC',
      fontSize: 12,
      fontFamily: 'Arial',
      lineHeight: 1,
      letterSpacing: 0,
      textAlign,
      verticalAlign: 'middle',
      baseX: 6,
      baseY: 0,
      baseWidth: 24,
      baseHeight: 36,
      groupX: 100,
      groupY: 100,
      pageWidth: 595,
      pageHeight: 842,
    });
    expect(layout.wrap).toBe('none');
    expect(layout.width).toBeGreaterThan(24);
    expect(layout.height).toBe(36);
    expect(layout.textAlign).toBe(textAlign);
  });

  it('preserves an explicitly saved overflow setting', () => {
    expect(resolveFieldOverflowMode({ type: 'initials', overflow: 'auto' })).toBe('auto');
    expect(resolveFieldOverflowMode({ type: 'initials', overflow: 'crop' })).toBe('crop');
  });
});
