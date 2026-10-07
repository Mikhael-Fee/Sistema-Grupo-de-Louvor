# Candeia — definição do produto

Fonte: especificação “Sistema Web para Ministério de Louvor” enviada pelo proprietário, com os fluxos atuais do Candeia. O escopo cobre autenticação, biblioteca, equipe, etiquetas, cultos, escalas e repertórios, além da consulta sem cadastro. Este documento descreve a versão Candeia publicada; os resultados e limites de validação estão em [VALIDACAO.md](VALIDACAO.md). Medleys completos, disponibilidade, confirmação, estatísticas e sincronização offline ficam em etapas posteriores.

## Requisitos e fluxos

- Login por e-mail e senha no Supabase. Cadastro cria um perfil de músico pendente de aprovação; a promoção exige administrador. O primeiro administrador é definido no SQL Editor, nunca por escolha na interface. A aplicação trabalha com dados reais do ministério e começa vazia quando nenhum cadastro foi feito.
- **Entrar sem cadastro** → `/consulta` → cultos, equipe e repertório reais → música → letra/cifra, ajuste de tom e vídeo. A consulta depende de liberação explícita em **Administração** e permite somente leitura. A transposição altera apenas a visualização do visitante; e-mails cadastrados, contatos e perfis de acesso permanecem privados.
- Início → próximo culto → equipe e repertório ordenado → música. Músicos aprovados acompanham as informações sem modificar o cadastro nem o planejamento.
- Biblioteca → pesquisa por título/artista, tom e combinação de etiquetas → detalhes; administrador cria, edita ou remove música. Cifra usa acordes entre colchetes, preservando o restante do texto. **Tom original**, **Tom na igreja** e tom específico de cada culto são independentes.
- Cultos → lista por data → criação/edição → equipe por pessoa e função → repertório com ordem, tom e observação específicos. Administradores e líderes planejam; músicos e visitantes visualizam. **Montar escala em lote** permite selecionar várias pessoas e suas funções; **Reutilizar última escala** aproveita a equipe de um culto anterior, preserva os integrantes já escalados e ignora vínculos inválidos ou repetidos. A seleção de várias músicas para adicionar ao repertório em uma ação permanece um requisito a concluir e validar.
- Equipe → nome, e-mail opcional e várias funções. Etiquetas → nome e cor. Administração → aprovação, perfis, permissões e consulta pública. **Permitir consulta sem cadastro** só altera a configuração compartilhada após **Salvar acesso público**; o administrador pode copiar o link, abrir a consulta e desativar o acesso.
- Formulários de música, pessoa, etiqueta, culto e ajustes de escala/repertório mantêm rascunhos em `sessionStorage`, separados por conta e aba. Fechar o diálogo ou navegar preserva os campos nessa aba; **Cancelar** descarta o rascunho, e a ação explícita de salvar ou adicionar grava no banco. Sair da conta limpa seus rascunhos na aba atual. Eles não são sincronizados entre dispositivos e dependem da disponibilidade do armazenamento do navegador.
- Uma versão PWA nova oferece **Atualizar agora** ou **Depois**. A atualização recarrega por escolha do usuário, com rascunhos preservados na mesma aba; mudanças de foco e renovação de sessão não devem desmontar editores.
- Web responsiva em português, com a marca Candeia visível no login e nos cabeçalhos de computador e celular, instalável como PWA. Cache somente do shell estático; dados compartilhados não entram no cache do service worker. A consulta e as alterações precisam de conexão com o Supabase.

## Importação de letra e cifra

O editor da biblioteca apresenta **Cifra Club** como fonte principal. **Consultar no Cifra Club** abre uma consulta externa com título/artista. O usuário cola letra e acordes em **Texto copiado do Cifra Club** e pode guardar **Link da cifra no Cifra Club**. A prévia converte as linhas de acordes em ChordPro. **Importar texto do Cifra Club** substitui somente o conteúdo do rascunho, com aviso quando há conteúdo anterior, e registra a origem nas observações. Um cabeçalho `Tom:` reconhecido atualiza **Tom original**; sem ele, mantém-se o tom atual para revisão. **Tom na igreja**, título, artista e demais campos não mudam. O leitor oferece **Abrir Cifra Club**, incluindo para visitantes. O conteúdo dessa fonte não é baixado automaticamente pelo Candeia.

