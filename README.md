# Candeia · Ministério de Louvor

Aplicação React + TypeScript + Vite para organizar músicas, pessoas, cultos, escalas e repertórios. Interface em português, responsiva e instalável como PWA, com identidade preto/branco e acentos de chama.

Endereço do site: **[louvor-grupo-fxebsy.netlify.app](https://louvor-grupo-fxebsy.netlify.app)**. O README é este guia de uso e manutenção; a aplicação é acessada pelo link. Esta versão foi publicada no Netlify com a consulta real sem cadastro, identidade Candeia, escala em lote, rascunhos e importação do Cifra Club. Resultados e limites de validação ficam em [VALIDACAO.md](docs/VALIDACAO.md).

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

- Biblioteca com artista, tom original e da igreja, letra/cifra ChordPro, vídeo YouTube, observações e etiquetas; pesquisa sem acentos e filtros combinados.
- Leitura de letra ou cifra, transposição, tamanho de fonte e modo leitura. Trocar o tom altera a visualização; salvar o tom no repertório exige uma ação explícita de um perfil autorizado.
- Cultos com data, horário, observações, equipe e repertório ordenado; tom e observação próprios por música em cada culto.
- **Montar escala em lote** seleciona pessoas e funções; **Reutilizar última escala** aproveita a escala anterior, respeitando funções válidas e vínculos já existentes.
- Rascunhos de música, pessoa, etiqueta, culto e ajustes guardados em `sessionStorage`, separados por conta e aba. Fechar o editor ou mudar de tela permite retomá-los; **Cancelar** descarta, salvar com sucesso limpa o rascunho e sair da conta limpa os rascunhos daquela conta na aba. Eles não são backup nem sincronização entre dispositivos.
- Supabase Auth com cadastro, confirmação e recuperação de senha; RLS e RPCs protegem os papéis administrador, líder e músico.
- Consulta pública opcional e PWA com cache do shell estático. Dados reais e consultas às fontes exigem conexão; respostas do Supabase não entram no cache do service worker. Uma versão nova oferece **Atualizar agora** ou **Depois**; atualizar recarrega a página por escolha do usuário e preserva seus rascunhos na mesma aba.

## Buscar letra e cifra

**Cifra Club** é a fonte principal no editor de música. Preencha título/artista e abra **Consultar no Cifra Club**. Copie a letra e a cifra juntas, cole em **Texto copiado do Cifra Club**, confira a prévia e escolha **Importar texto do Cifra Club**. O editor converte linhas de acordes em ChordPro para permitir a transposição no Candeia. O campo **Link da cifra no Cifra Club** guarda o endereço da versão escolhida nas observações; o leitor oferece **Abrir Cifra Club** também para visitantes.

A importação substitui o conteúdo apenas no rascunho e mostra um aviso se já houver texto. Um cabeçalho `Tom:` reconhecido atualiza **Tom original**; sem esse cabeçalho, o tom original atual é mantido e deve ser conferido com a fonte. **Tom na igreja**, título, artista e demais campos são preservados. Revise e escolha **Salvar música** para gravar. O Candeia não baixa automaticamente o conteúdo do Cifra Club; a consulta externa e a colagem são feitas pelo usuário.

Em **Buscar letra e cifra → Outras fontes**, **Somente letra** consulta automaticamente LRCLIB, que não fornece acordes. **Letra e cifra** consulta páginas públicas em português do Worship Together pela função `netlify/functions/song-search.mjs`. A cobertura depende do catálogo e da disponibilidade da fonte. Abra **Ver prévia** antes de **Importar prévia** ou **Substituir conteúdo pela prévia**. Uma cifra automática precisa de tom original reconhecido; ele atualiza **Tom original**, preservando **Tom na igreja**. Título/artista só mudam se a opção for marcada. A origem fica nas observações e a gravação exige **Salvar música**.

## Supabase e validação

O projeto `fxebsycpbybhzkpnxzoo` já recebeu a migração inicial; não reaplique `001_initial.sql`. A atualização aditiva [002_public_consultation.sql](supabase/migrations/002_public_consultation.sql) também foi aplicada e a consulta pública está habilitada conforme a escolha do proprietário. Em uma instalação nova, essa migração começa com a consulta desativada. [SUPABASE.md](docs/SUPABASE.md) explica configuração, permissões, acesso público e manutenção. O banco e o site foram atualizados; as verificações executadas estão em [VALIDACAO.md](docs/VALIDACAO.md).

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

No celular, abra o site HTTPS e use **Adicionar à tela inicial** no Safari ou a instalação oferecida pelo navegador Android. Se uma instalação antiga ainda mostrar a versão anterior, feche todas as abas/janelas do site e abra o endereço novamente. Nas versões seguintes, use **Atualizar agora** quando o aviso aparecer ou **Depois** para continuar a edição.

## Organização

`src/pages`: telas; `src/context`: sessão e operações reais; `src/hooks`: rascunhos; `src/lib`: domínio, fontes e adapter Supabase; `netlify/functions`: consulta às cifras públicas; `supabase/migrations`: banco; `tests`: fixtures e testes. Os requisitos e critérios de aceitação estão em [PROJETO.md](docs/PROJETO.md). Medleys, disponibilidade, confirmação, histórico e sincronização offline dos dados seguem no roadmap. Uma instalação atende a um ministério.
