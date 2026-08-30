-- VedaAI durable JobStore — Supabase DB (optional but recommended for atomic queue)
-- If Supabase is used via Storage only, this migration is not required (fallback to storage).
-- For production with remote worker, apply this migration for atomic claim.

-- Jobs table: stores full ProcessingJob jsonb + indexed columns for polling
create table if not exists jobs (
  id text primary key,
  data jsonb not null,
  status text not null,
  current_stage text not null,
  heartbeat_at timestamptz,
  claimed_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists jobs_status_idx on jobs(status);
create index if not exists jobs_heartbeat_idx on jobs(heartbeat_at);
create index if not exists jobs_created_at_idx on jobs(created_at);

-- Documents per job
create table if not exists documents (
  id text primary key,
  job_id text not null references jobs(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz default now()
);
create index if not exists documents_job_id_idx on documents(job_id);

-- Pages per document/job
create table if not exists pages (
  id text primary key,
  document_id text not null,
  job_id text references jobs(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz default now()
);
create index if not exists pages_document_id_idx on pages(document_id);
create index if not exists pages_job_id_idx on pages(job_id);

-- Results (final mapping)
create table if not exists results (
  job_id text primary key references jobs(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS: service_role bypasses, anon has no access (jobs accessed via service_role only)
alter table jobs enable row level security;
alter table documents enable row level security;
alter table pages enable row level security;
alter table results enable row level security;

-- Service role can do everything (bypass RLS via service_role key, but add policies for completeness)
do $$ begin
  if not exists (select 1 from pg_policies where policyname='service_all_jobs') then
    create policy service_all_jobs on jobs for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname='service_all_documents') then
    create policy service_all_documents on documents for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname='service_all_pages') then
    create policy service_all_pages on pages for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname='service_all_results') then
    create policy service_all_results on results for all using (true) with check (true);
  end if;
end $$;

-- Storage bucket for durable files (if not exists, create via dashboard or via SQL)
-- Use `assessment-inputs` bucket (already exists) with prefix __durable__/
-- If you prefer separate bucket, uncomment:
-- insert into storage.buckets (id, name, public) values ('veda-jobs','veda-jobs', false) on conflict (id) do nothing;
