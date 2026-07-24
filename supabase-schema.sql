-- =========================================================
-- CUADERNO DE BITÁCORA — esquema para Supabase
-- Pega este archivo entero en: Supabase > SQL Editor > New query > Run
-- =========================================================

-- 1) PERFILES (un perfil por usuario, con rol)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text,
  rol text not null default 'tripulacion' check (rol in ('admin','capitan','tripulacion')),
  created_at timestamptz default now()
);

-- Crea automáticamente un perfil cuando alguien se registra
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, nombre, rol)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email,'@',1)), 'tripulacion');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Evita que un usuario normal se auto-ascienda a capitán/admin
create or replace function public.prevent_self_role_escalation()
returns trigger as $$
begin
  if new.rol is distinct from old.rol then
    if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.rol in ('admin','capitan')) then
      new.rol := old.rol;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_prevent_self_role_escalation on public.profiles;
create trigger trg_prevent_self_role_escalation
  before update on public.profiles
  for each row execute function public.prevent_self_role_escalation();

-- 2) DATOS DE LA EMBARCACIÓN (fila única de configuración)
create table if not exists public.embarcacion (
  id int primary key default 1,
  nombre text default 'Mi Barco',
  horas_revision_motor int default 100,
  updated_at timestamptz default now()
);
insert into public.embarcacion (id, nombre) values (1, 'Mi Barco')
  on conflict (id) do nothing;

-- 3) CLIENTES
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- 4) VIAJES (bitácora)
create table if not exists public.viajes (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  cliente_id uuid references public.clientes(id) on delete set null,
  motivo text,
  motor_ini numeric,
  motor_fin numeric,
  gen_ini numeric,
  gen_fin numeric,
  comb_ini numeric,
  comb_fin numeric,
  precio_litro numeric,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- =========================================================
-- SEGURIDAD (Row Level Security)
-- Regla general: cualquier usuario autenticado (tripulación incluida)
-- puede ver y crear. Solo capitán/admin puede borrar viajes y
-- editar el nombre de la embarcación o los roles de otros usuarios.
-- =========================================================

alter table public.profiles enable row level security;
alter table public.clientes enable row level security;
alter table public.viajes enable row level security;
alter table public.embarcacion enable row level security;

-- Perfiles
drop policy if exists "ver perfiles" on public.profiles;
create policy "ver perfiles" on public.profiles
  for select using (auth.role() = 'authenticated');

drop policy if exists "editar mi perfil" on public.profiles;
create policy "editar mi perfil" on public.profiles
  for update using (auth.uid() = id);

drop policy if exists "capitan/admin editan cualquier perfil" on public.profiles;
create policy "capitan/admin editan cualquier perfil" on public.profiles
  for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.rol in ('admin','capitan'))
  );

-- Clientes
drop policy if exists "ver clientes" on public.clientes;
create policy "ver clientes" on public.clientes
  for select using (auth.role() = 'authenticated');

drop policy if exists "crear clientes" on public.clientes;
create policy "crear clientes" on public.clientes
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "borrar clientes" on public.clientes;
create policy "borrar clientes" on public.clientes
  for delete using (auth.role() = 'authenticated');

-- Viajes
drop policy if exists "ver viajes" on public.viajes;
create policy "ver viajes" on public.viajes
  for select using (auth.role() = 'authenticated');

drop policy if exists "crear viajes" on public.viajes;
create policy "crear viajes" on public.viajes
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "editar viajes" on public.viajes;
create policy "editar viajes" on public.viajes
  for update using (auth.role() = 'authenticated');

drop policy if exists "borrar viajes solo capitan/admin" on public.viajes;
create policy "borrar viajes solo capitan/admin" on public.viajes
  for delete using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.rol in ('admin','capitan'))
  );

-- Embarcación
drop policy if exists "ver embarcacion" on public.embarcacion;
create policy "ver embarcacion" on public.embarcacion
  for select using (auth.role() = 'authenticated');

drop policy if exists "editar embarcacion solo capitan/admin" on public.embarcacion;
create policy "editar embarcacion solo capitan/admin" on public.embarcacion
  for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.rol in ('admin','capitan'))
  );

-- =========================================================
-- Fin del script. Siguiente paso: Authentication > Providers > Email
-- y (opcional) desactivar "Confirm email" para pruebas rápidas.
-- =========================================================
