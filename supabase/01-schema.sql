-- Southern Cart Co. — run in a NEW Supabase project SQL Editor (not E-Z Rent To Own).
-- All permissions default closed. Site cannot charge cards or create paid orders.
create extension if not exists pgcrypto;

create table if not exists public.staff_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','support')),
  created_at timestamptz not null default now()
);

create or replace function public.is_store_staff() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.staff_roles where user_id=auth.uid() and role in ('admin','support'));
$$;
create or replace function public.is_store_admin() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.staff_roles where user_id=auth.uid() and role='admin');
$$;
revoke all on function public.is_store_staff() from public;
revoke all on function public.is_store_admin() from public;
grant execute on function public.is_store_staff() to authenticated;
grant execute on function public.is_store_admin() to authenticated;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 300),
  name_es text not null default '',
  description text not null default '',
  description_es text not null default '',
  image_url text not null,
  category text not null,
  price numeric(12,2) not null check (price>0),
  compare_at numeric(12,2) not null default 0,
  featured boolean not null default false,
  active boolean not null default false,
  created_at timestamptz not null default now()
);
-- Supplier costs and SKU must not be readable by customers.
create table if not exists public.product_supplier_details (
 product_id uuid primary key references public.products(id) on delete cascade,
 cost numeric(12,2) not null default 0,
 sku text not null default ''
);

-- View intentionally reveals only public product columns for active listings.
create or replace view public.public_products as
 select id,name,name_es,description,description_es,image_url,category,price,compare_at,featured,active,created_at
 from public.products where active=true;
revoke all on public.public_products from public;
grant select on public.public_products to anon,authenticated;

create table if not exists public.tickets (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references auth.users(id) on delete cascade,
 subject text not null check (length(subject) between 1 and 120),
 description text not null check (length(description) between 1 and 10000),
 category text not null default 'Other',
 status text not null default 'open' check (status in ('open','pending','closed')),
 created_at timestamptz not null default now()
);
create table if not exists public.ticket_messages (
 id uuid primary key default gen_random_uuid(),
 ticket_id uuid not null references public.tickets(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete cascade,
 body text not null check (length(body) between 1 and 10000),
 created_at timestamptz not null default now()
);

-- Orders are read-only in the browser; a verified future payment webhook will create them.
create table if not exists public.orders (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references auth.users(id) on delete cascade,
 payment_status text not null default 'pending' check (payment_status in ('pending','paid','refunded','failed')),
 fulfillment_status text not null default 'unfulfilled',
 subtotal numeric(12,2) not null default 0,
 shipping_amount numeric(12,2) not null default 0,
 tax_amount numeric(12,2) not null default 0,
 supplier_cost numeric(12,2) not null default 0,
 processor_fees numeric(12,2) not null default 0,
 refund_amount numeric(12,2) not null default 0,
 total numeric(12,2) not null default 0,
 created_at timestamptz not null default now()
);

alter table public.staff_roles enable row level security;
alter table public.products enable row level security;
alter table public.product_supplier_details enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_messages enable row level security;
alter table public.orders enable row level security;

revoke all on public.products from anon,authenticated;
grant select,insert,update,delete on public.products to authenticated;
revoke all on public.product_supplier_details from anon,authenticated;
grant select,insert,update,delete on public.product_supplier_details to authenticated;
revoke all on public.staff_roles from anon,authenticated;
grant select on public.staff_roles to authenticated;
revoke all on public.tickets from anon,authenticated;
grant select,insert,update on public.tickets to authenticated;
revoke all on public.ticket_messages from anon,authenticated;
grant select,insert on public.ticket_messages to authenticated;
revoke all on public.orders from anon,authenticated;
grant select on public.orders to authenticated;

create policy "my staff status" on public.staff_roles for select to authenticated using (user_id=auth.uid());
create policy "admin selects products" on public.products for select to authenticated using (public.is_store_admin());
create policy "admin creates products" on public.products for insert to authenticated with check (public.is_store_admin());
create policy "admin edits products" on public.products for update to authenticated using (public.is_store_admin()) with check (public.is_store_admin());
create policy "admin deletes products" on public.products for delete to authenticated using (public.is_store_admin());
create policy "admin supplier select" on public.product_supplier_details for select to authenticated using (public.is_store_admin());
create policy "admin supplier add" on public.product_supplier_details for insert to authenticated with check (public.is_store_admin());
create policy "admin supplier update" on public.product_supplier_details for update to authenticated using (public.is_store_admin()) with check (public.is_store_admin());
create policy "admin supplier delete" on public.product_supplier_details for delete to authenticated using (public.is_store_admin());
create policy "read own or staff tickets" on public.tickets for select to authenticated using(customer_id=auth.uid() or public.is_store_staff());
create policy "open own ticket" on public.tickets for insert to authenticated with check(customer_id=auth.uid() and status='open');
-- Status-only updates enforced by database trigger below.
create policy "staff update tickets" on public.tickets for update to authenticated using(public.is_store_staff()) with check(public.is_store_staff());
create policy "read ticket thread" on public.ticket_messages for select to authenticated using(
 exists(select 1 from public.tickets t where t.id=ticket_id and (t.customer_id=auth.uid() or public.is_store_staff()))
);
create policy "reply to own or staff ticket" on public.ticket_messages for insert to authenticated with check(
 sender_id=auth.uid() and exists(select 1 from public.tickets t where t.id=ticket_id and (t.customer_id=auth.uid() or public.is_store_staff()))
);
create policy "read own or staff orders" on public.orders for select to authenticated using(customer_id=auth.uid() or public.is_store_admin());

-- Prevent a compromised staff browser from changing ticket owner/subject or description.
create or replace function public.tickets_staff_update_guard() returns trigger language plpgsql set search_path = '' as $$
begin
 if new.customer_id is distinct from old.customer_id or new.subject is distinct from old.subject
 or new.description is distinct from old.description or new.category is distinct from old.category
 or new.created_at is distinct from old.created_at then
  raise exception 'Only ticket status can be updated';
 end if;
 return new;
end;$$;
drop trigger if exists guard_ticket_updates on public.tickets;
create trigger guard_ticket_updates before update on public.tickets for each row execute function public.tickets_staff_update_guard();

-- SET ADMIN AFTER creating the user in Authentication > Users.
-- Replace the email below ONLY in Supabase SQL Editor, NOT in frontend code.
-- insert into public.staff_roles (user_id, role)
-- select id, 'admin' from auth.users where lower(email)=lower('YOUR_EMAIL@example.com')
-- on conflict (user_id) do update set role='admin';
