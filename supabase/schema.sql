-- MatchCut — à exécuter une fois dans l'éditeur SQL Supabase.
-- Le script est idempotent : il complète la table profiles si elle existe déjà.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade
);

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists bio text default '';
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists created_at timestamptz default now();
alter table public.profiles add column if not exists updated_at timestamptz default now();

create unique index if not exists profiles_username_unique
  on public.profiles (username)
  where username is not null and username <> '';

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.session_photos (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  image_url text not null,
  caption text,
  created_at timestamptz not null default now()
);

create table if not exists public.swipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  group_id uuid references public.groups (id) on delete cascade,
  tmdb_id integer not null,
  media_type text not null check (media_type in ('movie', 'tv')),
  title text not null,
  poster_path text,
  decision text not null check (decision in ('pass', 'validate')),
  created_at timestamptz not null default now()
);

create unique index if not exists swipes_user_title_idx
  on public.swipes (user_id, coalesce(group_id, '00000000-0000-0000-0000-000000000000'::uuid), tmdb_id, media_type);

create table if not exists public.watch_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  tmdb_id integer not null,
  media_type text not null check (media_type in ('movie', 'tv')),
  title text not null,
  poster_path text,
  year text,
  status text not null default 'to_watch' check (status in ('to_watch', 'watched')),
  rating integer check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, tmdb_id, media_type)
);

create table if not exists public.recommendations (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references public.profiles (id) on delete cascade,
  to_user_id uuid references public.profiles (id) on delete cascade,
  to_group_id uuid references public.groups (id) on delete cascade,
  tmdb_id integer not null,
  media_type text not null check (media_type in ('movie', 'tv')),
  title text not null,
  poster_path text,
  year text,
  note text,
  created_at timestamptz not null default now(),
  check (to_user_id is not null or to_group_id is not null)
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  tmdb_id integer not null,
  media_type text not null check (media_type in ('movie', 'tv')),
  title text not null,
  poster_path text,
  created_at timestamptz not null default now(),
  unique (group_id, tmdb_id, media_type)
);

create index if not exists messages_group_created_idx on public.messages (group_id, created_at);
create index if not exists photos_group_created_idx on public.session_photos (group_id, created_at);
create index if not exists swipes_group_title_idx on public.swipes (group_id, tmdb_id, media_type);

create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid()
  );
$$;

create or replace function public.username_available(name text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles where username = name
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  handle text;
begin
  handle := left(
    regexp_replace(
      lower(coalesce(new.raw_user_meta_data->>'username', split_part(coalesce(new.email, 'membre'), '@', 1))),
      '[^a-z0-9_]',
      '',
      'g'
    ),
    20
  );
  if handle is null or char_length(handle) < 3 then
    handle := 'membre_' || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;
  insert into public.profiles (id, username, full_name, bio)
  values (
    new.id,
    handle,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    ''
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.friendships to authenticated;
grant select, insert, update, delete on public.groups to authenticated;
grant select, insert, update, delete on public.group_members to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
grant select, insert, update, delete on public.session_photos to authenticated;
grant select, insert, update, delete on public.swipes to authenticated;
grant select, insert, update, delete on public.watch_items to authenticated;
grant select, insert, update, delete on public.recommendations to authenticated;
grant select, insert, update, delete on public.matches to authenticated;
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.username_available(text) to anon, authenticated;

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.messages enable row level security;
alter table public.session_photos enable row level security;
alter table public.swipes enable row level security;
alter table public.watch_items enable row level security;
alter table public.recommendations enable row level security;
alter table public.matches enable row level security;

drop policy if exists matchcut_profiles_select on public.profiles;
create policy matchcut_profiles_select on public.profiles
  for select to authenticated using (true);
drop policy if exists matchcut_profiles_insert on public.profiles;
create policy matchcut_profiles_insert on public.profiles
  for insert to authenticated with check (auth.uid() = id);
drop policy if exists matchcut_profiles_update on public.profiles;
create policy matchcut_profiles_update on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists matchcut_friendships_select on public.friendships;
create policy matchcut_friendships_select on public.friendships
  for select to authenticated using (auth.uid() = requester_id or auth.uid() = addressee_id);
drop policy if exists matchcut_friendships_insert on public.friendships;
create policy matchcut_friendships_insert on public.friendships
  for insert to authenticated with check (auth.uid() = requester_id);
drop policy if exists matchcut_friendships_update on public.friendships;
create policy matchcut_friendships_update on public.friendships
  for update to authenticated using (auth.uid() = addressee_id or auth.uid() = requester_id);
drop policy if exists matchcut_friendships_delete on public.friendships;
create policy matchcut_friendships_delete on public.friendships
  for delete to authenticated using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists matchcut_groups_select on public.groups;
create policy matchcut_groups_select on public.groups
  for select to authenticated using (created_by = auth.uid() or public.is_group_member(id));
drop policy if exists matchcut_groups_insert on public.groups;
create policy matchcut_groups_insert on public.groups
  for insert to authenticated with check (created_by = auth.uid());
drop policy if exists matchcut_groups_update on public.groups;
create policy matchcut_groups_update on public.groups
  for update to authenticated using (created_by = auth.uid());

drop policy if exists matchcut_members_select on public.group_members;
create policy matchcut_members_select on public.group_members
  for select to authenticated using (user_id = auth.uid() or public.is_group_member(group_id));
drop policy if exists matchcut_members_insert on public.group_members;
create policy matchcut_members_insert on public.group_members
  for insert to authenticated with check (
    user_id = auth.uid()
    or exists (select 1 from public.groups g where g.id = group_id and g.created_by = auth.uid())
  );
drop policy if exists matchcut_members_delete on public.group_members;
create policy matchcut_members_delete on public.group_members
  for delete to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from public.groups g where g.id = group_id and g.created_by = auth.uid())
  );

