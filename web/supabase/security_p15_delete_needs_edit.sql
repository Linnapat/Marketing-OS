-- p15 — deleting a row requires Edit on its module, not merely sight of it.
--
-- NOT YET APPLIED TO PRODUCTION. Read the impact list before running it.
--
-- Found on 2026-08-01 while testing the app as a KOL Specialist. Trash offered
-- ลบถาวร on a Content post deleted by someone else, and the button worked: the
-- DELETE policy on content_posts asks only for `app_role in (admin, staff)` and
-- brand visibility, and says nothing about the Content module. Six of the ten
-- roles sit at Content = View. Every one of them could permanently destroy a
-- post they are not allowed to edit in Content Plan.
--
-- The Trash screen now hides those buttons (src/app/trash/page.tsx), but that is
-- a hidden button, not a rule — the same lesson as the 2026-07-30 audit. This is
-- the rule.
--
-- campaigns already restricts DELETE to admin, and tasks stays open on purpose:
-- My Tasks is ungated for every internal role, so a task carries no module.
--
-- IMPACT — who loses the ability to delete:
--   content_posts   Creative Leader, Senior Graphic Designer, VDO Editor,
--                   Co-ordinator, KOL Specialist   (all Content = View)
--   graphic_requests Marketing Executive, Co-ordinator   (Graphic = View)
-- Nobody who can create or edit in a module loses the ability to delete in it.
--
-- Reversible: re-create each policy without the has_module() clause.

begin;

drop policy if exists staff_delete on content_posts;
create policy staff_delete on content_posts for delete
  using (
    auth.role() = 'authenticated'
    and app_role() in ('admin', 'staff')
    and brand_visible(brand)
    and has_module('Content', 'Edit')
  );

drop policy if exists staff_delete on graphic_requests;
create policy staff_delete on graphic_requests for delete
  using (
    auth.role() = 'authenticated'
    and app_role() in ('admin', 'staff')
    and brand_visible(brand)
    and has_module('Graphic', 'Edit')
  );

commit;

-- Verify per role (transaction-local; one role per statement — STABLE functions
-- get cached across a correlated subquery and every role reads the same):
--
--   select set_config('request.jwt.claims', json_build_object(
--     'email', (select email from members where role = 'KOL Specialist' limit 1),
--     'app_role', 'staff', 'role', 'authenticated')::text, true);
--   select has_module('Content','Edit') as may_delete_content;
