// Agenda: expediente de cada barbeiro, horários livres, criar/cancelar.
// Dois modos com as mesmas funções:
//  - demonstração: tudo no navegador (localStorage) + horários de exemplo
//  - nuvem: Supabase (js/nuvem.js), quando CONFIG.supabase estiver preenchido
// O cálculo de horário livre é sempre feito aqui; na nuvem o banco confere de novo ao salvar.
const Agenda = (() => {
  const CHAVE = "hattrick_agendamentos_v1";
  const CHAVE_STATUS = "hattrick_status_exemplos_v1";
  const CHAVE_EXP = "hattrick_expedientes_v1";
  const CHAVE_BLOQ = "hattrick_bloqueios_v1";
  const CHAVE_BARB = "hattrick_barbeiros_v1";
  const ORIGENS = { app: "App", whatsapp: "WhatsApp", telefone: "Telefone", balcao: "Balcão" };
  const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const naNuvem = () => typeof Nuvem !== "undefined" && Nuvem.ativo;
  let memoria = [];

  // ---------- utilidades ----------
  const paraMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
  const paraHora = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
  const chaveDia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const deChave = (k) => { const [a, m, d] = k.split("-").map(Number); return new Date(a, m - 1, d); };
  const hoje = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const somaDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const soDigitos = (t) => String(t ?? "").replace(/\D/g, "");
  const ler = (k, padrao) => { try { return JSON.parse(localStorage.getItem(k)) ?? padrao; } catch { return padrao; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ok */ } };

  function rotuloDia(k, curto = false) {
    const d = deChave(k);
    const diff = Math.round((d - hoje()) / 86400000);
    const dm = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (diff === 0) return curto ? `Hoje ${dm}` : `hoje (${dm})`;
    if (diff === 1) return curto ? `Amanhã ${dm}` : `amanhã (${dm})`;
    const nome = DIAS[d.getDay()];
    return curto ? `${nome.slice(0, 3)} ${dm}` : `${nome}, ${dm}`;
  }

  const servico = (id) => CONFIG.servicos.find((s) => s.id === id) || { id, nome: "Serviço", duracao: 30, preco: 0, esporte: "futebol" };
  const barbeiro = (id) => CONFIG.barbeiros.find((b) => b.id === id) || { id, nome: "Barbeiro", numero: 0, esporte: "futebol", folga: [] };

  // ---------- expediente de cada barbeiro ----------
  // exp[barbeiroId][diaSemana] = { aberto, abre, fecha, almocoIni, almocoFim } (minutos)
  let exp = {};
  let bloqueios = []; // { id, barbeiroId, data, ini, fim, motivo }

  function expedientePadrao() {
    const e = {};
    for (const b of CONFIG.barbeiros) {
      e[b.id] = {};
      for (let d = 0; d < 7; d++) {
        const x = CONFIG.expediente[d];
        e[b.id][d] = x
          ? { aberto: !(b.folga || []).includes(d), abre: paraMin(x.abre), fecha: paraMin(x.fecha),
              almocoIni: x.almoco ? paraMin(x.almoco[0]) : null, almocoFim: x.almoco ? paraMin(x.almoco[1]) : null }
          : { aberto: false, abre: 540, fecha: 1140, almocoIni: null, almocoFim: null };
      }
    }
    return e;
  }
  const expediente = (bId, dia) => exp[bId]?.[dia] || { aberto: false, abre: 540, fecha: 1140, almocoIni: null, almocoFim: null };

  // folga = dia em que a casa abre mas o barbeiro não (usado no Elenco)
  function atualizarFolgas() {
    const casaAbre = [0, 1, 2, 3, 4, 5, 6].filter((d) => CONFIG.barbeiros.some((b) => expediente(b.id, d).aberto));
    for (const b of CONFIG.barbeiros) b.folga = casaAbre.filter((d) => !expediente(b.id, d).aberto);
  }

  const bloqueiosDoDia = (k, bId) => bloqueios.filter((x) => x.data === k && (!bId || x.barbeiroId === bId));

  function blocosDeTrabalho(k, bId) {
    const e = expediente(bId, deChave(k).getDay());
    if (!e.aberto) return [];
    if (bloqueiosDoDia(k, bId).some((x) => x.ini <= e.abre && x.fim >= e.fecha)) return []; // dia inteiro bloqueado
    if (e.almocoIni == null) return [[e.abre, e.fecha]];
    return [[e.abre, e.almocoIni], [e.almocoFim, e.fecha]].filter(([i, f]) => f > i);
  }

  const diaAberto = (k, bId) => (bId ? blocosDeTrabalho(k, bId).length > 0 : CONFIG.barbeiros.some((b) => blocosDeTrabalho(k, b.id).length > 0));

  // ---------- agendamentos ----------
  // demo: localStorage + exemplos | nuvem: lista carregada do Supabase
  let nuvemLista = []; // completos (barbeiro/dono) ou só os do cliente
  let nuvemOcupados = []; // { barbeiroId, data, ini, dur } sem nome (para o cliente calcular livres)

  function carregar() {
    if (naNuvem()) return nuvemLista;
    return ler(CHAVE, null) ?? memoria;
  }
  function salvar(lista) { memoria = lista; gravar(CHAVE, lista); }

  const NOMES_EXEMPLO = ["Carlos", "Marcos", "João", "Pedro", "Lucas", "Thiago", "André", "Felipe", "Bruno", "Rafael", "Gustavo", "Diego"];
  function sorteador(semente) {
    let h = 2166136261;
    for (const c of semente) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
  }
  function exemplos(k) {
    const lista = [];
    for (const b of CONFIG.barbeiros) {
      const r = sorteador(k + b.id);
      const bloq = bloqueiosDoDia(k, b.id);
      for (const [ini, fim] of blocosDeTrabalho(k, b.id)) {
        let t = ini;
        while (t < fim) {
          const s = CONFIG.servicos[Math.floor(r() * 3)];
          const livreDeBloqueio = !bloq.some((x) => t < x.fim && x.ini < t + s.duracao);
          if (r() < 0.35 && t + s.duracao <= fim && livreDeBloqueio) {
            lista.push({ id: `ex-${k}-${b.id}-${t}`, exemplo: true, data: k, ini: t, dur: s.duracao,
              servicoId: s.id, barbeiroId: b.id, nome: NOMES_EXEMPLO[Math.floor(r() * NOMES_EXEMPLO.length)],
              origem: ["app", "whatsapp", "whatsapp", "telefone", "balcao"][Math.floor(r() * 5)], status: "confirmado" });
            t += s.duracao;
          } else t += CONFIG.passoMin * 2;
        }
      }
    }
    return lista;
  }

  function doDia(k, bId, incluirCancelados = false) {
    let lista;
    if (naNuvem()) {
      const meus = nuvemLista.filter((a) => a.data === k);
      const ids = new Set(meus.map((a) => `${a.barbeiroId}|${a.ini}`));
      // ocupados anônimos que não são meus (o cliente não vê nome dos outros)
      const outros = Nuvem.equipe ? [] : nuvemOcupados.filter((o) => o.data === k && !ids.has(`${o.barbeiroId}|${o.ini}`))
        .map((o) => ({ ...o, id: `oc-${o.barbeiroId}-${o.data}-${o.ini}`, anonimo: true, status: "confirmado", nome: "Ocupado", servicoId: "" }));
      lista = [...meus, ...outros];
    } else {
      const st = ler(CHAVE_STATUS, {});
      lista = [...exemplos(k).map((a) => (st[a.id] ? { ...a, status: st[a.id] } : a)), ...carregar().filter((a) => a.data === k)];
    }
    return lista
      .filter((a) => incluirCancelados || a.status !== "cancelado")
      .filter((a) => !bId || a.barbeiroId === bId)
      .sort((a, b) => a.ini - b.ini);
  }

  // ---------- horários livres ----------
  const conflita = (ini, fim, ocupados) => ocupados.some((a) => ini < a.ini + a.dur && a.ini < fim);

  function livresDoBarbeiro(k, servicoId, bId, semAntecedencia = false) {
    const dur = servico(servicoId).duracao;
    const ocupados = [...doDia(k, bId), ...bloqueiosDoDia(k, bId).map((x) => ({ ini: x.ini, dur: x.fim - x.ini }))];
    let minimo = 0;
    if (k === chaveDia(new Date())) {
      const agora = new Date();
      minimo = agora.getHours() * 60 + agora.getMinutes() + (semAntecedencia ? 0 : CONFIG.antecedenciaMin);
    }
    if (k < chaveDia(new Date())) return [];
    const livres = [];
    for (const [ini, fim] of blocosDeTrabalho(k, bId)) {
      for (let t = ini; t + dur <= fim; t += CONFIG.passoMin) {
        if (t >= minimo && !conflita(t, t + dur, ocupados)) livres.push(t);
      }
    }
    return livres;
  }

  function horariosLivres(k, servicoId, bId, semAntecedencia = false) {
    if (bId) return livresDoBarbeiro(k, servicoId, bId, semAntecedencia).map((t) => ({ ini: t, barbeiroId: bId }));
    const porHora = new Map();
    const carga = (id) => doDia(k, id).length;
    for (const b of CONFIG.barbeiros) {
      for (const t of livresDoBarbeiro(k, servicoId, b.id, semAntecedencia)) {
        const atual = porHora.get(t);
        if (!atual || carga(b.id) < carga(atual)) porHora.set(t, b.id);
      }
    }
    return [...porHora.entries()].sort((a, b) => a[0] - b[0]).map(([ini, id]) => ({ ini, barbeiroId: id }));
  }

  function proximosDias(servicoId, bId, quantos = CONFIG.diasNoChat) {
    const dias = [];
    for (let i = 0; i < 45 && dias.length < quantos; i++) {
      const k = chaveDia(somaDias(hoje(), i));
      if (diaAberto(k, bId) && horariosLivres(k, servicoId, bId).length) dias.push(k);
    }
    return dias;
  }

  // ---------- carregar / atualizar ----------
  async function iniciar() {
    if (naNuvem()) {
      await Nuvem.carregarBase(); // preenche CONFIG.barbeiros/servicos, exp e bloqueios
    } else {
      const cartoes = ler(CHAVE_BARB, {});
      for (const b of CONFIG.barbeiros) if (cartoes[b.id]) Object.assign(b, cartoes[b.id]);
      exp = expedientePadrao();
      const salvos = ler(CHAVE_EXP, {});
      for (const bId of Object.keys(salvos)) if (exp[bId]) Object.assign(exp[bId], salvos[bId]);
      bloqueios = ler(CHAVE_BLOQ, []);
    }
    atualizarFolgas();
    await atualizar();
  }
  // traz da nuvem os horários do período (padrão: hoje até 45 dias)
  async function atualizar(de = chaveDia(somaDias(hoje(), -7)), ate = chaveDia(somaDias(hoje(), 45))) {
    if (!naNuvem()) return;
    const r = await Nuvem.agendamentos(de, ate);
    nuvemLista = r.lista;
    nuvemOcupados = r.ocupados;
    bloqueios = r.bloqueios ?? bloqueios;
  }
  // usado pela nuvem ao carregar a base
  function definirBase({ expedientes, bloqueios: bl }) {
    exp = expedientes;
    if (bl) bloqueios = bl;
  }

  // ---------- criar, cancelar, status ----------
  function gerarCodigo() {
    const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let c = "HT-";
    for (let i = 0; i < 4; i++) c += letras[Math.floor(Math.random() * letras.length)];
    return c;
  }

  // equipe = barbeiro/dono registrando pelo painel (pode encaixar sem antecedência mínima)
  async function criar({ data, ini, servicoId, barbeiroId, nome, telefone = "", origem = "app", obs = "", equipe = false }) {
    if (!livresDoBarbeiro(data, servicoId, barbeiroId, equipe).includes(ini)) return { ok: false, motivo: "ocupado" };
    if (naNuvem()) {
      const r = await Nuvem.agendar({ data, ini, servicoId, barbeiroId, nome, telefone, origem, obs });
      if (r.ok) nuvemLista = [...nuvemLista, r.agendamento];
      return r;
    }
    const novo = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), codigo: gerarCodigo(),
      data, ini, dur: servico(servicoId).duracao, servicoId, barbeiroId, nome: nome.trim(), telefone: soDigitos(telefone),
      origem, obs: obs.trim(), status: "confirmado", criadoEm: new Date().toISOString() };
    salvar([...carregar(), novo]);
    return { ok: true, agendamento: novo };
  }

  async function definirStatus(id, status) {
    if (naNuvem()) {
      const r = status === "cancelado" && !Nuvem.equipe ? await Nuvem.cancelar(id) : await Nuvem.definirStatus(id, status);
      if (r.ok) nuvemLista = nuvemLista.map((a) => (a.id === id ? { ...a, status } : a));
      return r;
    }
    if (String(id).startsWith("ex-")) {
      const st = ler(CHAVE_STATUS, {}); st[id] = status; gravar(CHAVE_STATUS, st);
      return { ok: true };
    }
    salvar(carregar().map((a) => (a.id === id ? { ...a, status, [`${status}Em`]: new Date().toISOString() } : a)));
    return { ok: true };
  }
  const cancelar = (id) => definirStatus(id, "cancelado");

  // ---------- editar expediente e bloqueios ----------
  async function salvarExpediente(bId, semana) { // semana[0..6] = {aberto, abre, fecha, almocoIni, almocoFim}
    if (naNuvem()) {
      const r = await Nuvem.salvarExpediente(bId, semana);
      if (!r.ok) return r;
    } else {
      const salvos = ler(CHAVE_EXP, {}); salvos[bId] = { ...semana }; gravar(CHAVE_EXP, salvos);
    }
    exp[bId] = { ...semana };
    atualizarFolgas();
    return { ok: true };
  }
  async function criarBloqueio({ barbeiroId, data, ini, fim, motivo }) {
    if (naNuvem()) {
      const r = await Nuvem.criarBloqueio({ barbeiroId, data, ini, fim, motivo });
      if (r.ok) bloqueios = [...bloqueios, r.bloqueio];
      return r;
    }
    const novo = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), barbeiroId, data, ini, fim, motivo: motivo.trim() };
    bloqueios = [...bloqueios, novo]; gravar(CHAVE_BLOQ, bloqueios);
    return { ok: true, bloqueio: novo };
  }
  async function removerBloqueio(id) {
    if (naNuvem()) { const r = await Nuvem.removerBloqueio(id); if (!r.ok) return r; }
    bloqueios = bloqueios.filter((x) => x.id !== id);
    if (!naNuvem()) gravar(CHAVE_BLOQ, bloqueios);
    return { ok: true };
  }
  async function salvarBarbeiro(b) { // { id, nome, numero, esporte, posicao, especialidade }
    if (naNuvem()) { const r = await Nuvem.salvarBarbeiro(b); if (!r.ok) return r; }
    else { const c = ler(CHAVE_BARB, {}); c[b.id] = { nome: b.nome, numero: b.numero, esporte: b.esporte, posicao: b.posicao, especialidade: b.especialidade }; gravar(CHAVE_BARB, c); }
    Object.assign(barbeiro(b.id), b);
    return { ok: true };
  }
  const bloqueiosDe = (bId, deK = chaveDia(hoje())) => bloqueios.filter((x) => x.barbeiroId === bId && x.data >= deK)
    .sort((a, b) => (a.data + paraHora(a.ini)).localeCompare(b.data + paraHora(b.ini)));

  // apaga o que está neste navegador (modo demonstração)
  function apagarTudo() {
    salvar([]);
    [CHAVE_STATUS, CHAVE_EXP, CHAVE_BLOQ, CHAVE_BARB].forEach((k) => { try { localStorage.removeItem(k); } catch { /* ok */ } });
    if (!naNuvem()) { exp = expedientePadrao(); bloqueios = []; atualizarFolgas(); }
  }

  function arquivoCalendario(a) {
    const s = servico(a.servicoId), b = barbeiro(a.barbeiroId);
    const fmt = (k, min) => `${k.replace(/-/g, "")}T${paraHora(min).replace(":", "")}00`;
    return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Hat-Trick//PT-BR", "BEGIN:VEVENT",
      `UID:${a.id}@hattrick`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
      `DTSTART:${fmt(a.data, a.ini)}`, `DTEND:${fmt(a.data, a.ini + a.dur)}`,
      `SUMMARY:${s.nome} com ${b.nome} — ${CONFIG.nome}`, `LOCATION:${CONFIG.endereco}`,
      `DESCRIPTION:Código ${a.codigo}.`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  }

  return { paraMin, paraHora, chaveDia, deChave, rotuloDia, hoje, somaDias, servico, barbeiro, soDigitos, DIAS, ORIGENS,
    expediente, blocosDeTrabalho, bloqueiosDoDia, bloqueiosDe, diaAberto, doDia, horariosLivres, proximosDias,
    iniciar, atualizar, definirBase, criar, cancelar, definirStatus, salvarExpediente, criarBloqueio, removerBloqueio, salvarBarbeiro,
    apagarTudo, arquivoCalendario, carregar, naNuvem };
})();
