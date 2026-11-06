-- Hat-Trick Barber Sport · banco do app (Supabase)
-- Como usar: Supabase → SQL Editor → New query → cole este arquivo inteiro → Run.
-- Horários são guardados em minutos desde 00:00 (540 = 09:00). Fuso: America/Sao_Paulo.

create extension if not exists btree_gist;

-- ============================================================
-- TABELAS
-- ============================================================
create table public.barbeiros (
  id text primary key,
  nome text not null,
  numero int not null default 10,
  esporte text not null default 'futebol' check (esporte in ('futebol', 'nba', 'f1')),
  posicao text not null default '',
  especialidade text not null default '',
  ordem int not null default 0,
  ativo boolean not null default true
);

create table public.servicos (
  id text primary key,
  nome text not null,
  descricao text not null default '',
  duracao int not null check (duracao between 5 and 480),
  preco numeric(8,2) not null check (preco >= 0),
  esporte text not null default 'futebol' check (esporte in ('futebol', 'nba', 'f1')),
  ordem int not null default 0,
  ativo boolean not null default true
);

-- expediente de cada barbeiro em cada dia da semana (0 = domingo ... 6 = sábado)
create table public.expedientes (
  barbeiro_id text not null references public.barbeiros(id) on delete cascade,
  dia_semana int not null check (dia_semana between 0 and 6),
  aberto boolean not null default true,
  abre int not null default 540,
  fecha int not null default 1140,
  almoco_ini int,
  almoco_fim int,
  primary key (barbeiro_id, dia_semana),
  check (abre >= 0 and fecha <= 1440 and abre < fecha),
  check ((almoco_ini is null) = (almoco_fim is null)),
  check (almoco_ini is null or (almoco_ini >= abre and almoco_fim <= fecha and almoco_ini < almoco_fim))
);

-- folgas, férias ou um período bloqueado num dia específico
create table public.bloqueios (
  id uuid primary key default gen_random_uuid(),
  barbeiro_id text not null references public.barbeiros(id) on delete cascade,
  data date not null,
  ini int not null default 0,
  fim int not null default 1440,
  motivo text not null default '' check (length(motivo) <= 60),
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  check (ini >= 0 and fim <= 1440 and ini < fim)
);

create table public.perfis (
  id uuid primary key references auth.users on delete cascade,
  nome text not null default '' check (length(nome) <= 60),
  telefone text not null default '' check (telefone ~ '^[0-9]{0,13}$'),
  papel text not null default 'cliente' check (papel in ('cliente', 'barbeiro', 'dono')),
  barbeiro_id text references public.barbeiros(id) on delete set null,
  time_id text check (length(time_id) <= 30),
  criado_em timestamptz not null default now()
);

create table public.agendamentos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  barbeiro_id text not null references public.barbeiros(id),
  servico_id text not null references public.servicos(id),
  data date not null,
  ini int not null check (ini >= 0 and ini < 1440),
  dur int not null check (dur between 5 and 480),
  cliente_id uuid references auth.users on delete set null,
  nome text not null check (length(nome) between 2 and 60),
  telefone text not null default '' check (telefone ~ '^[0-9]{0,13}$'),
  origem text not null default 'app' check (origem in ('app', 'whatsapp', 'telefone', 'balcao')),
  obs text not null default '' check (length(obs) <= 120),
  status text not null default 'confirmado' check (status in ('confirmado', 'atendido', 'faltou', 'cancelado')),
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  -- o banco recusa dois horários sobrepostos do mesmo barbeiro (exceto cancelados)
  constraint sem_conflito exclude using gist (
    barbeiro_id with =, data with =, int4range(ini, ini + dur) with &&
  ) where (status <> 'cancelado')
);
create index on public.agendamentos (data, barbeiro_id);
create index on public.agendamentos (cliente_id);
create index on public.bloqueios (data, barbeiro_id);

-- ============================================================
-- QUEM É QUEM
-- ============================================================
create or replace function public.meu_papel() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select papel from perfis where id = auth.uid()), 'anon')
$$;

create or replace function public.meu_barbeiro() returns text
language sql stable security definer set search_path = public as $$
  select barbeiro_id from perfis where id = auth.uid()
$$;

