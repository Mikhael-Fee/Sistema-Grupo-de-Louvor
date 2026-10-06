import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, ExternalLink, FileText, Maximize2, Minus, Music2, Pencil, Plus, Save, StickyNote, X } from 'lucide-react';
import { EmptyState, FormError } from '../components/ui';
import { useMinistry } from '../context/MinistryContext';
import { chordSegments, KEYS, stripChords, transposeContent } from '../lib/music';
import { isSafeYoutubeUrl } from '../lib/validation';
import { SongEditor } from './SongsPage';
import './songs.css';

export default function SongPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { data, canEditLibrary, canPlan, saveService, busy } = useMinistry();
  const song = data.songs.find(item => item.id === id);
  const service = data.services.find(item => item.id === searchParams.get('service'));
  const setlistItem = service?.repertoire.find(item => item.id === searchParams.get('item') && item.songId === id);
  const defaultKey = setlistItem?.key || song?.churchKey || 'C';
  const [viewKey, setViewKey] = useState(defaultKey);
  const [showChords, setShowChords] = useState(true);
  const [fontSize, setFontSize] = useState(18);
  const [reading, setReading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setViewKey(defaultKey); setSaveError(null); }, [id, defaultKey]);
  useEffect(() => { setSaved(false); }, [id]);
  const content = useMemo(() => song ? transposeContent(song.content, song.originalKey, viewKey) : '', [song, viewKey]);
  const changeKey = (key: string) => { setViewKey(key); setSaved(false); setSaveError(null); };
  const stepKey = (step: number) => {
    const index = KEYS.indexOf(viewKey);
    changeKey(KEYS[(Math.max(index, 0) + step + KEYS.length) % KEYS.length]);
  };

  async function saveKey() {
    if (!service || !setlistItem) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveService({ ...service, repertoire: service.repertoire.map(item => item.id === setlistItem.id ? { ...item, key: viewKey } : item) });
      setSaved(true);
    } catch (cause) { setSaveError(cause instanceof Error ? cause.message : 'Não foi possível salvar o tom neste culto.'); }
    finally { setSaving(false); }
  }

  if (!song) return <><Link className="song-back" to="/musicas"><ArrowLeft size={16} />Voltar à biblioteca</Link><div className="card"><EmptyState title="Música não encontrada" description="Ela pode ter sido removida da biblioteca." action={<Link className="button button-primary" to="/musicas">Abrir biblioteca</Link>} /></div></>;
  const songTags = data.tags.filter(tag => song.tagIds.includes(tag.id));
  const hasVideo = Boolean(song.youtubeUrl) && isSafeYoutubeUrl(song.youtubeUrl);
  const serviceLabel = service ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long' }).format(new Date(`${service.date}T12:00:00`)) : '';

  return <div className={`song-page ${reading ? 'song-reading' : ''}`}>
    {!reading && <>
      <Link className="song-back" to={setlistItem && service ? `/cultos/${service.id}` : '/musicas'}><ArrowLeft size={16} />{setlistItem && service ? 'Voltar ao culto' : 'Voltar à biblioteca'}</Link>
      <header className="song-header"><div className="song-heading"><span className="song-title-icon"><Music2 size={27} /></span><div><p className="eyebrow">{setlistItem && service ? `${service.type} · ${serviceLabel}` : 'BIBLIOTECA DE MÚSICAS'}</p><h1>{song.title}</h1><p className="song-artist">{song.artist}</p></div></div>{canEditLibrary && <button className="button button-secondary" onClick={() => setEditing(true)}><Pencil size={16} />Editar música</button>}</header>
      <div className="song-meta"><span>Tom original <strong>{song.originalKey}</strong></span><span>Tom na igreja <strong>{song.churchKey}</strong></span>{setlistItem && <span>Tom do culto <strong>{setlistItem.key}</strong></span>}{songTags.map(tag => <span key={tag.id} className="songs-tag"><span className="songs-tag-dot" style={{ backgroundColor: tag.color }} />{tag.name}</span>)}</div>
    </>}
    <section className="card song-reader">
      <div className="song-reader-toolbar">
        <div className="song-content-tabs" role="group" aria-label="Tipo de visualização"><button className={showChords ? 'active' : ''} aria-pressed={showChords} onClick={() => setShowChords(true)}><Music2 size={16} /><span>Letra e cifra</span></button><button className={!showChords ? 'active' : ''} aria-pressed={!showChords} onClick={() => setShowChords(false)}><FileText size={16} /><span>Somente letra</span></button></div>
        <div className="song-reader-controls"><div className="song-key-control"><button className="icon-button" aria-label="Diminuir um semitom" onClick={() => stepKey(-1)}><Minus size={15} /></button><label><span className="sr-only">Tom da visualização</span><select value={viewKey} onChange={e => changeKey(e.target.value)} aria-label="Tom da visualização">{KEYS.map(key => <option key={key}>{key}</option>)}</select></label><button className="icon-button" aria-label="Aumentar um semitom" onClick={() => stepKey(1)}><Plus size={15} /></button></div><div className="song-font-control"><button className="icon-button" aria-label="Diminuir tamanho da letra" disabled={fontSize <= 14} onClick={() => setFontSize(size => Math.max(14, size - 2))}><span className="song-small-a">A</span></button><button className="icon-button" aria-label="Aumentar tamanho da letra" disabled={fontSize >= 28} onClick={() => setFontSize(size => Math.min(28, size + 2))}><span className="song-large-a">A</span></button></div><button className={`icon-button song-reading-button ${reading ? 'active' : ''}`} aria-label={reading ? 'Sair do modo leitura' : 'Entrar no modo leitura'} title={reading ? 'Sair do modo leitura' : 'Modo leitura'} aria-pressed={reading} onClick={() => setReading(value => !value)}>{reading ? <X size={18} /> : <Maximize2 size={18} />}</button></div>
      </div>
      <div className="song-reader-context"><span>{reading ? song.title : 'Prepare o coração. Acompanhe a canção.'}</span><span>Tom <strong>{viewKey}</strong>{viewKey !== defaultKey && <span className="song-temporary"> · visualização</span>}</span></div>
      <div className={`song-sheet ${showChords ? 'song-sheet-chords' : ''}`} style={{ fontSize: `${fontSize}px` }}>
        {showChords ? content.split('\n').map((line, lineIndex) => <div className="song-line" key={lineIndex}>{line.length ? chordSegments(line).filter(segment => segment.chord || segment.text).map((segment, index) => <span className="song-segment" key={index}><span className="song-chord">{segment.chord || '\u00a0'}</span><span className="song-lyric">{segment.text}</span></span>) : <span className="song-blank-line">&nbsp;</span>}</div>) : <div className="song-lyrics-only">{stripChords(content)}</div>}
      </div>
      {!reading && <div className="song-reader-footer"><span><Check size={14} />Seu ajuste de tom preserva o cadastro original.</span><button className="button button-ghost" disabled={viewKey === defaultKey} onClick={() => changeKey(defaultKey)}>Restaurar tom {defaultKey}</button></div>}
    </section>
    {!reading && <>
      {setlistItem && service && canPlan && <div className="song-save-key card"><div><h3>Tom para este culto</h3><p>Salve {viewKey} no repertório de {serviceLabel}. Os demais cultos continuam com seus próprios tons.</p><FormError error={saveError} />{saved && <p className="song-save-success" role="status"><Check size={15} />Tom salvo no repertório.</p>}</div><button className="button button-primary" disabled={saving || busy || viewKey === setlistItem.key} onClick={saveKey}><Save size={16} />{saving ? 'Salvando…' : 'Salvar tom no culto'}</button></div>}
      <div className="song-detail-grid"><section className="card song-note-card"><h2><StickyNote size={18} />Observações da música</h2><p className={!song.notes ? 'muted' : ''}>{song.notes || 'Nenhuma observação cadastrada para esta música.'}</p></section>{setlistItem && <section className="card song-note-card"><h2><StickyNote size={18} />Observações deste culto</h2><p className={!setlistItem.notes ? 'muted' : ''}>{setlistItem.notes || 'Nenhuma orientação específica no repertório.'}</p></section>}{hasVideo && <section className="card song-video-card"><span className="song-video-icon"><Music2 size={22} /></span><div><h2>Ouça a referência</h2><p>Um momento para conhecer a canção.</p></div><a className="button button-secondary" href={song.youtubeUrl} target="_blank" rel="noopener noreferrer">Abrir YouTube<ExternalLink size={15} /></a></section>}</div>
    </>}
    {editing && <SongEditor song={song} onClose={() => setEditing(false)} />}
  </div>;
}
