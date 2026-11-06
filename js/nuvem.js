// Ligação com o Supabase (login + agenda compartilhada).
// Fica desligado enquanto CONFIG.supabase.url / chave estiverem vazios: o app roda em modo demonstração.
const Nuvem = (() => {
  const cfg = CONFIG.supabase || {};
  const ativo = !!(cfg.url && cfg.chave && window.supabase);
  const sb = ativo ? window.supabase.createClient(cfg.url, cfg.chave, { auth: { persistSession: true, storageKey: "hattrick-auth" } }) : null;

  const api = { ativo, sb, usuario: null, perfil: null, equipe: false, dono: false };

  const ERROS = {
    login_necessario: "Entre na sua conta para marcar.",
    ocupado: "Esse horário acabou de ser ocupado. Escolha outro.",
    limite_de_horarios: "Você já tem 3 horários marcados. Cancele um para marcar outro.",
    muito_em_cima: "Esse horário está muito em cima. Escolha um com pelo menos 30 minutos de antecedência.",
    horario_bloqueado: "O barbeiro bloqueou esse horário.",
    horario_de_almoco: "Esse horário cai no almoço do barbeiro.",
    fora_do_expediente: "Esse horário está fora do expediente do barbeiro.",
    barbeiro_nao_atende: "O barbeiro não atende nesse dia.",
    data_invalida: "Escolha uma data a partir de hoje (até 60 dias).",
    sem_permissao: "Sua conta não tem permissão para isso.",
    email_nao_cadastrado: "Esse e-mail ainda não criou conta no app.",
    nao_pode_rebaixar_a_si: "Você não pode tirar o seu próprio acesso de dono.",
    "Invalid login credentials": "E-mail ou senha errados.",
    "Email not confirmed": "Confirme seu e-mail: mandamos um link para a sua caixa de entrada.",
    "User already registered": "Esse e-mail já tem conta. Use “Entrar”.",
  };
  function traduz(e) {
    const msg = e?.message || String(e || "");
    for (const [k, v] of Object.entries(ERROS)) if (msg.includes(k)) return v;
    if (/password/i.test(msg) && /6|8|characters/i.test(msg)) return "A senha precisa ter pelo menos 8 caracteres.";
    if (/rate limit|too many/i.test(msg)) return "Muitas tentativas seguidas. Espere um minuto e tente de novo.";
    if (/fetch|network/i.test(msg)) return "Sem conexão. Confira a internet e tente de novo.";
    return "Algo deu errado. Tente de novo.";
  }
  const falha = (e) => ({ ok: false, motivo: e?.message, mensagem: traduz(e) });

  const deLinha = (r) => ({ id: r.id, codigo: r.codigo, barbeiroId: r.barbeiro_id, servicoId: r.servico_id, data: r.data,
    ini: r.ini, dur: r.dur, nome: r.nome, telefone: r.telefone || "", origem: r.origem, obs: r.obs || "", status: r.status, clienteId: r.cliente_id });
  const deBloqueio = (r) => ({ id: r.id, barbeiroId: r.barbeiro_id, data: r.data, ini: r.ini, fim: r.fim, motivo: r.motivo || "" });
  const hojeK = () => Agenda.chaveDia(new Date());

  // ---------- sessão ----------
  async function carregarPerfil() {
    api.perfil = null; api.equipe = false; api.dono = false;
    if (!api.usuario) return;
    const { data } = await sb.from("perfis").select("*").eq("id", api.usuario.id).maybeSingle();
    api.perfil = data ? { nome: data.nome, telefone: data.telefone, papel: data.papel, barbeiroId: data.barbeiro_id, timeId: data.time_id } : null;
    api.equipe = ["barbeiro", "dono"].includes(api.perfil?.papel);
    api.dono = api.perfil?.papel === "dono";
  }
  api.iniciarSessao = async () => {
    if (!ativo) return;
    const { data } = await sb.auth.getSession();
    api.usuario = data.session?.user || null;
    await carregarPerfil();
  };
  api.aoMudarSessao = (cb) => ativo && sb.auth.onAuthStateChange(async (evento, sessao) => {
    api.usuario = sessao?.user || null;
    // espera o próximo ciclo: chamar o Supabase dentro deste callback trava a sessão
    setTimeout(async () => { await carregarPerfil(); cb(evento); }, 0);
  });

  const urlVolta = () => location.origin + location.pathname;
  api.entrar = async (email, senha) => {
    const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error) return falha(error);
    api.usuario = data.user; await carregarPerfil();
    return { ok: true };
  };
  api.cadastrar = async ({ nome, telefone, email, senha }) => {
    const { data, error } = await sb.auth.signUp({ email: email.trim(), password: senha,
      options: { data: { nome: nome.trim(), telefone: Agenda.soDigitos(telefone) }, emailRedirectTo: urlVolta() } });
    if (error) return falha(error);
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) return falha({ message: "User already registered" });
    if (!data.session) return { ok: true, confirmar: true }; // o projeto pede confirmação de e-mail
    api.usuario = data.user; await carregarPerfil();
    return { ok: true };
  };
  api.sair = async () => { await sb.auth.signOut(); api.usuario = null; await carregarPerfil(); };
  api.recuperarSenha = async (email) => {
    const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: urlVolta() });
    return error ? falha(error) : { ok: true };
  };
  api.novaSenha = async (senha) => {
    const { error } = await sb.auth.updateUser({ password: senha });
    return error ? falha(error) : { ok: true };
  };
  api.salvarPerfil = async ({ nome, telefone, timeId }) => {
    const campos = {};
    if (nome != null) campos.nome = nome.trim().slice(0, 60);
    if (telefone != null) campos.telefone = Agenda.soDigitos(telefone).slice(0, 13);
    if (timeId !== undefined) campos.time_id = timeId;
    const { error } = await sb.from("perfis").update(campos).eq("id", api.usuario.id);
    if (error) return falha(error);
    Object.assign(api.perfil, { ...(campos.nome != null && { nome: campos.nome }), ...(campos.telefone != null && { telefone: campos.telefone }), ...(timeId !== undefined && { timeId }) });
    return { ok: true };
  };
  api.apagarConta = async () => {
    const { error } = await sb.rpc("apagar_minha_conta");
    if (error) return falha(error);
    await sb.auth.signOut(); api.usuario = null; await carregarPerfil();
    return { ok: true };
  };

  // ---------- base: barbeiros, serviços, expedientes, bloqueios ----------
  api.carregarBase = async () => {
    const [b, s, e, bl] = await Promise.all([
      sb.from("barbeiros").select("*").eq("ativo", true).order("ordem"),
      sb.from("servicos").select("*").eq("ativo", true).order("ordem"),
      sb.from("expedientes").select("*"),
      sb.from("bloqueios").select("*").gte("data", Agenda.chaveDia(Agenda.somaDias(Agenda.hoje(), -7))),
    ]);
    const erro = b.error || s.error || e.error || bl.error;
    if (erro) throw erro;
    // troca o conteúdo das listas do CONFIG (o resto do app continua lendo de lá)
    CONFIG.barbeiros.splice(0, CONFIG.barbeiros.length, ...b.data.map((x) => ({ id: x.id, nome: x.nome, numero: x.numero, esporte: x.esporte,
      posicao: x.posicao, especialidade: x.especialidade, folga: [] })));
    CONFIG.servicos.splice(0, CONFIG.servicos.length, ...s.data.map((x) => ({ id: x.id, nome: x.nome, desc: x.descricao,
      duracao: x.duracao, preco: Number(x.preco), esporte: x.esporte })));
    const exp = {};
    for (const x of e.data) {
      (exp[x.barbeiro_id] ||= {})[x.dia_semana] = { aberto: x.aberto, abre: x.abre, fecha: x.fecha, almocoIni: x.almoco_ini, almocoFim: x.almoco_fim };
    }
    Agenda.definirBase({ expedientes: exp, bloqueios: bl.data.map(deBloqueio) });
  };

  // ---------- agendamentos ----------
  api.agendamentos = async (de, ate) => {
    const bloq = sb.from("bloqueios").select("*").gte("data", de).lte("data", ate);
    if (api.equipe) {
      const [a, bl] = await Promise.all([sb.from("agendamentos").select("*").gte("data", de).lte("data", ate), bloq]);
      if (a.error) throw a.error;
      return { lista: a.data.map(deLinha), ocupados: [], bloqueios: bl.data?.map(deBloqueio) };
    }
    const deHoje = de < hojeK() ? hojeK() : de;
    const [oc, meus, bl] = await Promise.all([
      sb.rpc("ocupacao", { de: deHoje, ate }),
      api.usuario ? sb.from("agendamentos").select("*").eq("cliente_id", api.usuario.id).order("data") : Promise.resolve({ data: [] }),
      bloq,
    ]);
    if (oc.error) throw oc.error;
    return { lista: (meus.data || []).map(deLinha), ocupados: oc.data.map((o) => ({ barbeiroId: o.barbeiro_id, data: o.data, ini: o.ini, dur: o.dur })),
      bloqueios: bl.data?.map(deBloqueio) };
  };

  api.agendar = async ({ data, ini, servicoId, barbeiroId, nome, telefone, origem, obs }) => {
    const { data: linha, error } = await sb.rpc("agendar", { p_barbeiro: barbeiroId, p_servico: servicoId, p_data: data, p_ini: ini,
      p_nome: nome, p_telefone: telefone || "", p_origem: origem || "app", p_obs: obs || "" });
    if (error) return falha(error);
    return { ok: true, agendamento: deLinha(linha) };
  };
  api.cancelar = async (id) => { const { error } = await sb.rpc("cancelar", { p_id: id }); return error ? falha(error) : { ok: true }; };
  api.definirStatus = async (id, status) => { const { error } = await sb.rpc("definir_status", { p_id: id, p_status: status }); return error ? falha(error) : { ok: true }; };

  // ---------- expediente, bloqueios, equipe ----------
  api.salvarExpediente = async (bId, semana) => {
    const linhas = Object.entries(semana).map(([d, x]) => ({ barbeiro_id: bId, dia_semana: Number(d), aberto: x.aberto, abre: x.abre, fecha: x.fecha,
      almoco_ini: x.almocoIni, almoco_fim: x.almocoFim }));
    const { error } = await sb.from("expedientes").upsert(linhas);
    return error ? falha(error) : { ok: true };
  };
  api.criarBloqueio = async ({ barbeiroId, data, ini, fim, motivo }) => {
    const { data: linha, error } = await sb.from("bloqueios").insert({ barbeiro_id: barbeiroId, data, ini, fim, motivo: (motivo || "").slice(0, 60) }).select().single();
    return error ? falha(error) : { ok: true, bloqueio: deBloqueio(linha) };
  };
  api.removerBloqueio = async (id) => { const { error } = await sb.from("bloqueios").delete().eq("id", id); return error ? falha(error) : { ok: true }; };
  api.salvarBarbeiro = async (b) => {
    const { error } = await sb.from("barbeiros").update({ nome: b.nome, numero: b.numero, esporte: b.esporte, posicao: b.posicao, especialidade: b.especialidade }).eq("id", b.id);
    return error ? falha(error) : { ok: true };
  };
  api.listaEquipe = async () => { const { data, error } = await sb.rpc("equipe"); return error ? falha(error) : { ok: true, lista: data }; };
  api.definirEquipe = async (email, papel, barbeiroId) => {
    const { error } = await sb.rpc("definir_equipe", { p_email: email, p_papel: papel, p_barbeiro: barbeiroId || null });
    return error ? falha(error) : { ok: true };
  };

  // ---------- ao vivo ----------
  api.aoMudarAgenda = (cb) => {
    if (!ativo) return;
    let espera;
    sb.channel("agenda").on("postgres_changes", { event: "*", schema: "public", table: "agendamentos" }, () => {
      clearTimeout(espera); espera = setTimeout(cb, 400);
    }).subscribe();
  };

  return api;
})();
