# Candeia: verificação antes e depois de publicar

Este roteiro valida a versão deste checkout. Ele não registra resultados executados nem afirma que o site existente já recebeu as mudanças. Registre as evidências somente após os checks e o deploy correspondente; resultados anteriores ficam em [VALIDACAO.md](VALIDACAO.md).

## Antes do deploy

Execute `npm run typecheck`, `npm test`, `npm run test:db`, `npm run test:e2e` e `npm run build`. Confira o login e a consulta em desktop e largura de 390 px, sem botão de demonstração ou seleção de papel simulado. Fixtures dos testes não devem aparecer no produto ou ser instaladas no banco real.

Verifique que as migrações `002_public_consultation.sql` e `003_custom_service_types.sql` estão presentes no banco escolhido; não reaplique `001_initial.sql`. A consulta nasce desativada. A terceira migração permite temáticas obrigatórias de até 100 caracteres e preserva os tipos existentes. O helper `node scripts/configure-service-types.mjs` verifica o estado e desfaz sua inserção temporária; `--apply` aplica apenas a restrição ausente no schema conhecido. Aplique atualizações somente no projeto autorizado, preservando registros existentes.

Confira também `004_profile_photos.sql` com `node scripts/configure-profile-photos.mjs`: colunas opcionais, RPC de foto própria, bucket público `avatars` de 2 MiB e políticas RLS de Storage. `--apply` instala somente a migração ausente no schema conhecido. Verificação de schema não comprova upload real, leitura pública ou rejeição de escrita de outra conta.

Para fotos compartilhadas pela associação conta↔integrante, verifique também `005_linked_profile_photos.sql` com `node scripts/configure-linked-profile-photos.mjs`. O helper consulta o contrato por padrão; `--apply` instala somente a atualização ausente dos RPCs no projeto autorizado. Não reaplique `001_initial.sql`. O RPC privado exige aprovação e devolve apenas ID da pessoa/URL pública; a consulta pública mantém e-mails e dados de conta ocultos.

A busca de cifras precisa da função Netlify, além do build estático. Vite e `vite preview` sozinhos não atendem `/.netlify/functions/song-search`; nesse ambiente, valide seu contrato nos testes e o fluxo completo quando houver um servidor de funções compatível ou o deploy Netlify.

## Confirmar o artefato publicado

Publique pelo modo que inclui os dois componentes:

```sh
node scripts/deploy-netlify.mjs --check
node scripts/deploy-netlify.mjs --deploy-dir dist --functions-dir netlify/functions
```

O deploy deve estar `ready` em `/workspace/scratch/louvor-netlify-state.json`, salvo pelo helper a partir da API Netlify. Use a origem HTTPS observada nesse arquivo; neste site, o endereço existente é `https://louvor-grupo-fxebsy.netlify.app`. O ZIP antigo contendo somente `dist` não publica a função de busca.

1. Confira HTTP 200 na página inicial, `/consulta`, `/musicas`, `/graficos`, `/perfil`, `/conectar-cifra-club`, `/importar-cifra`, `/manifest.webmanifest` e `/sw.js`. As rotas de página devem retornar o shell da SPA, sem 404 ao recarregar diretamente.
2. Confira título/brand **Candeia**, favicon de chama, manifest com `short_name: Candeia`, `display: standalone`, ícones 192/512 e cores coerentes com o tema. Manifest e service worker devem ter tipos de conteúdo apropriados.
3. Confirme que `/.netlify/functions/song-search` responde como função JSON, e não como `index.html` da SPA. Uma consulta sem título pode retornar 400; isso é diferente de uma função ausente.
4. O build pode conter somente as duas configurações públicas do Supabase. Não inclua `.env.local`, tokens de Netlify/Supabase, senha do banco, chave `service_role` ou dados de contas no artefato.

## Consulta real sem cadastro

Use uma sessão de navegador sem login, separada da conta administradora:

