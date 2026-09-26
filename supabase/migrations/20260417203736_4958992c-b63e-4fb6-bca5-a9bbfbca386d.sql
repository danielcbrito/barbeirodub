create or replace function public.ensure_carteira_for_barbeiro_ready()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.deleted_at, null) is not null then
    return new;
  end if;

  if coalesce(new.conta_configurada, false) = true
     and new.conta_financeira_id is not null then
    insert into public.carteiras (barbeiro_id)
    values (new.id)
    on conflict (barbeiro_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ensure_carteira_for_barbeiro_ready on public.barbeiros;

create trigger trg_ensure_carteira_for_barbeiro_ready
after insert or update of conta_configurada, conta_financeira_id, deleted_at
on public.barbeiros
for each row
execute function public.ensure_carteira_for_barbeiro_ready();

insert into public.carteiras (barbeiro_id)
select b.id
from public.barbeiros b
left join public.carteiras c on c.barbeiro_id = b.id
where coalesce(b.conta_configurada, false) = true
  and b.conta_financeira_id is not null
  and b.deleted_at is null
  and c.id is null
on conflict (barbeiro_id) do nothing;