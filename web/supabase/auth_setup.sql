-- ═══════════════════════════════════════════════════════════════════════
-- Marketing OS — Auth role hook
--
-- Adds an `app_role` claim ('admin' | 'staff' | 'agency') to every user's JWT,
-- derived from their row in the `members` table (matched by email). This is what
-- security_p1.sql reads to enforce access at the database level.
--
-- After running this: Supabase Dashboard → Authentication → Hooks →
-- "Custom Access Token" → enable and select public.custom_access_token_hook.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable as $$
declare
  claims     jsonb := event -> 'claims';
  user_email text  := lower(event -> 'claims' ->> 'email');
  m          record;
  role_out   text := 'staff';
begin
  select access, brand_access, role into m
  from public.members where lower(email) = user_email limit 1;

  if found then
    if m.brand_access = 'External only' or m.role ilike '%agency%' then
      role_out := 'agency';
    elsif m.access = 'Admin' then
      role_out := 'admin';
    else
      role_out := 'staff';
    end if;
  end if;

  claims := jsonb_set(claims, '{app_role}', to_jsonb(role_out));
  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
grant select on public.members to supabase_auth_admin;
