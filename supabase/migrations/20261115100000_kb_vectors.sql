-- Baza de cunoștințe în formatul nodurilor LangChain din n8n („Supabase Vector Store”):
-- tabel `content` + `metadata` + `embedding` și funcția `match_documents(query_embedding, match_count, filter)`.
-- WF08 scrie aici cu „Supabase Vector Store” (insert) + „Embeddings Google Gemini”; WF04 caută cu același nod, ca unealtă a agentului.
-- Nodul de embeddings din n8n nu poate cere 768 de dimensiuni, deci `gemini-embedding-001` dă 3072: `vector` are index HNSW
-- doar până la 2.000 de dimensiuni, `halfvec` până la 4.000 (pgvector ≥ 0.7; pe proiect e 0.8.2).
-- `kb_chunks` + `kb_search` (768) rămân neatinse, ca rezervă pentru WF04 vechi.
--
-- metadata (scrisă de WF08): document_id, title, page, heading, collection, insurer, doc_type, source_url.

create table public.kb_vectors (
  id          bigserial primary key,
  content     text not null,
  metadata    jsonb not null default '{}'::jsonb,
  embedding   extensions.halfvec(3072),
  -- legătura cu documentul, din metadata: ștergerea documentului (înlocuirea unei versiuni) șterge și fragmentele
  document_id uuid generated always as ((metadata ->> 'document_id')::uuid) stored
              references public.kb_documents (id) on delete cascade
);
create index kb_vectors_embedding_idx on public.kb_vectors using hnsw (embedding extensions.halfvec_cosine_ops);
create index kb_vectors_metadata_idx on public.kb_vectors using gin (metadata jsonb_path_ops);
create index kb_vectors_document_id_idx on public.kb_vectors (document_id);

alter table public.kb_vectors enable row level security;
-- Ca la kb_chunks: orice broker activ citește; scrierea doar service_role (n8n).
create policy kb_vectors_select on public.kb_vectors for select to authenticated
  using ((select private.current_agency_id()) is not null);

-- Căutarea apelată de nodul LangChain: `filter` e pus de workflow (ex. {"collection":"public"} pentru clienți), nu de LLM.
-- Intră doar documentele terminate (`ingested_at`) și fragmentele peste prag; pragul se calibrează aici.
create or replace function public.match_documents(
  query_embedding extensions.halfvec(3072),
  match_count int default 4,
  filter jsonb default '{}'::jsonb
)
returns table (id bigint, content text, metadata jsonb, similarity double precision)
language sql stable
set search_path = public, extensions
as $$
  select v.id, v.content, v.metadata, 1 - (v.embedding <=> query_embedding) as similarity
  from public.kb_vectors v
  join public.kb_documents d on d.id = v.document_id and d.ingested_at is not null
  where v.metadata @> coalesce(filter, '{}'::jsonb)
    -- prag calibrat pe 15 nov (3072 dim.): întrebări din documente 0,70–0,82, întrebare fără legătură („rețetă de sarmale”) ~0,55
    and 1 - (v.embedding <=> query_embedding) >= 0.65
  order by v.embedding <=> query_embedding
  limit least(greatest(coalesce(match_count, 4), 1), 10);
$$;

revoke all on function public.match_documents(extensions.halfvec, int, jsonb) from public, anon, authenticated;
grant execute on function public.match_documents(extensions.halfvec, int, jsonb) to service_role;

-- Varianta pentru clienți (WF04 cu audience=public o alege prin `queryName`): doar documentele publice, oricare ar fi `filter`.
create or replace function public.match_documents_public(
  query_embedding extensions.halfvec(3072),
  match_count int default 4,
  filter jsonb default '{}'::jsonb
)
returns table (id bigint, content text, metadata jsonb, similarity double precision)
language sql stable
set search_path = public, extensions
as $$
  select m.* from public.match_documents(query_embedding, match_count, coalesce(filter, '{}'::jsonb) || '{"collection":"public"}'::jsonb) m;
$$;

revoke all on function public.match_documents_public(extensions.halfvec, int, jsonb) from public, anon, authenticated;
grant execute on function public.match_documents_public(extensions.halfvec, int, jsonb) to service_role;
