-- Study planner schema.
-- Every user-owned table carries user_id, has RLS enabled, and is only reachable
-- by the `authenticated` role for rows where user_id = auth.uid().
-- Child rows reference parents through composite (id, user_id) foreign keys so a
-- row can never point at another user's record, even by guessing a UUID.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Notes use an optimistic-concurrency version. Clients update with
-- `where version = <the version they loaded>`; this trigger bumps it whenever
-- the content changes. Relinking (e.g. a session deletion nulling session_id)
-- does not count as an edit, so it cannot cause spurious conflicts.
create or replace function public.bump_note_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.body is distinct from old.body or new.title is distinct from old.title then
    new.version := old.version + 1;
  else
    new.version := old.version;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Settings (one row per user)
-- ---------------------------------------------------------------------------
create table public.settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  study_days smallint[] not null default '{1,2,3,4,5}',
  daily_capacity_min integer not null default 360 check (daily_capacity_min between 0 and 1440),
  start_date date,
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id),
  check (study_days <@ '{1,2,3,4,5,6,7}'::smallint[])
);

-- ---------------------------------------------------------------------------
-- Curriculum
-- ---------------------------------------------------------------------------
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 500),
  description text not null default '' check (char_length(description) <= 20000),
  position integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  color text not null default 'slate' check (char_length(color) between 1 and 32),
  position integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.stages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 500),
  description text not null default '' check (char_length(description) <= 20000),
  position integer not null default 0,
  est_weeks_min integer check (est_weeks_min between 0 and 520),
  est_weeks_max integer check (est_weeks_max between 0 and 520),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 500),
  description text not null default '' check (char_length(description) <= 20000),
  parent_id uuid,
  stage_id uuid,
  track_ids uuid[] not null default '{}',
  goal_ids uuid[] not null default '{}',
  position integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (parent_id is null or parent_id <> id),
  foreign key (parent_id, user_id) references public.topics (id, user_id) on delete set null (parent_id),
  foreign key (stage_id, user_id) references public.stages (id, user_id) on delete set null (stage_id)
);

create table public.checkpoints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  stage_id uuid,
  title text not null check (char_length(title) between 1 and 1000),
  description text not null default '' check (char_length(description) <= 20000),
  achieved_at timestamptz,
  evidence text not null default '' check (char_length(evidence) <= 20000),
  position integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (stage_id, user_id) references public.stages (id, user_id) on delete set null (stage_id)
);

-- ---------------------------------------------------------------------------
-- Work: templates, sessions, tasks, resources
-- ---------------------------------------------------------------------------
create table public.session_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 300),
  title text not null default '' check (char_length(title) <= 500),
  description text not null default '' check (char_length(description) <= 20000),
  track_id uuid,
  topic_id uuid,
  planned_min integer check (planned_min between 0 and 1440),
  output text not null default '' check (char_length(output) <= 5000),
  -- Snapshot of task blueprints: [{title, description, required, est_min, output}]
  tasks jsonb not null default '[]' check (jsonb_typeof(tasks) = 'array'),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (track_id, user_id) references public.tracks (id, user_id) on delete set null (track_id),
  foreign key (topic_id, user_id) references public.topics (id, user_id) on delete set null (topic_id)
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 500),
  description text not null default '' check (char_length(description) <= 20000),
  track_id uuid,
  topic_id uuid,
  template_id uuid,
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'completed', 'skipped')),
  output text not null default '' check (char_length(output) <= 5000),
  planned_min integer check (planned_min between 0 and 1440),
  actual_min integer check (actual_min between 0 and 1440),
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (track_id, user_id) references public.tracks (id, user_id) on delete set null (track_id),
  foreign key (topic_id, user_id) references public.topics (id, user_id) on delete set null (topic_id),
  foreign key (template_id, user_id) references public.session_templates (id, user_id) on delete set null (template_id)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null,
  position integer not null default 0,
  title text not null check (char_length(title) between 1 and 1000),
  description text not null default '' check (char_length(description) <= 20000),
  required boolean not null default true,
  done boolean not null default false,
  done_at timestamptz,
  est_min integer check (est_min between 0 and 1440),
  output text not null default '' check (char_length(output) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (session_id, user_id) references public.sessions (id, user_id) on delete cascade
);

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 1000),
  url text check (url is null or (url ~* '^https?://' and char_length(url) <= 2048)),
  type text not null default 'other' check (type in ('paper', 'article', 'video', 'course', 'documentation', 'repository', 'book', 'other')),
  description text not null default '' check (char_length(description) <= 20000),
  tags text[] not null default '{}',
  track_ids uuid[] not null default '{}',
  topic_ids uuid[] not null default '{}',
  stage_ids uuid[] not null default '{}',
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.session_resources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null,
  resource_id uuid not null,
  portion_kind text check (portion_kind in ('chapter', 'pages', 'timestamp', 'exercise', 'other')),
  portion text not null default '' check (char_length(portion) <= 1000),
  portion_done boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (session_id, user_id) references public.sessions (id, user_id) on delete cascade,
  foreign key (resource_id, user_id) references public.resources (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Calendar
-- ---------------------------------------------------------------------------
create table public.recurring_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 500),
  track_id uuid,
  weekdays smallint[] not null check (weekdays <@ '{1,2,3,4,5,6,7}'::smallint[]),
  start_time time,
  duration_min integer not null default 60 check (duration_min between 5 and 1440),
  required boolean not null default true,
  starts_on date not null,
  ends_on date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (ends_on is null or ends_on >= starts_on),
  foreign key (track_id, user_id) references public.tracks (id, user_id) on delete set null (track_id)
);

