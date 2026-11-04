## Situação do GitHub Actions

A auditoria inicial consultou [Validar Louvor #15](https://github.com/Mikhael-Fee/Sistema-Grupo-de-Louvor/actions/runs/38921320956), na branch main e na mesma base desta revisão: **failure, 109 passed, 3 failed, 17 skipped**. O build não chegou a executar porque estava depois do E2E que falhou.

Causas confirmadas nos logs e no código:

- Os testes móveis de busca tentavam salvar PNG em `/workspace/scratch`, caminho específico de outro ambiente. Agora usam `testInfo.outputPath`, preservando a captura e as demais asserções.
- O teste de colagem clicava em Sair e em seguida chamava um helper que também clicava em Sair. O helper agora é responsável pela troca de conta, aguarda o formulário de login e abre o menu móvel quando necessário. O teste mantém as asserções sobre a cifra e verifica exatamente um POST de logout.
- Os 17 casos de extensão/importação móvel eram pulados se `dist` não existisse. O workflow agora faz build antes de E2E. Os testes exigem os artefatos com `beforeAll`; um build ausente provoca erro explícito. Não foram removidas asserções para fazer a suíte passar.
- CI e servidor de desenvolvimento do Playwright recebem URL/chave fictícias; requisições Auth/PostgREST/Storage são interceptadas. O workflow também guarda os artefatos Playwright, inclusive se houver falha.

O pacote desta execução é gerado pelo GitHub Actions e inclui o identificador do commit e o link da execução. Os resultados são coletados dos relatórios e logs produzidos nessa execução; a ausência de um relatório é indicada explicitamente.

## Fluxo de produto entregue

Em Biblioteca → Nova música, `Buscar cifra no Cifra Club` ganha destaque depois da resposta real ao protocolo do importador. Identificar Firefox no user agent não concede estado conectado. O importador e o protocolo existentes foram reutilizados, incluindo o retorno na mesma aba no Firefox instalado.

Sem conexão, o requisito aparece antes da prévia, com o guia existente do Firefox/computador, ação de verificar conexão e alternativas Colar cifra, PDF e Buscar somente letra. Prévia de resultado Cifra Club fica indisponível até a conexão ser confirmada. Perder a conexão durante a leitura mostra erro e conserva o rascunho. O fallback de prévia Cifra Club pelo servidor foi retirado deste fluxo para que a extensão seja o sinal efetivo de disponibilidade; a busca de versões continua reutilizando o serviço existente.

As rotas `/conectar-cifra-club` e `/importar-cifra`, inclusive por URL direta, agora exigem administrador aprovado. Líder/músico voltam à Biblioteca; conta não aprovada permanece na tela de análise. O editor também confere a permissão existente. No servidor, `save_song` e RLS já exigiam admin aprovado; isso foi verificado com o SQL real em PGlite, sem mudar migrações ou o Supabase hospedado.

## Ciclo testado e evidência

A biblioteca fictícia começa vazia, sem Castelo Forte ou Grandioso És Tu. A única composição usada é original e sintética:

```text
[C]Voz [F]em [G/B]luz [Am]aqui
```

1. Admin aprovado: conecta ponte simulada, preenche cadastro, busca versão, vê prévia, importa, salva, recarrega e reabre a música.
2. Líder: abre um culto fictício, adiciona a música ao repertório e salva o tom Ré.
3. Líder e músico: abrem o repertório pelo culto e seguem o link da música com o importador sem responder. Conferem o tom de Ré e a ausência de instruções de instalação. Ao abrir a Biblioteca, conferem novamente Dó.
4. Os dois perfis tentam gravar `save_song` e recebem 403/42501 no limite simulado do backend. O banco isolado testa separadamente RPC e INSERT direto com as políticas reais, incluindo admin não aprovado.
5. Sem importador e com falha durante leitura: requisito/erro aparecem, o rascunho é preservado e não há gravação automática.

| Biblioteca | Culto em Ré |
| --- | --- |
| C | D |
| F | G |
| G/B | A/C# |
| Am | Bm |

Matriz: desktop 1280 px e Chromium com viewport/toque móvel em 360, 390 e 320 px. Todos conferem ausência de rolagem horizontal no documento e no modal. O leitor existente também é exercitado com versos longos e controles de transposição pela suíte completa.

## O que é simulado e o que é real

| Camada | O que executou | Limite da conclusão |
| --- | --- | --- |
| Ciclo admin → líder → músico | React, parser, transposição, rascunho e navegação reais; ponte da extensão e respostas Auth/PostgREST simuladas | Não utiliza usuários ou músicas reais |
| Permissões SQL | Migrações/RPC/RLS reais em PostgreSQL PGlite, com Auth simulado | Não consulta nem altera produção |
| Extensão real | `cifra-browser.spec.ts`: extensão Chrome/Chromium descompactada carregada em navegador real; leitura DOM, abas, cancelamento, erros, capotraste e integração com prévia/transposição | As respostas dos sites são fixtures; não comprova disponibilidade do Cifra Club ao vivo |
| Firefox Android instalado | User agent e display-mode simulados, com protocolo de retorno e rascunhos reais no app | Não emula atividades nativas do Android nem instala XPI no aparelho |
| Galaxy S25+ | **Não executado fisicamente** | Conferir Firefox Android, extensão assinada/conectada, retorno na mesma janela e PWA no aparelho |

O build isolado não tem o XPI assinado local da árvore de trabalho original: gera o estado seguro de assinatura pendente. Não houve nova assinatura ou alteração do pacote publicado. O guia de instalação também é testado com metadados assinados e não assinados fictícios.

## Capturas e interface

A matriz exige exatamente 20 capturas: cadastro, prévia, leitura do músico, ausência de importador e falha de conexão, nas quatro larguras. O empacotador confere os PNGs gerados pelos testes, as quatro larguras e os cinco estágios, e os inclui em `capturas/`. Uma evidência incompleta faz o empacotamento falhar e fica registrada no manifesto.

- Nenhuma rolagem horizontal ou corte lateral nos cenários testados em 320/360/390 px.
- O editor exige rolagem vertical; PDF, texto e Salvar podem ficar abaixo da primeira dobra. Foi ajustada a entrada da importação, sem redesenhar o editor inteiro.
- Na linha sintética muito curta, A/C# e Bm podem ficar próximos visualmente, embora sejam quatro acordes distintos e a transposição esteja correta. Registrar para a etapa de apresentação do leitor/editor; não foi alterado o posicionamento sobre as sílabas nesta etapa.
- Textos auxiliares existentes continuam pequenos em alguns painéis. Também fica para a revisão visual seguinte.

Exemplos: [cadastro 390](capturas/mobile-390-cadastro.png), [prévia 390](capturas/mobile-390-previa.png), [leitura 390](capturas/mobile-390-leitura.png), [sem importador 320](capturas/mobile-320-sem-importador.png), [erro 320](capturas/mobile-320-falha-conexao.png).

## Reprodução e publicação

O workflow executa `npm ci`, typecheck, testes unitários, testes de banco isolado, build com configuração fictícia e Playwright, nessa ordem. Em máquina limpa, instala Chromium com `npx playwright install --with-deps chromium`. O relatório gerado relaciona cada comando e seu resultado.

A branch é entregue para revisão por push, sem merge. Este workflow não possui passos de deploy e não usa credenciais de gerenciamento Supabase ou Netlify. Não altera registros de produção nem envia e-mails. O diff do commit base até o commit executado acompanha este relatório em `alteracoes.patch`.

Antes do push desta revisão, em 04/11/2026, foi feita consulta somente de leitura à API do Netlify. O site do Candeia estava sem integração Git (`build_settings` vazio, sem provider ou repositório conectado), e o workflow não continha etapa de deploy. A consulta não mudou configurações do Netlify ou do Supabase.
