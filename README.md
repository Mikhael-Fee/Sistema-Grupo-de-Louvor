# Louvor · Ministério de Louvor

Aplicação React + TypeScript + Vite para organizar a equipe, as músicas e os cultos. Interface em português, responsiva e instalável como PWA. Primeira entrega: MVP 1 e MVP 2 da especificação do proprietário.

Site publicado: **[louvor-grupo-fxebsy.netlify.app](https://louvor-grupo-fxebsy.netlify.app)**. O README é este guia de uso e manutenção; a aplicação é acessada pelo link do site.

Código versionado em [Mikhael-Fee/Sistema-Grupo-de-Louvor](https://github.com/Mikhael-Fee/Sistema-Grupo-de-Louvor), branch `main`. A publicação atual do Netlify usa ZIP; novos commits não atualizam o site automaticamente.

A conta `mikhaelfernandes8@gmail.com` já foi confirmada e aprovada como administrador. Entre com a senha pessoal criada no cadastro. Os próximos integrantes criam e confirmam suas contas; o administrador libera o acesso em **Administração**. A demonstração continua disponível sem conta.

## Executar

Use Node 24 e npm. No checkout existente, sem criar outro worktree:

```sh
npm ci
npm run dev -- --port 5173 --strictPort
```

Clique em **Entrar na demonstração** para experimentar imediatamente. Os exemplos são composições originais, com pessoas fictícias, e ficam no navegador. É possível simular administrador, líder e músico no seletor do cabeçalho. A demonstração não autentica usuários nem envia dados ao Supabase. Para começar sem exemplos em uso real, configure o Supabase: o banco de produção começa vazio.

## Funcionalidades

- Biblioteca: músicas, artista, tom original e da igreja, letra/cifra, vídeo YouTube, observações e várias etiquetas. Pesquisa sem acentos e filtros combinados.
- Leitura: letra ou letra com cifra, transposição por semitom/tom, tamanho de fonte e modo leitura. Conteúdo ChordPro: `[C]Texto [Am]da canção`. A transposição preserva a letra e reconhece extensões e baixos invertidos.
- Cultos: data, horário, tipo e observações; escala com pessoas e funções; repertório ordenado por arraste ou botões, com tom e observação próprios de cada culto.
- Equipe, funções e etiquetas; administração de aprovação, papéis e vínculo de contas.
- Supabase Auth com login, cadastro e recuperação de senha; RLS no banco limita o que cada perfil pode fazer. Cadastros novos aguardam aprovação.
- Netlify SPA e manifest/service worker PWA. Fontes hospedadas junto à aplicação; shell estático disponível offline após uma visita online. Sincronização de dados reais offline fica para outra etapa.

## Conectar Supabase

Consulte [configuração do Supabase, permissões e publicação](docs/SUPABASE.md). A migração fica em [001_initial.sql](supabase/migrations/001_initial.sql). O projeto indicado pelo proprietário tem ID `fxebsycpbybhzkpnxzoo`.

O projeto atual já recebeu a migração, as configurações públicas e as URLs de autenticação do site publicado. Não reaplique a migração inicial. Para preparar outro projeto:

1. Aplique a migração no SQL Editor ou use o helper abaixo com acesso seguro à API de gerenciamento.
2. Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` usando `.env.example` como modelo. São a URL e a chave **pública** anon/publishable. Nunca use senha do banco ou chave `service_role` no frontend.
3. Configure URLs de autenticação e entrega de e-mails. Cadastre e confirme sua primeira conta; aprove o administrador no SQL Editor conforme o guia. Reinicie o Vite após mudar variáveis.

O helper usa `SUPABASE_ACCESS_TOKEN` injetado nas configurações seguras do ambiente, sem valores no código ou na linha de comando. `SUPABASE_PROJECT_REF` pode selecionar outro projeto. Consulte primeiro; a aplicação automática só prossegue se o schema público estiver vazio:

```sh
npm run supabase:check
npm run supabase:setup
npm run supabase:verify
```

O helper preserva `.env.local` existente. Quando cria o arquivo, grava somente as duas configurações públicas. O token de gerenciamento é usado somente pela ferramenta de setup, nunca pela aplicação. O modo demo segue disponível mesmo com Supabase configurado.

`supabase:verify` cria três contas temporárias confirmadas e dados identificados de teste, verifica Auth/PostgREST/RLS e remove tudo ao terminar. Não envia e-mails nem cria a conta do proprietário. Com o Vite já iniciado, `npm run supabase:verify -- --browser` também testa login, leitura e recuperação de senha pela interface real. Para o domínio publicado, siga [TESTE-PUBLICO.md](docs/TESTE-PUBLICO.md). Execute somente em um projeto que você controla e com acesso de gerenciamento injetado de forma segura.

Neste ambiente, o teste de navegador com acesso externo precisa conseguir abrir o banco NSS de certificados em `/home/agent/.pki/nssdb`. A sandbox padrão deixa esse diretório somente para leitura e pode provocar `ERR_CERT_AUTHORITY_INVALID`. Execute a verificação com a permissão de filesystem adequada; mantenha a autoridade do proxy fornecida pela plataforma e a verificação TLS. Os testes locais da demonstração não precisam desse acesso.

## Validar

```sh
npm run typecheck
npm test
npm run test:db
npm run test:e2e
npm run build
npm run preview -- --port 4173 --strictPort
```

Testes de domínio cobrem transposição, busca, validações e integridade dos exemplos. `test:db` executa a migração em PostgreSQL/PGlite com uma simulação de `auth.users` e `auth.uid()`, verificando RLS e transações. Não substitui um teste no Supabase real. Playwright usa `/usr/bin/chromium` neste ambiente; em outro sistema configure `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` ou instale o Chromium do Playwright com `npx playwright install chromium`.

Os testes E2E cobrem cadastros, persistência local, filtros, transposição, escalas, ordem/tom/observações por culto, permissões da interface e largura de 390 px. A integração real com Auth, e-mails e PostgREST depende do projeto Supabase configurado.

## Publicar

O site foi publicado diretamente no Netlify com um ZIP do build, sem integração Git. O [netlify.toml](netlify.toml) define o build; os arquivos em `public/_redirects` e `public/_headers` também levam as regras de SPA e os headers ao ZIP. Alterar arquivos no checkout ou publicar o ambiente Codex não atualiza o site automaticamente.

Para atualizar o site, gere um novo build com as duas variáveis públicas do Supabase e publique o ZIP revisado usando [scripts/deploy-netlify.mjs](scripts/deploy-netlify.mjs). O helper requer `NETLIFY_AUTH_TOKEN` nas configurações seguras do ambiente; nunca grave o token em arquivos. Os [passos de manutenção](docs/SUPABASE.md#netlify) incluem build, criação do ZIP e envio ao mesmo site. A integração com GitHub pode ser configurada posteriormente para automatizar novos builds.

Para instalar no celular, abra o site HTTPS e use “Adicionar à tela inicial” no Safari ou a opção de instalação no navegador Android. Recursos e limites dos planos gratuitos podem mudar; confira os painéis dos serviços.

## Organização e próximos passos

`src/pages`: telas; `src/context`: sessão e operações; `src/lib`: domínio, exemplos, validação e adapter Supabase; `supabase/migrations`: banco; `tests`: navegador e banco. Os requisitos, fluxos, wireframes, modelo, permissões e critérios de aceitação estão em [PROJETO.md](docs/PROJETO.md).

Medleys, disponibilidade, confirmação, histórico, sugestões e sincronização offline são evoluções previstas. O MVP atende a um único ministério por projeto Supabase.
