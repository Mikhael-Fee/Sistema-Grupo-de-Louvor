# Candeia — definição do produto

Fonte: especificação “Sistema Web para Ministério de Louvor” enviada pelo proprietário, com os fluxos atuais do Candeia. O escopo cobre autenticação, biblioteca, equipe, etiquetas, cultos, escalas e repertórios, além da consulta sem cadastro. Este documento descreve os fluxos deste checkout; a versão publicada, os resultados e limites de validação estão em [VALIDACAO.md](VALIDACAO.md). Medleys completos, disponibilidade, confirmação, estatísticas e sincronização offline ficam em etapas posteriores.

## Requisitos e fluxos

- Login por e-mail e senha no Supabase. Cadastro cria um perfil de músico pendente de aprovação; a promoção exige administrador. O primeiro administrador é definido no SQL Editor, nunca por escolha na interface. A aplicação trabalha com dados reais do ministério e começa vazia quando nenhum cadastro foi feito.
- **Entrar sem cadastro** → `/consulta` → cultos, equipe e repertório reais → música → letra/cifra, ajuste de tom e vídeo. A consulta depende de liberação explícita em **Administração** e permite somente leitura. A transposição altera apenas a visualização do visitante; e-mails cadastrados, contatos e perfis de acesso permanecem privados.
- Início → próximo culto → equipe e repertório ordenado → música. Músicos aprovados acompanham as informações sem modificar o cadastro nem o planejamento.
- Biblioteca → pesquisa por título/artista, tom e combinação de etiquetas → detalhes; administrador cria, edita ou remove música. O único campo editável **Letra e cifra** usa acordes entre colchetes e também aceita texto colado. **Tom na igreja** determina o tom dos acordes armazenados; alterar esse valor no editor transpõe o conteúdo. O tom específico de cada culto continua independente.
- Cultos → lista por data → criação/edição → equipe por pessoa e função → repertório com ordem, tom e observação específicos. Administradores e líderes planejam; músicos e visitantes visualizam. **Selecionar equipe** ou **Editar equipe** abre o único editor da escala: selecione várias pessoas e funções, desmarque para retirar alguém e confirme **Salvar equipe**; **Reutilizar última escala** aproveita a equipe de um culto anterior, preserva os integrantes já escalados e ignora vínculos inválidos ou repetidos. A seleção de várias músicas para adicionar ao repertório em uma ação permanece um requisito a concluir e validar.
- Equipe → nome, e-mail opcional e várias funções. Etiquetas → nome e cor. Administração → aprovação, perfis, permissões e consulta pública. **Permitir consulta sem cadastro** só altera a configuração compartilhada após **Salvar acesso público**; o administrador pode copiar o link, abrir a consulta e desativar o acesso.
- Formulários de música, pessoa, etiqueta, culto e ajustes de escala/repertório mantêm rascunhos em `sessionStorage`, separados por conta e aba. Fechar o diálogo ou navegar preserva os campos nessa aba; **Cancelar** descarta o rascunho, e a ação explícita de salvar ou adicionar grava no banco. Sair da conta limpa seus rascunhos na aba atual. Eles não são sincronizados entre dispositivos e dependem da disponibilidade do armazenamento do navegador.
- Uma versão PWA nova oferece **Atualizar agora** ou **Depois**. A atualização recarrega por escolha do usuário, com rascunhos preservados na mesma aba; mudanças de foco e renovação de sessão não devem desmontar editores.
- Web responsiva em português, com a marca Candeia visível no login e nos cabeçalhos de computador e celular, instalável como PWA. O leitor ajusta os versos à largura, mantém acordes junto aos trechos correspondentes e oferece controles de pelo menos 44 px, fonte de 14 a 28 px e modo leitura ocupando a tela. Esse modo mantém controles acessíveis, permite sair pelo botão ou por Escape e devolve o foco ao botão de entrada. Cache somente do shell estático; dados compartilhados não entram no cache do service worker. A consulta e as alterações precisam de conexão com o Supabase.

## Importação de letra e cifra

O editor usa um único botão **Pesquisar cifra e letra**, com título e artista do cadastro. A lista reúne versões do Cifra Club primeiro e letras LRCLIB, identificando a origem e a presença de acordes. O catálogo Worship Together deixou o fluxo da interface; a função mantém compatibilidade com consultas antigas.

