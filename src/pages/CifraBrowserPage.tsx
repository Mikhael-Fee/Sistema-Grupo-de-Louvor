import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Download, LoaderCircle } from 'lucide-react';
import Brand from '../components/Brand';
import { cifraBrowserStatus } from '../lib/cifra-browser';
import './cifra-browser.css';

export default function CifraBrowserPage() {
  const [status, setStatus] = useState<'idle' | 'checking' | 'connected' | 'outdated' | 'missing'>('idle');
  async function check() {
    setStatus('checking');
    setStatus(await cifraBrowserStatus());
  }
  return <main className="standalone-page"><section className="card cifra-connect-page">
    <Brand />
    <h1>Importar do Cifra Club sem copiar e colar</h1>
    <p>Conecte o importador uma vez no Chrome ou Edge do computador. Depois, pesquise a música no Candeia, escolha a versão e abra a prévia: a cifra será lida automaticamente pelo seu navegador.</p>
    <p>A página da cifra precisa abrir normalmente no Cifra Club. A extensão não resolve bloqueios nessa página. Chrome de celular não oferece essa instalação.</p>
    <a className="button button-primary" href="/downloads/candeia-cifraclub.zip" download><Download size={17} />Baixar importador</a>
    <p><strong>Atualização 1.1:</strong> se já instalou o importador, baixe este arquivo, extraia substituindo os arquivos da pasta anterior e clique em <strong>Recarregar</strong> na extensão. Depois atualize o Candeia. Esta versão reconhece capotraste e limpa tablaturas.</p>
    <ol>
      <li>Baixe o arquivo acima e extraia a pasta no computador.</li>
      <li>No Chrome, abra <strong>Menu → Extensões → Gerenciar extensões</strong>. No Edge, use <strong>Extensões → Gerenciar extensões</strong>.</li>
      <li>Ative <strong>Modo do desenvolvedor</strong>, clique em <strong>Carregar sem compactação</strong> e escolha a pasta extraída.</li>
      <li>Volte ao Candeia e atualize a página. A busca mostrará <strong>Importador conectado</strong>.</li>
    </ol>
    <p>O importador acessa somente Candeia e Cifra Club. Ele recebe a cifra, fecha a aba criada para a consulta e entrega uma prévia. Você decide quando importar e salvar a música.</p>
    <p>No celular, as músicas salvas ficam disponíveis com troca de tom, ajuste do tamanho da letra e modo leitura em tela inteira. A importação pela extensão continua sendo feita no computador.</p>
    <button className="button button-secondary" disabled={status === 'checking'} onClick={() => void check()}>{status === 'checking' ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}Verificar conexão</button>
    {status === 'connected' && <p role="status">Importador conectado. Você já pode pesquisar e importar na biblioteca.</p>}
    {status === 'missing' && <p role="status">Importador ainda não encontrado. Confira a instalação e atualize esta página.</p>}
    {status === 'outdated' && <p role="status">Seu importador precisa da atualização 1.1. Siga as instruções acima, recarregue a extensão e atualize esta página.</p>}
    <div className="form-actions"><Link className="button button-secondary" to="/musicas">Voltar à biblioteca</Link></div>
  </section></main>;
}
