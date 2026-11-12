-- S6b: legarea daună → client la finalizare + acțiunile de reînnoire scrise de broker în `events`.

-- ---------------------------------------------------------------------------
-- Potrivirea unei părți din dosar cu un client existent (determinist, fără LLM).
-- Cheile se compară fără spații și semne: „FX-RCA 0001” = „FXRCA0001”, „b 200 tst” = „B200TST”.
-- Întoarce toți candidații; aplicația decide (unic după poliță, altfel unic după număr).
-- ---------------------------------------------------------------------------
create index policies_policy_no_key_idx on public.policies (regexp_replace(upper(policy_no), '[^A-Z0-9]', '', 'g'));
create index vehicles_plate_key_idx on public.vehicles (regexp_replace(upper(plate), '[^A-Z0-9]', '', 'g'));

create function public.match_party_client(p_agency uuid, p_policy_no text, p_plate text)
returns table (client_id uuid, method text)
language sql stable set search_path = ''
as $$
  with keys as (
    select nullif(regexp_replace(upper(coalesce(p_policy_no, '')), '[^A-Z0-9]', '', 'g'), '') as policy_key,
           nullif(regexp_replace(upper(coalesce(p_plate, '')), '[^A-Z0-9]', '', 'g'), '') as plate_key
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
$$;

-- Doar serverul (service role, la finalizare) o apelează; brokerii și anon nu.
revoke all on function public.match_party_client(uuid, text, text) from public, anon, authenticated;
grant execute on function public.match_party_client(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Reînnoiri: „Am contactat” / „Reamintește-mi” = rânduri în `events` (entity_type 'policy').
-- Brokerul scrie doar aceste două tipuri, în numele lui, pe polițe din agenția lui (RLS pe `policies`).
-- ---------------------------------------------------------------------------
create policy events_insert_renewal on public.events for insert to authenticated
  with check (
    entity_type = 'policy'
    and type in ('renewal_contacted', 'renewal_snoozed')
    and payload ->> 'broker_id' = (select private.current_broker_id())::text
    and exists (select 1 from public.policies p where p.id = entity_id)
  );
grant insert on public.events to authenticated;