-- dono gere tudo; barbeiro gere só a própria agenda
create or replace function public.pode_gerir(b text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.meu_papel() = 'dono' or (public.meu_papel() = 'barbeiro' and public.meu_barbeiro() = b)
$$;

-- todo cadastro novo vira cliente
create or replace function public.novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfis (id, nome, telefone)
  values (new.id,
          left(coalesce(new.raw_user_meta_data->>'nome', ''), 60),
          left(regexp_replace(coalesce(new.raw_user_meta_data->>'telefone', ''), '\D', '', 'g'), 13));
  return new;
end $$;
create trigger ao_criar_usuario after insert on auth.users for each row execute function public.novo_usuario();

-- ============================================================
-- SEGURANÇA (RLS)
-- ============================================================
alter table public.barbeiros enable row level security;
alter table public.servicos enable row level security;
alter table public.expedientes enable row level security;
alter table public.bloqueios enable row level security;
alter table public.perfis enable row level security;
alter table public.agendamentos enable row level security;

-- público pode ver barbeiros, serviços, expedientes e bloqueios (para calcular horários livres)
create policy "ver barbeiros" on public.barbeiros for select using (true);
create policy "ver servicos" on public.servicos for select using (true);
create policy "ver expedientes" on public.expedientes for select using (true);
create policy "ver bloqueios" on public.bloqueios for select using (true);

create policy "dono edita barbeiros" on public.barbeiros for all using (public.meu_papel() = 'dono') with check (public.meu_papel() = 'dono');
create policy "barbeiro edita o proprio cartao" on public.barbeiros for update using (public.pode_gerir(id)) with check (public.pode_gerir(id));
create policy "dono edita servicos" on public.servicos for all using (public.meu_papel() = 'dono') with check (public.meu_papel() = 'dono');
create policy "gerir expediente" on public.expedientes for all using (public.pode_gerir(barbeiro_id)) with check (public.pode_gerir(barbeiro_id));
create policy "gerir bloqueios" on public.bloqueios for all using (public.pode_gerir(barbeiro_id)) with check (public.pode_gerir(barbeiro_id));

-- perfil: cada um vê e edita o seu (sem poder mudar o próprio papel); dono vê todos
create policy "ver perfil" on public.perfis for select using (id = auth.uid() or public.meu_papel() = 'dono');
create policy "editar perfil" on public.perfis for update using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.perfis from authenticated, anon;
grant update (nome, telefone, time_id) on public.perfis to authenticated;

-- agendamentos: cliente vê os seus; barbeiro vê os dele; dono vê todos.
-- Criar, cancelar e mudar status só pelas funções abaixo (que conferem tudo).
create policy "ver agendamentos" on public.agendamentos for select
  using (cliente_id = auth.uid() or public.pode_gerir(barbeiro_id));

-- ============================================================
-- FUNÇÕES (RPC)
-- ============================================================

-- horários ocupados, sem nome nem telefone (o app do cliente usa para mostrar o que está livre)
create or replace function public.ocupacao(de date, ate date)
returns table (barbeiro_id text, data date, ini int, dur int)
language sql stable security definer set search_path = public as $$
  select a.barbeiro_id, a.data, a.ini, a.dur from agendamentos a
  where a.status <> 'cancelado' and a.data between de and least(ate, de + 62)
$$;

create or replace function public.agendar(
  p_barbeiro text, p_servico text, p_data date, p_ini int,
  p_nome text, p_telefone text default '', p_origem text default 'app', p_obs text default ''
) returns public.agendamentos
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_papel text := public.meu_papel();
  v_dur int;
  v_exp expedientes;
  v_agora timestamp := now() at time zone 'America/Sao_Paulo';
  v_fim int;
  v_codigo text;
  v_novo agendamentos;
  v_cliente uuid;
  v_origem text := p_origem;
  letras text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if v_uid is null then raise exception 'login_necessario'; end if;
  if v_papel in ('barbeiro', 'dono') then
    if not public.pode_gerir(p_barbeiro) then raise exception 'sem_permissao'; end if;
    if v_origem not in ('app', 'whatsapp', 'telefone', 'balcao') then v_origem := 'balcao'; end if;
    v_cliente := null;
  else
    v_origem := 'app';
    v_cliente := v_uid;
    if (select count(*) from agendamentos where cliente_id = v_uid and status = 'confirmado'
          and (data > v_agora::date or (data = v_agora::date and ini >= extract(hour from v_agora) * 60 + extract(minute from v_agora)))) >= 3 then
      raise exception 'limite_de_horarios';
    end if;
  end if;

  select duracao into v_dur from servicos where id = p_servico and ativo;
  if v_dur is null then raise exception 'servico_invalido'; end if;
  v_fim := p_ini + v_dur;

  if p_data < v_agora::date or p_data > v_agora::date + 60 then raise exception 'data_invalida'; end if;
  if p_data = v_agora::date and v_papel = 'cliente'
     and p_ini < extract(hour from v_agora) * 60 + extract(minute from v_agora) + 30 then
    raise exception 'muito_em_cima';
  end if;

  select * into v_exp from expedientes where barbeiro_id = p_barbeiro and dia_semana = extract(dow from p_data)::int;
  if not found or not v_exp.aberto or not exists (select 1 from barbeiros where id = p_barbeiro and ativo) then
    raise exception 'barbeiro_nao_atende';
  end if;
  if p_ini < v_exp.abre or v_fim > v_exp.fecha then raise exception 'fora_do_expediente'; end if;
  if v_exp.almoco_ini is not null and p_ini < v_exp.almoco_fim and v_exp.almoco_ini < v_fim then
    raise exception 'horario_de_almoco';
  end if;
  if exists (select 1 from bloqueios b where b.barbeiro_id = p_barbeiro and b.data = p_data and p_ini < b.fim and b.ini < v_fim) then
    raise exception 'horario_bloqueado';
  end if;

  loop
    v_codigo := 'HT-';
    for i in 1..4 loop v_codigo := v_codigo || substr(letras, 1 + floor(random() * length(letras))::int, 1); end loop;
    exit when not exists (select 1 from agendamentos where codigo = v_codigo);
  end loop;

  begin
    insert into agendamentos (codigo, barbeiro_id, servico_id, data, ini, dur, cliente_id, nome, telefone, origem, obs, criado_por)
    values (v_codigo, p_barbeiro, p_servico, p_data, p_ini, v_dur, v_cliente,
            left(trim(p_nome), 60), left(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), 13),
            v_origem, left(trim(coalesce(p_obs, '')), 120), v_uid)
    returning * into v_novo;
  exception when exclusion_violation then
    raise exception 'ocupado';
  end;
  return v_novo;