A consulta de metadados do Cifra Club respondeu com versões reais, mas a leitura das páginas pelo servidor recebeu HTTP 403. A alternativa automática é o **importador pelo navegador**, uma extensão para Chrome/Edge no computador, instalada uma vez pela página `/conectar-cifra-club`. Com a extensão conectada, **Ver prévia** lê a página escolhida no navegador do usuário em uma aba temporária e recebe seus acordes, sem copiar e colar. A consulta termina fechando somente a aba criada pela extensão. Uma consulta por aba, timeout e cancelamento evitam acumular abas ou processamento.

A cifra precisa abrir normalmente no navegador local; a extensão não resolve um bloqueio nessa página e não funciona no Chrome de celular. No celular, as cifras já salvas permitem consulta, ajuste de fonte e transposição. Os testes usam extensão real e páginas de fixture; os limites de validação da fonte real e dos aparelhos constam em [VALIDACAO.md](VALIDACAO.md). A leitura sem extensão continua dependendo do servidor bloqueado. Falhas preservam o rascunho. O LRCLIB permanece como fonte automática de letras sem acordes quando disponível. A versão **1.1.0** da extensão reconhece capotraste e limpa tablaturas; usuários da versão anterior precisam substituir os arquivos, recarregar a extensão e atualizar o Candeia pela orientação em `/conectar-cifra-club`.

**Ver prévia** não altera o formulário. Marcar **Atualizar título e artista com os dados da fonte** já preenche os dados recebidos. **Importar cifra e letra** preenche o único campo **Letra e cifra**; versões LRCLIB preenchem esse mesmo campo com letra sem acordes. Quando o campo está vazio e a opção de metadados está marcada, **Salvar música** importa e salva a prévia selecionada, sem exigir redigitar o conteúdo. Texto anterior exige confirmação explícita de substituição na prévia. Dados obrigatórios que a fonte não fornecer ainda precisam ser preenchidos. A importação modifica o rascunho; a ação de salvar grava no banco com a origem nas observações. **Ver somente letra na prévia** e **Somente letra** no leitor ocultam os acordes localmente do mesmo conteúdo, sem outro campo para letra.

A limpeza retira tablaturas de guitarra/violão, diagramas, afinação e instruções de capotraste, preservando os acordes, versos e indicações de estrutura. O leitor também limpa cifras antigas na visualização, sem alterar registros. O editor permite escrever ou colar no próprio campo **Letra e cifra**; linhas de acordes são convertidas para ChordPro. O painel separado de importação manual e seu campo de URL foram removidos. A referência da versão importada permanece nas observações, e o leitor oferece **Abrir Cifra Club**, inclusive para visitantes.

O editor usa o tom dos acordes escritos na fonte para convertê-los de fato ao **Tom na igreja**, sem um seletor comum de **Tom original**. Posições em G com capotraste na 3ª casa têm tom sonoro Bb; para teclado em Bb, a conversão é G → Bb uma vez, sem somar o capotraste novamente. Capotraste e tom sonoro reconhecidos aparecem na prévia. Quando os dados não permitem distinguir o tom das posições do tom sonoro, a importação pede **Tom dos acordes recebidos** uma vez; o primeiro acorde não é suficiente para determinar esse tom. Conteúdo colado sem tom reconhecido usa a mesma confirmação. Cadastros antigos com tom incorreto podem ser ajustados na seção recolhida **Corrigir cifra com tom incorreto**, informando o tom real dos acordes atuais, ou recebendo uma nova importação; a correção só é gravada ao salvar.

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

Perfis (id ligado ao auth.users, nome, papel, aprovação, pessoa opcional); pessoas (nome, e-mail, funções); etiquetas (nome, cor); músicas (título, artista, tons, conteúdo estruturado, vídeo, observações, etiquetas); cultos (data local, horário, tipo, observações); escala (culto, pessoa, função); repertório (culto, música, posição, tom, observação); configuração de consulta pública (habilitada ou desabilitada). Referências preservam integridade: músicas e pessoas em uso não podem ser removidas. Tons do repertório não alteram as músicas. Rascunhos ficam no navegador e não são registros compartilhados.

O campo `original_key` continua no esquema por compatibilidade. Nos novos salvamentos, o conteúdo é transposto para `church_key` e ambos os campos recebem esse tom. Registros anteriores continuam sendo lidos a partir de seu tom-base armazenado; um tom-base que já estivesse incorreto exige a correção explícita no editor. Não há alteração automática de todo o catálogo nem inferência do tom pelo primeiro acorde.

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

