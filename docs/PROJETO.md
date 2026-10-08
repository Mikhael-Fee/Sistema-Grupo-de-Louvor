# Candeia — definição do produto

Fonte: especificação “Sistema Web para Ministério de Louvor” enviada pelo proprietário, com os fluxos atuais do Candeia. O escopo cobre autenticação, biblioteca, equipe, etiquetas, cultos, escalas, repertórios, gráficos e fotos opcionais, além da consulta sem cadastro. Este documento descreve os fluxos deste checkout; a versão publicada, os resultados e limites de validação estão em [VALIDACAO.md](VALIDACAO.md). Medleys completos, disponibilidade, confirmação de presença e sincronização offline ficam em etapas posteriores.

## Requisitos e fluxos

- Login por e-mail e senha no Supabase. Cadastro cria um perfil de músico pendente de aprovação; a promoção exige administrador. O primeiro administrador é definido no SQL Editor, nunca por escolha na interface. A aplicação trabalha com dados reais do ministério e começa vazia quando nenhum cadastro foi feito.
- **Entrar sem cadastro** → `/consulta` → cultos, equipe e repertório reais → música → letra/cifra, ajuste de tom e vídeo. A consulta depende de liberação explícita em **Administração** e permite somente leitura. A transposição altera apenas a visualização do visitante; e-mails cadastrados, contatos e perfis de acesso permanecem privados.
- Início → próximo culto → equipe e repertório ordenado → música. Músicos aprovados acompanham as informações sem modificar o cadastro nem o planejamento.
- Biblioteca → pesquisa por título/artista, tom e combinação de etiquetas → detalhes; administrador cria, edita ou remove música. O único campo editável **Letra e cifra** usa acordes entre colchetes e também aceita texto colado. **Tom na igreja** determina o tom dos acordes armazenados; alterar esse valor no editor transpõe o conteúdo. O tom específico de cada culto continua independente.
- Cultos → lista por data → criação/edição → equipe por pessoa e função → repertório com ordem, tom e observação específicos. **Tipo de culto** aceita uma temática livre obrigatória de até 100 caracteres, como **Santa Ceia**, **Culto de sábado** ou **Culto de louvor**, com sugestões e filtro incluindo os tipos já usados. Administradores e líderes planejam; músicos e visitantes visualizam. **Selecionar equipe** ou **Editar equipe** abre o único editor da escala: selecione várias pessoas e funções, desmarque para retirar alguém e confirme **Salvar equipe**; **Reutilizar última escala** aproveita a equipe de um culto anterior, preserva os integrantes já escalados e ignora vínculos inválidos ou repetidos. **Selecionar músicas** é a única inclusão do repertório: mantém marcações entre buscas, impede duplicatas, adiciona na ordem dos cliques com o tom da igreja e exige **Adicionar selecionadas** ou **Salvar culto** para gravar.
- Equipe → nome, e-mail opcional e várias funções. Etiquetas → nome e cor. Administração → aprovação, perfis, permissões e consulta pública. **Permitir consulta sem cadastro** só altera a configuração compartilhada após **Salvar acesso público**; o administrador pode copiar o link, abrir a consulta e desativar o acesso.
- **Meu perfil** → escolher/remover foto → **Salvar foto** altera somente a imagem da própria conta. Administradores também editam fotos de integrantes em **Equipe** e vinculam uma conta à pessoa em **Administração**; pessoas já usadas por outro perfil ficam indisponíveis. Equipe/escala priorizam foto explícita da pessoa, senão usam foto da conta aprovada vinculada. Perfil/cabeçalho priorizam foto própria, senão usam foto da pessoa vinculada. Os arquivos continuam independentes, sem copiar URLs entre cadastros; desfazer o vínculo ou a aprovação retira a alternativa da conta na próxima leitura. PNG/JPEG/WebP de até 10 MiB são recortados e reduzidos localmente para até 512 px e 300 KiB; escolher ou cancelar não envia arquivo. A imagem salva é pública e usa um novo objeto imutável; a operação não altera papel, aprovação ou vínculo da conta.
- **Gráficos** → filtros de período e temática → evolução, pessoas mais escaladas, músicas mais usadas, temáticas, funções, etiquetas, horários e preenchimento do planejamento. Contas aprovadas e consulta pública liberada leem os dados disponíveis em seu acesso, sem ações de edição. Períodos de 30/90 dias e ano terminam no dia atual do ministério em São Paulo; **Todos os cultos** inclui encontros futuros. Uma pessoa e uma música contam uma vez por culto; atribuições de funções e múltiplas etiquetas têm seus próprios denominadores. Percentuais de etiquetas podem somar mais de 100%, com explicação visível. Totais de cadastro mostram o estado atual, sem variar com o período. Escala é planejamento, não presença confirmada.
- Formulários de música, pessoa, etiqueta, culto e ajustes de escala/repertório mantêm rascunhos em `sessionStorage`, separados por conta e aba. Fechar o diálogo ou navegar preserva os campos nessa aba; **Cancelar** descarta o rascunho, e a ação explícita de salvar ou adicionar grava no banco. Sair da conta limpa seus rascunhos na aba atual. Eles não são sincronizados entre dispositivos e dependem da disponibilidade do armazenamento do navegador.
- Uma versão PWA nova oferece **Atualizar agora** ou **Depois**. A atualização recarrega por escolha do usuário, com rascunhos preservados na mesma aba; mudanças de foco e renovação de sessão não devem desmontar editores.
- Web responsiva em português, com a marca Candeia visível no login e nos cabeçalhos de computador e celular, instalável como PWA. O leitor ajusta os versos à largura, mantém acordes junto aos trechos correspondentes e oferece controles de pelo menos 44 px, fonte de 14 a 28 px e modo leitura ocupando a tela. Esse modo mantém controles acessíveis, permite sair pelo botão ou por Escape e devolve o foco ao botão de entrada. Cache somente do shell estático; dados compartilhados não entram no cache do service worker. A consulta e as alterações precisam de conexão com o Supabase.

