-- BrokerPilot e un tool intern pentru o singură firmă: scoatem agenția (multi-tenant) din schemă.
-- Regula de acces devine „orice broker activ” (`private.current_broker_id() is not null`), adică exact
-- ce făcea până acum filtrul pe agenție, fiindcă exista o singură agenție.
--
-- ORDINE: se aplică DUPĂ ce aplicația nouă (fără `agency_id`) rulează pe server. Codul vechi citește
-- `brokers.agency_id` și ar da eroare la login după migrare.

-- 1. Politicile care foloseau agenția: aceeași regulă, pe brokerul activ.
drop policy if exists agencies_select on public.agencies;

drop policy if exists brokers_select on public.brokers;
create policy brokers_select on public.brokers for select to authenticated
  using ((select private.current_broker_id()) is not null);

drop policy if exists clients_select on public.clients;
drop policy if exists clients_insert on public.clients;
drop policy if exists clients_update on public.clients;
create policy clients_select on public.clients for select to authenticated
  using ((select private.current_broker_id()) is not null);
create policy clients_insert on public.clients for insert to authenticated
  with check ((select private.current_broker_id()) is not null);
create policy clients_update on public.clients for update to authenticated
  using ((select private.current_broker_id()) is not null)
  with check ((select private.current_broker_id()) is not null);

drop policy if exists claims_select on public.claims;
drop policy if exists claims_update on public.claims;
create policy claims_select on public.claims for select to authenticated
  using ((select private.current_broker_id()) is not null);
create policy claims_update on public.claims for update to authenticated
  using ((select private.current_broker_id()) is not null)
  with check ((select private.current_broker_id()) is not null);

drop policy if exists conversations_select on public.conversations;
drop policy if exists conversations_update on public.conversations;
create policy conversations_select on public.conversations for select to authenticated
  using ((select private.current_broker_id()) is not null);
create policy conversations_update on public.conversations for update to authenticated
  using ((select private.current_broker_id()) is not null)
  with check ((select private.current_broker_id()) is not null);

drop policy if exists inbox_items_select on public.inbox_items;
drop policy if exists inbox_items_update on public.inbox_items;
create policy inbox_items_select on public.inbox_items for select to authenticated
  using ((select private.current_broker_id()) is not null);
create policy inbox_items_update on public.inbox_items for update to authenticated
  using ((select private.current_broker_id()) is not null)
  with check ((select private.current_broker_id()) is not null);

drop policy if exists ai_calls_select on public.ai_calls;
create policy ai_calls_select on public.ai_calls for select to authenticated
  using ((select private.current_broker_id()) is not null);

drop policy if exists events_select on public.events;
create policy events_select on public.events for select to authenticated
  using ((select private.current_broker_id()) is not null);

drop policy if exists kb_documents_select on public.kb_documents;
create policy kb_documents_select on public.kb_documents for select to authenticated
  using ((select private.current_broker_id()) is not null);
drop policy if exists kb_chunks_select on public.kb_chunks;
create policy kb_chunks_select on public.kb_chunks for select to authenticated
  using ((select private.current_broker_id()) is not null);
drop policy if exists kb_vectors_select on public.kb_vectors;
create policy kb_vectors_select on public.kb_vectors for select to authenticated
  using ((select private.current_broker_id()) is not null);

drop policy if exists doc_checks_select on public.doc_checks;
drop policy if exists doc_checks_update on public.doc_checks;
create policy doc_checks_select on public.doc_checks for select to authenticated
  using (
    (select private.current_broker_id()) is not null
    and (requested_by_broker_id is null or exists (select 1 from public.brokers b where b.id = doc_checks.requested_by_broker_id))
  );
create policy doc_checks_update on public.doc_checks for update to authenticated
  using (requested_by_broker_id is null or exists (select 1 from public.brokers b where b.id = doc_checks.requested_by_broker_id))
  with check ((select private.current_broker_id()) is not null);

drop policy if exists brokers_read_claim_files on storage.objects;
create policy brokers_read_claim_files on storage.objects for select to authenticated
  using (bucket_id = 'claim-files' and (select private.current_broker_id()) is not null);
drop policy if exists brokers_read_kb_docs on storage.objects;
create policy brokers_read_kb_docs on storage.objects for select to authenticated
  using (bucket_id = 'kb-docs' and (select private.current_broker_id()) is not null);

