begin;

create schema journal_private;
revoke all on schema journal_private from public;

create table journal_private.trips (
  id text primary key,
  data jsonb not null,
  version integer not null default 1
);

create table journal_private.members (
  trip_id text not null references journal_private.trips on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  member_id text not null,
  name text not null,
  color text not null,
  is_owner boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (trip_id, user_id),
  unique (trip_id, member_id)
);

create table journal_private.invitations (
  token_hash bytea primary key,
  trip_id text not null references journal_private.trips on delete cascade,
  expires_at timestamptz not null,
  accepted_by uuid references auth.users on delete cascade
);
create index on journal_private.invitations (trip_id);
create index on journal_private.members (user_id);

alter table journal_private.trips enable row level security;
alter table journal_private.members enable row level security;
alter table journal_private.invitations enable row level security;

create function journal_private.pack_trip(p_id text, p_user uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'trip', t.data || jsonb_build_object('members', (
      select jsonb_agg(jsonb_build_object('id', m.member_id, 'name', m.name, 'color', m.color)
                      order by m.is_owner desc, m.joined_at, m.member_id)
      from journal_private.members m where m.trip_id = t.id
    )),
    'version', t.version, 'memberId', self.member_id, 'owner', self.is_owner
  )
  from journal_private.trips t join journal_private.members self on self.trip_id = t.id
  where t.id = p_id and self.user_id = p_user;
$$;

create function journal_private.valid_content(p_data jsonb, p_members text[]) returns boolean
language plpgsql stable set search_path = '' as $$
declare
  item jsonb;
  participants text[];
  day_count integer;
  amount numeric;
begin
  if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text) > 1000000
    or coalesce(length(btrim(p_data->>'title')), 0) not between 1 and 200
    or coalesce(length(btrim(p_data->>'destination')), 0) not between 1 and 200
    or jsonb_typeof(p_data->'title') is distinct from 'string'
    or jsonb_typeof(p_data->'destination') is distinct from 'string'
    or jsonb_typeof(p_data->'image') is distinct from 'string'
    or coalesce(p_data->>'start', '') !~ '^\d{4}-\d{2}-\d{2}$'
    or coalesce(p_data->>'end', '') !~ '^\d{4}-\d{2}-\d{2}$'
    or jsonb_typeof(p_data->'events') is distinct from 'array'
    or jsonb_typeof(p_data->'places') is distinct from 'array'
    or jsonb_typeof(p_data->'expenses') is distinct from 'array' then return false;
  end if;
  day_count := (p_data->>'end')::date - (p_data->>'start')::date + 1;
  if day_count not between 1 and 31 then return false; end if;

  for item in select value from jsonb_array_elements(p_data->'events') loop
    if jsonb_typeof(item->'id') is distinct from 'string'
      or jsonb_typeof(item->'title') is distinct from 'string'
      or jsonb_typeof(item->'category') is distinct from 'string'
      or jsonb_typeof(item->'note') is distinct from 'string'
      or jsonb_typeof(item->'done') is distinct from 'boolean'
      or coalesce(item->>'time', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or jsonb_typeof(item->'day') is distinct from 'number'
      or coalesce(item->>'day', '') !~ '^[0-9]{1,2}$' then return false;
    end if;
    if exists (select 1 from jsonb_each(item) j where j.key in ('image', 'mapQuery', 'mapUrl', 'googlePlaceId', 'placeId') and jsonb_typeof(j.value) <> 'string') then return false; end if;
    if (item->>'day')::integer >= day_count then return false; end if;
  end loop;

  for item in select value from jsonb_array_elements(p_data->'places') loop
    if jsonb_typeof(item->'id') is distinct from 'string'
      or jsonb_typeof(item->'name') is distinct from 'string'
      or jsonb_typeof(item->'area') is distinct from 'string'
      or jsonb_typeof(item->'category') is distinct from 'string'
      or jsonb_typeof(item->'price') is distinct from 'string'
      or jsonb_typeof(item->'image') is distinct from 'string'
      or jsonb_typeof(item->'description') is distinct from 'string'
      or jsonb_typeof(item->'saved') is distinct from 'boolean' then return false;
    end if;
    if exists (select 1 from jsonb_each(item) j where j.key in ('mapUrl', 'googlePlaceId', 'source') and jsonb_typeof(j.value) <> 'string') then return false; end if;
  end loop;

  for item in select value from jsonb_array_elements(p_data->'expenses') loop
    if jsonb_typeof(item->'id') is distinct from 'string'
      or jsonb_typeof(item->'title') is distinct from 'string'
      or not coalesce(item->>'payer' = any(p_members), false)
      or jsonb_typeof(item->'participants') is distinct from 'array'
      or jsonb_typeof(item->'amount') is distinct from 'number'
      or jsonb_typeof(item->'day') is distinct from 'number'
      or coalesce(item->>'day', '') !~ '^[0-9]{1,2}$' then return false;
    end if;
    amount := (item->>'amount')::numeric;
    select array_agg(value) into participants from jsonb_array_elements_text(item->'participants');
    if amount < 1 or amount > 99999999 or amount <> trunc(amount)
      or (item->>'day')::integer >= day_count
      or coalesce(cardinality(participants), 0) = 0 or not (participants <@ p_members)
      or cardinality(participants) <> (select count(distinct x) from unnest(participants) x) then return false;
    end if;
  end loop;
  if exists (
    select 1 from jsonb_each(p_data) fields
    cross join lateral jsonb_array_elements(case when fields.key in ('events', 'places', 'expenses') then fields.value else '[]'::jsonb end) items
    group by fields.key, items.value->>'id' having count(*) > 1
  ) then return false; end if;
  return true;
end;
$$;

create function public.journal_list_trips() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(journal_private.pack_trip(m.trip_id, m.user_id)), '[]'::jsonb)
  from journal_private.members m where m.user_id = auth.uid();
