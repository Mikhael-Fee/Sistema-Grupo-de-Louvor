# Candeia: verificação antes e depois de publicar

Este roteiro valida a versão deste checkout. Ele não registra resultados executados nem afirma que o site existente já recebeu as mudanças. Registre as evidências somente após os checks e o deploy correspondente; resultados anteriores ficam em [VALIDACAO.md](VALIDACAO.md). A atualização de 14/10/2026 já teve a migração 006 aplicada/reinspecionada e o deploy `6acfb79bdbdd1aa89fbe41af` confirmado `ready`. O resultado de cada execução, incluindo o estado da checagem final do domínio, fica em VALIDACAO; este arquivo continua sendo um roteiro para manutenção futura.

## Antes do deploy

Execute `npm run typecheck`, `npm test`, `npm run test:db`, `npm run test:e2e` e `npm run build`. Confira login/aprovação e as telas autenticadas em desktop e larguras de 320/390 px, sem botão de demonstração ou seleção de papel simulado. Fixtures dos testes não devem aparecer no produto ou ser instaladas no banco real.

Verifique que as migrações históricas 001 a 005 estão presentes no banco escolhido; **não reaplique `001_initial.sql` sobre o ministério existente**. A 003 permite temáticas obrigatórias de até 100 caracteres e preserva os tipos existentes. Seus helpers históricos só servem para o esquema conhecido correspondente; **não use `configure-public-consultation.mjs --enable` nem restaure o acesso público**. Aplique atualizações somente no projeto autorizado, preservando registros existentes.

Confira também `004_profile_photos.sql` com `node scripts/configure-profile-photos.mjs`: colunas opcionais, RPC de foto própria, bucket público `avatars` de 2 MiB e políticas RLS de Storage. `--apply` instala somente a migração ausente no schema conhecido. Verificação de schema não comprova upload real, leitura pública ou rejeição de escrita de outra conta.

Para fotos compartilhadas pela associação conta↔integrante, verifique também `005_linked_profile_photos.sql` com `node scripts/configure-linked-profile-photos.mjs`. O helper consulta o contrato por padrão; `--apply` instala somente a atualização ausente dos RPCs no projeto autorizado. Não reaplique `001_initial.sql`. O RPC privado exige aprovação e devolve apenas ID da pessoa/URL pública. Depois da 006, o RPC histórico de consulta pública fica fechado e não deve ser restaurado por helpers antigos.

Instale e reinspecione [006_calendar_videos_private_access.sql](../supabase/migrations/006_calendar_videos_private_access.sql) **somente após a 005**, pelo helper `node scripts/configure-calendar-videos.mjs` e seu `--apply` no projeto autorizado. Ele acrescenta a marca de evento e o vídeo por item do repertório, fecha os RPCs públicos e compara em transação as colunas existentes para preservar cultos, músicas, escalas, vínculos e perfis. Confira idempotência em uma reinspeção, flag pública falsa, privilégios dos RPCs antigos revogados e RPC de fotos aprovado preservado. Não redefina senha, aprovação, foto ou vínculo do proprietário; não use dados cadastrados como fixtures. A 006 foi aplicada e a reinspeção no projeto real confirmou `schema_changed: false`; em uma manutenção futura, confira o estado antes de tentar aplicar novamente.

As buscas precisam das funções Netlify, além do build estático. Vite e `vite preview` sozinhos não atendem `/.netlify/functions/song-search` ou `/.netlify/functions/youtube-search`; valide seus contratos em testes e o fluxo completo quando houver runtime compatível ou o novo deploy. A função YouTube exige a URL/chave pública do projeto no runtime Netlify e autentica a conta aprovada. Sem uma chave opcional YouTube Data API, depende do formato/acesso da página pública de busca; a opção externa de busca deve permanecer disponível.

## Confirmar o artefato publicado

Publique pelo modo que inclui build estático e ambas as funções:

```sh
node scripts/configure-netlify-video-env.mjs
node scripts/deploy-netlify.mjs --check
node scripts/deploy-netlify.mjs --deploy-dir dist --functions-dir netlify/functions
```