1. Com a consulta desativada, abrir `/consulta` deve explicar que o ministério não liberou o acesso; não deve mostrar dados fictícios.
2. Em uma conta administradora aprovada, abra **Administração → Consulta sem cadastro**, marque **Permitir consulta sem cadastro** e escolha **Salvar acesso público**. Apenas mudar a caixa sem salvar não deve liberar nada.
3. Abra o link copiado em uma nova aba sem autenticação. Confira que cultos, repertórios, músicas, nomes e funções correspondem aos registros reais. Um banco vazio deve mostrar os estados vazios apropriados, sem adicionar exemplos.
4. Confira letras/cifras, troca de tom, tamanho da fonte e leitura. Transpor não muda o tom original, o tom na igreja ou o repertório salvo. Não devem aparecer ações de criação, edição, exclusão, importação ou gravação de tom no culto.
5. Verifique que e-mails, contatos e perfis de conta não aparecem no conteúdo, nas respostas da consulta ou na interface. Notas musicais e observações dos cultos são parte do recorte compartilhado.
6. Confira que consultas anônimas às tabelas privadas e tentativas de escrita são rejeitadas, mesmo com a consulta pública ativada; só o RPC público retorna seus campos permitidos.
7. Desmarque e salve o acesso público. Reabrir ou atualizar a consulta deve rejeitar novas leituras. Dados já vistos pelo visitante não são apagados retroativamente. Deixe a configuração final conforme a escolha do proprietário.

Repita navegação, biblioteca, culto e leitor com largura de 390 px. Confira menu, ações acessíveis por teclado, contraste e ausência de overflow horizontal.

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
4. A importação converte os acordes para **Tom na igreja** e registra a fonte. Confira prioridade do tom escrito explícito. Se houver apenas tom sonoro Bb/capo3, a base escrita e o padrão inicial de igreja devem ser G, sem transpor o conteúdo recebido. Escolher Bb converte G→Bb uma vez, com Bb→C correto no leitor, incluindo baixo. Um tom de igreja escolhido antes da importação deve permanecer. Sem tom confiável da fonte, estimativa alta/média deve mostrar **PROVÁVEL** e permitir edição; ambiguidade exige confirmação, sem inferir apenas pelo primeiro acorde. Título/artista preenchem com a opção marcada; conteúdo vazio também pode importar e salvar direto da prévia. Conteúdo anterior exige **Substituir letra e cifra**; **Manter conteúdo atual** preserva o texto. Nenhuma gravação até salvar.
5. Existe apenas um campo editável **Letra e cifra**, sem painel manual. Cole um exemplo próprio com `Tom:` e tablaturas: sair do campo deve converter para o tom da igreja e retirar tabs sem perder versos/seções. Na colagem parcial com tom conhecido, somente o trecho colado deve ser convertido. Com tom desconhecido, confirme antes de salvar. Fechar e reabrir preserva o rascunho e essa pendência. Cadastros com tom incorreto podem ser corrigidos pela seção recolhida ou reimportados. Confira teclado, fonte de 16 px no editor móvel e leitor sem rolagem horizontal.
6. Confira resultado vazio, falha de uma fonte mantendo resultados da outra, timeout, erro de prévia e cancelamento. Fechar a busca, alterar o título e pesquisar novamente não pode reapresentar a resposta da consulta antiga. Conteúdo acima de 100.000 caracteres deve ser recusado; a prévia deve exibir no máximo 12.000, preservando o texto completo da importação aceita.
7. Cancele o formulário ou remova somente as fixtures criadas para esse teste. Não use músicas do proprietário como alvo de substituição.

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
6. Músico e visitante não devem receber ações de importação/salvamento. Ao cancelar, nenhum PDF ou música deve ter sido gravado; remova somente a fixture salva pelo teste. Consulta e transposição pelo celular continuam funcionando normalmente.
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
8. Músico/visitante não devem receber ação de lote ou salvar. Remova somente as músicas temporárias criadas para o teste, preservando os dados do ministério. Registre resultados executados em [VALIDACAO.md](VALIDACAO.md), separadamente do roteiro.

## Gráficos

