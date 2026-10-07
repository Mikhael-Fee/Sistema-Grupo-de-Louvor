# Validação da atualização Candeia — 07/10/2026

## Versão atual — importador pelo navegador

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
