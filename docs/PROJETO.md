# Louvor — definição da primeira entrega

Fonte: especificação “Sistema Web para Ministério de Louvor” enviada pelo proprietário. Esta primeira entrega implementa MVP 1 e MVP 2. Medleys completos, disponibilidade, confirmação, estatísticas e sincronização offline ficam em etapas posteriores.

## Requisitos e fluxos

- Login por e-mail e senha no Supabase. Cadastro público cria um perfil de músico; promoção exige administrador. Primeiro administrador é definido no SQL Editor, nunca por escolha na interface. Demonstração separada, local e identificada, sem autenticação real.
- Início → próximo culto → equipe e repertório ordenado → música → letra/cifra, ajuste de tom e vídeo. O músico consulta sem modificar o cadastro nem o planejamento.
- Biblioteca → pesquisa por título/artista, tom e combinação de etiquetas → detalhes; administrador cria, edita ou remove música. Cifra usa acordes entre colchetes, preservando o restante do texto.
- Cultos → lista por data → criação/edição → equipe por pessoa e função → repertório com ordem, tom e observação específicos. Administradores e líderes planejam; músicos visualizam.
- Pessoas → nome, e-mail opcional e várias funções. Etiquetas → nome e cor. Administração → perfis e permissões.
- Web responsiva em português, instalável como PWA. Cache somente do shell estático; dados autenticados não entram no cache do service worker. O modo de demonstração persiste no navegador e não é compartilhado.

## Wireframes

```text
Computador: [barra lateral: início/cultos/biblioteca/equipe/etiquetas/admin]
            [título e ação principal                            perfil]
            [próximo culto + abrir] [resumo do ministério              ]
            [repertório ordenado ] [equipe                           ]
            [próximos cultos                                            ]

Celular:    [Louvor                                  perfil]
            [título]
            [próximo culto → abrir]
            [repertório / equipe]
            [navegação inferior: início/cultos/músicas/equipe/mais]

Música:     [voltar] [título / artista]
            [letra | letra + cifra] [−] [tom] [+] [tamanho]
            [acordes alinhados acima de cada trecho]
            [observações gerais e do culto] [YouTube]
```

## Modelo de dados

Perfis (id ligado ao auth.users, nome, papel, pessoa opcional); pessoas (nome, e-mail, funções); etiquetas (nome, cor); músicas (título, artista, tons, conteúdo estruturado, vídeo, observações, etiquetas); cultos (data local, horário, tipo, observações); escala (culto, pessoa, função); repertório (culto, música, posição, tom, observação). Referências preservam integridade: músicas e pessoas em uso não podem ser removidas. Tons do repertório não alteram as músicas.

## Permissões

| Operação | Administrador | Líder | Músico |
| --- | --- | --- | --- |
| Ler dados do ministério | Sim | Sim | Sim |
| Gerenciar músicas, pessoas, etiquetas | Sim | Não | Não |
| Criar/editar cultos, escala e repertório | Sim | Sim | Não |
| Alterar papéis e vincular perfis | Sim | Não | Não |
| Transpor visualização | Sim | Sim | Sim |

Regras também aplicadas por RLS no PostgreSQL. Instalação dedicada a uma única igreja; multi-igreja é evolução futura. A entrada de novos músicos requer aprovação administrativa antes de ler dados compartilhados.

## Critérios de aceitação

1. Build TypeScript e testes de domínio passam. Transposição trata sustenidos, bemóis, baixos invertidos e extensões; mantém texto intacto.
2. Demo permite criar música/pessoa/etiqueta/culto, montar escala/repertório, reordenar, alterar tom por culto e recuperar alterações após recarregar.
3. Filtros de múltiplas etiquetas exigem todas as selecionadas. Validação rejeita campos obrigatórios vazios e URLs de vídeo incompatíveis.
4. Músico não vê ações de edição; SQL rejeita alteração por não autorizado e autoelevação de papel. Cadastro não implica aprovação.
5. Layout funciona com largura de 390 px sem rolagem horizontal; diálogos, campos e ações possuem nomes acessíveis.
6. Manifest e service worker são gerados no build. Uso real de Auth/RLS exige credenciais públicas, aplicação da migração e teste em um projeto Supabase configurado.

## Roadmap

1. Definição e revisão por consistência desta documentação.
2. MVP 1: autenticação, perfis/pessoas/funções, músicas/etiquetas e transposição.
3. MVP 2: cultos, escalas e repertórios; testes integrados e build PWA.
4. Conectar Supabase, validar dois perfis distintos e publicar no Netlify; piloto em um culto.
5. Medleys e confirmação; depois cache de repertório recente com consentimento, histórico e sugestões.

Validação das etapas 1–3 é técnica nesta entrega. A etapa 4 requer projeto externo do proprietário. Não há promessa de custo fixo: limites e condições dos planos gratuitos devem ser conferidos no momento da publicação.