**Buscar letra e cifra → Outras fontes** oferece consultas automáticas secundárias. **Somente letra** usa LRCLIB, com letras da comunidade sem acordes. **Letra e cifra** usa o catálogo público em português do Worship Together por uma função Netlify; a prévia lê os acordes e o tom original publicados pela fonte. A cifra não é gerada a partir da letra. A cobertura é limitada e o conteúdo deve ser conferido na fonte.

**Ver prévia** não altera o formulário. **Importar prévia** ou **Substituir conteúdo pela prévia** aplica a seleção somente ao rascunho, com aviso quando há conteúdo anterior. Cifras automáticas precisam de `originalKey` reconhecido para atualizar **Tom original**; **Tom na igreja** é mantido. Importar somente letra mantém os tons existentes. Título/artista só mudam quando a opção é marcada. Todas as origens são registradas nas observações; a gravação no banco exige revisar e selecionar **Salvar música**.

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
            [Cifra Club → colar → prévia → importar / outras fontes online]
            [Cancelar] [Salvar música ou culto]
```

## Modelo de dados

Perfis (id ligado ao auth.users, nome, papel, aprovação, pessoa opcional); pessoas (nome, e-mail, funções); etiquetas (nome, cor); músicas (título, artista, tons, conteúdo estruturado, vídeo, observações, etiquetas); cultos (data local, horário, tipo, observações); escala (culto, pessoa, função); repertório (culto, música, posição, tom, observação); configuração de consulta pública (habilitada ou desabilitada). Referências preservam integridade: músicas e pessoas em uso não podem ser removidas. Tons do repertório não alteram as músicas. Rascunhos ficam no navegador e não são registros compartilhados.

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
5. Layout funciona com largura de 390 px sem rolagem horizontal; diálogos, campos e ações possuem nomes acessíveis.
6. Escala em lote e reaproveitamento da última escala evitam duplicações e funções inexistentes. Adição de repertório em lote precisa atender ao mesmo princípio de confirmação explícita e preservar os tons específicos do culto.
7. Cifra Club é a primeira opção de consulta/importação por colagem; linhas de acordes viram ChordPro e a fonte fica disponível no leitor. Consultas automáticas secundárias exibem fonte e prévia: LRCLIB importa letras, Worship Together importa acordes e tom original. Importação exige ação explícita, afeta somente o rascunho e preserva tom na igreja. A atualização PWA também exige ação explícita e mantém rascunhos na mesma aba.
8. Manifest e service worker são gerados no build. Uso real de Auth/RLS e da consulta exige configurações públicas, aplicação das migrações e teste em um projeto Supabase configurado. Busca de cifras exige também a função Netlify publicada; build local sozinho não comprova esse fluxo em produção.

## Roadmap

1. Acompanhar o uso em um culto e validar instalação PWA em Android/iPhone reais; configurar SMTP para os demais integrantes.
2. Concluir e validar a adição de repertório em lote, preservando ordem, ausência de duplicações e tom próprio de cada culto.
3. Integrar builds automáticos ao mesmo site Netlify, se desejado, e acompanhar os resultados do CI.
4. Medleys, disponibilidade e confirmação; depois cache de repertório recente com consentimento, histórico, estatísticas e sugestões.

Build, testes locais e existência do código não comprovam que a versão publicada ou o banco externo já foram atualizados. O resultado de cada validação e da publicação deve constar em [VALIDACAO.md](VALIDACAO.md). Não há promessa de custo fixo: limites e condições dos planos gratuitos e das fontes externas devem ser conferidos no momento da publicação.
