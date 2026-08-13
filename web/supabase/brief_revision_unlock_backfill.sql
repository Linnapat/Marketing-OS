-- Reopen the brief on revisions raised before the auto-release — 2026-08-13
--
-- When Creative hands a brief back they now also hand back the editor
-- (releaseBriefForRevision, merged 3 Aug 17:53 +07). Before that, the requester
-- got a task saying "แก้ brief ตาม comment" and no way to type: the job was
-- accepted, so canEditBriefNow refused them, and the only route left was to ask
-- the Creative Leader for permission to do what the Creative Leader had just
-- told them to do.
--
-- Three requests are still in that state, all raised BEFORE the fix:
--
--   TPN_2609_001-C01-A01  Gik    28 Jul  ขาด link brief + key message
--   TPN_2608_003-C01-A01  Pupay   2 Aug  ขาด link brief
--   TPN_2609_002-C01-A01  Pupay   3 Aug  ขาด link brief   (03:46, fix landed 10:53 UTC)
--
-- Nothing reopens them on its own — the grant is only issued at the moment the
-- brief is sent back, and that moment has passed.
--
-- Deliberately narrow. It grants ONLY where all of this holds:
--   · the request is still flagged "Brief revision requested"
--   · the job is accepted (an unaccepted one is already editable — 6 of the 12
--     open revisions are in that state and are left alone)
--   · the brief link is still empty (the other 3 accepted ones have since been
--     filled in and are waiting on Creative to re-approve, not on the editor)
--   · no grant exists (never overwrite a pending request or a rejection)
--
-- Granted in the name of whoever asked for the revision, matching what the code
-- does now. It is spent on the first save like any other release, so this opens
-- the brief exactly once per request.
--
-- Undo: brief_revision_unlock_backfill_rollback.sql
-- Re-runnable: the "no grant exists" guard makes a second run a no-op.

begin;

update graphic_requests g
set data = g.data || jsonb_build_object('briefUnlock', jsonb_build_object(
      'status',       'Granted',
      'requestedBy',  coalesce(g.data->>'requester', ''),
      'requestedAt',  now(),
      'reason',       coalesce((
        select h->>'note' from jsonb_array_elements(coalesce(g.data->'history','[]'::jsonb)) h
        where h->>'type' = 'brief_revision_requested'
        order by h->>'at' desc limit 1), 'ส่งบรีฟกลับมาแก้'),
      'decidedBy',    coalesce((
        select h->>'by' from jsonb_array_elements(coalesce(g.data->'history','[]'::jsonb)) h
        where h->>'type' = 'brief_revision_requested' and coalesce(h->>'by','') <> ''
        order by h->>'at' desc limit 1), 'Creative'),
      'decidedAt',    now(),
      'decisionNote', 'ปล่อยย้อนหลัง: Creative ส่งบรีฟกลับมาแก้ก่อนที่ระบบจะปล่อยให้อัตโนมัติ'
    ))
where g.deleted_at is null
  and g.data->>'blocker' = 'Brief revision requested'
  and btrim(coalesce(g.data->>'acceptedAt', '')) <> ''
  and btrim(coalesce(g.data->>'briefLink', '')) = ''
  and not (g.data ? 'briefUnlock');

select record_migration(
  'brief_revision_unlock_backfill.sql',
  'ปลดล็อกช่องบรีฟให้ใบงานที่ Creative ส่งกลับมาแก้ก่อนมีระบบปล่อยอัตโนมัติ'
);

commit;
