import { useEffect, useRef, useState } from 'react';
import { Check, ExternalLink, LoaderCircle, Search } from 'lucide-react';
import { FormError } from '../ui';
import HelpTip from '../HelpTip';
import {
  buildYouTubeSearchUrl,
  getYouTubeVideoId,
  normalizeYouTubeUrl,
  searchYouTubeVideos,
  youtubeThumbnailUrl,
  type YouTubeSuggestion,
} from '../../lib/youtube';

/** The song's YouTube link, with suggestions searched by title and artist. */
export default function SongVideoField({
  fieldId,
  title,
  artist,
  url,
  suggestNow,
  onChange,
}: {
  fieldId: string;
  title: string;
  artist: string;
  url: string;
  /** Becomes true after a cifra import: one suggestion request then, never while typing. */
  suggestNow: boolean;
  onChange: (url: string) => void;
}) {
  const request = useRef<AbortController | null>(null);
  const [results, setResults] = useState<YouTubeSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    request.current?.abort();
    setSearching(false);
    setResults([]);
    setError(null);
    setSearched(false);
  }, [title, artist]);
  async function search() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setSearching(true);
    setSearched(false);
    setError(null);
    setResults([]);
    try {
      const response = await searchYouTubeVideos(title, artist, controller.signal);
      if (!controller.signal.aborted) {
        setResults(response.results);
        setError(response.warning || null);
        setSearched(true);
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Não foi possível buscar vídeos.');
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }
  useEffect(() => {
    if (suggestNow && title.trim().length >= 2) void search();
  }, [suggestNow]);
  const selectedId = getYouTubeVideoId(url);
  return (
    <section className="songs-youtube" aria-label="Vídeo da música no YouTube">
      <div className="field">
        <span className="songs-label-row">
          <label htmlFor={fieldId}>
            Vídeo no YouTube <span className="songs-optional">opcional</span>
          </label>
          <HelpTip label="vídeo">
            Busque pelo título e artista e escolha a versão da biblioteca. Cada culto pode indicar outra versão no repertório.
          </HelpTip>
        </span>
        <input
          id={fieldId}
          type="url"
          value={url}
          onChange={e => onChange(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
        />
      </div>
      <div className="songs-video-search-actions">
        <button type="button" className="button button-secondary" disabled={searching || title.trim().length < 2} onClick={search}>
          {searching ? <LoaderCircle className="songs-spinner" size={15} /> : <Search size={15} />}
          {searching ? 'Buscando vídeos…' : 'Sugerir vídeos'}
        </button>
        <a className="button button-ghost" href={buildYouTubeSearchUrl(title, artist)} target="_blank" rel="noopener noreferrer">
          Abrir busca no YouTube
          <ExternalLink size={13} />
        </a>
        {searching && (
          <button
            type="button"
            className="button button-ghost"
            onClick={() => {
              request.current?.abort();
              setSearching(false);
            }}
          >
            Cancelar busca de vídeos
          </button>
        )}
      </div>
      <FormError error={error} />
      {searched && !results.length && !error && (
        <p className="songs-field-hint" role="status">
          Nenhum vídeo encontrado. Abra a busca no YouTube ou ajuste o título e artista.
        </p>
      )}
      {results.length > 0 && (
        <ul className="songs-video-results" aria-label="Sugestões de vídeos">
          {results.map(video => (
            <li key={video.id}>
              <a href={video.url} target="_blank" rel="noopener noreferrer" aria-label={`Assistir ${video.title} no YouTube`}>
                <img src={video.thumbnailUrl} alt="" loading="lazy" decoding="async" />
                <span>
                  <strong>{video.title}</strong>
                  <small>{video.channel || 'YouTube'}</small>
                </span>
              </a>
              <button
                type="button"
                className={`button ${selectedId === video.id ? 'button-primary' : 'button-secondary'}`}
                aria-label={`Selecionar vídeo ${video.title}`}
                aria-pressed={selectedId === video.id}
                onClick={() => {
                  onChange(video.url);
                  setResults([]);
                  setError(null);
                  setSearched(false);
                }}
              >
                <Check size={14} />
                Selecionar
              </button>
            </li>
          ))}
        </ul>
      )}
      {selectedId && (
        <a className="songs-selected-video" href={normalizeYouTubeUrl(url)!} target="_blank" rel="noopener noreferrer">
          <img src={youtubeThumbnailUrl(url)!} alt="" loading="lazy" decoding="async" />
          <span>
            <strong>Vídeo selecionado</strong>
            <small>Assistir à versão no YouTube</small>
          </span>
          <ExternalLink size={16} />
        </a>
      )}
    </section>
  );
}
