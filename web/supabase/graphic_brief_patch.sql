-- graphic_brief_patch — let the requester fill in a brief without clobbering it.
--
-- Two problems, one function.
--
-- 1. WRITE-OVER. updateGraphic() sends `data: g` — the whole request as one
--    JSONB blob. Two people with the drawer open before Creative accepts means
--    the second save overwrites every field the first one changed, silently:
--    nothing errors, the row just quietly loses work. Opening the Brief tab for
--    editing would have made that collision routine instead of rare, so the
--    merge has to be server-side. `data || p_patch` is one statement against
--    the current row — no read-modify-write window to lose an edit in.
--
-- 2. THE LOCK WAS ONLY IN THE UI. contentEditLock() decides "planners edit
--    freely until Creative accepts", but it is a TypeScript function; the
--    database has never known about it. The same lesson as the expense
--    approval rules (security_p12): a rule that lives only in the client is a
--    suggestion. Here it is a check.
--
-- SECURITY INVOKER on purpose — the existing staff_update policy on
-- graphic_requests (app_role in admin/staff AND brand_visible) still applies,
-- so this adds a restriction and never removes one. Agency accounts reach the
-- table through agency_own_graphics_update and are unaffected: they are not
-- requesters and this function is not how they submit work.
--
-- Idempotent. Rollback: graphic_brief_patch_rollback.sql

begin;

create or replace function public.graphic_brief_patch(p_id text, p_patch jsonb)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  allowed text[] := array[
    'briefLink', 'driveLink', 'referenceLink',
    'objective', 'keyMessage', 'moodDirection', 'captionCopy', 'extraDetails'
  ];
  bad text[];
  cur record;
  merged jsonb;
  unlocked boolean;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'patch ต้องเป็น JSON object' using errcode = '22023';
  end if;
  if p_patch = '{}'::jsonb then
    raise exception 'ไม่มีอะไรให้บันทึก' using errcode = '22023';
  end if;

  -- Whitelist, not blacklist: a patch assembled on the client must never be
  -- able to smuggle stage, designer, acceptedAt or an approval alongside the
  -- brief text it claims to be.
  select array_agg(k) into bad
  from jsonb_object_keys(p_patch) k
  where k <> all (allowed);
  if bad is not null then
    raise exception 'แก้ไขฟิลด์เหล่านี้จากบรีฟไม่ได้: %', array_to_string(bad, ', ')
      using errcode = '42501';
  end if;

  -- Every value must be a string. Swapping a text field for an object or array
  -- would not fail here, it would fail later in whatever renders it.
  if exists (
    select 1 from jsonb_each(p_patch) e
    where jsonb_typeof(e.value) not in ('string', 'null')
  ) then
    raise exception 'ค่าของฟิลด์บรีฟต้องเป็นข้อความ' using errcode = '22023';
  end if;

  select id, data, deleted_at into cur
  from public.graphic_requests
  where data->>'id' = p_id
  for update;

  if not found then
    raise exception 'ไม่พบใบงานนี้ (id %)', p_id using errcode = 'P0002';
  end if;
  if cur.deleted_at is not null then
    raise exception 'ใบงานนี้อยู่ในถังขยะ — กู้คืนก่อนจึงจะแก้บรีฟได้' using errcode = '42501';
  end if;

  -- The lock, now enforced where it cannot be skipped by calling the API
  -- directly. The message names the way out, because there is one.
  --
  -- The way out is briefUnlock: the requester asks, the Creative Leader
  -- releases, and the release is good for ONE top-up. Before this existed the
  -- check was simply "accepted = never", which is why the release shipped
  -- broken — the UI opened the editor and this function refused the save, so a
  -- granted top-up looked exactly like an edit that silently did not stick.
  unlocked := coalesce(cur.data->'briefUnlock'->>'status', '') = 'Granted';

  if coalesce(cur.data->>'acceptedAt', '') <> '' and not unlocked then
    raise exception 'Creative รับงานนี้แล้ว (%) — ต้องขอเติมบรีฟกับ Creative Leader และรอปล่อยงานก่อน',
      coalesce(nullif(cur.data->>'acceptedBy', ''), 'ไม่ระบุผู้รับ')
      using errcode = '42501';
  end if;

  merged := cur.data || p_patch;

  -- Spend the release in the SAME statement that uses it. The client used to
  -- do this as a second whole-blob write, which both re-opened the
  -- write-over hole this function exists to close and left the grant standing
  -- if that write failed — a one-shot permission that survives its own use is
  -- not one-shot.
  if unlocked then
    merged := merged - 'briefUnlock';
  end if;

  update public.graphic_requests
     set data = merged
   where id = cur.id;

  return merged;
end;
$function$;

commit;
