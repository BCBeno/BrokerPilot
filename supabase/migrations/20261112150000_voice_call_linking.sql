-- S7 (Case Resolver, varianta pe voce + web): un apel vocal se leagă de dosarul despre care s-a vorbit.
-- Semnalul sigur: apelul a cerut starea unui dosar (`claim_status`), cu codul BP-AALL-NNNNN validat de funcție.
-- Restul îl alege brokerul din dosar. Apelantul rămâne L0 (neverificat): brokerul vede apelul marcat „sursă neverificată”.

-- „Nu ține de niciun dosar”: apelul nu mai e propus brokerului ca de legat.
alter table public.conversations add column claim_ignored_at timestamptz;

-- O interacțiune vocală apare o singură dată (raportul Vapi poate veni de mai multe ori, unealta poate fi apelată de mai multe ori).
create unique index case_interactions_channel_ref_key
  on public.case_interactions (channel, external_ref) where external_ref is not null;

-- ---------------------------------------------------------------------------
-- Legarea propriu-zisă (doar serverul): creează sau completează rândul din `conversations` (WF03 îl completează la
-- sfârșitul apelului, fără să-i șteargă `claim_id`), scrie interacțiunea și un eveniment în istoricul dosarului.
-- Un apel deja legat de alt dosar rămâne unde e.
-- ---------------------------------------------------------------------------
create function public.link_voice_call(p_call_id text, p_claim_id uuid, p_method text, p_score numeric)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_agency uuid;
  v_linked uuid;
  v_n int;
begin
  if coalesce(p_call_id, '') = '' then return false; end if;
  select c.agency_id into v_agency from public.claims c where c.id = p_claim_id;
  if v_agency is null then return false; end if;

  insert into public.conversations as cv (agency_id, channel, external_id, claim_id)
  values (v_agency, 'voice', p_call_id, p_claim_id)
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

-- ---------------------------------------------------------------------------
-- `claim_status` din apel: întoarce starea dosarului (ca până acum) și, dacă dosarul există, leagă apelul de el.
-- Un singur apel către baza de date din unealta Vapi, deci fără latență în plus.
-- ---------------------------------------------------------------------------
create function public.voice_claim_status(p_call_id text, p_ref text)
returns table (public_ref text, status text, updated_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select c.id, c.public_ref, c.status, c.updated_at
      from public.claims c
     where c.public_ref = upper(regexp_replace(coalesce(p_ref, ''), '\s', '', 'g'))
     limit 1
  loop
    perform public.link_voice_call(p_call_id, r.id, 'ref', 0.95);
    public_ref := r.public_ref;
    status := r.status;
    updated_at := r.updated_at;
    return next;
  end loop;
end
$$;

revoke all on function public.link_voice_call(text, uuid, text, numeric) from public, anon, authenticated;
revoke all on function public.voice_claim_status(text, text) from public, anon, authenticated;
grant execute on function public.link_voice_call(text, uuid, text, numeric) to service_role;
grant execute on function public.voice_claim_status(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- „Atașează” din dosar (brokerul). `security definer` ca să poată scrie interacțiunea și evenimentul fără politici de insert
-- în plus; verifică singură că apelul și dosarul sunt ale agenției brokerului și că apelul nu era deja legat.
-- ---------------------------------------------------------------------------
create function public.attach_voice_call(p_conversation_id uuid, p_claim_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_broker uuid := (select private.current_broker_id());
  v_agency uuid := (select private.current_agency_id());
  v_call text;
  v_n int;
begin
  if v_broker is null then return false; end if;
  if not exists (select 1 from public.claims c where c.id = p_claim_id and c.agency_id = v_agency) then return false; end if;

  update public.conversations cv
     set claim_id = p_claim_id, claim_ignored_at = null
   where cv.id = p_conversation_id and cv.channel = 'voice' and cv.agency_id = v_agency and cv.claim_id is null
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

revoke all on function public.attach_voice_call(uuid, uuid) from public, anon;
grant execute on function public.attach_voice_call(uuid, uuid) to authenticated;
