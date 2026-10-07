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

  function displayedKey(document) {
    const candidates = document.querySelectorAll('[data-current-key], #cifra_tom, .cifra_tom');
    for (let index = 0; index < Math.min(candidates.length, 20); index++) {
      const element = candidates[index];
      if (!visible(element, document)) continue;
      const label = element.getAttribute('data-current-key') || element.textContent || '';
      const value = /^\s*(?:tom\s*:\s*)?([A-G](?:[#b♯♭])?(?:maj|min|m)?)(?=\s|$|[()])/i.exec(label.slice(0, 300))?.[1];
      if (value) return value[0].toUpperCase() + value.slice(1).replace(/♯/g, '#').replace(/♭/g, 'b');
    }
    return undefined;
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
    const metadata = /^(.*?)\s+-\s+(.*?)\s+-\s+Cifra Club\s*$/i.exec(document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '');
    const title = (document.querySelector('h1')?.textContent?.trim() || metadata?.[1] || '').trim().slice(0, 200);
    const artist = (document.querySelector('h2')?.textContent?.trim() || metadata?.[2] || '').trim().slice(0, 200);
    if (!title || !artist) return null;
    const text = readPlainText(pre, document);
    if (!text.trim()) return null;
    const key = displayedKey(document);
    return { sourceUrl, title, artist, text, ...(key ? { displayedKey: key } : {}) };
  }

  scope.CandeiaCifraReader = Object.freeze({ normalizeSourceUrl, readDocument });
})(globalThis);
