// Agenda: calcula horários livres, salva e cancela agendamentos.
// Nesta demonstração os dados ficam só no navegador (localStorage).
// Numa versão real, as funções carregar/salvar falariam com um servidor
// ou com uma planilha do Google, e o resto do código continua igual.
const Agenda = (() => {
  const CHAVE = "hattrick_agendamentos_v1";
  const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  let memoria = []; // usado se o navegador bloquear o localStorage

  // ---------- utilidades de data e hora ----------
  const paraMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
  const paraHora = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
  const chaveDia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const deChave = (k) => { const [a, m, d] = k.split("-").map(Number); return new Date(a, m - 1, d); };
  const hoje = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const somaDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  function rotuloDia(k, curto = false) {
    const d = deChave(k);
    const diff = Math.round((d - hoje()) / 86400000);
    const dm = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (diff === 0) return curto ? `Hoje ${dm}` : `hoje (${dm})`;
    if (diff === 1) return curto ? `Amanhã ${dm}` : `amanhã (${dm})`;
    const nome = DIAS[d.getDay()];
    return curto ? `${nome.slice(0, 3)} ${dm}` : `${nome}, ${dm}`;
  }

  const servico = (id) => CONFIG.servicos.find((s) => s.id === id);
  const barbeiro = (id) => CONFIG.barbeiros.find((b) => b.id === id);

  // ---------- expediente ----------
  // Devolve os blocos de trabalho do barbeiro no dia, em minutos: [[ini, fim], ...]
  function blocosDeTrabalho(k, barbeiroId) {
    const d = deChave(k);
    const exp = CONFIG.expediente[d.getDay()];
    if (!exp || barbeiro(barbeiroId).folga.includes(d.getDay())) return [];
    const abre = paraMin(exp.abre), fecha = paraMin(exp.fecha);
    if (!exp.almoco) return [[abre, fecha]];
    return [[abre, paraMin(exp.almoco[0])], [paraMin(exp.almoco[1]), fecha]];
  }

  const diaAberto = (k, barbeiroId) =>
    barbeiroId ? blocosDeTrabalho(k, barbeiroId).length > 0
               : CONFIG.barbeiros.some((b) => blocosDeTrabalho(k, b.id).length > 0);

  // ---------- armazenamento ----------
  function carregar() {
    try { return JSON.parse(localStorage.getItem(CHAVE)) || []; } catch { return memoria; }
  }
  function salvar(lista) {
    memoria = lista;
    try { localStorage.setItem(CHAVE, JSON.stringify(lista)); } catch { /* fica só na memória */ }
  }

  // ---------- agenda de exemplo ----------
  // Para a demonstração não parecer vazia, cada dia ganha alguns horários
  // ocupados "de mentira". O sorteio usa a data como semente, então o mesmo
  // dia sempre mostra os mesmos horários ocupados.
  const NOMES_EXEMPLO = ["Carlos", "Marcos", "João", "Pedro", "Lucas", "Thiago", "André", "Felipe", "Bruno", "Rafael", "Gustavo", "Diego"];
  function sorteador(semente) {
    let h = 2166136261;
    for (const c of semente) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
  }
  const cacheExemplo = {};
  function exemplos(k) {
    if (cacheExemplo[k]) return cacheExemplo[k];
    const lista = [];
    for (const b of CONFIG.barbeiros) {
      const r = sorteador(k + b.id);
      for (const [ini, fim] of blocosDeTrabalho(k, b.id)) {
        let t = ini;
        while (t < fim) {
          const s = CONFIG.servicos[Math.floor(r() * 3)]; // corte, barba ou combo
          if (r() < 0.35 && t + s.duracao <= fim) {
            lista.push({ id: `ex-${k}-${b.id}-${t}`, exemplo: true, data: k, ini: t, dur: s.duracao,
              servicoId: s.id, barbeiroId: b.id, nome: NOMES_EXEMPLO[Math.floor(r() * NOMES_EXEMPLO.length)] });
            t += s.duracao;
          } else t += CONFIG.passoMin * 2;
        }
      }
    }
    return (cacheExemplo[k] = lista);
  }

  function doDia(k, barbeiroId) {
    const reais = carregar().filter((a) => a.data === k && a.status !== "cancelado");
    return [...exemplos(k), ...reais]
      .filter((a) => !barbeiroId || a.barbeiroId === barbeiroId)
      .sort((a, b) => a.ini - b.ini);
  }

  // ---------- horários livres ----------
  const conflita = (ini, fim, ocupados) => ocupados.some((a) => ini < a.ini + a.dur && a.ini < fim);

  function livresDoBarbeiro(k, servicoId, barbeiroId) {
    const dur = servico(servicoId).duracao;
    const ocupados = doDia(k, barbeiroId);
    let minimo = 0;
    if (k === chaveDia(new Date())) {
      const agora = new Date();
      minimo = agora.getHours() * 60 + agora.getMinutes() + CONFIG.antecedenciaMin;
    }
    const livres = [];
    for (const [ini, fim] of blocosDeTrabalho(k, barbeiroId)) {
      for (let t = ini; t + dur <= fim; t += CONFIG.passoMin) {
        if (t >= minimo && !conflita(t, t + dur, ocupados)) livres.push(t);
      }
    }
    return livres;
  }

  // barbeiroId = null significa "sem preferência": junta os horários de todos e,
  // quando mais de um está livre, escolhe quem tem menos clientes no dia.
  function horariosLivres(k, servicoId, barbeiroId) {
    if (barbeiroId) return livresDoBarbeiro(k, servicoId, barbeiroId).map((t) => ({ ini: t, barbeiroId }));
    const porHora = new Map();
    const carga = (id) => doDia(k, id).length;
    for (const b of CONFIG.barbeiros) {
      for (const t of livresDoBarbeiro(k, servicoId, b.id)) {
        const atual = porHora.get(t);
        if (!atual || carga(b.id) < carga(atual)) porHora.set(t, b.id);
      }
    }
    return [...porHora.entries()].sort((a, b) => a[0] - b[0]).map(([ini, id]) => ({ ini, barbeiroId: id }));
  }

  // Próximos dias que têm pelo menos um horário livre
  function proximosDias(servicoId, barbeiroId, quantos = CONFIG.diasNoChat) {
    const dias = [];
    for (let i = 0; i < 45 && dias.length < quantos; i++) {
      const k = chaveDia(somaDias(hoje(), i));
      if (diaAberto(k, barbeiroId) && horariosLivres(k, servicoId, barbeiroId).length) dias.push(k);
    }
    return dias;
  }

  // ---------- criar, consultar e cancelar ----------
  function gerarCodigo() {
    const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O e 1/I para não confundir
    let c = "HT-";
    for (let i = 0; i < 4; i++) c += letras[Math.floor(Math.random() * letras.length)];
    return c;
  }
  const soDigitos = (t) => String(t).replace(/\D/g, "");

  // Confere de novo se o horário está livre na hora de confirmar
  // (outra pessoa pode ter marcado enquanto o cliente digitava o nome).
  function criar({ data, ini, servicoId, barbeiroId, nome, telefone }) {
    const dur = servico(servicoId).duracao;
    if (!livresDoBarbeiro(data, servicoId, barbeiroId).includes(ini)) {
      return { ok: false, motivo: "ocupado" };
    }
    const novo = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), codigo: gerarCodigo(),
      data, ini, dur, servicoId, barbeiroId, nome: nome.trim(), telefone: soDigitos(telefone),
      status: "confirmado", criadoEm: new Date().toISOString() };
    salvar([...carregar(), novo]);
    return { ok: true, agendamento: novo };
  }

  function doCliente(telefone) {
    const tel = soDigitos(telefone);
    const agora = new Date();
    const minAgora = agora.getHours() * 60 + agora.getMinutes();
    const hojeK = chaveDia(agora);
    return carregar()
      .filter((a) => a.telefone === tel && a.status !== "cancelado")
      .filter((a) => a.data > hojeK || (a.data === hojeK && a.ini >= minAgora))
      .sort((a, b) => (a.data + paraHora(a.ini)).localeCompare(b.data + paraHora(b.ini)));
  }

  function cancelar(id) {
    salvar(carregar().map((a) => (a.id === id ? { ...a, status: "cancelado", canceladoEm: new Date().toISOString() } : a)));
  }

  // Apaga todos os dados pessoais guardados neste navegador (LGPD: direito de exclusão)
  function apagarTudo() { salvar([]); }

  // Arquivo .ics para o cliente salvar no calendário do celular
  function arquivoCalendario(a) {
    const s = servico(a.servicoId), b = barbeiro(a.barbeiroId);
    const fmt = (k, min) => `${k.replace(/-/g, "")}T${paraHora(min).replace(":", "")}00`;
    return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Hat-Trick demo//PT-BR", "BEGIN:VEVENT",
      `UID:${a.id}@hattrick-demo`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
      `DTSTART:${fmt(a.data, a.ini)}`, `DTEND:${fmt(a.data, a.ini + a.dur)}`,
      `SUMMARY:${s.nome} com ${b.nome} — ${CONFIG.nome}`, `LOCATION:${CONFIG.endereco}`,
      `DESCRIPTION:Código ${a.codigo}. Agendamento de demonstração.`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  }

  return { paraMin, paraHora, chaveDia, deChave, rotuloDia, hoje, somaDias, servico, barbeiro,
    blocosDeTrabalho, diaAberto, doDia, horariosLivres, proximosDias, criar, doCliente, cancelar,
    apagarTudo, arquivoCalendario, soDigitos, carregar };
})();
