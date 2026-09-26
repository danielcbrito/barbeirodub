-- 1) Campos para manutenção programada + aviso
alter table public.webhook_config
  add column if not exists manutencao_inicio_programada timestamptz null,
  add column if not exists manutencao_fim_programada timestamptz null,
  add column if not exists manutencao_aviso_ativo boolean not null default false,
  add column if not exists manutencao_aviso_mensagem text null;

-- Consistência: fim >= início (quando ambos existirem)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'webhook_config_manutencao_programada_check'
  ) then
    alter table public.webhook_config
      add constraint webhook_config_manutencao_programada_check
      check (
        manutencao_inicio_programada is null
        or manutencao_fim_programada is null
        or manutencao_fim_programada >= manutencao_inicio_programada
      );
  end if;
end $$;

-- 2) Garante que exista pelo menos 1 linha (evita SELECT vazio)
insert into public.webhook_config (
  id,
  ativo,
  manutencao_ativa,
  manutencao_mensagem,
  manutencao_aviso_ativo,
  manutencao_aviso_mensagem
)
select
  gen_random_uuid(),
  true,
  false,
  null,
  false,
  null
where not exists (select 1 from public.webhook_config);

-- 3) Função segura (SECURITY DEFINER) para ler apenas os campos de manutenção
create or replace function public.get_maintenance_status()
returns table (
  manutencao_ativa boolean,
  manutencao_mensagem text,
  manutencao_inicio_programada timestamptz,
  manutencao_fim_programada timestamptz,
  manutencao_aviso_ativo boolean,
  manutencao_aviso_mensagem text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(wc.manutencao_ativa, false) as manutencao_ativa,
    wc.manutencao_mensagem,
    wc.manutencao_inicio_programada,
    wc.manutencao_fim_programada,
    coalesce(wc.manutencao_aviso_ativo, false) as manutencao_aviso_ativo,
    wc.manutencao_aviso_mensagem
  from public.webhook_config wc
  order by wc.created_at asc nulls last
  limit 1;
$$;

-- 4) Permite chamada via supabase.rpc() sem expor a tabela inteira
grant execute on function public.get_maintenance_status() to anon;
grant execute on function public.get_maintenance_status() to authenticated;
