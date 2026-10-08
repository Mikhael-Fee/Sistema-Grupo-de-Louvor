# Candeia: verificação antes e depois de publicar

Este roteiro valida a versão deste checkout. Ele não registra resultados executados nem afirma que o site existente já recebeu as mudanças. Registre as evidências somente após os checks e o deploy correspondente; resultados anteriores ficam em [VALIDACAO.md](VALIDACAO.md).

## Antes do deploy

Execute `npm run typecheck`, `npm test`, `npm run test:db`, `npm run test:e2e` e `npm run build`. Confira o login e a consulta em desktop e largura de 390 px, sem botão de demonstração ou seleção de papel simulado. Fixtures dos testes não devem aparecer no produto ou ser instaladas no banco real.

Verifique que as migrações `002_public_consultation.sql` e `003_custom_service_types.sql` estão presentes no banco escolhido; não reaplique `001_initial.sql`. A consulta nasce desativada. A terceira migração permite temáticas obrigatórias de até 100 caracteres e preserva os tipos existentes. O helper `node scripts/configure-service-types.mjs` verifica o estado e desfaz sua inserção temporária; `--apply` aplica apenas a restrição ausente no schema conhecido. Aplique atualizações somente no projeto autorizado, preservando registros existentes.

A busca de cifras precisa da função Netlify, além do build estático. Vite e `vite preview` sozinhos não atendem `/.netlify/functions/song-search`; nesse ambiente, valide seu contrato nos testes e o fluxo completo quando houver um servidor de funções compatível ou o deploy Netlify.

## Confirmar o artefato publicado

Publique pelo modo que inclui os dois componentes:

```sh
node scripts/deploy-netlify.mjs --check
node scripts/deploy-netlify.mjs --deploy-dir dist --functions-dir netlify/functions
```

O deploy deve estar `ready` em `/workspace/scratch/louvor-netlify-state.json`, salvo pelo helper a partir da API Netlify. Use a origem HTTPS observada nesse arquivo; neste site, o endereço existente é `https://louvor-grupo-fxebsy.netlify.app`. O ZIP antigo contendo somente `dist` não publica a função de busca.

1. Confira HTTP 200 na página inicial, `/consulta`, `/musicas`, `/conectar-cifra-club`, `/importar-cifra`, `/manifest.webmanifest` e `/sw.js`. As rotas de página devem retornar o shell da SPA, sem 404 ao recarregar diretamente.
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
4. A importação converte os acordes para **Tom na igreja** e registra a fonte. Confira G→Bb no conteúdo e Bb→C no leitor, incluindo baixo. Capotraste3 com posiçõesG e somBb deve dar Bb uma vez. Sem tom de posições confiável, exigir confirmação, em vez de inferir pelo primeiro acorde. Título/artista preenchem com a opção marcada; conteúdo vazio também pode importar e salvar direto da prévia. Conteúdo anterior exige **Substituir letra e cifra**; **Manter conteúdo atual** preserva o texto. Nenhuma gravação até salvar.
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

1. Em `/conectar-cifra-club`, selecione **Celular** e o sistema usado. Confira o layout em 350/390 px, a cópia do código de instalação e a alternativa de seleção manual caso o navegador negue acesso à área de transferência. Copiar código serve somente para configurar o leitor, sem criar um campo extra de letra/cifra no editor.
2. No **Android**, salve e edite o favorito **Importar para Candeia**, substituindo seu endereço pelo código que começa com `javascript:`. Abra uma cifra no Chrome, espere os acordes e selecione o favorito sugerido ao digitar seu nome na barra de endereço. O menu de favoritos pode não executar JavaScript; registre navegador e versão caso ele remova ou recuse esse endereço.
3. No **iPhone/iPad**, configure o app Atalhos conforme o guia: receba **Páginas Web do Safari**, execute o script com **Executar JavaScript na Página Web** e passe o resultado a **Abrir URLs**. Abra a cifra no Safari e execute o atalho pela folha de compartilhamento. Registre as permissões de JavaScript pedidas pelo sistema. O aplicativo do Cifra Club e a PWA do Candeia não executam o leitor.
4. Confira a abertura de `/importar-cifra` com título, artista, origem e prévia; o fragmento da importação deve desaparecer da barra de endereço antes de Auth. Sem login, entre na mesma aba e confira a prévia preservada; recarregue sem perder a importação pendente. Links de recuperação de senha devem continuar usando seu próprio fragmento.
5. Como administrador aprovado, escolha **Revisar e salvar na biblioteca**. Confira limpeza de tablaturas e conversão G/capo3/somBb→tecladoBb uma única vez, com leitura Bb→C correta. Tom escrito desconhecido exige confirmação. Não deve haver gravação antes de **Salvar música**; fechar a revisão permite retomá-la e um rascunho comum de música nova deve continuar independente. **Descartar importação** limpa somente essa pendência.
6. Músico/visitante não deve receber ação de salvamento ou escrever no banco. URL de fonte externa, payload inválido e fragmento acima de 100.000 caracteres codificados devem ser recusados sem truncar conteúdo; o limite do fragmento pode recusar cifras cujo texto esteja abaixo do limite geral de 100.000 caracteres.
7. Confirme que `/downloads/candeia-cifra-celular.txt` e `/downloads/candeia-cifra-iphone.js` retornam código correspondente ao build, sem virar `index.html`, e ficam fora do precache junto com o ZIP. A suíte móvel usa páginas de teste e navegação em Chromium; não substitui essas verificações no menu nativo Android ou Atalhos/Safari em aparelhos reais.

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
