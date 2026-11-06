// Painel do barbeiro: agenda do dia em colunas, resumo e registro de horários
// marcados por WhatsApp, telefone ou no balcão.
(() => {
  const A = Agenda;
  const $ = (s, el = document) => el.querySelector(s);
  const brl = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const icone = (id) => `<svg aria-hidden="true"><use href="#${id}"/></svg>`;
  const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const STATUS = { confirmado: "Confirmado", atendido: "Atendido", faltou: "Faltou", cancelado: "Cancelado" };
  const PX = 2.4; // pixels por minuto na grade
  const minAgora = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  const hojeK = () => A.chaveDia(new Date());
  const horas = (min) => (min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, "0") : ""}` : `${min} min`);
  const telBonito = (d) => (d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}` : d);

  let dia = hojeK();
  let filtro = null; // id do barbeiro ou null = todos
  let destacar = null; // id do horário recém-criado

  // ================= resumo do dia =================
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
    const ocupado = ativos.reduce((s, a) => s + a.dur, 0);

    $("#n-total").textContent = ativos.length;
    $("#n-status").textContent = `${n("atendido")} atendidos · ${n("faltou")} faltas`;
    $("#n-valor").textContent = brl(previsto);
    $("#n-feito").textContent = `${brl(feito)} já atendido`;
    $("#n-ocup").textContent = trabalho ? `${Math.round((ocupado / trabalho) * 100)}%` : "—";
    $("#n-livre").textContent = trabalho ? `${horas(Math.max(0, trabalho - ocupado))} livres` : "Fechado";

    const depois = dia === hojeK() ? minAgora() : -1;
    const prox = ativos.find((a) => a.status === "confirmado" && a.ini >= depois && dia >= hojeK());
    $("#n-prox").textContent = prox ? A.paraHora(prox.ini) : "—";
    $("#n-prox-info").textContent = prox ? `${prox.nome} · ${A.barbeiro(prox.barbeiroId).nome}` : dia < hojeK() ? "Dia encerrado" : "Ninguém na fila";

    // de onde vieram
    const cont = {};
    ativos.forEach((a) => (cont[a.origem || "app"] = (cont[a.origem || "app"] || 0) + 1));
    const fora = ativos.length ? Math.round((ativos.filter((a) => (a.origem || "app") !== "app").length / ativos.length) * 100) : 0;
    $("#origens").innerHTML = Object.entries(A.ORIGENS).map(([id, nome]) =>
      `<span class="p-origem-item" data-origem="${id}">${icone("o-" + id)}${nome}<b>${cont[id] || 0}</b></span>`).join("") +
      (ativos.length ? `<span class="p-origem-nota">${fora}% marcados fora do app</span>` : "");
  }

  // ================= dias =================
  function renderDias() {
    const d = A.deChave(dia);
    const t = d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
    $("#titulo-dia").textContent = (dia === hojeK() ? "Hoje, " : "") + t;
    $("#hoje").disabled = dia === hojeK();
    const lista = [];
    for (let i = 0; i < 14; i++) lista.push(A.chaveDia(A.somaDias(A.hoje(), i)));
    $("#dias").innerHTML = lista.map((k) => {
      const dd = A.deChave(k), aberto = A.diaAberto(k);
      const qtd = aberto ? A.doDia(k, filtro).length : 0;
      return `<button type="button" class="p-chip-dia" data-dia="${k}" aria-pressed="${k === dia}" ${aberto ? "" : 'data-fechado="1"'}
        aria-label="${A.rotuloDia(k)}, ${aberto ? qtd + " horários" : "fechado"}">
        <small>${k === hojeK() ? "Hoje" : DIAS[dd.getDay()].slice(0, 3)}</small><b>${String(dd.getDate()).padStart(2, "0")}</b>
        <span>${aberto ? qtd : "—"}</span></button>`;
    }).join("");
    $(`.p-chip-dia[data-dia="${dia}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function renderFiltros() {
    $("#filtros").innerHTML = [{ id: "", nome: "Todos" }, ...CONFIG.barbeiros].map((b) =>
      `<button type="button" class="p-filtro" data-b="${b.id}" aria-pressed="${(filtro || "") === b.id}">${b.numero ? `<i>#${b.numero}</i>` : ""}${esc(b.nome)}</button>`).join("");
  }

  // ================= grade =================
  function limites(k, ids) {
    const blocos = ids.flatMap((id) => A.blocosDeTrabalho(k, id));
    if (!blocos.length) return null;
    return [Math.min(...blocos.map((x) => x[0])), Math.max(...blocos.map((x) => x[1]))];
  }
  // trechos livres dentro do expediente, descontando os horários marcados
  function lacunas(blocos, ocupados) {
    const res = [];
    for (const [ini, fim] of blocos) {
      let t = ini;
      for (const a of ocupados.filter((x) => x.ini < fim && x.ini + x.dur > ini)) {
        if (a.ini > t) res.push([t, a.ini]);
        t = Math.max(t, a.ini + a.dur);
      }
      if (t < fim) res.push([t, fim]);
    }
    return res.filter(([i, f]) => f - i >= CONFIG.passoMin);
  }

  function renderGrade() {
    const barbeiros = CONFIG.barbeiros.filter((b) => !filtro || b.id === filtro);
    const lim = limites(dia, CONFIG.barbeiros.map((b) => b.id));
    const grade = $("#grade");
    $("#fechado").hidden = !!lim;
    grade.hidden = !lim;
    if (!lim) return (grade.innerHTML = "");
    const [ini, fim] = lim;
    const altura = (fim - ini) * PX;
    const y = (min) => (min - ini) * PX;
    const ehHoje = dia === hojeK(), agora = minAgora();
    const passado = dia < hojeK();

    let regua = "";
    for (let t = Math.ceil(ini / 60) * 60; t <= fim; t += 60) regua += `<span style="top:${y(t)}px">${A.paraHora(t)}</span>`;

    const colunas = barbeiros.map((b) => {
      const blocos = A.blocosDeTrabalho(dia, b.id);
      const ag = A.doDia(dia, b.id);
      let corpo = "";
      if (!blocos.length) {
        corpo = `<div class="p-folga">Folga</div>`;
      } else {
        // fora do expediente e almoço
        let t = ini;
        for (const [bi, bf] of blocos) {
          if (bi > t) corpo += `<div class="p-fora" style="top:${y(t)}px;height:${(bi - t) * PX}px">${t === ini ? "" : "Almoço"}</div>`;
          t = bf;
        }
        if (t < fim) corpo += `<div class="p-fora" style="top:${y(t)}px;height:${(fim - t) * PX}px"></div>`;
        // livres
        if (!passado) {
          for (const [li, lf] of lacunas(blocos, ag)) {
            const comeco = ehHoje ? Math.max(li, Math.ceil((agora + 1) / CONFIG.passoMin) * CONFIG.passoMin) : li;
            if (lf - comeco < CONFIG.passoMin) continue;
            const h = (lf - comeco) * PX;
            corpo += `<button type="button" class="p-livre" style="top:${y(comeco)}px;height:${h}px" data-b="${b.id}" data-ini="${comeco}"
              aria-label="Livre das ${A.paraHora(comeco)} às ${A.paraHora(lf)} com ${esc(b.nome)}. Encaixar cliente">
              ${h >= 30 ? `<span>${icone("i-mais")}${A.paraHora(comeco)}${h >= 60 ? `–${A.paraHora(lf)}` : ""}</span>` : ""}</button>`;
          }
        }
        // horários marcados
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
        <div class="p-col-topo"><i>#${b.numero}</i><b>${esc(b.nome)}</b><small>${blocos.length ? `${qtd} ${qtd === 1 ? "horário" : "horários"}` : "folga"}</small></div>
        <div class="p-col-corpo" style="height:${altura}px">${corpo}</div></div>`;
    }).join("");

    const linhaAgora = ehHoje && agora >= ini && agora <= fim
      ? `<div class="p-agora" style="top:${y(agora)}px"><span>${A.paraHora(agora)}</span></div>` : "";
    grade.style.setProperty("--colunas", barbeiros.length);
    grade.innerHTML = `<div class="p-regua" style="height:${altura}px">${regua}</div>
      <div class="p-cols">${colunas}<div class="p-agora-faixa" style="height:${altura}px">${linhaAgora}</div></div>`;
    if (destacar) setTimeout(() => { destacar = null; }, 1500);
  }

  function render() {
    const todos = A.doDia(dia, filtro, true);
    renderDias();
    renderFiltros();
    renderResumo(todos);
    renderGrade();
  }

  // ================= detalhe =================
  const folhaDetalhe = $("#folha-detalhe");
  let confirmandoCancelar = false;
  function abrirDetalhe(id) {
    const a = A.doDia(dia, null, true).find((x) => x.id === id);
    if (!a) return;
    const s = A.servico(a.servicoId), b = A.barbeiro(a.barbeiroId), o = a.origem || "app";
    const tel = a.telefone || "";
    const msg = encodeURIComponent(`Olá, ${a.nome}! Aqui é da Hat-Trick. Confirmando seu horário: ${s.nome}, ${A.rotuloDia(a.data)} às ${A.paraHora(a.ini)} com ${b.nome}.`);
    const acoes = a.status === "confirmado"
      ? `<button class="botao botao-cheio" type="button" data-st="atendido">${icone("i-check")}Atendido</button>
         <button class="botao botao-linha" type="button" data-st="faltou">Faltou</button>
         <button class="botao botao-linha p-perigo" type="button" data-st="cancelado">${confirmandoCancelar ? "Toque de novo para cancelar" : "Cancelar horário"}</button>`
      : `<button class="botao botao-linha" type="button" data-st="confirmado">Voltar para confirmado</button>`;
    $("#detalhe").innerHTML = `
      <div class="folha-topo">
        <h2 id="d-nome">${esc(a.nome)}</h2>
        <button class="fechar" type="button" data-fechar aria-label="Fechar">${icone("i-x")}</button>
      </div>
      <p class="p-d-status" data-status="${a.status}">${STATUS[a.status]}${a.exemplo ? " · horário de exemplo" : ""}</p>
      <dl class="resumo">
        <dt>Horário</dt><dd>${A.rotuloDia(a.data)}, ${A.paraHora(a.ini)}–${A.paraHora(a.ini + a.dur)}</dd>
        <dt>Serviço</dt><dd>${esc(s.nome)} · ${brl(s.preco)}</dd>
        <dt>Barbeiro</dt><dd>${esc(b.nome)} #${b.numero}</dd>
        <dt>Marcado por</dt><dd class="p-d-origem">${icone("o-" + o)}${A.ORIGENS[o]}</dd>
        ${tel ? `<dt>Celular</dt><dd>${telBonito(tel)}</dd>` : ""}
        ${a.codigo ? `<dt>Código</dt><dd>${a.codigo}</dd>` : ""}
        ${a.obs ? `<dt>Observação</dt><dd>${esc(a.obs)}</dd>` : ""}
      </dl>
      ${tel ? `<div class="acoes p-d-contato">
        <a class="botao botao-linha" href="https://wa.me/55${tel}?text=${msg}" target="_blank" rel="noopener">${icone("o-whatsapp")}Confirmar no WhatsApp</a>
        <a class="botao botao-linha" href="tel:+55${tel}">${icone("o-telefone")}Ligar</a></div>` : ""}
      <div class="p-d-acoes">${acoes}</div>`;
    $("#detalhe").onclick = (e) => {
      if (e.target.closest("[data-fechar]")) return folhaDetalhe.close();
      const bt = e.target.closest("[data-st]");
      if (!bt) return;
      const st = bt.dataset.st;
      if (st === "cancelado" && !confirmandoCancelar) { confirmandoCancelar = true; abrirDetalhe(id); $('[data-st="cancelado"]').focus(); return; }
      A.definirStatus(id, st);
      confirmandoCancelar = false;
      folhaDetalhe.close();
      render();
      avisar(`${a.nome}: ${STATUS[st].toLowerCase()}.`);
    };
    if (!folhaDetalhe.open) folhaDetalhe.showModal();
  }
  folhaDetalhe.addEventListener("close", () => { confirmandoCancelar = false; });

  // ================= registrar horário =================
  const folhaNovo = $("#folha-novo"), form = $("#form-novo");
  const campo = (id) => $("#n-" + id);
  campo("servico").innerHTML = CONFIG.servicos.map((s) => `<option value="${s.id}">${esc(s.nome)} · ${s.duracao} min · ${brl(s.preco)}</option>`).join("");
  campo("barbeiro").innerHTML = CONFIG.barbeiros.map((b) => `<option value="${b.id}">${esc(b.nome)} #${b.numero}</option>`).join("");

  function preencherDias(preferido) {
    const b = campo("barbeiro").value, opc = [];
    for (let i = 0; i < 30 && opc.length < 21; i++) {
      const k = A.chaveDia(A.somaDias(A.hoje(), i));
      if (A.diaAberto(k, b)) opc.push(k);
    }
    campo("dia").innerHTML = opc.map((k) => `<option value="${k}">${A.rotuloDia(k)}</option>`).join("");
    if (preferido && opc.includes(preferido)) campo("dia").value = preferido;
  }
  function preencherHoras(preferido) {
    const livres = campo("dia").value ? A.horariosLivres(campo("dia").value, campo("servico").value, campo("barbeiro").value) : [];
    const sel = campo("hora");
    sel.innerHTML = livres.length ? livres.map((x) => `<option value="${x.ini}">${A.paraHora(x.ini)}</option>`).join("")
                                  : `<option value="">Sem horário livre</option>`;
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
  campo("tel").addEventListener("input", (e) => {
    const d = A.soDigitos(e.target.value).slice(0, 11);
    e.target.value = d.length > 6 ? `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}` : d.length > 2 ? `(${d.slice(0, 2)}) ${d.slice(2)}` : d;
  });

  function abrirNovo({ barbeiroId, data, ini } = {}) {
    form.reset();
    $("#e-nome").textContent = "";
    campo("barbeiro").value = barbeiroId || filtro || CONFIG.barbeiros[0].id;
    preencherDias(data || dia);
    preencherHoras(ini ?? null);
    folhaNovo.showModal();
    campo("nome").focus();
  }
  form.addEventListener("click", (e) => { if (e.target.closest("[data-fechar]")) folhaNovo.close(); });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const nome = campo("nome").value.trim(), hora = campo("hora").value;
    $("#e-nome").textContent = nome.length < 2 ? "Escreva o nome do cliente." : "";
    $("#e-hora").textContent = hora ? "" : "Escolha outro dia: este não tem horário livre.";
    if (nome.length < 2) return campo("nome").focus();
    if (!hora) return campo("dia").focus();
    const dados = { data: campo("dia").value, ini: Number(hora), servicoId: campo("servico").value, barbeiroId: campo("barbeiro").value,
      nome, telefone: campo("tel").value, origem: form.origem.value, obs: campo("obs").value };
    const r = A.criar(dados);
    if (!r.ok) { preencherHoras(Number(hora)); $("#e-hora").textContent = "Esse horário acabou de ser ocupado. Escolha outro."; return campo("hora").focus(); }
    folhaNovo.close();
    dia = dados.data; destacar = r.agendamento.id;
    if (filtro && filtro !== dados.barbeiroId) filtro = null;
    render();
    avisar(`Salvo: ${nome}, ${A.rotuloDia(dados.data)} às ${A.paraHora(dados.ini)} com ${A.barbeiro(dados.barbeiroId).nome}.`);
    $(`.p-bloco[data-id="${r.agendamento.id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  });

  // ================= avisos =================
  let tempoAviso;
  function avisar(txt) {
    const t = $("#toast");
    t.textContent = txt; t.classList.add("visivel");
    clearTimeout(tempoAviso); tempoAviso = setTimeout(() => t.classList.remove("visivel"), 3200);
  }

  // ================= eventos =================
  $("#novo").addEventListener("click", () => abrirNovo());
  $("#hoje").addEventListener("click", () => { dia = hojeK(); render(); });
  $("#anterior").addEventListener("click", () => { dia = A.chaveDia(A.somaDias(A.deChave(dia), -1)); render(); });
  $("#seguinte").addEventListener("click", () => { dia = A.chaveDia(A.somaDias(A.deChave(dia), 1)); render(); });
  $("#dias").addEventListener("click", (e) => { const b = e.target.closest("[data-dia]"); if (b) { dia = b.dataset.dia; render(); } });
  $("#filtros").addEventListener("click", (e) => { const b = e.target.closest("[data-b]"); if (b) { filtro = b.dataset.b || null; render(); } });
  $("#grade").addEventListener("click", (e) => {
    const bloco = e.target.closest(".p-bloco");
    if (bloco) return abrirDetalhe(bloco.dataset.id);
    const livre = e.target.closest(".p-livre");
    if (livre) abrirNovo({ barbeiroId: livre.dataset.b, data: dia, ini: Number(livre.dataset.ini) });
  });
  [folhaDetalhe, folhaNovo].forEach((f) => f.addEventListener("click", (e) => { if (e.target === f) f.close(); }));

  let confirmandoApagar = false;
  $("#apagar").addEventListener("click", (e) => {
    if (!confirmandoApagar) { confirmandoApagar = true; e.target.textContent = "Toque de novo para apagar tudo"; return; }
    A.apagarTudo(); confirmandoApagar = false; e.target.textContent = "Apagar horários de teste"; render(); avisar("Horários de teste apagados.");
  });

  addEventListener("storage", render); // cliente marcou pelo app em outra aba
  setInterval(render, 60000);
  render();
})();
