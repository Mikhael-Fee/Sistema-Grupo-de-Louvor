# Candeia: verificação antes e depois de publicar

Este roteiro valida a versão deste checkout. Ele não registra resultados executados nem afirma que o site existente já recebeu as mudanças. Registre as evidências somente após os checks e o deploy correspondente; resultados anteriores ficam em [VALIDACAO.md](VALIDACAO.md).

## Antes do deploy

Execute `npm run typecheck`, `npm test`, `npm run test:db`, `npm run test:e2e` e `npm run build`. Confira o login e a consulta em desktop e largura de 390 px, sem botão de demonstração ou seleção de papel simulado. Fixtures dos testes não devem aparecer no produto ou ser instaladas no banco real.

Verifique que a migração aditiva `002_public_consultation.sql` está presente no banco escolhido; não reaplique `001_initial.sql`. A consulta nasce desativada. Aplique a atualização somente pelo procedimento autorizado, preservando registros existentes.

A busca de cifras precisa da função Netlify, além do build estático. Vite e `vite preview` sozinhos não atendem `/.netlify/functions/song-search`; nesse ambiente, valide seu contrato nos testes e o fluxo completo quando houver um servidor de funções compatível ou o deploy Netlify.

## Confirmar o artefato publicado

Publique pelo modo que inclui os dois componentes:

```sh
node scripts/deploy-netlify.mjs --check
node scripts/deploy-netlify.mjs --deploy-dir dist --functions-dir netlify/functions
```

O deploy deve estar `ready` em `/workspace/scratch/louvor-netlify-state.json`, salvo pelo helper a partir da API Netlify. Use a origem HTTPS observada nesse arquivo; neste site, o endereço existente é `https://louvor-grupo-fxebsy.netlify.app`. O ZIP antigo contendo somente `dist` não publica a função de busca.

1. Confira HTTP 200 na página inicial, `/consulta`, `/musicas`, `/manifest.webmanifest` e `/sw.js`. As rotas de página devem retornar o shell da SPA, sem 404 ao recarregar diretamente.
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
- Em **Montar escala em lote**, selecione várias pessoas e funções válidas e confirme. No editor de culto, confira que a seleção só chega ao banco ao salvar o culto. No detalhe de culto, confira a gravação pela confirmação explícita da seleção.
- Use **Reutilizar última escala** e confira vínculos existentes, funções válidas e ausência de duplicação. Revise tom/observações por culto e ordem do repertório; alterações devem respeitar o papel da conta.

## Fontes de letras e cifras

Com uma conta administradora temporária, abra uma música em rascunho:

1. Confira **Cifra Club** como primeira opção. **Consultar no Cifra Club** deve abrir uma consulta externa com título/artista. Cole um exemplo de letra com linhas de acordes e um cabeçalho `Tom:` em **Texto copiado do Cifra Club**, guardando o link HTTPS da música. Confira a prévia e **Importar texto do Cifra Club**: os acordes devem virar ChordPro, o tom original deve acompanhar o cabeçalho, e o tom na igreja deve permanecer. Sem cabeçalho reconhecido, o tom original atual deve ser mantido.
2. A importação deve afetar somente o rascunho, com aviso se substituir texto existente. Título/artista não devem mudar; a fonte/link deve aparecer nas observações. Salve somente uma fixture temporária e confira **Abrir Cifra Club** no leitor, inclusive na consulta pública. Não espere download automático do Cifra Club.
3. Em **Buscar letra e cifra → Outras fontes**, consulte **Somente letra**. LRCLIB deve oferecer letras sem acordes; confira a versão na prévia. Nenhum resultado é um estado permitido e deve preservar o conteúdo existente.
4. Consulte **Letra e cifra** para uma música disponível no catálogo público em português do Worship Together. Abra **Ver prévia** e confira acordes/tom original na fonte. Confirme **Importar prévia** ou **Substituir conteúdo pela prévia**: o banco fica inalterado até **Salvar música**, o tom na igreja e demais campos permanecem, título/artista só mudam com a opção marcada e as observações recebem a origem.
5. Uma cifra automática sem tom original reconhecido deve ser recusada. Falha de rede, timeout, limite ou bloqueio da fonte deve preservar o rascunho e explicar a situação. Não exija que a cobertura encontre qualquer título.
6. Cancele o formulário ou remova somente as fixtures criadas para esse teste. Não use músicas do proprietário como alvo de substituição.

## Auth e recuperação

Com `SUPABASE_ACCESS_TOKEN` injetado nas configurações seguras e TLS habilitado, a verificação real pode usar o domínio observado:

```sh
LOUVOR_BROWSER_URL=https://louvor-grupo-fxebsy.netlify.app npm run supabase:verify -- --browser
```

O helper cria contas e registros temporários, testa administrador/músico e usa um link de recuperação da conta temporária sem enviar e-mail. O navegador segue `/redefinir-senha`, salva uma senha aleatória e verifica a autenticação. Links, tokens e senhas ficam em memória; não gere screenshots ou traces das sessões de autenticação. Confirme a remoção de todas as contas e fixtures ao terminar. A entrega real de confirmação e recuperação deve ser conferida também com um destinatário autorizado e o SMTP configurado.

Neste ambiente, o Chromium precisa abrir o banco NSS da autoridade do proxy em `/home/agent/.pki/nssdb`, conforme o README. Mantenha TLS habilitado e a autoridade fornecida pela plataforma.

## PWA e conexão

Espere a primeira instalação do service worker e recarregue para a página ficar sob seu controle. Confira que o cache contém apenas arquivos estáticos, sem respostas de Auth, PostgREST ou fontes externas. Sem internet, o shell pode abrir, mas uma nova consulta aos dados reais ou às fontes deve informar indisponibilidade; não espere dados fictícios ou sincronização offline. Com uma versão nova disponível, confira o aviso **Atualização disponível** e as ações **Atualizar agora** e **Depois**. A página só deve recarregar após a escolha de atualizar; um rascunho preenchido precisa continuar disponível na mesma aba após o recarregamento. Valide a instalação em Android/iPhone reais separadamente do Chromium automatizado.