## Importação de letra e cifra

O editor usa um único botão **Pesquisar cifra e letra**, com título e artista do cadastro. A lista reúne versões do Cifra Club primeiro e letras LRCLIB, identificando a origem e a presença de acordes. O catálogo Worship Together deixou o fluxo da interface; a função mantém compatibilidade com consultas antigas.

A consulta de metadados do Cifra Club respondeu com versões reais, mas a leitura das páginas pelo servidor recebeu HTTP 403. A alternativa automática é o **importador pelo navegador**, uma extensão para Chrome/Edge no computador, instalada uma vez pela página `/conectar-cifra-club`. Com a extensão conectada, **Ver prévia** lê a página escolhida no navegador do usuário em uma aba temporária e recebe seus acordes, sem copiar e colar. A consulta termina fechando somente a aba criada pela extensão. Uma consulta por aba, timeout e cancelamento evitam acumular abas ou processamento.

A cifra precisa abrir normalmente no navegador local; a extensão não resolve um bloqueio nessa página e não funciona no Chrome de celular. No **Android/iPhone**, o guia orienta abrir a cifra no navegador, usar **Imprimir → Salvar como PDF** e escolher o arquivo em **Biblioteca → Nova música → Escolher PDF da cifra**. No Safari, a prévia de impressão pode ser ampliada e compartilhada para **Salvar em Arquivos**. O Candeia extrai letra e acordes para revisar, importar e salvar no único campo existente. Os guias de favorito JavaScript e Atalhos foram retirados após a falha relatada no Chrome/Xiaomi; artefatos e receptor antigos permanecem somente por compatibilidade, sem afirmar suporte em aparelhos.

O PDF deve conter texto selecionável, ter até 8 MiB, 20 páginas, 100.000 caracteres e 30.000 itens de texto. PDF.js 6 e seu worker são carregados sob demanda; a leitura local processa páginas em sequência, libera cada página e destrói o worker ao terminar, cancelar ou exceder 25 segundos. Não há OCR, renderização das páginas ou upload do PDF. Fotos, documentos digitalizados e PDFs com senha são recusados com orientação para gerar novamente pelo navegador. A extração reconstrói alinhamento e colunas, limpa títulos de navegação e cabeçalhos de impressão e preserva os acordes, capotraste e tom-base para a revisão. Metadados e referência canônica são usados quando disponíveis; ausências exigem preenchimento ou confirmação pelo usuário. O banco só recebe o texto revisado após salvar.