O deploy deve estar `ready` em `/workspace/scratch/louvor-netlify-state.json`, salvo pelo helper a partir da API Netlify. Use a origem HTTPS observada nesse arquivo; neste site, o endereço existente é `https://louvor-grupo-fxebsy.netlify.app`. O ZIP antigo contendo somente `dist` não publica as funções. Registre cada publicação somente depois de confirmar o novo deploy e a migração correspondente; a existência de um artefato local ou o resultado histórico de outra versão não confirma essa etapa.

1. Confira HTTP 200 na página inicial, `/consulta`, `/musicas`, `/graficos`, `/perfil`, `/conectar-cifra-club`, `/importar-cifra`, `/manifest.webmanifest` e `/sw.js`. As rotas de página devem retornar o shell da SPA, sem 404 ao recarregar diretamente.
2. Confira título/brand **Candeia**, favicon de chama, manifest com `short_name: Candeia`, `display: standalone`, ícones 192/512, maskable 512 e Apple 180 com o mesmo path Lucide Flame e as cores da marca interna. Confira que o ícone maskable mantém a chama na área segura. Manifest e service worker devem ter tipos de conteúdo apropriados.
3. Confirme que `/.netlify/functions/song-search` responde como função JSON, e não como `index.html` da SPA. Uma consulta sem título pode retornar 400; isso é diferente de uma função ausente. O endpoint `/.netlify/functions/youtube-search` deve retornar JSON 401 sem sessão, 403 para conta não aprovada e opções/erro compreensível para conta aprovada, sem liberar busca anônima.
4. O build pode conter somente as duas configurações públicas do Supabase. Não inclua `.env.local`, tokens de Netlify/Supabase, senha do banco, chave `service_role` ou dados de contas no artefato.

## Login e aprovação obrigatórios

Use sessões separadas do proprietário e contas temporárias autorizadas:

1. Sem login, abra `/`, `/consulta`, `/cultos`, `/musicas`, `/pessoas`, `/etiquetas`, `/graficos`, `/perfil`, `/importar-cifra` e `/conectar-cifra-club`. As páginas do ministério devem mostrar a entrada, sem dados, navegação do ministério ou botão **Entrar sem cadastro**. `/consulta` deve redirecionar ao início. A rota de recuperação continua disponível para sua finalidade.
2. Simule a chave antiga `candeia.public.session`: ela deve ser removida sem restaurar visitante nem consultar RPCs públicos. Uma conta já autenticada deve manter sua sessão e os rascunhos próprios; sair volta à entrada.
3. Confira cadastro, confirmação de e-mail e recuperação. Conta confirmada e ainda não aprovada deve ver **Seu cadastro está em análise**, sem ler músicas, cultos ou equipe. **Verificar aprovação** libera as telas somente após a aprovação administrativa real.
4. No projeto autorizado após a 006, tente ler tabelas privadas ou invocar os três RPCs públicos antigos como anônimo e como conta pendente: nenhuma operação deve retornar dados do ministério. Um administrador também não deve poder restaurar consulta pública pelo RPC antigo; a flag não pode voltar a true.
5. Em **Administração**, não deve aparecer **Consulta sem cadastro**, toggle ou link público. Músico aprovado continua consultando/transpondo sem criar ou editar; líder/administrador mantêm seus papéis existentes. Nenhuma alteração desses testes pode atingir o proprietário.

Repita navegação, biblioteca, culto e leitor em 320/390 px. Em desktop com pouca altura, a sidebar deve rolar com roda do mouse, teclado e foco dos links sem exibir a barra; **Sair** deve continuar alcançável. Confira menu móvel, contraste, ações por teclado e ausência de overflow horizontal.

## Calendário, eventos e cards

