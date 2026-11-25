import { useEffect, useId, useRef, useState } from 'react';
import { Check, ExternalLink, LoaderCircle, RotateCcw, Search } from 'lucide-react';
import YoutubeVideoCard from './YoutubeVideoCard';
import {
  buildYouTubeSearchUrl,
  getYouTubeVideoId,
  normalizeYouTubeUrl,
  searchYouTubeVideos,
  youtubeThumbnailUrl,
  type YouTubeSuggestion,
} from '../lib/youtube';
import './youtube-version.css';

/** Words the team often adds when looking for another arrangement of the same song. */
export const VERSION_HINTS = ['ao vivo', 'acústico', 'playback', 'com letra'] as const;

export function baseVersionQuery(title = '', artist = ''): string {
  return [title.trim(), artist.trim()].filter(Boolean).join(' ').slice(0, 200);
}

/** Toggle one hint at the end of the query, so "Ao vivo" twice does not repeat the words. */
export function withVersionHint(query: string, hint: string): string {
  const clean = query.trim();
  const lower = clean.toLocaleLowerCase('pt-BR');
  if (lower.endsWith(` ${hint}`) || lower === hint) return clean.slice(0, clean.length - hint.length).trim();
  const withoutOther = VERSION_HINTS.reduce(
    (text, other) => (text.toLocaleLowerCase('pt-BR').endsWith(` ${other}`) ? text.slice(0, text.length - other.length).trim() : text),
    clean,
  );
  return `${withoutOther} ${hint}`.trim().slice(0, 200);
}

/**
 * Chooses the YouTube version for one song in one service. The library video is the
 * starting point and never changes here; an empty value means "use the library video".
 */