end $$;

-- cliente cancela o próprio horário (se ainda não passou); barbeiro/dono cancelam os que gerem
create or replace function public.cancelar(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a agendamentos; v_agora timestamp := now() at time zone 'America/Sao_Paulo';
begin
  select * into a from agendamentos where id = p_id;
  if not found then raise exception 'nao_encontrado'; end if;
  if not (public.pode_gerir(a.barbeiro_id) or (a.cliente_id = auth.uid() and a.status = 'confirmado'
          and (a.data + make_interval(mins => a.ini)) > v_agora)) then
    raise exception 'sem_permissao';
  end if;
  update agendamentos set status = 'cancelado', atualizado_em = now() where id = p_id;
end $$;

create or replace function public.definir_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare a agendamentos;
begin
  select * into a from agendamentos where id = p_id;
  if not found then raise exception 'nao_encontrado'; end if;
  if not public.pode_gerir(a.barbeiro_id) then raise exception 'sem_permissao'; end if;
  if p_status not in ('confirmado', 'atendido', 'faltou', 'cancelado') then raise exception 'status_invalido'; end if;
  begin
    update agendamentos set status = p_status, atualizado_em = now() where id = p_id;
  exception when exclusion_violation then
    raise exception 'ocupado'; -- reativar um cancelado num horário que já foi ocupado
  end;
end $$;

-- dono liga a conta (e-mail) de alguém a um barbeiro, ou devolve para cliente
create or replace function public.definir_equipe(p_email text, p_papel text, p_barbeiro text default null) returns void
language plpgsql security definer set search_path = public, auth as $$
declare v_id uuid;
begin
  if public.meu_papel() <> 'dono' then raise exception 'sem_permissao'; end if;
  if p_papel not in ('cliente', 'barbeiro', 'dono') then raise exception 'papel_invalido'; end if;
  if p_papel = 'barbeiro' and not exists (select 1 from public.barbeiros where id = p_barbeiro) then raise exception 'barbeiro_invalido'; end if;
  select id into v_id from auth.users where lower(email) = lower(trim(p_email));
  if v_id is null then raise exception 'email_nao_cadastrado'; end if;
  if v_id = auth.uid() and p_papel <> 'dono' then raise exception 'nao_pode_rebaixar_a_si'; end if;
  update public.perfis set papel = p_papel, barbeiro_id = case when p_papel = 'barbeiro' then p_barbeiro end where id = v_id;
end $$;

-- lista da equipe para o dono
create or replace function public.equipe() returns table (email text, nome text, papel text, barbeiro_id text)
language sql stable security definer set search_path = public, auth as $$
  select u.email::text, p.nome, p.papel, p.barbeiro_id from public.perfis p join auth.users u on u.id = p.id
  where public.meu_papel() = 'dono' and p.papel in ('barbeiro', 'dono') order by p.papel desc, p.nome
$$;

-- LGPD: o cliente apaga a própria conta. Os horários ficam para o caixa da barbearia, mas sem nome e telefone.
create or replace function public.apagar_minha_conta() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'login_necessario'; end if;
  update public.agendamentos set nome = 'Cliente removido', telefone = '', obs = ''
    where cliente_id = auth.uid();
  update public.agendamentos set status = 'cancelado', atualizado_em = now()
    where cliente_id = auth.uid() and status = 'confirmado' and data >= (now() at time zone 'America/Sao_Paulo')::date;
  delete from auth.users where id = auth.uid();
end $$;

-- só pelo SQL Editor (uma vez): torna dono a conta do proprietário
create or replace function public.tornar_dono(p_email text) returns text
language plpgsql security definer set search_path = public, auth as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(trim(p_email));
  if v_id is null then return 'Esse e-mail ainda não criou conta no app.'; end if;
  update public.perfis set papel = 'dono', barbeiro_id = null where id = v_id;
  return 'Pronto: ' || p_email || ' agora é dono.';
end $$;

revoke execute on function public.tornar_dono(text) from public, anon, authenticated;
revoke execute on function public.agendar(text, text, date, int, text, text, text, text) from public, anon;
revoke execute on function public.cancelar(uuid) from public, anon;
revoke execute on function public.definir_status(uuid, text) from public, anon;
revoke execute on function public.definir_equipe(text, text, text) from public, anon;
revoke execute on function public.equipe() from public, anon;
revoke execute on function public.apagar_minha_conta() from public, anon;
grant execute on function public.apagar_minha_conta() to authenticated;
revoke execute on function public.novo_usuario() from public, anon, authenticated;
grant execute on function public.ocupacao(date, date) to anon, authenticated;
grant execute on function public.agendar(text, text, date, int, text, text, text, text) to authenticated;
grant execute on function public.cancelar(uuid) to authenticated;
grant execute on function public.definir_status(uuid, text) to authenticated;
grant execute on function public.definir_equipe(text, text, text) to authenticated;
grant execute on function public.equipe() to authenticated;

-- painel atualiza ao vivo quando entra um horário novo
alter publication supabase_realtime add table public.agendamentos;

-- ============================================================
-- DADOS INICIAIS (exemplo: troque pelos reais no painel ou aqui)
-- ============================================================
insert into public.barbeiros (id, nome, numero, esporte, posicao, especialidade, ordem) values
  ('b1', 'Barbeiro 1', 10, 'futebol', 'Meia-armador', 'Degradê e corte social', 1),
  ('b2', 'Barbeiro 2', 23, 'nba', 'Pivô', 'Barba e navalha', 2),
  ('b3', 'Barbeiro 3', 44, 'f1', 'Piloto', 'Máquina, freestyle e pezinho', 3);

insert into public.servicos (id, nome, descricao, duracao, preco, esporte, ordem) values
  ('corte', 'Corte Camisa 10', 'Corte clássico, tesoura e máquina', 30, 45, 'futebol', 1),
  ('degrade', 'Degradê Pit Stop', 'Degradê navalhado, acabamento rápido', 40, 50, 'f1', 2),
  ('barba', 'Barba MVP', 'Barba com toalha quente e navalha', 30, 35, 'nba', 3),
  ('combo', 'Combo Hat-Trick', 'Corte + barba + sobrancelha', 70, 85, 'futebol', 4),
  ('infantil', 'Corte Categoria de Base', 'Até 12 anos', 30, 35, 'futebol', 5),
  ('pezinho', 'Pezinho Volta Rápida', 'Acabamento entre um corte e outro', 15, 15, 'f1', 6),
  ('sobrancelha', 'Sobrancelha Cesta de 3', 'Na navalha ou pinça', 15, 15, 'nba', 7);

-- terça a sexta 09–19 (qui/sex até 20) com almoço 12–13; sábado 08–17; domingo e segunda fechado
insert into public.expedientes (barbeiro_id, dia_semana, aberto, abre, fecha, almoco_ini, almoco_fim)
select b.id, d.dia,
       d.aberto and not (b.id = 'b2' and d.dia = 3) and not (b.id = 'b3' and d.dia = 6),
       d.abre, d.fecha, d.almoco_ini, d.almoco_fim
from public.barbeiros b cross join (values
  (0, false, 540, 1140, null::int, null::int),
  (1, false, 540, 1140, null, null),
  (2, true, 540, 1140, 720, 780),
  (3, true, 540, 1140, 720, 780),
  (4, true, 540, 1200, 720, 780),
  (5, true, 540, 1200, 720, 780),
  (6, true, 480, 1020, null, null)
) as d(dia, aberto, abre, fecha, almoco_ini, almoco_fim);