1. Entre com conta aprovada e abra **Cultos**: **Calendário** deve ser o padrão. Navegue por mês anterior/próximo e **Hoje**; as datas usam o calendário do ministério em São Paulo. Confira dias nos limites de mês/ano e um mês de fevereiro com 29 dias usando fixtures.
2. Use **Próximos**, **Anteriores**, **Todos**, temática e pesquisa. Dias ocupados que não correspondem aos filtros devem permanecer indicados como fora dos filtros, nunca como dia livre. **Cards** volta à visualização anterior sem perder os filtros.
3. Um dia com um culto abre a visão de repertório e escala. Dois cultos no mesmo dia abrem uma escolha com horário/temática; cada escolha deve levar ao culto correto. Clique em um dia livre como administrador aprovado: o formulário deve receber aquela data. Cancelar não grava culto.
4. Músico e líder não criam ao clicar no dia livre; o botão **Novo culto** para líder continua conforme sua permissão existente. Em todas as contas aprovadas, dias ocupados continuam abrindo o encontro.
5. Crie uma fixture marcada **É um evento**, salve e recarregue. Confira destaque distinto e legenda no calendário, marca nos cards e detalhe do culto. Editar/retirar a marca preserva equipe, repertório e notas; cultos preexistentes começam sem marca e não mudam de data.
6. Repita em 320/390 px: números dos dias, contagens, evento e toque devem ficar legíveis, com escolha de múltiplos cultos acessível. Não remova cultos reais para produzir espaços livres; limpe somente fixtures próprias.

## Etiquetas e versões dos vídeos

1. Clique em uma etiqueta com músicas: a biblioteca deve abrir filtrada por ela, mostrando todas as correspondentes e o nome do filtro. Abra o link diretamente e recarregue para conferir persistência na URL. Combine outras etiquetas ou **Limpar filtros** sem gravar cadastros; etiqueta vazia mostra estado vazio, sem exemplos.
2. **Editar etiqueta** e **Excluir etiqueta** continuam separados da navegação do card. Músico aprovado pode consultar, sem receber edição. Abrir uma etiqueta não deve chamar RPC de salvamento.
3. Em uma fixture de culto, abra **Editar tom e observação** de uma música e informe **Vídeo do YouTube neste culto**. A capa deve usar essa versão e o clique abrir seu vídeo no YouTube. Sem link próprio, usa a versão da biblioteca; mudar/remover o vídeo do culto preserva `songs.youtube_url` e os outros itens do repertório.
4. Salve/recarregue, reordene músicas e edite a escala: o vídeo continua associado ao mesmo item. Link vazio remove a versão própria; domínio parecido, HTTP, canal/playlist ou ID inválido devem ser recusados, mantendo o rascunho.
5. Músico aprovado vê a capa/link sem edição. Confira imagens carregadas sob demanda, ausência de reprodução automática/iframe e ausência de overflow em 320/390 px. Uma imagem indisponível deve manter o link acessível; testes de viewport não comprovam impressão/instalação em aparelho físico.

## Rascunhos e planejamento

Use contas temporárias autorizadas, separadas da conta do proprietário:

- Preencha uma música/culto ou ajuste sem salvar. Feche o editor, navegue e retorne, ou recarregue a mesma aba: o rascunho da mesma conta deve reaparecer, sem alteração no banco.
- Escolha **Cancelar**: descarte o rascunho. Salve uma versão válida: confirme a persistência no banco e a limpeza do rascunho. Um erro deve preservar os campos para correção.
- Entre com outra conta e abra outra aba: elas não devem receber os rascunhos da primeira. Sair da conta deve limpar os rascunhos dessa conta naquela aba.
- Abra **Selecionar equipe** ou **Editar equipe**: deve ser o único fluxo da escala. Selecione várias pessoas e funções válidas, incluindo funções adicionais; desmarque alguém para retirar e confirme **Salvar equipe**. No formulário de culto, a seleção só chega ao banco ao salvar o culto, inclusive se o seletor estiver aberto. Fechar preserva o rascunho; Cancelar o descarta. A equipe pode ficar vazia sem reinstalar os integrantes antigos.
- Use **Reutilizar última escala** e confira vínculos existentes, funções válidas e ausência de duplicação. Revise tom/observações por culto e ordem do repertório; alterações devem respeitar o papel da conta.
- Use **Selecionar músicas**, marque várias músicas, pesquise outras e confirme **Adicionar selecionadas** uma vez. A seleção deve permanecer entre buscas, impedir duplicatas, seguir a ordem dos cliques e usar o tom da igreja. No novo culto, seleções ainda abertas devem entrar somente ao salvar o culto.

