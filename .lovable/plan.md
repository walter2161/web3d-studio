# Plano: Save / Save Cloud / Export / Import com login restrito

## Objetivo
Adicionar 4 ações no app — **Save**, **Save Cloud**, **Export**, **Import** — disponíveis apenas para usuários autenticados. **Não existirá cadastro público.** O único jeito de criar um novo usuário é você (admin) liberar dentro do app.

## Arquitetura de acesso

- **Lovable Cloud** habilitado (Postgres + Auth + Edge Functions).
- Auth por **email + senha** apenas. Sign-up público desativado no cliente (a UI não expõe cadastro).
- Tabela `public.user_roles` com enum `app_role` (`admin`, `user`) — nunca no `profiles`.
- Função `has_role(uuid, app_role)` `SECURITY DEFINER` para RLS sem recursão.
- Seed do admin `walter@ledmkt.com` via edge function `bootstrap-admin` que usa `service_role` para:
  1. Criar o usuário no `auth.users` (com a senha que você já forneceu, usada uma única vez e nunca logada).
  2. Inserir o role `admin` em `user_roles`.
  3. A função só executa se ainda não existir nenhum admin (idempotente + segura).
- Edge function `admin-create-user` (protegida: exige JWT + role `admin`) para você liberar novos logins de dentro do app — sem cadastro público.

## Tabelas (schema)

```
scenes (
  id uuid pk,
  user_id uuid → auth.users on delete cascade,
  name text,
  data jsonb,          -- payload completo da cena (mesmo formato do Export)
  created_at, updated_at
)

user_roles (
  id uuid pk,
  user_id uuid → auth.users,
  role app_role,
  unique(user_id, role)
)
```

RLS:
- `scenes`: SELECT/INSERT/UPDATE/DELETE só quando `user_id = auth.uid()`.
- `user_roles`: SELECT do próprio usuário; escrita somente via edge functions com `service_role`.
- GRANTs explícitos para `authenticated` e `service_role` (sem `anon`).

## UI

- Novo item de menu **File** (ou botão na topbar do 3ds Max R3) com:
  - Save (local — download `.3dsled.json`)
  - Save Cloud… (pergunta nome, grava em `scenes`)
  - Open Cloud… (lista `scenes` do usuário, carrega)
  - Export (mesmo que Save local, formato explícito)
  - Import (input file, carrega `.3dsled.json`)
- Todas as 4 ações ficam **desabilitadas com tooltip "Login required"** quando não autenticado.
- **Login dialog** (skin R3): campos email + senha, botão OK/Cancel. Sem link "criar conta".
- **Admin panel** (só aparece se `has_role(admin)`): formulário "Liberar novo usuário" (email + senha inicial) → chama `admin-create-user`.

## Formato Save/Export

JSON único com:
- objetos da cena (geometria, transform, material id)
- materiais (24 slots do Material Editor)
- ambiente (`EnvironmentContext`)
- timeline / animação
- versão do formato para compatibilidade futura

Save local = `Blob` + `URL.createObjectURL` + download.
Import = `<input type=file accept=".json">` + `JSON.parse` + validação Zod + hidrata os stores.

## Passos de implementação

1. Habilitar Lovable Cloud.
2. Migration: enum `app_role`, tabelas `user_roles` e `scenes`, função `has_role`, RLS + GRANTs.
3. Edge function `bootstrap-admin` (verify_jwt=false, roda 1x, cria walter@ledmkt.com com senha fornecida, insere role admin, marca como concluído). Chamada uma única vez pelo próprio backend e depois vira no-op.
4. Edge function `admin-create-user` (verify_jwt=false + validação manual do JWT + checa role admin).
5. Contexto `AuthContext` (session listener + `getUser` para checagens sensíveis).
6. `LoginDialog` (R3 skin).
7. Serialização/desserialização da cena (`sceneSerializer.ts`).
8. Ações Save / Save Cloud / Open Cloud / Export / Import — plugadas no menu File existente.
9. `AdminPanel` para liberar novos usuários.
10. Gate visual (ações desabilitadas quando logged-out).

## Segurança

- Senha do admin usada uma única vez no `bootstrap-admin` e **nunca** ecoada em logs, respostas, nem commitada em texto.
- Recomendo trocar a senha assim que fizer o primeiro login (posso adicionar botão "Change password" no admin panel — me diga se quer isso).
- Sem cadastro público em lugar nenhum da UI/edge functions.
- RLS bloqueia acesso cross-user às cenas mesmo com token válido.

## Nota
Só implemento após você aprovar o plano.