**Importar PDFs** na biblioteca abre **Importar vários PDFs**, separado do formulário de música individual. **Escolher PDFs** permite até 20 arquivos, 8 MiB cada e 80 MiB somados, lidos em sequência com progresso; cada PDF corresponde a uma música. A revisão permite conferir metadados, conteúdo, **Tom dos acordes recebidos** e **Tom na igreja** de cada item antes de **Salvar selecionadas**. Leitura e seleção não criam registros no banco, e o PDF não é enviado. Os limites e a liberação do worker de cada arquivo continuam os mesmos da opção individual.

Duplicatas por título/artista ou conteúdo ficam desmarcadas; selecioná-las explicitamente cria outro cadastro com novo ID, sem sobrescrever a música existente. Salvamento do lote é por item, sem uma transação única: sucessos ficam marcados **Salva** e não entram em nova tentativa, enquanto falhas continuam revisáveis. Repetir a gravação de um item usa seu mesmo UUID para evitar duplicação após uma resposta de rede perdida. Cancelar leitura preserva itens já processados; interromper salvamento termina a música atual e deixa as próximas pendentes.

No celular, as cifras salvas permitem consulta, ajuste de fonte e transposição. Os testes usam extensão real, arquivos PDF controlados e viewports móveis de Chromium; a impressão nos menus de aparelhos físicos deve ser conferida separadamente. Os limites da fonte real e dos aparelhos constam em [VALIDACAO.md](VALIDACAO.md). A leitura pelo servidor continua bloqueada. Falhas preservam o rascunho. O LRCLIB permanece como fonte automática de letras sem acordes quando disponível. A versão **1.1.1** da extensão corrige o artista identificado como **Menu principal**, priorizando metadados da música e links de artista; também preserva a limpeza de tablaturas e o tratamento de capotraste. O frontend recusa esse rótulo de navegação mesmo em respostas de uma extensão antiga, mantendo o artista da versão escolhida. Usuários podem substituir os arquivos, recarregar a extensão e atualizar o Candeia pela orientação em `/conectar-cifra-club`.

**Ver prévia** não altera o formulário. Marcar **Atualizar título e artista com os dados da fonte** já preenche os dados recebidos. **Importar cifra e letra** preenche o único campo **Letra e cifra**; versões LRCLIB preenchem esse mesmo campo com letra sem acordes. Quando o campo está vazio e a opção de metadados está marcada, **Salvar música** importa e salva a prévia selecionada, sem exigir redigitar o conteúdo. Texto anterior exige confirmação explícita de substituição na prévia. Dados obrigatórios que a fonte não fornecer ainda precisam ser preenchidos. A importação modifica o rascunho; a ação de salvar grava no banco com a origem nas observações. **Ver somente letra na prévia** e **Somente letra** no leitor ocultam os acordes localmente do mesmo conteúdo, sem outro campo para letra.

A limpeza retira tablaturas de guitarra/violão, inclusive tabs de introdução e solo, diagramas, afinação e instruções de capotraste, preservando os acordes, versos e indicações de estrutura como **[Intro]** e **[Solo]**. Linhas instrumentais sem letra têm intervalo de pelo menos 8 px entre acordes; linhas com versos preservam o alinhamento. O leitor também limpa cifras antigas na visualização, sem alterar registros. O editor permite escrever ou colar no próprio campo **Letra e cifra**; linhas de acordes são convertidas para ChordPro. O painel separado de importação manual e seu campo de URL foram removidos. A referência da versão importada permanece nas observações, e o leitor oferece **Abrir Cifra Club**, inclusive para visitantes.

O editor usa o tom dos acordes escritos na fonte para convertê-los de fato ao **Tom na igreja**, sem um seletor comum de **Tom original**. PDF e Cifra Club priorizam o tom escrito explícito; se houver somente tom sonoro e casa do capotraste, subtraem esse intervalo para obter a base escrita. **Tom sonoro Bb/capo3 → posições G**, com **G** como tom inicial na igreja quando o usuário ainda não escolheu outro. Escolher **Bb** converte G→Bb uma vez, sem somar o capotraste novamente. Uma escolha manual de tom na igreja é preservada.

