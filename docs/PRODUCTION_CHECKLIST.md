# Checklist de producao do Carbon Flow

Use este checklist antes de liberar o sistema para clientes reais.

## 1. Variaveis da Vercel

### Web

- `NEXT_PUBLIC_APP_URL`: URL publica do frontend.
- `NEXT_PUBLIC_API_URL`: URL publica da API.
- `NEXT_PUBLIC_SUPABASE_URL`: URL do projeto Supabase.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: chave publica/anonima do Supabase.
- `NEXT_PUBLIC_ASSISTANT_AI_ENABLED`: `true` apenas se a API da IA estiver pronta.

### API

- `NODE_ENV`: `production`.
- `CORS_ORIGINS`: URL publica do frontend. Separe por virgula se houver mais de uma.
- `SUPABASE_URL`: URL do projeto Supabase.
- `SUPABASE_ANON_KEY` ou `SUPABASE_PUBLISHABLE_KEY`: chave publica/anonima.
- `SUPABASE_SERVICE_ROLE_KEY`: chave secreta apenas na API.
- `SUPABASE_JWKS_URL`: URL JWKS do projeto, se a API passar a validar JWT localmente.
- `OPENAI_API_KEY`: opcional, apenas quando o Carbon usar IA paga.
- `OPENAI_MODEL`: opcional.
- `API_PUBLIC_URL`: URL publica da API.
- `MERCADO_PAGO_ACCESS_TOKEN`: access token da conta Mercado Pago.
- `MERCADO_PAGO_TEST_PAYER_EMAIL`: email do comprador teste, apenas enquanto usar credencial `TEST-`.
- `MERCADO_PAGO_WEBHOOK_SECRET`: segredo de validacao do webhook.
- `MERCADO_PAGO_WEBHOOK_URL`: URL publica do webhook, por exemplo `https://carbon-flow-api.vercel.app/webhooks/mercado-pago`.
- `MERCADO_PAGO_BACK_URL`: URL para voltar ao painel apos o checkout, por exemplo `https://carbon-flow-web.vercel.app/settings?section=billing`.
- `MERCADO_PAGO_PRO_PRICE`: `45`.
- `MERCADO_PAGO_CURRENCY_ID`: `BRL`.
- `ENABLE_SWAGGER`: deixe vazio em producao. Use `true` somente para diagnostico temporario.

Nunca coloque `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, `OPENAI_API_KEY` ou `MERCADO_PAGO_ACCESS_TOKEN` no projeto web.

## 2. Supabase Auth

- Configure Site URL com a URL publica do frontend.
- Configure Redirect URLs para:
  - `https://SEU-DOMINIO/auth/callback`
  - `https://SEU-DOMINIO/set-password`
  - URLs locais apenas em ambiente de desenvolvimento.
- Configure SMTP proprio antes de uso real para evitar limite de email do Supabase.
- Teste convite de usuario e redefinicao de senha fora do localhost.

## 3. Banco e RLS

- Rode todas as migrations em ordem.
- Confirme que RLS esta ativo nas tabelas multiempresa.
- Confirme que tabelas de negocio usam `company_id`.
- Teste com dois usuarios de empresas diferentes:
  - usuario A nao deve ver dados da empresa B;
  - vendedor nao deve ver telas administrativas;
  - funcionario deve seguir permissoes configuradas.
- Nunca use queries no frontend com chave secreta.

## 4. Storage

- Confirme o bucket de assets da empresa.
- Permita leitura publica apenas do que precisa aparecer em documentos.
- Escrita/alteracao/exclusao deve ficar restrita a usuarios admin da empresa.
- Teste upload de logo da empresa e geracao de PDF com a logo.

## 5. API

- Teste `GET /health` na URL publica da API.
- Confirme que `GET /docs` nao abre em producao, salvo com `ENABLE_SWAGGER=true`.
- Confirme CORS aceitando apenas o frontend publico.
- Confirme que endpoints protegidos exigem token e `x-company-id`.
- Confirme que endpoints retornam erro amigavel quando a sessao expira.

## 6. Frontend

- Teste login, cadastro, primeiro acesso, troca de empresa e sair.
- Teste em desktop, tablet e celular.
- Teste troca de tema e avatar do Carbon.
- Teste rotas diretas como `/dashboard`, `/products`, `/settings`.
- Teste recarregar pagina em telas autenticadas.

## 7. Auditoria e LGPD

- Registrar acoes sensiveis em `audit_logs`.
- Manter historico de venda, estoque e financeiro.
- Preparar rotina futura de exportacao dos dados da empresa.
- Preparar rotina futura de anonimizacao/exclusao de dados pessoais.
- Evitar guardar dados sensiveis que nao sejam necessarios ao negocio.

## 8. Backup e operacao

- Ative backups do Supabase antes de colocar clientes reais.
- Defina quem pode acessar o painel do Supabase.
- Guarde chaves em gerenciador de senhas.
- Revogue chaves expostas imediatamente.
- Monitore erros da Vercel e logs do Supabase.

## 9. Mercado Pago

- Configure o webhook para `https://SUA-API/webhooks/mercado-pago`.
- Ative os eventos de assinaturas/preapproval e pagamentos/payment no Mercado Pago.
- Guarde o segredo do webhook em `MERCADO_PAGO_WEBHOOK_SECRET`.
- Ao usar credenciais de teste, configure `MERCADO_PAGO_TEST_PAYER_EMAIL` com o email de uma conta compradora teste. O campo Usuario serve apenas para login no checkout.
- Teste o checkout do plano Pro com uma empresa de teste.
- Teste o Pix mensal avulso do plano Pro.
- Confirme que a empresa so muda para Pro depois do pagamento autorizado.
- Confirme que cancelamento ou pausa remove os limites Pro.

## 10. Teste final de aceite

- Criar empresa nova.
- Criar insumo.
- Criar produto com ficha tecnica.
- Criar cliente.
- Criar orcamento.
- Gerar PDF.
- Converter orcamento em venda.
- Confirmar baixa de estoque.
- Confirmar financeiro.
- Confirmar historico/auditoria.
- Confirmar que outro usuario/empresa nao acessa esses dados.