## Fontes de letras e cifras

Com uma conta administradora temporária, abra uma música em rascunho:

1. Preencha título/artista e escolha **Pesquisar cifra e letra** uma vez. A lista deve oferecer versões Cifra Club primeiro, seguidas de letras LRCLIB quando disponíveis, com origem e tipo de conteúdo. Não deve exigir pesquisa separada de letra/cifra nem oferecer a seleção Worship Together.
2. Abra uma opção Cifra Club na fonte e use **Ver prévia**. A busca de metadados real já retornou opções, mas a prévia real continua bloqueada pelo 403 da fonte e informa 502 no endpoint. Esse resultado deve preservar os campos. Não registre importação Cifra Club como aprovada enquanto uma prévia real não tiver sido carregada; os testes com mocks verificam o fluxo e a conversão, não a disponibilidade remota.
3. Se uma fonte permitir a prévia, confira a origem, o conteúdo e **Ver somente letra na prévia**. Importar a cifra com essa opção marcada ainda deve manter os acordes completos, pois a opção altera somente a visualização. Uma versão LRCLIB usa **Importar letra sem acordes** e não cria acordes.
4. A importação converte os acordes para **Tom na igreja** e registra a fonte. Confira prioridade do tom escrito explícito. Se houver apenas tom sonoro Bb/capo3, a base escrita e o padrão inicial de igreja devem ser G, sem transpor o conteúdo recebido. Escolher Bb converte G→Bb uma vez, com Bb→C correto no leitor, incluindo baixo. Um tom de igreja escolhido antes da importação deve permanecer. Sem tom confiável da fonte, estimativa alta/média deve mostrar **PROVÁVEL** e permitir edição; ambiguidade exige confirmação, sem inferir apenas pelo primeiro acorde. Título/artista preenchem com a opção marcada; conteúdo vazio também pode importar e salvar direto da prévia. Conteúdo anterior exige **Substituir letra e cifra**; **Manter conteúdo atual** preserva o texto. Após importar, a lista de resultados e a prévia devem fechar automaticamente; o conteúdo permanece no campo editável. Nenhuma gravação até salvar.
5. Existe apenas um campo editável **Letra e cifra**, sem painel manual. Cole um exemplo próprio com `Tom:` e tablaturas: sair do campo deve converter para o tom da igreja e retirar tabs sem perder versos/seções. Na colagem parcial com tom conhecido, somente o trecho colado deve ser convertido. Com tom desconhecido, confirme antes de salvar. Fechar e reabrir preserva o rascunho e essa pendência. Cadastros com tom incorreto podem ser corrigidos pela seção recolhida ou reimportados. Confira teclado, fonte de 16 px no editor móvel e leitor sem rolagem horizontal.
6. Confira resultado vazio, falha de uma fonte mantendo resultados da outra, timeout, erro de prévia e cancelamento. Fechar a busca, alterar o título e pesquisar novamente não pode reapresentar a resposta da consulta antiga. Conteúdo acima de 100.000 caracteres deve ser recusado; a prévia deve exibir no máximo 12.000, preservando o texto completo da importação aceita.
7. Cancele o formulário ou remova somente as fixtures criadas para esse teste. Não use músicas do proprietário como alvo de substituição.

## Sugestões do YouTube no editor

1. Após importar uma cifra/letra, confira que resultados/prévia fecham e a busca de vídeos ocorre uma vez usando o título/artista presentes no rascunho. A cifra e a referência importadas devem permanecer editáveis; nenhuma opção de vídeo é escolhida automaticamente.
2. Use **Sugerir vídeos** e confira até seis opções com capa, título e canal. **Selecionar** preenche o link; conferir no YouTube e **Salvar música** continuam explícitos. Digitar título ou letra não deve disparar buscas contínuas. Cancelar e respostas atrasadas não devem alterar uma busca mais recente.
3. Valide contrato do endpoint com sessão válida, expirada, pendente e ausente. A aprovação deve ser conferida pelo servidor, sem confiar em metadados enviados pelo navegador. Verifique timeout, limite de frequência, lista vazia, erro de fonte e formato inválido.
4. Sem `YOUTUBE_API_KEY`, teste a fonte pública no runtime real do Netlify; ela pode bloquear ou mudar de formato. Se não houver opções, o formulário deve manter **Abrir busca no YouTube** e permitir colar o link desejado. Resposta controlada em teste não comprova disponibilidade remota.
5. Repita em 320/390 px, confirme que capas são carregadas sob demanda e que escolher um vídeo não muda cifra, tom ou observações. Cancele o rascunho ou remova apenas a música temporária criada pelo teste.