Sem dados confiáveis da fonte, a estimativa usa o conjunto e a sequência dos acordes, considerando candidatos maiores e menores. Confiança alta ou média pode preencher o tom com indicação **PROVÁVEL**, mantendo revisão/edição; baixa confiança exige confirmação de **Tom dos acordes recebidos**. Não basta o primeiro acorde. G/A/D pode sugerir D com alta confiança; G/A/D/Bm/C pode sugerir D com confiança média e C como possível acorde emprestado, sem provar essa análise. Modulação, poucos acordes ou candidatos próximos podem deixar a estimativa ambígua. Cadastros antigos com tom incorreto continuam exigindo correção explícita ou nova importação; não há reinterpretação automática do catálogo salvo.

O conteúdo é limitado a 100.000 caracteres, com prévia de até 12.000. O reconhecimento de acordes trata texto malformado sem a expressão regular de comportamento exponencial encontrada na investigação; os limites das medições de memória estão em [VALIDACAO.md](VALIDACAO.md).

## Wireframes

```text
Computador: [Candeia | barra lateral: início/cultos/biblioteca/equipe/etiquetas/admin]
            [título e ação principal                            perfil]
            [próximo culto + abrir] [resumo do ministério              ]
            [repertório ordenado ] [equipe                           ]
            [próximos cultos                                            ]

Celular:    [Candeia                                 perfil]
            [título]
            [próximo culto → abrir]
            [repertório / equipe]
            [navegação inferior: início/cultos/músicas/equipe/mais]

Música:     [voltar] [título / artista]
            [letra | letra + cifra] [−] [tom] [+] [tamanho]
            [acordes alinhados acima de cada trecho]
            [observações gerais e do culto] [YouTube]

Consulta:   [/consulta → cultos / biblioteca / equipe / etiquetas]
            [transposição local; sem edição, contatos ou administração]

Editor:     [rascunho guardado nesta aba]
            [título / artista → pesquisar cifra e letra → versões → prévia → importar]
            [tom na igreja → único campo editável de letra e cifra]
            [Cancelar] [Salvar música ou culto]
```

## Modelo de dados

Perfis (id ligado ao auth.users, nome, papel, aprovação, pessoa opcional, foto opcional); pessoas (nome, e-mail, funções, foto opcional); etiquetas (nome, cor); músicas (título, artista, tons, conteúdo estruturado, vídeo, observações, etiquetas); cultos (data local, horário, tipo, observações); escala (culto, pessoa, função); repertório (culto, música, posição, tom, observação); configuração de consulta pública (habilitada ou desabilitada). Referências preservam integridade: músicas e pessoas em uso não podem ser removidas. Tons do repertório não alteram as músicas. Rascunhos ficam no navegador e não são registros compartilhados. Gráficos são derivados dos dados existentes, sem novas tabelas de presença ou contadores persistidos.

O campo `original_key` continua no esquema por compatibilidade. Nos novos salvamentos, o conteúdo é transposto para `church_key` e ambos os campos recebem esse tom. Registros anteriores continuam sendo lidos a partir de seu tom-base armazenado; um tom-base que já estivesse incorreto exige a correção explícita no editor. Não há alteração automática de todo o catálogo nem inferência do tom pelo primeiro acorde.

A migração `003_custom_service_types.sql` troca somente a restrição fixa de `services.type` pela validação de temática não vazia e de até 100 caracteres. Tipos existentes e os demais registros são preservados; o helper `scripts/configure-service-types.mjs --apply` verifica o schema conhecido antes de aplicar a migração ausente. Essa mudança não modifica Auth, RLS ou permissões de planejamento.

A migração `004_profile_photos.sql` acrescenta `photo_url` opcional em perfis e pessoas, um bucket público `avatars` de até 2 MiB por objeto e o RPC de alteração da própria foto. Uploads usam o UID do usuário e um UUID novo no nome; não há sobrescrita de objetos. RLS impede upload no espaço de outra conta e exclusão de uma imagem ainda referenciada por perfil ou pessoa. URLs aceitas pertencem ao bucket do projeto. O RPC altera somente a foto própria, sem modificar permissões. O recorte público inclui fotos das pessoas e continua omitindo e-mails e perfis de conta.

