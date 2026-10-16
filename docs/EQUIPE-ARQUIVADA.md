# Equipe ativa e histórico

A migração `007_archive_team_people.sql` acrescenta `people.active`, obrigatório e com padrão `true`. Nenhuma pessoa, escala, conta ou imagem é apagada. Integrantes retirados continuam no carregamento do ministério para que seus nomes, funções e fotos permaneçam nos cultos já cadastrados.

`archivePerson(id)` e `restorePerson(id)`, no repositório e no contexto, chamam `set_person_active(p_person_id uuid, p_active boolean)`. Apenas administradores aprovados podem executar a alteração; repeti-la é seguro. Ela altera exclusivamente o estado ativo. Aprovação, acesso à conta e vínculo `profiles.person_id` permanecem independentes.

`savePerson` usa `save_person(p_person jsonb)` com `id`, `name`, `email`, `functions` e `photoUrl` opcional. A função mantém o estado ativo existente, inclusive se um editor antigo enviar `active: true`, e preserva a foto quando `photoUrl` for omitida. A reativação exige a operação específica. A exclusão definitiva anterior mantém suas proteções de chaves estrangeiras; não deve ser usada para a ação “Excluir da equipe”.

O banco impede incluir uma pessoa inativa em uma nova escala. Um vínculo que já existe pode continuar no mesmo culto e mudar de posição, conservando os mesmos identificador, pessoa e função. Retirá-lo do culto continua permitido. Para isso, `save_service` mantém as linhas de escala existentes, em vez de apagar e recriar todas. As opções de evento, vídeos do repertório e compatibilidade com clientes anteriores da migração006 continuam preservadas.

## Instalação

As migrações001–006 precisam estar presentes. Primeiro, com `SUPABASE_ACCESS_TOKEN` configurado por meio seguro, execute a inspeção sem alterações:

```sh
node scripts/configure-archived-people.mjs
```

Para instalar somente007:

```sh
node scripts/configure-archived-people.mjs --apply
```

O instalador usa uma transação, espera até cinco segundos pelos bloqueios e compara contagens e hashes de todas as colunas anteriores nas nove tabelas públicas do ministério. Uma alteração acidental nessas colunas cancela a transação. Os hashes permanecem em tabelas temporárias; a saída contém apenas indicadores de estado. Ele não reaplica migrações anteriores e não modifica Auth ou Storage. Publique o cliente somente após confirmar `archive_team_migration_applied: true`.

## Verificação local

```sh
node tests/database/archived-people-check.mjs
```

O teste usa PostgreSQL local em PGlite, com Auth e Storage simulados e sem chamadas de rede. Verifica permissões e RLS, retenção integral dos dados, arquivamento e reativação idempotentes, proteção contra reativação por edição antiga, manutenção/reordenação do histórico, bloqueio de novas escalas inativas e o instalador real, incluindo reversão por divergência de hash. Também integra `npm run test:db`.
