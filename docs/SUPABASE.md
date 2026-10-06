# Supabase e publicação

O aplicativo usa uma instalação dedicada a um único ministério. O modo de demonstração é local e separado do Supabase; não cria contas nem envia as músicas de exemplo para o banco real.

Site publicado: [https://louvor-grupo-fxebsy.netlify.app](https://louvor-grupo-fxebsy.netlify.app). O projeto Supabase desta instalação é `fxebsycpbybhzkpnxzoo`; sua migração inicial já foi aplicada e as URLs de Auth foram configuradas e verificadas. A conta `mikhaelfernandes8@gmail.com` foi confirmada pelo proprietário e aprovada como administrador. Nenhum SQL ou comando deste guia é necessário para usar a instalação atual; os passos também documentam como preparar outra instalação.

## Preparar o projeto

1. Crie um projeto Supabase sob sua conta e guarde as credenciais em um gerenciador seguro. Use o SQL Editor do próprio projeto para executar uma vez [001_initial.sql](../supabase/migrations/001_initial.sql). A migração cria tabelas, índices, validações, RLS, funções transacionais e o gatilho de cadastro. Não execute novamente sobre tabelas existentes; futuras mudanças devem usar novas migrações.
2. Em **Authentication → Providers → Email**, habilite e-mail/senha e mantenha a confirmação de e-mail ativada. Cadastros iniciam como `musician`, com `approved = false`, independentemente dos metadados enviados pelo usuário. A confirmação do e-mail permite autenticar; a aprovação administrativa permite ler os dados do ministério. São passos distintos.
3. Em **Project Settings → API** (ou **Connect**), obtenha a URL pública e a chave pública `anon`/publishable. Crie `.env.local` na raiz do checkout, usando o formato de `.env.example`:

   ```dotenv
   VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
   VITE_SUPABASE_ANON_KEY=SUA-CHAVE-PUBLICA
   ```

   Somente essas duas credenciais públicas entram no front-end. A senha PostgreSQL, `service_role` e chaves secretas nunca devem aparecer em variáveis `VITE_*`, código, commits, instruções salvas ou mensagens. O cliente existe apenas quando as duas variáveis públicas estão preenchidas. Reinicie o Vite depois de alterá-las.
4. Em **Authentication → URL Configuration**, a configuração desta instalação deve usar **Site URL** `https://louvor-grupo-fxebsy.netlify.app` e incluir em **Redirect URLs** `http://localhost:5173/**`, `http://localhost:4173/**` e `https://louvor-grupo-fxebsy.netlify.app/**`. Inclua o domínio próprio se houver. Só autorize endereços que você controla. Ambientes de preview exigem URLs permitidas específicas e uma política consciente para o acesso aos dados reais.
5. Crie sua primeira conta pela aplicação, usando seu e-mail e uma senha pessoal, e confirme o e-mail recebido. Em produção, configure SMTP próprio no Supabase para entregar confirmação e recuperação aos integrantes. O serviço de e-mail padrão do Supabase tem restrições de destinatários e limites que devem ser conferidos no painel atual.

## Primeiro administrador e novos integrantes

Nesta instalação, o primeiro acesso já foi concluído. Entre com `mikhaelfernandes8@gmail.com` e sua senha pessoal. Para os próximos integrantes, use a tela **Administração** para aprovar e definir o papel.

Para preparar o primeiro administrador em outra instalação:

1. Abra [o site publicado](https://louvor-grupo-fxebsy.netlify.app) e escolha **Criar conta**.
2. Preencha seu nome, `mikhaelfernandes8@gmail.com` e uma senha pessoal com pelo menos oito caracteres; envie em **Criar minha conta**. Não compartilhe a senha por chat ou nos arquivos do projeto.
3. Abra a mensagem do Supabase e confirme o e-mail. Se a conta já foi cadastrada, conclua sua confirmação antes da promoção. Entrar na demonstração não cria essa conta.
4. Depois da confirmação, aprove o primeiro administrador pelo SQL Editor do projeto. O SQL abaixo exige confirmação e não altera uma conta não confirmada.

Esse procedimento usa a sessão administrativa do painel, sem incluir chaves privilegiadas na aplicação. Em outra instalação, substitua somente o e-mail pelo da conta proprietária já cadastrada e confirmada:

```sql
update public.profiles
set role = 'admin', approved = true
where id = (
  select id from auth.users
  where lower(email) = lower('mikhaelfernandes8@gmail.com')
    and email_confirmed_at is not null
);
```

Confira que **uma** linha foi alterada. Se foram zero, verifique o projeto, o cadastro e a confirmação antes de prosseguir. Reabra a sessão da aplicação. O administrador aprova os próximos integrantes em **Administração**, define `admin`, `leader` ou `musician` e pode vincular o perfil a uma pessoa da equipe. Uma pessoa pode ser vinculada a no máximo um perfil. Ninguém promove a própria conta pelo cadastro ou modifica diretamente `role`, `approved` ou `person_id` pelo cliente.

O helper administrativo `node scripts/configure-public-site.mjs --approve-owner` faz essa aprovação somente para o e-mail proprietário configurado no script, com cadastro confirmado. A execução sem argumentos apenas consulta o estado; `--apply` ajusta as URLs do domínio publicado preservando as demais configurações de Auth. Essas operações usam acesso de gerenciamento e não fazem parte do fluxo dos integrantes.

A migração cria perfis para cadastros feitos **depois** de sua aplicação. Se já havia contas antes da migração, o proprietário pode recuperar apenas os perfis ausentes no SQL Editor:

```sql
insert into public.profiles (id, name)
select id, 'Integrante' from auth.users
on conflict (id) do nothing;
```

Isso não aprova contas nem cria dados de demonstração. O administrador pode ajustar os nomes depois. Promova pelo menos um segundo administrador de confiança: o RPC impede suspender ou rebaixar o último administrador aprovado, inclusive em chamadas concorrentes. Alterações diretas pelo SQL Editor e exclusões de contas no painel são ações privilegiadas do proprietário; preserve manualmente um administrador nesses casos.

## Login, confirmação e recuperação de senha

Use e-mail e senha no login real. A interface oferece cadastro e recuperação de senha; as mensagens de confirmação e recuperação são enviadas pelo Supabase, nunca pelo modo de demonstração. Abra o link de recuperação na mesma aplicação e escolha uma nova senha no formulário de recuperação. A URL de retorno deve constar nas **Redirect URLs**. Um erro de redirecionamento geralmente indica configuração de URL, não necessidade de uma senha de banco.

Se o e-mail não chegar, confira spam, status de confirmação, logs de Auth, destinatários permitidos, limites de envio e SMTP. Um login sem aprovação mostra a espera pela administração e não carrega pessoas, músicas, etiquetas ou cultos. Para revogar o acesso aos dados, o administrador desmarca a aprovação; as próximas consultas são bloqueadas pelo banco, mesmo se a sessão de Auth continuar válida.

## Netlify

O site [louvor-grupo-fxebsy.netlify.app](https://louvor-grupo-fxebsy.netlify.app) foi publicado por envio direto de um ZIP do build. Seu ID é `93f0134d-7c6f-414a-b86a-1c4c9bdcb477`. Este deploy não está conectado ao GitHub: mudanças no checkout ou no ambiente Codex exigem um novo build e envio para atualizar a aplicação.

Para manter esse mesmo site, configure `NETLIFY_AUTH_TOKEN` nas configurações seguras do ambiente e `NETLIFY_SITE_ID` com o ID acima. O token é usado somente por [scripts/deploy-netlify.mjs](../scripts/deploy-netlify.mjs), nunca pelo navegador. Não o grave em `.env.local`, arquivos, commits ou comandos. O helper também guarda o ID do site e do deploy em `/workspace/scratch/louvor-netlify-state.json`, sem credenciais.

Use Node compatível com `package.json`. As duas variáveis públicas `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` precisam estar disponíveis durante o build; elas já estão configuradas neste ambiente. O build copia de `public/` os arquivos `_redirects` e `_headers`, necessários para as rotas SPA e os headers no envio direto. Para gerar e enviar uma atualização:

```sh
npm run build
python3 -m zipfile -c /workspace/scratch/louvor-site-atualizado.zip dist/*
node scripts/deploy-netlify.mjs --check
node scripts/deploy-netlify.mjs --deploy /workspace/scratch/louvor-site-atualizado.zip
```

O ZIP contém os arquivos da aplicação na raiz, incluindo `index.html`, `_redirects` e `_headers`; não envie a pasta do projeto, `.env.local` ou `node_modules`. O helper retoma um envio pendente e reutiliza o mesmo artefato quando já publicado, sem excluir sites. Confira `state: ready` e a URL retornada. Também é possível enviar os arquivos do build pela interface de deploy manual do site no Netlify.

Para adotar builds automáticos depois, envie e revise o código no GitHub, conecte esse repositório ao mesmo site e configure no Netlify as duas variáveis públicas. Use `npm run build`, diretório `dist` e `netlify.toml`. Variáveis Vite são incorporadas no build: mudar uma variável exige publicar um novo build.

Valide o fluxo de recuperação no domínio final e a instalação como PWA. O service worker guarda o shell estático; dados autenticados não são armazenados em seu cache. O histórico do navegador e a sessão autenticada continuam sujeitos aos controles normais do dispositivo. Confira limites e preços atuais de Supabase e Netlify; esta configuração não garante planos gratuitos nem custo fixo.

## Verificar permissões e integridade

Faça um piloto com contas diferentes em perfis de navegador separados:

| Conta | Resultado esperado |
| --- | --- |
| Sem login | Sem acesso às tabelas e aos RPCs |
| Músico ainda não aprovado | Consulta somente o próprio perfil; aguarda aprovação |
| Músico aprovado | Lê dados e transpõe a visualização; não altera o cadastro nem os cultos |
| Líder aprovado | Lê dados e salva cultos, escalas e repertórios; não altera catálogo, equipe, etiquetas ou permissões |
| Administrador aprovado | Gerencia catálogo, pessoas, etiquetas, planejamento e perfis |

As políticas e os privilégios do PostgreSQL protegem essas regras independentemente da interface. `save_song` e `save_service` validam o papel aprovado e salvam o agregado em uma transação: uma etiqueta, pessoa, função, música ou tom inválido desfaz toda a gravação. Itens têm posição persistida; o tom e a observação do repertório não alteram a música. Datas e horários são locais do culto, sem conversão implícita de fuso.

Tente excluir uma música ou pessoa utilizada: o banco rejeita a exclusão. Uma pessoa vinculada a um perfil também fica protegida até remover o vínculo. Remover uma função que aparece na escala é rejeitado; para alterá-la, ajuste as escalas primeiro. Excluir uma etiqueta remove os vínculos dessa etiqueta; excluir um culto remove sua escala e repertório. Alterações de funções e inserções na escala usam bloqueio da pessoa para evitar aceitar dados inconsistentes em operações concorrentes.

O banco valida campos obrigatórios, tamanhos máximos, cores `#RRGGBB`, funções cadastradas, tipos de culto, tons e URLs de vídeo HTTPS do YouTube. Cifra é texto com acordes entre colchetes, sem execução de HTML. Funções com `SECURITY DEFINER` têm `search_path` fixo, objetos qualificados e concessões explícitas; o gatilho de Auth ignora papel/aprovação enviados em metadados.

Execute `npm run test:db` para repetir as verificações da migração, RLS, RPCs, validações, permissões e integridade em PostgreSQL via PGlite, com Auth simulado e sem rede. O teste cria apenas dados fictícios em memória. Para verificar concorrência real, execute opcionalmente `node tests/database/concurrency.mjs`; requer Docker e baixa uma imagem oficial PostgreSQL 17 com digest fixado. O contêiner fica sem rede e é removido ao terminar; os cenários verificam rebaixamentos simultâneos de administradores e alterações concorrentes de funções/escala.

Nesta entrega, Auth, PostgREST, RLS, login, leitura com papéis diferentes e recuperação de senha foram testados no domínio público com fixtures removidas ao terminar. O proprietário também confirmou o recebimento do e-mail e o primeiro acesso. A entrega de mensagens a outros integrantes depende dos limites de destinatários do serviço padrão; SMTP próprio ainda não foi configurado.
