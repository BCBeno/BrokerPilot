-- „Preiau” din Telegram (WF05): brokerul preia un dosar dintr-un singur pas atomic.
--   - dosarul trece pe `in_progress` și primește brokerul (după `brokers.telegram_chat_id`);
--   - conversațiile legate de dosar trec din `ai`/`requested` în `human` (AI-ul nu mai răspunde acolo);
--   - se scrie evenimentul `broker_took` (audit).
-- Apelată doar de n8n, cu service role. Dacă chatul nu e legat de niciun broker, dosarul trece oricum pe `in_progress`,
-- dar rămâne fără broker asignat (răspunsul spune `assigned: false`).

create or replace function public.broker_take_claim(p_claim_id uuid, p_chat_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_broker uuid;
  v_claim public.claims%rowtype;
  v_handoffs int := 0;
begin
  if p_chat_id ~ '^-?[0-9]{1,20}$' then
    select b.id into v_broker
    from public.brokers b
    where b.telegram_chat_id = p_chat_id::bigint and b.active
    limit 1;
  end if;

  select * into v_claim from public.claims where id = p_claim_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_claim.status = 'closed' then
    return jsonb_build_object('ok', false, 'error', 'closed', 'ref', v_claim.public_ref);
  end if;
  if v_claim.status in ('draft', 'awaiting_b') then
    return jsonb_build_object('ok', false, 'error', 'not_ready', 'ref', v_claim.public_ref);
  end if;
  if v_claim.broker_id is not null and v_broker is not null and v_claim.broker_id <> v_broker then
    return jsonb_build_object('ok', false, 'error', 'taken', 'ref', v_claim.public_ref);
  end if;
  if v_claim.status = 'in_progress' and (v_broker is null or v_claim.broker_id is not distinct from v_broker) then
    return jsonb_build_object('ok', true, 'already', true, 'ref', v_claim.public_ref, 'assigned', v_claim.broker_id is not null);
  end if;

  update public.claims
     set status = 'in_progress', broker_id = coalesce(v_broker, broker_id)
   where id = p_claim_id;

  update public.conversations
     set handoff_status = 'human', assigned_broker_id = coalesce(v_broker, assigned_broker_id)
   where claim_id = p_claim_id and handoff_status in ('ai', 'requested');
  get diagnostics v_handoffs = row_count;

  insert into public.events (entity_type, entity_id, type, payload)
  values ('claim', p_claim_id, 'broker_took', jsonb_build_object('via', 'telegram', 'broker_id', v_broker, 'handoffs', v_handoffs));

  return jsonb_build_object('ok', true, 'already', false, 'ref', v_claim.public_ref,
                            'assigned', coalesce(v_broker, v_claim.broker_id) is not null, 'handoffs', v_handoffs);
end;
$$;

revoke all on function public.broker_take_claim(uuid, text) from public, anon, authenticated;
grant execute on function public.broker_take_claim(uuid, text) to service_role;
