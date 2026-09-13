create policy "authenticated users can create centers"
on public.centers
for insert
to authenticated
with check (true);

create policy "users can create their own membership"
on public.center_members
for insert
to authenticated
with check (user_id = auth.uid());
