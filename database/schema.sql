create table public.finance_workspaces (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null check (length(trim(name)) between 1 and 100),
 kind text not null check (kind in ('personal','business')),
 currency text not null default 'USD' check (currency in ('USD','CAD','EUR','GBP','AUD','NZD')),
 created_at timestamptz not null default now(),
 unique(id,owner_id)
);
create table public.finance_accounts (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 owner_id uuid not null default auth.uid(),
 name text not null check(length(trim(name)) between 1 and 100),
 kind text not null check(kind in ('checking','savings','credit','cash','loan','investment')),
 opening_balance_cents bigint not null default 0 check(abs(opening_balance_cents) <= 1000000000000),
 institution text not null default '',
 created_at timestamptz not null default now(),
 unique(id,workspace_id,owner_id),
 foreign key(workspace_id,owner_id) references public.finance_workspaces(id,owner_id) on delete cascade
);
create table public.finance_categories (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 owner_id uuid not null default auth.uid(),
 name text not null check(length(trim(name)) between 1 and 80),
 kind text not null check(kind in ('income','expense')),
 created_at timestamptz not null default now(),
 unique(id,workspace_id,owner_id),
 unique(workspace_id,name,kind),
 foreign key(workspace_id,owner_id) references public.finance_workspaces(id,owner_id) on delete cascade
);
create table public.finance_transactions (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 owner_id uuid not null default auth.uid(),
 account_id uuid not null,
 to_account_id uuid,
 category_id uuid,
 date date not null,
 payee text not null check(length(trim(payee)) between 1 and 200),
 amount_cents bigint not null check(amount_cents <> 0 and abs(amount_cents) <= 1000000000000),
 kind text not null check(kind in ('income','expense','transfer')),
 status text not null default 'posted' check(status in ('posted','pending')),
 reviewed boolean not null default false,
 notes text not null default '' check(length(notes)<=4000),
 import_key text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(workspace_id,owner_id) references public.finance_workspaces(id,owner_id) on delete cascade,
 foreign key(account_id,workspace_id,owner_id) references public.finance_accounts(id,workspace_id,owner_id) on delete restrict,
 foreign key(to_account_id,workspace_id,owner_id) references public.finance_accounts(id,workspace_id,owner_id) on delete restrict,
 foreign key(category_id,workspace_id,owner_id) references public.finance_categories(id,workspace_id,owner_id) on delete restrict,
 check((kind='income' and amount_cents>0 and to_account_id is null)
    or (kind='expense' and amount_cents<0 and to_account_id is null)
    or (kind='transfer' and amount_cents<0 and to_account_id is not null and to_account_id<>account_id and category_id is null)),
 unique(workspace_id,import_key)
);
create table public.finance_budgets (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 owner_id uuid not null default auth.uid(),
 category_id uuid not null,
 month date not null check(extract(day from month)=1),
 amount_cents bigint not null check(amount_cents>0 and amount_cents<=1000000000000),
 created_at timestamptz not null default now(),
 unique(workspace_id,category_id,month),
 foreign key(workspace_id,owner_id) references public.finance_workspaces(id,owner_id) on delete cascade,
 foreign key(category_id,workspace_id,owner_id) references public.finance_categories(id,workspace_id,owner_id) on delete restrict
);
create index finance_workspaces_owner on public.finance_workspaces(owner_id);
create index finance_accounts_workspace_owner on public.finance_accounts(workspace_id,owner_id);
create index finance_categories_workspace_owner on public.finance_categories(workspace_id,owner_id);
create index finance_transactions_workspace_date on public.finance_transactions(workspace_id,owner_id,date);
create index finance_transactions_account on public.finance_transactions(account_id,workspace_id,owner_id);
create index finance_transactions_destination on public.finance_transactions(to_account_id,workspace_id,owner_id);
create index finance_transactions_category on public.finance_transactions(category_id,workspace_id,owner_id);
create index finance_budgets_workspace_owner on public.finance_budgets(workspace_id,owner_id);
create index finance_budgets_category on public.finance_budgets(category_id,workspace_id,owner_id);
do $$
declare t text;
begin
 foreach t in array array['finance_workspaces','finance_accounts','finance_categories','finance_transactions','finance_budgets'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select,insert,update,delete on public.%I to authenticated',t);
 execute format('create policy owner_access on public.%I for all to authenticated using (owner_id=(select auth.uid())) with check (owner_id=(select auth.uid()))',t);
 end loop;
end $$;
-- Validate category semantics on writes, without bypassing caller RLS.
create function public.finance_validate_category() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare category_kind text;
begin
 if new.category_id is not null then
  select kind into category_kind from public.finance_categories
  where id=new.category_id and workspace_id=new.workspace_id and owner_id=new.owner_id;
  if category_kind is null then raise exception 'Category is unavailable in this workspace'; end if;
  if tg_table_name='finance_budgets' then
   if category_kind<>'expense' then raise exception 'Budgets require an expense category'; end if;
  elsif category_kind<>new.kind then raise exception 'Category must match transaction type';
  end if;
 end if;
 if tg_table_name='finance_transactions' then new.updated_at=now(); end if;
 return new;
end $$;
revoke all on function public.finance_validate_category() from public,anon,authenticated;
create trigger finance_transaction_category before insert or update on public.finance_transactions for each row execute function public.finance_validate_category();
create trigger finance_budget_category before insert or update on public.finance_budgets for each row execute function public.finance_validate_category();
-- Prevent semantic changes that would invalidate existing historical entries.
create function public.finance_protect_dimensions() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
 if tg_table_name='finance_workspaces' then
  if new.currency<>old.currency and exists(select 1 from public.finance_accounts where workspace_id=old.id) then
   raise exception 'Create a separate workspace for another currency';
  end if;
 elsif tg_table_name='finance_categories' then
  if new.kind<>old.kind then
   if exists(select 1 from public.finance_transactions where category_id=old.id)
    or exists(select 1 from public.finance_budgets where category_id=old.id) then
   raise exception 'Category type cannot change while in use';
   end if;
  end if;
 end if;
 return new;
end $$;
revoke all on function public.finance_protect_dimensions() from public,anon,authenticated;
create trigger finance_workspace_currency before update on public.finance_workspaces for each row execute function public.finance_protect_dimensions();
create trigger finance_category_kind before update on public.finance_categories for each row execute function public.finance_protect_dimensions();
