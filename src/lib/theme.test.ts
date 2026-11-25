import { describe, expect, it } from 'vitest';
import { effectiveTheme } from './theme';

describe('tema', () => {
  it('automático segue o aparelho; claro e escuro valem sempre', () => {
    expect(effectiveTheme('auto', true)).toBe('dark');
    expect(effectiveTheme('auto', false)).toBe('light');
    expect(effectiveTheme('light', true)).toBe('light');
    expect(effectiveTheme('dark', false)).toBe('dark');
  });
});
