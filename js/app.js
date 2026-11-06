// App Hat-Trick: navegação por abas, temas (futebol, NBA, F1) e agendamento.
(() => {
  const A = Agenda;
  const $ = (s, el = document) => el.querySelector(s);
  const brl = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const icone = (esporte) => `<svg aria-hidden="true"><use href="#i-${esporte}"/></svg>`;
  const reduzMovimento = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const minAgora = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

  // ================= armazenamento de preferências =================
  const prefs = {
    ler(k) { try { return localStorage.getItem(k); } catch { return null; } },
    gravar(k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* ok */ } },
  };

  // ================= navegação =================
  const TELAS = ["inicio", "servicos", "agendar", "elenco", "temporada"];
  const render = { inicio: renderInicio, servicos: renderServicos, agendar: renderAgendar, elenco: renderElenco, temporada: renderTemporada };

  function irPara() {
    const nome = TELAS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "inicio";
    document.querySelectorAll(".tela").forEach((t) => (t.hidden = t.dataset.tela !== nome));
    document.querySelectorAll(".abas a").forEach((a) => (a.dataset.aba === nome ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    render[nome]();
    window.scrollTo({ top: 0 });
    // leva o foco para o título da tela (leitores de tela anunciam a troca)
    if (navegouPeloUsuario) $(`#t-${nome}`)?.setAttribute("tabindex", "-1"), $(`#t-${nome}`)?.focus({ preventScroll: true });
    document.title = `${{ inicio: "Hat-Trick Barber Sport", servicos: "Tabela", agendar: "Agendar", elenco: "Elenco", temporada: "Sua temporada" }[nome]} · Pelotas`;
  }
  let navegouPeloUsuario = false;
  addEventListener("hashchange", () => { navegouPeloUsuario = true; irPara(); });

  // ================= "Seu time": cores do app =================
  function luminancia(hex) {
    const c = hex.replace("#", "").match(/../g).map((x) => parseInt(x, 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  const contraste = (a, b) => { const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x); return (l1 + 0.05) / (l2 + 0.05); };
  function clarear(hex, t) {
    const c = hex.replace("#", "").match(/../g).map((x) => parseInt(x, 16));
    return "#" + c.map((v) => Math.round(v + (255 - v) * t).toString(16).padStart(2, "0")).join("");
  }
  // Versão da cor que dá para ler sobre o fundo escuro (WCAG 4,5:1)
  function legivel(hex) {
    let t = 0, cor = hex;
    while (contraste(cor, "#0c0f0d") < 4.5 && t < 1) { t += 0.05; cor = clarear(hex, t); }
    return cor;
  }

  const todosTimes = CONFIG.times.flatMap((g) => g.itens);
  const marcaTime = (t) => t.escudo
    ? `<img src="${t.escudo}" alt="" width="28" height="28" loading="lazy">`
    : `<i style="background:linear-gradient(135deg,${t.cores[0]} 50%,${t.cores[1]} 50%)"></i>`;
  function aplicarTime(id) {
    const time = todosTimes.find((t) => t.id === id);
    const raiz = document.documentElement.style;
    if (!time) {
      ["--acento", "--acento-2", "--acento-texto", "--acento-claro"].forEach((v) => raiz.removeProperty(v));
      $(".time-nome").textContent = "Seu time";
      $(".time-amostra").innerHTML = "";
    } else {
      let [c1, c2] = time.cores;
      // cor principal muito escura some no fundo: usa a secundária como destaque
      if (luminancia(c1) < 0.03) [c1, c2] = [c2, c1];
      raiz.setProperty("--acento", c1);
      raiz.setProperty("--acento-2", c2);
      raiz.setProperty("--acento-texto", contraste(c1, "#111111") >= contraste(c1, "#ffffff") ? "#111111" : "#ffffff");
      raiz.setProperty("--acento-claro", legivel(c1));
      $(".time-nome").textContent = time.nome;
      $(".time-amostra").innerHTML = time.escudo ? `<img src="${time.escudo}" alt="">` : "";
    }
    prefs.gravar("hattrick_time", time ? time.id : null);
    document.querySelectorAll(".time").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.time === (time?.id || ""))));
  }

  function montarTimes() {
    const lista = $("#lista-times");
    lista.innerHTML = `<div class="times"><button type="button" class="time" data-time=""><img src="img/logo-hattrick.png" alt="" width="28" height="28">Cores da Hat-Trick</button></div>` +
      CONFIG.times.map((g) => `<h3 class="grupo-times">${g.grupo}</h3><div class="times">${g.itens.map((t) =>
        `<button type="button" class="time" data-time="${t.id}">${marcaTime(t)}${esc(t.nome)}</button>`).join("")}</div>`).join("");
    lista.addEventListener("click", (e) => {
      const b = e.target.closest(".time");
      if (!b) return;
      aplicarTime(b.dataset.time);
      $("#folha-times").close();
    });
    $("#abrir-times").addEventListener("click", () => $("#folha-times").showModal());
    $("#folha-times").addEventListener("click", (e) => { if (e.target.id === "folha-times") e.target.close(); }); // toque fora fecha
  }

  // ================= INÍCIO =================
  function statusLoja() {
    const exp = CONFIG.expediente[new Date().getDay()];
    const m = minAgora();
    if (!exp) return { txt: "Fechada hoje", aberta: false };
    if (m < A.paraMin(exp.abre)) return { txt: `Abre ${exp.abre}`, aberta: false };
    if (m >= A.paraMin(exp.fecha)) return { txt: "Encerrada", aberta: false };
    if (exp.almoco && m >= A.paraMin(exp.almoco[0]) && m < A.paraMin(exp.almoco[1])) return { txt: "Intervalo", aberta: false };
    return { txt: "Em jogo", aberta: true };
  }
  function atualizarPlacar() {
    const d = new Date();
    $("#relogio").textContent = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const s = statusLoja();
    const el = $("#status-loja");
    el.textContent = s.txt;
    el.classList.toggle("aberta", s.aberta);
  }

  function proximoLivre() {
    for (const k of A.proximosDias("corte", null, 1)) {
      const h = A.horariosLivres(k, "corte", null)[0];
      if (h) return { data: k, ...h };
    }
    return null;
  }

  function renderInicio() {
    atualizarPlacar();
    const p = proximoLivre();
    $("#proximo-livre").innerHTML = p
      ? `<div><div class="proximo-hora">${A.paraHora(p.ini)}</div><div class="proximo-info">${A.rotuloDia(p.data)} · com ${esc(A.barbeiro(p.barbeiroId).nome)}</div></div>
         <button class="botao botao-cheio" style="width:auto" type="button" data-pegar>Pegar esse</button>`
      : `<p class="proximo-info">Sem horários nos próximos dias. Chame no WhatsApp.</p>`;
    $("[data-pegar]")?.addEventListener("click", () =>
      comecarAgendamento({ servicoId: "corte", barbeiroId: p.barbeiroId, data: p.data, ini: p.ini, etapa: 4 }));

    $("#inspiracoes").innerHTML = CONFIG.inspiracoes.map((i) => `
      <li class="insp">
        <figure class="insp-foto">
          <img src="${i.foto}" alt="${esc(i.ref)}, com ${esc(i.estilo.toLowerCase())}" width="480" height="600" loading="lazy" decoding="async">
          <span class="insp-esporte">${icone(i.esporte)}</span>
          <figcaption>Foto: <a href="${i.fonte}" target="_blank" rel="noopener">${esc(i.credito)}</a></figcaption>
        </figure>
        <div class="insp-txt">
          <small>Estilo ${esc(i.ref)}</small>
          <b>${esc(i.estilo)}</b>
          <button class="botao botao-linha" style="width:100%;min-height:42px;margin-top:10px;font-size:0.95rem" type="button" data-servico="${i.servico}">Quero esse</button>
        </div>
      </li>`).join("");
    $("#inspiracoes").onclick = (e) => {
      const b = e.target.closest("[data-servico]");
      if (b) comecarAgendamento({ servicoId: b.dataset.servico, etapa: 2 });
    };

    $("#endereco").textContent = CONFIG.endereco;
    const hoje = new Date().getDay();
    const ordem = [2, 3, 4, 5, 6, 0, 1];
    $("#horarios").innerHTML = ordem.map((d) => {
      const e = CONFIG.expediente[d];
      const cls = d === hoje ? ' class="hoje"' : "";
      return `<dt${cls}>${DIAS[d][0].toUpperCase() + DIAS[d].slice(1)}${d === hoje ? " (hoje)" : ""}</dt><dd${cls}>${e ? `${e.abre} – ${e.fecha}` : "Fechado"}</dd>`;
    }).join("");
    const msg = encodeURIComponent("Olá! Vim pelo app da Hat-Trick e queria marcar um horário.");
    $("#link-whats").href = `https://wa.me/${CONFIG.whatsapp}?text=${msg}`;
    $("#link-mapa").href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(CONFIG.nomeCompleto + " " + CONFIG.cidade)}`;
  }

  // ================= TABELA =================
  function renderServicos() {
    $("#pagamentos").textContent = CONFIG.pagamentos;
    $("#tabela-servicos").innerHTML = CONFIG.servicos.map((s) => `
      <li class="linha-servico">
        <div><b>${icone(s.esporte)}${esc(s.nome)}</b><small>${esc(s.desc)}</small></div>
        <div class="preco"><strong>${brl(s.preco)}</strong><span>${s.duracao} min</span></div>
        <a href="#agendar" data-servico="${s.id}">Agendar este</a>
      </li>`).join("");
    $("#tabela-servicos").onclick = (e) => {
      const a = e.target.closest("[data-servico]");
      if (!a) return;
      e.preventDefault();
      comecarAgendamento({ servicoId: a.dataset.servico, etapa: 2 });
    };
  }

  // ================= AGENDAR (F1) =================
  // etapas: 1 serviço · 2 barbeiro · 3 grid (dia + horário) · 4 bandeirada (dados) · 5 confirmado
  let reserva = { etapa: 1 };
  const VOLTAS = ["Serviço", "Barbeiro", "Grid", "Bandeirada"];

  function comecarAgendamento(dados) {
    reserva = { etapa: 1, ...dados };
    if (reserva.data && reserva.barbeiroId) reserva.barbeiroEscolhido = reserva.barbeiroId;
    if (location.hash === "#agendar") renderAgendar(); else location.hash = "agendar";
  }

  function renderAgendar() {
    const e = reserva.etapa;
    $("#voltas").innerHTML = VOLTAS.map((v, i) => {
      const n = i + 1, cls = n < e ? "feita" : n === e ? "atual" : "";
      return `<li class="${cls}"${n === e ? ' aria-current="step"' : ""}>Volta ${n}<br>${v}</li>`;
    }).join("");
    $("#voltas").hidden = e === 5;
    const alvo = $("#etapa");
    ({ 1: etapaServico, 2: etapaBarbeiro, 3: etapaGrid, 4: etapaDados, 5: etapaConfirmado })[e](alvo);
  }
  const avancar = (n) => { reserva.etapa = n; renderAgendar(); $("#etapa .etapa-titulo")?.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: reduzMovimento ? "auto" : "smooth" }); };
  const voltar = (n) => `<button class="botao botao-linha" type="button" data-voltar="${n}" aria-label="Voltar">←</button>`;
  function ligarVoltar(alvo) { alvo.querySelectorAll("[data-voltar]").forEach((b) => (b.onclick = () => avancar(Number(b.dataset.voltar)))); }

  function etapaServico(alvo) {
    alvo.innerHTML = `<h2 class="etapa-titulo" tabindex="-1">Qual serviço?</h2><div class="opcoes">${CONFIG.servicos.map((s) => `
      <button type="button" class="opcao" data-id="${s.id}" aria-pressed="${reserva.servicoId === s.id}">
        ${icone(s.esporte)}<span><b>${esc(s.nome)}</b><small>${esc(s.desc)}</small></span>
        <span class="lado">${brl(s.preco)}<small>${s.duracao} min</small></span>
      </button>`).join("")}</div>`;
    alvo.querySelector(".opcoes").onclick = (ev) => {
      const b = ev.target.closest(".opcao");
      if (!b) return;
      reserva.servicoId = b.dataset.id;
      delete reserva.data; delete reserva.ini;
      avancar(2);
    };
  }

  function etapaBarbeiro(alvo) {
    const opc = [{ id: "", nome: "Sem preferência", posicao: "O primeiro livre entra em campo", esporte: "futebol", numero: "—" }, ...CONFIG.barbeiros];
    alvo.innerHTML = `<h2 class="etapa-titulo" tabindex="-1">Com quem?</h2><div class="opcoes">${opc.map((b) => `
      <button type="button" class="opcao" data-id="${b.id}" aria-pressed="${(reserva.barbeiroEscolhido || "") === b.id}">
        ${icone(b.esporte)}<span><b>${esc(b.nome)}</b><small>${esc(b.id ? `${b.posicao} · ${b.especialidade}` : b.posicao)}</small></span>
        <span class="lado">${b.id ? "#" + b.numero : ""}</span>
      </button>`).join("")}</div>
      <div class="etapa-acoes">${voltar(1)}</div>`;
    ligarVoltar(alvo);
    alvo.querySelector(".opcoes").onclick = (ev) => {
      const b = ev.target.closest(".opcao");
      if (!b) return;
      reserva.barbeiroEscolhido = b.dataset.id || null;
      delete reserva.data; delete reserva.ini;
      avancar(3);
    };
  }

  function etapaGrid(alvo) {
    const bId = reserva.barbeiroEscolhido || null;
    const dias = A.proximosDias(reserva.servicoId, bId);
    if (!reserva.data || !dias.includes(reserva.data)) reserva.data = dias[0];
    const livres = reserva.data ? A.horariosLivres(reserva.data, reserva.servicoId, bId) : [];
    const periodos = [["Manhã", 0, 720], ["Tarde", 720, 1080], ["Noite", 1080, 1440]];
    let pos = 0;
    const grid = periodos.map(([nome, de, ate]) => {
      const h = livres.filter((x) => x.ini >= de && x.ini < ate);
      if (!h.length) return "";
      return `<p class="periodo">${nome}</p><div class="grid-largada">` + h.map((x) => `
        <button type="button" class="posicao" data-ini="${x.ini}" data-barbeiro="${x.barbeiroId}" aria-pressed="${reserva.ini === x.ini}"
          aria-label="${A.paraHora(x.ini)} com ${esc(A.barbeiro(x.barbeiroId).nome)}">
          <span class="p">P${++pos}</span><b>${A.paraHora(x.ini)}</b>${bId ? "" : `<small>#${A.barbeiro(x.barbeiroId).numero}</small>`}
        </button>`).join("") + "</div>";
    }).join("");

    const aviso = reserva.aviso ? `<p class="vazio" role="alert" style="margin-bottom:12px">${reserva.aviso}</p>` : "";
    delete reserva.aviso;
    alvo.innerHTML = `<h2 class="etapa-titulo" tabindex="-1">Escolha sua posição no grid</h2>${aviso}
      ${dias.length ? `<div class="dias" role="group" aria-label="Dia">${dias.map((k) => {
        const d = A.deChave(k);
        return `<button type="button" class="dia" data-dia="${k}" aria-pressed="${k === reserva.data}" aria-label="${A.rotuloDia(k)}">
          <small>${A.rotuloDia(k, true).split(" ")[0]}</small><b>${String(d.getDate()).padStart(2, "0")}</b></button>`;
      }).join("")}</div>
      <div class="grids">${grid}</div>` : `<p class="vazio">Sem horários livres nos próximos dias para essa escolha.</p>`}
      <div class="etapa-acoes" style="margin-top:40px">${voltar(2)}</div>`;
    ligarVoltar(alvo);
    alvo.querySelector(".dias")?.addEventListener("click", (ev) => {
      const b = ev.target.closest(".dia");
      if (!b) return;
      reserva.data = b.dataset.dia; delete reserva.ini;
      etapaGrid(alvo);
      alvo.querySelector(`.dia[data-dia="${reserva.data}"]`)?.focus();
    });
    alvo.querySelector(".grids")?.addEventListener("click", (ev) => {
      const b = ev.target.closest(".posicao");
      if (!b) return;
      reserva.ini = Number(b.dataset.ini);
      reserva.barbeiroId = b.dataset.barbeiro;
      avancar(4);
    });
  }

  function etapaDados(alvo) {
    const s = A.servico(reserva.servicoId), b = A.barbeiro(reserva.barbeiroId);
    const salvo = (() => { try { return JSON.parse(prefs.ler("hattrick_cliente")) || {}; } catch { return {}; } })();
    alvo.innerHTML = `<h2 class="etapa-titulo" tabindex="-1">Bandeirada</h2>
      <dl class="resumo">
        <dt>Serviço</dt><dd>${esc(s.nome)}</dd>
        <dt>Barbeiro</dt><dd>${esc(b.nome)} #${b.numero}</dd>
        <dt>Largada</dt><dd>${A.rotuloDia(reserva.data)} às ${A.paraHora(reserva.ini)}</dd>
        <dt>Valor</dt><dd>${brl(s.preco)}</dd>
      </dl>
      <form id="form-dados" novalidate>
        <div class="campo"><label for="f-nome">Seu nome</label>
          <input id="f-nome" name="nome" autocomplete="given-name" maxlength="40" required value="${esc(salvo.nome || "")}">
          <span class="erro" id="e-nome" aria-live="polite"></span></div>
        <div class="campo"><label for="f-tel">Celular com DDD</label>
          <input id="f-tel" name="tel" type="tel" inputmode="tel" autocomplete="tel-national" maxlength="16" placeholder="(53) 9 0000-0000" required value="${esc(salvo.tel || "")}">
          <span class="erro" id="e-tel" aria-live="polite"></span></div>
        <label class="consentimento"><input type="checkbox" id="f-ok" required>
          <span>Concordo que a barbearia use meu nome e celular só para este agendamento. <a href="privacidade.html">Ver privacidade</a>.</span></label>
        <span class="erro" id="e-ok" aria-live="polite" style="color:#ff8a80;font-size:.85rem"></span>
        <div class="etapa-acoes">${voltar(3)}<button class="botao botao-cheio" type="submit">Confirmar largada</button></div>
      </form>`;
    ligarVoltar(alvo);
    const tel = $("#f-tel");
    tel.addEventListener("input", () => {
      const d = A.soDigitos(tel.value).slice(0, 11);
      tel.value = d.length > 6 ? `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}` : d.length > 2 ? `(${d.slice(0, 2)}) ${d.slice(2)}` : d;
    });
    $("#form-dados").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const nome = $("#f-nome").value.trim(), digitos = A.soDigitos(tel.value), ok = $("#f-ok").checked;
      $("#e-nome").textContent = nome.length < 2 ? "Escreva seu nome." : "";
      $("#e-tel").textContent = digitos.length < 10 ? "Celular com DDD, só números." : "";
      $("#e-ok").textContent = ok ? "" : "Marque a caixa para continuar.";
      if (nome.length < 2) return $("#f-nome").focus();
      if (digitos.length < 10) return tel.focus();
      if (!ok) return $("#f-ok").focus();

      const r = A.criar({ data: reserva.data, ini: reserva.ini, servicoId: reserva.servicoId, barbeiroId: reserva.barbeiroId, nome, telefone: digitos });
      if (!r.ok) { delete reserva.ini; reserva.aviso = "Esse horário acabou de ser pego. Escolha outro."; return avancar(3); }
      prefs.gravar("hattrick_cliente", JSON.stringify({ nome, tel: tel.value }));
      reserva.confirmado = r.agendamento;
      await luzesDeLargada();
      avancar(5);
    });
  }

  // 5 luzes acendem e apagam: largada autorizada
  function luzesDeLargada() {
    if (reduzMovimento) return Promise.resolve();
    const el = $("#largada"), luzes = [...el.querySelectorAll("i")];
    luzes.forEach((l) => l.classList.remove("on"));
    el.classList.add("ativa");
    return new Promise((ok) => {
      luzes.forEach((l, i) => setTimeout(() => l.classList.add("on"), 180 + i * 230));
      setTimeout(() => { luzes.forEach((l) => l.classList.remove("on")); }, 180 + 5 * 230 + 300);
      setTimeout(() => { el.classList.remove("ativa"); ok(); }, 180 + 5 * 230 + 650);
    });
  }

  function linkCalendario(a) {
    const url = URL.createObjectURL(new Blob([A.arquivoCalendario(a)], { type: "text/calendar" }));
    return url;
  }
  function msgWhats(a) {
    const s = A.servico(a.servicoId), b = A.barbeiro(a.barbeiroId);
    return `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(`Olá! Marquei pelo app: ${s.nome} com ${b.nome}, ${A.rotuloDia(a.data)} às ${A.paraHora(a.ini)}. Código ${a.codigo}.`)}`;
  }

  function etapaConfirmado(alvo) {
    const a = reserva.confirmado, s = A.servico(a.servicoId), b = A.barbeiro(a.barbeiroId);
    alvo.innerHTML = `<div class="bandeirada"><div class="xadrez" aria-hidden="true"></div>
      <h2 class="etapa-titulo" tabindex="-1" style="font-size:2.6rem;margin:0">Horário garantido!</h2>
      <div class="codigo" aria-label="Código ${a.codigo.split("").join(" ")}">${a.codigo}</div>
      <p>${esc(s.nome)} com ${esc(b.nome)}<br><strong>${A.rotuloDia(a.data)} às ${A.paraHora(a.ini)}</strong></p>
      <p class="nota">+1 cesta na sua temporada. Isto é uma demonstração: nenhum atendimento real foi marcado.</p>
      <div class="acoes">
        <a class="botao botao-linha" href="${linkCalendario(a)}" download="hat-trick-${a.codigo}.ics">Salvar na agenda</a>
        <a class="botao botao-linha" href="#temporada">Ver temporada</a>
      </div>
      <button class="botao botao-cheio" style="margin-top:8px" type="button" id="novo">Marcar outro</button></div>`;
    $("#novo").onclick = () => comecarAgendamento({});
  }

  // ================= ELENCO =================
  function renderElenco() {
    const nomeEsporte = { futebol: "Futebol", nba: "Basquete", f1: "F1" };
    $("#elenco").innerHTML = CONFIG.barbeiros.map((b) => `
      <li class="jogador" data-esporte="${b.esporte}">
        <span class="numero" aria-hidden="true">${b.numero}</span>
        <div>
          <small>${icone(b.esporte)}${nomeEsporte[b.esporte]} · ${esc(b.posicao)}</small>
          <h2>${esc(b.nome)}</h2>
          <p>${esc(b.especialidade)}</p>
          ${b.folga.length ? `<p class="folga">Folga: ${b.folga.map((d) => DIAS[d]).join(", ")}</p>` : ""}
        </div>
        <button class="botao" type="button" data-barbeiro="${b.id}" aria-label="Agendar com ${esc(b.nome)}">Escalar</button>
      </li>`).join("");
    $("#elenco").onclick = (e) => {
      const b = e.target.closest("[data-barbeiro]");
      if (b) comecarAgendamento({ barbeiroEscolhido: b.dataset.barbeiro, etapa: 1 });
    };
  }

  // ================= TEMPORADA (NBA) =================
  let cancelando = null;
  function renderTemporada() {
    const meta = CONFIG.metaTemporada;
    const todos = A.carregar().filter((a) => a.status !== "cancelado");
    const cestas = todos.length % meta, premios = Math.floor(todos.length / meta);
    const contar = (campo) => { const c = {}; todos.forEach((a) => (c[a[campo]] = (c[a[campo]] || 0) + 1)); return Object.entries(c).sort((x, y) => y[1] - x[1])[0]?.[0]; };
    const favB = contar("barbeiroId"), favS = contar("servicoId");

    $("#temporada").innerHTML = `
      <div class="quadra">
        <div class="quadra-topo"><p class="rotulo">Temporada ${new Date().getFullYear()}</p><p class="rotulo">${premios ? `<span class="trofeus" aria-label="${premios} cortes grátis ganhos">${premios}<svg aria-hidden="true"><use href="#i-trofeu-cheio"/></svg></span>` : ""}</p></div>
        <div class="quadra-pontos" aria-label="${cestas} de ${meta} cestas">${String(cestas).padStart(2, "0")}<span> / ${meta}</span></div>
        <div class="arremessos" aria-hidden="true">${Array.from({ length: meta }, (_, i) => `<i class="${i < cestas ? "cesta" : ""}"></i>`).join("")}</div>
        <p>${cestas === 0 && !premios ? "Marque seu primeiro corte pelo app e comece a pontuar." : `Faltam <strong>${meta - cestas}</strong> para o corte grátis.`}<br>
        <small>Regra de exemplo: cada corte agendado vale 1 cesta. A barbearia define a regra real.</small></p>
      </div>
      <div class="stats">
        <div class="stat"><b>${todos.length}</b><span>Jogos na temporada</span></div>
        <div class="stat"><b>${favB ? "#" + A.barbeiro(favB).numero : "—"}</b><span>Barbeiro titular</span></div>
        <div class="stat"><b style="font-size:1.1rem;line-height:1.15">${favS ? esc(A.servico(favS).nome) : "—"}</b><span>Jogada favorita</span></div>
      </div>`;

    const hojeK = A.chaveDia(new Date()), m = minAgora();
    const futuros = todos.filter((a) => a.data > hojeK || (a.data === hojeK && a.ini >= m))
      .sort((x, y) => (x.data + A.paraHora(x.ini)).localeCompare(y.data + A.paraHora(y.ini)));
    const lista = $("#meus-horarios");
    lista.innerHTML = futuros.length ? futuros.map((a) => {
      const d = A.deChave(a.data);
      return `<article class="jogo">
        <div class="jogo-data"><b>${A.paraHora(a.ini)}</b><small>${DIAS[d.getDay()].slice(0, 3)} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}</small></div>
        <div class="jogo-info"><b>${esc(A.servico(a.servicoId).nome)}</b><small>com ${esc(A.barbeiro(a.barbeiroId).nome)} · ${a.codigo}</small></div>
        <div class="jogo-acoes">
          <a href="${msgWhats(a)}" target="_blank" rel="noopener">Avisar no WhatsApp</a>
          <button type="button" data-cancelar="${a.id}">${cancelando === a.id ? "Toque de novo para cancelar" : "Cancelar"}</button>
        </div></article>`;
    }).join("") : `<p class="vazio">Nenhum jogo marcado. <a href="#agendar">Agendar agora</a></p>`;
    lista.onclick = (e) => {
      const b = e.target.closest("[data-cancelar]");
      if (!b) return;
      if (cancelando === b.dataset.cancelar) { A.cancelar(b.dataset.cancelar); cancelando = null; }
      else cancelando = b.dataset.cancelar;
      renderTemporada();
      lista.querySelector(`[data-cancelar="${cancelando}"]`)?.focus();
    };
  }

  // ================= início =================
  montarTimes();
  aplicarTime(prefs.ler("hattrick_time"));
  irPara();
  setInterval(() => { if (!$("#tela-inicio").hidden) atualizarPlacar(); }, 30000);

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