export default function YoutubeVersionPicker({
  value,
  onChange,
  songTitle,
  songArtist,
  libraryUrl,
  disabled,
}: {
  value: string;
  onChange: (url: string) => void;
  songTitle: string;
  songArtist: string;
  libraryUrl: string;
  disabled?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState(() => baseVersionQuery(songTitle, songArtist));
  const [results, setResults] = useState<YouTubeSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  const libraryHref = normalizeYouTubeUrl(libraryUrl);
  const libraryId = getYouTubeVideoId(libraryHref);
  const typed = value.trim();
  const chosenHref = typed ? normalizeYouTubeUrl(typed) : null;
  const chosenId = getYouTubeVideoId(chosenHref);
  const usingLibrary = !typed || (chosenId !== null && chosenId === libraryId);

  async function search(text = query) {
    const term = text.trim();
    if (term.length < 2 || disabled) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setSearching(true);
    setSearchError(null);
    setSearched(false);
    try {
      const response = await searchYouTubeVideos(term, '', controller.signal);
      if (controller.signal.aborted) return;
      setResults(response.results);
      setSearchError(response.results.length ? null : response.warning || null);
      setSearched(true);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setResults([]);
      setSearchError(cause instanceof Error ? cause.message : 'Não foi possível buscar vídeos agora.');
    } finally {
      if (request.current === controller) {
        request.current = null;
        setSearching(false);
      }
    }
  }

  function applyHint(hint: string) {
    const next = withVersionHint(query, hint);
    setQuery(next);
    void search(next);
  }

  const activeHint = VERSION_HINTS.find(hint => query.trim().toLocaleLowerCase('pt-BR').endsWith(` ${hint}`));
  // The library video stays at the top of the list, so going back is one tap away.
  const options: (YouTubeSuggestion & { library?: boolean })[] = [
    ...(libraryHref && libraryId
      ? [
          {
            id: libraryId,
            title: 'Vídeo padrão da biblioteca',
            channel: 'Usado quando o culto não escolhe outra versão',
            url: libraryHref,
            thumbnailUrl: youtubeThumbnailUrl(libraryId)!,
            library: true,
          },
        ]
      : []),
    ...results.filter(result => result.id !== libraryId),
  ];

  return (
    <section className="youtube-version" aria-labelledby={`${id}-title`}>
      <div className="youtube-version-head">
        <h3 id={`${id}-title`}>
          Versão no YouTube <span className="muted">(opcional)</span>
        </h3>
        <p>Escolha a versão que a equipe vai ouvir neste culto. O vídeo da música na biblioteca continua o mesmo.</p>
      </div>

      <div className="youtube-version-current" aria-live="polite">
        {chosenHref && !usingLibrary ? (
          <>
            <YoutubeVideoCard url={chosenHref} title={songTitle || 'Música do repertório'} caption="Versão deste culto" />
            {libraryHref ? (
              <button
                type="button"
                className="button button-secondary youtube-version-reset"
                disabled={disabled}
                onClick={() => onChange('')}
              >
                <RotateCcw size={14} />
                Voltar para o vídeo da biblioteca
              </button>
            ) : (
              <button type="button" className="button button-ghost youtube-version-reset" disabled={disabled} onClick={() => onChange('')}>
                Remover vídeo deste culto
              </button>
            )}
          </>
        ) : typed && !chosenHref ? (
          <p className="youtube-version-empty">
            Este link não parece ser de um vídeo do YouTube. Confira o endereço ou escolha uma versão na busca.
          </p>
        ) : libraryHref ? (
          <YoutubeVideoCard url={libraryHref} title={songTitle || 'Música do repertório'} caption="Vídeo da biblioteca (em uso)" />
        ) : (
          !typed && (
            <p className="youtube-version-empty">
              Esta música ainda não tem vídeo na biblioteca. Busque uma versão abaixo ou cole um link.
            </p>
          )
        )}
      </div>

      <div className="youtube-version-search" role="search">
        <label className="field" htmlFor={`${id}-query`}>
          <span>Buscar outra versão</span>
        </label>
        <div className="youtube-version-search-row">
          <input
            id={`${id}-query`}
            type="search"
            value={query}
            maxLength={200}
            disabled={disabled}
            placeholder="Título, artista, ministério…"
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              // This sits inside the item form: Enter searches instead of saving the form.
              if (event.key !== 'Enter') return;
              event.preventDefault();
              void search();
            }}
          />
          <button
            type="button"
            onClick={() => void search()}
            className="button button-primary"
            disabled={disabled || searching || query.trim().length < 2}
          >
            {searching ? <LoaderCircle className="spin" size={15} /> : <Search size={15} />}
            {searching ? 'Buscando…' : 'Buscar'}
          </button>
        </div>
        <div className="youtube-version-hints" role="group" aria-label="Refinar a busca">
          {VERSION_HINTS.map(hint => (
            <button
              key={hint}
              type="button"
              className={`chip${activeHint === hint ? ' active' : ''}`}
              aria-pressed={activeHint === hint}
              disabled={disabled || searching}
              onClick={() => applyHint(hint)}
            >
              {hint[0].toLocaleUpperCase('pt-BR') + hint.slice(1)}
            </button>
          ))}
          <a className="text-link" href={buildYouTubeSearchUrl(query)} target="_blank" rel="noopener noreferrer">
            Abrir no YouTube <ExternalLink size={12} />
          </a>
        </div>
      </div>

      {searchError && (
        <p className="youtube-version-message" role="status">
          {searchError}
        </p>
      )}
      {searched && !results.length && !searchError && (
        <p className="youtube-version-message" role="status">
          Nenhum vídeo encontrado. Tente outras palavras ou abra a busca no YouTube.
        </p>
      )}
      {results.length > 0 && (
        <ul className="youtube-version-results" aria-label="Versões encontradas">
          {options.map(option => {
            const selected = option.library ? usingLibrary : chosenId === option.id;
            return (
              <li key={option.id} className={`${selected ? 'selected' : ''}${option.library ? ' library' : ''}`}>
                <a href={option.url} target="_blank" rel="noopener noreferrer" aria-label={`Assistir ${option.title} no YouTube`}>
                  <img src={option.thumbnailUrl} alt="" loading="lazy" decoding="async" width={480} height={360} />
                  <span>
                    <strong>{option.title}</strong>
                    <small>{option.channel || 'YouTube'}</small>
                  </span>
                </a>
                <button
                  type="button"
                  className={`button ${selected ? 'button-primary' : 'button-secondary'}`}
                  aria-pressed={selected}
                  aria-label={option.library ? 'Usar o vídeo da biblioteca neste culto' : `Usar ${option.title} neste culto`}
                  disabled={disabled}
                  onClick={() => onChange(option.library ? '' : option.url)}
                >
                  <Check size={14} />
                  {selected ? 'Escolhido' : 'Usar este'}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <label className="field youtube-version-paste">
        <span>Ou cole o link do vídeo</span>
        <input
          type="url"
          aria-label="Link do vídeo do YouTube neste culto"
          value={value}
          placeholder="https://www.youtube.com/watch?v=…"
          disabled={disabled}
          onChange={event => onChange(event.target.value)}
        />
        <small>Deixe vazio para usar o vídeo da biblioteca.</small>
      </label>
    </section>
  );
}