$$;

create function public.journal_get_trip(p_id text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select journal_private.pack_trip(p_id, auth.uid());
$$;

create function public.journal_create_trip(p_trip jsonb, p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  trip_id text := p_trip->>'id';
  data jsonb;
  existing jsonb;
begin
  if caller is null or coalesce(trip_id, '') !~ '^[a-zA-Z0-9_-]{8,80}$'
    or coalesce(length(btrim(p_name)), 0) not between 1 and 40
    or p_trip->'demo' is distinct from 'false'::jsonb then raise exception 'invalid_trip';
  end if;
  existing := journal_private.pack_trip(trip_id, caller);
  if existing is not null then return existing; end if;

  data := jsonb_build_object('id', trip_id, 'title', p_trip->'title', 'destination', p_trip->'destination',
    'start', p_trip->'start', 'end', p_trip->'end', 'image', p_trip->'image', 'demo', false,
    'events', p_trip->'events', 'places', p_trip->'places', 'expenses', p_trip->'expenses', 'messages', '[]'::jsonb);
  if not journal_private.valid_content(data, array['me']) then raise exception 'invalid_trip'; end if;

  insert into journal_private.trips values (trip_id, data, 1);
  insert into journal_private.members (trip_id, user_id, member_id, name, color, is_owner)
    values (trip_id, caller, 'me', btrim(p_name), '#DCE5CD', true);
  return journal_private.pack_trip(trip_id, caller);
end;
$$;

create function public.journal_create_invite(p_id text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  perform 1 from journal_private.members where trip_id = p_id and user_id = auth.uid() and is_owner for update;
  if not found then raise exception 'owner_required'; end if;
  delete from journal_private.invitations where trip_id = p_id and (accepted_by is null or expires_at <= now());
  insert into journal_private.invitations (token_hash, trip_id, expires_at)
    values (sha256(convert_to(token, 'UTF8')), p_id, now() + interval '24 hours');
  return token;
end;
$$;

create function public.journal_revoke_invite(p_id text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from journal_private.members where trip_id = p_id and user_id = auth.uid() and is_owner for update;
  if not found then raise exception 'owner_required'; end if;
  delete from journal_private.invitations where trip_id = p_id and accepted_by is null;
end;
$$;

create function public.journal_preview_invite(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('title', t.data->'title', 'destination', t.data->'destination')
  from journal_private.invitations i join journal_private.trips t on t.id = i.trip_id
  where auth.uid() is not null and p_token ~ '^[0-9a-f]{64}$'
    and i.token_hash = sha256(convert_to(p_token, 'UTF8')) and i.expires_at > now()
    and (i.accepted_by is null or i.accepted_by = auth.uid());
$$;

create function public.journal_accept_invite(p_token text, p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  invitation journal_private.invitations%rowtype;
  member_count integer;
begin
  if caller is null or coalesce(p_token, '') !~ '^[0-9a-f]{64}$'
    or coalesce(length(btrim(p_name)), 0) not between 1 and 40 then raise exception 'invalid_invite';
  end if;
  select * into invitation from journal_private.invitations i
    where i.token_hash = sha256(convert_to(p_token, 'UTF8')) and i.expires_at > now() for update;
  if not found or (invitation.accepted_by is not null and invitation.accepted_by <> caller) then raise exception 'invalid_invite'; end if;
  perform 1 from journal_private.trips t where t.id = invitation.trip_id for update;
  if exists (select 1 from journal_private.members m where m.trip_id = invitation.trip_id and m.user_id = caller)
    then return journal_private.pack_trip(invitation.trip_id, caller);
  end if;
  select count(*) into member_count from journal_private.members where trip_id = invitation.trip_id;
  if member_count >= 31 then raise exception 'trip_full'; end if;

  insert into journal_private.members (trip_id, user_id, member_id, name, color)
    values (invitation.trip_id, caller, caller::text, btrim(p_name), '#D6DFEA');
  update journal_private.invitations set accepted_by = caller where token_hash = invitation.token_hash;
  update journal_private.trips set version = version + 1 where id = invitation.trip_id;
  return journal_private.pack_trip(invitation.trip_id, caller);
end;
$$;

create function public.journal_save_trip(p_id text, p_version integer, p_contents jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  entry journal_private.trips%rowtype;
  next_data jsonb;
  member_ids text[];
  previous_expenses jsonb;
begin
  if caller is null or not exists (select 1 from journal_private.members m where m.trip_id = p_id and m.user_id = caller)
    then raise exception 'membership_required';
  end if;
  select * into entry from journal_private.trips t where t.id = p_id for update;
  if entry.version is distinct from p_version then return null; end if;
  next_data := entry.data || jsonb_build_object('events', p_contents->'events', 'places', p_contents->'places', 'expenses', p_contents->'expenses');
  select array_agg(member_id) into member_ids from journal_private.members where trip_id = p_id;
  if not journal_private.valid_content(next_data, member_ids) then raise exception 'invalid_trip'; end if;

  select coalesce(jsonb_agg(value order by ordinal), '[]'::jsonb) into previous_expenses
    from jsonb_array_elements(next_data->'expenses') with ordinality e(value, ordinal)
    where ordinal <= jsonb_array_length(entry.data->'expenses');
  if previous_expenses <> entry.data->'expenses' then raise exception 'expense_history_required'; end if;
  update journal_private.trips set version = version + 1, data = next_data where id = p_id;
  return journal_private.pack_trip(p_id, caller);
end;
$$;

revoke execute on function public.journal_list_trips(), public.journal_get_trip(text), public.journal_create_trip(jsonb,text),
  public.journal_create_invite(text), public.journal_revoke_invite(text), public.journal_preview_invite(text),
  public.journal_accept_invite(text,text), public.journal_save_trip(text,integer,jsonb) from public, anon, authenticated;
grant execute on function public.journal_list_trips(), public.journal_get_trip(text), public.journal_create_trip(jsonb,text),
  public.journal_create_invite(text), public.journal_revoke_invite(text), public.journal_preview_invite(text),
  public.journal_accept_invite(text,text), public.journal_save_trip(text,integer,jsonb) to authenticated;

commit;
