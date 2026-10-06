# Verificação após publicar

O deploy deve estar `ready` em `/workspace/scratch/louvor-netlify-state.json`, salvo pelo helper a partir da API Netlify. Use somente a origem HTTPS registrada nesse arquivo. A verificação de navegador também aceita origens HTTP(S) de loopback para desenvolvimento.

1. Confira HTTP 200 na página inicial, em `/musicas`, `/manifest.webmanifest` e `/sw.js`; a rota de músicas deve retornar o shell da SPA. Confira os tipos de conteúdo do manifest e do service worker.
2. Abra a demonstração em desktop e com largura de 390 px. Confira biblioteca, culto, escala, repertório, transposição e navegação direta após recarregar. A demonstração permanece local.
   O helper `node scripts/verify-public-site.mjs` automatiza oito verificações de login disponível, biblioteca e largura móvel, manifest, cache estático sem respostas de API e abertura da demonstração offline. O service worker precisa completar a primeira instalação; uma recarga coloca a página sob seu controle.
3. Com `SUPABASE_ACCESS_TOKEN` injetado pelas configurações seguras e TLS habilitado, execute a verificação real no domínio observado:

```sh
LOUVOR_BROWSER_URL=https://louvor-grupo-fxebsy.netlify.app npm run supabase:verify -- --browser
```

O helper cria contas e registros temporários, testa administrador e músico e gera um link de recuperação para a conta temporária sem enviar e-mail. O navegador segue o callback `/redefinir-senha`, salva uma senha aleatória e verifica que a nova senha autentica e a anterior é rejeitada. Links, tokens e senhas ficam em memória; não são produzidas capturas nem traces de autenticação. A limpeza final deve confirmar a remoção de todas as contas e fixtures.

Neste ambiente, o Chromium precisa conseguir abrir o banco NSS da autoridade do proxy em `/home/agent/.pki/nssdb`, conforme descrito no README. A validação mantém TLS habilitado.
