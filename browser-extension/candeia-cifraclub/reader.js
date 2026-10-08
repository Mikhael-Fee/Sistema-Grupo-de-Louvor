/* Pure DOM reader, shared by the declarative content script and the worker.
 * The worker uses only URL validation; it never fetches the source page.
 */
(function installReader(scope) {
  'use strict';
  const MAX_TEXT = 100_000;
  const MAX_NODES = 30_000;

  function normalizeSourceUrl(value) {
    if (typeof value !== 'string' || value.length > 2_048) return null;
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || url.port
        || !['www.cifraclub.com.br', 'cifraclub.com.br'].includes(url.hostname)
        || !/^\/[a-z0-9][a-z0-9_-]*\/[a-z0-9][a-z0-9_-]*\/?$/i.test(url.pathname)) return null;
      return `https://www.cifraclub.com.br${url.pathname.replace(/\/$/, '')}/`;
    } catch { return null; }
  }

  function visible(element, document) {
    if (!element || !element.isConnected || element.closest('[hidden], [aria-hidden="true"]')) return false;
    const view = document.defaultView;
    if (view) {
      const style = view.getComputedStyle(element);
      if (style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility)) return false;
      if (element.getClientRects().length === 0) return false;
    }
    return true;
  }

  function readPlainText(element, document) {
    const output = [];
    let characters = 0;
    let nodes = 0;
    // Iterative traversal preserves PRE spaces and BR line breaks without
    // cloning HTML, executing scripts, or recursively exhausting the stack.
    const pending = [element];
    while (pending.length) {
      const node = pending.pop();
      if (++nodes > MAX_NODES) throw new Error('A cifra tem uma estrutura muito grande para importar com segurança.');
      let value = '';
      if (node.nodeType === 3) value = node.nodeValue || '';
      else if (node.nodeType === 1) {
        const tag = node.tagName;
        if (['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT'].includes(tag)) continue;
        if (node.hidden || node.getAttribute('aria-hidden') === 'true') continue;
        const classes = node.getAttribute('class') || '';
        if (/(?:^|\s)(?:tablatura|tablature|cifra-tab|chord-diagram|chordDiagram|diagramas?)(?:\s|$)/i.test(classes)) continue;
        if (document.defaultView) {
          const style = document.defaultView.getComputedStyle(node);
          if (style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility)) continue;
        }
        if (tag === 'BR') value = '\n';
        else for (let index = node.childNodes.length - 1; index >= 0; index--) pending.push(node.childNodes[index]);
      }
      if (value) {
        characters += value.length;
        if (characters > MAX_TEXT) throw new Error('A cifra excede o limite de 100.000 caracteres.');
        output.push(value);
      }
    }
    return output.join('').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').replace(/^\n+|\n+$/g, '');
  }

  function hasChord(pre, document) {
    // This only recognizes an explicitly marked chord in the DOM. It does
    // not generate notes or infer harmony from lyrics.
    const notes = pre.querySelectorAll('b, strong');
    for (let index = 0; index < Math.min(notes.length, 2_000); index++) {
      if (!visible(notes[index], document)) continue;
      const value = (notes[index].textContent || '').trim().replace(/♯/g, '#').replace(/♭/g, 'b');
      if (value.length <= 80 && /^[A-G](?:#|b)?(?:maj|min|dim|aug|sus|add|omit|no|m|M)?[0-9()#bM+,/°øΔ-]*(?:\/[A-G](?:#|b)?)?$/.test(value)) return true;
    }
    return false;
  }

  function keyValue(value) {
    if (typeof value !== 'string') return undefined;
    const match = /^\s*([A-G](?:[#b♯♭])?(?:maj|min|m)?)\s*$/i.exec(value)?.[1];
    return match ? match[0].toUpperCase() + match.slice(1).replace(/♯/g, '#').replace(/♭/g, 'b') : undefined;
  }

  function displayedKey(document, text) {
    let explicitKey;
    let shapeKey;
    let soundingKey;
    let capo;
    const candidates = document.querySelectorAll('[data-current-key], #cifra_tom, .cifra_tom');
    for (let index = 0; index < Math.min(candidates.length, 20); index++) {
      const element = candidates[index];
      if (!visible(element, document)) continue;
      explicitKey ??= keyValue(element.getAttribute('data-current-key'));
      const label = (element.textContent || '').replace(/\s+/g, ' ').slice(0, 1_200);
      shapeKey ??= keyValue(/\bforma\s+dos?\s+acordes\s+(?:no\s+)?tom\s*(?:de\s+|:\s*)?([A-G](?:[#b♯♭])?(?:maj|min|m)?)(?=\s|$|[)])/i.exec(label)?.[1]);
      soundingKey ??= keyValue(/^\s*(?:tom\s*:\s*)?([A-G](?:[#b♯♭])?(?:maj|min|m)?)(?=\s|$|[()])/i.exec(label)?.[1]);
      const position = /\b(?:capotraste|capo)\s*(?::|=|na?|em)?\s*(\d{1,2})(?:\s*[ªºao])?(?:\s*casa)?\b/i.exec(label)?.[1];
      if (position !== undefined && Number(position) <= 12) capo ??= Number(position);
    }
    // The capo can be displayed next to the key, outside its own DOM node.
    const capoNodes = document.querySelectorAll('#cifra_capo, .cifra_capo, #cifra_capo_info, .cifra_capo_info, [data-capo]');
    for (let index = 0; index < Math.min(capoNodes.length, 20); index++) {
      const element = capoNodes[index];
      if (!visible(element, document)) continue;
      const attribute = element.getAttribute('data-capo');
      const label = (element.textContent || '').replace(/\s+/g, ' ').slice(0, 600);
      const position = attribute !== null && /^\d{1,2}$/.test(attribute) ? attribute
        : /\b(?:capotraste|capo)\s*(?::|=|na?|em)?\s*(\d{1,2})(?:\s*[ªºao])?(?:\s*casa)?\b/i.exec(label)?.[1];
      if (position !== undefined && Number(position) <= 12) capo ??= Number(position);
    }
    for (const rawLine of text.split('\n')) {
      const line = rawLine.replace(/\s+/g, ' ').trim();
      shapeKey ??= keyValue(/\bforma\s+dos?\s+acordes\s+(?:no\s+)?tom\s*(?:de\s+|:\s*)?([A-G](?:[#b♯♭])?(?:maj|min|m)?)(?=\s|$|[)])/i.exec(line)?.[1]);
      soundingKey ??= keyValue(/^\s*(?:tom|key|tonalidade)\s*:\s*([A-G](?:[#b♯♭])?(?:maj|min|m)?)(?=\s|$|[()])/i.exec(line)?.[1]);
      const position = /\b(?:capotraste|capo)\s*(?::|=|na?|em)?\s*(\d{1,2})(?:\s*[ªºao])?(?:\s*casa)?\b/i.exec(line)?.[1];
      if (position !== undefined && Number(position) <= 12) capo ??= Number(position);
    }
    const written = shapeKey || explicitKey || (!capo ? soundingKey : undefined);
    return { ...(written ? { displayedKey: written } : {}),
      ...(soundingKey && (shapeKey || explicitKey || capo) ? { soundingKey } : {}),
      ...(capo !== undefined ? { capo } : {}),
      ...(!written && capo ? { keyUnknownReason: 'A fonte informa capotraste, mas não o tom das posições dos acordes. Confirme o tom dos acordes escritos antes de importar.' } : {}) };
  }

  function musicLabel(value) {
    const label = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
    return /^(?:menu principal|main menu|navegação principal|cifra club)$/i.test(label) ? '' : label;
  }

  function metadataFromTitle(value, heading, linkedArtist) {
    if (typeof value !== 'string' || value.length > 1_200 || !/\s+-\s+Cifra Club\s*$/i.test(value)) return {};
    const full = value.replace(/\s+-\s+Cifra Club\s*$/i, '').trim();
    if (heading && full.startsWith(`${heading} - `)) return { title: heading, artist: musicLabel(full.slice(heading.length + 3)) };
    if (linkedArtist && full.endsWith(` - ${linkedArtist}`)) return { title: musicLabel(full.slice(0, -linkedArtist.length - 3)), artist: linkedArtist };
    const separator = full.lastIndexOf(' - ');
    return separator < 0 ? {} : { title: musicLabel(full.slice(0, separator)), artist: musicLabel(full.slice(separator + 3)) };
  }

  function musicMetadata(document, sourceUrl) {
    const heading = musicLabel((document.querySelector('h1.t1') || document.querySelector('h1'))?.textContent);
    const artistPath = `/${new URL(sourceUrl).pathname.split('/')[1]}/`;
    let linkedArtist = '';
    const links = document.querySelectorAll('h2 a[href], .cifra_artista a[href], [itemprop="byArtist"] a[href]');
    for (let index = 0; index < Math.min(links.length, 100); index++) {
      const link = links[index];
      if (link.closest?.('nav, [role="navigation"], footer, aside')) continue;
      try {
        const url = new URL(link.getAttribute('href'), sourceUrl);
        if (!['www.cifraclub.com.br', 'cifraclub.com.br'].includes(url.hostname) || url.protocol !== 'https:'
          || url.username || url.password || url.port || `${url.pathname.replace(/\/$/, '')}/` !== artistPath) continue;
        linkedArtist = musicLabel(link.textContent);
        if (linkedArtist) break;
      } catch { /* A navigation link is not song metadata. */ }
    }
    const og = metadataFromTitle(document.querySelector('meta[property="og:title"]')?.getAttribute('content'), heading, linkedArtist);
    const page = metadataFromTitle(document.title, heading, linkedArtist);
    return { title: og.title || heading || page.title || '', artist: og.artist || linkedArtist || page.artist || '' };
  }

  /** Return null while the chart has not appeared; throw for a clear failure. */
  function readDocument(document, selectedUrl, currentUrl = document.location?.href) {
    const sourceUrl = normalizeSourceUrl(selectedUrl);
    if (!sourceUrl || normalizeSourceUrl(currentUrl) !== sourceUrl) throw new Error('A página aberta não corresponde à versão escolhida do Cifra Club.');
    const sheets = document.querySelectorAll('pre');
    let pre;
    for (let index = 0; index < Math.min(sheets.length, 12); index++) {
      if (visible(sheets[index], document) && hasChord(sheets[index], document)) { pre = sheets[index]; break; }
    }
    if (!pre) {
      const headline = `${document.title || ''} ${document.querySelector('h1')?.textContent || ''}`.slice(0, 600);
      if (/\b(?:access denied|acesso negado|403 forbidden|forbidden)\b/i.test(headline)) {
        throw new Error('O Cifra Club bloqueou a página neste navegador. A extensão não contorna esse bloqueio.');
      }
      return null;
    }
    const { title, artist } = musicMetadata(document, sourceUrl);
    if (!title) return null;
    const text = readPlainText(pre, document);
    if (!text.trim()) return null;
    return { sourceUrl, title, artist, text, ...displayedKey(document, text) };
  }

  scope.CandeiaCifraReader = Object.freeze({ normalizeSourceUrl, readDocument });
})(globalThis);