## Desempenho

O reconhecimento de acordes e a conversão de marcadores inline receberam regressões para texto malformado. Com conteúdo próprio temporário, verifique a resposta do editor ao colar cerca de 50 mil caracteres e trocar de tela; repita abrir/fechar editores, leitura, navegação e transposição. Compare memória JavaScript após coleta de lixo e atividade de CPU, separando-as da RAM total dos processos do Chrome. Use uma execução sem screenshots/traces acumulados para a medição.

Na investigação executada, 40 ciclos produziram memória JavaScript de 4,85 para 5,12 MB após coleta, sem atividade contínua de CPU; a colagem malformada de 50.051 caracteres levou aproximadamente 239 ms. Isso não reproduz nem identifica por si só o episódio de 3 GB informado pelo usuário. Registre navegador, cenário, tamanho do conteúdo e medidas ao avaliar qualquer recorrência; não conclua que o consumo total do Chrome equivale a esses valores.

## Importador automático pelo navegador

1. No computador, abra `/conectar-cifra-club`, selecione **Computador**, baixe e extraia o pacote e carregue a pasta como extensão sem compactação no Chrome/Edge. Para atualização, substitua os arquivos da pasta e recarregue a extensão 1.1.1. Atualize o Candeia e confirme **Importador conectado**. Versões sem o suporte de tom/capotraste exigido precisam indicar atualização; o frontend também rejeita **Menu principal** recebido como artista de versões antigas. Chrome de celular não instala essa extensão.
2. Pesquise título/artista, escolha uma versão Cifra Club e use **Ver prévia**. A aba temporária deve abrir, fornecer acordes reais visíveis, fechar e retornar ao editor. Se houver bloqueio no próprio navegador, informe a falha; não conte isso como importação aprovada.
3. Confira título/artista apesar de um cabeçalho de navegação **Menu principal** na página; o leitor deve priorizar metadados e o link do artista. Se não houver artista confiável, complete o campo. Confira tom das posições versus tom sonoro com capotraste. Marque **Ver somente letra na prévia**, confirme a remoção local dos acordes e importe sem tabs/diagramas. Os acordes devem estar realmente no tom da igreja; origem ambígua exige confirmação. Conteúdo anterior exige confirmação de substituição; salvar continua explícito.
4. Cancele uma consulta e confira que a aba temporária é fechada e nenhuma resposta atrasada modifica o rascunho. Uma aba Cifra Club aberta normalmente antes do teste deve continuar intacta. Verifique destino inválido, conteúdo acima de 100.000 caracteres e falha da fonte.
5. Para regressão automatizada, a suíte `tests/cifra-browser.spec.ts` carrega a extensão real com respostas HTTPS simuladas e não faz chamadas externas. O Chrome for Testing oficial instalado no cache `/workspace/scratch/playwright-cifra-browsers` permite esses testes; a política do Chromium gerenciado não é alterada. Esses resultados não comprovam acesso a uma cifra real no navegador do usuário.

## Temáticas de cultos

1. Em uma conta temporária de administrador ou líder, crie um culto usando **Santa Ceia**, **Culto de sábado** ou outro texto próprio em **Tipo de culto**. Não deve ser obrigatório escolher um valor da lista de sugestões.
2. Selecione equipe e várias músicas, salve uma vez e recarregue. Confira temática, ordem e tons; o tipo salvo deve aparecer nas sugestões e no filtro da lista. Editar a temática não deve modificar equipe ou repertório.
3. Campo vazio, somente espaços ou mais de 100 caracteres deve ser recusado. Valores válidos já existentes devem continuar funcionando. Remova apenas o culto temporário criado para esse teste.

