-- Função robusta para resolver os pontos de fidelidade do cliente
-- Evita fallback incorreto para 8 quando há promoções válidas no tenant
create or replace function public.get_client_loyalty_required_points(p_user_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_points integer;
begin
  -- Segurança: só permite consulta do próprio usuário autenticado
  if auth.uid() is null or p_user_id is null or auth.uid() <> p_user_id then
    return 8;
  end if;

  -- 1) vínculo explícito cliente-tenant
  select tc.tenant_id
    into v_tenant_id
  from public.tenant_clientes tc
  where tc.user_id = p_user_id
  order by tc.created_at desc
  limit 1;

  -- 2) tenant preferido no perfil
  if v_tenant_id is null then
    select p.barbearia_preferida_id
      into v_tenant_id
    from public.profiles p
    where p.id = p_user_id
    limit 1;
  end if;

  -- 3) tenant do plano ativo/suspenso/pending_cash
  if v_tenant_id is null then
    select pl.tenant_id
      into v_tenant_id
    from public.assinaturas a
    join public.planos pl on pl.id = a.plano_id
    where a.user_id = p_user_id
      and a.status in ('active', 'suspended', 'pending_cash')
    order by a.created_at desc
    limit 1;
  end if;

  -- 4) tenant inferido pelo último agendamento
  if v_tenant_id is null then
    select b.tenant_id
      into v_tenant_id
    from public.agendamentos ag
    join public.barbeiros b on b.id = ag.barbeiro_id
    where ag.user_id = p_user_id
      and ag.barbeiro_id is not null
    order by ag.created_at desc
    limit 1;
  end if;

  if v_tenant_id is null then
    return 8;
  end if;

  -- Seleciona promoção mais relevante para fidelidade
  -- Prioridade: nome com "fidelidade" > ativa > mais recente
  select pr.pontos_necessarios
    into v_points
  from public.promocoes pr
  where pr.tenant_id = v_tenant_id
    and pr.pontos_necessarios is not null
    and pr.pontos_necessarios >= 2
  order by
    case when pr.nome ilike '%fidelidade%' then 0 else 1 end,
    case when pr.ativo then 0 else 1 end,
    pr.created_at desc
  limit 1;

  return coalesce(v_points, 8);
end;
$$;