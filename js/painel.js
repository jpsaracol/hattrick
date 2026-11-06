// Painel do barbeiro: agenda do dia, registrar horário, expediente/folgas e equipe.
// Barbeiro vê e edita só a própria agenda; dono vê e edita tudo.
(() => {
  const A = Agenda;
  const $ = (s, el = document) => el.querySelector(s);
  const brl = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const icone = (id) => `<svg aria-hidden="true"><use href="#${id}"/></svg>`;
  const DIAS = A.DIAS;
  const Dia = (d) => DIAS[d][0].toUpperCase() + DIAS[d].slice(1);
  const STATUS = { confirmado: "Confirmado", atendido: "Atendido", faltou: "Faltou", cancelado: "Cancelado" };
  const PX = 2.4; // pixels por minuto na grade
  const minAgora = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  const hojeK = () => A.chaveDia(new Date());
  const horas = (min) => (min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, "0") : ""}` : `${min} min`);
  const telBonito = (d) => { d = A.soDigitos(d).slice(-11); return d.length > 6 ? `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}` : d; };
  const nuvem = A.naNuvem();

  let dia = hojeK();
  let filtro = null;
  let destacar = null;
  let aba = "agenda";
  // quem está usando o painel
  let papel = "dono", meuBarbeiro = null;
  const ehDono = () => papel === "dono";
  const pode = (bId) => ehDono() || bId === meuBarbeiro;

  // ================= resumo =================
  function minutosDeTrabalho(k, ids) {
    return ids.reduce((s, id) => s + A.blocosDeTrabalho(k, id).reduce((t, [i, f]) => t + f - i, 0), 0);
  }
  function renderResumo(todos) {
    const ativos = todos.filter((a) => a.status !== "cancelado");
    const n = (st) => ativos.filter((a) => a.status === st).length;
    const preco = (a) => A.servico(a.servicoId).preco;
    const previsto = ativos.filter((a) => a.status !== "faltou").reduce((s, a) => s + preco(a), 0);
    const feito = ativos.filter((a) => a.status === "atendido").reduce((s, a) => s + preco(a), 0);
    const ids = filtro ? [filtro] : CONFIG.barbeiros.map((b) => b.id);
    const trabalho = minutosDeTrabalho(dia, ids);
    const bloq = ids.reduce((s, id) => s + A.bloqueiosDoDia(dia, id).reduce((t, x) => t + Math.max(0, x.fim - x.ini), 0), 0);
    const ocupado = ativos.reduce((s, a) => s + a.dur, 0);

    $("#n-total").textContent = ativos.length;
    $("#n-status").textContent = `${n("atendido")} atendidos · ${n("faltou")} faltas`;
    $("#n-valor").textContent = brl(previsto);
    $("#n-feito").textContent = `${brl(feito)} já atendido`;
    $("#n-ocup").textContent = trabalho ? `${Math.min(100, Math.round((ocupado / trabalho) * 100))}%` : "—";
    $("#n-livre").textContent = trabalho ? `${horas(Math.max(0, trabalho - ocupado - Math.min(bloq, trabalho)))} livres` : "Ninguém atende";

    const depois = dia === hojeK() ? minAgora() : -1;
    const prox = ativos.find((a) => a.status === "confirmado" && a.ini >= depois && dia >= hojeK());
    $("#n-prox").textContent = prox ? A.paraHora(prox.ini) : "—";
    $("#n-prox-info").textContent = prox ? `${prox.nome} · ${A.barbeiro(prox.barbeiroId).nome}` : dia < hojeK() ? "Dia encerrado" : "Ninguém na fila";

    const cont = {};
    ativos.forEach((a) => (cont[a.origem || "app"] = (cont[a.origem || "app"] || 0) + 1));
    const fora = ativos.length ? Math.round((ativos.filter((a) => (a.origem || "app") !== "app").length / ativos.length) * 100) : 0;
    $("#origens").innerHTML = Object.entries(A.ORIGENS).map(([id, nome]) =>
      `<span class="p-origem-item">${icone("o-" + id)}${nome}<b>${cont[id] || 0}</b></span>`).join("") +
      (ativos.length ? `<span class="p-origem-nota">${fora}% marcados fora do app</span>` : "");
  }

  // ================= dias e filtros =================
  function renderDias() {
    const d = A.deChave(dia);
    const t = d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
    $("#titulo-dia").textContent = (dia === hojeK() ? "Hoje, " : "") + t;
    $("#hoje").disabled = dia === hojeK();
    const lista = [];
    for (let i = 0; i < 14; i++) lista.push(A.chaveDia(A.somaDias(A.hoje(), i)));
    $("#dias").innerHTML = lista.map((k) => {
      const dd = A.deChave(k), aberto = A.diaAberto(k, filtro);
      const qtd = aberto ? A.doDia(k, filtro).length : 0;
      return `<button type="button" class="p-chip-dia" data-dia="${k}" aria-pressed="${k === dia}" ${aberto ? "" : "data-fechado"}
        aria-label="${A.rotuloDia(k)}, ${aberto ? qtd + " horários" : "ninguém atende"}">
        <small>${k === hojeK() ? "Hoje" : DIAS[dd.getDay()].slice(0, 3)}</small><b>${String(dd.getDate()).padStart(2, "0")}</b>
        <span>${aberto ? qtd : "—"}</span></button>`;
    }).join("");
    $(`.p-chip-dia[data-dia="${dia}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  function renderFiltros() {
    const el = $("#filtros");
    el.hidden = !ehDono();
    if (!ehDono()) return;
    el.innerHTML = [{ id: "", nome: "Todos" }, ...CONFIG.barbeiros].map((b) =>
      `<button type="button" class="p-filtro" data-b="${b.id}" aria-pressed="${(filtro || "") === b.id}">${b.numero ? `<i>#${b.numero}</i>` : ""}${esc(b.nome)}</button>`).join("");
  }

  // ================= grade =================
  function limites(k) {
    const blocos = CONFIG.barbeiros.flatMap((b) => {
      const e = A.expediente(b.id, A.deChave(k).getDay());
      return e.aberto ? [[e.abre, e.fecha]] : [];
    });
    if (!blocos.length) return null;
    return [Math.min(...blocos.map((x) => x[0])), Math.max(...blocos.map((x) => x[1]))];
  }
  function lacunas(blocos, ocupados) {
    const res = [];
    for (const [ini, fim] of blocos) {
      let t = ini;
      for (const a of ocupados.filter((x) => x.ini < fim && x.ini + x.dur > ini).sort((x, y) => x.ini - y.ini)) {
        if (a.ini > t) res.push([t, a.ini]);
        t = Math.max(t, a.ini + a.dur);
      }
      if (t < fim) res.push([t, fim]);
    }
    return res.filter(([i, f]) => f - i >= CONFIG.passoMin);
  }

  function renderGrade() {
    const barbeiros = CONFIG.barbeiros.filter((b) => !filtro || b.id === filtro);
    const lim = limites(dia);
    const grade = $("#grade");
    $("#fechado").hidden = !!lim;
    grade.hidden = !lim;
    if (!lim) return (grade.innerHTML = "");
    const [ini, fim] = lim;
    const altura = (fim - ini) * PX;
    const y = (min) => (Math.max(min, ini) - ini) * PX;
    const ehHoje = dia === hojeK(), agora = minAgora(), passado = dia < hojeK();

    let regua = "";
    for (let t = Math.ceil(ini / 60) * 60; t <= fim; t += 60) regua += `<span style="top:${y(t)}px">${A.paraHora(t)}</span>`;

    const colunas = barbeiros.map((b) => {
      const e = A.expediente(b.id, A.deChave(dia).getDay());
      const blocos = A.blocosDeTrabalho(dia, b.id);
      const ag = A.doDia(dia, b.id);
      const bloq = A.bloqueiosDoDia(dia, b.id);
      let corpo = "";
      if (!e.aberto) corpo = `<div class="p-folga">Folga</div>`;
      else {
        // fora do expediente deste barbeiro e almoço
        const faixas = [[ini, e.abre, ""], [e.fecha, fim, ""]];
        if (e.almocoIni != null) faixas.push([e.almocoIni, e.almocoFim, "Almoço"]);
        for (const [fi, ff, rot] of faixas) if (ff > fi) corpo += `<div class="p-fora" style="top:${y(fi)}px;height:${(Math.min(ff, fim) - Math.max(fi, ini)) * PX}px">${rot}</div>`;
        // bloqueios
        for (const x of bloq) {
          const bi = Math.max(x.ini, e.abre), bf = Math.min(x.fim, e.fecha);
          if (bf <= bi) continue;
          corpo += `<button type="button" class="p-bloq" data-bloq="${x.id}" style="top:${y(bi)}px;height:${(bf - bi) * PX}px"
            aria-label="Bloqueado das ${A.paraHora(bi)} às ${A.paraHora(bf)}${x.motivo ? ": " + esc(x.motivo) : ""}">
            <span>${icone("i-cadeado")}${x.ini <= e.abre && x.fim >= e.fecha ? "Dia bloqueado" : A.paraHora(bi) + "–" + A.paraHora(bf)}${x.motivo ? ` · ${esc(x.motivo)}` : ""}</span></button>`;
        }
        // livres
        if (!passado && pode(b.id)) {
          const ocup = [...ag, ...bloq.map((x) => ({ ini: x.ini, dur: x.fim - x.ini }))];
          for (const [li, lf] of lacunas(blocos, ocup)) {
            const comeco = ehHoje ? Math.max(li, Math.ceil((agora + 1) / CONFIG.passoMin) * CONFIG.passoMin) : li;
            if (lf - comeco < CONFIG.passoMin) continue;
            const h = (lf - comeco) * PX;
            corpo += `<button type="button" class="p-livre" style="top:${y(comeco)}px;height:${h}px" data-b="${b.id}" data-ini="${comeco}"
              aria-label="Livre das ${A.paraHora(comeco)} às ${A.paraHora(lf)} com ${esc(b.nome)}. Encaixar cliente">
              ${h >= 30 ? `<span>${icone("i-mais")}${A.paraHora(comeco)}${h >= 60 ? `–${A.paraHora(lf)}` : ""}</span>` : ""}</button>`;
          }
        }
        // marcados
        for (const a of ag) {
          const s = A.servico(a.servicoId), h = a.dur * PX;
          corpo += `<button type="button" class="p-bloco" data-id="${a.id}" data-status="${a.status}" ${a.exemplo ? "data-exemplo" : ""} ${a.id === destacar ? "data-novo" : ""}
            style="top:${y(a.ini)}px;height:${h}px" aria-label="${A.paraHora(a.ini)}, ${esc(a.nome)}, ${esc(s.nome)}, ${STATUS[a.status]}, via ${A.ORIGENS[a.origem || "app"]}">
            <span class="p-bloco-l1"><b>${A.paraHora(a.ini)}</b><span>${esc(a.nome)}</span>${a.status === "atendido" ? icone("i-check") : ""}</span>
            ${h >= 50 ? `<span class="p-bloco-l2">${icone("o-" + (a.origem || "app"))}${esc(s.nome)}</span>` : ""}
          </button>`;
        }
      }
      const qtd = ag.length;
      return `<div class="p-col">
        <div class="p-col-topo"><i>#${b.numero}</i><b>${esc(b.nome)}</b><small>${e.aberto ? `${qtd} ${qtd === 1 ? "horário" : "horários"}` : "folga"}</small></div>
        <div class="p-col-corpo" style="height:${altura}px">${corpo}</div></div>`;
    }).join("");

    const linhaAgora = ehHoje && agora >= ini && agora <= fim ? `<div class="p-agora" style="top:${y(agora)}px"><span>${A.paraHora(agora)}</span></div>` : "";
    grade.style.setProperty("--colunas", barbeiros.length);
    grade.innerHTML = `<div class="p-regua" style="height:${altura}px">${regua}</div>
      <div class="p-cols">${colunas}<div class="p-agora-faixa" style="height:${altura}px">${linhaAgora}</div></div>`;
    if (destacar) setTimeout(() => { destacar = null; }, 1500);
  }

  function renderAgenda() {
    renderDias();
    renderFiltros();
    renderResumo(A.doDia(dia, filtro, true));
    renderGrade();
  }

  // carrega da nuvem o período em volta do dia escolhido
  let periodo = null;
  async function garantir(k) {
    if (!nuvem) return;
    if (periodo && k >= periodo[0] && k <= periodo[1]) return;
    const de = A.chaveDia(A.somaDias(A.deChave(k), -7)), ate = A.chaveDia(A.somaDias(A.deChave(k), 40));
    await A.atualizar(de, ate);
    periodo = [de, ate];
  }
  async function irParaDia(k) {
    dia = k;
    renderAgenda();
    if (nuvem && !(periodo && k >= periodo[0] && k <= periodo[1])) { await garantir(k).catch(() => avisar("Sem conexão com a agenda.")); renderAgenda(); }
  }
  const recarregar = async () => { if (nuvem && periodo) await A.atualizar(...periodo).catch(() => {}); renderAgenda(); };

  // ================= detalhe do horário =================
  const folhaDetalhe = $("#folha-detalhe");
  let confirmandoCancelar = false;
  function abrirDetalhe(id) {
    const a = A.doDia(dia, null, true).find((x) => x.id === id);
    if (!a) return;
    const s = A.servico(a.servicoId), b = A.barbeiro(a.barbeiroId), o = a.origem || "app";
    const tel = a.telefone || "";
    const msg = encodeURIComponent(`Olá, ${a.nome}! Aqui é da Hat-Trick. Confirmando seu horário: ${s.nome}, ${A.rotuloDia(a.data)} às ${A.paraHora(a.ini)} com ${b.nome}.`);
    const acoes = !pode(a.barbeiroId) ? "" : a.status === "confirmado"
      ? `<button class="botao botao-cheio" type="button" data-st="atendido">${icone("i-check")}Atendido</button>
         <button class="botao botao-linha" type="button" data-st="faltou">Faltou</button>
         <button class="botao botao-linha p-perigo" type="button" data-st="cancelado">${confirmandoCancelar ? "Toque de novo para cancelar" : "Cancelar horário"}</button>`
      : `<button class="botao botao-linha" type="button" data-st="confirmado">Voltar para confirmado</button>`;
    $("#detalhe").innerHTML = `
      <div class="folha-topo"><h2 id="d-nome">${esc(a.nome)}</h2><button class="fechar" type="button" data-fechar aria-label="Fechar">${icone("i-x")}</button></div>
      <p class="p-d-status" data-status="${a.status}">${STATUS[a.status]}${a.exemplo ? " · horário de exemplo" : ""}</p>
      <dl class="resumo">
        <dt>Horário</dt><dd>${A.rotuloDia(a.data)}, ${A.paraHora(a.ini)}–${A.paraHora(a.ini + a.dur)}</dd>
        <dt>Serviço</dt><dd>${esc(s.nome)} · ${brl(s.preco)}</dd>
        <dt>Barbeiro</dt><dd>${esc(b.nome)} #${b.numero}</dd>
        <dt>Marcado por</dt><dd class="p-d-origem">${icone("o-" + o)}${A.ORIGENS[o]}</dd>
        ${tel ? `<dt>Celular</dt><dd>${telBonito(tel)}</dd>` : ""}
        ${a.codigo ? `<dt>Código</dt><dd>${esc(a.codigo)}</dd>` : ""}
        ${a.obs ? `<dt>Observação</dt><dd>${esc(a.obs)}</dd>` : ""}
      </dl>
      ${tel ? `<div class="acoes p-d-contato">
        <a class="botao botao-linha" href="https://wa.me/55${tel}?text=${msg}" target="_blank" rel="noopener">${icone("o-whatsapp")}Confirmar no WhatsApp</a>
        <a class="botao botao-linha" href="tel:+55${tel}">${icone("o-telefone")}Ligar</a></div>` : ""}
      <div class="p-d-acoes">${acoes}</div>`;
    $("#detalhe").onclick = async (e) => {
      if (e.target.closest("[data-fechar]")) return folhaDetalhe.close();
      const bt = e.target.closest("[data-st]");
      if (!bt) return;
      const st = bt.dataset.st;
      if (st === "cancelado" && !confirmandoCancelar) { confirmandoCancelar = true; abrirDetalhe(id); $('[data-st="cancelado"]').focus(); return; }
      bt.disabled = true;
      const r = await A.definirStatus(id, st);
      confirmandoCancelar = false;
      folhaDetalhe.close();
      renderAgenda();
      avisar(r.ok ? `${a.nome}: ${STATUS[st].toLowerCase()}.` : r.mensagem);
    };
    if (!folhaDetalhe.open) folhaDetalhe.showModal();
  }
  folhaDetalhe.addEventListener("close", () => { confirmandoCancelar = false; });

  function abrirBloqueio(id) {
    const x = A.bloqueiosDoDia(dia).find((b) => b.id === id);
    if (!x) return;
    $("#detalhe").innerHTML = `
      <div class="folha-topo"><h2 id="d-nome">Horário bloqueado</h2><button class="fechar" type="button" data-fechar aria-label="Fechar">${icone("i-x")}</button></div>
      <dl class="resumo">
        <dt>Barbeiro</dt><dd>${esc(A.barbeiro(x.barbeiroId).nome)}</dd>
        <dt>Quando</dt><dd>${A.rotuloDia(x.data)}, ${x.ini === 0 && x.fim === 1440 ? "dia inteiro" : `${A.paraHora(x.ini)}–${A.paraHora(x.fim)}`}</dd>
        ${x.motivo ? `<dt>Motivo</dt><dd>${esc(x.motivo)}</dd>` : ""}
      </dl>
      ${pode(x.barbeiroId) ? `<button class="botao botao-linha p-perigo" type="button" data-remover style="width:100%">Remover bloqueio</button>` : ""}`;
    $("#detalhe").onclick = async (e) => {
      if (e.target.closest("[data-fechar]")) return folhaDetalhe.close();
      if (!e.target.closest("[data-remover]")) return;
      const r = await A.removerBloqueio(id);
      folhaDetalhe.close(); renderAgenda(); renderHorarios();
      avisar(r.ok ? "Bloqueio removido." : r.mensagem);
    };
    folhaDetalhe.showModal();
  }

  // ================= registrar horário =================
  const folhaNovo = $("#folha-novo"), form = $("#form-novo");
  const campo = (id) => $("#n-" + id);
  function opcoesFormulario() {
    campo("servico").innerHTML = CONFIG.servicos.map((s) => `<option value="${s.id}">${esc(s.nome)} · ${s.duracao} min · ${brl(s.preco)}</option>`).join("");
    campo("barbeiro").innerHTML = CONFIG.barbeiros.filter((b) => pode(b.id)).map((b) => `<option value="${b.id}">${esc(b.nome)} #${b.numero}</option>`).join("");
    campo("barbeiro").disabled = !ehDono();
  }
  function preencherDias(preferido) {
    const b = campo("barbeiro").value, opc = [];
    for (let i = 0; i < 40 && opc.length < 30; i++) {
      const k = A.chaveDia(A.somaDias(A.hoje(), i));
      if (A.diaAberto(k, b)) opc.push(k);
    }
    campo("dia").innerHTML = opc.map((k) => `<option value="${k}">${A.rotuloDia(k)}</option>`).join("");
    if (preferido && opc.includes(preferido)) campo("dia").value = preferido;
  }
  function preencherHoras(preferido) {
    const livres = campo("dia").value ? A.horariosLivres(campo("dia").value, campo("servico").value, campo("barbeiro").value, true) : [];
    const sel = campo("hora");
    sel.innerHTML = livres.length ? livres.map((x) => `<option value="${x.ini}">${A.paraHora(x.ini)}</option>`).join("") : `<option value="">Sem horário livre</option>`;
    $("#e-hora").textContent = "";
    if (preferido != null) {
      if (livres.some((x) => x.ini === preferido)) sel.value = String(preferido);
      else if (livres.length) {
        const perto = livres.reduce((m, x) => (Math.abs(x.ini - preferido) < Math.abs(m.ini - preferido) ? x : m));
        sel.value = String(perto.ini);
        $("#e-hora").textContent = `Esse serviço não cabe às ${A.paraHora(preferido)}. Sugeri ${A.paraHora(perto.ini)}.`;
      }
    }
  }
  campo("barbeiro").addEventListener("change", () => { preencherDias(campo("dia").value); preencherHoras(); });
  campo("dia").addEventListener("change", () => preencherHoras());
  campo("servico").addEventListener("change", () => preencherHoras(Number(campo("hora").value) || null));
  campo("tel").addEventListener("input", (e) => { e.target.value = telBonito(e.target.value); });

  function abrirNovo({ barbeiroId, data, ini } = {}) {
    form.reset();
    opcoesFormulario();
    $("#e-nome").textContent = "";
    campo("barbeiro").value = barbeiroId || filtro || meuBarbeiro || campo("barbeiro").options[0]?.value;
    preencherDias(data || dia);
    preencherHoras(ini ?? null);
    folhaNovo.showModal();
    campo("nome").focus();
  }
  form.addEventListener("click", (e) => { if (e.target.closest("[data-fechar]")) folhaNovo.close(); });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nome = campo("nome").value.trim(), hora = campo("hora").value;
    $("#e-nome").textContent = nome.length < 2 ? "Escreva o nome do cliente." : "";
    $("#e-hora").textContent = hora ? "" : "Escolha outro dia: este não tem horário livre.";
    if (nome.length < 2) return campo("nome").focus();
    if (!hora) return campo("dia").focus();
    const dados = { data: campo("dia").value, ini: Number(hora), servicoId: campo("servico").value, barbeiroId: campo("barbeiro").value,
      nome, telefone: campo("tel").value, origem: form.origem.value, obs: campo("obs").value, equipe: true };
    const botao = form.querySelector("[type=submit]"); botao.disabled = true;
    const r = await A.criar(dados);
    botao.disabled = false;
    if (!r.ok) { preencherHoras(Number(hora)); $("#e-hora").textContent = r.mensagem || "Esse horário acabou de ser ocupado. Escolha outro."; return campo("hora").focus(); }
    folhaNovo.close();
    destacar = r.agendamento.id;
    if (filtro && filtro !== dados.barbeiroId) filtro = null;
    await irParaDia(dados.data);
    avisar(`Salvo: ${nome}, ${A.rotuloDia(dados.data)} às ${A.paraHora(dados.ini)} com ${A.barbeiro(dados.barbeiroId).nome}.`);
    $(`.p-bloco[data-id="${r.agendamento.id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  });

  // ================= HORÁRIOS (expediente + bloqueios) =================
  const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0];
  const hhmm = (min) => (min == null ? "" : A.paraHora(min));
  const minDe = (v) => (v ? A.paraMin(v) : null);
  let hBarbeiro = null;

  function renderHorarios() {
    const opc = CONFIG.barbeiros.filter((b) => pode(b.id));
    if (!hBarbeiro || !pode(hBarbeiro)) hBarbeiro = meuBarbeiro || opc[0]?.id;
    $("#h-barbeiro").innerHTML = opc.map((b) => `<option value="${b.id}">${esc(b.nome)} #${b.numero}</option>`).join("");
    $("#h-barbeiro").value = hBarbeiro;
    $("#h-barbeiro").disabled = opc.length < 2;
    $("#semana").innerHTML = ORDEM_SEMANA.map((d) => {
      const e = A.expediente(hBarbeiro, d), almoco = e.almocoIni != null;
      return `<fieldset class="p-semana-dia" data-d="${d}" ${e.aberto ? "" : "data-fechado"}>
        <legend class="sr-only">${Dia(d)}</legend>
        <label class="p-check p-semana-nome"><input type="checkbox" data-k="aberto" ${e.aberto ? "checked" : ""}><span>${Dia(d)}</span></label>
        <div class="p-horas"><label class="sr-only" for="ab-${d}">Abre</label><input id="ab-${d}" type="time" step="900" data-k="abre" value="${hhmm(e.abre)}" ${e.aberto ? "" : "disabled"}>
          <span aria-hidden="true">–</span><label class="sr-only" for="fe-${d}">Fecha</label><input id="fe-${d}" type="time" step="900" data-k="fecha" value="${hhmm(e.fecha)}" ${e.aberto ? "" : "disabled"}></div>
        <label class="p-check p-almoco"><input type="checkbox" data-k="almoco" ${almoco ? "checked" : ""} ${e.aberto ? "" : "disabled"}><span>Almoço</span></label>
        <div class="p-horas"><label class="sr-only" for="ai-${d}">Almoço começa</label><input id="ai-${d}" type="time" step="900" data-k="almocoIni" value="${hhmm(e.almocoIni ?? 720)}" ${e.aberto && almoco ? "" : "disabled"}>
          <span aria-hidden="true">–</span><label class="sr-only" for="af-${d}">Almoço termina</label><input id="af-${d}" type="time" step="900" data-k="almocoFim" value="${hhmm(e.almocoFim ?? 780)}" ${e.aberto && almoco ? "" : "disabled"}></div>
      </fieldset>`;
    }).join("");
    $("#exp-msg").textContent = "";
    // bloqueios
    $("#bq-data").min = hojeK(); $("#bq-ate").min = hojeK();
    if (!$("#bq-data").value) $("#bq-data").value = hojeK();
    const lista = A.bloqueiosDe(hBarbeiro);
    $("#lista-bloqueios").innerHTML = lista.length ? lista.map((x) => `<li>
        <span><b>${A.rotuloDia(x.data)}</b> · ${x.ini === 0 && x.fim === 1440 ? "dia inteiro" : `${A.paraHora(x.ini)}–${A.paraHora(x.fim)}`}${x.motivo ? ` · ${esc(x.motivo)}` : ""}</span>
        <button type="button" data-remover="${x.id}">Remover</button></li>`).join("")
      : `<li class="p-vazio">Nenhum bloqueio marcado.</li>`;
  }

  $("#h-barbeiro").addEventListener("change", (e) => { hBarbeiro = e.target.value; renderHorarios(); });
  $("#semana").addEventListener("change", (e) => {
    const fs = e.target.closest(".p-semana-dia");
    if (!fs) return;
    const aberto = fs.querySelector('[data-k="aberto"]').checked, almoco = fs.querySelector('[data-k="almoco"]').checked;
    fs.toggleAttribute("data-fechado", !aberto);
    fs.querySelectorAll('[data-k="abre"],[data-k="fecha"],[data-k="almoco"]').forEach((i) => (i.disabled = !aberto));
    fs.querySelectorAll('[data-k="almocoIni"],[data-k="almocoFim"]').forEach((i) => (i.disabled = !aberto || !almoco));
  });
  function lerSemana() {
    const semana = {}, erros = [];
    $("#semana").querySelectorAll(".p-semana-dia").forEach((fs) => {
      const d = Number(fs.dataset.d), v = (k) => fs.querySelector(`[data-k="${k}"]`);
      const aberto = v("aberto").checked, almoco = aberto && v("almoco").checked;
      const x = { aberto, abre: minDe(v("abre").value) ?? 540, fecha: minDe(v("fecha").value) ?? 1140,
        almocoIni: almoco ? minDe(v("almocoIni").value) : null, almocoFim: almoco ? minDe(v("almocoFim").value) : null };
      if (aberto && !(x.abre < x.fecha)) erros.push(`${Dia(d)}: o horário de fechar tem que ser depois do de abrir.`);
      if (almoco && !(x.almocoIni != null && x.almocoFim != null && x.almocoIni < x.almocoFim && x.almocoIni >= x.abre && x.almocoFim <= x.fecha))
        erros.push(`${Dia(d)}: o almoço tem que ficar dentro do expediente.`);
      semana[d] = x;
    });
    return { semana, erros };
  }
  $("#copiar-terca").addEventListener("click", () => {
    const origem = $('.p-semana-dia[data-d="2"]');
    for (const d of [3, 4, 5]) {
      const alvo = $(`.p-semana-dia[data-d="${d}"]`);
      origem.querySelectorAll("[data-k]").forEach((i) => { const a = alvo.querySelector(`[data-k="${i.dataset.k}"]`); if (i.type === "checkbox") a.checked = i.checked; else a.value = i.value; });
      alvo.querySelector('[data-k="aberto"]').dispatchEvent(new Event("change", { bubbles: true }));
    }
    $("#exp-msg").textContent = "Copiado. Confira e toque em Salvar."; $("#exp-msg").dataset.tipo = "ok";
  });
  $("#form-expediente").addEventListener("submit", async (e) => {
    e.preventDefault();
    const { semana, erros } = lerSemana(), msg = $("#exp-msg");
    if (erros.length) { msg.textContent = erros[0]; msg.dataset.tipo = "erro"; return; }
    const r = await A.salvarExpediente(hBarbeiro, semana);
    msg.textContent = r.ok ? `Expediente de ${A.barbeiro(hBarbeiro).nome} salvo. O app já mostra os horários novos.` : r.mensagem;
    msg.dataset.tipo = r.ok ? "ok" : "erro";
  });

  $("#bq-inteiro").addEventListener("change", (e) => document.querySelectorAll(".bq-periodo").forEach((c) => (c.hidden = e.target.checked)));
  document.querySelectorAll(".bq-periodo").forEach((c) => (c.hidden = true));
  $("#form-bloqueio").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#bq-msg"), de = $("#bq-data").value, ate = $("#bq-ate").value || de, inteiro = $("#bq-inteiro").checked;
    const ini = inteiro ? 0 : minDe($("#bq-ini").value), fim = inteiro ? 1440 : minDe($("#bq-fim").value);
    const erro = (t) => { msg.textContent = t; msg.dataset.tipo = "erro"; };
    if (!de || de < hojeK()) return erro("Escolha um dia a partir de hoje.");
    if (ate < de) return erro("O último dia tem que ser depois do primeiro.");
    if (!inteiro && !(ini < fim)) return erro("O fim do bloqueio tem que ser depois do começo.");
    const dias = [];
    for (let d = A.deChave(de); A.chaveDia(d) <= ate && dias.length < 31; d = A.somaDias(d, 1)) dias.push(A.chaveDia(d));
    let ok = 0, ultimo;
    for (const k of dias) { const r = await A.criarBloqueio({ barbeiroId: hBarbeiro, data: k, ini, fim, motivo: $("#bq-motivo").value }); if (r.ok) ok++; else ultimo = r.mensagem; }
    msg.textContent = ok ? `${ok === 1 ? "Bloqueio salvo" : `${ok} dias bloqueados`}.${ultimo ? " " + ultimo : ""}` : ultimo; msg.dataset.tipo = ok ? "ok" : "erro";
    $("#bq-motivo").value = ""; $("#bq-ate").value = "";
    renderHorarios();
  });
  $("#lista-bloqueios").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-remover]");
    if (!b) return;
    b.disabled = true;
    const r = await A.removerBloqueio(b.dataset.remover);
    if (!r.ok) avisar(r.mensagem);
    renderHorarios();
  });

  // ================= EQUIPE (dono) =================
  const ESPORTES = { futebol: "Futebol", nba: "Basquete", f1: "F1" };
  async function renderEquipe() {
    $("#cartoes").innerHTML = CONFIG.barbeiros.map((b) => `<form class="p-cartao-barbeiro" data-b="${b.id}" novalidate>
      <div class="campo"><label for="cb-nome-${b.id}">Nome</label><input id="cb-nome-${b.id}" data-k="nome" maxlength="30" value="${esc(b.nome)}" required></div>
      <div class="campo"><label for="cb-num-${b.id}">Número</label><input id="cb-num-${b.id}" data-k="numero" type="number" min="0" max="99" value="${b.numero}"></div>
      <div class="campo"><label for="cb-esp-${b.id}">Esporte do cartão</label><select id="cb-esp-${b.id}" data-k="esporte">${Object.entries(ESPORTES).map(([k, v]) => `<option value="${k}" ${b.esporte === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
      <div class="campo"><label for="cb-pos-${b.id}">Posição</label><input id="cb-pos-${b.id}" data-k="posicao" maxlength="30" value="${esc(b.posicao)}"></div>
      <div class="campo p-campo-largo"><label for="cb-espc-${b.id}">Especialidade</label><input id="cb-espc-${b.id}" data-k="especialidade" maxlength="60" value="${esc(b.especialidade)}"></div>
      <button class="botao botao-linha" type="submit">Salvar ${esc(b.nome)}</button></form>`).join("");

    if (!nuvem) {
      $("#acessos").innerHTML = `<p class="secao-sub">Na versão com login, cada barbeiro cria a conta dele no app e você libera o acesso aqui pelo e-mail.
        O barbeiro vê só a agenda dele; você vê todos. Nesta demonstração, use o seletor “Ver como” no topo para testar.</p>`;
      return;
    }
    $("#acessos").innerHTML = `<p class="secao-sub">A pessoa cria a conta no app com o e-mail dela. Depois você libera aqui.</p>
      <ul class="p-acessos" id="lista-acessos"><li class="p-vazio">Carregando…</li></ul>
      <form id="form-acesso" class="p-acesso-form" novalidate>
        <div class="campo p-campo-largo"><label for="ac-email">E-mail da conta</label><input id="ac-email" type="email" inputmode="email" required></div>
        <div class="campo"><label for="ac-papel">Acesso</label><select id="ac-papel"><option value="barbeiro">Barbeiro</option><option value="dono">Dono</option><option value="cliente">Tirar acesso (vira cliente)</option></select></div>
        <div class="campo"><label for="ac-barbeiro">Agenda de</label><select id="ac-barbeiro">${CONFIG.barbeiros.map((b) => `<option value="${b.id}">${esc(b.nome)} #${b.numero}</option>`).join("")}</select></div>
        <p class="conta-msg p-campo-largo" id="ac-msg" role="status" aria-live="polite"></p>
        <button class="botao botao-cheio p-campo-largo" type="submit">Salvar acesso</button></form>`;
    $("#ac-papel").onchange = (e) => ($("#ac-barbeiro").closest(".campo").hidden = e.target.value !== "barbeiro");
    $("#form-acesso").onsubmit = async (e) => {
      e.preventDefault();
      const msg = $("#ac-msg"), email = $("#ac-email").value.trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) { msg.textContent = "Escreva um e-mail válido."; msg.dataset.tipo = "erro"; return; }
      const r = await Nuvem.definirEquipe(email, $("#ac-papel").value, $("#ac-barbeiro").value);
      msg.textContent = r.ok ? "Acesso salvo. A pessoa precisa sair e entrar de novo no painel." : r.mensagem; msg.dataset.tipo = r.ok ? "ok" : "erro";
      if (r.ok) listarAcessos();
    };
    listarAcessos();
  }
  async function listarAcessos() {
    const r = await Nuvem.listaEquipe();
    const PAPEIS = { dono: "Dono", barbeiro: "Barbeiro" };
    $("#lista-acessos").innerHTML = !r.ok ? `<li class="p-vazio">${esc(r.mensagem)}</li>` : r.lista.length ? r.lista.map((p) => `<li>
      <span><b>${esc(p.nome || p.email)}</b> · ${esc(p.email)}</span><span class="p-papel">${PAPEIS[p.papel]}${p.barbeiro_id ? " · " + esc(A.barbeiro(p.barbeiro_id).nome) : ""}</span></li>`).join("")
      : `<li class="p-vazio">Só você por enquanto.</li>`;
  }
  $("#cartoes").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target.closest("form"), v = (k) => f.querySelector(`[data-k="${k}"]`).value.trim();
    if (v("nome").length < 2) return avisar("Escreva o nome do barbeiro.");
    const r = await A.salvarBarbeiro({ id: f.dataset.b, nome: v("nome"), numero: Math.max(0, Math.min(99, Number(v("numero")) || 0)), esporte: v("esporte"), posicao: v("posicao"), especialidade: v("especialidade") });
    avisar(r.ok ? `Cartão de ${v("nome")} salvo.` : r.mensagem);
    if (r.ok) { renderEquipe(); renderAgenda(); }
  });

  // ================= abas, papéis, avisos =================
  function irAba(nova) {
    if (nova === "equipe" && !ehDono()) nova = "agenda";
    aba = nova;
    document.querySelectorAll(".p-abas [data-aba]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.aba === aba)));
    ["agenda", "horarios", "equipe"].forEach((x) => ($(`#aba-${x}`).hidden = x !== aba));
    ({ agenda: renderAgenda, horarios: renderHorarios, equipe: renderEquipe })[aba]();
  }
  function aplicarPapel() {
    filtro = ehDono() ? null : meuBarbeiro;
    $("#aba-equipe-btn").hidden = !ehDono();
    $("#quem").textContent = ehDono() ? "Dono · todos os barbeiros" : `${A.barbeiro(meuBarbeiro).nome} · sua agenda`;
    $("#legenda-exemplo").hidden = nuvem;
    $("#apagar").hidden = nuvem;
    irAba(aba);
  }

  let tempoAviso;
  function avisar(txt) {
    const t = $("#toast");
    t.textContent = txt; t.classList.add("visivel");
    clearTimeout(tempoAviso); tempoAviso = setTimeout(() => t.classList.remove("visivel"), 3600);
  }

  // ================= eventos =================
  $("#novo").addEventListener("click", () => abrirNovo());
  $("#hoje").addEventListener("click", () => irParaDia(hojeK()));
  $("#anterior").addEventListener("click", () => irParaDia(A.chaveDia(A.somaDias(A.deChave(dia), -1))));
  $("#seguinte").addEventListener("click", () => irParaDia(A.chaveDia(A.somaDias(A.deChave(dia), 1))));
  $("#dias").addEventListener("click", (e) => { const b = e.target.closest("[data-dia]"); if (b) irParaDia(b.dataset.dia); });
  $("#filtros").addEventListener("click", (e) => { const b = e.target.closest("[data-b]"); if (b) { filtro = b.dataset.b || null; renderAgenda(); } });
  $("#grade").addEventListener("click", (e) => {
    const bloco = e.target.closest(".p-bloco");
    if (bloco) return abrirDetalhe(bloco.dataset.id);
    const bq = e.target.closest(".p-bloq");
    if (bq) return abrirBloqueio(bq.dataset.bloq);
    const livre = e.target.closest(".p-livre");
    if (livre) abrirNovo({ barbeiroId: livre.dataset.b, data: dia, ini: Number(livre.dataset.ini) });
  });
  document.querySelector(".p-abas").addEventListener("click", (e) => { const b = e.target.closest("[data-aba]"); if (b) irAba(b.dataset.aba); });
  [folhaDetalhe, folhaNovo].forEach((f) => f.addEventListener("click", (e) => { if (e.target === f) f.close(); }));

  let confirmandoApagar = false;
  $("#apagar").addEventListener("click", (e) => {
    if (!confirmandoApagar) { confirmandoApagar = true; e.target.textContent = "Toque de novo para apagar tudo"; return; }
    A.apagarTudo(); confirmandoApagar = false; e.target.textContent = "Apagar dados de teste"; irAba(aba); avisar("Dados de teste apagados.");
  });

  // ================= entrada =================
  function mostrarPainel(sim) {
    $("#painel").hidden = !sim; $("#login").hidden = sim;
    $("#novo").hidden = !sim; $("#sair").hidden = !(nuvem && Nuvem.usuario);
  }

  async function entrarComPerfil() {
    if (!Nuvem.usuario) { mostrarPainel(false); return; }
    if (!Nuvem.equipe) {
      mostrarPainel(false);
      $("#l-msg").textContent = `Sua conta (${Nuvem.usuario.email}) ainda não tem acesso ao painel. Peça ao dono para liberar na aba Equipe.`;
      $("#l-msg").dataset.tipo = "erro"; $("#sair").hidden = false;
      return;
    }
    papel = Nuvem.perfil.papel; meuBarbeiro = Nuvem.perfil.barbeiroId;
    await A.iniciar(); periodo = null; await garantir(dia);
    mostrarPainel(true);
    aplicarPapel();
  }

  async function comecar() {
    if (!nuvem) {
      // demonstração: escolhe quem está "logado" para testar as permissões
      $("#ver-como-caixa").hidden = false;
      await A.iniciar();
      $("#ver-como").innerHTML = `<option value="dono">Dono</option>` + CONFIG.barbeiros.map((b) => `<option value="${b.id}">${esc(b.nome)}</option>`).join("");
      let salvo; try { salvo = sessionStorage.getItem("hattrick_ver_como"); } catch { /* ok */ }
      if (salvo && (salvo === "dono" || CONFIG.barbeiros.some((b) => b.id === salvo))) $("#ver-como").value = salvo;
      const aplicarVerComo = () => {
        const v = $("#ver-como").value;
        papel = v === "dono" ? "dono" : "barbeiro"; meuBarbeiro = v === "dono" ? null : v;
        try { sessionStorage.setItem("hattrick_ver_como", v); } catch { /* ok */ }
        aplicarPapel();
      };
      $("#ver-como").onchange = aplicarVerComo;
      mostrarPainel(true);
      aplicarVerComo();
      addEventListener("storage", () => irAba(aba));
      return;
    }
    $("#aviso-modo").hidden = true;
    mostrarPainel(false);
    const comAte = (p, ms) => Promise.race([p, new Promise((_, nao) => setTimeout(() => nao(new Error("tempo")), ms))]);
    try { await comAte(Nuvem.iniciarSessao(), 8000); await comAte(entrarComPerfil(), 15000); }
    catch { $("#l-msg").textContent = "Não deu para falar com a agenda. Confira a internet e recarregue a página."; $("#l-msg").dataset.tipo = "erro"; }
    Nuvem.aoMudarSessao(() => entrarComPerfil());
    Nuvem.aoMudarAgenda(recarregar);
  }

  $("#form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#l-msg"), email = $("#l-email").value.trim(), senha = $("#l-senha").value;
    if (!email || !senha) { msg.textContent = "Escreva e-mail e senha."; msg.dataset.tipo = "erro"; return; }
    const botao = e.target.querySelector("[type=submit]"); botao.disabled = true; botao.textContent = "Entrando…";
    const r = await Nuvem.entrar(email, senha);
    botao.disabled = false; botao.textContent = "Entrar";
    if (!r.ok) { msg.textContent = r.mensagem; msg.dataset.tipo = "erro"; return; }
    msg.textContent = "";
    await entrarComPerfil();
  });
  $("#sair").addEventListener("click", async () => { await Nuvem.sair(); $("#l-msg").textContent = ""; mostrarPainel(false); });

  setInterval(() => { if (aba === "agenda") renderAgenda(); }, 60000);
  comecar();
})();
