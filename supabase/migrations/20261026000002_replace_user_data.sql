-- Atomically replaces the calling user's data with a backup snapshot.
-- Used for both "replace" imports and "merge" imports (the client computes the
-- merged snapshot, then replaces in one transaction so a failure changes nothing).
--
-- SECURITY INVOKER: runs with the caller's privileges, so RLS still applies and
-- every inserted row is forced to user_id = auth.uid().
--
-- Rows must be complete (every column present). Missing keys become NULL rather
-- than column defaults; the client normalizes backups before calling this.

create or replace function public.replace_user_data(payload jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  t text;
  old_versions jsonb;
  -- Parent tables first. Deletion runs in reverse order.
  insert_order text[] := array[
    'settings', 'goals', 'tracks', 'stages', 'topics', 'checkpoints',
    'session_templates', 'resources', 'sessions', 'tasks', 'session_resources',
    'notes', 'recurring_blocks', 'blocks'
  ];
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if jsonb_typeof(payload) is distinct from 'object' then
    raise exception 'Backup payload must be a JSON object' using errcode = '22023';
  end if;

  -- Remember current note versions so restored notes always move forward:
  -- an editor still open on another device then sees a conflict instead of
  -- silently overwriting the imported text.
  select coalesce(jsonb_object_agg(id::text, version), '{}'::jsonb)
    into old_versions
    from public.notes where user_id = uid;

  for i in reverse array_length(insert_order, 1)..1 loop
    execute format('delete from public.%I where user_id = $1', insert_order[i]) using uid;
  end loop;

  foreach t in array insert_order loop
    if payload ? t and jsonb_typeof(payload -> t) <> 'array' then
      raise exception 'Backup field % must be an array', t using errcode = '22023';
    end if;

    if t = 'notes' then
      insert into public.notes
        select (jsonb_populate_record(
          null::public.notes,
          e || jsonb_build_object(
            'user_id', uid::text,
            'version', greatest(
              coalesce((e ->> 'version')::int, 1),
              coalesce((old_versions ->> (e ->> 'id'))::int + 1, 1)
            )
          )
        )).*
        from jsonb_array_elements(coalesce(payload -> 'notes', '[]'::jsonb)) as e;
      continue;
    end if;

    execute format(
      'insert into public.%1$I
         select (jsonb_populate_record(null::public.%1$I, e || jsonb_build_object(''user_id'', $1::text))).*
         from jsonb_array_elements(coalesce($2 -> %2$L, ''[]''::jsonb)) as e',
      t, t
    ) using uid, payload;
  end loop;
end;
$$;

revoke all on function public.replace_user_data(jsonb) from public, anon;
grant execute on function public.replace_user_data(jsonb) to authenticated;
