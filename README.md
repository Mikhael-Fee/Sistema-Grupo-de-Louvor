# Candeia · Ministério de Louvor

Aplicação React + TypeScript + Vite para organizar músicas, pessoas, cultos, escalas e repertórios. Interface em português, responsiva e instalável como PWA, com identidade preto/branco e acentos de chama.

Endereço do site: **[louvor-grupo-fxebsy.netlify.app](https://louvor-grupo-fxebsy.netlify.app)**. O README é este guia de uso e manutenção; a aplicação é acessada pelo link. A versão publicada e os resultados de cada atualização estão registrados em [VALIDACAO.md](docs/VALIDACAO.md). Este checkout inclui consulta real sem cadastro, identidade Candeia, editor único de equipe em lote, rascunhos e pesquisa unificada de cifra e letra.

Código em [Mikhael-Fee/Sistema-Grupo-de-Louvor](https://github.com/Mikhael-Fee/Sistema-Grupo-de-Louvor), branch `main`. O site usa publicação direta no Netlify, sem integração Git; novos commits não atualizam a aplicação automaticamente.

## Acesso

A conta `mikhaelfernandes8@gmail.com` já foi confirmada e aprovada como administrador. Entre com a senha pessoal criada no cadastro. Os próximos integrantes criam e confirmam suas contas; o administrador aprova o acesso e define o papel em **Administração**.

A **consulta sem cadastro** abre os dados reais do ministério em `/consulta` quando o administrador a libera. Visitantes consultam cultos, repertórios, nomes, funções, letras e cifras, e podem transpor a visualização. E-mails, contatos e perfis de conta permanecem privados; criação e edição exigem um perfil autorizado. Em **Administração**, marque **Permitir consulta sem cadastro**, escolha **Salvar acesso público** e use **Copiar link**. Desmarcar e salvar fecha novas consultas ao banco.

A aplicação não oferece demonstração nem instala dados fictícios no ministério. Sem Supabase configurado, orienta a configurar o serviço; exemplos usados nos testes ficam somente em `tests/`.

## Executar

Use Node 24 e npm no checkout existente, sem criar outro worktree:

```sh
npm ci
npm run dev -- --port 5173 --strictPort
```

Configure as duas variáveis públicas do Supabase usando `.env.example`: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. Nunca use uma chave `service_role` ou senha do banco no frontend. Reinicie o Vite após mudar as variáveis. O servidor Vite atende a aplicação; a busca de cifras exige também a função Netlify descrita abaixo.

## Funcionalidades

- Biblioteca com artista, tom na igreja, um único campo editável **Letra e cifra**, vídeo YouTube, observações e etiquetas; pesquisa sem acentos e filtros combinados. A importação converte os acordes para o tom na igreja; mudar esse tom no editor também transpõe o texto.
- Leitura de letra ou cifra, transposição, fonte de 14 a 28 px e modo leitura que ocupa a tela. No celular, os controles de leitura têm área de toque de pelo menos 44 px e os versos se ajustam à largura. Trocar o tom no leitor altera a visualização; salvar o tom no repertório exige uma ação explícita de um perfil autorizado.
- Cultos com data, horário, temática livre no campo **Tipo de culto**, observações, equipe e repertório ordenado; tom e observação próprios por música em cada culto. Digite, por exemplo, **Santa Ceia**, **Culto de sábado** ou **Culto de louvor**; sugestões incluem tipos já usados, sem limitar as opções.
- **Selecionar equipe** ou **Editar equipe** abre o único editor da escala, com seleção de várias pessoas, funções adicionais e seleção dos resultados visíveis. Desmarque para retirar alguém; **Salvar equipe** grava a equipe inteira de uma vez. **Reutilizar última escala** aproveita a escala anterior, respeitando funções válidas e vínculos já existentes.
- Rascunhos de música, pessoa, etiqueta, culto e ajustes guardados em `sessionStorage`, separados por conta e aba. Fechar o editor ou mudar de tela permite retomá-los; **Cancelar** descarta, salvar com sucesso limpa o rascunho e sair da conta limpa os rascunhos daquela conta na aba. Eles não são backup nem sincronização entre dispositivos.
- Supabase Auth com cadastro, confirmação e recuperação de senha; RLS e RPCs protegem os papéis administrador, líder e músico.
- Consulta pública opcional e PWA com cache do shell estático. Dados reais e consultas às fontes exigem conexão; respostas do Supabase não entram no cache do service worker. Uma versão nova oferece **Atualizar agora** ou **Depois**; atualizar recarrega a página por escolha do usuário e preserva seus rascunhos na mesma aba.

## Buscar letra e cifra

Preencha título/artista e use **Pesquisar cifra e letra**. A busca apresenta versões próximas do **Cifra Club** primeiro e letras do **LRCLIB** na mesma lista, identificadas como conteúdo sem acordes. Cada resultado permite abrir a fonte ou conferir **Ver prévia**. Não há campos de pesquisa separados nem uma opção Worship Together no editor atual.

A leitura do Cifra Club pelo servidor continua recebendo HTTP 403. O [importador pelo navegador](https://louvor-grupo-fxebsy.netlify.app/conectar-cifra-club) lê a cifra que abre normalmente no navegador do usuário. No **computador**, instale a extensão uma vez no Chrome/Edge e atualize o Candeia. Quando aparecer **Importador conectado**, **Ver prévia** abre a versão escolhida em uma aba temporária, lê os acordes visíveis e entrega a cifra ao editor sem copiar e colar. A aba criada é fechada ao terminar ou cancelar. Quem já instalou pode baixar a versão **1.1.1**, substituir os arquivos da pasta anterior e clicar em **Recarregar** na extensão; depois, atualizar o Candeia.

No **celular**, abra a aba **Celular** do mesmo guia. No Android, configure uma vez o favorito **Importar para Candeia** com o código fornecido. Depois abra a cifra no Chrome, digite esse nome na barra de endereço e escolha a sugestão do favorito. No iPhone/iPad, crie um atalho com **Executar JavaScript na Página Web** e **Abrir URLs**; execute-o pelo compartilhamento da cifra aberta no Safari. Não é necessário copiar o texto da música a cada importação. Os códigos de instalação estão em `/downloads/candeia-cifra-celular.txt` e `/downloads/candeia-cifra-iphone.js`.

O importador móvel abre `/importar-cifra` com uma prévia. Entre com a conta administradora, escolha **Revisar e salvar na biblioteca**, confira os dados e salve a música. A prévia aguarda na mesma aba durante login ou recarregamento e usa um rascunho separado de uma música nova já em edição; não há gravação automática. Músicos e visitantes continuam apenas consultando as músicas salvas. Faça a importação pelo navegador, pois o aplicativo do Cifra Club e a PWA do Candeia não executam esse leitor.

Os importadores dependem de a cifra abrir normalmente e não contornam bloqueios. Chrome de celular não instala a extensão de computador; o favorito exige um navegador que aceite JavaScript em favoritos. O mecanismo móvel usa navegação com fragmento e foi verificado com páginas de teste em Chromium; o menu nativo de favoritos do Android e o app Atalhos/Safari de aparelhos físicos ainda precisam ser conferidos. LRCLIB oferece importação de letras quando disponível. Veja [VALIDACAO.md](docs/VALIDACAO.md).

A identificação do artista prioriza metadados da música e o link do artista, ignorando títulos de navegação como **Menu principal**. O Candeia também evita usar esse texto quando recebido de uma extensão antiga, preservando o artista da versão escolhida. Se a fonte não fornecer artista confiável, complete o campo antes de salvar.

Quando a prévia puder ser carregada, **Importar cifra e letra** preenche o campo **Letra e cifra**, ajustando os acordes para **Tom na igreja** e guardando a referência da fonte. Resultados LRCLIB preenchem o mesmo campo com a letra disponível. Marcar **Atualizar título e artista com os dados da fonte** já preenche esses dados no formulário. Se o conteúdo ainda estiver vazio, **Salvar música** também importa a prévia selecionada, sem exigir que você digite a letra. Se houver texto anterior, confirme sua substituição na prévia ou mantenha o conteúdo atual; o banco só muda ao salvar. Quando a fonte não informar algum dado obrigatório, complete esse dado antes de salvar.

A cifra passa por uma limpeza de tablaturas de guitarra/violão, diagramas de posições, afinação e instruções de capotraste. Os acordes, versos e indicações como **Intro** e **Refrão** são preservados. Essa limpeza também é aplicada ao ler cifras já cadastradas, sem gravar alterações no banco. A visualização **Somente letra** e a opção **Ver somente letra na prévia** ocultam os acordes do mesmo conteúdo; não existe outro campo de letra.

O editor não pede um **Tom original** separado. Usa o tom dos acordes escritos na fonte para convertê-los ao tom da igreja. Capotraste e tom sonoro aparecem na prévia quando reconhecidos: posições em G com capotraste na 3ª casa soam em Bb; para teclado em Bb, a conversão é de G para Bb uma única vez. Se a fonte não distinguir esses tons, o editor pede **Tom dos acordes recebidos** antes de importar, sem deduzi-lo pelo primeiro acorde. Em um cadastro antigo com o tom indicado errado, abra **Corrigir cifra com tom incorreto**, informe o tom real dos acordes atuais e aplique a correção, ou importe a versão novamente. Confira e salve o rascunho corrigido.

O campo **Letra e cifra** também permite escrever ou colar o texto diretamente. Linhas de acordes são convertidas para marcadores como `[C]`, `[Am7]` e `[G/B]`; ao colar uma cifra sem um tom reconhecido, confirme o tom dos acordes uma vez. A referência do Cifra Club importado fica nas observações e oferece **Abrir Cifra Club** no leitor, também para visitantes. Texto e importação aceitam até 100.000 caracteres; a prévia exibe até 12.000, mantendo o conteúdo completo para importar.

## Supabase e validação

O projeto `fxebsycpbybhzkpnxzoo` já recebeu a migração inicial; não reaplique `001_initial.sql`. As atualizações [002_public_consultation.sql](supabase/migrations/002_public_consultation.sql) e [003_custom_service_types.sql](supabase/migrations/003_custom_service_types.sql) também foram aplicadas. A consulta pública está habilitada conforme a escolha do proprietário; em uma instalação nova, começa desativada. A migração 003 permite temáticas livres, obrigatórias e de até 100 caracteres, preservando cultos, contas e permissões existentes. [SUPABASE.md](docs/SUPABASE.md) explica configuração, permissões, acesso público e manutenção. As verificações executadas e a versão publicada estão em [VALIDACAO.md](docs/VALIDACAO.md).

```sh
npm run typecheck
npm test
npm run test:db
npm run test:e2e
npm run build
npm run preview -- --port 4173 --strictPort
```

Os testes de domínio e navegador cobrem transposição, validações, buscas, importação e rascunhos. Os testes de banco usam PostgreSQL/PGlite com Auth simulado; os testes de navegador podem usar fixtures de serviço controladas. Nenhum deles substitui a integração no Supabase real. Consulte [TESTE-PUBLICO.md](docs/TESTE-PUBLICO.md) para verificar login, consulta sem cadastro, fontes e PWA no domínio final.

`npm run supabase:check` consulta o projeto com `SUPABASE_ACCESS_TOKEN` injetado nas configurações seguras. `npm run supabase:verify` cria contas e registros temporários, verifica Auth/PostgREST/RLS e limpa suas fixtures; não envia e-mails nem cria a conta do proprietário. Com a aplicação iniciada, `npm run supabase:verify -- --browser` inclui a interface real. Execute somente no projeto autorizado.

Playwright usa `/usr/bin/chromium` neste ambiente. Em outro sistema configure `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` ou instale o navegador do Playwright. Para HTTPS externo neste ambiente, o Chromium precisa abrir o banco NSS da autoridade do proxy em `/home/agent/.pki/nssdb`; mantenha TLS e a autoridade fornecida pela plataforma.

## Publicar

O build estático e a função de busca precisam ser publicados juntos. Com `NETLIFY_AUTH_TOKEN` injetado nas configurações seguras e o site selecionado pelo helper:

```sh
npm run build
node scripts/deploy-netlify.mjs --check
node scripts/deploy-netlify.mjs --deploy-dir dist --functions-dir netlify/functions
```

O envio antigo de um ZIP contendo somente `dist` não publica `song-search`; use o modo de diretórios acima nesta versão. O [netlify.toml](netlify.toml) define o build e `public/_redirects`/`public/_headers` seguem para `dist`. Alterar o checkout ou publicar o ambiente Codex não atualiza o site. Veja os [passos de manutenção](docs/SUPABASE.md#netlify). Nunca grave tokens em arquivos ou commits.

O build também empacota os seis arquivos públicos de `browser-extension/candeia-cifraclub` em `/downloads/candeia-cifraclub.zip` e gera os códigos de instalação móvel `.txt`/`.js`. Os três artefatos são ignorados pelo Git, não contêm configuração Supabase e ficam fora do precache da PWA. Para os testes da extensão neste ambiente, instale o navegador oficial de testes com `PLAYWRIGHT_BROWSERS_PATH=/workspace/scratch/playwright-cifra-browsers npx playwright install chromium --no-shell`. A suíte usa esse cache para carregar a extensão em perfil isolado; não altera as políticas do Chromium gerenciado.

No celular, abra o site HTTPS e use **Adicionar à tela inicial** no Safari ou a instalação oferecida pelo navegador Android. Se uma instalação antiga ainda mostrar a versão anterior, feche todas as abas/janelas do site e abra o endereço novamente. Nas versões seguintes, use **Atualizar agora** quando o aviso aparecer ou **Depois** para continuar a edição.

## Organização

`src/pages`: telas; `src/context`: sessão e operações reais; `src/hooks`: rascunhos; `src/lib`: domínio, fontes e adapter Supabase; `netlify/functions`: consulta às cifras públicas; `supabase/migrations`: banco; `tests`: fixtures e testes. Os requisitos e critérios de aceitação estão em [PROJETO.md](docs/PROJETO.md). Medleys, disponibilidade, confirmação, histórico e sincronização offline dos dados seguem no roadmap. Uma instalação atende a um ministério.
