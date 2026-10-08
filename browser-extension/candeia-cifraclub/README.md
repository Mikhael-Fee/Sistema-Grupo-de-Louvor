# Importação do Cifra Club pelo navegador

Esta extensão é uma alternativa à importação feita pelo servidor. Depois da instalação inicial, o Candeia abre uma aba da versão escolhida no Cifra Club, lê a cifra que aparecer normalmente no navegador e recebe o texto automaticamente. Não é preciso copiar nem colar. A aba de consulta criada pela extensão fecha ao terminar, ao cancelar ou após no máximo 25 segundos; o foco retorna à aba solicitante do Candeia.

A extensão só importa uma página que o próprio navegador consiga exibir. Se o Cifra Club apresentar HTTP 403, “Access Denied”, uma verificação ou nenhuma cifra reconhecida, a leitura falha com um aviso. Ela não resolve CAPTCHA, modifica requisições, troca endereços de rede nem contorna bloqueios. A busca continua no Candeia; a extensão apenas lê a versão escolhida.

## Instalação inicial no computador

Funciona em Chrome e Edge desktop. Chrome no Android e no iPhone não executa esta extensão. Instalar o Candeia como PWA não instala a extensão automaticamente.

Para testar a versão local:

1. Baixe a pasta `browser-extension/candeia-cifraclub` completa para o computador; se vier em ZIP, extraia primeiro.
2. Abra `chrome://extensions` no Chrome ou `edge://extensions` no Edge.
3. Ative o modo do desenvolvedor, clique em **Carregar sem compactação** e selecione a pasta que contém `manifest.json`.
4. Confira os sites permitidos: somente `louvor-grupo-fxebsy.netlify.app`, `www.cifraclub.com.br` e `cifraclub.com.br`. Atualize a aba do Candeia após instalar.
5. Entre com seu perfil administrador, pesquise a música e use a ação de importação pelo navegador da versão escolhida, quando essa ação estiver disponível no Candeia.

Para atualizar uma instalação anterior, baixe o ZIP atualizado, substitua os arquivos da mesma pasta e clique em **Recarregar** na extensão. Depois, recarregue a aba do Candeia. A versão **1.1.0** reconhece o tom das posições dos acordes quando há capotraste e ignora blocos de tablatura identificados na página.

É possível desativar ou remover a extensão na mesma tela. Uma futura instalação de um clique pela Chrome Web Store exige publicação e revisão próprias; carregar esta pasta não a publica na loja.

## Conteúdo e permissões

- A cifra é lida somente da aba que a extensão criou para uma solicitação ativa do Candeia. Uma aba comum do Cifra Club não é extraída nem fechada.
- São enviados título, artista, link canônico e texto da cifra. `displayedKey`, quando reconhecido, identifica o tom **dos acordes escritos**. Por exemplo, `Tom: Bb (forma dos acordes no tom de G)` envia `displayedKey: 'G'` e `soundingKey: 'Bb'`; o aplicativo transpõe de G para o tom escolhido na igreja, sem acrescentar novamente os semitons do capotraste. `data-original-key` não é usado para atribuir outro tom.
- `capo` informa a casa reconhecida (0 a 12). Se houver capotraste sem indicação do tom das posições, o leitor deixa `displayedKey` ausente e envia `keyUnknownReason`; o aplicativo pede confirmação do tom dos acordes antes de importar, em vez de usar o tom que soa ou o primeiro acorde.
- O leitor busca um `pre` visível com acordes explicitamente marcados por `b` ou `strong`, preservando espaços, linhas e quebras `br`, e ignora containers identificados como tablaturas ou diagramas. O aplicativo também remove tablaturas em texto, afinação e instruções de capotraste da visualização, preservando letra, acordes e seções como `[Intro]` e `[Refrão]`. Essa limpeza não declara que a fonte ofereceu uma versão oficial para teclado. Alterações no layout da fonte podem exigir adaptação do leitor.
- Há um limite de 100.000 caracteres por cifra, 200 por título/artista, uma consulta por aba do Candeia e quatro consultas simultâneas na extensão. Não há truncamento silencioso da cifra.
- O manifest declara scripts somente nos três sites acima. Não pede `tabs`, `<all_urls>`, clipboard, cookies, debugger ou webRequest e não realiza chamadas de API, proxy ou `fetch` adicional.
- Nenhuma senha, sessão do Supabase ou token é lido. Os dados transferidos não são gravados em serviços pela extensão. O Candeia recebe uma prévia/rascunho; revisar, substituir conteúdo existente e salvar seguem o fluxo do aplicativo.
- A leitura exige que o usuário inicie a ação no Candeia. O worker autoriza somente o frame principal do domínio HTTPS exato, associa IDs de abas e versão escolhida à solicitação, valida o conteúdo recebido e mantém a transferência apenas em memória durante a consulta.

## Contrato de integração

A página envia uma mensagem para a própria origem, sem `"*"`:

```js
window.postMessage({
  channel: 'candeia-cifraclub', version: 1,
  type: 'read', requestId: crypto.randomUUID(),
  sourceUrl: 'https://www.cifraclub.com.br/artista/musica/'
}, window.location.origin);
```

`ping` usa o mesmo envelope e responde `type: 'ready', importerVersion: '1.1.0', capabilities: ['written-key-capo']`. A capability só é anunciada quando o worker confirmar esse suporte. Uma resposta antiga sem essa capability indica que os arquivos da extensão e a aba precisam ser atualizados antes de importar. `read` responde `type: 'response'`, com a mesma metadata de versão e `result: { sourceUrl, title, artist, text, displayedKey?, soundingKey?, capo?, keyUnknownReason? }` ou `error`. `cancel` usa o `requestId` da leitura ativa. O código da página deve aceitar somente mensagens com `event.source === window`, origem própria, canal/versão/schema corretos e ID da solicitação ativa; fechar o editor deve cancelar a leitura e ignorar respostas antigas.

O content script da página usa mensagens internas `runtime.sendMessage` para falar com o worker. Apenas abas criadas e registradas no worker recebem uma autorização de leitura. A resposta jamais contém HTML executável; o aplicativo deve tratar os campos como texto e reaproveitar a conversão de acordes existente.

## Validação

Os testes locais podem simular o DOM público da fonte e as mensagens do navegador. Isso valida extração, cancelamento, limites e fechamento de abas, mas não demonstra que o Cifra Club permita a leitura em qualquer computador. É preciso distinguir esse teste da leitura de uma página real que abra normalmente no navegador do usuário.
