-- Brokerul completează un dosar după ce l-a primit: poze sau documente (PDF) venite mai târziu și note interne.
-- Datele semnate de șoferi și PDF-ul amiabilei nu se modifică.

-- Fișiere încărcate de broker: `uploaded_by` le deosebește de cele ale șoferilor (care rămân cu `null`),
-- `file_name` e numele original, afișat în fișă. `document` = PDF sau poză care nu e cu daunele unui șofer.
alter table public.claim_files
  add column uploaded_by uuid references public.brokers (id) on delete set null,
  add column file_name   text check (char_length(file_name) <= 200);

alter table public.claim_files drop constraint claim_files_kind_check;
alter table public.claim_files add constraint claim_files_kind_check
  check (kind in ('id_doc', 'license', 'policy', 'damage', 'sketch', 'document'));

-- Scrierea fișierelor merge prin server (service_role), după ce RLS a confirmat că dosarul e al agenției brokerului.
-- Notele sunt rânduri în `events` (apar și în istoric), scrise direct de broker, doar în numele lui.
create policy events_insert_claim_note on public.events for insert to authenticated
  with check (
    entity_type = 'claim'
    and type = 'broker_note'
    and payload ->> 'broker_id' = (select private.current_broker_id())::text
    and char_length(payload ->> 'text') between 1 and 2000
    and exists (select 1 from public.claims c where c.id = entity_id)
  );