-- 2. Funcțiile: fără parametrul / variabila de agenție.
drop function if exists public.match_party_client(uuid, text, text, text);
create function public.match_party_client(p_policy_no text, p_plate text, p_phone text default null)
returns table (client_id uuid, method text)
language sql
stable
set search_path = ''
as $$
  with keys as (
    select nullif(regexp_replace(upper(coalesce(p_policy_no, '')), '[^A-Z0-9]', '', 'g'), '') as policy_key,
           nullif(regexp_replace(upper(coalesce(p_plate, '')), '[^A-Z0-9]', '', 'g'), '') as plate_key,
           case when length(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')) >= 9
                then right(regexp_replace(p_phone, '[^0-9]', '', 'g'), 9) end as phone_key
  )
  select distinct p.client_id, 'policy'::text
    from public.policies p
    cross join keys k
   where k.policy_key is not null
     and length(k.policy_key) >= 4
     and regexp_replace(upper(p.policy_no), '[^A-Z0-9]', '', 'g') = k.policy_key
  union
  select distinct v.client_id, 'plate'::text
    from public.vehicles v
    cross join keys k
   where k.plate_key is not null
     and regexp_replace(upper(v.plate), '[^A-Z0-9]', '', 'g') = k.plate_key
  union
  select distinct c.id, 'phone'::text
    from public.clients c
    cross join keys k
   where k.phone_key is not null
     and c.phone is not null
     and right(regexp_replace(c.phone, '[^0-9]', '', 'g'), 9) = k.phone_key
$$;
revoke all on function public.match_party_client(text, text, text) from public, anon;
grant execute on function public.match_party_client(text, text, text) to authenticated, service_role;

create or replace function public.link_voice_call(p_call_id text, p_claim_id uuid, p_method text, p_score numeric)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_linked uuid;
  v_n int;
begin
  if coalesce(p_call_id, '') = '' then return false; end if;
  if not exists (select 1 from public.claims c where c.id = p_claim_id) then return false; end if;

  insert into public.conversations as cv (channel, external_id, claim_id)
  values ('voice', p_call_id, p_claim_id)
  on conflict (channel, external_id) do update set claim_id = coalesce(cv.claim_id, excluded.claim_id)
  returning cv.claim_id into v_linked;
  if v_linked is distinct from p_claim_id then return false; end if;

  insert into public.case_interactions (claim_id, channel, direction, external_ref, identity_level, match_method, match_score)
  values (p_claim_id, 'voice', 'in', p_call_id, 'L0', p_method, p_score)
  on conflict (channel, external_ref) where external_ref is not null do nothing;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    insert into public.events (entity_type, entity_id, type, payload)
    values ('claim', p_claim_id, 'voice_call_linked', jsonb_build_object('method', p_method, 'call_id', p_call_id));
  end if;
  return true;
end
$$;

create or replace function public.attach_voice_call(p_conversation_id uuid, p_claim_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_broker uuid := (select private.current_broker_id());
  v_call text;
  v_n int;
begin
  if v_broker is null then return false; end if;
  if not exists (select 1 from public.claims c where c.id = p_claim_id) then return false; end if;

  update public.conversations cv
     set claim_id = p_claim_id, claim_ignored_at = null
   where cv.id = p_conversation_id and cv.channel = 'voice' and cv.claim_id is null
  returning cv.external_id into v_call;
  if v_call is null then return false; end if;

  insert into public.case_interactions (claim_id, channel, direction, external_ref, identity_level, match_method, match_score)
  values (p_claim_id, 'voice', 'in', v_call, 'L0', 'broker', 1)
  on conflict (channel, external_ref) where external_ref is not null do nothing;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    insert into public.events (entity_type, entity_id, type, payload)
    values ('claim', p_claim_id, 'voice_call_linked', jsonb_build_object('method', 'broker', 'call_id', v_call, 'broker_id', v_broker));
  end if;
  return true;
end
$$;

drop function if exists private.current_agency_id();

-- 3. Coloanele și tabelul. Indexurile compuse cu agency_id cad odată cu coloana; le refacem fără ea.
alter table public.brokers       drop column agency_id;
alter table public.clients       drop column agency_id;
alter table public.claims        drop column agency_id;
alter table public.conversations drop column agency_id;
alter table public.inbox_items   drop column agency_id;
drop table public.agencies;

create index if not exists claims_status_idx on public.claims (status);
create index if not exists conversations_handoff_idx on public.conversations (handoff_status);
create index if not exists inbox_items_status_idx on public.inbox_items (status, received_at desc);
