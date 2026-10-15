# Candeia — Cifra Club para Firefox (piloto Android)

Variante separada da extensão Chrome. Abre a cifra em uma aba do próprio Firefox,
lê somente os acordes públicos que o navegador exibe e devolve uma prévia ao
Candeia. Não acessa senhas, cookies, área de transferência ou outros sites.

## Estado do piloto

O arquivo `candeia-cifraclub-firefox-unsigned.xpi` é **um pacote de desenvolvimento
sem assinatura**. Ele não pode ser instalado normalmente no Firefox Android ou
no Firefox desktop estável. Não desative a verificação de assinaturas.

Para distribuição aos administradores, a Mozilla precisa assinar uma versão
`unlisted` (distribuição própria, fora da busca da loja). A existência deste código
não significa que a Mozilla já o aprovou ou que houve teste em aparelho Android.

Compatibilidade declarada: Firefox desktop 140+ e Firefox Android 142+. No
Android, use uma versão atualizada. Firefox iOS e Chrome Android não executam
esta extensão.

## Uso depois da assinatura

1. Baixe o XPI **assinado** indicado no guia de importação do Candeia.
2. No Firefox Android, abra Configurações → Sobre o Firefox e toque no logotipo
   cinco vezes. Volte às Configurações → Instalar extensão de arquivo, selecione
   o XPI e aceite a instalação.
3. Abra e entre no Candeia dentro desse mesmo Firefox. A sessão do Chrome ou do
   aplicativo instalado pelo Chrome não é compartilhada.
4. Na Biblioteca, pesquise uma música e escolha a prévia da cifra. O importador
   abre uma aba do Cifra Club e retorna ao Candeia ao concluir.
5. Confira título, artista, tom, capotraste e acordes antes de salvar. A importação
   apenas preenche o rascunho; salvar continua sendo uma ação sua.

A cifra precisa abrir normalmente no Firefox. Login, bloqueio da fonte,
redirecionamento, ausência de acordes ou encerramento do processo pelo Android
podem impedir a leitura. A consulta encerra em até 25 segundos; a extensão fecha
apenas a aba criada por ela. Em caso de falha, continue com a importação por PDF.

## Desenvolvimento e assinatura

Na raiz do repositório, `node scripts/package-cifra-extension.mjs` prepara os
pacotes públicos Chrome e Firefox sem ler credenciais. O leitor DOM Firefox deve
permanecer idêntico ao leitor Chrome; os testes verificam essa equivalência.

Para um teste temporário no desktop: abra `about:debugging` → Este Firefox →
Carregar extensão temporária e escolha `manifest.json` desta pasta. O ambiente
temporário não é uma instalação distribuível. O desenvolvimento Android via USB
exige as ferramentas `adb` e `web-ext` e não substitui o teste em um aparelho.

O mantenedor pode solicitar uma assinatura própria à Mozilla com:

```sh
node scripts/sign-firefox-extension.mjs --submit-unlisted
```

Esse comando **envia o pacote à Mozilla** e exige `AMO_JWT_ISSUER` e
`AMO_JWT_SECRET` definidos no ambiente seguro (`WEB_EXT_API_KEY` e
`WEB_EXT_API_SECRET` também são aceitos). Não coloque seus valores em
arquivos, argumentos de comando, commits ou mensagens. Não é executado durante
build ou deploy. A conta e as credenciais AMO pertencem ao mantenedor; este
projeto não as cria automaticamente. Revisões e prazos dependem da Mozilla.

Depois que o helper baixar o XPI assinado, um novo build confere sua integridade,
versão, conteúdo e correspondência com as fontes antes de disponibilizar o botão
de download assinado. Se as fontes mudarem, a assinatura anterior não é usada.

Fontes oficiais:
- https://extensionworkshop.com/documentation/publish/install-self-distributed/#install-addon-from-file-android
- https://extensionworkshop.com/documentation/develop/developing-extensions-for-firefox-for-android/
- https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/

Veja também `PRIVACY.md`.
