-- Run this in your Supabase SQL editor

create table thoughts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  content text not null,
  has_notebook_photo boolean default false
);

create table shadows (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  behavior text not null,
  trigger text,
  duration_min integer
);

create table photos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  url text not null,
  type text default 'notebook',
  linked_thought_id uuid references thoughts(id) on delete set null
);

-- Storage bucket (create in Supabase dashboard → Storage → New bucket)
-- Bucket name: shadow-photos
-- Set to PUBLIC if you want Hermes agent to read photos without auth
