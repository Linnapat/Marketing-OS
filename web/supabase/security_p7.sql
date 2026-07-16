-- ═══════════════════════════════════════════════════════════════════════
-- Marketing OS — Security P7: stamp the granular member_role into the JWT
--
-- Applied to production 2026-07-16 and verified. Kept here as source of truth.
--
-- ⚠️ THIS FILE HOLDS THE CURRENT custom_access_token_hook DEFINITION.
--    security_p1.sql and security_p3.sql contain OLDER copies of the same
--    function, kept only so a fresh project can replay the files in order:
--      · security_p1.sql defaults to 'staff' — fail-OPEN, a signed-in non-member
--        would get full staff access — and stamps no member_role.
--      · security_p3.sql is fail-closed but still stamps no member_role.
--    Running either of them ALONE silently downgrades production auth. If you need
--    to re-apply the hook, run THIS file (or replay p1 → p3 → p7 in order).
--    (auth_setup.sql held a third, fail-open copy and was removed.)
--
-- WHY: RLS/RPCs only knew app_role (admin|staff|agency), which can't express the
-- real approval rules — "only CMO and Marketing Manager / BGL may approve an
-- expense request; only a Co-ordinator may Mark Paid". The granular role lives
-- in members.role, and a policy must NOT query members to get it (the hook runs
-- as supabase_auth_admin and policies calling back into members invite recursion
-- / RLS surprises — see security_p3.sql). So the hook, which already reads
-- members at login, stamps it into the token instead.
--
-- Purely additive: app_role behaviour is unchanged and nothing enforces
-- member_role yet (that's the Finance RLS phases 2–4). The claim lands on every
-- newly issued token, including automatic refreshes, so no forced re-login.
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  claims          jsonb := event -> 'claims';
  user_email      text  := lower(event -> 'claims' ->> 'email');
  m               record;
  role_out        text := 'none';          -- fail-closed: non-member ⇒ no access
  member_role_out text := '';
begin
  select access, brand_access, role into m
  from public.members where lower(email) = user_email limit 1;

  if found then
    member_role_out := coalesce(m.role, '');
    if m.brand_access = 'External only' or m.role ilike '%agency%' then
      role_out := 'agency';
    elsif m.access = 'Admin' then
      role_out := 'admin';
    else
      role_out := 'staff';
    end if;
  end if;

  claims := jsonb_set(claims, '{app_role}',    to_jsonb(role_out));
  claims := jsonb_set(claims, '{member_role}', to_jsonb(member_role_out));
  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
-- The hook reads members as supabase_auth_admin, which does NOT bypass RLS —
-- public.members must keep the auth_admin_read_members policy (security_p3.sql).

-- Granular role of the caller, straight from the JWT ('' on a stale token).
create or replace function public.member_role() returns text
  language sql stable set search_path = public as $$
  select coalesce(nullif(auth.jwt() ->> 'member_role', ''), '');
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- VERIFIED on prod — hook output per real member:
--   linnapat.d   → app_role admin · member_role "CMO"                    (may approve)
--   orapan.ch    → app_role staff · member_role "Marketing Manager / BGL"(may approve)
--   aornkanya.s  → app_role staff · member_role "Co-ordinator"           (may Mark Paid)
--   pichayaporn.l→ app_role staff · member_role "Creative Leader"        (neither)
--
-- NEXT (Finance RLS phases 2–4, not started): move every finance write to
-- SECURITY DEFINER RPCs that check member_role, then lock expense_requests /
-- expenses to SELECT-for-all + admin-only writes, then rewire lib/db/finance.ts.
-- ═══════════════════════════════════════════════════════════════════════
