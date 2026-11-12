-- Căutare hibridă în baza de cunoștințe (RAG): vector (cosine) + full-text românesc, combinate prin Reciprocal Rank Fusion.
-- Apelată din WF04 (n8n) prin PostgREST, cu cheia service role: `POST /rest/v1/rpc/kb_search`.
--   p_embedding   vectorul întrebării ca text JSON, de ex. '[0.01,-0.2,...]' (768 de dimensiuni, Gemini)
--   p_query       întrebarea (deja redactată de WF04)
--   p_collections ['public'] pentru clienți, ['public','internal'] pentru brokeri
-- Un document intră în căutare abia după `ingested_at` (setat de WF08 la final, ca să nu apară pe jumătate indexat).
-- `similarity` = 1 - distanța cosine; WF04 aplică pragul (MIN_SIMILARITY) pe ea.

create or replace function public.kb_search(
  p_embedding text,
  p_query text,
  p_collections text[] default array['public'],
  p_limit int default 8
)
returns table (
  chunk_id uuid,
  document_id uuid,
  title text,
  insurer text,
  doc_type text,
  collection text,
  source_url text,
  page int,
  heading text,
  content text,
  similarity double precision,
  score double precision
)
language sql stable
set search_path = public, extensions
as $$
  with q as (
    select
      p_embedding::extensions.vector(768) as emb,
      -- cuvintele întrebării legate prin SAU: o întrebare naturală rar conține toți termenii unui fragment
      replace(plainto_tsquery('romanian', coalesce(p_query, ''))::text, ' & ', ' | ')::tsquery as tsq
  ),
  cand as (
    select
      c.id, c.document_id, c.content, c.page, c.heading, c.fts,
      1 - (c.embedding <=> q.emb) as sim
    from public.kb_chunks c
    join public.kb_documents d on d.id = c.document_id
    cross join q
    where d.ingested_at is not null
      and d.collection = any (p_collections)
      and c.embedding is not null
  ),
  vec as (
    select id, row_number() over (order by sim desc) as rnk
    from cand
    order by sim desc
    limit 30
  ),
  fts as (
    select cand.id, row_number() over (order by ts_rank_cd(cand.fts, q.tsq) desc) as rnk
    from cand
    cross join q
    where cand.fts @@ q.tsq
    order by ts_rank_cd(cand.fts, q.tsq) desc
    limit 30
  ),
  fused as (
    select
      coalesce(vec.id, fts.id) as id,
      coalesce(1.0 / (60 + vec.rnk), 0) + coalesce(1.0 / (60 + fts.rnk), 0) as score
    from vec
    full outer join fts on fts.id = vec.id
  )
  select
    cand.id, cand.document_id,
    d.title, d.insurer, d.doc_type, d.collection, d.source_url,
    cand.page, cand.heading, cand.content,
    cand.sim::double precision, fused.score::double precision
  from fused
  join cand on cand.id = fused.id
  join public.kb_documents d on d.id = cand.document_id
  order by fused.score desc, cand.sim desc
  limit least(greatest(coalesce(p_limit, 8), 1), 20);
$$;

-- Doar serverul (n8n cu service role) o poate apela; clienții anonimi sau autentificați nu.
revoke all on function public.kb_search(text, text, text[], int) from public, anon, authenticated;
grant execute on function public.kb_search(text, text, text[], int) to service_role;
