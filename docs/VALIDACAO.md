# Validação da atualização Candeia — 07/10/2026

## Resultados desta versão

| Verificação | Resultado |
| --- | --- |
| TypeScript e build Vite/PWA | Passaram |
| Vitest: domínio, fontes e conversão de cifra colada | 55 testes passaram |
| PostgreSQL/PGlite: RLS, transações, integridade e consulta pública | 153 verificações passaram: 98 existentes + 55 da consulta pública |
| Playwright: interface, permissões, rascunhos, escala em lote, importação e celular 390 px | 18 cenários passaram, usando Auth/API simulados e fixtures de teste |
| Supabase real no domínio publicado: Auth, RLS, consulta pública, interface e recuperação | 52 verificações passaram; contas e registros temporários removidos com limpeza confirmada |
| Site público/PWA em Chromium, celular 390 px e shell offline | 15 verificações passaram; service worker controlando a página e 33 entradas estáticas, sem respostas de API no cache |
| Função de cifras no Netlify real | 4 verificações passaram: busca e prévia 200, URL de fonte inválida 400 e POST 405 |
| Artefato de produção | 37 arquivos revisados; nenhuma credencial privada, `.env` ou source map; somente uma chave pública `anon` |
| Publicação Netlify com arquivos estáticos e função `.mjs` | API confirmou deploy `6ac61ee795786016c1d9a837` como `ready` |
| Domínio HTTPS e rota direta `/consulta` | HTML Candeia e arquivo de entrada corresponderam ao build publicado |

O endereço publicado é [louvor-grupo-fxebsy.netlify.app](https://louvor-grupo-fxebsy.netlify.app), no mesmo site `93f0134d-7c6f-414a-b86a-1c4c9bdcb477`. O helper usou `--deploy-dir dist --functions-dir netlify/functions`: o site e a função foram publicados juntos. O envio de um ZIP contendo somente `dist` não atende esta versão. A publicação é direta, sem integração Git; enviar código ao repositório não dispara outro deploy.

## Banco e acesso

No Supabase `fxebsycpbybhzkpnxzoo`, a migração aditiva `002_public_consultation.sql` foi aplicada sem reaplicar a migração inicial nem substituir os registros existentes. A leitura posterior confirmou a consulta pública habilitada conforme a escolha do proprietário, as funções públicas instaladas, RLS e ausência de acesso anônimo direto às tabelas privadas.

O RPC público retorna músicas, etiquetas, cultos, repertórios, nomes e funções, com e-mails vazios e sem perfis de conta. Os testes PostgreSQL verificaram ativação/desativação, campos permitidos, ordem, tons e observações, além de rejeição de escrita e consultas diretas não autorizadas. Esses testes usam PostgreSQL/PGlite com Auth simulado; não equivalem por si só à validação real de Auth.

A validação no Supabase e domínio publicados passou em 52 verificações, incluindo perfis autorizados, restrições de escrita, consulta anônima sem contatos/perfis, repertório, transposição local, manutenção do editor/rascunho e recuperação de senha de uma conta temporária. O helper não enviou e-mails: gerou em memória um link de recuperação para sua fixture, testou senha nova e rejeição da anterior. As contas e registros temporários foram removidos, com limpeza confirmada; os registros do proprietário foram preservados.

A conta proprietária `mikhaelfernandes8@gmail.com` já foi criada e confirmada pelo usuário, aprovada como `admin` e preservada. A aprovação inicial e o primeiro acesso pertencem à entrega anterior; esta atualização não redefiniu a senha nem enviou mensagens para o proprietário.

## Cifras, edição e interface

Cifra Club é a primeira opção de consulta e importação por colagem, com link externo e referência guardada nas observações. A conversão de linhas de acordes para ChordPro e a transposição foram testadas com exemplos próprios, incluindo acordes com baixo, extensões, tabs e acidentes Unicode. Um cabeçalho `Tom:` reconhecido atualiza somente o tom original; o tom na igreja permanece. Sem cabeçalho reconhecido, mantém-se o tom original atual para revisão. Importar altera o rascunho; salvar é a ação que grava no banco.

Não há download automático de conteúdo do Cifra Club: as tentativas de consulta HTTP feitas neste ambiente receberam 403, e o fluxo implementado abre a fonte para consulta e permite colar o texto escolhido pelo usuário. LRCLIB oferece busca automática secundária de letras, e Worship Together oferece cifras públicas pelo endpoint Netlify. A cobertura depende dos catálogos e da disponibilidade dessas fontes.

Na validação real da função Netlify, a busca por “Quão lindo esse nome é” retornou uma página pública do Worship Together; a prévia respondeu com tom original D e 66 acordes reconhecidos. Nenhum conteúdo musical foi incorporado ao catálogo do ministério por esse teste. A função aceita apenas a fonte e os caminhos previstos, e rejeitou uma URL externa e um método de escrita.

Os cenários Playwright verificaram consulta sem cadastro, ocultação de edição e contatos, transposição local, importação explícita e preservação do tom na igreja, rascunhos ao navegar/fechar, persistência após salvar e recarregar, renovação de sessão e troca de foco sem desmontar o editor, seleção de várias pessoas e deduplicação de funções na escala. Dados fictícios existem apenas nos testes; a demonstração foi removida do produto.

## PWA e ambiente

O manifest publicado usa Candeia, ícones de chama, fundo branco e tema preto. No domínio real, o helper público passou em 15 verificações: leitura sem cadastro e sem escrita/contatos, layout 390 px, manifest, service worker ativo/controlando a página, 33 entradas estáticas sem respostas de Auth/PostgREST/fontes, e shell de login abrindo offline. O catálogo estava vazio após a limpeza das fixtures, portanto esse helper não repetiu a transposição; o teste de integração real com fixtures já a havia verificado entre suas 52 verificações. Os dados reais continuam exigindo conexão. A aplicação oferece **Atualizar agora** ou **Depois** para versões novas e mantém rascunhos na mesma aba após a atualização escolhida. Uma instalação da versão antiga, ainda sem esse aviso, pode precisar fechar todas as abas/janelas do site e reabrir o link para ativar a nova versão.

TLS permanece habilitado. Neste ambiente, browsers externos precisam abrir o banco NSS da autoridade já fornecida pela plataforma em `/home/agent/.pki/nssdb`; testes locais e testes externos não devem desabilitar a verificação de certificados.

As instruções completas de instalação e manutenção foram atualizadas e salvas no rascunho do ambiente Codex. A API confirmou que essa configuração ainda requer publicação (`requires_publish: true`). Ela é separada da publicação Netlify: o site já está publicado, e a configuração reutilizável depende de revisar, salvar e publicar o ambiente pela interface Codex. O rascunho não comprova uma nova restauração completa do ambiente.

## Limites e etapas externas

- SMTP próprio continua pendente para confirmação e recuperação dos demais integrantes; a entrega para outros endereços não foi validada nesta atualização.
- A instalação PWA em Android/iPhone reais ainda deve ser verificada; o navegador automatizado é Chromium.
- O resultado do workflow no GitHub não foi consultado nesta atualização; não há integração automática de builds com o site Netlify.
- Disponibilidade, confirmações, medleys, estatísticas, repertório em lote e sincronização offline de dados compartilhados continuam no roadmap.
