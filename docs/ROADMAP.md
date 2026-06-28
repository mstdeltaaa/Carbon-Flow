# Roadmap de desenvolvimento

## Fase 0 - Planejamento

Objetivo: definir base tecnica e dominio antes de codificar funcionalidades.

Entregas:

- Arquitetura de pastas.
- Modelagem inicial do banco.
- Estrategia de RLS, autenticacao e permissoes.
- Roadmap incremental.

Como validar:

- Revisar os documentos em `docs/`.
- Revisar a migracao SQL inicial.
- Confirmar se as regras de negocio refletem o MVP.

## Fase 1 - Configuracao inicial do projeto

Objetivo: criar o monorepo e preparar a base de desenvolvimento.

Entregas:

- Workspace com `apps/web` e `apps/api`.
- Next.js com TypeScript, Tailwind CSS e shadcn/ui.
- NestJS com TypeScript.
- Configuracao compartilhada de lint/format/types.
- Variaveis de ambiente documentadas.
- Script local de desenvolvimento.

Como testar:

- Subir frontend local.
- Subir API local.
- Verificar pagina inicial protegida ou placeholder.
- Rodar lint/typecheck.

## Fase 2 - Autenticacao e multiempresa

Objetivo: permitir login seguro e isolamento por empresa.

Entregas:

- Login/cadastro via Supabase Auth.
- Perfil local em `users`.
- Criacao da primeira empresa.
- Vinculo em `company_users`.
- Seletor de empresa ativa.
- Guards no backend.
- Politicas RLS iniciais aplicadas.

Como testar:

- Usuario A nao ve dados da empresa B.
- Usuario sem empresa e guiado para onboarding.
- Token invalido nao acessa API.

## Fase 3 - Dashboard

Objetivo: dar visao rapida do negocio.

Entregas:

- Faturamento do periodo.
- Quantidade de vendas.
- Lucro estimado.
- Produtos mais vendidos.
- Estoque baixo.
- Alertas importantes.

Como testar:

- Criar dados de exemplo.
- Confirmar que indicadores respeitam a empresa ativa.
- Confirmar estados vazios.

## Fase 4 - Insumos

Objetivo: cadastrar custos e estoque base.

Entregas:

- CRUD de insumos.
- Unidade de medida.
- Custo unitario.
- Estoque atual.
- Estoque minimo.
- Alertas de estoque baixo.
- Movimentacoes manuais de entrada/ajuste.

Como testar:

- Criar farinha em kg, tecido em metro e parafuso em peca.
- Ajustar estoque e verificar historico.
- Bloquear vendedor de acessar custos internos.

## Fase 5 - Produtos

Objetivo: montar produtos compostos por insumos.

Entregas:

- CRUD de produtos.
- Composicao por insumos.
- Calculo automatico de custo.
- Margem e preco sugerido.
- Edicao manual de preco.

Regra inicial:

```text
preco sugerido = custo total * 1.30
```

Como testar:

- Criar Bolo Chocolate com farinha, chocolate, ovos e embalagem.
- Conferir custo calculado.
- Conferir preco sugerido.

## Fase 6 - Estoque automatico

Objetivo: baixar estoque a partir de venda.

Entregas:

- Calculo de consumo por produto vendido.
- Baixa automatica de insumos.
- Movimentacao de estoque por venda.
- Validacao de estoque insuficiente.

Como testar:

- Vender 1 produto e verificar baixa de todos os insumos.
- Vender quantidade maior e validar multiplicacao do consumo.
- Tentar vender sem estoque suficiente.

## Fase 7 - Clientes

Objetivo: centralizar relacionamento comercial.

Entregas:

- CRUD de clientes.
- Historico de orcamentos.
- Historico de vendas.
- Total gasto.

Como testar:

- Criar cliente.
- Criar orcamento e venda para esse cliente.
- Conferir historico agregado.

## Fase 8 - Orcamentos

Objetivo: criar orcamentos profissionais.

Entregas:

- Numero unico por empresa.
- Itens com produto, quantidade e valor.
- Validade e observacoes.
- PDF.
- Impressao.
- Status do orcamento.

Como testar:

- Gerar Orcamento #000001.
- Gerar PDF.
- Alterar status.

## Fase 9 - Vendas

Objetivo: converter aprovacao em venda e baixa de estoque.

Entregas:

- Botao "Converter em venda".
- Criacao de venda.
- Baixa de estoque.
- Registro financeiro.
- Registro de auditoria.
- Orcamento marcado como convertido.

Como testar:

- Converter orcamento aprovado.
- Verificar venda criada.
- Verificar estoque e movimentacoes.
- Impedir conversao duplicada.

## Fase 10 - Planos e limites

Objetivo: preparar modelo de negocio.

Entregas:

- Tabela de assinaturas.
- Limites por plano Free, Pro e Empresa.
- Guards de limite.
- Estrutura para gateway de pagamento futuro.

Como testar:

- Empresa Free atinge limite configurado.
- Empresa Pro acessa recursos completos.

