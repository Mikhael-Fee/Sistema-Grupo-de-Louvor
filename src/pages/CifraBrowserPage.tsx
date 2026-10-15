import { useEffect, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { Check, Download, FileText, LoaderCircle, Monitor, Smartphone } from 'lucide-react';
import Brand from '../components/Brand';
import { cifraBrowserStatus } from '../lib/cifra-browser';
import './cifra-browser.css';

type MobileDevice = 'android' | 'iphone';
type ImporterStatus = 'idle' | 'checking' | 'connected' | 'outdated' | 'missing';
type FirefoxRelease = { status: 'unsigned' | 'signed'; version: string; downloadUrl: string | null; sha256: string | null };

function ConnectionCheck({ mobile = false }: { mobile?: boolean }) {
  const [status, setStatus] = useState<ImporterStatus>('idle');
  async function check() {
    setStatus('checking');
    setStatus(await cifraBrowserStatus());
  }
  return <>
    <button className="button button-secondary" disabled={status === 'checking'} onClick={() => void check()}>{status === 'checking' ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}Verificar conexão</button>
    {status === 'connected' && <p role="status">Importador conectado. Você já pode pesquisar e importar na biblioteca.</p>}
    {status === 'missing' && <p role="status">Importador ainda não encontrado. {mobile ? 'Abra esta página no Firefox com a extensão instalada e permitida; depois atualize a página.' : 'Confira a instalação e atualize esta página.'}</p>}
    {status === 'outdated' && <p role="status">Seu importador precisa da atualização 1.1.1. Siga as instruções acima, recarregue a extensão e atualize esta página.</p>}
  </>;
}

function FirefoxMobileImporter() {
  const [release, setRelease] = useState<FirefoxRelease | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 6_000);
    void fetch('/downloads/candeia-cifraclub-firefox.json', { cache: 'no-store', credentials: 'omit', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Pacote indisponível');
        const value = await response.json() as Partial<FirefoxRelease>;
        if (!['signed', 'unsigned'].includes(value.status || '') || typeof value.version !== 'string'
          || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value.version)) throw new Error('Pacote inválido');
        if (active) setRelease(value as FirefoxRelease);
      })
      .catch(() => { if (active) setRelease(null); })
      .finally(() => { window.clearTimeout(timeout); if (active) setLoading(false); });
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, []);
  const signed = release?.status === 'signed'
    && release.downloadUrl === '/downloads/candeia-cifraclub-firefox.xpi'
    && typeof release.sha256 === 'string' && /^[a-f\d]{64}$/i.test(release.sha256);
  return <section className="cifra-firefox-guide" aria-labelledby="cifra-firefox-title">
    <span className="cifra-guide-experiment">Teste para administradores</span>
    <h2 id="cifra-firefox-title">Importar pelo Firefox no Android</h2>
    <p>Uma alternativa para testar a importação sem PDF: a extensão lê a cifra aberta no próprio Firefox e entrega uma prévia ao Candeia. A importação em aparelhos Android ainda precisa ser confirmada.</p>
    {loading ? <p role="status"><LoaderCircle size={16} className="spin" /> Conferindo o pacote do Firefox…</p>
      : signed ? <a className="button button-primary" href={release.downloadUrl!} download><Download size={17} />Baixar extensão assinada para Firefox</a>
        : release?.status === 'unsigned' ? <p className="cifra-firefox-pending" role="status"><strong>Instalação aguardando assinatura da Mozilla.</strong> O pacote de desenvolvimento está preparado, mas ainda não está liberado para instalação no Firefox Android. Por enquanto, use a opção PDF abaixo.</p>
          : <p className="cifra-firefox-pending" role="status">Não foi possível confirmar o pacote assinado. Tente novamente mais tarde ou use a opção PDF abaixo.</p>}
    <ol>
      <li>Instale o <a href="https://play.google.com/store/apps/details?id=org.mozilla.firefox" target="_blank" rel="noreferrer">Firefox para Android</a> e abra a cifra no Cifra Club. Os acordes precisam aparecer normalmente.</li>
      <li>Quando o pacote assinado estiver disponível acima, baixe o arquivo no Firefox. Abra <strong>Configurações → Sobre o Firefox</strong>, toque cinco vezes no logotipo e volte às Configurações. Escolha <strong>Instalar extensão de arquivo</strong>, selecione o arquivo e confirme as permissões.</li>
      <li>Abra <strong>Candeia e Cifra Club no Firefox</strong>, entre na sua conta administradora do Candeia e toque em <strong>Verificar conexão</strong> abaixo. O Candeia aberto no Chrome ou no aplicativo instalado por ele não recebe a extensão do Firefox.</li>
      <li>Na <strong>Biblioteca → Nova música</strong>, pesquise e escolha <strong>Ver prévia</strong>. Primeiro confira título, artista, acordes e tom sem salvar; importe e salve somente depois de conferir. Se não funcionar, use o PDF.</li>
    </ol>
    <ConnectionCheck mobile />
    <p className="cifra-firefox-footnote">Após salvar, todos os membros podem consultar a música no navegador habitual. Não é necessário instalar a extensão nos celulares de quem apenas consulta as cifras.</p>
    <a href="https://extensionworkshop.com/documentation/publish/install-self-distributed/#install-addon-from-file-android" target="_blank" rel="noreferrer">Instruções oficiais da Mozilla</a>
  </section>;
}

