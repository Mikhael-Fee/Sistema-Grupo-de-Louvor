// Turns every fixed color in the app's CSS into a variable with a light and a dark value.
// Run again after adding colors: node scripts/theme-colors.mjs (rewrites the CSS files and src/theme.css).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const folders = ['src', 'src/pages', 'src/components'];
const files = folders.flatMap(folder =>
  readdirSync(folder)
    .filter(name => name.endsWith('.css') && name !== 'theme.css')
    .map(name => join(folder, name)),
);

function normalize(raw) {
  let hex = raw.slice(1).toLowerCase();
  if (hex.length === 3 || hex.length === 4) hex = [...hex].map(c => c + c).join('');
  if (hex.length === 6) hex += 'ff';
  return hex;
}
const named = { white: 'ffffffff', black: '000000ff' };
function rgbaHex(r, g, b, a = 1) {
  return [r, g, b, Math.round(a * 255)]
    .map(n =>
      Math.max(0, Math.min(255, Math.round(n)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');
}

function toHsl([r, g, b]) {
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function fromHsl([h, s, l]) {
  if (!s) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = t => {
    t = (t + 1) % 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
  };
  return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)];
}
/** Light surfaces become dark and dark text becomes light, keeping hue; pure white cards sit just above the page. */
export function darkColor(hex8) {
  const rgb = [0, 2, 4].map(i => parseInt(hex8.slice(i, i + 2), 16) / 255);
  const alpha = hex8.slice(6);
  const [h, s, l] = toHsl(rgb);
  let nl = 0.07 + 0.83 * (1 - l);
  if (l > 0.985) nl = 0.185;
  const ns = l > 0.85 ? s * 0.4 : s;
  return toHex(fromHsl([h, ns, nl])) + alpha;
}
/** Borders and outlines: on the dark page a light line must stay clearly lighter than the cards it separates. */
export function darkLine(hex8) {
  const rgb = [0, 2, 4].map(i => parseInt(hex8.slice(i, i + 2), 16) / 255);
  const alpha = hex8.slice(6);
  const [h, s, l] = toHsl(rgb);
  if (l < 0.5) return darkColor(hex8);
  return toHex(fromHsl([h, s * 0.5, 0.25 + 0.8 * (1 - l)])) + (parseInt(alpha, 16) < 0x80 ? '80' : alpha);
}
const toHex = rgb =>
  rgb
    .map(v =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');
const LINE = /^(border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-color)?|outline(-color)?)$/;

const used = new Set();
const lines = new Set();
const COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)|(?<![-\w])(white|black)(?![-\w])/g;
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const result = source.replace(/([{;]\s*)([-\w]+)(\s*:\s*)([^;{}]+)/g, (match, lead, property, colon, value) => {
    if (property.startsWith('--')) return match;
    const line = LINE.test(property);
    const next = value
      .replace(/var\(--[cl]-([0-9a-f]{8})\)/g, (all, hex) => {
        if (line) {
          lines.add(hex);
          return `var(--l-${hex})`;
        }
        used.add(hex);
        return `var(--c-${hex})`;
      })
      .replace(COLOR, (color, r, g, b, a, word) => {
        if (color.startsWith('#') && ![4, 5, 7, 9].includes(color.length)) return color;
        const hex = word ? named[word] : r !== undefined ? rgbaHex(+r, +g, +b, a === undefined ? 1 : +a) : normalize(color);
        // Soft shadows stay dark in both themes; colored rings follow the theme.
        if (/shadow/.test(property) && parseInt(hex.slice(6), 16) < 0x40) return color;
        // Dark see-through layers (the dim behind a dialog) stay dark in both themes.
        if (parseInt(hex.slice(6), 16) < 0xcc && toHsl([0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255))[2] < 0.3) return color;
        if (line) {
          lines.add(hex);
          return `var(--l-${hex})`;
        }
        used.add(hex);
        return `var(--c-${hex})`;
      });
    return lead + property + colon + next;
  });
  if (result !== source) writeFileSync(file, result);
}
const list = [...used].sort();
const lineList = [...lines].sort();
const light = [...list.map(hex => `--c-${hex}:#${hex}`), ...lineList.map(hex => `--l-${hex}:#${hex}`)].join(';');
// Already-dark panels (the next-service highlight) keep their light-theme look on the dark page.
// Semantic variables from :root are repeated so they resolve to the light colors inside them.
const KEEP_LIGHT = ['.next-service', '.login-story', '.sidebar'];
const semantic = [...(readFileSync('src/styles.css', 'utf8').match(/:root\{([^}]*)\}/)?.[1] ?? '').matchAll(/(--[\w-]+):([^;]+)/g)]
  .map(([, name, value]) => `${name}:${value}`)
  .join(';');
const keepLight = `${light};${semantic}`;
const borderHex = (readFileSync('src/styles.css', 'utf8').match(/--border:var\(--c-([0-9a-f]{8})\)/) ?? [])[1];
const dark = [
  ...list.map(hex => `--c-${hex}:#${darkColor(hex)}`),
  ...lineList.map(hex => `--l-${hex}:#${darkLine(hex)}`),
  ...(borderHex ? [`--border:#${darkLine(borderHex)}`] : []),
].join(';');
// The side menu keeps its navy look but sits below the page, with a clear edge.
const sidebarDark = `.sidebar{background:#0a121b;border-right-color:#${borderHex ? darkLine(borderHex) : '33485e'}}`;
writeFileSync(
  'src/theme.css',
  `/* Generated by scripts/theme-colors.mjs. Light values first; dark values follow the theme chosen in Meu perfil. */
:root{color-scheme:light;${light}}
:root[data-theme=dark]{color-scheme:dark;${dark}}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){color-scheme:dark;${dark}}}
${KEEP_LIGHT.map(selector => `:root[data-theme=dark] ${selector}`).join(',')}{color-scheme:light;${keepLight}}
@media (prefers-color-scheme:dark){${KEEP_LIGHT.map(selector => `:root:not([data-theme=light]) ${selector}`).join(',')}{color-scheme:light;${keepLight}}}
:root[data-theme=dark] ${sidebarDark}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]) ${sidebarDark}}
`,
);
console.log(`${files.length} files, ${list.length} colors`);