create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Calendar date in the user's configured timezone. Never a timestamp.
  date date not null,
  position integer not null default 0,
  -- Optional wall-clock start time, interpreted in settings.timezone.
  start_time time,
  duration_min integer not null default 60 check (duration_min between 5 and 1440),
  required boolean not null default true,
  title text not null default '' check (char_length(title) <= 500),
  track_id uuid,
  session_id uuid,
  -- Only meaningful when no session is linked; linked blocks use the session's state.
  status text not null default 'planned' check (status in ('planned', 'completed', 'skipped')),
  recurrence_id uuid,
  occurrence_date date,
  detached boolean not null default false,
  -- [{from: 'YYYY-MM-DD', to: 'YYYY-MM-DD', at: timestamptz}]
  history jsonb not null default '[]' check (jsonb_typeof(history) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  -- A session has at most one calendar placement.
  unique (session_id),
  -- Recurrence generation is idempotent: one block per rule per occurrence date.
  unique (user_id, recurrence_id, occurrence_date),
  foreign key (track_id, user_id) references public.tracks (id, user_id) on delete set null (track_id),
  foreign key (session_id, user_id) references public.sessions (id, user_id) on delete set null (session_id),
  foreign key (recurrence_id, user_id) references public.recurring_blocks (id, user_id) on delete set null (recurrence_id)
);

-- ---------------------------------------------------------------------------
-- Notes (attached to a session, a topic, a date, or nothing)
-- ---------------------------------------------------------------------------
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 500),
  body text not null default '' check (char_length(body) <= 200000),
  session_id uuid,
  topic_id uuid,
  date date,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  -- Deleting a session never deletes its notes; they become unattached.
  foreign key (session_id, user_id) references public.sessions (id, user_id) on delete set null (session_id),
  foreign key (topic_id, user_id) references public.topics (id, user_id) on delete set null (topic_id)
);

-- ---------------------------------------------------------------------------
-- Indexes, triggers, RLS, grants
-- ---------------------------------------------------------------------------
create index on public.topics (user_id);
create index on public.goals (user_id);
create index on public.tracks (user_id);
create index on public.stages (user_id);
create index on public.checkpoints (user_id);
create index on public.session_templates (user_id);
create index on public.sessions (user_id);
create index on public.tasks (user_id, session_id);
create index on public.resources (user_id);
create index on public.session_resources (user_id, session_id);
create index on public.session_resources (resource_id);
create index on public.recurring_blocks (user_id);
create index on public.blocks (user_id, date);
create index on public.notes (user_id, session_id);

do $$
declare
  t text;
begin
  foreach t in array array[
    'settings', 'goals', 'tracks', 'stages', 'topics', 'checkpoints',
    'session_templates', 'sessions', 'tasks', 'resources', 'session_resources',
    'recurring_blocks', 'blocks', 'notes'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);

    execute format(
      'create policy "%1$s_select_own" on public.%1$I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "%1$s_insert_own" on public.%1$I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "%1$s_update_own" on public.%1$I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "%1$s_delete_own" on public.%1$I for delete to authenticated using ((select auth.uid()) = user_id)', t);

    execute format('revoke all on table public.%I from anon, public', t);
    -- Explicit grants are required: Supabase no longer exposes new public tables
    -- to the Data API automatically. Grants decide table access; RLS decides rows.
    execute format('grant select, insert, update, delete on table public.%I to authenticated, service_role', t);

    if t = 'notes' then
      execute 'create trigger notes_bump_version before update on public.notes for each row execute function public.bump_note_version()';
    else
      execute format(
        'create trigger %1$s_set_updated_at before update on public.%1$I for each row execute function public.set_updated_at()', t);
    end if;
  end loop;
end;
$$;
