# Configuracao local

## 1. Variaveis de ambiente

Use `.env.example` como referencia e preencha os dados do projeto Supabase:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
```

No frontend, apenas variaveis com `NEXT_PUBLIC_` podem ser publicas.

Arquivos recomendados:

- raiz: `.env`, com variaveis compartilhadas e da API;
- `apps/web/.env.local`, com as variaveis `NEXT_PUBLIC_`;
- `apps/api/.env`, caso queira rodar a API isoladamente.

## 2. Instalar dependencias

Opcao recomendada com pnpm:

```bash
pnpm install
```

Opcao compativel com npm:

```bash
npm install
```

Se o ambiente bloquear caches globais, use caches locais/temporarios:

```powershell
$env:npm_config_cache="$env:TEMP\carbonflow-npm-cache"
$env:APPDATA="E:\CarbonFlow\.appdata"
pnpm install
```

Se uma instalacao for interrompida no meio, limpe os diretórios `node_modules` antes de tentar novamente pelo seu terminal normal.

## 3. Rodar em desenvolvimento

```bash
pnpm dev
```

Aplicacoes esperadas:

- Web: `http://localhost:3000`
- API: `http://localhost:3333`
- Swagger da API: `http://localhost:3333/docs`
- Health check: `http://localhost:3333/health`

## 4. Validacoes iniciais

```bash
pnpm typecheck
pnpm lint
pnpm build
```

## 5. Supabase

Como a migration inicial ja foi executada no SQL Editor, confirme no painel do Supabase:

- tabelas criadas em `public`;
- RLS ativo nas tabelas de negocio;
- funcoes `is_company_member`, `has_company_role` e `create_company_for_current_user`;
- trigger `on_auth_user_created` em `auth.users`.

## 6. Autenticacao e primeira empresa

Preencha as variaveis abaixo antes de testar login:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
```

Para testar:

1. Acesse `http://localhost:3000/login`.
2. Crie uma conta ou entre com uma conta existente.
3. Se o usuario nao tiver empresa, o sistema abre `/onboarding`.
4. Crie a empresa.
5. O sistema redireciona para `/dashboard`.

Para testar a API com um token Supabase:

```bash
curl http://localhost:3333/auth/me -H "Authorization: Bearer <access-token>"
```

Observacao: se o usuario ja existia antes da trigger `on_auth_user_created`,
garanta que ele tambem exista em `public.users`, pois `company_users` depende
desse perfil local.
