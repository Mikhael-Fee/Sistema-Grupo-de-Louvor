import { useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { Check, Download, FileText, LoaderCircle, Monitor, Smartphone } from 'lucide-react';
import Brand from '../components/Brand';
import { cifraBrowserStatus } from '../lib/cifra-browser';
import './cifra-browser.css';

type MobileDevice = 'android' | 'iphone';

function initialDevice(): MobileDevice {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'iphone' : 'android';
}

function MobileImporter() {
  const [device, setDevice] = useState<MobileDevice>(initialDevice);
  return <section id="cifra-guide-mobile" role="tabpanel" aria-labelledby="cifra-tab-mobile" className="cifra-guide-panel">
    <h2>Importar PDF pelo celular</h2>
    <p>Salve a cifra como PDF no navegador e escolha o arquivo no Candeia. O programa extrai a letra e os acordes para você revisar e ajustar o tom.</p>
    <div className="cifra-device-choice" role="group" aria-label="Seu celular">
      <button className={`button ${device === 'android' ? 'button-primary' : 'button-secondary'}`} aria-pressed={device === 'android'} onClick={() => setDevice('android')}>Android</button>
      <button className={`button ${device === 'iphone' ? 'button-primary' : 'button-secondary'}`} aria-pressed={device === 'iphone'} onClick={() => setDevice('iphone')}>iPhone / iPad</button>
    </div>
    <ol>
      <li>Abra a versão desejada da música no site do <strong>Cifra Club</strong> usando {device === 'android' ? 'o Chrome do Android, inclusive no Xiaomi' : 'o Safari'} e espere os acordes aparecerem.</li>
      {device === 'android'
        ? <li>Toque no menu <strong>⋮ → Compartilhar → Imprimir</strong>. Na opção de impressora, escolha <strong>Salvar como PDF</strong>, toque no ícone de PDF e salve o arquivo em Downloads.</li>
        : <li>Toque em <strong>Compartilhar → Imprimir</strong>. Amplie a prévia com dois dedos para abrir o PDF; toque em <strong>Compartilhar → Salvar em Arquivos</strong>.</li>}
      <li>No Candeia, entre com sua conta e abra <strong>Biblioteca → Nova música → Escolher PDF da cifra</strong>. Confira a prévia, título, artista e tom antes de importar e salvar.</li>
    </ol>
    <Link className="button button-primary cifra-pdf-guide-link" to="/musicas"><FileText size={17} />Abrir biblioteca para importar</Link>
    <p>Use um PDF com texto selecionável, de até 8 MB. Fotos e PDFs digitalizados não podem ser lidos por esta opção. A leitura acontece no seu navegador.</p>
    <p>A cifra precisa abrir normalmente no Cifra Club para você salvá-la. Uma conta administradora pode importar e salvar; consultar músicas e trocar o tom continua disponível sem cadastro.</p>
  </section>;
}

export default function CifraBrowserPage() {
  const [panel, setPanel] = useState<'desktop' | 'mobile'>(() => window.matchMedia('(max-width: 767px), (pointer: coarse)').matches ? 'mobile' : 'desktop');
  const [status, setStatus] = useState<'idle' | 'checking' | 'connected' | 'outdated' | 'missing'>('idle');
  async function check() {
    setStatus('checking');
    setStatus(await cifraBrowserStatus());
  }
  function moveTab(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'desktop' : event.key === 'End' ? 'mobile' : panel === 'desktop' ? 'mobile' : 'desktop';
    setPanel(next);
    document.getElementById(`cifra-tab-${next}`)?.focus();
  }
  return <main className="standalone-page"><section className="card cifra-connect-page">
    <Brand />
    <h1>Importar do Cifra Club sem copiar e colar</h1>
    <div className="cifra-guide-tabs" role="tablist" aria-label="Dispositivo para importar">
      <button id="cifra-tab-desktop" type="button" role="tab" aria-selected={panel === 'desktop'} aria-controls="cifra-guide-desktop" tabIndex={panel === 'desktop' ? 0 : -1} className={`button ${panel === 'desktop' ? 'button-primary' : 'button-secondary'}`} onClick={() => setPanel('desktop')} onKeyDown={moveTab}><Monitor size={18} />Computador</button>
      <button id="cifra-tab-mobile" type="button" role="tab" aria-selected={panel === 'mobile'} aria-controls="cifra-guide-mobile" tabIndex={panel === 'mobile' ? 0 : -1} className={`button ${panel === 'mobile' ? 'button-primary' : 'button-secondary'}`} onClick={() => setPanel('mobile')} onKeyDown={moveTab}><Smartphone size={18} />Celular</button>
    </div>
    {panel === 'desktop' ? <section id="cifra-guide-desktop" role="tabpanel" aria-labelledby="cifra-tab-desktop" className="cifra-guide-panel">
      <p>Conecte o importador uma vez no Chrome ou Edge do computador. Depois, pesquise a música no Candeia, escolha a versão e abra a prévia: a cifra será lida automaticamente pelo seu navegador.</p>
      <a className="button button-primary" href="/downloads/candeia-cifraclub.zip" download><Download size={17} />Baixar importador</a>
      <p><strong>Atualização 1.1.1:</strong> se já instalou o importador, baixe este arquivo, extraia substituindo os arquivos da pasta anterior e clique em <strong>Recarregar</strong> na extensão. Depois atualize o Candeia. Esta versão corrige a identificação do artista e mantém o tratamento de capotraste e a limpeza de tablaturas.</p>
      <ol>
        <li>Baixe o arquivo acima e extraia a pasta no computador.</li>
        <li>No Chrome, abra <strong>Menu → Extensões → Gerenciar extensões</strong>. No Edge, use <strong>Extensões → Gerenciar extensões</strong>.</li>
        <li>Ative <strong>Modo do desenvolvedor</strong>, clique em <strong>Carregar sem compactação</strong> e escolha a pasta extraída.</li>
        <li>Volte ao Candeia e atualize a página. A busca mostrará <strong>Importador conectado</strong>.</li>
      </ol>
      <p>A página da cifra precisa abrir normalmente no Cifra Club. O importador acessa somente Candeia e Cifra Club. Ele recebe a cifra, fecha a aba criada para a consulta e entrega uma prévia. Você decide quando importar e salvar a música.</p>
      <button className="button button-secondary" disabled={status === 'checking'} onClick={() => void check()}>{status === 'checking' ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}Verificar conexão</button>
      {status === 'connected' && <p role="status">Importador conectado. Você já pode pesquisar e importar na biblioteca.</p>}
      {status === 'missing' && <p role="status">Importador ainda não encontrado. Confira a instalação e atualize esta página.</p>}
      {status === 'outdated' && <p role="status">Seu importador precisa da atualização 1.1.1. Siga as instruções acima, recarregue a extensão e atualize esta página.</p>}
    </section> : <MobileImporter />}
    <div className="form-actions"><Link className="button button-secondary" to="/musicas">Voltar à biblioteca</Link></div>
  </section></main>;
}
