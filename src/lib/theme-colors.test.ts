import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const folders = ['src', 'src/pages', 'src/components'];
const css = folders
  .flatMap(folder =>
    readdirSync(folder)
      .filter(name => name.endsWith('.css'))
      .map(name => readFileSync(join(folder, name), 'utf8')),
  )
  .join('\n');

describe('cores do tema', () => {
  // A variable used but never defined resolves to nothing: a button's background becomes transparent on hover.
  it('toda cor usada no CSS está definida', () => {
    const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]));
    const missing = [
      ...new Set([...css.matchAll(/var\((--[cl]-[0-9a-f]{8}|--(?:navy|green|flame)[\w-]*)\)/g)].map(match => match[1])),
    ].filter(name => !defined.has(name));
    expect(missing).toEqual([]);
  });

  it('o escuro tem cor própria para o hover dos botões principais', () => {
    const theme = readFileSync('src/theme.css', 'utf8');
    const dark = theme.match(/:root\[data-theme=dark\]\{([^}]*)\}/)![1];
    expect(dark).toMatch(/--c-213d58ff:#[0-9a-f]{8}/);
  });
});
