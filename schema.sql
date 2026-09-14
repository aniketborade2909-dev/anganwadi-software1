-- Run this file in Supabase SQL Editor.
create extension if not exists "pgcrypto";

create table if not exists public.centers (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Anganwadi Center',
  created_at timestamptz not null default now()
);

create table if not exists public.center_members (
  center_id uuid not null references public.centers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'worker' check (role in ('admin', 'worker', 'parent')),
  created_at timestamptz not null default now(),
  primary key (center_id, user_id)
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete restrict,
  name text not null,
  age integer not null check (age between 1 and 10),
  caste text not null,
  religion text not null,
  mobile text not null,
  photo_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete restrict,
  attendance_date date not null,
  present_count integer not null check (present_count >= 0),
  created_at timestamptz not null default now(),
  unique (center_id, attendance_date)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete restrict,
  report_date date not null,
  student_count integer not null check (student_count >= 0),
  present_count integer not null check (present_count >= 0),
  food_kg numeric(10, 3) not null default 0 check (food_kg >= 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (center_id, report_date)
);

create table if not exists public.food_posts (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete restrict,
  snack_section text not null,
  photo_path text,
  note text,
  captured_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.centers enable row level security;
alter table public.center_members enable row level security;
alter table public.students enable row level security;
alter table public.attendance enable row level security;
alter table public.reports enable row level security;
alter table public.food_posts enable row level security;

create or replace function public.is_center_member(target_center uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.center_members
    where center_id = target_center and user_id = auth.uid()
  );
$$;

create policy "members can view their center" on public.centers for select using (public.is_center_member(id));
create policy "members can view membership" on public.center_members for select using (user_id = auth.uid());
create policy "members can view students" on public.students for select using (public.is_center_member(center_id));
create policy "workers can add students" on public.students for insert with check (public.is_center_member(center_id));
create policy "members can view attendance" on public.attendance for select using (public.is_center_member(center_id));
create policy "workers can add attendance" on public.attendance for insert with check (public.is_center_member(center_id));
create policy "members can view reports" on public.reports for select using (public.is_center_member(center_id));
create policy "workers can add reports" on public.reports for insert with check (public.is_center_member(center_id) and created_by = auth.uid());
create policy "members can view food posts" on public.food_posts for select using (public.is_center_member(center_id));
create policy "workers can add food posts" on public.food_posts for insert with check (public.is_center_member(center_id) and created_by = auth.uid());

insert into storage.buckets (id, name, public) values ('anganwadi-photos', 'anganwadi-photos', false)
on conflict (id) do nothing;

create policy "center members can view photos" on storage.objects for select to authenticated
using (bucket_id = 'anganwadi-photos');
create policy "authenticated users can upload photos" on storage.objects for insert to authenticated
with check (bucket_id = 'anganwadi-photos');
