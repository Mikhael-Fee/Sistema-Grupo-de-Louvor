# Candeia: Supabase e publicação

O Candeia usa um projeto dedicado a um ministério e trabalha com os dados reais cadastrados nele. Não há demonstração ou população automática de músicas, pessoas e cultos.

O endereço existente é [louvor-grupo-fxebsy.netlify.app](https://louvor-grupo-fxebsy.netlify.app), no projeto Supabase `fxebsycpbybhzkpnxzoo`. A migração inicial e o primeiro administrador já foram configurados; `mikhaelfernandes8@gmail.com` entra com sua senha pessoal. A aplicação e a função de busca são publicadas juntas no Netlify pelo modo de diretórios. O deploy vigente e as verificações executadas ficam em [VALIDACAO.md](VALIDACAO.md).

## Configuração e migrações

A instalação atual já tem o esquema de [001_initial.sql](../supabase/migrations/001_initial.sql). **Não reaplique essa migração sobre o projeto existente.** [002_public_consultation.sql](../supabase/migrations/002_public_consultation.sql) acrescenta a consulta pública sem substituir o esquema ou seus registros. A atualização já foi aplicada neste projeto e a consulta foi habilitada conforme a escolha do proprietário. O helper `node scripts/configure-public-consultation.mjs` verifica esse estado sem alterar o banco; `--apply` aplica apenas a migração aditiva ainda ausente e `--enable` libera a consulta após verificar o administrador proprietário confirmado. Futuras alterações usam novas migrações.

A migração [003_custom_service_types.sql](../supabase/migrations/003_custom_service_types.sql) substitui a lista fixa de tipos por uma temática obrigatória, não composta somente de espaços e de até 100 caracteres. Foi aplicada no projeto existente sem alterar registros, contas ou RLS das oito tabelas. O helper abaixo inspeciona a restrição, verifica as permissões e testa um tipo livre em uma transação desfeita, sem persistir um culto:

```sh
node scripts/configure-service-types.mjs
node scripts/configure-service-types.mjs --apply
```

Use `--apply` somente no projeto autorizado, com `SUPABASE_ACCESS_TOKEN` injetado nas configurações seguras. O helper aplica apenas a migração 003 ausente quando encontra a restrição inicial conhecida; repetir após a aplicação não altera o schema. Não imprime credenciais nem substitui valores dos cultos existentes.

A migração [004_profile_photos.sql](../supabase/migrations/004_profile_photos.sql) acrescenta fotos opcionais a perfis e pessoas, RPC próprio e políticas de Storage. Foi aplicada no projeto existente e a repetição foi verificada como idempotente, mantendo registros, contas e permissões. O helper inspeciona a configuração conhecida antes de aplicar uma migração ausente; não sobrescreve um bucket existente com outra configuração nem reaplica as migrações iniciais:

```sh
node scripts/configure-profile-photos.mjs
node scripts/configure-profile-photos.mjs --apply
```

Em outra instalação autorizada, `SUPABASE_PROJECT_REF` define o projeto e o helper adapta somente a origem das URLs aceitas. Use `SUPABASE_ACCESS_TOKEN` nas configurações seguras. O estado do schema não substitui testes reais de upload, leitura pública e rejeição de operações não autorizadas; esses resultados são registrados separadamente em [VALIDACAO.md](VALIDACAO.md).

A exibição de fotos entre conta e pessoa exige a atualização [005_linked_profile_photos.sql](../supabase/migrations/005_linked_profile_photos.sql), após a 004. Ela foi aplicada no projeto existente, com reinspeção confirmando idempotência, guarda de aprovação, privilégios restritos e `search_path` protegido. Acrescenta leitura restrita de imagens e atualiza o recorte público, sem copiar URLs, alterar vínculos, resetar imagens ou modificar permissões de escrita. Os resultados e a versão publicada ficam em [VALIDACAO.md](VALIDACAO.md). Não reaplique `001_initial.sql`.

O helper [configure-linked-profile-photos.mjs](../scripts/configure-linked-profile-photos.mjs) sem argumentos faz verificação de leitura; `--apply` instala somente os RPCs da migração 005 ausente e verifica os privilégios, preservando dados e a escolha de acesso público. Use somente o projeto autorizado, com token injetado de forma segura:

```sh
node scripts/configure-linked-profile-photos.mjs
node scripts/configure-linked-profile-photos.mjs --apply
```

[tests/database/linked-photos-check.mjs](../tests/database/linked-photos-check.mjs) verifica o contrato em PGlite com Auth/Storage simulados. Essa suíte não comprova sozinha a aplicação da migração no Supabase real ou a atualização do domínio publicado.

Para uma instalação nova, as migrações em ordem numérica definem o esquema e suas extensões. Use o projeto autorizado e revise o estado do banco antes de executar qualquer migração. O helper `npm run supabase:check` é uma consulta; o helper inicial de setup só atende um schema vazio e inclui a restrição de tipos livres, sem atualizar uma instalação existente. A configuração de consulta pública continua pelo helper específico da migração 002.

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

Uma pessoa pode ser vinculada a no máximo um perfil. Em **Administração**, opções usadas por outra conta ficam indisponíveis, enquanto o vínculo atual pode ser mantido ou removido; o banco também protege a unicidade. O cadastro não permite promover a própria conta; os perfis não têm escrita direta pelo cliente. O RPC administrativo protege o último administrador aprovado contra suspensão ou rebaixamento. Exclusões e SQL pelo painel são operações privilegiadas; preserve pelo menos um administrador.

## Consulta sem cadastro

O link de entrada é `/consulta`; no domínio final, [louvor-grupo-fxebsy.netlify.app/consulta](https://louvor-grupo-fxebsy.netlify.app/consulta). Ele carrega os mesmos cultos, repertórios e músicas reais do ministério, sem cadastrar um visitante ou simular outro papel.

Neste projeto, a consulta já está **habilitada**. Em uma instalação nova, a migração `002_public_consultation.sql` cria a configuração inicialmente **desativada**. Um administrador aprovado abre **Administração → Consulta sem cadastro**, marca **Permitir consulta sem cadastro** e escolhe **Salvar acesso público**. **Copiar link** copia `/consulta`; **Abrir consulta** permite conferir o acesso em outra aba. Para fechar novas consultas ao banco, desmarque a opção e salve. Alterar apenas a caixa sem salvar não muda o acesso.

Quando liberada, a consulta compartilha títulos, artistas, letras/cifras, tons, etiquetas, vídeos e observações musicais; datas, tipos, observações, repertórios e escalas dos cultos; nomes, funções e fotos opcionais da equipe. Visitantes podem pesquisar, ler, consultar gráficos e transpor somente sua visualização. Não criam, alteram, excluem ou salvam dados do ministério. E-mails/contatos e perfis de conta não são retornados. Como as observações fazem parte da consulta, mantenha informações privadas nos campos privados apropriados.

O RPC `read_public_ministry()` retorna uma lista fixa de campos e esvazia o e-mail das pessoas. Com a migração 005, inclui somente a URL pública da foto de uma conta aprovada vinculada como `accountPhotoUrl`, sem retornar campos de ID da conta, e-mail, papel ou perfis. As tabelas privadas continuam sem acesso anônimo direto. `get_public_access()` informa apenas disponibilidade; `save_public_access(boolean)` exige um administrador aprovado. Com a consulta desativada, a leitura pública é rejeitada. Fechar o acesso não apaga informações que um visitante já leu.

## Rascunhos, escala e repertório

No formulário de culto, **Tipo de culto** aceita uma temática digitada, como **Santa Ceia**, **Culto de sábado** ou **Culto de louvor**. Sugestões incluem as opções iniciais e os tipos usados pelo ministério; o filtro de cultos também inclui esses tipos. O campo continua obrigatório, com limite de 100 caracteres.

Os editores guardam rascunhos em `sessionStorage` por conta, tipo de formulário e aba. Fechar a janela, navegar ou recarregar a mesma aba permite retomar campos, sem gravá-los no ministério. **Cancelar** descarta o rascunho; salvar com sucesso limpa o rascunho; sair da conta limpa os rascunhos daquela conta na aba. Uma falha de rede ou validação mantém o conteúdo para correção. Fechar a aba encerra seu armazenamento de sessão; isso não substitui backup nem sincronização entre dispositivos.

**Selecionar equipe** ou **Editar equipe** abre o único editor da escala, incluindo quem já está escalado. Selecione várias pessoas, ajuste a função principal ou funções adicionais e desmarque para remover; **Salvar equipe** grava a equipe completa de uma vez. No formulário de culto, **Selecionar equipe** mantém a seleção no rascunho: **Aplicar equipe** ou **Concluir seleção** incorpora a seleção ao formulário, e **Salvar culto** também aplica uma seleção ainda aberta antes de gravar. **Reutilizar última escala** preserva vínculos válidos já existentes. A transposição do leitor não grava o tom; **Salvar tom no culto** altera explicitamente aquele item do repertório para um perfil autorizado.

**Selecionar músicas** é a única inclusão do repertório: marque várias músicas e confirme **Adicionar selecionadas**. A seleção continua ao pesquisar e impede duplicatas. As novas músicas usam o tom da igreja e a ordem dos cliques, com ordem, tom e notas ajustáveis no culto. Na criação/edição, **Salvar culto** incorpora a seleção ainda aberta e grava uma vez.

## Fontes de letra e cifra

**Pesquisar cifra e letra** consulta título/artista uma vez e reúne Cifra Club primeiro e LRCLIB na mesma lista. O navegador consulta o LRCLIB para letras sem acordes e a função `/.netlify/functions/song-search?source=cifraclub` para metadados das versões do Cifra Club. A prévia de cifra usa a mesma função com o parâmetro `url`, limitado às páginas HTTPS de música permitidas. Não é um proxy de URLs arbitrárias. Worship Together permanece apenas como compatibilidade do endpoint antigo e não aparece no editor atual.

A busca real do Cifra Club retornou versões, mas a leitura pelo servidor respondeu 502 explicando o 403 da fonte. A alternativa automática é o [importador pelo navegador](https://louvor-grupo-fxebsy.netlify.app/conectar-cifra-club), instalado uma vez no Chrome/Edge do computador. Quando conectado, a prévia lê a página normalmente aberta pelo próprio navegador, valida a versão e recebe somente letra, acordes, título, artista e tom exibido. Não há credenciais Supabase na extensão nem gravação automática; a gravação continua pelo formulário e RLS existentes.

A extensão fecha somente a aba que criou e cancela consultas antigas. Ela não contorna bloqueios nem funciona no Chrome de celular. No celular, a aba **Celular** do mesmo guia orienta salvar a cifra normalmente aberta como PDF pela impressão do navegador. Depois, **Biblioteca → Nova música → Escolher PDF da cifra** extrai texto e acordes localmente para revisar, importar e salvar. O guia de favorito JavaScript/Atalhos foi retirado após falha relatada no Chrome/Xiaomi; artefatos e receptor antigos continuam apenas por compatibilidade.

**Biblioteca → Importar PDFs → Escolher PDFs** oferece lote separado do formulário individual: até 20 arquivos, 8 MiB cada e 80 MiB no total, com uma música por PDF. A leitura é sequencial e não altera o banco. Na revisão, **Salvar selecionadas** chama o salvamento de cada música com as permissões existentes; não há migração ou transação única do lote. Sucessos ficam marcados como salvos e falhas podem ser corrigidas/repetidas com o mesmo UUID. Duplicatas vêm desmarcadas; inclusão explícita cria uma cópia com novo ID. Cancelar leitura preserva itens processados; interromper gravação termina o item em andamento e impede o início dos seguintes.

O PDF não é enviado ao Supabase ou guardado como arquivo. PDF.js 6 e seu worker são carregados sob demanda, processam uma página por vez e liberam seus recursos ao terminar ou cancelar. Limites: 8 MiB, 20 páginas, 100.000 caracteres, 30.000 itens de texto e 25 segundos. São aceitos PDFs sem senha com texto selecionável; fotos e documentos digitalizados não têm OCR. A prévia preserva o tom-base e capotraste, limpa tablaturas e usa título, artista e referência Cifra Club quando presentes. Dados ausentes ou tom ambíguo exigem revisão. Somente um administrador aprovado salva o texto no mesmo cadastro/RPC existente; não há gravação automática nem novo campo de letra.

Testes de extração com PDFs controlados e layout de Chromium não substituem a conferência dos menus de impressão em aparelhos físicos. Os resultados detalhados ficam em [VALIDACAO.md](VALIDACAO.md). LRCLIB oferece letras quando disponível; houve HTTP 503 na verificação anterior. Falhas e timeout preservam o rascunho e o link da versão escolhida.

Quando a fonte permitir uma prévia, confirme **Importar cifra e letra** ou **Importar letra sem acordes** para preencher o único campo **Letra e cifra**. A visualização **Somente letra** remove os acordes localmente. Os acordes escritos na fonte são convertidos realmente para **Tom na igreja**, que passa a ser também a base interna de transposição do conteúdo salvo. Não existe seletor comum de Tom original. Título/artista são preenchidos ao marcar a opção dos dados da fonte; se o conteúdo estiver vazio, **Salvar música** também importa a prévia selecionada. Conteúdo existente exige confirmação de substituição; somente salvar grava a revisão no banco, com referência da fonte nas observações.

O painel separado de colagem foi removido; o campo **Letra e cifra** permite editar ou colar diretamente. PDF e Cifra Club priorizam o tom escrito explícito. Quando a fonte informa apenas tom sonoro e casa de capotraste, subtraem esse intervalo para obter a base dos acordes: **Bb/capo3 → G**, com **G** como padrão de tom na igreja se o usuário ainda não escolheu outro. Uma escolha manual é mantida; mudar a igreja para Bb converte G→Bb uma vez, sem somar o capotraste novamente.

Sem metadados confiáveis, a análise do conjunto/sequência de acordes pode preencher uma estimativa com confiança alta/média, indicada como **PROVÁVEL** e editável. Baixa confiança exige confirmação manual do tom dos acordes recebidos. O primeiro acorde não é usado como prova de tonalidade; candidatos maiores/menores e possíveis acordes emprestados continuam sujeitos à revisão. O conteúdo salvo recebe o tom da igreja como base interna; a estimativa não reinterpreta registros antigos.

Tablaturas, inclusive de introdução/solo, diagramas, afinação e instruções de capotraste saem do conteúdo, preservando rótulos **[Intro]**/**[Solo]**, versos e acordes. Instrumentais sem letra têm pelo menos 8 px entre acordes, e acordes sobre versos mantêm alinhamento. O leitor limpa também registros antigos sem regravá-los. **Corrigir cifra com tom incorreto** repara registros com a base errada após confirmação do tom real e salvar. A extensão 1.1.1 corrige a identificação do artista usando metadados e o link canônico, ignorando **Menu principal**; o frontend também rejeita esse rótulo recebido de versões antigas e usa o artista da opção escolhida. Atualize o importador conforme o guia. O limite do texto é 100.000 caracteres; a prévia exibe até 12.000 sem truncar a importação. Consulte [VALIDACAO.md](VALIDACAO.md) para limites das medições de memória, que não equivalem à RAM total do Chrome.

## Fotos de perfil e integrantes

Uma conta aprovada abre **Meu perfil** em `/perfil`, escolhe ou remove sua imagem e confirma **Salvar foto**. O RPC `update_my_profile_photo(text)` altera somente `photo_url` da própria conta e não promove papel, aprovação ou vínculo. Administradores também editam a foto em **Equipe**. Fotos de conta e pessoa continuam armazenadas separadamente: equipe/escala preferem foto da pessoa e usam foto da conta aprovada vinculada se faltar; perfil/cabeçalho preferem selfie própria e usam foto da pessoa vinculada se faltar. Remover a foto prioritária pode fazer reaparecer essa alternativa, sem copiar arquivos. Escolher arquivo ou cancelar não envia imagem. PNG/JPEG/WebP de até 10 MiB passam por validação e recorte local para até 512 px e 300 KiB antes do envio confirmado.

`read_team_profile_photos()` exige um acesso aprovado e retorna somente `[{personId, photoUrl}]`, sem outros dados da conta. O adapter associa esse retorno à pessoa como `accountPhotoUrl`, separado da foto definida pelo administrador. Ao remover vínculo ou aprovação, a próxima leitura não recebe a foto da conta como alternativa. O RPC público só inclui essa alternativa quando a consulta está liberada e a conta vinculada permanece aprovada. Não há campos de ID de Auth, e-mail ou papel no retorno; as URLs de Storage podem conter UUIDs no caminho do arquivo. As URLs continuam públicas no bucket; retirar vínculo/aprovação não torna o arquivo privado nem o apaga.

O bucket `avatars` é público, aceita JPEG/PNG/WebP e limita cada objeto a 2 MiB. Cada upload usa `UID/UUID.ext` novo; não há política de sobrescrita. RLS impede escrita na pasta de outro usuário e só permite excluir objeto próprio sem referência em perfis ou pessoas. URLs de outra origem/bucket são recusadas, e referências novas exigem objeto existente. Remover ou trocar uma foto só limpa o arquivo anterior quando ele não estiver mais em uso. O administrador envia uma foto de pessoa sob seu próprio UID; isso não lhe permite alterar a foto de outra conta.

Uma URL pública permite ler a imagem sem sessão. Fotos das pessoas integram o recorte público quando a consulta está liberada; perfis de conta e e-mails continuam privados. Fechar a consulta não torna privado um arquivo do bucket nem apaga cópias já acessadas. Use o campo para fotos destinadas à identificação pública da equipe.

O helper `node scripts/verify-profile-photos.mjs` executou **18 verificações reais** de Storage/Auth/RPC neste projeto autorizado: limites de upload, isolamento entre contas, leitura pública, fotos de perfil/equipe, vínculo/desvinculação, retirada de aprovação e leitura do RPC restrita a contas aprovadas. Todas as contas, a pessoa e os arquivos descartáveis foram removidos, sem alterar a conta proprietária. Para manutenção, execute somente no projeto autorizado com `SUPABASE_ACCESS_TOKEN` injetado de forma segura e confirme a limpeza final; o helper usa fixtures temporárias, sem gravar credenciais. A evidência da rodada fica em [VALIDACAO.md](VALIDACAO.md).

## Gráficos do planejamento

`/graficos` calcula indicadores a partir dos cultos, escalas, repertórios e cadastros que o acesso atual já pode ler. Não há migração própria, tabela de frequência, novo RPC ou escrita de análises. Na consulta sem cadastro, usa somente o recorte público existente. Filtros cobrem 30/90 dias, ano até hoje, todo o histórico, datas livres e temática; o dia do ministério usa São Paulo. Pessoas e músicas são deduplicadas por culto, funções contam atribuições e etiquetas sobrepostas podem somar mais de 100%. A interface explica esses denominadores e separa os totais atuais de cadastro das contagens do período. Escala planejada não comprova presença.

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
