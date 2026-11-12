-- BrokerPilot: schema inițială (docs/spec/11-date.md, secțiunea 8).
-- Reguli: RLS pe toate tabelele din `public`; scrierile aplicației/n8n merg cu service_role (ocolește RLS);
-- brokerii autentificați văd doar datele agenției lor; anon nu are acces la nimic.
-- Șoferul B accesează dosarul doar prin API route (service role) cu `join_token`, nu direct.

-- ---------------------------------------------------------------------------
-- Extensii
-- ---------------------------------------------------------------------------
create schema if not exists extensions;
create extension if not exists vector with schema extensions;

-- Schema „private”: funcții ajutătoare pentru RLS, neexpuse prin PostgREST.
create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Agenții și brokeri
-- ---------------------------------------------------------------------------
create table public.agencies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

-- Prototipul are o singură agenție; restul tabelelor o folosesc ca valoare implicită.
insert into public.agencies (id, name)
values ('00000000-0000-4000-8000-000000000001', 'Agenția demo (fictivă)')
on conflict (id) do nothing;

create table public.brokers (
  id               uuid primary key default gen_random_uuid(),
  agency_id        uuid not null default '00000000-0000-4000-8000-000000000001' references public.agencies (id),
  auth_user_id     uuid unique references auth.users (id) on delete set null,
  name             text not null,
  phone            text,
  telegram_chat_id bigint unique,
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);
create index brokers_agency_id_idx on public.brokers (agency_id);

-- Funcții ajutătoare pentru RLS (security definer: citesc `brokers` fără să declanșeze recursiv RLS)
create function private.current_broker_id() returns uuid
language sql stable security definer set search_path = ''
as $$
  select b.id from public.brokers b where b.auth_user_id = (select auth.uid()) and b.active limit 1
$$;

create function private.current_agency_id() returns uuid
language sql stable security definer set search_path = ''
as $$
  select b.agency_id from public.brokers b where b.auth_user_id = (select auth.uid()) and b.active limit 1
$$;

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
revoke all on function private.current_broker_id(), private.current_agency_id() from public, anon;
grant execute on function private.current_broker_id(), private.current_agency_id() to authenticated;

-- ---------------------------------------------------------------------------
-- Clienți, vehicule, polițe
-- ---------------------------------------------------------------------------
create table public.clients (
  id               uuid primary key default gen_random_uuid(),
  agency_id        uuid not null default '00000000-0000-4000-8000-000000000001' references public.agencies (id),
  full_name        text not null,
  phone            text,
  email            text,
  telegram_chat_id bigint,
  consent_gdpr_at  timestamptz,
  created_at       timestamptz not null default now()
);
create index clients_agency_id_idx on public.clients (agency_id);
create index clients_phone_idx on public.clients (phone) where phone is not null;
create index clients_email_idx on public.clients (lower(email)) where email is not null;
create index clients_telegram_chat_id_idx on public.clients (telegram_chat_id) where telegram_chat_id is not null;

create table public.vehicles (
  id        uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  plate     text not null,
  vin       text,
  make      text,
  model     text,
  year      int check (year between 1950 and 2100)
);
create index vehicles_client_id_idx on public.vehicles (client_id);
create index vehicles_plate_idx on public.vehicles (upper(replace(plate, ' ', '')));

create table public.policies (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients (id) on delete cascade,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  type       text not null check (type in ('RCA', 'CASCO', 'PAD', 'LOCUINTA', 'VIATA', 'ALTA')),
  insurer    text not null,
  policy_no  text not null,
  valid_from date not null,
  valid_to   date not null,
  premium    numeric(10, 2),
  broker_id  uuid references public.brokers (id) on delete set null,
  check (valid_to >= valid_from),
  unique (insurer, policy_no)
);
create index policies_client_id_idx on public.policies (client_id);
create index policies_vehicle_id_idx on public.policies (vehicle_id);
create index policies_broker_id_idx on public.policies (broker_id);
create index policies_valid_to_idx on public.policies (valid_to);

-- ---------------------------------------------------------------------------
-- Dosare (amiabila digitală)
-- ---------------------------------------------------------------------------
create sequence public.claims_ref_seq;

