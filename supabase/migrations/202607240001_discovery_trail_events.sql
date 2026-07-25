create table if not exists public.discovery_trail_events (
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id text not null,
  relationship_id text not null,
  action text not null check (action in ('connect', 'disconnect')),
  source text not null,
  target text not null,
  reason text,
  session_id text,
  occurred_at timestamptz not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  primary key (user_id, event_id)
);

alter table public.discovery_trail_events enable row level security;

revoke all on table public.discovery_trail_events from anon, authenticated;
grant select, insert on table public.discovery_trail_events to authenticated;

create policy "Users can read their own discovery trail events"
  on public.discovery_trail_events
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can append their own discovery trail events"
  on public.discovery_trail_events
  for insert
  to authenticated
  with check (auth.uid() = user_id);
