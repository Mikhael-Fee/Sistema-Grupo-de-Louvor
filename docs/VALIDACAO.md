# Validação da atualização Candeia — 14/10/2026

## Versão atual — calendário, eventos, etiquetas, vídeos e acesso aprovado

Publicado em [louvor-grupo-fxebsy.netlify.app](https://louvor-grupo-fxebsy.netlify.app), com deploy de produção `6acfb79bdbdd1aa89fbe41af` confirmado `ready`. A migração `006_calendar_videos_private_access.sql` foi aplicada no Supabase existente e reinspecionada como idempotente. O draft Netlify `6acfb669eeafbadd07540184` e o domínio de produção concluíram separadamente 184 verificações de acesso privado. A checagem final percorreu 24 rotas em desktop e 320 px, sem dados do ministério na interface/API anônima e sem escrita.

**Cultos** abre o calendário mensal, com alternativa **Cards**, meses/Hoje e filtros Próximos/Anteriores/Todos. Dias ocupados abrem o encontro ou permitem escolher entre cultos do mesmo dia; administradores criam pelo dia livre com data preenchida. **É um evento** usa destaque próprio, sem alterar escala/repertório. Dias ocupados fora dos filtros permanecem identificados. O card da etiqueta abre suas músicas na biblioteca filtrada; a importação fecha resultados/prévia e mantém o texto editável.

O editor oferece sugestões YouTube após importar ou por **Sugerir vídeos**, com seleção explícita. Cada item do repertório pode indicar a versão do culto com capa/link, usando o vídeo da biblioteca quando não houver uma versão própria. A busca exige sessão válida e aprovação conferidas no servidor. Sem chave opcional da YouTube Data API, depende dos metadados públicos da busca; indisponibilidade mantém o link de busca externa e a colagem do vídeo. A capa abre o YouTube, sem reprodução automática no site.

As telas do ministério exigem login e aprovação. `/consulta` redireciona para o início/login; a 006 fecha a flag e os RPCs públicos antigos também para instalações anteriores. Cadastro, confirmação, recuperação, perfis e rascunhos autenticados continuam. A barra visível da sidebar foi ocultada preservando rolagem e teclado; favicon e ícones 192/512/maskable/Apple usam o contorno Lucide Flame da marca.

| Verificação desta atualização | Resultado registrado |
| --- | --- |
| Vitest | 243 testes passaram em 19 arquivos |
| PostgreSQL/PGlite | 383 verificações passaram: 111 de domínio/RLS, 55 do contrato histórico da 002, 82 de fotos/Storage, 32 de fotos vinculadas e 103 da 006; Auth/Storage simulados |
| TypeScript e build Vite/PWA | Passaram; 1.694 módulos e 51 entradas de precache, 1.000,24 KiB; PDF/worker continuam sob demanda |
| Playwright | 108 cenários distintos aprovados no conjunto: 107 passaram na rodada de 9,1 min e o último passou na reexecução específica de 7,7 s; sem casos pulados, sem uma rodada única 108/108 |
| Migração 006 no Supabase real | Aplicada; reinspeção confirmou `schema_changed: false`, acesso público fechado, RLS e leitura aprovada de fotos preservados |
| Preservação antes/depois da 006 | Quantidades e hashes das colunas antigas iguais; contas e objetos de avatar existentes preservados, conforme tabela abaixo |
| Supabase/Auth/browser no domínio publicado | 61 verificações passaram, incluindo papéis aprovados, calendário/evento/cards, filtro por etiqueta, versão de vídeo no culto e limpeza das fixtures |
| YouTube no domínio publicado | 17 verificações passaram; busca real **Me Atraiu** retornou HTTP 200 com seis opções; sem sessão 401, conta pendente 403; conta temporária removida |
| Draft Netlify privado | 184 verificações passaram no deploy `6acfb669eeafbadd07540184` |
| Checagem final privada em produção | 184 verificações passaram: 24 rotas em desktop/320 px, ausência de dados anônimos na interface/API, zero escrita, RPC público rejeitado com 42501, YouTube sem sessão 401, hashes dos ícones/manifest e shell offline |
| Runtime Netlify | Duas variáveis públicas VITE_SUPABASE configuradas e reinspecionadas para build/funções; nenhum token administrativo publicado |
| Revisão de artefato | Varredura desta rodada cobriu 217 arquivos sem credenciais privadas; incluiu os novos helpers e os arquivos de documentação existentes |
| Configuração reutilizável Codex | `start_skill` de 18 passos salvo com `requires_publish: true`; instalação, rede e bindings existentes preservados; publicação futura pelo produto não executada |
| Publicação Netlify | Deploy de produção `6acfb79bdbdd1aa89fbe41af` confirmado `ready`, no mesmo site/domínio existente |

A comparação real da 006 foi feita sobre valores preexistentes, além das quantidades. Não houve reinstalação da 001, criação de exemplos, redefinição de senha ou troca de imagens/vínculos do proprietário. Novos campos têm padrão não evento/vídeo vazio; `save_service` preserva valores novos quando um cliente antigo os omite. A flag de consulta pública foi fechada conforme a mudança solicitada.

| Registros/objetos existentes | Antes da 006 | Depois da 006 |
| --- | ---: | ---: |
| Músicas | 50 | 50 |
| Pessoas | 17 | 17 |
| Cultos | 3 | 3 |
| Perfis | 4 | 4 |
| Etiquetas | 8 | 8 |
| Vínculos música/etiqueta | 163 | 163 |
| Itens de repertório | 14 | 14 |
| Atribuições de escala | 24 | 24 |
| Contas Auth | 4 | 4 |
| Objetos de avatar | 19 | 19 |

A única falha da rodada completa do Playwright estava na asserção de uma fixture antiga que omitia `youtubeUrl`; o adapter vigente retorna esse campo opcional vazio normalizado. A expectativa passou a conferir esse valor sem retirar o teste de preservação, e o cenário reexecutado passou. Isso aprova os 108 cenários no conjunto de execuções, não em uma rodada única. O roteiro real Supabase concluiu 61 verificações com limpeza após atualizar a asserção da biblioteca vigente; uma execução anterior tinha parado após 36 verificações por esperar a indicação antiga **Original: C** na linha da música.

A checagem privada final manteve a regressão da chave antiga de visitante: a preparação do teste foi limitada à janela principal e a asserção aguarda a limpeza da chave, evitando que subframes reintroduzam a fixture. A rodada final de 184 verificações passou sem alterar o comportamento da aplicação nem remover a asserção de login obrigatório.

A configuração reutilizável Codex foi salva como rascunho de 18 passos, separada do deploy Netlify confirmado. `requires_publish: true` ainda exige publicação futura pelo produto; não foi executada nem validada uma restauração completa de um novo ambiente. A instalação e as configurações anteriores de rede/autenticação foram preservadas, sem segredos nas instruções.

As credenciais renovadas foram usadas somente em memória/entrada do processo; não foram persistidas em arquivos, artefatos ou instruções de setup. Os resultados antigos de upload/fotos abaixo permanecem históricos: `verify-profile-photos.mjs` não foi executado nesta rodada. Os testes de PGlite do contrato histórico público não significam que a consulta anônima continua liberada depois da 006.

Limites: viewport móvel no Chromium não valida aparelhos Android/iOS físicos nem menus de impressão ou instalação nativos. A leitura direta de cifras no servidor continua sujeita ao HTTP 403, sem mudança desta rodada. A busca YouTube real funcionou nesta execução, mas o acesso/formato da fonte pode mudar; a alternativa externa permanece. Nenhuma medição nova da RAM total do Chrome ou validação de restauração completa do ambiente é inferida por esses resultados.


## Versão anterior — fotos e observações no início (08/10/2026)

Publicado em [louvor-grupo-fxebsy.netlify.app](https://louvor-grupo-fxebsy.netlify.app) com deploy `6ac8002de7f6373d83519a86`, confirmado pronto no Netlify. A verificação do domínio publicado concluiu 48 checks, incluindo uma observação real do repertório do próximo culto.

O resumo do próximo culto no **Início** usa a mesma imagem de equipe/escala: foto explícita da pessoa, depois foto da conta aprovada vinculada e, sem imagem, iniciais. O repertório mostra **Obs.:** com a primeira linha não vazia da observação daquela música no culto, abaixo do artista. Espaços externos e quebras CRLF são tratados; a linha completa fica no título do texto, e a apresentação usa reticências sem rolagem horizontal. A origem é `item.notes` do repertório, não as observações gerais do cadastro da música.

| Verificação desta atualização | Estado |
| --- | --- |
| TypeScript e build Vite/PWA | Passaram; 1.688 módulos e 46 entradas de precache, 957,99 KiB |
| Playwright específico | 6/6 cenários passaram em 23,7 s, sem falhas ou casos pulados: quatro de fotos/vínculos com resumo inicial e dois de observações em desktop 1200 px/consulta pública 320 px |
| Revisão de artefato | 191 arquivos e varredura de checkout/dist sem credenciais privadas |
| Domínio publicado | 48 verificações passaram; `home_notes_checked=1` confirma a observação real do próximo culto |
| Foto na Home em produção | `home_photos_checked=0`: a equipe retornada para o próximo culto não tinha foto associada; exibição coberta pelos quatro testes controlados de vínculo/Home |
| Publicação Netlify | Deploy `6ac8002de7f6373d83519a86` pronto no mesmo domínio existente |

Esta rodada altera somente a interface inicial. O schema Supabase e o rascunho de configuração Codex mantêm o estado da entrega anterior. A validação de navegador desta rodada executou os seis cenários específicos; os resultados completos anteriores permanecem históricos.

Limite: a rodada pública não verificou uma foto real na Home, pois não havia imagem associada aos integrantes do próximo culto consultado. Os testes controlados verificaram prioridade de foto da pessoa, alternativa da conta vinculada e iniciais sem imagem; essa cobertura não é apresentada como visualização de uma foto real em produção.

## Versão anterior — PDFs em lote, tom escrito, instrumentais e fotos vinculadas

Publicado em [louvor-grupo-fxebsy.netlify.app](https://louvor-grupo-fxebsy.netlify.app) com deploy `6ac7f97d564662e8ab1bce75`, confirmado `ready` pelo helper `--check`. Esta versão acrescenta **Importar PDFs**, separado da importação individual em **Nova música**, preserva o tom escrito na importação PDF/Cifra Club, melhora a limpeza/visualização de introduções e solos e conecta a exibição de fotos entre conta e integrante. Testes unitários/banco, build, 85 cenários distintos de navegador, migração 005 no Supabase real e 44 verificações do domínio publicado foram concluídos.

O lote permite até 20 PDFs, 8 MiB por arquivo e 80 MiB no total, com uma música por arquivo e leitura sequencial de worker, progresso e revisão por item. Não envia PDFs nem grava músicas durante a leitura. O salvamento é por música selecionada: sucessos permanecem salvos, falhas podem ser corrigidas/repetidas e o mesmo UUID é reutilizado na tentativa. Duplicatas vêm desmarcadas; incluir explicitamente cria uma cópia. Cancelar leitura preserva itens processados, e interromper gravação termina o item em andamento antes de parar os próximos.

O tom escrito explícito da fonte tem prioridade. Se houver somente tom sonoro e capotraste, o intervalo é subtraído para obter a base escrita: **Bb/capo3 → G**, com **G** como padrão de tom na igreja quando não houve escolha manual. Um tom escolhido pelo usuário é preservado; igreja Bb transpõe G→Bb uma vez, sem somar capotraste novamente. A estimativa analisa conjunto/sequência de acordes e candidatos maiores/menores: confiança alta/média pode preencher com indicação **PROVÁVEL**, revisão e edição; baixa confiança exige confirmação. G/A/D pode sugerir D, e G/A/D/Bm/C pode sugerir D com C como possível empréstimo. Esses exemplos não provam a tonalidade e não usam somente o primeiro acorde.

A limpeza retira tabs de introdução e solo sem perder rótulos **[Intro]**/**[Solo]**, acordes ou versos. A visualização de linhas instrumentais sem letra acrescenta espaço de pelo menos 8 px entre acordes, preservando alinhamento em linhas com versos e transposição. Leitura de registros antigos continua sem escrita automática.

Equipe/escala usam primeiro a foto definida para a pessoa e, se faltar, a foto da conta aprovada vinculada. Perfil/cabeçalho usam primeiro a selfie própria e, se faltar, a foto da pessoa vinculada. URLs e arquivos continuam separados, sem copiar dados; desvincular ou retirar aprovação deixa de retornar a foto da conta na próxima leitura. O formulário administrativo impede escolher uma pessoa usada por outro perfil.

A migração `005_linked_profile_photos.sql` foi aplicada no Supabase real: `read_team_profile_photos()` exige acesso aprovado, retorna apenas `personId`/`photoUrl` e a consulta pública inclui a URL da conta aprovada vinculada como `accountPhotoUrl`. A reinspeção confirmou a migração aplicada, `schema_changed: false`, guarda de aprovação, privilégios públicos restritos e `search_path` protegido. O helper `scripts/configure-linked-profile-photos.mjs` consulta o contrato por padrão e aplica somente essa atualização com `--apply`; `tests/database/linked-photos-check.mjs` usa PGlite/Auth/Storage simulados. Os retornos não têm campos de ID de Auth, e-mail ou papel; URLs públicas de avatar podem conter UUIDs no caminho do arquivo.

| Verificação desta atualização | Estado |
| --- | --- |
| Vitest | 220/220 testes passaram em 16 arquivos |
| PostgreSQL/PGlite | 280/280 verificações passaram: 111 de domínio/RLS, 55 de consulta pública, 82 de fotos/Storage e 32 de fotos vinculadas; Auth/Storage simulados |
| TypeScript e build Vite/PWA | Passaram; 1.688 módulos processados |
| Migração 005 no Supabase real | Aplicada; reinspeção confirmou idempotência e proteções dos RPCs, sem modificar registros do proprietário |
| Fotos/Auth/Storage no Supabase real | 18 verificações passaram, incluindo vínculo, desvinculação, retirada de aprovação e RPC/consulta pública; leitura de fotos vinculadas via GET, como no aplicativo; contas, pessoa e uploads descartáveis removidos |
| Artefato | 190 arquivos revisados e varredura de checkout/dist sem credenciais privadas; ZIP com seis arquivos idênticos ao código, sem source maps |
| Precache PWA | 46 entradas, 957,69 KiB; PDF e workers grandes carregados sob demanda, fora do precache |
| Configuração reutilizável Codex | `start_skill` de 17 passos salvo com `requires_publish: true`, separado da publicação Netlify |
| Playwright | 85 cenários distintos aprovados no conjunto de execuções, sem casos pulados; rodada completa teve 80 aprovações e 5 falhas de roteiro, revalidadas após correção dos testes |
| Fontes e lote PDF na rodada completa | 4 cenários novos de tom, 7 com extensão real e 5 de lote PDF passaram |
| Leitura PDF repetida | 23 leituras, zero workers remanescentes e delta de heap JavaScript de 587 KiB após aquecimento/coleta de lixo |
| Domínio publicado | 44 verificações reais passaram: consulta pública sem edição/gravação, ausência de lote para visitante, transposição, layout móvel, gráficos, PWA/cache estático/shell offline e artefato publicado |
| PDF/parser no build publicado | Limpeza de tabs Intro/Solo e preservação de rótulos/acordes verificadas; dois PDFs lidos em sequência com worker real e encerramento confirmado |
| Publicação Netlify | Deploy `6ac7f97d564662e8ab1bce75` confirmado `ready`, no mesmo domínio e site existentes |

A rodada completa executou os 85 cenários: três falhas ainda esperavam o padrão antigo Bb ou usavam uma fonte com tom sonoro/capotraste como se fosse desconhecida; outras duas tinham seletores/rota inadequados. Os testes foram atualizados para conferir o padrão escrito G, a transposição manual para Bb, a confirmação de uma fonte sem tom escrito/sonoro e os controles reais de vínculo administrativo. A reexecução de 14 cenários de importação móvel/fotos teve 13 aprovações e uma falha de seletor; a rodada específica dos quatro casos de fotos teve três aprovações e uma incompatibilidade de asserção com `<option>`. A asserção passou a conferir a propriedade `disabled` da opção, e o último cenário de vínculo/desvinculação/retirada de aprovação passou em 7,1 segundos. Os 85 cenários distintos foram aprovados nessas execuções, **sem uma rodada única de 85/85**. Não houve mudança de código de produção depois da rodada completa/build nem retirada das verificações de permissão; o TypeScript final também passou.

A medição nova de PDF é heap JavaScript do Chromium de teste, não RAM total do Chrome ou medição de aparelho físico. As medições anteriores abaixo permanecem históricas. A configuração salva do ambiente Codex ainda exige publicação pelo produto e é separada do site Netlify já publicado; não foi validada uma nova restauração completa do ambiente. Nenhum cadastro, foto, vínculo ou senha do proprietário foi alterado pelos testes reais.

A consulta final de limpeza confirmou zero contas/pessoas de teste de fotos e zero objetos de avatar sem uma conta proprietária. O helper concluiu novamente as 18 verificações usando GET no RPC de fotos vinculadas, preservando autenticação, aprovação e a configuração de consulta pública.

Limites: o lote continua usando PDFs com texto selecionável, sem OCR; uma música deve ocupar seu próprio arquivo. A cifra precisa abrir normalmente no navegador para gerar o PDF, e o bloqueio HTTP 403 do servidor permanece. Estimativa de tom é uma indicação revisável, com possibilidade de acordes emprestados e modulação, não confirmação musical. Menus de impressão em Android/Safari físicos precisam de conferência no aparelho. Nenhum novo resultado de teste ou publicação é inferido pela existência do código.

## Versão anterior — PDF no celular, gráficos e fotos

Publicado em [louvor-grupo-fxebsy.netlify.app](https://louvor-grupo-fxebsy.netlify.app) com deploy `6ac7e22149737a81462e075b`, confirmado `ready` pela API Netlify. A aplicação e a função foram publicadas juntas no mesmo site. Esta versão acrescenta importação de cifra por PDF, gráficos do planejamento e fotos de perfil/integrantes. As verificações locais, de fotos no Supabase real e as 41 verificações públicas do deploy final foram concluídas, incluindo o ajuste de cancelamento da leitura do arquivo.

O usuário relatou que o favorito de importação não funcionou no Chrome/Xiaomi. Os guias de favorito JavaScript e Atalhos foram retirados do fluxo atual. Testes anteriores de navegação/fixtures não validaram esses controles em aparelhos físicos. O receptor e artefatos antigos continuam somente por compatibilidade, e seu histórico permanece abaixo.

O fluxo atual de celular é **abrir a cifra normalmente → Imprimir/Salvar como PDF → Biblioteca/Nova música/Escolher PDF da cifra → revisar/importar/salvar**. PDF.js 6 e worker são carregados sob demanda e leem o texto localmente, com limites de 8 MiB, 20 páginas, 100.000 caracteres, 30.000 itens e 25 segundos. Cada página é liberada e o worker destruído no término ou cancelamento. Não há OCR, renderização ou upload do PDF. PDFs sem texto selecionável, com senha, inválidos ou excessivos são recusados. A prévia reconstrói alinhamento/colunas, limpa tablaturas e preserva tom-base/capotraste; metadados e endereço canônico são usados quando presentes e completados pelo usuário quando ausentes. O único campo editável de letra e cifra e o salvamento explícito continuam.

Sete cenários com leitura real de PDFs controlados passaram, incluindo a ausência de `Promise.withResolvers` na página e no worker. A compatibilidade é instalada nos dois contextos antes de PDF.js; o Vite pré-otimiza seus módulos para evitar recarregamento do editor em desenvolvimento. A PWA exclui bundles PDF/worker do precache, mantendo o download sob demanda, e falha de inicialização do worker recebe orientação em português. No domínio final, o build publicado também leu um PDF controlado com worker real, preservou os acordes `F#7(b9)` e `G` e terminou sem worker remanescente.

A verificação repetiu 23 leituras: três de aquecimento e 20 para comparação de heap após coleta de lixo via CDP. Houve também cancelamento com a inicialização do worker controlada pelo teste. Depois de cada leitura/cancelamento restaram **zero workers**, e a diferença de heap após aquecimento foi **572 KiB na rodada específica e 576 KiB na suíte completa**. O conteúdo ficou no rascunho, sem criação de registro no banco. Essa é memória JavaScript da página no Chromium de teste, **não a RAM total do Chrome nem uma medição de aparelho físico**; não reproduz por si só o episódio de 3 GB relatado anteriormente.

O ajuste final também verifica cancelamento durante `File.arrayBuffer()`: o sinal é conferido após a leitura do cabeçalho e dos bytes completos, para não iniciar o worker caso o sistema entregue os dados depois de cancelar. Os sete cenários PDF passaram novamente em 23 segundos, com zero workers remanescentes e delta de heap de 572 KiB. Essa rodada específica não repete todos os 70 cenários da interface.

`/graficos` oferece período, datas, temática, evolução e rankings de planejamento para acessos aprovados e consulta pública liberada. Pessoas e músicas contam uma vez por culto; funções contam atribuições e etiquetas podem somar mais de 100%, com nota sobre sobreposição. Os totais de cadastro mostram o estado atual e não mudam pelo período. Uma escala não comprova presença. Os dados são derivados do recorte já autorizado, sem novos registros de análises ou ações de escrita.

`/perfil` permite escolher ou remover a foto própria, e administradores editam fotos dos integrantes em **Equipe**. As fotos são independentes. PNG/JPEG/WebP de até 10 MiB são preparados localmente para até 512 px e 300 KiB, com envio somente ao salvar. A migração `004_profile_photos.sql` foi aplicada no Supabase real e verificada como idempotente, preservando registros e permissões: URLs limitadas ao projeto, bucket público `avatars` de 2 MiB, objetos novos sob UID/UUID, RLS de Storage e RPC que altera apenas a foto própria. Imagens referenciadas não podem ser excluídas; perfis e e-mails continuam fora da consulta pública. O helper `scripts/verify-profile-photos.mjs` concluiu separadamente 10 verificações reais de Storage/Auth/RPC, cobrindo limites, isolamento, fotos públicas e uso por perfil/equipe. Todas as contas, a pessoa e as imagens descartáveis foram removidas; a conta proprietária permaneceu intacta.

| Verificação desta atualização | Resultado registrado |
| --- | --- |
| Vitest | 184 testes passaram |
| PostgreSQL/PGlite | 248 verificações passaram: 111 de domínio/RLS, 55 de consulta pública e 82 de fotos/Storage, com Auth simulado |
| TypeScript e build Vite/PWA | Passaram, incluindo PDF.js/worker sob demanda |
| Leitura PDF real em navegador de teste | 7 cenários passaram, incluindo compatibilidade na página/worker, cancelamento e repetição; zero workers remanescentes |
| Memória da leitura PDF | 23 leituras; delta de heap JavaScript de 572 KiB na rodada específica e 576 KiB na completa após aquecimento/GC; nenhuma gravação no banco |
| Supabase real, migração 004 | Aplicada e idempotência confirmada; configuração de bucket/RLS/RPC verificada, sem alteração dos registros existentes |
| Playwright | 70 cenários distintos verificados: 63 passaram na rodada completa, e os 7 da extensão passaram depois em execução isolada de 11,1 s |
| Fotos no Supabase real | 10 verificações de Storage/Auth/RPC passaram; contas, pessoa e arquivos temporários removidos; proprietário preservado |
| Artefato local | 175 arquivos revisados, sem credenciais privadas ou source maps; os seis arquivos do ZIP correspondem exatamente ao código |
| Precache PWA final | 46 entradas, 932,30 KiB; bundles PDF/worker excluídos e carregados ao escolher arquivo |
| Configuração reutilizável Codex | `start_skill` atualizado para PDF, gráficos e fotos; `install_script` e demais configurações preservados; rascunho com `requires_publish: true` |
| Domínio final em Chromium HTTPS | 41 verificações reais passaram no deploy final: consulta sem cadastro e sem gravação, transposição, gráficos/filtros em 320 px, PDF no build com worker real e término confirmado, guias Android/iPhone, hash do ZIP, manifest, service worker/cache estático e shell offline |
| Publicação Netlify | Deploy `6ac7e22149737a81462e075b` confirmado `ready`; aplicação e função no mesmo site existente |

A rodada completa do Playwright teve 63 aprovações, um timeout de 25 segundos na primeira leitura da extensão e seis casos posteriores dessa suíte serial sem execução. Sem mudar a implementação da extensão, os sete casos passaram na rodada isolada, incluindo a primeira leitura em 953 ms. Isso verifica os 70 cenários distintos em duas execuções; **não é uma aprovação de 70/70 em uma única rodada**. A causa do timeout não foi confirmada e não foi atribuída a CPU ou consumo de memória sem evidência. Os sete cenários PDF também tinham passado separadamente antes da rodada completa.

O rascunho de configuração do ambiente Codex exige publicação pelo próprio produto e é separado do deploy Netlify. Não foi validada uma nova restauração completa do ambiente.

A primeira execução pública extraiu o PDF corretamente, mas o teste contou workers antes de receber o evento de encerramento. O helper passou a aguardar esse evento por até cinco segundos; a rodada final concluiu as 41 verificações. Esse ajuste foi no teste, sem alterar o código de produção. Nenhum cadastro ou senha do proprietário foi alterado; os testes públicos não gravaram dados do ministério.

Limites: PDFs controlados e viewports móveis do Chromium não validam os menus de impressão em aparelhos Android/Safari físicos. A cifra precisa abrir normalmente no navegador para gerar o PDF; a leitura direta pelo servidor continua sujeita ao HTTP 403 da fonte. Fotos salvas têm URLs públicas; desativar a consulta não torna o bucket privado. Medições anteriores de memória permanecem históricas e não foram repetidas nesta entrega; a medição nova de heap PDF descrita acima não equivale à RAM total do Chrome.

## Versão anterior — artista, temáticas livres e importação móvel

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
