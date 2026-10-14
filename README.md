# Candeia · Ministério de Louvor

Aplicação React + TypeScript + Vite para organizar músicas, pessoas, cultos, escalas e repertórios. Interface em português, responsiva e instalável como PWA, com identidade preto/branco e acentos de chama.

Endereço existente do site: **[louvor-grupo-fxebsy.netlify.app](https://louvor-grupo-fxebsy.netlify.app)**. O README descreve o código deste checkout; a versão efetivamente publicada e suas verificações estão em [VALIDACAO.md](docs/VALIDACAO.md).

A atualização de 14/10/2026 está publicada no mesmo endereço, com deploy `6acfb79bdbdd1aa89fbe41af` confirmado `ready`. Inclui calendário de cultos, destaque de eventos, músicas por etiqueta, sugestões de vídeos e uma versão YouTube própria por música no culto. O ministério agora exige login e aprovação, a barra lateral de rolagem fica oculta e os ícones de instalação usam a mesma chama da marca. A migração 006 foi aplicada e reinspecionada no Supabase existente, preservando os valores das colunas anteriores; veja as verificações e seus limites em [VALIDACAO.md](docs/VALIDACAO.md).

Código em [Mikhael-Fee/Sistema-Grupo-de-Louvor](https://github.com/Mikhael-Fee/Sistema-Grupo-de-Louvor), branch `main`. O site usa publicação direta no Netlify, sem integração Git; novos commits não atualizam a aplicação automaticamente.

## Acesso

A conta `mikhaelfernandes8@gmail.com` já foi confirmada e aprovada como administrador. Entre com a senha pessoal criada no cadastro. Os próximos integrantes criam e confirmam suas contas; o administrador aprova o acesso e define o papel em **Administração**.

Os dados do ministério exigem uma conta confirmada e aprovada. O botão de entrar sem cadastro e a configuração de consulta pública foram removidos; o antigo endereço `/consulta` redireciona para o início/login. Contas pendentes continuam vendo a espera pela aprovação. Cadastro e recuperação de senha permanecem disponíveis; uma sessão autenticada existente continua usando a mesma conta e os mesmos rascunhos. A migração 006 fecha também os RPCs antigos de consulta pública no banco, inclusive para instalações antigas do aplicativo.

A aplicação não oferece demonstração nem instala dados fictícios no ministério. Sem Supabase configurado, orienta a configurar o serviço; exemplos usados nos testes ficam somente em `tests/`.

## Executar

Use Node 24 e npm no checkout existente, sem criar outro worktree:

```sh
npm ci
npm run dev -- --port 5173 --strictPort
```

Configure as duas variáveis públicas do Supabase usando `.env.example`: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. Nunca use uma chave `service_role` ou senha do banco no frontend. Reinicie o Vite após mudar as variáveis. O servidor Vite atende a aplicação; buscas de cifras e sugestões de vídeos exigem também as funções Netlify descritas abaixo.

## Funcionalidades

- Início com próximo culto, equipe e repertório: as fotos seguem a mesma prioridade da equipe/escala, com iniciais quando não há imagem. A primeira linha preenchida da observação de cada música naquele culto aparece como **Obs.:** abaixo do artista; a linha completa fica disponível no título do texto.
- Biblioteca com artista, tom na igreja, um único campo editável **Letra e cifra**, vídeo YouTube, observações e etiquetas; pesquisa sem acentos e filtros combinados. A importação converte os acordes para o tom na igreja; mudar esse tom no editor também transpõe o texto.
- Leitura de letra ou cifra, transposição, fonte de 14 a 28 px e modo leitura que ocupa a tela. No celular, os controles de leitura têm área de toque de pelo menos 44 px e os versos se ajustam à largura. Trocar o tom no leitor altera a visualização; salvar o tom no repertório exige uma ação explícita de um perfil autorizado.
- **Cultos** abre o calendário mensal como visualização principal, com navegação entre meses e **Hoje**. Dias marcados abrem o culto, seu repertório e sua escala; se houver vários encontros no dia, escolha qual abrir. Administradores podem tocar em um dia livre para criar um culto com a data preenchida. A opção **Cards** mantém a visualização anterior e os filtros **Próximos**, **Anteriores** e **Todos**; os dias ocupados fora do filtro continuam identificados no calendário.
- Cultos com data, horário, temática livre no campo **Tipo de culto**, observações, equipe e repertório ordenado; tom, observação e vídeo próprios por música em cada culto. Marque **É um evento** para usar um destaque diferente no calendário e nos cards. Digite, por exemplo, **Santa Ceia**, **Culto de sábado** ou **Culto de louvor**; sugestões incluem tipos já usados, sem limitar as opções.
- Em **Etiquetas**, clique no card de uma etiqueta para abrir a biblioteca filtrada com suas músicas. A edição e a exclusão da etiqueta continuam em ações separadas.
- No repertório, **Editar tom e observação** também permite informar **Vídeo do YouTube neste culto**. O card exibe a capa da versão indicada e abre o YouTube ao clicar, sem iniciar reprodução no site. Sem esse link, usa o vídeo da biblioteca; mudar a versão do culto não altera o cadastro da música.
- **Gráficos** em `/graficos` mostram evolução dos cultos, pessoas escaladas, repertórios, temáticas, funções, etiquetas e horários. Filtre por 30/90 dias, ano, todo o histórico, datas ou temática. Uma pessoa e uma música contam uma vez por culto; funções adicionais contam como atribuições. Esses números mostram planejamento cadastrado, não presença confirmada.
- **Meu perfil** em `/perfil` permite escolher ou remover sua foto e confirmar **Salvar foto**. O administrador também define fotos dos integrantes em **Equipe** e vincula a conta à pessoa em **Administração**. Equipe e escala usam primeiro a foto da pessoa; se faltar, exibem a foto da conta aprovada vinculada. Perfil/cabeçalho usam primeiro a foto da própria conta e, se faltar, a foto da pessoa vinculada. Os arquivos continuam separados, sem copiar fotos; desfazer o vínculo ou a aprovação retira a alternativa da conta na próxima leitura. PNG, JPEG e WebP de até 10 MB são preparados localmente para até 512 px e 300 KB, com envio somente ao salvar; as imagens salvas são públicas.
- **Selecionar equipe** ou **Editar equipe** abre o único editor da escala, com seleção de várias pessoas, funções adicionais e seleção dos resultados visíveis. Desmarque para retirar alguém; **Salvar equipe** grava a equipe inteira de uma vez. **Reutilizar última escala** aproveita a escala anterior, respeitando funções válidas e vínculos já existentes.
- Rascunhos de música, pessoa, etiqueta, culto e ajustes guardados em `sessionStorage`, separados por conta e aba. Fechar o editor ou mudar de tela permite retomá-los; **Cancelar** descarta, salvar com sucesso limpa o rascunho e sair da conta limpa os rascunhos daquela conta na aba. Eles não são backup nem sincronização entre dispositivos.
- Supabase Auth com cadastro, confirmação e recuperação de senha; RLS e RPCs protegem os papéis administrador, líder e músico.
- Acesso por conta aprovada e PWA com cache do shell estático. Dados reais e consultas às fontes exigem conexão; respostas do Supabase não entram no cache do service worker. Uma versão nova oferece **Atualizar agora** ou **Depois**; atualizar recarrega a página por escolha do usuário e preserva seus rascunhos na mesma aba.

## Buscar letra e cifra

Preencha título/artista e use **Pesquisar cifra e letra**. A busca apresenta versões próximas do **Cifra Club** primeiro e letras do **LRCLIB** na mesma lista, identificadas como conteúdo sem acordes. Cada resultado permite abrir a fonte ou conferir **Ver prévia**. Não há campos de pesquisa separados nem uma opção Worship Together no editor atual.

A leitura do Cifra Club pelo servidor continua recebendo HTTP 403. O [importador pelo navegador](https://louvor-grupo-fxebsy.netlify.app/conectar-cifra-club) lê a cifra que abre normalmente no navegador do usuário. No **computador**, instale a extensão uma vez no Chrome/Edge e atualize o Candeia. Quando aparecer **Importador conectado**, **Ver prévia** abre a versão escolhida em uma aba temporária, lê os acordes visíveis e entrega a cifra ao editor sem copiar e colar. A aba criada é fechada ao terminar ou cancelar. Quem já instalou pode baixar a versão **1.1.1**, substituir os arquivos da pasta anterior e clicar em **Recarregar** na extensão; depois, atualizar o Candeia.

No **celular**, abra a cifra normalmente no Cifra Club e use **Imprimir → Salvar como PDF**. No Chrome do Android, essa opção costuma estar em **⋮ → Compartilhar → Imprimir**; escolha **Salvar como PDF** como impressora. No Safari do iPhone, use **Compartilhar → Imprimir**, amplie a prévia com dois dedos e escolha **Compartilhar → Salvar em Arquivos**. O guia mostra os passos em sua aba **Celular**.

No Candeia, entre como administrador e abra **Biblioteca → Nova música → Escolher PDF da cifra**. Escolha o arquivo, confira título, artista, acordes e tom na prévia, importe e salve. O programa extrai o texto do PDF e preenche o mesmo campo editável **Letra e cifra**; não é preciso copiar a música manualmente. Se o PDF não informar título, artista ou tom de forma confiável, complete ou confirme esses dados na revisão. A referência Cifra Club é guardada quando o PDF contém seu endereço.

Para várias músicas, use **Importar PDFs** na biblioteca e **Escolher PDFs**. Escolha até 20 arquivos, com até 8 MB por PDF e 80 MB no total; cada arquivo deve conter uma música. O programa lê um PDF por vez, mostra o progresso e permite revisar cada música antes de **Salvar selecionadas**. Essa opção é independente da importação de um arquivo em **Nova música** e não grava músicas durante a leitura. Possíveis duplicadas vêm desmarcadas; incluí-las cria uma cópia, sem substituir o cadastro existente. O salvamento é por música: sucessos ficam marcados como salvos, e falhas continuam disponíveis para corrigir ou tentar novamente.

Use um PDF com texto selecionável, de até 8 MB e 20 páginas. A leitura ocorre no próprio navegador, com limites de 100.000 caracteres, 30.000 itens de texto e 25 segundos; o arquivo PDF não é enviado ao Supabase nem armazenado no site. Fotos e PDFs digitalizados exigiriam OCR, que não está disponível. Somente salvar grava o texto revisado no banco. O guia de favorito JavaScript/Atalhos foi retirado após a falha relatada no Chrome/Xiaomi; os artefatos e receptor antigos permanecem apenas por compatibilidade, sem recomendação de uso.

A cifra precisa abrir normalmente no navegador; o servidor continua recebendo HTTP 403 e o Chrome de celular não instala a extensão de computador. O PDF oferece uma transferência explícita por arquivo, usando os recursos de impressão do navegador. Testes com PDF e layout móvel não substituem a conferência do menu de impressão em cada aparelho. LRCLIB oferece importação de letras quando disponível. Veja [VALIDACAO.md](docs/VALIDACAO.md).

A identificação do artista prioriza metadados da música e o link do artista, ignorando títulos de navegação como **Menu principal**. O Candeia também evita usar esse texto quando recebido de uma extensão antiga, preservando o artista da versão escolhida. Se a fonte não fornecer artista confiável, complete o campo antes de salvar.

Quando a prévia puder ser carregada, **Importar cifra e letra** preenche o campo **Letra e cifra**, ajustando os acordes para **Tom na igreja** e guardando a referência da fonte. Ao importar, a lista de resultados e a prévia fecham automaticamente, mantendo o conteúdo editável. Uma busca de sugestões do YouTube é iniciada após a importação; ela não seleciona nem salva um vídeo sem sua escolha. Resultados LRCLIB preenchem o mesmo campo com a letra disponível. Marcar **Atualizar título e artista com os dados da fonte** já preenche esses dados no formulário. Se o conteúdo ainda estiver vazio, **Salvar música** também importa a prévia selecionada, sem exigir que você digite a letra. Se houver texto anterior, confirme sua substituição na prévia ou mantenha o conteúdo atual; o banco só muda ao salvar. Quando a fonte não informar algum dado obrigatório, complete esse dado antes de salvar.

A cifra passa por uma limpeza de tablaturas de guitarra/violão, diagramas de posições, afinação e instruções de capotraste, incluindo tabs de introdução e solo. Os acordes, versos e indicações como **Intro**, **Solo** e **Refrão** são preservados. No leitor, linhas instrumentais de acordes sem letra têm espaço entre acordes; o alinhamento dos acordes sobre os versos continua. Essa limpeza também é aplicada ao ler cifras já cadastradas, sem gravar alterações no banco. A visualização **Somente letra** e a opção **Ver somente letra na prévia** ocultam os acordes do mesmo conteúdo; não existe outro campo de letra.

O editor não pede um **Tom original** separado. PDF e Cifra Club priorizam o tom dos acordes escritos informado pela fonte. Se ela informar somente o tom sonoro e a casa do capotraste, o programa subtrai esse intervalo: **Bb com capotraste na 3ª casa corresponde a posições em G**. Nesse caso, o tom inicial na igreja fica **G**, preservando os acordes recebidos; escolher **Bb** transpõe G→Bb uma vez. Um tom na igreja que você já escolheu é preservado, e o capotraste não é somado novamente.

Sem um tom confiável da fonte, o programa analisa o conjunto e a sequência dos acordes. Uma estimativa com confiança alta ou média pode preencher o tom com aviso **PROVÁVEL**, que você pode revisar ou editar; estimativa ambígua exige confirmação manual. Por exemplo, G/A/D pode sugerir D, e G/A/D/Bm/C pode sugerir D com C como possível acorde emprestado. Isso não prova o tom nem se baseia somente no primeiro acorde; músicas podem alternar tonalidade ou usar acordes fora da escala. Em um cadastro antigo com o tom indicado errado, abra **Corrigir cifra com tom incorreto**, informe o tom real dos acordes atuais e aplique a correção, ou importe a versão novamente. Confira e salve o rascunho corrigido.

O campo **Letra e cifra** também permite escrever ou colar o texto diretamente. Linhas de acordes são convertidas para marcadores como `[C]`, `[Am7]` e `[G/B]`; ao colar uma cifra sem um tom reconhecido, confirme o tom dos acordes uma vez. A referência do Cifra Club importado fica nas observações e oferece **Abrir Cifra Club** no leitor para as contas aprovadas. Texto e importação aceitam até 100.000 caracteres; a prévia exibe até 12.000, mantendo o conteúdo completo para importar.

## Vídeos do YouTube

No editor de música, **Sugerir vídeos** pesquisa pelo título/artista e apresenta até seis opções com capa, título e canal. **Selecionar** preenche o campo opcional **Vídeo no YouTube**; conferir a versão e salvar continuam explícitos. A busca também é solicitada uma vez após importar uma cifra ou letra, sem executar a cada tecla digitada. É possível cancelar, pesquisar novamente ou colar diretamente um link HTTPS de vídeo.

A função `/.netlify/functions/youtube-search` exige uma sessão Supabase válida e um perfil aprovado, conferidos no servidor. Ela precisa da URL e da chave pública do mesmo projeto no ambiente de execução do Netlify (`SUPABASE_URL`/`SUPABASE_ANON_KEY` ou suas equivalentes públicas `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`). Sem `YOUTUBE_API_KEY`, tenta ler os metadados públicos da busca do YouTube, que podem estar indisponíveis ou mudar de formato. Uma chave da YouTube Data API pode ser configurada somente no servidor como opção de manutenção, sem variável `VITE_*`. Falhas preservam o formulário e oferecem **Abrir busca no YouTube**, permitindo escolher a versão e colar seu link. A disponibilidade real da fonte no Netlify não é garantida pelos testes controlados.

## Supabase e validação

O projeto `fxebsycpbybhzkpnxzoo` já recebeu as migrações 001 a 005 na versão anterior. **Não reaplique `001_initial.sql` nem reinstale dados de demonstração sobre o ministério existente.** [SUPABASE.md](docs/SUPABASE.md) descreve as permissões e a manutenção.

Esta atualização usa [006_calendar_videos_private_access.sql](supabase/migrations/006_calendar_videos_private_access.sql), somente após a 005: acrescenta `services.is_event` e `repertoire.youtube_url`, atualiza o salvamento transacional e desativa os RPCs de consulta sem login. Cultos antigos começam como não eventos, sem substituir datas, repertórios, escalas, músicas, fotos, vínculos ou contas. Clientes antigos que omitem os novos campos preservam os valores já salvos desses campos. O helper `node scripts/configure-calendar-videos.mjs` faz inspeção; `--apply` instala somente a 006 ausente e compara os valores das colunas existentes na mesma transação. **A 006 já foi aplicada no projeto real e a reinspeção confirmou `schema_changed: false`.** As quantidades e os hashes dos valores anteriores foram preservados; não reaplique migrações anteriores para instalar esta atualização. Os helpers históricos de consulta pública não devem ser usados com `--enable` nem para restaurar o acesso público.

```sh
npm run typecheck
npm test
npm run test:db
npm run test:e2e
npm run build
npm run preview -- --port 4173 --strictPort
```

Os testes de domínio e navegador cobrem transposição, validações, buscas, importação e rascunhos. Os testes de banco usam PostgreSQL/PGlite com Auth simulado; os testes de navegador podem usar fixtures de serviço controladas. Nenhum deles substitui a integração no Supabase real. Consulte [TESTE-PUBLICO.md](docs/TESTE-PUBLICO.md) para verificar login/aprovação, calendário, vídeos, fontes e PWA no domínio final.

`npm run supabase:check` consulta o projeto com `SUPABASE_ACCESS_TOKEN` injetado nas configurações seguras. `npm run supabase:verify` cria contas e registros temporários, verifica Auth/PostgREST/RLS e limpa suas fixtures; não envia e-mails nem cria a conta do proprietário. Com a aplicação iniciada, `npm run supabase:verify -- --browser` inclui a interface real. Execute somente no projeto autorizado.

Playwright usa `/usr/bin/chromium` neste ambiente. Em outro sistema configure `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` ou instale o navegador do Playwright. Para HTTPS externo neste ambiente, o Chromium precisa abrir o banco NSS da autoridade do proxy em `/home/agent/.pki/nssdb`; mantenha TLS e a autoridade fornecida pela plataforma.

## Publicar

O build estático e as funções `song-search` e `youtube-search` precisam ser publicados juntos. A migração 006 já está aplicada no projeto atual; em outra instalação autorizada, aplique-a e verifique-a antes de publicar este frontend. Com `NETLIFY_AUTH_TOKEN` injetado nas configurações seguras e o site selecionado pelo helper:

```sh
npm run build
node scripts/configure-netlify-video-env.mjs
node scripts/deploy-netlify.mjs --check
node scripts/deploy-netlify.mjs --deploy-dir dist --functions-dir netlify/functions
```

O helper `node scripts/configure-netlify-video-env.mjs` confere as duas variáveis públicas do projeto no runtime/build do site existente; `--apply` instala somente esses valores quando necessário, preservando outras variáveis. Essa configuração já foi aplicada nesta rodada e não publica tokens administrativos. Para comandos futuros, use tokens válidos injetados nas configurações seguras; uma credencial temporária desta sessão não é configuração persistente do ambiente.

O envio antigo de um ZIP contendo somente `dist` não publica as funções; use o modo de diretórios acima nesta versão. O [netlify.toml](netlify.toml) define o build e `public/_redirects`/`public/_headers` seguem para `dist`. Alterar o checkout ou publicar o ambiente Codex não atualiza o site. Veja os [passos de manutenção](docs/SUPABASE.md#netlify). Nunca grave tokens em arquivos ou commits.

O build também empacota os seis arquivos públicos de `browser-extension/candeia-cifraclub` em `/downloads/candeia-cifraclub.zip`. O ZIP e os códigos móveis antigos mantidos por compatibilidade são ignorados pelo Git, não contêm configuração Supabase e ficam fora do precache da PWA. O leitor PDF.js e seus workers também ficam fora desse precache e são carregados somente ao escolher um PDF. A leitura aplica compatibilidade de `Promise.withResolvers` na página e no worker; o Vite pré-otimiza esses módulos para evitar um recarregamento de desenvolvimento durante a importação. Para os testes da extensão neste ambiente, instale o navegador oficial de testes com `PLAYWRIGHT_BROWSERS_PATH=/workspace/scratch/playwright-cifra-browsers npx playwright install chromium --no-shell`. A suíte usa esse cache para carregar a extensão em perfil isolado; não altera as políticas do Chromium gerenciado.

O favicon e os ícones 192/512, maskable 512 e Apple 180 usam o mesmo contorno de chama laranja da marca. A barra da sidebar fica oculta, preservando rolagem por mouse, toque e teclado. No celular, abra o site HTTPS e use **Adicionar à tela inicial** no Safari ou a instalação oferecida pelo navegador Android. Se uma instalação antiga ainda mostrar a versão anterior, feche todas as abas/janelas do site e abra o endereço novamente. Nas versões seguintes, use **Atualizar agora** quando o aviso aparecer ou **Depois** para continuar a edição.

## Organização

`src/pages`: telas; `src/context`: sessão e operações reais; `src/hooks`: rascunhos; `src/lib`: domínio, fontes, PDF, gráficos, fotos e adapter Supabase; `netlify/functions`: consultas às fontes de cifras e vídeos; `supabase/migrations`: banco; `tests`: fixtures e testes. Os requisitos e critérios de aceitação estão em [PROJETO.md](docs/PROJETO.md). Medleys, disponibilidade, confirmação, histórico de alterações e sincronização offline dos dados seguem no roadmap. Uma instalação atende a um ministério.
