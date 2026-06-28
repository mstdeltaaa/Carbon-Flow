# Arquitetura do Carbon Flow

## Visao geral

O Carbon Flow sera construido como um monorepo com apps separados para frontend e backend, alem de pacotes compartilhados para contratos, validacoes e tipos comuns.

Supabase sera usado para PostgreSQL, Auth, Storage e politicas de Row Level Security. O NestJS sera a API de dominio: regras de negocio, validacao, permissao, orquestracao de estoque, geracao de PDF e integracoes futuras.

## Estrutura de pastas proposta

```text
carbon-flow/
  apps/
    web/
      src/
        app/
        components/
        features/
        hooks/
        lib/
        styles/
      public/
      components.json
      tailwind.config.ts
      next.config.ts

    api/
      src/
        app.module.ts
        main.ts
        common/
          decorators/
          filters/
          guards/
          interceptors/
          pipes/
        config/
        modules/
          auth/
          companies/
          users/
          dashboard/
          ingredients/
          products/
          stock/
          customers/
          budgets/
          sales/
          audit/
          subscriptions/
        database/
          database.module.ts
          transaction.ts
      test/

  packages/
    contracts/
      src/
        dto/
        schemas/
        types/
    config/
      eslint/
      typescript/
      prettier/
    ui/
      src/

  supabase/
    migrations/
    seed/
    storage/

  docs/
```

## Responsabilidades por camada

### Frontend `apps/web`

- Login, cadastro e recuperacao de senha via Supabase Auth.
- Rotas protegidas por sessao.
- Interface responsiva para dashboard, cadastros, orcamentos e vendas.
- Componentes shadcn/ui e Tailwind CSS.
- Chamada para a API NestJS para regras de negocio.

### Backend `apps/api`

- Validar tokens emitidos pelo Supabase Auth.
- Resolver empresa ativa do usuario.
- Aplicar permissoes por papel e por recurso.
- Executar regras de negocio transacionais:
  - calcular custo de produtos;
  - gerar orcamentos;
  - converter orcamento em venda;
  - baixar estoque;
  - registrar auditoria.
- Gerar PDFs de orcamento.
- Preparar integracoes futuras de pagamento.

### Banco `supabase`

- Tabelas de negocio multiempresa.
- RLS para isolamento por empresa.
- Funcoes auxiliares para validar membership.
- Historico de movimentacoes e auditoria.
- Estrutura inicial para assinaturas e limites.

## Padrao de modulos NestJS

Cada modulo deve seguir a mesma organizacao:

```text
modules/ingredients/
  dto/
  entities/
  ingredients.controller.ts
  ingredients.service.ts
  ingredients.repository.ts
  ingredients.module.ts
```

Controllers recebem entrada HTTP, services concentram regras de negocio e repositories isolam consultas.

## Padrao de features no Next.js

Cada area de produto deve ter uma pasta propria:

```text
features/ingredients/
  components/
  hooks/
  services/
  types.ts
  validators.ts
```

Isso evita uma pasta global de componentes crescendo sem dono claro.

## Fluxos principais

### Criacao de produto

1. Usuario informa nome, preco desejado e composicao.
2. API busca custo atual de cada insumo.
3. API calcula custo total.
4. API calcula preco sugerido com margem inicial de 30%.
5. Produto e itens sao salvos na mesma transacao.

### Conversao de orcamento em venda

1. Usuario aprova orcamento.
2. API valida permissao e status do orcamento.
3. API cria venda e itens.
4. API calcula insumos necessarios.
5. API baixa estoque.
6. API registra movimentacoes de estoque.
7. API registra auditoria.
8. Orcamento muda para convertido.

## Decisoes iniciais

- O isolamento principal sera por `company_id`.
- O usuario autenticado vem do Supabase Auth.
- `public.users` sera um perfil local ligado a `auth.users`.
- `company_users` define papel, status e permissoes extras.
- Valores monetarios serao `numeric`, nao `float`.
- Quantidades tambem serao `numeric` para suportar gramas, metros, litros e pecas.
- Operacoes de estoque devem ser transacionais.

