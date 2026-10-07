# Candeia: Supabase e publicação

O Candeia usa um projeto dedicado a um ministério e trabalha com os dados reais cadastrados nele. Não há demonstração ou população automática de músicas, pessoas e cultos.

O endereço existente é [louvor-grupo-fxebsy.netlify.app](https://louvor-grupo-fxebsy.netlify.app), no projeto Supabase `fxebsycpbybhzkpnxzoo`. A migração inicial e o primeiro administrador já foram configurados; `mikhaelfernandes8@gmail.com` entra com sua senha pessoal. A versão Candeia e a função de busca foram publicadas juntas no Netlify pelo modo de diretórios; o deploy `6ac61ee795786016c1d9a837` foi confirmado como `ready`. As verificações executadas ficam em [VALIDACAO.md](VALIDACAO.md).

## Configuração e migrações

A instalação atual já tem o esquema de [001_initial.sql](../supabase/migrations/001_initial.sql). **Não reaplique essa migração sobre o projeto existente.** [002_public_consultation.sql](../supabase/migrations/002_public_consultation.sql) acrescenta a consulta pública sem substituir o esquema ou seus registros. A atualização já foi aplicada neste projeto e a consulta foi habilitada conforme a escolha do proprietário. O helper `node scripts/configure-public-consultation.mjs` verifica esse estado sem alterar o banco; `--apply` aplica apenas a migração aditiva ainda ausente e `--enable` libera a consulta após verificar o administrador proprietário confirmado. Futuras alterações usam novas migrações.

Para uma instalação nova, as migrações em ordem numérica definem o esquema e suas extensões. Use o projeto autorizado e revise o estado do banco antes de executar qualquer migração. O helper `npm run supabase:check` é uma consulta; o helper inicial de setup só atende um schema vazio e não atualiza uma instalação existente.

Configure a URL pública e a chave pública `anon`/publishable usando `.env.example` como modelo de `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA-CHAVE-PUBLICA
```

Essas duas variáveis públicas entram no build do navegador. Senha PostgreSQL, `service_role`, chaves secretas e tokens de gerenciamento nunca entram em `VITE_*`, código, commits ou instruções salvas. Reinicie o Vite após mudar variáveis; para o site publicado, gere outro build e deploy.

Em **Authentication → Providers → Email**, mantenha e-mail/senha e confirmação de e-mail. Cadastros recebem `musician`, com `approved = false`, independentemente de metadados enviados pelo cliente. Confirmar o e-mail permite autenticar; a aprovação administrativa libera o acesso privado do ministério.

Em **Authentication → URL Configuration**, use **Site URL** `https://louvor-grupo-fxebsy.netlify.app` e inclua em **Redirect URLs** `https://louvor-grupo-fxebsy.netlify.app/**`, `http://localhost:5173/**` e `http://localhost:4173/**`, conforme os ambientes usados. Inclua somente domínios e previews autorizados. Configure SMTP para confirmação e recuperação dos integrantes; confira destinatários e limites do serviço de e-mail no painel atual.

## Contas e primeiro administrador

Na instalação atual, entre com `mikhaelfernandes8@gmail.com` e sua senha pessoal. Os próximos integrantes escolhem **Criar conta**, cadastram nome, e-mail e senha, confirmam a mensagem recebida e aguardam aprovação em **Administração**. O administrador define `admin`, `leader` ou `musician` e pode vincular uma pessoa da equipe a uma conta.

Em outra instalação, crie e confirme a conta proprietária no endereço dessa instalação. Sua primeira aprovação é feita pela sessão administrativa do SQL Editor, com o e-mail correto da conta já confirmada:

```sql
update public.profiles
set role = 'admin', approved = true
where id = (
  select id from auth.users
  where lower(email) = lower('seu-email@exemplo.com')
    and email_confirmed_at is not null
);
```

Confira uma linha alterada e reabra a sessão. O helper `node scripts/configure-public-site.mjs --approve-owner` também aprova somente o proprietário definido no script, com cadastro confirmado. Sem argumentos, ele consulta o estado; `--apply` ajusta as URLs de Auth a partir do deploy Netlify observado. Essas operações requerem gerenciamento seguro e não fazem parte do cadastro normal.

Uma pessoa pode ser vinculada a no máximo um perfil. O cadastro não permite promover a própria conta; os perfis não têm escrita direta pelo cliente. O RPC administrativo protege o último administrador aprovado contra suspensão ou rebaixamento. Exclusões e SQL pelo painel são operações privilegiadas; preserve pelo menos um administrador.

## Consulta sem cadastro

O link de entrada é `/consulta`; no domínio final, [louvor-grupo-fxebsy.netlify.app/consulta](https://louvor-grupo-fxebsy.netlify.app/consulta). Ele carrega os mesmos cultos, repertórios e músicas reais do ministério, sem cadastrar um visitante ou simular outro papel.

Neste projeto, a consulta já está **habilitada**. Em uma instalação nova, a migração `002_public_consultation.sql` cria a configuração inicialmente **desativada**. Um administrador aprovado abre **Administração → Consulta sem cadastro**, marca **Permitir consulta sem cadastro** e escolhe **Salvar acesso público**. **Copiar link** copia `/consulta`; **Abrir consulta** permite conferir o acesso em outra aba. Para fechar novas consultas ao banco, desmarque a opção e salve. Alterar apenas a caixa sem salvar não muda o acesso.

Quando liberada, a consulta compartilha títulos, artistas, letras/cifras, tons, etiquetas, vídeos e observações musicais; datas, tipos, observações, repertórios e escalas dos cultos; nomes e funções da equipe. Visitantes podem pesquisar, ler e transpor somente sua visualização. Não criam, alteram, excluem ou salvam dados do ministério. E-mails/contatos e perfis de conta não são retornados. Como as observações fazem parte da consulta, mantenha informações privadas nos campos privados apropriados.

O RPC `read_public_ministry()` retorna uma lista fixa de campos, esvazia o e-mail das pessoas e nunca consulta perfis/Auth. As tabelas privadas continuam sem acesso anônimo direto. `get_public_access()` informa apenas disponibilidade; `save_public_access(boolean)` exige um administrador aprovado. Com a consulta desativada, a leitura pública é rejeitada. Fechar o acesso não apaga informações que um visitante já leu.

## Rascunhos, escala e repertório

Os editores guardam rascunhos em `sessionStorage` por conta, tipo de formulário e aba. Fechar a janela, navegar ou recarregar a mesma aba permite retomar campos, sem gravá-los no ministério. **Cancelar** descarta o rascunho; salvar com sucesso limpa o rascunho; sair da conta limpa os rascunhos daquela conta na aba. Uma falha de rede ou validação mantém o conteúdo para correção. Fechar a aba encerra seu armazenamento de sessão; isso não substitui backup nem sincronização entre dispositivos.

**Selecionar equipe** ou **Editar equipe** abre o único editor da escala, incluindo quem já está escalado. Selecione várias pessoas, ajuste a função principal ou funções adicionais e desmarque para remover; **Salvar equipe** grava a equipe completa de uma vez. No formulário de culto, **Selecionar equipe** mantém a seleção no rascunho: **Aplicar equipe** ou **Concluir seleção** incorpora a seleção ao formulário, e **Salvar culto** também aplica uma seleção ainda aberta antes de gravar. **Reutilizar última escala** preserva vínculos válidos já existentes. A transposição do leitor não grava o tom; **Salvar tom no culto** altera explicitamente aquele item do repertório para um perfil autorizado.

## Fontes de letra e cifra

**Pesquisar cifra e letra** consulta título/artista uma vez e reúne Cifra Club primeiro e LRCLIB na mesma lista. O navegador consulta o LRCLIB para letras sem acordes e a função `/.netlify/functions/song-search?source=cifraclub` para metadados das versões do Cifra Club. A prévia de cifra usa a mesma função com o parâmetro `url`, limitado às páginas HTTPS de música permitidas. Não é um proxy de URLs arbitrárias. Worship Together permanece apenas como compatibilidade do endpoint antigo e não aparece no editor atual.

A busca real do Cifra Club retornou versões, mas a prévia real respondeu 502 explicando o 403 recebido da fonte. **A importação automática Cifra Club ainda está bloqueada**; não confunda o retorno de metadados ou os mocks dos testes com acesso ao conteúdo. LRCLIB oferece importação automática de letra quando disponível; a última verificação real recebeu HTTP 503 desse provedor. Falhas e timeout preservam o rascunho e deixam disponível o link externo da versão escolhida.

Quando a fonte permitir uma prévia, confirme **Importar cifra e letra** ou **Importar letra sem acordes**. A visualização **Somente letra** remove os acordes localmente; **Ver somente letra na prévia** não altera o conteúdo que será importado. O tom original é atualizado apenas quando reconhecido, mantendo **Tom na igreja**. Título/artista só mudam com a opção marcada. Conteúdo existente exige confirmação de substituição; somente **Salvar música** grava a revisão no banco, com referência da fonte nas observações.

**Importar texto manualmente** fica recolhido como alternativa, com colagem de letra e acordes e link opcional do Cifra Club. A conversão em ChordPro permite transposição; um cabeçalho `Tom:` reconhecido atualiza somente o tom original. O limite é 100.000 caracteres; a prévia exibe até 12.000, sem reduzir o texto completo importado. Consulte [VALIDACAO.md](VALIDACAO.md) para medições e limitações da investigação de travamento. O consumo de memória JavaScript medido em testes não equivale à RAM total do Chrome.

## Netlify

O site existente tem ID `93f0134d-7c6f-414a-b86a-1c4c9bdcb477` e recebe publicação direta, sem integração Git. Configure `NETLIFY_AUTH_TOKEN` nas configurações seguras do ambiente e `NETLIFY_SITE_ID` com esse ID. O token é usado apenas por [scripts/deploy-netlify.mjs](../scripts/deploy-netlify.mjs); nunca o grave em arquivos ou comandos. O helper salva apenas metadados observados do site/deploy em `/workspace/scratch/louvor-netlify-state.json`.

As duas variáveis públicas do Supabase precisam estar disponíveis durante o build. O build leva `public/_redirects` e `public/_headers` a `dist`. Publique a aplicação e a função de busca juntas:

```sh
npm run build
node scripts/deploy-netlify.mjs --check
node scripts/deploy-netlify.mjs --deploy-dir dist --functions-dir netlify/functions
```

O modo de diretórios envia os arquivos estáticos e empacota as funções `.mjs`. Confira a resposta `state: ready`, a URL observada e o endpoint `/.netlify/functions/song-search`. O modo antigo `--deploy CAMINHO_DO_ZIP`, quando o ZIP contém somente `dist`, não instala essa função; um deploy só dos arquivos estáticos deixa a busca de cifras indisponível. Não envie `.env.local`, fontes do checkout ou `node_modules` como conteúdo do site.

O código está em [Mikhael-Fee/Sistema-Grupo-de-Louvor](https://github.com/Mikhael-Fee/Sistema-Grupo-de-Louvor), branch `main`. Para builds automáticos futuros, conecte o repositório ao mesmo site, configure as variáveis públicas e o diretório de funções `netlify/functions`, e use `npm run build`/`dist` com `netlify.toml`. Variáveis Vite só mudam no navegador após novo build e deploy.

Valide o domínio final com [TESTE-PUBLICO.md](TESTE-PUBLICO.md), incluindo consulta pública, importação, recuperação e instalação PWA. O service worker guarda apenas o shell estático, sem respostas do Supabase; dados reais e fontes exigem conexão. Quando detectar uma versão nova, a aplicação oferece **Atualizar agora** ou **Depois**, sem recarregar automaticamente ao mudar de foco. A atualização escolhida recarrega a página e preserva os rascunhos guardados na mesma aba. Para sair de uma instalação antiga ainda sem esse aviso, feche todas as abas/janelas do site e reabra o endereço depois da publicação. Confira limites e preços nos painéis dos serviços.

## Permissões e integridade

| Acesso | Resultado esperado |
| --- | --- |
| Visitante, consulta desativada | Leitura pública rejeitada; sem acesso às tabelas privadas |
| Visitante, consulta ativada | Lê somente o recorte público e transpõe localmente; sem contatos, perfis ou escrita |
| Conta ainda não aprovada | Consulta somente o próprio perfil; aguarda aprovação do acesso privado |
| Músico aprovado | Lê dados privados autorizados e transpõe; não altera cadastros ou cultos |
| Líder aprovado | Planeja cultos, escala e repertório; não altera catálogo, equipe, etiquetas ou perfis |
| Administrador aprovado | Gerencia catálogo, equipe, etiquetas, planejamento, perfis e disponibilidade da consulta pública |

RLS e privilégios protegem essas regras independentemente da interface. `save_song` e `save_service` validam o papel aprovado e salvam agregados em transação: um vínculo inválido desfaz a operação. Excluir música/pessoa usada no culto ou pessoa vinculada a conta é rejeitado; retirar uma função em uso na escala também é bloqueado. Etiquetas excluídas removem seus vínculos, e excluir um culto remove sua escala e repertório.

Execute `npm run test:db` para verificar migrações, RLS, RPCs, campos e transações em PostgreSQL/PGlite com Auth simulado. `node tests/database/concurrency.mjs` verifica concorrência em PostgreSQL 17 e requer Docker. Esses testes usam fixtures; a validação real de Auth, entrega de e-mail, consulta pública, fontes e domínio final é uma etapa própria. Resultados executados ficam em [VALIDACAO.md](VALIDACAO.md).
