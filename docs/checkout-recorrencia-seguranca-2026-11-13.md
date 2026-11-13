# Checkout recorrente Woovi e segurança — 13/11/2026

## Resultado para o usuário
- O checkout mostra os dados obrigatórios antes da escolha entre Pix Automático e cartão.
- Se faltar dado, a assinatura não é criada e a tela informa exatamente o que corrigir.
- Pix Automático continua mensal e direcionado à conta principal Woovi.
- Cartão é cobrança mensal avulsa confirmada pela Woovi; não foi apresentado como débito automático porque a API oficial não oferece esse mandato.
- Cinco exposições críticas foram corrigidas; a segunda varredura terminou com zero erros.

## Camada Frontend
Arquivo principal: src/components/barber/BarberMeuPlano.tsx.
O checkout exige nome, CPF/CNPJ, e-mail, telefone e endereço completo. Erros 422 com CHECKOUT_DATA_INCOMPLETE abrem a lista de pendências retornada pelo serviço. Trocar de plano limpa QR Code, link e correlação anteriores para evitar misturar cobranças.

src/hooks/useBarbershopPendingFields.ts segue a mesma ordem de fallback do serviço: unidade, informacoes_empresa, tenant, responsável. CPF e CNPJ são aceitos; telefone e e-mail são obrigatórios; bairro passou a ser verificado.

## Camada Backend Woovi
create-tenant-plan-subscription valida sessão e permissão, usa preço oficial do plano e chama os validadores compartilhados antes de registrar a intenção.

Pix: POST /api/v1/subscriptions com PIX_RECURRING, MONTHLY, PAYMENT_ON_APPROVAL, THREE_RETRIES_7_DAYS e sem splits.
Cartão: POST /api/v1/charge com CREDIT_CARD e sem splits. A ativação exige status COMPLETED e o mesmo correlationID/valor.

Referências oficiais:
- https://developers.woovi.com/docs/pix-automatic/pix-automatic-how-to-create
- https://developers.woovi.com/docs/pix-automatic/pix-automatic-step-by-step
- https://developers.woovi.com/docs/card/card-how-to-create-charge-using-api
- https://developers.woovi.com/docs/card/card-first-steps

## Camada Database Supabase
Foram preservados todos os dados. Mudanças de segurança:
- n8n_chat_histories: RLS ativa, acesso de navegador revogado e política explícita de negação para anon/authenticated.
- agente_webhook_global: leitura limitada a administradores e equipe DUB já autorizada.
- discount_coupons: leitura e escrita limitadas a admin/ti ou responsável pelo tenant.
- storage avatars: somente o proprietário pode enviar, substituir ou excluir seus arquivos; leitura pública mantida.
- fn_sync_agendamento_cliente_nome, get_admin_dashboard_fast, guard_barber_debt_release e update_agendamento_cliente_nome: search_path fixo em public.

confirm_tenant_plan_payment permanece exclusiva de service_role; nenhuma ativação manual foi introduzida.

## Fluxos críticos e erros
- Dados incompletos: resposta 422, nenhuma cobrança bancária criada; corrigir cadastro e tentar novamente.
- Falha Woovi na criação: intenção marcada failed, plano não ativado e motivo exibido.
- Falha ao salvar cobrança já criada: não gerar outra; iniciar reconciliação pela correlação.
- Cartão ainda não concluído: manter plano pendente; consulta de status não adianta vencimento.
- Renovação Pix: exigir parcela COMPLETED com valor exato e webhook revalidado na Woovi.
- Webhook inválido: resposta 401 e nenhuma escrita financeira.

## Verificação e bloqueios
- 19 testes passaram; TypeScript passou.
- Função create-tenant-plan-subscription implantada.
- Segunda varredura: zero erros, três avisos de leitura pública e 20 informações preexistentes.
- Não foi criada cobrança real. Falta uma sessão autenticada do barbeiro; o Supabase externo não injeta sessão no navegador de teste.
- A autorização Pix exige que o pagador leia o QR Code e aprove no próprio banco.
- O teste de cartão exige cartão e KYC ativos na Woovi e um pagador com cartão válido.
- Recorrência automática de cartão continua bloqueada pela ausência desse contrato na API oficial; não armazenar cartão nem repetir cobranças avulsas como se fossem recorrência.