1. Abra `/graficos` como administrador, líder, músico aprovado e visitante pela consulta pública liberada. Os dados devem corresponder ao recorte disponível em cada acesso, sem e-mails, perfis privados ou ações de escrita para visitante.
2. Confira **Todos os cultos**, 30/90 dias, ano e datas livres, além do filtro por temática. Os períodos recentes terminam hoje em São Paulo; o histórico completo pode incluir cultos futuros. Inverta as datas para conferir erro compreensível sem números enganosos.
3. Use uma fixture com pessoa em duas funções e música repetida no mesmo culto. Pessoa e música contam uma vez naquele culto; funções contam suas atribuições. Etiquetas sobrepostas podem somar mais de 100%, com nota explicativa. A escala não deve ser descrita como presença confirmada.
4. Confira evolução, rankings com pesquisa/limite, temáticas, horários e equipe/repertório preenchidos. **Ver números do gráfico** deve oferecer os valores em tabela. Totais de cadastro atual não devem mudar ao filtrar o período. Banco vazio e filtro sem resultados devem mostrar estados vazios, sem exemplos inventados.
5. Repita em 350/390 px, com teclado e sem rolagem horizontal. Trocar filtros não deve gravar dados ou alterar cultos.

## Fotos de perfil e integrantes

1. Use contas temporárias e imagens de teste. Em `/perfil`, escolha PNG/JPEG/WebP válido de até 10 MiB, confira recorte/prévia e clique em **Salvar foto**. Escolher e cancelar não devem enviar imagem; após salvar/recarregar, a foto deve permanecer e identificar a conta no cabeçalho.
2. No cadastro de integrante, administrador escolhe foto e salva a pessoa. Músico/líder/visitante não devem receber essa edição. Foto da pessoa e foto da conta permanecem armazenadas separadamente; alterar uma não copia nem substitui a outra. Vincule uma conta temporária aprovada à pessoa em **Administração** e confira a prioridade de exibição: equipe/escala usam foto da pessoa, senão foto da conta; perfil/cabeçalho usam selfie própria, senão foto da pessoa vinculada.
3. Confira preparação local para até 512 px e 300 KiB, rejeição de tipo inválido/SVG/arquivo excessivo e remoção confirmada ao salvar. Falha de upload/RPC deve manter o formulário revisável, sem confirmar um salvamento inexistente.
4. No Supabase real autorizado, confira bucket público `avatars` com limite de 2 MiB, upload em `UID/UUID.ext` novo, rejeição de sobrescrita e escrita no UID de outra conta. Arquivo ainda referenciado por pessoa/perfil não pode ser excluído; foto própria não altera papel/aprovação/vínculo.
5. Na consulta pública liberada, confira fotos das pessoas e leitura das URLs de imagem, mantendo e-mails/perfis de conta privados. Desativar consulta não deve ser apresentado como tornar privado o bucket de imagens.
6. Confirme remoção de contas, pessoas e objetos temporários criados para o teste; preserve imagens e dados do proprietário. Resultados com Auth/Storage simulados e checagem de migração devem ser registrados separadamente do teste real de upload/RLS.
7. Remova somente a foto prioritária da fixture e confira retorno à alternativa, sem alterar a URL armazenada no outro cadastro. Na escala/resumo do culto, confira imagem em desktop e celular, incluindo fallback de iniciais quando nenhuma foto existir.
8. Desvincule ou retire aprovação da conta temporária: a próxima leitura da equipe/consulta pública não deve receber sua selfie como alternativa. O RPC `read_team_profile_photos()` deve rejeitar visitante e conta não aprovada e retornar somente `personId`/`photoUrl` para acesso aprovado. A consulta pública pode receber `accountPhotoUrl` somente da conta aprovada vinculada, sem campos de ID de Auth, e-mail ou papel; URLs de imagem podem conter UUIDs no caminho do arquivo.
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

Espere a primeira instalação do service worker e recarregue para a página ficar sob seu controle. Confira que o cache contém apenas arquivos estáticos, sem respostas de Auth, PostgREST ou fontes externas. Sem internet, o shell pode abrir, mas uma nova consulta aos dados reais ou às fontes deve informar indisponibilidade; não espere dados fictícios ou sincronização offline. Com uma versão nova disponível, confira o aviso **Atualização disponível** e as ações **Atualizar agora** e **Depois**. A página só deve recarregar após a escolha de atualizar; um rascunho preenchido precisa continuar disponível na mesma aba após o recarregamento. Valide a instalação em Android/iPhone reais separadamente do Chromium automatizado.