`005_linked_profile_photos.sql` acrescenta `read_team_profile_photos()`, permitido apenas a contas aprovadas e limitado a `personId` da pessoa e URL pública da foto de contas aprovadas vinculadas. O adapter compõe `Person.accountPhotoUrl` separadamente de `photoUrl`; esse campo de exibição não é copiado para `people.photo_url`. A consulta pública liberada também recebe essa alternativa de imagem, sem campos de ID da conta, e-mail, papel ou outros dados de perfil; URLs públicas podem conter UUIDs no caminho do arquivo. Remover vínculo/aprovação deixa de retornar a alternativa. Vínculos existentes, imagens e permissões de escrita são preservados.

## Permissões

| Operação | Administrador aprovado | Líder aprovado | Músico aprovado | Visitante sem cadastro |
| --- | --- | --- | --- | --- |
| Ler cultos, nomes, funções, músicas e etiquetas | Sim | Sim | Sim | Se a consulta estiver liberada |
| Ler e-mails cadastrados na equipe | Sim | Sim | Sim | Não |
| Gerenciar músicas, pessoas, etiquetas | Sim | Não | Não | Não |
| Criar/editar cultos, escala e repertório | Sim | Sim | Não | Não |
| Consultar todos os perfis, aprovar acessos e alterar papéis | Sim | Não | Não | Não |
| Liberar/desativar consulta sem cadastro | Sim | Não | Não | Não |
| Transpor visualização | Sim | Sim | Sim | Se a consulta estiver liberada |
| Consultar gráficos do planejamento | Sim | Sim | Sim | Se a consulta estiver liberada |
| Alterar foto da própria conta | Sim | Sim | Sim | Não |
| Alterar fotos de integrantes da equipe | Sim | Não | Não | Não |

Regras de autenticação e edição também são aplicadas por RLS no PostgreSQL. A consulta pública usa campos definidos e e-mails vazios, mantendo os privilégios privados das tabelas. A migração 005 permite somente a foto pública de conta aprovada vinculada como alternativa de imagem da pessoa, sem expor dados de conta/perfil. A configuração começa desabilitada e exige um administrador aprovado para ser alterada. Nomes, funções, fotos, letras, cifras e observações musicais/de planejamento são compartilhados quando a consulta é liberada; dados privados não devem ser colocados nessas observações.

Instalação dedicada a uma única igreja; multi-igreja é evolução futura. Novos músicos precisam de aprovação administrativa para acessar os dados autenticados. Enquanto aguardam, podem usar apenas a mesma consulta sem cadastro disponível aos visitantes, se ela estiver liberada.

## Critérios de aceitação