drop policy if exists matchcut_messages_select on public.messages;
create policy matchcut_messages_select on public.messages
  for select to authenticated using (public.is_group_member(group_id));
drop policy if exists matchcut_messages_insert on public.messages;
create policy matchcut_messages_insert on public.messages
  for insert to authenticated with check (user_id = auth.uid() and public.is_group_member(group_id));

drop policy if exists matchcut_photos_select on public.session_photos;
create policy matchcut_photos_select on public.session_photos
  for select to authenticated using (public.is_group_member(group_id));
drop policy if exists matchcut_photos_insert on public.session_photos;
create policy matchcut_photos_insert on public.session_photos
  for insert to authenticated with check (user_id = auth.uid() and public.is_group_member(group_id));

drop policy if exists matchcut_swipes_select on public.swipes;
create policy matchcut_swipes_select on public.swipes
  for select to authenticated using (
    user_id = auth.uid() or (group_id is not null and public.is_group_member(group_id))
  );
drop policy if exists matchcut_swipes_insert on public.swipes;
create policy matchcut_swipes_insert on public.swipes
  for insert to authenticated with check (
    user_id = auth.uid() and (group_id is null or public.is_group_member(group_id))
  );
drop policy if exists matchcut_swipes_update on public.swipes;
create policy matchcut_swipes_update on public.swipes
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists matchcut_watch_all on public.watch_items;
create policy matchcut_watch_all on public.watch_items
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists matchcut_recs_select on public.recommendations;
create policy matchcut_recs_select on public.recommendations
  for select to authenticated using (
    from_user_id = auth.uid()
    or to_user_id = auth.uid()
    or (to_group_id is not null and public.is_group_member(to_group_id))
  );
drop policy if exists matchcut_recs_insert on public.recommendations;
create policy matchcut_recs_insert on public.recommendations
  for insert to authenticated with check (from_user_id = auth.uid());

drop policy if exists matchcut_matches_select on public.matches;
create policy matchcut_matches_select on public.matches
  for select to authenticated using (public.is_group_member(group_id));
drop policy if exists matchcut_matches_insert on public.matches;
create policy matchcut_matches_insert on public.matches
  for insert to authenticated with check (public.is_group_member(group_id));

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('session-photos', 'session-photos', true)
on conflict (id) do update set public = true;

drop policy if exists matchcut_avatars_read on storage.objects;
create policy matchcut_avatars_read on storage.objects
  for select to public using (bucket_id = 'avatars');
drop policy if exists matchcut_avatars_write on storage.objects;
create policy matchcut_avatars_write on storage.objects
  for insert to authenticated with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists matchcut_avatars_update on storage.objects;
create policy matchcut_avatars_update on storage.objects
  for update to authenticated using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists matchcut_photos_read on storage.objects;
create policy matchcut_photos_read on storage.objects
  for select to public using (bucket_id = 'session-photos');
drop policy if exists matchcut_photos_write on storage.objects;
create policy matchcut_photos_write on storage.objects
  for insert to authenticated with check (
    bucket_id = 'session-photos'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.is_group_member(((storage.foldername(name))[1])::uuid)
  );

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.session_photos;
exception when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.swipes;
exception when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.matches;
exception when others then null;
end $$;
