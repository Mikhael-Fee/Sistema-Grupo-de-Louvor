import { useEffect, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, Download, ExternalLink, LoaderCircle, Monitor, Smartphone } from 'lucide-react';
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
  const [script, setScript] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [manualCopy, setManualCopy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setScript('');
    setLoading(true);
    setLoadError(false);
    setManualCopy(false);
    setCopied(false);
    const path = device === 'android' ? '/downloads/candeia-cifra-celular.txt' : '/downloads/candeia-cifra-iphone.js';
    void fetch(path, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error('Importador indisponível.');
      const value = await response.text();
      if (!value || value.length > 100_000
        || (device === 'android' ? !value.startsWith('javascript:') : !value.includes('completion('))) {
        throw new Error('Importador inválido.');
      }
      if (!controller.signal.aborted) setScript(value);
    }).catch(() => {
      if (!controller.signal.aborted) setLoadError(true);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [device, retry]);

  async function copyScript() {
    if (!script) return;
    try {
      // The artifact is already loaded so Safari retains this click's
      // activation when clipboard.writeText is invoked.
      await navigator.clipboard.writeText(script);
      setCopied(true);
      setManualCopy(false);
    } catch {
      setCopied(false);
      setManualCopy(true);
    }
  }

  return <section id="cifra-guide-mobile" role="tabpanel" aria-labelledby="cifra-tab-mobile" className="cifra-guide-panel">
    <h2>Importar pelo celular</h2>
    <p>Configure uma vez. Depois, abra a cifra no navegador, acione o importador e receba a prévia no Candeia, sem copiar o texto da música.</p>
    <div className="cifra-device-choice" role="group" aria-label="Seu celular">
      <button className={`button ${device === 'android' ? 'button-primary' : 'button-secondary'}`} aria-pressed={device === 'android'} onClick={() => setDevice('android')}>Android</button>
      <button className={`button ${device === 'iphone' ? 'button-primary' : 'button-secondary'}`} aria-pressed={device === 'iphone'} onClick={() => setDevice('iphone')}>iPhone / iPad</button>
    </div>

    <button className="button button-primary cifra-copy-button" disabled={loading || !script} onClick={() => void copyScript()}>
      {loading ? <LoaderCircle size={17} className="spin" /> : copied ? <Check size={17} /> : <Copy size={17} />}
      {device === 'android' ? 'Copiar favorito de importação' : 'Copiar script para iPhone'}
    </button>
    {copied && <p role="status">Copiado. Cole {device === 'android' ? 'no endereço do favorito' : 'na ação de JavaScript do Atalho'} seguindo os passos abaixo.</p>}
    {loadError && <p role="alert">Não foi possível carregar o importador. <button className="button button-secondary" onClick={() => setRetry((value) => value + 1)}>Tentar novamente</button></p>}
    {manualCopy && <div className="cifra-copy-fallback">
      <label htmlFor="cifra-install-code">{device === 'android' ? 'Endereço do favorito' : 'Script do Atalho'}</label>
      <p>Seu navegador não permitiu a cópia pelo botão. Toque no campo para selecionar o código e use Copiar. Isso é necessário apenas na configuração.</p>
      <textarea id="cifra-install-code" value={script} readOnly rows={4} spellCheck={false} onFocus={(event) => event.currentTarget.select()} onClick={(event) => event.currentTarget.select()} />
    </div>}

    {device === 'android' ? <>
      <h3>Configurar no Chrome do Android</h3>
      <ol>
        <li>Copie o favorito pelo botão acima. No menu do Chrome, toque na estrela para salvar esta página nos favoritos.</li>
        <li>Edite esse favorito. Use o nome <strong>Importar para Candeia</strong> e substitua todo o endereço pelo conteúdo copiado, que começa com <strong>javascript:</strong>. Salve.</li>
        <li>Abra a versão desejada da música no site do Cifra Club e aguarde os acordes aparecerem.</li>
        <li>Toque na barra de endereço, digite <strong>Importar para Candeia</strong> e selecione o favorito sugerido. Use a sugestão do favorito; o menu de favoritos pode não executar o importador.</li>
        <li>O Candeia abrirá com a prévia. Confira título, artista e tom, importe e salve.</li>
      </ol>
      <p>O navegador precisa aceitar favoritos com JavaScript. Se ele remover o endereço ou não executar o favorito, use um navegador compatível ou o importador do computador.</p>
    </> : <>
      <h3>Configurar no app Atalhos do iPhone</h3>
      <ol>
        <li>Copie o script pelo botão acima. Abra o app <strong>Atalhos</strong>, crie um atalho e dê o nome <strong>Importar para Candeia</strong>.</li>
        <li>Nos detalhes do atalho, ative <strong>Mostrar na Folha de Compartilhamento</strong> e deixe-o receber <strong>Páginas Web do Safari</strong>.</li>
        <li>Adicione a ação <strong>Executar JavaScript na Página Web</strong>. Use <strong>Entrada de Atalho</strong> como página e substitua o código da ação pelo script copiado.</li>
        <li>Em seguida, adicione a ação <strong>Abrir URLs</strong>, usando o resultado da ação de JavaScript. Salve o atalho.</li>
        <li>Abra a cifra no <strong>Safari</strong>, espere os acordes carregarem, toque em Compartilhar e escolha <strong>Importar para Candeia</strong>. Autorize a execução quando o iPhone solicitar.</li>
        <li>O Candeia abrirá com a prévia. Confira título, artista e tom, importe e salve.</li>
      </ol>
      <a className="cifra-help-link" href="https://support.apple.com/guide/shortcuts/run-javascript-on-a-webpage-apd218e2187d/ios" target="_blank" rel="noreferrer">Instruções da Apple para JavaScript em páginas web <ExternalLink size={15} /></a>
    </>}
    <p>A cifra precisa estar aberta e visível no site do Cifra Club. Faça a importação pelo navegador; o aplicativo do Cifra Club e o Candeia instalado como aplicativo não executam esse leitor.</p>
    <p>A música chega como uma prévia. Entre com uma conta autorizada para importar e salvar; consultar músicas e trocar o tom continua disponível sem cadastro.</p>
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