1. Build TypeScript e testes de domínio passam. Transposição trata sustenidos, bemóis, baixos invertidos e extensões; mantém texto intacto. O produto não oferece uma base fictícia nem um seletor para simular permissões.
2. Perfis autorizados criam música/pessoa/etiqueta/culto, montam escala/repertório, reordenam e alteram o tom por culto. Rascunhos sobrevivem à navegação e ao recarregamento na mesma aba; Cancelar descarta, salvar confirma no banco e logout limpa os rascunhos da conta.
3. Filtros de múltiplas etiquetas exigem todas as selecionadas. Validação rejeita campos obrigatórios vazios e URLs de vídeo incompatíveis.
4. Músico e visitante não veem ações de edição; SQL rejeita alteração por não autorizado e autoelevação de papel. Cadastro não implica aprovação. A consulta pública entrega dados reais somente quando habilitada, sem e-mails ou perfis; desativá-la bloqueia novas consultas. Transposição de visitante não altera músicas ou repertórios.
5. O leitor funciona com larguras de 320, 350 e 390 px sem rolagem horizontal, com áreas de toque de pelo menos 44 px e fonte de 14 a 28 px. Diálogos, campos e ações possuem nomes acessíveis; o modo leitura permite sair e restaura o foco. Testes em navegador com viewport móvel não substituem validação em Android/iPhone reais.
6. Um único editor de equipe em lote permite selecionar, alterar funções e retirar integrantes de uma vez; funções múltiplas e rascunhos são preservados. Escala e reaproveitamento da última escala evitam duplicações e funções inexistentes. Adição de repertório em lote mantém seleção entre buscas, impede duplicatas, respeita ordem dos cliques e preserva os tons específicos dos itens já salvos. Temáticas de cultos aceitam texto livre obrigatório de até 100 caracteres e ficam disponíveis nas sugestões e no filtro após salvar.
7. Uma única pesquisa usa título/artista, prioriza resultados Cifra Club e oferece letras LRCLIB na mesma lista. Fonte, prévia e erro de acesso são explícitos; o bloqueio da leitura pelo servidor permanece registrado. A importação preenche um único campo editável de letra e cifra, retira tablaturas e converte os acordes escritos para o tom da igreja, inclusive quando há capotraste. Tom ambíguo exige confirmação. A opção de metadados preenche título e artista; com conteúdo vazio, salvar importa a prévia selecionada. Substituir conteúdo anterior exige confirmação. A letra é derivada ocultando acordes desse mesmo campo; não há painel separado de importação manual. A atualização PWA também exige ação explícita e mantém rascunhos na mesma aba.
8. Manifest e service worker são gerados no build. Uso real de Auth/RLS e da consulta exige configurações públicas, aplicação das migrações e teste em um projeto Supabase configurado. Busca de cifras exige também a função Netlify publicada; build local sozinho não comprova esse fluxo em produção.
9. A importação pelo celular lê um PDF com texto selecionável salvo pela impressão do navegador. A opção individual continua em **Nova música**, e **Importar PDFs** permite lote de até 20 arquivos/80 MiB total com leitura sequencial, progresso e revisão por música. Limites por arquivo, páginas, texto, itens e tempo são aplicados; cancelamento e fim liberam recursos. Não envia PDF nem usa OCR. Só um administrador aprovado pode importar e salvar após revisar metadados e tom. A origem fica disponível quando o PDF inclui seu link. Testes de PDF/Chromium não são apresentados como validação do menu de impressão em aparelhos físicos.
10. Gráficos respeitam o período, a temática e o recorte de dados do acesso, sem gravação. Pessoas e músicas são deduplicadas por culto; funções adicionais e etiquetas mantêm seus denominadores, com explicação de percentuais sobrepostos. Totais atuais de cadastro não mudam ao filtrar histórico; escala não é tratada como presença.
11. Fotos aceitam PNG/JPEG/WebP válidos, respeitam limites e só são enviadas ao salvar. Foto própria não modifica papel/aprovação e foto da equipe exige administrador. Storage rejeita escrita no UID de outro usuário, sobrescrita e exclusão de imagens referenciadas. Consulta pública pode exibir fotos das pessoas e mantém e-mails/perfis privados.
12. PDF e Cifra Club preservam o tom escrito como padrão de importação; capotraste é subtraído somente quando a fonte fornece apenas o tom sonoro. Escolha manual do tom da igreja é mantida. Estimativa de tom usa vários acordes e informa **PROVÁVEL** para confiança alta/média; ambiguidade exige confirmação. Limpeza remove tabs de Intro/Solo sem perder rótulos/acordes, e instrumentais têm espaçamento sem afetar acordes alinhados aos versos.
13. Fotos da conta e integrante mantêm seus cadastros separados e a prioridade adequada na escala/equipe ou perfil. Uma conta só usa uma pessoa não vinculada a outro perfil. O RPC privado de imagens exige aprovação, o recorte público expõe apenas a imagem já pública da conta aprovada vinculada, e desvincular/desaprovar retira essa alternativa sem regravar ou excluir fotos.

## Roadmap

1. Acompanhar a importação do Cifra Club com extensão e PDF em um culto; validar impressão, leitura e instalação PWA em Android/iPhone reais; configurar SMTP para os demais integrantes.
2. Acompanhar equipe, repertório em lote e temáticas livres com os dados do ministério, preservando ordem, ausência de duplicações e tom próprio de cada culto.
3. Integrar builds automáticos ao mesmo site Netlify, se desejado, e acompanhar os resultados do CI.
4. Medleys, disponibilidade e confirmação; depois cache de repertório recente com consentimento, histórico de alterações e sugestões.

Build, testes locais e existência do código não comprovam que a versão publicada ou o banco externo já foram atualizados. O resultado de cada validação e da publicação deve constar em [VALIDACAO.md](VALIDACAO.md). Não há promessa de custo fixo: limites e condições dos planos gratuitos e das fontes externas devem ser conferidos no momento da publicação.
