-- Esquema base de stocka2
create extension if not exists unaccent with schema extensions;

create or replace function public.normalize_name(text) returns text
language sql immutable parallel safe
set search_path = ''
as $$ select lower(extensions.unaccent('extensions.unaccent'::regdictionary, trim($1))) $$;

create table public.profiles (
  id uuid primary key references auth.users on delete restrict,
  display_name text not null,
  role text not null default 'user' check (role in ('admin','user')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('warehouse','vehicle')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index locations_name_key on public.locations (lower(name));

create table public.item_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true
);
create unique index item_types_name_key on public.item_types (lower(name));

create table public.items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type_id uuid not null references public.item_types,
  reference text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index items_active_name_key on public.items (public.normalize_name(name)) where active;

create table public.location_permissions (
  user_id uuid references public.profiles,
  location_id uuid references public.locations,
  primary key (user_id, location_id)
);

create table public.stock (
  item_id uuid references public.items,
  location_id uuid references public.locations,
  quantity integer not null default 0 check (quantity >= 0),
  primary key (item_id, location_id)
);

create table public.operations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('add','move','remove','consume')),
  origin_id uuid references public.locations,
  destination_id uuid references public.locations,
  reference text,
  notes text,
  user_id uuid not null references public.profiles,
  created_at timestamptz not null default now(),
  constraint operations_shape check (
    case kind
      when 'add' then origin_id is null and destination_id is not null
      when 'move' then origin_id is not null and destination_id is not null and origin_id <> destination_id
      else origin_id is not null and destination_id is null
    end
  ),
  constraint operations_reference_only_consume check (reference is null or kind = 'consume')
);

create table public.operation_lines (
  operation_id uuid references public.operations,
  item_id uuid references public.items,
  quantity integer not null check (quantity > 0),
  primary key (operation_id, item_id)
);

create index operations_created_at_idx on public.operations (created_at desc);
create index operations_origin_idx on public.operations (origin_id);
create index operations_destination_idx on public.operations (destination_id);
create index operations_user_idx on public.operations (user_id);
create index operation_lines_item_idx on public.operation_lines (item_id);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select p.role = 'admin' and p.active from public.profiles p where p.id = auth.uid()), false)
$$;

create or replace function public.can_operate(p_location_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select p.active and (
      p.role = 'admin'
      or exists (select 1 from public.location_permissions lp
                 where lp.user_id = p.id and lp.location_id = p_location_id)
    )
    from public.profiles p where p.id = auth.uid()
  ), false)
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
