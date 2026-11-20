begin;

create table if not exists journal_private.messages (
  trip_id text not null references journal_private.trips on delete cascade,
  id text not null,
  member_id text not null,
  body text not null check (char_length(body) between 1 and 1000),
  sent_at timestamptz not null default now(),
  message_order bigint generated always as identity,
  primary key (trip_id, id)
);
create index if not exists journal_messages_recent on journal_private.messages (trip_id, message_order desc);
alter table journal_private.messages enable row level security;

create or replace function journal_private.pack_trip(p_id text, p_user uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'trip', t.data || jsonb_build_object(
      'members', (
        select jsonb_agg(jsonb_build_object('id', m.member_id, 'name', m.name, 'color', m.color)
                        order by m.is_owner desc, m.joined_at, m.member_id)
        from journal_private.members m where m.trip_id = t.id
      ),
      'messages', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', recent.id, 'sender', recent.member_id, 'text', recent.body,
          'time', to_char(recent.sent_at at time zone 'Asia/Taipei', 'YYYY/MM/DD HH24:MI')
        ) order by recent.message_order), '[]'::jsonb)
        from (
          select m.id, m.member_id, m.body, m.sent_at, m.message_order
          from journal_private.messages m where m.trip_id = t.id
          order by m.message_order desc limit 100
        ) recent
      )
    ),
    'version', t.version, 'memberId', self.member_id, 'owner', self.is_owner
  )
  from journal_private.trips t join journal_private.members self on self.trip_id = t.id
  where t.id = p_id and self.user_id = p_user;
$$;

create or replace function public.journal_send_message(p_id text, p_message_id text, p_text text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  sender text;
  body_text text := regexp_replace(p_text, '^[[:space:]]+|[[:space:]]+$', '', 'g');
begin
  select m.member_id into sender from journal_private.members m where m.trip_id = p_id and m.user_id = caller;
  if not found then raise exception 'membership_required'; end if;
  if coalesce(p_message_id, '') !~ '^[a-zA-Z0-9_-]{8,80}$'
    or coalesce(char_length(body_text), 0) not between 1 and 1000 then raise exception 'invalid_message';
  end if;

  -- Keep the version and message in the same transaction as other changes to the trip.
  perform 1 from journal_private.trips t where t.id = p_id for update;
  insert into journal_private.messages (trip_id, id, member_id, body)
    values (p_id, p_message_id, sender, body_text)
    on conflict (trip_id, id) do nothing;
  if found then
    update journal_private.trips set version = version + 1 where id = p_id;
  elsif not exists (
    select 1 from journal_private.messages m where m.trip_id = p_id and m.id = p_message_id
      and m.member_id = sender and m.body = body_text
  ) then raise exception 'invalid_message';
  end if;
  return journal_private.pack_trip(p_id, caller);
end;
$$;

revoke execute on function public.journal_send_message(text, text, text) from public, anon, authenticated;
grant execute on function public.journal_send_message(text, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
