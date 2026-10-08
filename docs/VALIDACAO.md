# Validação da atualização Candeia — 08/10/2026

## Versão atual — artista, temáticas livres e importação móvel

Publicado em [louvor-grupo-fxebsy.netlify.app](https://louvor-grupo-fxebsy.netlify.app) com deploy `6ac78b9df6e6f2d4a9b22aac`, confirmado `ready` pelo helper `--check`. Esta versão corrige o artista identificado como **Menu principal** e inclui a extensão **1.1.1**, temáticas livres de cultos e importadores de celular.

A extração de artista usa metadados da música e links canônicos, evitando títulos de navegação. O frontend também rejeita o rótulo recebido de uma extensão antiga e usa o artista da versão escolhida quando disponível. A mesma correção foi aplicada ao parser da função Netlify.

**Tipo de culto** agora aceita uma temática obrigatória de até 100 caracteres, com sugestões e filtros incluindo tipos já usados. A migração `003_custom_service_types.sql` foi aplicada no Supabase existente: a restrição de lista fixa foi substituída, as oito tabelas continuam com RLS e nenhum registro ou conta existente foi alterado. O helper `scripts/configure-service-types.mjs` verificou a aceitação de uma temática livre por inserção em transação desfeita; repetir `--apply` é idempotente.

O guia `/conectar-cifra-club` oferece **Computador** e **Celular**. O build gera `/downloads/candeia-cifra-celular.txt` para um favorito JavaScript no Android e `/downloads/candeia-cifra-iphone.js` para o app Atalhos no iPhone/iPad. Ambos leem a cifra já visível no navegador, preservam acordes/tom/capotraste e abrem `/importar-cifra` com uma prévia. O fragmento próprio é capturado, validado e retirado da URL antes da inicialização de Auth; a sessão da aba guarda a pendência para login/recarregamento. A revisão usa rascunho separado e exige administrador aprovado e salvamento explícito. O transporte limita o fragmento codificado a 100.000 caracteres, rejeitando excesso sem truncamento.

| Verificação desta atualização | Resultado registrado |
| --- | --- |
| Vitest | 141 testes passaram |
| PostgreSQL/PGlite | 166 verificações passaram, com Auth simulado |
| Build TypeScript/Vite/PWA e importadores | Passou |
| Playwright completo | 57 cenários passaram em 2 minutos |
| Atalho iPhone após ajuste final | 2/2 cenários passaram: sucesso existente e novo erro sem diálogo bloqueante; 58 cenários distintos no total, não uma rodada completa de 58 |
| Supabase real, migração 003 | Tipos livres habilitados; RLS das oito tabelas preservada; nenhum registro existente alterado |
| Idempotência do helper | Segunda execução confirmou `schema_changed: false`; verificação temporária desfeita |
| Artefato | 44 arquivos, sem credenciais privadas, `.env` ou source maps; ZIP de 12.365 bytes com seis arquivos idênticos ao código e manifest 1.1.1; favorito de 10.374 caracteres e script Atalhos de 6.892 caracteres |
| Site publicado | 32 verificações reais passaram em Chromium de 390 px: consulta sem cadastro, PWA/cache estático, shell offline, guias Android/iPhone e três downloads correspondentes ao build |
| Função Netlify publicada | 4 verificações passaram: busca Cifra Club200 com três versões, prévia502 com aviso do bloqueio da fonte, URL externa400 e POST405; a leitura pelo servidor continua bloqueada |
| Netlify | Aplicação e função publicadas juntas no mesmo site; deploy confirmado `ready` |
| Configuração reutilizável Codex | `start_skill` salvo; `install_script` preservado; rascunho com `requires_publish: true`, separado do site Netlify já publicado |

A falha do script para iPhone agora lança um erro em vez de abrir um diálogo que poderia bloquear a execução do Atalhos. Os dois cenários desse ajuste foram executados depois da suíte completa. A configuração do ambiente Codex ainda exige publicação pelo produto; não foi validada uma nova restauração do ambiente. Nenhum cadastro ou senha do proprietário foi alterado.

Limites: a configuração inicial é feita uma vez pelo usuário. O favorito exige um navegador que aceite JavaScript; no Android deve ser acionado pela sugestão da barra de endereço. O atalho exige uma página do Safari e permissão do app Atalhos. Aplicativo do Cifra Club e PWA do Candeia não executam esses leitores. A pesquisa e as verificações do mecanismo usam páginas de teste em Chromium; **não comprovam os menus nativos Android nem o Atalhos/Safari em aparelhos físicos**. A página do Cifra Club precisa abrir normalmente no navegador e o bloqueio HTTP 403 da leitura pelo servidor permanece independente.

## Versão anterior — tons, campo único, celular e repertório em lote

Publicado em https://louvor-grupo-fxebsy.netlify.app com deploy `6ac77b98ac9d5921e56c162c`, confirmado `ready`. O editor tem um único campo editável Letra e cifra, sem painel de colagem separado nem seletor comum de Tom original. A importação converte realmente os acordes escritos para o tom da igreja; a base interna do conteúdo salvo passa a ser esse mesmo tom. Alterar o tom da igreja no editor também transpõe o texto.

A extensão 1.1.0 separa posições escritas, tom sonoro e capotraste. Posições G/capo3/somBb produzem tecladoBb uma vez, e a leitura Bb→C continua correta. Se o tom escrito for desconhecido ou houver dados conflitantes, exige confirmação; não infere pelo primeiro acorde. Importadores antigos são identificados e precisam atualizar pelo guia. Tablaturas, diagramas, afinação e instruções de capotraste são removidos no import/salvar e na leitura legada, preservando versos, seções e acordes. Cadastros antigos com base incorreta só são reparados por reimportação ou indicação explícita do tom real, sem regravação por palpite.

A opção dos dados da fonte preenche título/artista imediatamente. Com conteúdo vazio, Salvar música pode importar e salvar a prévia, sem redigitar os campos; rascunho não vazio mantém confirmação de substituição. Texto colado com cabeçalho conhecido é convertido no próprio campo; colagem parcial converte somente o fragmento, preservando o trecho anterior. Pendências de tom ficam no rascunho entre navegações.

Selecionar músicas é a única inclusão do repertório, em lote, inclusive no formulário do culto: mantém marcações entre buscas, impede duplicatas, segue a ordem dos cliques e usa o tom da igreja. Ordem, tom e notas continuam ajustáveis no culto. No celular, leitor tem controles de 44 px, fonte de 14–28 px e modo leitura em tela inteira com foco contido; campos do editor usam 16 px até 700 px.

| Verificação atual | Resultado |
| --- | --- |
| TypeScript e build Vite/PWA/ZIP | Passaram |
| Vitest | 120/120 passaram |
| Playwright completo final | 46/46 passaram em 1,6 min: 31 fluxos do app, 5 móveis, 3 de repertório em lote e 7 com extensão real |
| Banco PostgreSQL/PGlite | 153 verificações passaram: 98 existentes + 55 de consulta pública, Auth simulado |
| Navegador da extensão | Chrome for Testing153, páginas HTTPS/Auth/REST de fixtures; zero requisições fora da rede simulada |
| Artefato | 41 arquivos dist, sem credenciais privadas/.env/source maps; ZIP10868bytes, seis arquivos exatamente iguais ao código e manifest1.1.0 |
| Site publicado | 27 verificações reais em Chromium390px passaram: consulta pública sem gravação, transposição, modo leitura/foco, guia, download igual ao build, PWA/cache estático e shell offline |
| Função Netlify real | 4 verificações passaram: busca200 com3 versões, prévia502 informando403 da fonte, URLexterna400 e POST405 |
| Git e configuração reutilizável | Mudanças registradas no repositório; start_skill salvo com novos fluxos e requisitos da extensão, install_script existente preservado |

A verificação pública inicial encontrou uma corrida no próprio teste do guia, que consultava a visibilidade antes da montagem da rota; o helper agora aguarda seu carregamento e a rodada final passou. A consulta Node usa o proxy de ambiente suportado (`NODE_USE_ENV_PROXY=1`) com TLS ativo; acesso direto sem proxy não estava disponível.

Limites: os cenários de cifra e autenticação do Playwright são simulados, embora usem a extensão real. Não comprovam acesso do servidor à cifra: a fonte continua retornando403 nesse caminho. A importação depende de a página abrir normalmente no computador do usuário. Chrome de celular não instala a extensão; músicas salvas podem ser lidas/transpostas pelo celular, e o campo único permite edição/colagem. Layout móvel foi validado no Chromium com dimensões320/350/390px, não em aparelhos físicos Safari/Android. Nenhum cadastro/senha do proprietário foi alterado; testes reais administrativos do Supabase não foram repetidos nesta entrega. As medições anteriores de RAM abaixo permanecem históricas e não foram repetidas. O rascunho Codex exige publicação da configuração pelo produto (`requires_publish:true`), distinta do deploy Netlify já confirmado; não foi validada uma nova restauração do ambiente.


## Versão anterior — importador pelo navegador (07/10)

Foi implementada uma alternativa automática para Chrome/Edge no computador: depois da instalação inicial, **Ver prévia** abre a versão escolhida em uma aba criada pela extensão, lê somente a cifra que o navegador consegue exibir e retorna a prévia ao Candeia, sem copiar e colar. A aba temporária é fechada no sucesso, erro ou cancelamento. O tom recebido é o tom exibido; o tom na igreja permanece. Importar modifica o rascunho e salvar continua explícito.

| Verificação atual | Resultado |
| --- | --- |
| TypeScript e build Vite/PWA/ZIP | Passaram |
| Vitest | 92 testes passaram, incluindo 13 do canal/validação e 12 da extensão/leitor |
| Playwright completo | 28/28 passaram: 22 fluxos existentes e 6 com extensão real, em 1 minuto |
| Rede dos testes da extensão | Zero requisições fora das fixtures; Auth/REST e páginas HTTPS simulados |
| Empacotamento | 41 arquivos dist; ZIP com seis arquivos correspondentes exatamente ao código inspecionado, sem tokens, .env ou source maps |
| Publicação Netlify | Deploy `6ac6a36e037b31ffc58a0415`, confirmado `ready` |
| Site público/PWA atualizado | 17 verificações passaram, incluindo celular, leitura sem edição, transposição e shell offline |
| Guia e download publicados | Guia público e layout de 390 px verificados; ausência da extensão informada; ZIP baixado com PWA controlando a página corresponde exatamente ao build (9.317 bytes) |

O pacote e as instruções estão em [Conectar importador Cifra Club](https://louvor-grupo-fxebsy.netlify.app/conectar-cifra-club). O build gera `/downloads/candeia-cifraclub.zip`; o arquivo gerado é ignorado pelo Git. A PWA exclui downloads do fallback de navegação e não guarda o ZIP no precache.

A suíte usa a extensão real no Chrome for Testing 153, instalado pelo comando oficial `PLAYWRIGHT_BROWSERS_PATH=/workspace/scratch/playwright-cifra-browsers npx playwright install chromium --no-shell`. O Chromium gerenciado tem política que recusa extensões; nenhuma política foi alterada. A suíte descobre o navegador isolado pela revisão atual do Playwright e usa perfis temporários, sem cookies ou contas reais e sem desabilitar TLS.

Os testes comprovaram o canal completo, extração alinhada com acordes e baixo, F7M/Am7M, tom visível versus metadado original, letra derivada, confirmação de substituição, referência, persistência, cancelamento, resposta tardia, recusa de consulta duplicada e de destinos externos, rejeição de texto acima de 100.000 caracteres, erro explícito de Access Denied e preservação de uma aba Cifra Club comum já aberta. Essas são páginas de teste: **não comprovam importação de uma cifra real no computador do usuário**.

A cifra precisa abrir normalmente no navegador do usuário. Se esse navegador receber bloqueio ou não exibir os acordes, a extensão informa a falha; não modifica requisições, resolve CAPTCHA nem utiliza outro serviço para contornar a proteção. A consulta feita pelo Netlify continua recebendo HTTP 403. A API pública de terceiros [cifraclub-api](https://github.com/adrianohcampos/cifraclub-api) também retornou erro de upstream 403; não encontramos um widget/API oficial documentado que resolvesse essa leitura. Um iframe não permite ao Candeia copiar automaticamente o DOM externo pela política de mesma origem.

Chrome de celular não instala essa extensão. Depois de importar e salvar no computador, a equipe pode consultar e transpor a cifra no Candeia pelo celular. A publicação na Chrome Web Store não foi feita; a instalação inicial é por pasta extraída, seguindo o guia. `install_script` e `start_skill` do ambiente Codex foram atualizados com o empacotamento, navegador de teste e limitações, e salvos com `requires_publish: true`, separadamente da publicação Netlify.

Abaixo permanece o registro da validação anterior de banco, acesso e desempenho; o schema não mudou nesta entrega e os testes reais Supabase dessa validação não foram repetidos.

## Validação anterior — busca e equipe

| Verificação | Resultado |
| --- | --- |
| TypeScript e build Vite/PWA | Passaram, inclusive após o último ajuste da equipe |
| Vitest: domínio, fontes, conversão e texto malformado | 67 testes passaram |
| PostgreSQL/PGlite: RLS, transações, integridade e consulta pública | 153 verificações passaram: 98 existentes + 55 da consulta pública |
| Playwright: interface, permissões, rascunhos, equipe, importação e celular | 22 cenários verificados com Auth/API/fontes simulados: 20 passaram na execução inicial; um seletor antigo foi corrigido e o cenário passou na execução específica; o novo cenário de preservação da seleção passou separadamente |
| Supabase real e interface no domínio publicado | 52 verificações passaram; contas e registros temporários removidos com limpeza confirmada |
| Site público/PWA em Chromium, celular 390 px e shell offline | 17 verificações passaram, incluindo transposição local; cache somente estático |
| Função de busca no Netlify real | 4 verificações: busca Cifra Club 200 com três versões, prévia 502 informando o bloqueio 403 da fonte, URL externa 400 e POST 405 |
| Artefato final de produção | 37 arquivos revisados; nenhuma credencial privada, `.env` ou source map |
| Publicação Netlify com arquivos estáticos e função `.mjs` | Deploy `6ac693f5149e1c7eff6a70b8` confirmado como `ready` |
| Domínio HTTPS e rota direta `/consulta` | HTML Candeia e arquivo de entrada correspondem ao build publicado |

O endereço publicado é [louvor-grupo-fxebsy.netlify.app](https://louvor-grupo-fxebsy.netlify.app), no mesmo site `93f0134d-7c6f-414a-b86a-1c4c9bdcb477`. O helper publicou `dist` e `netlify/functions` juntos. Publicar somente um ZIP de `dist` não instala a função. A publicação é direta, sem integração Git: enviar código ao repositório não dispara outro deploy.

## Cifra Club e busca única

**Pesquisar cifra e letra** usa os campos de título e artista uma vez e reúne versões Cifra Club primeiro e letras LRCLIB na mesma lista. O editor identifica as fontes e deixa abrir o link da versão. Worship Together saiu da interface; o endpoint antigo permanece no backend por compatibilidade com instalações anteriores.

A busca real de “Me Atraiu”, de Gabriela Rocha, retornou três versões do Cifra Club: original, Reimagined e Me Atraiu / Quem É Esse. A consulta usa o índice público Solr e lê sua resposta JSONP como dados, sem executar código. Esse índice fornece metadados, não o conteúdo dos acordes.

**A importação automática de cifras do Cifra Club continua bloqueada externamente.** A leitura da página pública respondeu HTTP 403 com Access Denied no ambiente, no Netlify e no Chromium comum. A função de prévia respondeu 502 com aviso compreensível. O parser de HTML público está implementado e testado com fixtures; esses testes não comprovam acesso real à cifra. Não foi usado CAPTCHA, alteração de TLS ou extração de credenciais para contornar o bloqueio.

A verificação do editor publicado com Auth/PostgREST simulados e fontes reais confirmou três resultados Cifra Club, aviso de bloqueio, conteúdo original preservado e botão de pesquisa habilitado depois da falha. Nessa execução, LRCLIB respondeu HTTP 503 tanto no navegador quanto em uma consulta HTTPS independente; a importação real de letra não pôde ser concluída. A integração LRCLIB permanece implementada, mas depende da disponibilidade do provedor. Os testes simulados verificaram a prévia, a confirmação explícita de substituição, a preservação do tom da igreja e a gravação somente após salvar.

As tentativas iniciais de ampliar o helper real com fontes externas falharam na etapa de fontes e confirmaram a limpeza de suas fixtures. Os testes principais de Auth/RLS foram executados separadamente e passaram em 52 verificações. `--browser --song-sources` habilita as verificações adicionais de fontes no helper; uma falha ou indisponibilidade externa deve ser reportada, sem ser contada como importação aprovada. Se o Cifra Club voltar a fornecer a página, será preciso validar uma prévia e uma importação reais e atualizar o cenário que hoje verifica seu bloqueio.

**Importar texto manualmente** fica recolhido como alternativa, com link opcional. O texto alinhado é convertido em ChordPro; o cabeçalho `Tom:` reconhecido altera somente o tom original. Importar modifica o rascunho; salvar grava no banco. A visualização **Somente letra** remove os acordes da mesma cifra e não precisa de outra pesquisa.

## Travamento e memória

Dois casos malformados podiam bloquear o processamento: um acorde com sequência numérica longa seguido de caractere inválido e texto com muitos marcadores `[` sem fechamento. O parser agora percorre os sufixos e marcadores sem a repetição ambígua da expressão regular anterior. A conversão manual usa o mesmo scanner. Testes preservam a transposição de acordes válidos e o texto que não é acorde.

A prévia manual só é calculada quando a seção está aberta e usa entrada deferida. Campos e importações têm limite de 100.000 caracteres; prévias mostram até 12.000, mantendo o texto completo para importar. Conteúdo acima do limite é rejeitado, sem truncamento silencioso.

Em Chromium com build de produção, 40 ciclos de edição, navegação e mudança de foco produziram os seguintes valores após coleta de memória JavaScript:

| Ciclos | Memória JavaScript retida |
| --- | --- |
| 10 | 4,85 MB |
| 20 | 5,08 MB |
| 30 | 5,29 MB |
| 40 | 5,12 MB |

O retorno ao mesmo estado manteve 495 nós DOM, 200 listeners e 11 chamadas de API. Em cinco segundos de ociosidade não houve novas chamadas, erros ou atividade contínua de CPU. Uma colagem malformada de 50.051 caracteres levou aproximadamente 239 ms para prévia/importação, manteve o editor responsivo e não gravou no banco.

Essas medidas são da memória JavaScript, não da RAM total do Chrome. **O episódio de 3 GB relatado pelo usuário não foi reproduzido nem teve sua causa exata confirmada.** As correções eliminam os casos concretos de processamento lento encontrados; uma recorrência ainda precisa de diagnóstico no cenário afetado. O botão antigo de colagem só habilitava após receber texto, o que também foi substituído pela busca única visível e pela alternativa manual recolhida.

## Equipe e rascunhos

A inclusão e edição da equipe usam somente a seleção em lote. O mesmo formulário permite marcar/desmarcar pessoas, ajustar funções, preservar funções múltiplas, copiar a escala anterior e salvar a equipe inteira. A escolha de uma única pessoa continua possível nesse formulário.

O último ajuste faz resumo, remoção, reutilização e salvamento usarem a seleção ativa. O novo E2E verificou mudança de função e novas pessoas preservadas ao remover alguém do resumo e reutilizar a última escala; salvar e recarregar manteve as quatro atribuições esperadas. Rascunhos antigos contendo apenas inclusões são restaurados preservando a equipe já salva.

Os demais cenários verificaram consulta sem cadastro e sem edição/contatos, transposição local, importação explícita, rascunhos ao navegar/fechar, persistência depois de salvar, renovação de sessão e troca de foco sem desmontar o editor. Dados fictícios existem apenas nos testes; não há demonstração no produto.

## Banco, PWA e ambiente

O Supabase `fxebsycpbybhzkpnxzoo` mantém as migrações `001_initial.sql` e `002_public_consultation.sql`. Esta atualização não alterou o schema. A consulta pública habilitada retorna músicas, etiquetas, cultos, repertórios, nomes e funções, com e-mails vazios e sem perfis de conta. RLS continua negando leitura anônima direta das tabelas privadas e escrita sem permissão.

Os 52 testes reais incluíram perfis autorizados, restrições de escrita, consulta anônima sem contatos/perfis, repertório, transposição local, rascunhos e recuperação de senha de conta temporária. O helper gerou o link em memória sem enviar e-mail, testou uma senha nova e a rejeição da anterior. Todas as fixtures foram removidas; conta, senha e registros do proprietário foram preservados.

O manifest usa Candeia, ícones de chama e tema preto. No domínio publicado, a consulta pública, layout de 390 px, transposição, service worker ativo, cache estático e shell de login offline foram verificados. Respostas de Auth/PostgREST/fontes não ficam no cache. Dados compartilhados continuam exigindo conexão. Use **Atualizar agora** quando o aplicativo oferecer uma nova versão; rascunhos permanecem na mesma aba. Uma instalação antiga sem esse aviso pode precisar fechar todas as abas do site e reabrir o endereço.

TLS permanece habilitado. Neste ambiente, browsers externos precisam acessar o banco NSS da autoridade fornecida pela plataforma em `/home/agent/.pki/nssdb`; os testes não desabilitam certificados.

`install_script` e `start_skill` completos foram salvos no rascunho do ambiente Codex, com instalação, inicialização, testes, publicação da função, diagnóstico de fontes e deploy isolado `--draft`. O modo draft foi testado com uma URL própria e a produção permaneceu inalterada. A API confirmou `requires_publish: true`: revisar, salvar e publicar essa configuração no Codex é separado do site Netlify, que já está publicado. Não foi validada uma nova restauração completa do ambiente.

## Limites externos

- Cifra Club: busca de versões disponível; importação automática da cifra pendente pelo bloqueio HTTP 403.
- LRCLIB: indisponibilidade HTTP 503 observada na verificação final das fontes; importação real não foi aprovada nesse teste.
- SMTP próprio e entrega de confirmação/recuperação para outros integrantes continuam pendentes.
- Instalação PWA em Android/iPhone reais e execução do workflow GitHub não foram verificadas nesta atualização.
- Disponibilidade, confirmações, medleys, estatísticas, repertório em lote e sincronização offline de dados continuam no roadmap.
