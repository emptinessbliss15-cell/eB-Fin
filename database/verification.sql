begin;
insert into auth.users(id,aud,role,email,created_at,updated_at) values
('11111111-0000-4000-8000-000000000001','authenticated','authenticated','finance-rls-a@example.invalid',now(),now()),
('11111111-0000-4000-8000-000000000002','authenticated','authenticated','finance-rls-b@example.invalid',now(),now());
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into public.finance_workspaces(id,name,kind) values ('22222222-0000-4000-8000-000000000001','Test A','personal');
insert into public.finance_accounts(id,workspace_id,name,kind) values
('33333333-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000001','Checking','checking'),
('33333333-0000-4000-8000-000000000002','22222222-0000-4000-8000-000000000001','Savings','savings');
insert into public.finance_categories(id,workspace_id,name,kind) values ('44444444-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000001','Food','expense');
insert into public.finance_transactions(workspace_id,account_id,category_id,date,payee,amount_cents,kind) values
('22222222-0000-4000-8000-000000000001','33333333-0000-4000-8000-000000000001','44444444-0000-4000-8000-000000000001','2026-09-17','Test',-100,'expense');
insert into public.finance_transactions(workspace_id,account_id,to_account_id,date,payee,amount_cents,kind) values
('22222222-0000-4000-8000-000000000001','33333333-0000-4000-8000-000000000001','33333333-0000-4000-8000-000000000002','2026-09-17','Transfer',-100,'transfer');
insert into public.finance_budgets(workspace_id,category_id,month,amount_cents) values
('22222222-0000-4000-8000-000000000001','44444444-0000-4000-8000-000000000001','2026-09-01',10000);
update public.finance_categories set name='Groceries' where id='44444444-0000-4000-8000-000000000001';
do $$
begin
 if (select count(*) from public.finance_transactions)<>2 then raise exception 'Owner read failed';end if;
 begin
 update public.finance_categories set kind='income' where id='44444444-0000-4000-8000-000000000001';
 raise exception 'Category protection failed';
 exception when raise_exception then if sqlerrm='Category protection failed' then raise;end if;end;
end $$;
select set_config('request.jwt.claims','{"sub":"11111111-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
begin
 if exists(select 1 from public.finance_workspaces) or exists(select 1 from public.finance_transactions) or exists(select 1 from public.finance_accounts) or exists(select 1 from public.finance_categories) or exists(select 1 from public.finance_budgets) then raise exception 'Cross-user data visible'; end if;
 begin
 insert into public.finance_accounts(workspace_id,name,kind) values ('22222222-0000-4000-8000-000000000001','Intruder','cash');
 raise exception 'Cross-user association allowed';
 exception when foreign_key_violation then null; end;
 begin
 insert into public.finance_workspaces(owner_id,name,kind) values ('11111111-0000-4000-8000-000000000001','Spoof','personal');
 raise exception 'Owner spoof allowed';
 exception when insufficient_privilege then null;end;
end $$;
select 'Owner CRUD, transfer, budgets, cross-user isolation and owner spoof tests passed' as result;
rollback;
