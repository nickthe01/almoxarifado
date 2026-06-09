-- Tabela principal
create table if not exists almox_items (
  id         bigserial primary key,
  name       text      not null,
  status     text      not null default 'cheio'
                       check (status in ('cheio', 'metade', 'baixo', 'vazio')),
  position   integer   not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Habilitar Row Level Security
alter table almox_items enable row level security;

-- Permitir acesso total para usuários anônimos (ferramenta interna do colégio)
create policy "acesso_publico" on almox_items
  for all to anon
  using (true)
  with check (true);

-- Habilitar Realtime
alter publication supabase_realtime add table almox_items;

-- Trigger: atualiza updated_at automaticamente
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger almox_items_updated_at
  before update on almox_items
  for each row execute function set_updated_at();

-- Dados iniciais
insert into almox_items (name, status, position) values
  ('Cartolina',           'cheio', 0),
  ('Massinha',            'cheio', 1),
  ('Glitter',             'cheio', 2),
  ('Lantejola',           'cheio', 3),
  ('Fita de PVC grossa',  'cheio', 4),
  ('Color set A3',        'cheio', 5),
  ('Argilinha',           'cheio', 6),
  ('Papel microondulado', 'cheio', 7),
  ('Papel cartão',        'cheio', 8),
  ('Papel contact',       'cheio', 9);