create table public.claims (
  id               uuid primary key default gen_random_uuid(),
  public_ref       text not null unique
                   default ('BP-' || to_char(now(), 'YYMM') || '-' || lpad(nextval('public.claims_ref_seq')::text, 5, '0')),
  agency_id        uuid not null default '00000000-0000-4000-8000-000000000001' references public.agencies (id),
  status           text not null default 'draft'
                   check (status in ('draft', 'awaiting_b', 'signed', 'submitted', 'in_progress', 'closed')),
  channel          text not null check (channel in ('web', 'telegram', 'voice')),
  accident_at      timestamptz,
  location_text    text,
  lat              double precision check (lat between -90 and 90),
  lng              double precision check (lng between -180 and 180),
  eligibility      jsonb,
  circumstances_a  jsonb,
  circumstances_b  jsonb,
  ai_summary       text,
  missing_items    jsonb,
  broker_id        uuid references public.brokers (id) on delete set null,
  pdf_path         text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index claims_agency_status_idx on public.claims (agency_id, status);
create index claims_broker_id_idx on public.claims (broker_id);
create index claims_created_at_idx on public.claims (created_at desc);
create trigger claims_touch_updated_at before update on public.claims
  for each row execute function private.touch_updated_at();

create table public.claim_parties (
  id                    uuid primary key default gen_random_uuid(),
  claim_id              uuid not null references public.claims (id) on delete cascade,
  role                  text not null check (role in ('A', 'B')),
  client_id             uuid references public.clients (id) on delete set null,
  driver                jsonb,
  vehicle               jsonb,
  insurance             jsonb,
  extraction_confidence jsonb,
  signature_path        text,
  join_token            text unique,
  token_expires_at      timestamptz,
  unique (claim_id, role)
);
create index claim_parties_client_id_idx on public.claim_parties (client_id);

create table public.claim_files (
  id           uuid primary key default gen_random_uuid(),
  claim_id     uuid not null references public.claims (id) on delete cascade,
  party_role   text check (party_role in ('A', 'B')),
  kind         text not null check (kind in ('id_doc', 'license', 'policy', 'damage', 'sketch')),
  storage_path text not null,
  extracted    jsonb,
  created_at   timestamptz not null default now()
);
create index claim_files_claim_id_idx on public.claim_files (claim_id);

-- ---------------------------------------------------------------------------
-- Conversații și inbox
-- ---------------------------------------------------------------------------
create table public.conversations (
  id                 uuid primary key default gen_random_uuid(),
  agency_id          uuid not null default '00000000-0000-4000-8000-000000000001' references public.agencies (id),
  channel            text not null check (channel in ('voice', 'telegram', 'email', 'web')),
  external_id        text,
  client_id          uuid references public.clients (id) on delete set null,
  claim_id           uuid references public.claims (id) on delete set null,
  handoff_status     text not null default 'ai' check (handoff_status in ('ai', 'requested', 'human')),
  assigned_broker_id uuid references public.brokers (id) on delete set null,
  summary            text,
  transcript         jsonb,
  created_at         timestamptz not null default now(),
  unique (channel, external_id)
);
create index conversations_agency_handoff_idx on public.conversations (agency_id, handoff_status);
create index conversations_client_id_idx on public.conversations (client_id);
create index conversations_claim_id_idx on public.conversations (claim_id);
create index conversations_assigned_broker_idx on public.conversations (assigned_broker_id);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant', 'broker', 'system')),
  content         text not null,
  created_at      timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

-- Valorile pentru category/priority/status se fixează în S13 (Inbox).
create table public.inbox_items (
  id                uuid primary key default gen_random_uuid(),
  agency_id         uuid not null default '00000000-0000-4000-8000-000000000001' references public.agencies (id),
  source            text not null check (source in ('email', 'telegram', 'voice', 'web')),
  external_id       text,
  from_ref          text,
  subject_redacted  text,
  category          text,
  priority          text,
  summary           text,
  suggested_action  text,
  status            text not null default 'new',
  linked_claim_id   uuid references public.claims (id) on delete set null,
  received_at       timestamptz not null default now(),
  unique (source, external_id)
);
create index inbox_items_agency_status_idx on public.inbox_items (agency_id, status, received_at desc);
create index inbox_items_linked_claim_idx on public.inbox_items (linked_claim_id);

-- ---------------------------------------------------------------------------
-- Baza de cunoștințe (RAG)
-- Embeddings: Gemini `gemini-embedding-001` cu outputDimensionality=768.
-- Fallback-ul `gte-small` are 384 de dimensiuni și NU e compatibil cu aceste coloane.
-- ---------------------------------------------------------------------------
create table public.kb_documents (
  id            uuid primary key default gen_random_uuid(),
  source_url    text,
  drive_file_id text,
  title         text not null,
  insurer       text,
  doc_type      text,
  collection    text not null default 'public' check (collection in ('public', 'internal')),
  file_hash     text unique,
  license_note  text,
  ingested_at   timestamptz
);
create index kb_documents_drive_file_id_idx on public.kb_documents (drive_file_id) where drive_file_id is not null;

create table public.kb_chunks (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.kb_documents (id) on delete cascade,
  content     text not null,
  page        int,
  heading     text,
  embedding   extensions.vector(768),
  fts         tsvector generated always as (to_tsvector('romanian', coalesce(heading, '') || ' ' || content)) stored
);
create index kb_chunks_document_id_idx on public.kb_chunks (document_id);
create index kb_chunks_fts_idx on public.kb_chunks using gin (fts);
create index kb_chunks_embedding_idx on public.kb_chunks using hnsw (embedding extensions.vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- Identitate (niveluri L0/L1/L2) — fără valori în clar: doar hash + mască
-- ---------------------------------------------------------------------------
create table public.client_identities (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients (id) on delete cascade,
  channel      text not null check (channel in ('phone', 'email', 'telegram')),
  value_hash   text not null,
  value_masked text not null,
  method       text not null,
  verified_at  timestamptz,
  expires_at   timestamptz,
  unique (channel, value_hash)
);
create index client_identities_client_id_idx on public.client_identities (client_id);

create table public.identity_verifications (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid references public.clients (id) on delete cascade,
  channel            text not null check (channel in ('phone', 'email', 'telegram')),
  destination_masked text not null,
  method             text not null check (method in ('email_otp', 'sms_otp', 'tg_contact', 'voice_otp', 'kba')),
  code_hash          text,
  attempts           int not null default 0,
  status             text not null default 'pending' check (status in ('pending', 'verified', 'failed', 'expired')),
  expires_at         timestamptz not null,
  created_at         timestamptz not null default now()
);
create index identity_verifications_client_id_idx on public.identity_verifications (client_id);
create index identity_verifications_pending_idx on public.identity_verifications (status, expires_at);

-- ---------------------------------------------------------------------------
-- Dosar unic omnicanal: interacțiuni și fapte extrase
-- ---------------------------------------------------------------------------
create table public.case_interactions (
  id               uuid primary key default gen_random_uuid(),
  claim_id         uuid references public.claims (id) on delete set null,
  inbox_item_id    uuid references public.inbox_items (id) on delete set null,
  channel          text not null check (channel in ('voice', 'telegram', 'email', 'web')),
  direction        text not null check (direction in ('in', 'out')),
  external_ref     text,
  identity_level   text not null default 'L0' check (identity_level in ('L0', 'L1', 'L2')),
  raw_storage_path text,
  transcript       text,
  summary          text,
  match_method     text check (match_method in ('ref', 'thread', 'verified_client', 'entities', 'broker')),
  match_score      numeric(4, 3) check (match_score between 0 and 1),
  created_at       timestamptz not null default now()
);
create index case_interactions_claim_idx on public.case_interactions (claim_id, created_at desc);
create index case_interactions_inbox_item_idx on public.case_interactions (inbox_item_id);

create table public.case_facts (
  id                    uuid primary key default gen_random_uuid(),
  claim_id              uuid not null references public.claims (id) on delete cascade,
  field                 text not null,
  value                 jsonb,
  source_interaction_id uuid references public.case_interactions (id) on delete set null,
  confidence            numeric(4, 3) check (confidence between 0 and 1),
  status                text not null default 'active' check (status in ('active', 'conflict', 'superseded')),
  created_at            timestamptz not null default now()
);
create index case_facts_claim_field_idx on public.case_facts (claim_id, field);
create index case_facts_source_interaction_idx on public.case_facts (source_interaction_id);

-- ---------------------------------------------------------------------------
-- Verificator de documente
-- ---------------------------------------------------------------------------
create table public.doc_checks (
  id                     uuid primary key default gen_random_uuid(),
  requested_by_broker_id uuid references public.brokers (id) on delete set null,
  source                 text not null check (source in ('dashboard', 'telegram', 'auto')),
  doc_type               text,
  storage_path           text,
  ocr_engine             text,
  issues                 jsonb not null default '[]'::jsonb,
  deterministic_count    int not null default 0,
  ai_count               int not null default 0,
  status                 text not null default 'pending' check (status in ('pending', 'reviewed', 'corrected')),
  reviewed_at            timestamptz,
  created_at             timestamptz not null default now()
);
create index doc_checks_broker_idx on public.doc_checks (requested_by_broker_id);
create index doc_checks_created_at_idx on public.doc_checks (created_at desc);

-- ---------------------------------------------------------------------------
-- Observabilitate: apeluri AI și evenimente
-- ---------------------------------------------------------------------------
create table public.ai_calls (
  id            uuid primary key default gen_random_uuid(),
  at            timestamptz not null default now(),
  workflow      text,
  task          text,
  provider      text,
  model         text,
  input_tokens  int,
  output_tokens int,
  cost_usd      numeric(10, 6),
  latency_ms    int,
  success       boolean not null default true,
  error         text,
  redacted      boolean not null default false
);
create index ai_calls_at_idx on public.ai_calls (at desc);

create table public.events (
  id          uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id   uuid,
  type        text not null,
  payload     jsonb,
  at          timestamptz not null default now()
);
create index events_entity_idx on public.events (entity_type, entity_id, at desc);

-- ---------------------------------------------------------------------------
-- RLS: activat pe toate tabelele. Fără politici pentru `anon` => acces refuzat.
-- ---------------------------------------------------------------------------
alter table public.agencies               enable row level security;
alter table public.brokers                enable row level security;
alter table public.clients                enable row level security;
alter table public.vehicles               enable row level security;
alter table public.policies               enable row level security;
alter table public.claims                 enable row level security;
alter table public.claim_parties          enable row level security;
alter table public.claim_files            enable row level security;
alter table public.conversations          enable row level security;
alter table public.messages               enable row level security;
alter table public.inbox_items            enable row level security;
alter table public.kb_documents           enable row level security;
alter table public.kb_chunks              enable row level security;
alter table public.client_identities      enable row level security;
alter table public.identity_verifications enable row level security;
alter table public.case_interactions      enable row level security;
alter table public.case_facts             enable row level security;
alter table public.doc_checks             enable row level security;
alter table public.ai_calls               enable row level security;
alter table public.events                 enable row level security;

-- Tabele cu agency_id: brokerul activ vede/modifică doar agenția lui.
create policy agencies_select on public.agencies for select to authenticated
  using (id = (select private.current_agency_id()));

create policy brokers_select on public.brokers for select to authenticated
  using (agency_id = (select private.current_agency_id()));

create policy clients_select on public.clients for select to authenticated
  using (agency_id = (select private.current_agency_id()));
create policy clients_update on public.clients for update to authenticated
  using (agency_id = (select private.current_agency_id()))
  with check (agency_id = (select private.current_agency_id()));

create policy claims_select on public.claims for select to authenticated
  using (agency_id = (select private.current_agency_id()));
create policy claims_update on public.claims for update to authenticated
  using (agency_id = (select private.current_agency_id()))
  with check (agency_id = (select private.current_agency_id()));

create policy conversations_select on public.conversations for select to authenticated
  using (agency_id = (select private.current_agency_id()));
create policy conversations_update on public.conversations for update to authenticated
  using (agency_id = (select private.current_agency_id()))
  with check (agency_id = (select private.current_agency_id()));

create policy inbox_items_select on public.inbox_items for select to authenticated
  using (agency_id = (select private.current_agency_id()));
create policy inbox_items_update on public.inbox_items for update to authenticated
  using (agency_id = (select private.current_agency_id()))
  with check (agency_id = (select private.current_agency_id()));

-- Tabele copil: moștenesc vizibilitatea de la părinte (subinterogarea trece prin RLS-ul părintelui).
create policy vehicles_select on public.vehicles for select to authenticated
  using (exists (select 1 from public.clients c where c.id = client_id));
create policy policies_select on public.policies for select to authenticated
  using (exists (select 1 from public.clients c where c.id = client_id));
create policy claim_parties_select on public.claim_parties for select to authenticated
  using (exists (select 1 from public.claims c where c.id = claim_id));
create policy claim_files_select on public.claim_files for select to authenticated
  using (exists (select 1 from public.claims c where c.id = claim_id));
create policy messages_select on public.messages for select to authenticated
  using (exists (select 1 from public.conversations c where c.id = conversation_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (role = 'broker' and exists (select 1 from public.conversations c where c.id = conversation_id));
create policy case_interactions_select on public.case_interactions for select to authenticated
  using (
    exists (select 1 from public.claims c where c.id = claim_id)
    or exists (select 1 from public.inbox_items i where i.id = inbox_item_id)
  );
create policy case_facts_select on public.case_facts for select to authenticated
  using (exists (select 1 from public.claims c where c.id = claim_id));
create policy case_facts_update on public.case_facts for update to authenticated
  using (exists (select 1 from public.claims c where c.id = claim_id))
  with check (exists (select 1 from public.claims c where c.id = claim_id));

-- Identitate: brokerul vede doar valorile mascate ale clienților lui; verificările (coduri) rămân doar pe service_role.
create policy client_identities_select on public.client_identities for select to authenticated
  using (exists (select 1 from public.clients c where c.id = client_id));
-- identity_verifications: intenționat fără nicio politică.

-- Verificator de documente: rândurile „auto” (fără broker) sunt vizibile agenției; restul după agenția brokerului.
create policy doc_checks_select on public.doc_checks for select to authenticated
  using (
    (select private.current_agency_id()) is not null
    and (
      requested_by_broker_id is null
      or exists (select 1 from public.brokers b where b.id = requested_by_broker_id)
    )
  );
create policy doc_checks_insert on public.doc_checks for insert to authenticated
  with check (requested_by_broker_id = (select private.current_broker_id()));
create policy doc_checks_update on public.doc_checks for update to authenticated
  using (
    requested_by_broker_id is null
    or exists (select 1 from public.brokers b where b.id = requested_by_broker_id)
  )
  with check ((select private.current_agency_id()) is not null);

-- KB: orice broker activ citește (inclusiv `internal`); scrierea (ingestia) doar service_role.
create policy kb_documents_select on public.kb_documents for select to authenticated
  using ((select private.current_agency_id()) is not null);
create policy kb_chunks_select on public.kb_chunks for select to authenticated
  using ((select private.current_agency_id()) is not null);

-- Costuri AI și evenimente: citire pentru brokeri (pagina Ops); scriere doar service_role.
create policy ai_calls_select on public.ai_calls for select to authenticated
  using ((select private.current_agency_id()) is not null);
create policy events_select on public.events for select to authenticated
  using ((select private.current_agency_id()) is not null);

-- ---------------------------------------------------------------------------
-- Grants: PostgREST expune doar ce e permis aici; RLS filtrează rândurile.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
grant select on all tables in schema public to authenticated;
revoke select on public.identity_verifications from authenticated;
grant update on public.clients, public.claims, public.conversations, public.inbox_items,
                public.case_facts, public.doc_checks to authenticated;
grant insert on public.messages, public.doc_checks to authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: bucket-uri private. Brokerii citesc prin URL-uri semnate; scrierea merge cu service_role.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('claim-files', 'claim-files', false, 10485760,
   array['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/json']),
  ('kb-docs', 'kb-docs', false, 26214400,
   array['application/pdf', 'text/plain', 'text/html', 'text/markdown'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy brokers_read_claim_files on storage.objects for select to authenticated
  using (bucket_id = 'claim-files' and (select private.current_agency_id()) is not null);
create policy brokers_read_kb_docs on storage.objects for select to authenticated
  using (bucket_id = 'kb-docs' and (select private.current_agency_id()) is not null);

-- ---------------------------------------------------------------------------
-- Realtime pentru dashboard (RLS se aplică și aici)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.claims, public.conversations, public.messages,
      public.case_interactions, public.case_facts, public.inbox_items;
  end if;
end
$$;