## Importação pelo celular

1. Em `/conectar-cifra-club`, selecione **Celular** e o sistema usado. Confira instruções de impressão em 350/390 px e a ação de abrir a biblioteca. O guia não deve recomendar favoritos JavaScript ou Atalhos, retirados após a falha relatada no Chrome/Xiaomi.
2. No **Android**, abra uma cifra no navegador e use **⋮ → Compartilhar → Imprimir → Salvar como PDF**. No **iPhone/iPad**, use **Safari → Compartilhar → Imprimir**, amplie a prévia com dois dedos e escolha **Compartilhar → Salvar em Arquivos**. Os nomes e posições desses menus precisam ser conferidos no aparelho; teste com uma música temporária própria.
3. Como administrador aprovado, abra **Biblioteca → Nova música → Escolher PDF da cifra**. Escolha o PDF e confira título, artista, referência e prévia. Complete metadados ausentes. A leitura deve carregar PDF.js/worker somente nesse momento e não enviar o PDF a um servidor.
4. Confira limpeza de tablaturas/diagramas, alinhamento e colunas. Tom escrito G/capo3/somBb deve manter G como padrão na igreja; somente escolher Bb transpõe G→Bb, com leitura Bb→C correta. Apenas tom sonoro Bb/capo3 deve derivar a base escrita G; escolha prévia de tom na igreja é preservada. Origem confiável precede estimativa; ambiguidade exige confirmação. Importar modifica somente o rascunho e o único campo **Letra e cifra**; **Salvar música** grava. Conteúdo anterior continua exigindo confirmação de substituição.
5. Recuse arquivo acima de 8 MiB, mais de 20 páginas, acima de 100.000 caracteres ou 30.000 itens de texto, inválido, com senha, foto ou PDF digitalizado sem texto selecionável. A leitura deve terminar ou ser interrompida após 25 segundos, sem truncar ou inventar conteúdo. Cancele ou feche o editor durante a leitura e confira liberação dos recursos e ausência de resposta tardia.
6. Músico aprovado não deve receber ações de importação/salvamento; sem login deve ver a entrada. Ao cancelar, nenhum PDF ou música deve ter sido gravado; remova somente a fixture salva pelo teste. Consulta e transposição pelo celular continuam disponíveis para contas aprovadas.
7. Testes automatizados usam arquivos PDF controlados e Chromium com viewport móvel. Não conte isso como teste de menus de impressão Android/Safari físicos. O receptor e códigos do fluxo anterior mantidos por compatibilidade têm regressões próprias; seu histórico de fixtures não comprova funcionamento no aparelho do usuário.
8. Confira leitura real quando `Promise.withResolvers` estiver ausente na página e no worker; ambos precisam da compatibilidade antes de inicializar PDF.js. Os bundles PDF e workers devem ficar fora do precache PWA e carregar somente ao escolher um arquivo. Falha ao iniciar worker deve orientar em português. Repetir leitura/cancelamento deve terminar sem workers remanescentes; uma medição de heap JavaScript não equivale à RAM total do Chrome.

## PDFs em lote e revisão do tom

