import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Download } from 'lucide-react';
import { FormError, PageHeader } from '../components/ui';
import { useMinistry } from '../context/MinistryContext';
import { clearPendingMobileCifra, mobileCifraError, pendingMobileCifra } from '../lib/cifra-mobile';
import { SongEditor } from './SongsPage';
import './songs.css';

export default function CifraMobileImportPage() {
  const [pending] = useState(pendingMobileCifra);
  const [editing, setEditing] = useState(false);
  const { canEditLibrary } = useMinistry();
  const navigate = useNavigate();
  function discard() { clearPendingMobileCifra(); navigate('/musicas'); }
  return <>
    <PageHeader title="Cifra recebida do navegador" description="Revise a versão e escolha o tom da igreja antes de salvar." />
    <section className="card">
      <FormError error={mobileCifraError()} />
      {pending ? <>
        <h2>{pending.song.title}</h2><p>{pending.song.artist || 'Artista não informado pela página.'}</p>
        <a href={pending.song.sourceUrl} target="_blank" rel="noopener noreferrer">Conferir versão no Cifra Club</a>
        <pre className="songs-mobile-received" tabIndex={0} aria-label="Prévia da cifra recebida">{pending.song.content?.slice(0, 12_000)}</pre>
        {canEditLibrary ? <button className="button button-primary" onClick={() => setEditing(true)}><Download size={16} />Revisar e salvar na biblioteca</button>
          : <p>Uma conta administradora pode salvar esta cifra na biblioteca. A transferência não altera os dados do ministério.</p>}
        <div className="form-actions"><button className="button button-secondary" onClick={discard}>Descartar importação</button></div>
      </> : <><p>Nenhuma cifra está pendente. Abra a música no navegador e execute o importador do celular.</p><Link className="button button-primary" to="/conectar-cifra-club">Configurar importação no celular</Link></>}
    </section>
    {pending && editing && <SongEditor incomingSource={pending.song} incomingDraftId={pending.id} onClose={() => setEditing(false)} onSaved={discard} />}
  </>;
}
