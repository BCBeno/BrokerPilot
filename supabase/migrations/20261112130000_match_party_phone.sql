-- Potrivirea parte → client primește a treia cheie: telefonul șoferului.
-- Se compară ultimele 9 cifre, ca „0722 123 456”, „+40722123456” și „0040 722-123-456” să fie același număr.
-- Ordinea o decide aplicația (`decideLink`): poliță, apoi număr de înmatriculare, apoi telefon; mereu doar o potrivire unică.

create index clients_phone_key_idx on public.clients (right(regexp_replace(phone, '[^0-9]', '', 'g'), 9)) where phone is not null;

drop function public.match_party_client(uuid, text, text);

create function public.match_party_client(p_agency uuid, p_policy_no text, p_plate text, p_phone text default null)
returns table (client_id uuid, method text)
language sql stable set search_path = ''
as $$
  with keys as (
    select nullif(regexp_replace(upper(coalesce(p_policy_no, '')), '[^A-Z0-9]', '', 'g'), '') as policy_key,
           nullif(regexp_replace(upper(coalesce(p_plate, '')), '[^A-Z0-9]', '', 'g'), '') as plate_key,
           case when length(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')) >= 9
                then right(regexp_replace(p_phone, '[^0-9]', '', 'g'), 9) end as phone_key
  )
  select distinct p.client_id, 'policy'::text
    from public.policies p
    join public.clients c on c.id = p.client_id
    cross join keys k
   where c.agency_id = p_agency
     and k.policy_key is not null
     and length(k.policy_key) >= 4
     and regexp_replace(upper(p.policy_no), '[^A-Z0-9]', '', 'g') = k.policy_key
  union
  select distinct v.client_id, 'plate'::text
    from public.vehicles v
    join public.clients c on c.id = v.client_id
    cross join keys k
   where c.agency_id = p_agency
     and k.plate_key is not null
     and regexp_replace(upper(v.plate), '[^A-Z0-9]', '', 'g') = k.plate_key
  union
  select distinct c.id, 'phone'::text
    from public.clients c
    cross join keys k
   where c.agency_id = p_agency
     and k.phone_key is not null
     and c.phone is not null
     and right(regexp_replace(c.phone, '[^0-9]', '', 'g'), 9) = k.phone_key
$$;

-- Aceleași drepturi ca înainte: serverul la finalizare și brokerul la „Adaugă în portofoliu” (security invoker, deci RLS).
revoke all on function public.match_party_client(uuid, text, text, text) from public, anon;
grant execute on function public.match_party_client(uuid, text, text, text) to authenticated, service_role;
