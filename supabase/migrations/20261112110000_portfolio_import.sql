-- S6b+: portofoliul brokerului. Clienții intră fie prin import CSV (exportul din sistemul brokerului),
-- fie din dosar („Adaugă în portofoliu” pentru un șofer care nu era client). Totul cu sesiunea brokerului, prin RLS.

-- Clienți, vehicule, polițe: brokerul inserează doar în agenția lui; vehiculele și polițele doar la clienți pe care îi vede.
create policy clients_insert on public.clients for insert to authenticated
  with check (agency_id = (select private.current_agency_id()));
create policy vehicles_insert on public.vehicles for insert to authenticated
  with check (exists (select 1 from public.clients c where c.id = client_id));
create policy policies_insert on public.policies for insert to authenticated
  with check (
    exists (select 1 from public.clients c where c.id = client_id)
    and (vehicle_id is null or exists (select 1 from public.vehicles v where v.id = vehicle_id and v.client_id = policies.client_id))
  );
grant insert on public.clients, public.vehicles, public.policies to authenticated;

-- Legarea manuală a unei părți din dosar de un client: doar coloana `client_id`, doar pe dosarele agenției,
-- doar spre clienți ai agenției.
create policy claim_parties_update_client on public.claim_parties for update to authenticated
  using (exists (select 1 from public.claims c where c.id = claim_id))
  with check (
    exists (select 1 from public.claims c where c.id = claim_id)
    and (client_id is null or exists (select 1 from public.clients cl where cl.id = client_id))
  );
-- Supabase dă implicit `authenticated` toate drepturile pe tabele; aici rămâne doar coloana `client_id`.
revoke update on public.claim_parties from authenticated;
grant update (client_id) on public.claim_parties to authenticated;

-- Potrivirea după poliță / număr: e `security invoker`, deci pentru broker vede doar clienții agenției lui (RLS).
-- O folosește „Adaugă în portofoliu”, ca să lege de un client existent în loc să creeze un duplicat.
grant execute on function public.match_party_client(uuid, text, text) to authenticated;

-- Evenimentul de legare scris de broker (pe lângă cel automat, scris de server la finalizare).
create policy events_insert_claim_link on public.events for insert to authenticated
  with check (
    entity_type = 'claim'
    and type = 'client_linked'
    and payload ->> 'method' in ('broker_added', 'broker_matched')
    and payload ->> 'broker_id' = (select private.current_broker_id())::text
    and exists (select 1 from public.claims c where c.id = entity_id)
  );
