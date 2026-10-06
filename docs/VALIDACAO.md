# Validação da primeira entrega — 06/10/2026

## Resultados executados

| Verificação | Resultado |
| --- | --- |
| Instalação limpa `npm ci` com lockfile | Passou |
| TypeScript e build Vite/PWA | Passaram |
| Testes de domínio Vitest | 37 passaram |
| RLS, permissões, transações e integridade PostgreSQL/PGlite | 98 verificações passaram |
| Concorrência PostgreSQL 17 real | 4 cenários passaram |
| Playwright, demonstração desktop e celular 390 px | 6 cenários passaram |
| Supabase real no domínio público: Auth, PostgREST, RLS, interface admin/músico e recuperação de senha | 34 verificações passaram |
| Manifest, service worker e leitura/transposição demo sem internet | Passaram |
| Site público: celular 390 px, manifest, cache estático e demo offline | 8 verificações passaram |
| Auditoria das dependências de produção | Nenhuma vulnerabilidade reportada |
| Publicação Netlify por ZIP | API confirmou deploy `ready` em `https://louvor-grupo-fxebsy.netlify.app` |

No Supabase `fxebsycpbybhzkpnxzoo`, o projeto respondeu como ACTIVE_HEALTHY e o schema public estava vazio antes da migração. A migração inicial foi aplicada uma vez: oito tabelas com RLS, triggers e funções transacionais. As contas e fixtures da validação real foram removidas e a limpeza foi confirmada. O banco não recebeu os dados da demonstração; a validação automatizada não criou a conta do proprietário.

O primeiro teste de browser externo falhou por `ERR_CERT_AUTHORITY_INVALID`; o diagnóstico confirmou que a sandbox impedia o Chromium de abrir o banco NSS já contendo a autoridade do proxy. Com a permissão de filesystem necessária, health HTTPS e login real passaram. TLS, assinaturas e verificações permaneceram habilitados.

`install_script` e `start_skill` foram salvos no ambiente, com as variáveis públicas de Supabase e os domínios necessários. O proprietário publicou a configuração do ambiente Codex. A chave pública anon foi verificada como papel `anon`; token de gerenciamento e senha do banco não foram gravados em arquivos do projeto. `SUPABASE_ACCESS_TOKEN` é usado apenas nos helpers administrativos, não pelo app, build ou demonstração.

O site Netlify foi publicado separadamente por ZIP, sem integração Git, com ID `93f0134d-7c6f-414a-b86a-1c4c9bdcb477`. A API confirmou o deploy como `ready`. O artefato contém a URL e a chave pública anon do Supabase; o token de gerenciamento não aparece no bundle, e nenhum `.env` ou source map foi incluído. HTTPS, rotas diretas SPA e headers foram verificados no domínio público; o manifest responde como `application/manifest+json`. Site URL e cinco regras de redirecionamento foram configuradas e conferidas por leitura posterior, preservando confirmação e demais opções de Auth.

A conta proprietária `mikhaelfernandes8@gmail.com` foi criada e confirmada pelo usuário; o perfil correspondente foi aprovado como `admin`. O usuário confirmou o primeiro acesso. A recuperação foi testada com uma conta temporária: callback público, formulário, autenticação com senha nova e rejeição da anterior. As fixtures foram removidas e a conta proprietária foi preservada.

## Etapas externas pendentes

- Versionar/enviar o código ao GitHub e, se desejado, integrar builds automáticos ao site Netlify; o CI está preparado, mas não foi executado no GitHub.
- Configurar SMTP próprio para confirmações e recuperação dos demais integrantes; o serviço padrão tem restrições de destinatários. O proprietário recebeu e confirmou sua mensagem, mas entrega para outros endereços não foi testada.
- Validar a instalação PWA em Android/iPhone reais; a validação desta entrega usou Chromium automatizado.

Medleys, disponibilidade, confirmações, estatísticas e sincronização offline de dados compartilhados continuam no roadmap. O offline verificado nesta entrega é o shell estático e a demonstração local.
