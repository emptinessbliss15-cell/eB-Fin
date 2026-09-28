-- Apply to the eBliss database after the existing fin_* schema.
-- Unassigned is computed from account balances and allocations, never a deletable row.
alter table public.fin_categories add column parent_category_id uuid;
alter table public.fin_categories add constraint fin_categories_parent_fkey
  foreign key (parent_category_id,workspace_id,owner_id)
  references public.fin_categories(id,workspace_id,owner_id) on delete restrict;
alter table public.fin_categories add constraint fin_categories_not_self_parent
  check (parent_category_id is distinct from id);
alter table public.fin_categories add constraint fin_categories_unassigned_reserved
  check (kind <> 'expense' or lower(trim(name)) <> 'unassigned');

create function public.fin_validate_bucket_parent() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare current_id uuid := new.parent_category_id; next_id uuid; parent_kind text; seen uuid[] := array[new.id];
begin
  if current_id is null then return new; end if;
  if new.kind <> 'expense' then raise exception 'Only expense buckets can have parents'; end if;
  while current_id is not null loop
    if current_id = any(seen) then raise exception 'Bucket hierarchy cannot contain a cycle'; end if;
    seen := array_append(seen,current_id);
    select parent_category_id,kind into next_id,parent_kind from public.fin_categories
      where id=current_id and workspace_id=new.workspace_id and owner_id=new.owner_id;
    if not found or parent_kind <> 'expense' then raise exception 'Parent must be an expense bucket in this workspace'; end if;
    current_id := next_id;
  end loop;
  return new;
end $$;
revoke all on function public.fin_validate_bucket_parent() from public, anon, authenticated;
create trigger fin_validate_bucket_parent before insert or update of parent_category_id,kind
  on public.fin_categories for each row execute function public.fin_validate_bucket_parent();

create table public.fin_allocations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_id uuid not null,
  from_category_id uuid,
  to_category_id uuid,
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 1000000000000),
  created_at timestamptz not null default now(),
  check (from_category_id is distinct from to_category_id),
  foreign key (workspace_id, owner_id) references public.fin_workspaces(id, owner_id) on delete cascade,
  foreign key (from_category_id, workspace_id, owner_id) references public.fin_categories(id, workspace_id, owner_id) on delete restrict,
  foreign key (to_category_id, workspace_id, owner_id) references public.fin_categories(id, workspace_id, owner_id) on delete restrict
);
create index fin_allocations_workspace_owner on public.fin_allocations(workspace_id, owner_id);
alter table public.fin_allocations enable row level security;
revoke all on public.fin_allocations from public, anon, authenticated;
grant select on public.fin_allocations to authenticated;
create policy fin_allocations_owner_read on public.fin_allocations
  for select to authenticated using (owner_id = (select auth.uid()));

-- A privileged function is needed so clients can read allocation history but cannot
-- insert arbitrary rows that bypass the source-balance check.
create function public.fin_move_between_buckets(
  p_workspace_id uuid, p_from_category_id uuid, p_to_category_id uuid, p_amount_cents bigint
) returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  source_available bigint;
begin
  if actor is null then raise exception 'Sign in to move money'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 1000000000000
     or p_from_category_id is not distinct from p_to_category_id then
    raise exception 'Choose different buckets and a positive amount';
  end if;
  -- Serialize competing allocations for this workspace.
  perform 1 from public.fin_workspaces where id = p_workspace_id and owner_id = actor for update;
  if not found then raise exception 'Workspace unavailable'; end if;
  if p_from_category_id is not null and not exists (
    select 1 from public.fin_categories where id=p_from_category_id and workspace_id=p_workspace_id
      and owner_id=actor and kind='expense'
  ) then raise exception 'Source bucket unavailable'; end if;
  if p_to_category_id is not null and not exists (
    select 1 from public.fin_categories where id=p_to_category_id and workspace_id=p_workspace_id
      and owner_id=actor and kind='expense'
  ) then raise exception 'Destination bucket unavailable'; end if;

  if p_from_category_id is null then
    select
      coalesce((select sum(opening_balance_cents) from public.fin_accounts
        where workspace_id=p_workspace_id and owner_id=actor),0)
      + coalesce((select sum(case when kind='transfer' then 0 else amount_cents end)
        from public.fin_transactions where workspace_id=p_workspace_id and owner_id=actor
          and status='posted' and date<=current_date),0)
      - coalesce((select sum(case when to_category_id is not null then amount_cents else 0 end
                                   - case when from_category_id is not null then amount_cents else 0 end)
        from public.fin_allocations where workspace_id=p_workspace_id and owner_id=actor),0)
      - coalesce((select sum(amount_cents) from public.fin_transactions
        where workspace_id=p_workspace_id and owner_id=actor and kind='expense'
          and category_id is not null and status='posted' and date<=current_date),0)
      into source_available;
  else
    select
      coalesce((select sum(case when to_category_id=p_from_category_id then amount_cents else 0 end
                                   - case when from_category_id=p_from_category_id then amount_cents else 0 end)
        from public.fin_allocations where workspace_id=p_workspace_id and owner_id=actor),0)
      + coalesce((select sum(amount_cents) from public.fin_transactions
        where workspace_id=p_workspace_id and owner_id=actor and kind='expense'
          and category_id=p_from_category_id and status='posted' and date<=current_date),0)
      into source_available;
  end if;
  if source_available < p_amount_cents then raise exception 'That bucket does not have enough available'; end if;
  insert into public.fin_allocations(workspace_id,owner_id,from_category_id,to_category_id,amount_cents)
  values (p_workspace_id,actor,p_from_category_id,p_to_category_id,p_amount_cents);
end $$;
revoke all on function public.fin_move_between_buckets(uuid,uuid,uuid,bigint) from public, anon;
grant execute on function public.fin_move_between_buckets(uuid,uuid,uuid,bigint) to authenticated;

-- Existing category protection also needs to include allocation history.
create or replace function public.fin_protect_bucket_category() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.kind <> old.kind and (exists(
    select 1 from public.fin_allocations where from_category_id=old.id or to_category_id=old.id
  ) or exists(select 1 from public.fin_categories where parent_category_id=old.id))
    then raise exception 'Bucket type cannot change while allocations or child buckets exist'; end if;
  return new;
end $$;
revoke all on function public.fin_protect_bucket_category() from public, anon, authenticated;
create trigger fin_protect_bucket_category before update on public.fin_categories
for each row execute function public.fin_protect_bucket_category();
