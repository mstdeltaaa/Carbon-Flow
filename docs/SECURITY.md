# Seguranca, multiempresa e LGPD

## Modelo multiempresa

O Carbon Flow usa `company_id` como chave de isolamento em todas as tabelas de negocio.

Um usuario pode pertencer a uma ou mais empresas por meio de `company_users`. Em cada requisicao, a API deve resolver:

1. usuario autenticado;
2. empresa ativa;
3. papel do usuario nessa empresa;
4. permissao para executar a acao.

## Papeis iniciais

### Administrador

- Acesso total na empresa.
- Gerencia usuarios, permissoes, dados, planos e configuracoes.

### Funcionario

- Acesso operacional.
- Pode gerenciar insumos, produtos, estoque, clientes, orcamentos e vendas conforme permissao.

### Vendedor

- Acesso comercial.
- Pode consultar produtos, gerenciar clientes e criar orcamentos.
- Nao deve acessar custos internos, estoque detalhado nem configuracoes administrativas no MVP.

## Camadas de protecao

### Frontend

- Rotas protegidas por sessao.
- Redirecionamento de usuarios nao autenticados.
- Menu adaptado ao papel do usuario.
- Nunca confiar apenas no menu para proteger dados.

### API NestJS

- Validacao de JWT do Supabase Auth.
- Guard de autenticacao.
- Guard de empresa ativa.
- Guard de papel/permissao.
- DTOs validados.
- Headers de seguranca HTTP na API.
- Swagger desativado por padrao em producao.
- Operacoes criticas dentro de transacao.
- Logs de auditoria para acoes sensiveis.

### Banco Supabase

- RLS habilitado em tabelas multiempresa.
- Politicas usando membership de `company_users`.
- Funcoes auxiliares para evitar duplicacao de regra.
- `company_id` obrigatorio em tabelas de negocio.

## RLS e API NestJS

Quando o frontend acessar dados diretamente via Supabase, `auth.uid()` identifica o usuario.

Quando a API NestJS acessar o banco com cliente Supabase do usuario, o token do usuario e enviado no header `Authorization` e as politicas RLS continuam usando `auth.uid()`.

Quando a API NestJS acessar o banco por conexao PostgreSQL direta no futuro, ela deve definir o usuario atual no inicio da transacao:

```sql
select set_config('app.current_user_id', '<uuid-do-usuario>', true);
```

As funcoes de RLS usam primeiro `app.current_user_id` e, quando ausente, usam `auth.uid()`.

A chave administrativa do Supabase deve ficar restrita a fluxos server-side inevitaveis, como convite de usuarios, leitura administrativa necessaria para configuracoes, limites de assinatura e gravacao de auditoria. Esses fluxos ainda precisam validar membership/papel antes de qualquer operacao.

## Auditoria

Registrar em `audit_logs`:

- login suspeito ou falha de autorizacao relevante;
- criacao/alteracao/exclusao de usuarios da empresa;
- criacao/alteracao/exclusao de insumos;
- alteracao manual de estoque;
- criacao e conversao de orcamento;
- cancelamento de venda;
- mudanca de plano.

## LGPD

Preparar desde o inicio:

- Coletar apenas dados necessarios.
- Ter base para exportar dados da empresa.
- Ter processo para anonimizar/excluir dados pessoais quando aplicavel.
- Registrar consentimentos futuros se houver marketing.
- Separar dados pessoais de dados operacionais sempre que fizer sentido.
- Evitar dados sensiveis sem necessidade de negocio.

## Boas praticas

- Nao expor `service_role` no frontend.
- Nao confiar em `company_id` enviado pelo cliente sem validar membership.
- Nao permitir baixa de estoque fora de uma transacao.
- Nao deletar registros financeiros importantes; preferir status/cancelamento.
- Usar snapshots em orcamentos e vendas para preservar historico.
- Usar rate limiting em login e endpoints sensiveis.