1. Na biblioteca como administrador, use **Importar PDFs → Escolher PDFs**, mantendo a opção individual **Nova música → Escolher PDF da cifra** disponível. Selecione arquivos diferentes e confira leitura de uma música por PDF, progresso e uma prévia revisável por item; nenhuma gravação durante leitura ou seleção.
2. Confira limites de 20 arquivos, 8 MiB por arquivo e 80 MiB somados, além dos limites internos de cada PDF. Um arquivo inválido deve mostrar seu erro sem inventar uma música. Cancelar leitura deve liberar o worker e manter itens já processados; adicionar arquivos respeita os mesmos limites.
3. Revise título, artista, **Tom dos acordes recebidos**, **Tom na igreja** e conteúdo. Duplicatas de cadastro/conteúdo devem vir desmarcadas; selecioná-las explicitamente cria uma cópia com novo ID, sem alterar a existente. Desmarque itens que não deseja importar.
4. Use **Salvar selecionadas** e confira uma gravação por música selecionada. O lote não é atômico: sucessos ficam **Salva** e não entram em nova tentativa; falhas permanecem revisáveis. Simule resposta perdida após gravar e repita: o mesmo UUID deve impedir a criação de outro item. Interromper salvamento termina a música atual e não inicia as seguintes.
5. Para PDF e Cifra Club, confira base G tanto com tom escrito explícito quanto com apenas tom sonoro Bb/capo3. Padrão da igreja G mantém acordes; igreja escolhida Bb transpõe uma vez. Alterar metadados da fonte não deve sobrescrever uma escolha manual de igreja.
6. Sem tom informado, G/A/D pode sugerir D com confiança alta; G/A/D/Bm/C pode sugerir D com confiança média e C como possível empréstimo. A revisão deve indicar **PROVÁVEL**, permitir editar e não tratar possível acorde emprestado como fato. Candidatos maiores/menores próximos ou conteúdo insuficiente devem exigir confirmação manual, sem escolher pelo primeiro acorde.
7. Confira tabs de introdução/solo removidas e rótulos **[Intro]**/**[Solo]**, versos e acordes preservados. No leitor a 320 px e desktop, acordes instrumentais sem letra devem manter pelo menos 8 px de espaço e transpor corretamente; acordes sobre versos devem continuar alinhados. Nenhuma limpeza de leitura deve regravar cadastros existentes.
8. Músico aprovado não deve receber ação de lote ou salvar; visitantes devem ver a entrada. Remova somente as músicas temporárias criadas para o teste, preservando os dados do ministério. Registre resultados executados em [VALIDACAO.md](VALIDACAO.md), separadamente do roteiro.

## Gráficos

1. Abra `/graficos` como administrador, líder e músico aprovado. Os dados devem corresponder ao planejamento autorizado e a abertura sem login deve mostrar a entrada, sem dados. A consulta de gráficos não deve gravar alterações.
2. Confira **Todos os cultos**, 30/90 dias, ano e datas livres, além do filtro por temática. Os períodos recentes terminam hoje em São Paulo; o histórico completo pode incluir cultos futuros. Inverta as datas para conferir erro compreensível sem números enganosos.
3. Use uma fixture com pessoa em duas funções e música repetida no mesmo culto. Pessoa e música contam uma vez naquele culto; funções contam suas atribuições. Etiquetas sobrepostas podem somar mais de 100%, com nota explicativa. A escala não deve ser descrita como presença confirmada.
4. Confira evolução, rankings com pesquisa/limite, temáticas, horários e equipe/repertório preenchidos. **Ver números do gráfico** deve oferecer os valores em tabela. Totais de cadastro atual não devem mudar ao filtrar o período. Banco vazio e filtro sem resultados devem mostrar estados vazios, sem exemplos inventados.
5. Repita em 350/390 px, com teclado e sem rolagem horizontal. Trocar filtros não deve gravar dados ou alterar cultos.

## Fotos de perfil e integrantes

1. Use contas temporárias e imagens de teste. Em `/perfil`, escolha PNG/JPEG/WebP válido de até 10 MiB, confira recorte/prévia e clique em **Salvar foto**. Escolher e cancelar não devem enviar imagem; após salvar/recarregar, a foto deve permanecer e identificar a conta no cabeçalho.
2. No cadastro de integrante, administrador escolhe foto e salva a pessoa. Músico/líder não devem receber essa edição; visitante deve ver a entrada. Foto da pessoa e foto da conta permanecem armazenadas separadamente; alterar uma não copia nem substitui a outra. Vincule uma conta temporária aprovada à pessoa em **Administração** e confira a prioridade de exibição: equipe/escala usam foto da pessoa, senão foto da conta; perfil/cabeçalho usam selfie própria, senão foto da pessoa vinculada.
3. Confira preparação local para até 512 px e 300 KiB, rejeição de tipo inválido/SVG/arquivo excessivo e remoção confirmada ao salvar. Falha de upload/RPC deve manter o formulário revisável, sem confirmar um salvamento inexistente.
4. No Supabase real autorizado, confira bucket público `avatars` com limite de 2 MiB, upload em `UID/UUID.ext` novo, rejeição de sobrescrita e escrita no UID de outra conta. Arquivo ainda referenciado por pessoa/perfil não pode ser excluído; foto própria não altera papel/aprovação/vínculo.
5. Como conta aprovada, confira fotos na equipe, detalhe do culto e resumo inicial, mantendo a prioridade entre cadastro e conta vinculada. A retirada da consulta sem login não deve ser apresentada como tornar privado o bucket público de imagens.
6. Confirme remoção de contas, pessoas e objetos temporários criados para o teste; preserve imagens e dados do proprietário. Resultados com Auth/Storage simulados e checagem de migração devem ser registrados separadamente do teste real de upload/RLS.
7. Remova somente a foto prioritária da fixture e confira retorno à alternativa, sem alterar a URL armazenada no outro cadastro. Na escala/resumo do culto, confira imagem em desktop e celular, incluindo fallback de iniciais quando nenhuma foto existir.
8. Desvincule ou retire aprovação da conta temporária: a próxima leitura autenticada da equipe não deve receber sua selfie como alternativa. O RPC `read_team_profile_photos()` deve rejeitar visitante e conta não aprovada e retornar somente `personId`/`photoUrl` para acesso aprovado. Após a 006, o RPC público antigo deve permanecer fechado; URLs de imagem podem conter UUIDs no caminho do arquivo.
9. Tente associar a mesma pessoa a outra conta temporária: a opção deve estar indisponível no formulário e o banco deve rejeitar duplicação. O vínculo atual pode ser mantido ou removido. Não altere vínculo, aprovação, foto ou senha do proprietário para verificar esse fluxo.

## Auth e recuperação

Com `SUPABASE_ACCESS_TOKEN` injetado nas configurações seguras e TLS habilitado, a verificação real pode usar o domínio observado:

```sh
LOUVOR_BROWSER_URL=https://louvor-grupo-fxebsy.netlify.app npm run supabase:verify -- --browser
```

O helper cria contas e registros temporários, testa administrador/músico e usa um link de recuperação da conta temporária sem enviar e-mail. O navegador segue `/redefinir-senha`, salva uma senha aleatória e verifica a autenticação. Links, tokens e senhas ficam em memória; não gere screenshots ou traces das sessões de autenticação. Confirme a remoção de todas as contas e fixtures ao terminar. A entrega real de confirmação e recuperação deve ser conferida também com um destinatário autorizado e o SMTP configurado.

Adicione `--song-sources` para verificar também as fontes externas no editor. Esse teste exige disponibilidade real dos provedores: a busca Cifra Club deve retornar versões, o bloqueio de prévia atualmente observado deve preservar o rascunho, e a importação LRCLIB deve alterar somente o formulário antes de cancelar. O teste principal de Auth/RLS não depende dessas fontes. No último teste separado de fontes, LRCLIB respondeu HTTP 503; não conte esse resultado como importação real aprovada.

Neste ambiente, o Chromium precisa abrir o banco NSS da autoridade do proxy em `/home/agent/.pki/nssdb`, conforme o README. Mantenha TLS habilitado e a autoridade fornecida pela plataforma.

## PWA e conexão

Espere a primeira instalação do service worker e recarregue para a página ficar sob seu controle. Confira que o cache contém apenas arquivos estáticos, sem respostas de Auth, PostgREST ou fontes externas. Sem internet, o shell pode abrir, mas uma nova consulta aos dados reais ou às fontes deve informar indisponibilidade; não espere dados fictícios ou sincronização offline. Com uma versão nova disponível, confira o aviso **Atualização disponível** e as ações **Atualizar agora** e **Depois**. A página só deve recarregar após a escolha de atualizar; um rascunho preenchido precisa continuar disponível na mesma aba após o recarregamento. Confira favicon, Apple touch icon e manifest com ícones any/maskable usando a mesma chama da marca; a chama do maskable deve permanecer dentro da área segura. Valide instalação, atualização do ícone e interação por toque em Android/iPhone reais separadamente do Chromium automatizado, sem declarar aparelho físico testado por uma simulação de viewport.
