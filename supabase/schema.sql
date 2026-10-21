-- RouteDesk V1.4 — cloud sync schema for Supabase
--
-- Run this once in your Supabase project: Dashboard -> SQL Editor -> New query ->
-- paste this whole file -> Run.
--
-- Design notes
--  * One flat table. A completed run is an immutable record, so stops are stored
--    as JSONB rather than a child table: one insert per submission, one read per
--    manager view, no joins.
--  * Team isolation without user accounts: PostgREST exposes request headers to
--    RLS, so every row is visible only to callers sending the same X-Team-Code
--    header. The anon key is public by design, so *the team code is the only
--    secret*. Use a long random one (see the note at the bottom).
--  * `id` is the route id generated on the device, and inserts are upserts on that
--    key, so a retry after a dropped connection cannot create duplicates.

create table if not exists public.completed_runs (
  id           text primary key,
  team_id      text not null,
  name         text not null default 'Untitled route',
  route_date   date,
  driver       text,
  completed_at timestamptz not null default now(),
  stop_count   int  not null default 0,
  serviced     int  not null default 0,
  skipped      int  not null default 0,
  device       text,
  stops        jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists completed_runs_team_time
  on public.completed_runs (team_id, completed_at desc);

-- Manager review fields. These are added with IF NOT EXISTS so re-running this
-- file upgrades an earlier install in place instead of failing.
alter table public.completed_runs add column if not exists review_note text not null default '';
alter table public.completed_runs add column if not exists reviewed_at timestamptz;
alter table public.completed_runs add column if not exists reviewed_by text not null default '';

alter table public.completed_runs enable row level security;

-- Read: only rows whose team_id matches the caller's X-Team-Code header.
drop policy if exists "team can read its completed runs" on public.completed_runs;
create policy "team can read its completed runs"
  on public.completed_runs
  for select
  to anon
  using (
    team_id <> ''
      and team_id = coalesce(
        nullif(current_setting('request.headers', true), '')::json ->> 'x-team-code',
        ''
      )
  );

-- Submit: a device may only write rows carrying its own team code.
drop policy if exists "team can submit completed runs" on public.completed_runs;
create policy "team can submit completed runs"
  on public.completed_runs
  for insert
  to anon
  with check (
    team_id <> ''
      and team_id = coalesce(
        nullif(current_setting('request.headers', true), '')::json ->> 'x-team-code',
        ''
      )
  );

-- Lets the retry/upsert path replace an existing row instead of failing.
drop policy if exists "team can resubmit completed runs" on public.completed_runs;
create policy "team can resubmit completed runs"
  on public.completed_runs
  for update
  to anon
  using (
    team_id <> ''
      and team_id = coalesce(
        nullif(current_setting('request.headers', true), '')::json ->> 'x-team-code',
        ''
      )
  )
  with check (
    team_id <> ''
      and team_id = coalesce(
        nullif(current_setting('request.headers', true), '')::json ->> 'x-team-code',
        ''
      )
  );

grant select, insert, update on public.completed_runs to anon;

-- ---------------------------------------------------------------------------
-- Upgrading an existing install
-- ---------------------------------------------------------------------------
-- Re-run this whole file. The create/alter statements are idempotent, so tables
-- that already exist keep their rows and only the missing pieces are added.

-- ---------------------------------------------------------------------------
-- Pick a team code
-- ---------------------------------------------------------------------------
-- Run this to generate one, then use the same string on every device:
--
--   select encode(gen_random_bytes(18), 'base64');
--
-- Treat it like a shared password. Anyone who has your site URL, your anon key
-- (which is public in the page source) and this code can read and add completed
-- runs for your team. That is acceptable for addresses alone; if you later add
-- customer names, phone numbers, or anything sensitive, move to real sign-in
-- (Supabase Auth) before doing so.