function initialDevice(): MobileDevice {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'iphone' : 'android';
}

function MobileImporter() {
  const [device, setDevice] = useState<MobileDevice>(initialDevice);
  return <section id="cifra-guide-mobile" role="tabpanel" aria-labelledby="cifra-tab-mobile" className="cifra-guide-panel">
    <div className="cifra-device-choice" role="group" aria-label="Seu celular">
      <button className={`button ${device === 'android' ? 'button-primary' : 'button-secondary'}`} aria-pressed={device === 'android'} onClick={() => setDevice('android')}>Android</button>
      <button className={`button ${device === 'iphone' ? 'button-primary' : 'button-secondary'}`} aria-pressed={device === 'iphone'} onClick={() => setDevice('iphone')}>iPhone / iPad</button>
    </div>
    {device === 'android' && <FirefoxMobileImporter />}
    <section className="cifra-pdf-guide" aria-labelledby="cifra-pdf-title">
    <h2 id="cifra-pdf-title">Importar PDF pelo celular</h2>
    <p>Salve a cifra como PDF no navegador e escolha o arquivo no Candeia. O programa extrai a letra e os acordes para você revisar e ajustar o tom.</p>
    {device === 'iphone' && <p>A extensão de Firefox deste teste é para Android. No iPhone e iPad, use o PDF.</p>}
    <ol>
      <li>Abra a versão desejada da música no site do <strong>Cifra Club</strong> usando {device === 'android' ? 'o Chrome do Android, inclusive no Xiaomi' : 'o Safari'} e espere os acordes aparecerem.</li>
      {device === 'android'
        ? <li>Toque no menu <strong>⋮ → Compartilhar → Imprimir</strong>. Na opção de impressora, escolha <strong>Salvar como PDF</strong>, toque no ícone de PDF e salve o arquivo em Downloads.</li>
        : <li>Toque em <strong>Compartilhar → Imprimir</strong>. Amplie a prévia com dois dedos para abrir o PDF; toque em <strong>Compartilhar → Salvar em Arquivos</strong>.</li>}
      <li>No Candeia, entre com sua conta e abra <strong>Biblioteca → Nova música → Escolher PDF da cifra</strong>. Confira a prévia, título, artista e tom antes de importar e salvar.</li>
    </ol>
    <Link className="button button-primary cifra-pdf-guide-link" to="/musicas"><FileText size={17} />Abrir biblioteca para importar</Link>
    <p>Use um PDF com texto selecionável, de até 8 MB. Fotos e PDFs digitalizados não podem ser lidos por esta opção. A leitura acontece no seu navegador.</p>
    <p>A cifra precisa abrir normalmente no Cifra Club para você salvá-la. Uma conta administradora pode importar e salvar; as contas aprovadas podem consultar músicas e trocar o tom.</p>
    </section>
  </section>;
}

export default function CifraBrowserPage() {
  const [panel, setPanel] = useState<'desktop' | 'mobile'>(() => window.matchMedia('(max-width: 767px), (pointer: coarse)').matches ? 'mobile' : 'desktop');
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
      <ConnectionCheck />
    </section> : <MobileImporter />}
    <div className="form-actions"><Link className="button button-secondary" to="/musicas">Voltar à biblioteca</Link></div>
  </section></main>;
}
