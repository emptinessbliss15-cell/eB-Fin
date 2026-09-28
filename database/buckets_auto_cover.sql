-- Categorized spending consumes its bucket; Unassigned covers any unfunded part.
-- Keep this calculation aligned with public/domain.js bucketBalances.
create or replace function public.fin_move_between_buckets(
  p_workspace_id uuid, p_from_category_id uuid, p_to_category_id uuid, p_amount_cents bigint
) returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  source_available bigint;
  account_total bigint;
  funded_total bigint;
begin
  if actor is null then raise exception 'Sign in to move money'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 1000000000000
     or p_from_category_id is not distinct from p_to_category_id then
    raise exception 'Choose different buckets and a positive amount';
  end if;
  perform 1 from public.fin_workspaces where id=p_workspace_id and owner_id=actor for update;
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
    select coalesce(sum(opening_balance_cents),0) into account_total
      from public.fin_accounts where workspace_id=p_workspace_id and owner_id=actor;
    select account_total + coalesce(sum(amount_cents),0) into account_total
      from public.fin_transactions where workspace_id=p_workspace_id and owner_id=actor
        and kind<>'transfer' and status='posted' and date<=current_date;
    select coalesce(sum(greatest(0,
      coalesce((select sum(case when a.to_category_id=c.id then a.amount_cents else 0 end
                                - case when a.from_category_id=c.id then a.amount_cents else 0 end)
                from public.fin_allocations a where a.workspace_id=p_workspace_id and a.owner_id=actor),0)
      + coalesce((select sum(t.amount_cents) from public.fin_transactions t
                  where t.workspace_id=p_workspace_id and t.owner_id=actor and t.category_id=c.id
                    and t.kind='expense' and t.status='posted' and t.date<=current_date),0)
    )),0) into funded_total from public.fin_categories c
      where c.workspace_id=p_workspace_id and c.owner_id=actor and c.kind='expense';
    source_available := account_total - funded_total;
  else
    select greatest(0,
      coalesce((select sum(case when to_category_id=p_from_category_id then amount_cents else 0 end
                                - case when from_category_id=p_from_category_id then amount_cents else 0 end)
                from public.fin_allocations where workspace_id=p_workspace_id and owner_id=actor),0)
      + coalesce((select sum(amount_cents) from public.fin_transactions
                  where workspace_id=p_workspace_id and owner_id=actor and kind='expense'
                    and category_id=p_from_category_id and status='posted' and date<=current_date),0)
    ) into source_available;
  end if;
  if source_available < p_amount_cents then raise exception 'That bucket does not have enough available'; end if;
  insert into public.fin_allocations(workspace_id,owner_id,from_category_id,to_category_id,amount_cents)
  values (p_workspace_id,actor,p_from_category_id,p_to_category_id,p_amount_cents);
end $$;
revoke all on function public.fin_move_between_buckets(uuid,uuid,uuid,bigint) from public, anon;
grant execute on function public.fin_move_between_buckets(uuid,uuid,uuid,bigint) to authenticated;