Regras de autenticação e edição também são aplicadas por RLS no PostgreSQL. A migração `002_public_consultation.sql` cria uma resposta pública com campos definidos, e-mails vazios e sem consulta a perfis ou contas, mantendo os privilégios privados das tabelas. A configuração começa desabilitada e exige um administrador aprovado para ser alterada. Nomes, funções, letras, cifras e observações musicais/de planejamento são compartilhados quando a consulta é liberada; dados privados não devem ser colocados nessas observações.

Instalação dedicada a uma única igreja; multi-igreja é evolução futura. Novos músicos precisam de aprovação administrativa para acessar os dados autenticados. Enquanto aguardam, podem usar apenas a mesma consulta sem cadastro disponível aos visitantes, se ela estiver liberada.

## Critérios de aceitação

1. Build TypeScript e testes de domínio passam. Transposição trata sustenidos, bemóis, baixos invertidos e extensões; mantém texto intacto. O produto não oferece uma base fictícia nem um seletor para simular permissões.
2. Perfis autorizados criam música/pessoa/etiqueta/culto, montam escala/repertório, reordenam e alteram o tom por culto. Rascunhos sobrevivem à navegação e ao recarregamento na mesma aba; Cancelar descarta, salvar confirma no banco e logout limpa os rascunhos da conta.
3. Filtros de múltiplas etiquetas exigem todas as selecionadas. Validação rejeita campos obrigatórios vazios e URLs de vídeo incompatíveis.
4. Músico e visitante não veem ações de edição; SQL rejeita alteração por não autorizado e autoelevação de papel. Cadastro não implica aprovação. A consulta pública entrega dados reais somente quando habilitada, sem e-mails ou perfis; desativá-la bloqueia novas consultas. Transposição de visitante não altera músicas ou repertórios.
5. O leitor funciona com larguras de 320, 350 e 390 px sem rolagem horizontal, com áreas de toque de pelo menos 44 px e fonte de 14 a 28 px. Diálogos, campos e ações possuem nomes acessíveis; o modo leitura permite sair e restaura o foco. Testes em navegador com viewport móvel não substituem validação em Android/iPhone reais.
6. Um único editor de equipe em lote permite selecionar, alterar funções e retirar integrantes de uma vez; funções múltiplas e rascunhos são preservados. Escala e reaproveitamento da última escala evitam duplicações e funções inexistentes. Adição de repertório em lote precisa atender ao mesmo princípio de confirmação explícita e preservar os tons específicos do culto.
7. Uma única pesquisa usa título/artista, prioriza resultados Cifra Club e oferece letras LRCLIB na mesma lista. Fonte, prévia e erro de acesso são explícitos; o bloqueio da leitura pelo servidor permanece registrado. A importação preenche um único campo editável de letra e cifra, retira tablaturas e converte os acordes escritos para o tom da igreja, inclusive quando há capotraste. Tom ambíguo exige confirmação. A opção de metadados preenche título e artista; com conteúdo vazio, salvar importa a prévia selecionada. Substituir conteúdo anterior exige confirmação. A letra é derivada ocultando acordes desse mesmo campo; não há painel separado de importação manual. A atualização PWA também exige ação explícita e mantém rascunhos na mesma aba.
8. Manifest e service worker são gerados no build. Uso real de Auth/RLS e da consulta exige configurações públicas, aplicação das migrações e teste em um projeto Supabase configurado. Busca de cifras exige também a função Netlify publicada; build local sozinho não comprova esse fluxo em produção.

## Roadmap

1. Acompanhar a importação do Cifra Club com a extensão atualizada e o uso em um culto; validar leitura e instalação PWA em Android/iPhone reais e estudar uma forma de importação automática compatível com esses navegadores; configurar SMTP para os demais integrantes.
2. Concluir e validar a adição de repertório em lote, preservando ordem, ausência de duplicações e tom próprio de cada culto.
3. Integrar builds automáticos ao mesmo site Netlify, se desejado, e acompanhar os resultados do CI.
4. Medleys, disponibilidade e confirmação; depois cache de repertório recente com consentimento, histórico, estatísticas e sugestões.

Build, testes locais e existência do código não comprovam que a versão publicada ou o banco externo já foram atualizados. O resultado de cada validação e da publicação deve constar em [VALIDACAO.md](VALIDACAO.md). Não há promessa de custo fixo: limites e condições dos planos gratuitos e das fontes externas devem ser conferidos no momento da publicação.
