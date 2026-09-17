-- End employee access without deleting identity, customer history or access evidence.
-- Existing membership checks read active on every new request, not from JWT roles.
create function public.deactivate_staff_member(p_command_id uuid,p_user_id uuid,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  member public.staff_members;
  prior lys_private.staff_access_commands;
  payload jsonb := jsonb_build_object('action','deactivate','userId',p_user_id,'expectedVersion',p_expected_version);
  receipt jsonb;
begin
  -- Same lock order as access changes and invitations. Keep one active owner.
  perform pg_advisory_xact_lock(724513,1);
  perform 1 from public.staff_members where user_id=actor and active and is_owner for share;
  if not found then raise exception 'owner_required' using errcode='42501'; end if;
  if p_command_id is null or p_user_id is null or p_expected_version is null or p_expected_version<1
  then raise exception 'invalid_staff_access' using errcode='22023'; end if;
  if p_user_id=actor then raise exception 'self_deactivation_forbidden' using errcode='42501'; end if;
  select * into prior from lys_private.staff_access_commands where command_id=p_command_id;
  if found then
    if prior.actor_id<>actor or prior.payload is distinct from payload then
      raise exception 'command_conflict' using errcode='22023';
    end if;
    return prior.receipt;
  end if;
  select * into member from public.staff_members where user_id=p_user_id for update;
  if not found then raise exception 'staff_not_found' using errcode='P0002'; end if;
  if member.access_version<>p_expected_version then raise exception 'staff_version_conflict' using errcode='40001'; end if;
  if not member.active then raise exception 'staff_already_inactive' using errcode='22023'; end if;
  -- The existing guard and evidence triggers protect the last owner, increment
  -- access_version and record the actor plus the exact before/after snapshot.
  update public.staff_members set active=false where user_id=p_user_id returning * into member;
  update lys_private.push_subscriptions set active=false,updated_at=now() where user_id=p_user_id and active;
  select jsonb_build_object('userId',member.user_id,'version',member.access_version,'eventId',id) into receipt
    from public.staff_access_events where user_id=member.user_id and access_version=member.access_version;
  insert into lys_private.staff_access_commands(command_id,actor_id,payload,receipt) values(p_command_id,actor,payload,receipt);
  return receipt;
end $$;
revoke all on function public.deactivate_staff_member(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.deactivate_staff_member(uuid,uuid,integer) to authenticated;
comment on function public.deactivate_staff_member(uuid,uuid,integer) is 'Active owners only; self-deactivation is forbidden even with multiple owners. Deactivates another observed membership and its push subscriptions atomically with access evidence and a retry receipt. Preserves identity, role and history; never reactivates or removes the last active owner.';
