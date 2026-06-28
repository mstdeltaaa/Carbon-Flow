# Carbon Flow

Carbon Flow e um SaaS web para pequenos negocios que fabricam produtos e precisam controlar custos, estoque, orcamentos e vendas em um unico fluxo.

Proposta de valor:

> Do insumo a venda, controle todo o fluxo do seu negocio em um unico lugar.

## Publico inicial

- Confeiteiras
- Artesaos
- Empresas de personalizados
- Marcenarias pequenas
- Serralherias
- Pequenos fabricantes

## Stack definida

- Frontend: Next.js, TypeScript, Tailwind CSS, shadcn/ui
- Backend: NestJS, TypeScript
- Banco: PostgreSQL no Supabase
- Autenticacao: Supabase Auth
- Arquivos: Supabase Storage
- Hospedagem planejada: Vercel para o frontend, Supabase para dados/auth/storage e API NestJS em ambiente compativel com Node.js

## Modulos planejados

1. Dashboard
2. Insumos
3. Produtos compostos por insumos
4. Estoque e movimentacoes
5. Clientes
6. Orcamentos com PDF
7. Conversao de orcamento em venda
8. Historico e auditoria
9. Assinaturas e limites por plano

## Documentacao inicial

- [Arquitetura](docs/ARCHITECTURE.md)
- [Modelagem do banco](docs/DATABASE_MODEL.md)
- [Seguranca e multiempresa](docs/SECURITY.md)
- [Roadmap](docs/ROADMAP.md)
- [Configuracao local](docs/SETUP.md)

## Principios de produto

- Cada usuario pertence a uma ou mais empresas.
- Todos os dados de negocio sao isolados por empresa.
- O sistema calcula custo, margem e preco sugerido com rastreabilidade.
- Vendas aprovadas baixam estoque automaticamente.
- Operacoes importantes geram historico e auditoria.
- A base ja nasce preparada para planos pagos, LGPD e crescimento modular.

## Desenvolvimento local

Depois de preencher `.env` com os dados do Supabase:

```bash
pnpm install
pnpm dev
```

Aplicacoes:

- Web: `http://localhost:3000`
- API: `http://localhost:3333`
