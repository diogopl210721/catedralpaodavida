/* Catedral Pão da Vida — presença por localização + relatório de frequência
   - O membro abre o app no horário de um culto/evento/reunião e, estando na igreja,
     a presença é registrada (só a distância é guardada, nunca onde a pessoa está).
   - O pastor (painel admin ou permissão "ver_frequencia") vê o painel geral;
     o líder vê o do seu grupo/departamento. */
(function () {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const DIAS = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
  const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const ANTES = 45, DEPOIS = 150;            // janela: 45 min antes até 2h30 depois do início
  const PONTOS_PRESENCA = 25;
  try { if (typeof PONTOS !== "undefined") PONTOS.presenca_culto = PONTOS_PRESENCA; } catch (e) {}

  const pronto = () => typeof sb !== "undefined" && typeof state !== "undefined" && state.igreja;
  const iso = d => (typeof isoLocal === "function" ? isoLocal(d) : new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10));
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

  function hora(txt) {
    const m = String(txt || "").match(/(\d{1,2})\s*[:hH]\s*(\d{2})?/);
    if (!m) return null;
    return { h: +m[1], m: +(m[2] || 0) };
  }
  function naIgreja(local) { return !local || /igreja|catedral|templo|sede|santu|p[aã]o da vida/i.test(local); }

  /* ---------- encontros de hoje (cultos, calendário, eventos, avisos, reuniões) ---------- */
  let cacheDia = null;
  async function encontrosDeHoje() {
    const hoje = iso(new Date());
    if (cacheDia && cacheDia.dia === hoje && Date.now() - cacheDia.t < 10 * 6e4) return cacheDia.lista;
    const lista = (await encontrosDoDia(hoje)).filter(o => naIgreja(o.local));
    cacheDia = { dia: hoje, t: Date.now(), lista };
    return lista;
  }
  async function encontrosDoDia(hoje) {
    const base = new Date(hoje + "T12:00:00");
    const ig = state.igreja.id, dia = DIAS[base.getDay()];
    const [cu, ca, ev, av, re] = await Promise.all([
      sb.from("igr_cultos").select("id,titulo,dia_semana,horario,local,data,data_inicio,data_fim").eq("igreja_id", ig),
      sb.from("igr_calendario_eventos").select("id,titulo,data,data_fim,horario,local,grupo_id,culto_id,evento_id,aviso_id").eq("igreja_id", ig).lte("data", hoje).gte("data", iso(new Date(+base - 20 * 864e5))),
      sb.from("igr_eventos").select("id,titulo,data,data_fim,horario,local").eq("igreja_id", ig).lte("data", hoje).gte("data", iso(new Date(+base - 20 * 864e5))),
      sb.from("igr_avisos").select("id,titulo,data_evento,horario_evento,local_evento,grupo_id").eq("igreja_id", ig).eq("data_evento", hoje),
      sb.from("igr_reunioes").select("id,titulo,tipo,data,horario,local,grupo_id").eq("igreja_id", ig).eq("data", hoje),
    ]);
    const L = [], visto = new Set();
    const add = o => { if (visto.has(o.chave)) return; visto.add(o.chave); L.push(o); };
    (cu.data || []).forEach(c => {
      const vale = c.data ? c.data === hoje : c.dia_semana === dia && (!c.data_inicio || c.data_inicio <= hoje) && (!c.data_fim || c.data_fim >= hoje);
      if (vale) add({ tipo: "culto", id: c.id, chave: `culto:${c.id}:${hoje}`, titulo: c.titulo, horario: c.horario, local: c.local });
    });
    const dentro = r => r.data <= hoje && (r.data_fim || r.data) >= hoje;
    (ca.data || []).filter(dentro).forEach(c => {
      if (c.culto_id && L.some(x => x.id === c.culto_id)) return;
      add({ tipo: "calendario", id: c.id, chave: `cal:${c.id}:${hoje}`, titulo: c.titulo, horario: c.horario, local: c.local, grupo_id: c.grupo_id, liga: [c.evento_id, c.aviso_id] });
    });
    const ligados = new Set(L.flatMap(x => x.liga || []).filter(Boolean));
    (ev.data || []).filter(dentro).forEach(e => { if (!ligados.has(e.id)) add({ tipo: "evento", id: e.id, chave: `evento:${e.id}:${hoje}`, titulo: e.titulo, horario: e.horario, local: e.local }); });
    (av.data || []).forEach(a => { if (!ligados.has(a.id) && a.horario_evento) add({ tipo: "aviso", id: a.id, chave: `aviso:${a.id}`, titulo: a.titulo, horario: a.horario_evento, local: a.local_evento, grupo_id: a.grupo_id }); });
    (re.data || []).forEach(r => add({ tipo: "reuniao", id: r.id, chave: `reuniao:${r.id}`, titulo: r.titulo || "Reunião", horario: r.horario, local: r.local, grupo_id: r.grupo_id }));
    return L.map(o => {
      const hh = hora(o.horario), ini = new Date(base);
      if (hh) ini.setHours(hh.h, hh.m, 0, 0); else ini.setHours(8, 0, 0, 0);
      const de = new Date(ini - ANTES * 6e4), ate = hh ? new Date(+ini + DEPOIS * 6e4) : new Date(new Date(base).setHours(22, 0, 0, 0));
      return { ...o, data: hoje, ini, de, ate };
    }).sort((a, b) => a.ini - b.ini);
  }
  async function encontroAgora() {
    const agora = new Date();
    const ativos = (await encontrosDeHoje()).filter(o => agora >= o.de && agora <= o.ate);
    // reunião só vale para quem é do grupo dela (ou se for geral)
    const meus = gruposDoMembro(state.membro);
    return ativos.filter(o => !(o.tipo === "reuniao" && o.grupo_id && !meus.has(o.grupo_id)))
      .sort((a, b) => Math.abs(agora - a.ini) - Math.abs(agora - b.ini));
  }
  function gruposDoMembro(m) {
    const s = new Set(); if (!m) return s;
    if (m.grupo_id) s.add(m.grupo_id);
    (m.grupos_ids || []).forEach(g => s.add(g));
    if (m.grupoLouvorId) s.add(m.grupoLouvorId); if (m.grupoDancaId) s.add(m.grupoDancaId);
    return s;
  }

  /* ---------- localização ---------- */
  function distancia(a, b, c, d) {
    const R = 6371e3, r = x => x * Math.PI / 180;
    const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function posicao() {
    return new Promise((ok, erro) => {
      if (!navigator.geolocation) return erro({ code: 99 });
      navigator.geolocation.getCurrentPosition(ok, erro, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
    });
  }

  /* ---------- registro ---------- */
  let jaTenho = new Set(), estado = { fase: "ocioso" };
  async function carregarMinhas(lista) {
    if (!lista.length || !state.membro) return;
    const { data } = await sb.from("igr_presencas").select("chave").eq("membro_id", state.membro.id).in("chave", lista.map(o => o.chave));
    (data || []).forEach(p => jaTenho.add(p.chave));
  }
  async function registrar(o, dist) {
    const ig = state.igreja, m = state.membro;
    const { error } = await sb.from("igr_presencas").insert({
      igreja_id: ig.id, membro_id: m.id, data: o.data, tipo: o.tipo, ocorrencia_id: o.id, chave: o.chave,
      titulo: o.titulo, horario: o.horario || null, grupo_id: o.grupo_id || null, metodo: "gps", distancia_m: Math.round(dist),
    });
    if (error && !/duplicate|unique/i.test(error.message || "")) throw error;
    jaTenho.add(o.chave);
    if (!error) {
      if (o.tipo === "reuniao") {
        const { data: ja } = await sb.from("igr_reuniao_presencas").select("id").eq("reuniao_id", o.id).eq("membro_id", m.id).maybeSingle();
        if (ja) await sb.from("igr_reuniao_presencas").update({ presente: true }).eq("id", ja.id);
        else await sb.from("igr_reuniao_presencas").insert({ reuniao_id: o.id, membro_id: m.id, presente: true });
      }
      if (typeof darPontos === "function") darPontos("presenca_culto", o.id);
    }
  }

  async function tentar(manual) {
    if (!pronto() || !state.membro || estado.fase === "buscando") return;
    const ativos = await encontroAgora();
    await carregarMinhas(ativos);
    const pend = ativos.filter(o => !jaTenho.has(o.chave));
    if (!ativos.length) { estado = { fase: "ocioso" }; return pintar(); }
    if (!pend.length) { estado = { fase: "ok", o: ativos.find(o => jaTenho.has(o.chave)) }; return pintar(); }
    const ig = state.igreja;
    if (ig.latitude == null) { estado = { fase: "semlocal", o: pend[0] }; return pintar(); }
    if (!manual && lsGet("cpv_presenca_auto") !== "1") { estado = { fase: "convite", o: pend[0] }; return pintar(); }
    estado = { fase: "buscando", o: pend[0] }; pintar();
    try {
      const p = await posicao();
      const d = distancia(p.coords.latitude, p.coords.longitude, ig.latitude, ig.longitude);
      const folga = Math.min(p.coords.accuracy || 0, 150), raio = ig.raio_presenca_m || 150;
      lsSet("cpv_presenca_auto", "1");
      if (d - folga <= raio) {
        for (const o of pend) await registrar(o, d);
        estado = { fase: "ok", o: pend[0], novo: true };
        if (typeof mostrarToast === "function") mostrarToast(`Presença confirmada · ${pend[0].titulo} ✓`, 3500);
      } else estado = { fase: "longe", o: pend[0], d };
    } catch (e) {
      estado = e && e.code === 1 ? { fase: "negado", o: pend[0] } : { fase: "erro", o: pend[0] };
      if (e && e.code !== 1 && e.code !== 2 && e.code !== 3) console.error("presença:", e);
    }
    pintar();
  }

  /* ---------- cartão na tela Hoje ---------- */
  const ICO = {
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6-7-11.5a7 7 0 0 1 14 0C19 15 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  };
  function km(d) { return d >= 1000 ? `${(d / 1000).toFixed(1).replace(".", ",")} km` : `${Math.round(d)} m`; }
  function pintar() {
    const ref = $("#cpv-agora-box"); if (!ref) return;
    let box = $("#cpv-presenca");
    if (estado.fase === "ocioso" || !state.membro) { box?.remove(); return; }
    if (!box) { box = document.createElement("section"); box.id = "cpv-presenca"; }
    if (box.previousElementSibling !== ref) ref.after(box);
    const o = estado.o || {}, t = esc(o.titulo || "Culto");
    const H = {
      convite: `<div class="pr-ic">${ICO.pin}</div><div class="pr-tx"><b>Chegou? Registre sua presença</b><small>${t}. Toque em “Estou aqui”. Usamos a localização só agora, para ver se você está na igreja, e não guardamos onde você está.</small></div><button type="button" class="cpv-btn ouro" data-pr-registrar>Estou aqui</button>`,
      buscando: `<div class="pr-ic gira">${ICO.pin}</div><div class="pr-tx"><b>Confirmando sua presença…</b><small>${t}</small></div>`,
      ok: `<div class="pr-ic ok">${ICO.ok}</div><div class="pr-tx"><b>Presença confirmada</b><small>${t}${estado.novo ? ` · +${PONTOS_PRESENCA} pontos` : ""}</small></div>`,
      longe: `<div class="pr-ic">${ICO.pin}</div><div class="pr-tx"><b>Você ainda não está na igreja</b><small>Estamos a ${km(estado.d || 0)} da Catedral. Quando chegar, toque de novo.</small></div><button type="button" class="cpv-btn linha" data-pr-registrar>Tentar de novo</button>`,
      negado: `<div class="pr-ic">${ICO.pin}</div><div class="pr-tx"><b>Localização bloqueada</b><small>Para registrar sua presença, permita a localização para este app nos ajustes do celular e toque em tentar.</small></div><button type="button" class="cpv-btn linha" data-pr-registrar>Tentar</button>`,
      erro: `<div class="pr-ic">${ICO.pin}</div><div class="pr-tx"><b>Não conseguimos achar sua localização</b><small>Ative o GPS e tente de novo.</small></div><button type="button" class="cpv-btn linha" data-pr-registrar>Tentar</button>`,
      semlocal: `<div class="pr-ic">${ICO.pin}</div><div class="pr-tx"><b>${t}</b><small>O registro de presença ainda não foi configurado pela igreja.</small></div>`,
    };
    const html = H[estado.fase] || "";
    if (box._html === html) return;
    box._html = html; box.className = "pr-card pr-" + estado.fase; box.innerHTML = html;
  }
  document.addEventListener("click", e => { if (e.target.closest && e.target.closest("[data-pr-registrar]")) tentar(true); });

  /* ================= RELATÓRIO DE FREQUÊNCIA ================= */
  const F = { dias: 30, escopo: "geral", grupo: "", admin: false, fixos: null };
  function meuAcesso() {
    const m = state.membro;
    if (state.adminNome) return { geral: true };
    if (m && (m.permissoes || []).includes("ver_frequencia")) return { geral: true };
    if (m && m.eh_lider && m.grupo_id) return { geral: false, grupos: [m.grupo_id] };
    return null;
  }

  async function abrirFrequencia(origem) {
    const ac = meuAcesso();
    if (!ac) { typeof mostrarToast === "function" && mostrarToast("O relatório de frequência é para pastores e líderes."); return; }
    F.fixos = ac.geral ? null : ac.grupos;
    if (F.fixos) { F.escopo = "grupo"; F.grupo = F.fixos[0]; }
    let t = $("#tela-cpv-frequencia");
    const volta = origem || (state.adminNome && $("#tela-admin-painel") ? "tela-admin-painel" : "tela-cpv-servir");
    if (!t) {
      t = document.createElement("div");
      t.className = "screen cpv-layout"; t.id = "tela-cpv-frequencia";
      t.innerHTML = `<div class="scroll"><div class="cpv-topo-tela"><button type="button" class="cpv-voltar" data-cpv-voltar="${volta}" aria-label="Voltar"><svg class="ci" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
        <header class="cpv-saudacao"><p>Relatório pastoral</p><h1>Frequência</h1></header></div>
        <div class="fr-filtros">
          <div class="fr-seg" role="tablist" data-fr="escopo">${[["geral", "Geral"], ["grupo", "Grupo"], ["departamento", "Departamento"]].map(([v, r]) => `<button type="button" data-v="${v}">${r}</button>`).join("")}</div>
          <select class="fr-sel" data-fr="grupo" aria-label="Escolher grupo"></select>
          <div class="fr-seg" data-fr="dias">${[[30, "30 dias"], [90, "3 meses"], [365, "12 meses"]].map(([v, r]) => `<button type="button" data-v="${v}">${r}</button>`).join("")}</div>
        </div>
        <button type="button" class="fr-marcar-btn" data-fr-marcar><span><svg class="ci" aria-hidden="true"><path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/></svg></span><span><b>Marcar presença</b><small>Para quem não tem celular ou não abriu o app</small></span></button>
        <div id="fr-corpo"><p class="fr-vazio">Carregando…</p></div></div>`;
      ($("#tela-membro-home") || document.body).after(t);
      t.addEventListener("click", e => {
        const b = e.target.closest(".fr-seg button"); if (!b) return;
        const k = b.parentElement.dataset.fr;
        if (k === "escopo") { F.escopo = b.dataset.v; F.grupo = ""; }
        if (k === "dias") F.dias = +b.dataset.v;
        carregar();
      });
      $(".fr-sel", t).addEventListener("change", e => { F.grupo = e.target.value; carregar(); });
      t.addEventListener("click", e => { if (e.target.closest("[data-fr-csv]")) baixarCSV(); if (e.target.closest("[data-fr-pdf]")) baixarPDF(e.target.closest("[data-fr-pdf]")); if (e.target.closest("[data-fr-marcar]")) abrirMarcar(); });
    } else $(".cpv-voltar", t).dataset.cpvVoltar = volta;
    window.mostrarTela("tela-cpv-frequencia");
    carregar();
  }
  window.abrirFrequencia = abrirFrequencia;

  let ultimo = null;
  async function carregar() {
    const t = $("#tela-cpv-frequencia"), corpo = $("#fr-corpo");
    $$('[data-fr="escopo"] button', t).forEach(b => { b.setAttribute("aria-selected", b.dataset.v === F.escopo); b.hidden = !!F.fixos && b.dataset.v === "geral"; });
    $$('[data-fr="dias"] button', t).forEach(b => b.setAttribute("aria-selected", +b.dataset.v === F.dias));
    corpo.innerHTML = `<p class="fr-vazio">Carregando…</p>`;
    const ig = state.igreja.id, desde = iso(new Date(Date.now() - (F.dias - 1) * 864e5));
    const [mb, mg, gr, pr, ru] = await Promise.all([
      sb.from("igr_membros").select("id,nome_completo,foto_url,telefone,grupo_id,eh_lider,created_at").eq("igreja_id", ig),
      sb.from("igr_membros_grupos").select("membro_id,grupo_id"),
      sb.from("igr_grupos").select("id,nome,tipo").eq("igreja_id", ig).order("nome"),
      sb.from("igr_presencas").select("membro_id,chave,data,titulo,tipo,horario,grupo_id,metodo").eq("igreja_id", ig).gte("data", desde).limit(20000),
      sb.from("igr_reunioes").select("id,titulo,data,horario,grupo_id,igr_reuniao_presencas(membro_id,presente)").eq("igreja_id", ig).gte("data", desde),
    ]);
    const membros = mb.data || [], grupos = (gr.data || []).map(g => ({ ...g, dep: g.tipo === "departamento" }));
    const mids = new Set(membros.map(m => m.id));
    const gruposDe = new Map(membros.map(m => [m.id, new Set(m.grupo_id ? [m.grupo_id] : [])]));
    (mg.data || []).forEach(r => mids.has(r.membro_id) && gruposDe.get(r.membro_id).add(r.grupo_id));

    // presenças: GPS + listas de reunião
    const pres = (pr.data || []).filter(p => mids.has(p.membro_id));
    const chaves = new Set(pres.map(p => p.membro_id + "|" + p.chave));
    (ru.data || []).forEach(r => (r.igr_reuniao_presencas || []).filter(x => x.presente).forEach(x => {
      const k = "reuniao:" + r.id;
      if (mids.has(x.membro_id) && !chaves.has(x.membro_id + "|" + k)) { chaves.add(x.membro_id + "|" + k); pres.push({ membro_id: x.membro_id, chave: k, data: r.data, titulo: r.titulo || "Reunião", tipo: "reuniao", horario: r.horario, grupo_id: r.grupo_id, metodo: "lista" }); }
    }));

    // seletor
    const sel = $(".fr-sel", t);
    const opcoes = F.fixos ? grupos.filter(g => F.fixos.includes(g.id)) : F.escopo === "geral" ? [] : grupos.filter(g => (F.escopo === "departamento") === g.dep);
    $('[data-fr="escopo"]', t).hidden = !!F.fixos;
    sel.hidden = F.escopo === "geral";
    if (!sel.hidden) {
      if (!opcoes.some(g => g.id === F.grupo)) F.grupo = opcoes[0]?.id || "";
      sel.innerHTML = opcoes.map(g => `<option value="${g.id}" ${g.id === F.grupo ? "selected" : ""}>${esc(g.nome)}</option>`).join("") || `<option>Nenhum ${F.escopo} cadastrado</option>`;
    }

    // recorte
    const noEscopo = F.escopo === "geral" ? membros : membros.filter(m => gruposDe.get(m.id).has(F.grupo));
    const ids = new Set(noEscopo.map(m => m.id));
    const encontrosTodos = new Map();
    pres.forEach(p => { if (!encontrosTodos.has(p.chave)) encontrosTodos.set(p.chave, { chave: p.chave, data: p.data, titulo: p.titulo, tipo: p.tipo, horario: p.horario, grupo_id: p.grupo_id, presentes: new Set() }); encontrosTodos.get(p.chave).presentes.add(p.membro_id); });
    // encontros que contam para o recorte: gerais + os do próprio grupo
    const encontros = [...encontrosTodos.values()].filter(e => F.escopo === "geral" || !e.grupo_id || e.grupo_id === F.grupo)
      .map(e => ({ ...e, n: [...e.presentes].filter(id => ids.has(id)).length })).sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : String(a.horario).localeCompare(String(b.horario)));
    const porMembro = new Map(noEscopo.map(m => [m.id, 0]));
    const ultimaVez = new Map();
    encontros.forEach(e => e.presentes.forEach(id => { if (ids.has(id)) { porMembro.set(id, porMembro.get(id) + 1); if (!ultimaVez.has(id) || ultimaVez.get(id) < e.data) ultimaVez.set(id, e.data); } }));
    const nE = encontros.length, totalPres = encontros.reduce((s, e) => s + e.n, 0);
    const vieram = [...porMembro.values()].filter(v => v > 0).length;
    const media = nE ? totalPres / nE : 0;
    const freqMedia = nE && noEscopo.length ? totalPres / (nE * noEscopo.length) : 0;
    ultimo = { noEscopo, porMembro, ultimaVez, nE, membros, gruposDe, grupos };

    // comparação com o período anterior (mesmo tamanho)
    const antesDe = desde, antesDesde = iso(new Date(Date.now() - (2 * F.dias - 1) * 864e5));
    let tendencia = "";
    try {
      const { data: ant } = await sb.from("igr_presencas").select("membro_id,chave,grupo_id").eq("igreja_id", ig).gte("data", antesDesde).lt("data", antesDe).limit(20000);
      const a = (ant || []).filter(p => ids.has(p.membro_id) && (F.escopo === "geral" || !p.grupo_id || p.grupo_id === F.grupo));
      const ne = new Set(a.map(p => p.chave)).size;
      if (ne && nE) { const ma = a.length / ne, dlt = Math.round((media - ma) / ma * 100); tendencia = dlt === 0 ? "igual ao período anterior" : `${dlt > 0 ? "+" : ""}${dlt}% vs período anterior`; }
    } catch (e) {}

    if (!nE) {
      corpo.innerHTML = `<div class="fr-vazio-card"><b>Ainda não há presenças neste período</b><p>As presenças aparecem aqui quando os membros abrem o app durante os cultos, na igreja. Reuniões com lista de presença também entram.</p></div>`;
      return;
    }
    const pct = x => `${Math.round(x * 100)}%`;
    const dt = s => { const [, m, d] = s.split("-"); return `${+d} ${MES[+m - 1]}`; };

    // por culto/encontro (média por título)
    const porTitulo = new Map();
    encontros.forEach(e => { const k = e.titulo || "Encontro"; const o = porTitulo.get(k) || { n: 0, s: 0 }; o.n++; o.s += e.n; porTitulo.set(k, o); });
    const titulos = [...porTitulo.entries()].map(([k, o]) => ({ k, m: o.s / o.n, n: o.n })).sort((a, b) => b.m - a.m).slice(0, 8);
    const maxT = Math.max(...titulos.map(x => x.m), 1);

    // linha do tempo (últimos 16 encontros)
    const linha = encontros.slice(-16), maxL = Math.max(...linha.map(e => e.n), 1);

    // grupos e departamentos (só no geral)
    const resumo = dep => grupos.filter(g => g.dep === dep).map(g => {
        const mem = membros.filter(m => gruposDe.get(m.id).has(g.id));
        if (!mem.length) return null;
        const v = mem.filter(m => (porMembro.get(m.id) || 0) > 0).length;
        const fr = nE ? mem.reduce((s, m) => s + (porMembro.get(m.id) || 0), 0) / (nE * mem.length) : 0;
        return { g, n: mem.length, v, fr };
      }).filter(Boolean).sort((a, b) => b.fr - a.fr);
    const resG = F.escopo === "geral" ? resumo(false) : [], resD = F.escopo === "geral" ? resumo(true) : [];
    const blocoGrupos = dep => {
      const gs = dep ? resD : resG;
      if (!gs.length) return "";
      return `<section class="fr-bloco"><h2>${dep ? "Por departamento" : "Por grupo"}</h2><p class="fr-sub">Frequência média dos membros de cada ${dep ? "departamento" : "grupo"} nos encontros do período</p>
        <ul class="fr-barras">${gs.map(x => `<li><button type="button" data-fr-ir="${x.g.id}" data-fr-esc="${dep ? "departamento" : "grupo"}"><span class="fr-nome">${esc(x.g.nome)}</span><span class="fr-barra"><i style="width:${Math.max(2, x.fr * 100)}%"></i></span><b>${pct(x.fr)}</b></button><small>${x.v} de ${x.n} vieram</small></li>`).join("")}</ul></section>`;
    };

    const ranking = noEscopo.filter(m => porMembro.get(m.id) > 0).sort((a, b) => porMembro.get(b.id) - porMembro.get(a.id)).slice(0, 10);
    const limite = iso(new Date(Date.now() - 20 * 864e5));
    const falta = noEscopo.filter(m => !ultimaVez.has(m.id) || ultimaVez.get(m.id) < limite)
      .sort((a, b) => (ultimaVez.get(a.id) || "").localeCompare(ultimaVez.get(b.id) || "")).slice(0, 30);
    const nomeEscopo = F.escopo === "geral" ? "Igreja toda" : (grupos.find(g => g.id === F.grupo)?.nome || "");
    Object.assign(ultimo, { encontros, linha, titulos, resG, resD, ranking, falta, media, freqMedia, vieram, totalPres, tendencia, desde, nomeEscopo, escopo: F.escopo, dias: F.dias });
    const av = m => m.foto_url ? `<img src="${esc(m.foto_url)}" alt="">` : `<span>${esc((m.nome_completo || "?").trim().split(/\s+/).map(p => p[0]).slice(0, 2).join("").toUpperCase())}</span>`;
    const zap = m => { const n = String(m.telefone || "").replace(/\D/g, ""); if (n.length < 10) return ""; const nome = (m.nome_completo || "").split(" ")[0]; return `<a class="fr-zap" target="_blank" rel="noopener" href="https://wa.me/${n.length <= 11 ? "55" + n : n}?text=${encodeURIComponent(`Oi ${nome}, sentimos sua falta nos cultos! Está tudo bem? Estamos orando por você. 🙏`)}">Mandar mensagem</a>`; };

    corpo.innerHTML = `
      <section class="fr-kpis">
        <div class="fr-kpi destaque"><span>Média por encontro</span><b>${media.toFixed(media < 10 ? 1 : 0).replace(".", ",")}</b><small>${tendencia || `${nE} encontros registrados`}</small></div>
        <div class="fr-kpi"><span>Frequência média</span><b>${pct(freqMedia)}</b><small>dos membros por encontro</small></div>
        <div class="fr-kpi"><span>Vieram ao menos 1 vez</span><b>${vieram}<em>/${noEscopo.length}</em></b><small>${pct(noEscopo.length ? vieram / noEscopo.length : 0)} dos membros</small></div>
        <div class="fr-kpi"><span>Encontros</span><b>${nE}</b><small>${totalPres} presenças no total</small></div>
      </section>
      <section class="fr-bloco"><h2>Presentes por encontro</h2><p class="fr-sub">Os ${linha.length} encontros mais recentes do período</p>
        <div class="fr-colunas${linha.length > 9 ? " muitos" : ""}" style="--n:${linha.length}">${linha.map(e => `<div class="fr-col" title="${esc(e.titulo)} · ${dt(e.data)}"><b>${e.n}</b><i style="height:${Math.max(3, e.n / maxL * 100)}%"></i><small>${e.data.slice(8)}/${e.data.slice(5, 7)}</small></div>`).join("")}</div></section>
      <section class="fr-bloco"><h2>Média por culto e evento</h2>
        <ul class="fr-barras">${titulos.map(x => `<li><div><span class="fr-nome">${esc(x.k)}</span><span class="fr-barra"><i style="width:${x.m / maxT * 100}%"></i></span><b>${x.m.toFixed(x.m < 10 ? 1 : 0).replace(".", ",")}</b></div><small>${x.n} ${x.n === 1 ? "encontro" : "encontros"}</small></li>`).join("")}</ul></section>
      ${F.escopo === "geral" ? blocoGrupos(false) + blocoGrupos(true) : ""}
      <section class="fr-bloco"><h2>Mais presentes</h2>
        <ol class="fr-pessoas">${ranking.map(m => `<li><span class="fr-av">${av(m)}</span><span class="fr-p-tx"><b>${esc(m.nome_completo)}</b><small>${porMembro.get(m.id)} de ${nE} · ${pct(porMembro.get(m.id) / nE)}</small></span></li>`).join("") || `<li class="fr-nada">Ninguém ainda.</li>`}</ol></section>
      <section class="fr-bloco fr-falta"><h2>Sentimos falta</h2><p class="fr-sub">Sem presença registrada nos últimos 20 dias. Uma mensagem pode fazer diferença.</p>
        <ul class="fr-pessoas">${falta.map(m => `<li><span class="fr-av">${av(m)}</span><span class="fr-p-tx"><b>${esc(m.nome_completo)}</b><small>${ultimaVez.has(m.id) ? `Última vez em ${dt(ultimaVez.get(m.id))}` : "Sem presença no período"}</small></span>${zap(m)}</li>`).join("") || `<li class="fr-nada">Todos vieram recentemente. Glória a Deus!</li>`}</ul></section>
      <div class="fr-rodape"><div class="fr-baixar"><button type="button" class="cpv-btn ouro" data-fr-pdf>Baixar relatório em PDF</button><button type="button" class="cpv-btn linha" data-fr-csv>Baixar planilha (CSV)</button></div>
        <p>A presença é registrada quando o membro abre o app durante o culto, dentro da igreja. Quem não tem celular ou não abriu o app não aparece, por isso use os números como tendência.</p></div>`;
    $$("[data-fr-ir]", corpo).forEach(b => b.addEventListener("click", () => { F.escopo = b.dataset.frEsc; F.grupo = b.dataset.frIr; carregar(); $("#tela-cpv-frequencia .scroll")?.scrollTo({ top: 0, behavior: "smooth" }); }));
  }


  /* ---------- marcar presença manualmente (líder: só o seu grupo; pastores e administrativo: todos) ---------- */
  const MK = { data: "", enc: null, lista: [], presentes: new Map(), busca: "" };
  function membrosQuePossoMarcar() {
    if (!ultimo) return [];
    const { membros, gruposDe } = ultimo;
    const lista = F.fixos ? membros.filter(m => F.fixos.some(g => gruposDe.get(m.id).has(g))) : membros;
    return lista.slice().sort((a, b) => (a.nome_completo || "").localeCompare(b.nome_completo || "", "pt"));
  }
  async function abrirMarcar() {
    let ov = $("#fr-marcar");
    if (!ov) {
      ov = document.createElement("div"); ov.id = "fr-marcar"; ov.className = "fr-sheet"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", "Marcar presença");
      ov.innerHTML = `<div class="fr-sheet-in">
        <div class="fr-sheet-cab"><h2>Marcar presença</h2><button type="button" class="fr-fechar" data-mk-fechar aria-label="Fechar">✕</button></div>
        <label class="fr-campo"><span>Dia</span><input type="date" data-mk-data></label>
        <label class="fr-campo"><span>Culto ou encontro</span><select data-mk-enc></select></label>
        <input type="search" class="fr-busca" data-mk-busca placeholder="Buscar membro" aria-label="Buscar membro">
        <p class="fr-mk-info" data-mk-info></p>
        <ul class="fr-mk-lista" data-mk-lista></ul>
      </div>`;
      $("#tela-cpv-frequencia").appendChild(ov);
      ov.addEventListener("click", e => { if (e.target === ov || e.target.closest("[data-mk-fechar]")) fecharMarcar(); });
      $("[data-mk-data]", ov).addEventListener("change", e => { MK.data = e.target.value; carregarEncontros(); });
      $("[data-mk-enc]", ov).addEventListener("change", e => { MK.enc = MK.lista[+e.target.value] || null; carregarPresentes(); });
      $("[data-mk-busca]", ov).addEventListener("input", e => { MK.busca = e.target.value; pintarMarcar(); });
      $("[data-mk-lista]", ov).addEventListener("change", e => { const c = e.target.closest("input[data-id]"); if (c) alternar(c); });
    }
    MK.data = iso(new Date()); MK.busca = "";
    const inp = $("[data-mk-data]", ov); inp.value = MK.data; inp.max = MK.data; $("[data-mk-busca]", ov).value = "";
    ov.hidden = false; document.documentElement.classList.add("fr-travado");
    await carregarEncontros();
  }
  function fecharMarcar() { const ov = $("#fr-marcar"); if (ov) ov.hidden = true; document.documentElement.classList.remove("fr-travado"); carregar(); }
  async function carregarEncontros() {
    const ov = $("#fr-marcar"), sel = $("[data-mk-enc]", ov);
    sel.innerHTML = `<option>Carregando…</option>`;
    let lista = await encontrosDoDia(MK.data);
    // reunião de outro grupo não aparece para o líder
    if (F.fixos) lista = lista.filter(o => !(o.tipo === "reuniao" && o.grupo_id && !F.fixos.includes(o.grupo_id)));
    MK.lista = lista;
    const agora = new Date();
    let i = lista.findIndex(o => agora >= o.de && agora <= o.ate); if (i < 0) i = lista.length ? lista.length - 1 : -1;
    sel.innerHTML = lista.length ? lista.map((o, k) => `<option value="${k}" ${k === i ? "selected" : ""}>${esc(o.titulo)}${o.horario ? ` · ${esc(String(o.horario).slice(0, 5))}` : ""}</option>`).join("") : `<option>Nenhum culto ou encontro neste dia</option>`;
    sel.disabled = !lista.length;
    MK.enc = lista[i] || null;
    await carregarPresentes();
  }
  async function carregarPresentes() {
    MK.presentes = new Map();
    if (MK.enc) {
      const { data } = await sb.from("igr_presencas").select("membro_id,metodo").eq("igreja_id", state.igreja.id).eq("chave", MK.enc.chave);
      (data || []).forEach(p => MK.presentes.set(p.membro_id, p.metodo));
    }
    pintarMarcar();
  }
  function pintarMarcar() {
    const ov = $("#fr-marcar"), ul = $("[data-mk-lista]", ov), info = $("[data-mk-info]", ov);
    if (!MK.enc) { ul.innerHTML = ""; info.textContent = "Escolha um dia com culto ou encontro cadastrado."; return; }
    const todos = membrosQuePossoMarcar(), q = MK.busca.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const vis = q ? todos.filter(m => (m.nome_completo || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(q)) : todos;
    const n = todos.filter(m => MK.presentes.has(m.id)).length;
    info.textContent = `${n} de ${todos.length} ${F.fixos ? "do seu grupo " : ""}presentes`;
    ul.innerHTML = vis.map(m => {
      const met = MK.presentes.get(m.id), app = met && met !== "lider";
      return `<li><label class="${met ? "on" : ""}"><input type="checkbox" data-id="${m.id}" ${met ? "checked" : ""} ${app ? "disabled" : ""}><span class="fr-av">${m.foto_url ? `<img src="${esc(m.foto_url)}" alt="">` : esc((m.nome_completo || "?").trim().split(/\s+/).map(p => p[0]).slice(0, 2).join("").toUpperCase())}</span><span class="fr-p-tx"><b>${esc(m.nome_completo)}</b>${app ? "<small>Registrou pelo app</small>" : ""}</span><span class="fr-caixa" aria-hidden="true"></span></label></li>`;
    }).join("") || `<li class="fr-nada">Nenhum membro encontrado.</li>`;
  }
  async function alternar(c) {
    const id = c.dataset.id, o = MK.enc; c.disabled = true;
    try {
      if (c.checked) {
        const { error } = await sb.from("igr_presencas").insert({ igreja_id: state.igreja.id, membro_id: id, data: o.data, tipo: o.tipo, ocorrencia_id: o.id, chave: o.chave, titulo: o.titulo, horario: o.horario || null, grupo_id: o.grupo_id || null, metodo: "lider" });
        if (error && !/duplicate|unique/i.test(error.message || "")) throw error;
        MK.presentes.set(id, "lider");
        if (o.tipo === "reuniao") {
          const { data: ja } = await sb.from("igr_reuniao_presencas").select("id").eq("reuniao_id", o.id).eq("membro_id", id).maybeSingle();
          if (ja) await sb.from("igr_reuniao_presencas").update({ presente: true }).eq("id", ja.id); else await sb.from("igr_reuniao_presencas").insert({ reuniao_id: o.id, membro_id: id, presente: true });
        }
      } else {
        const { error } = await sb.from("igr_presencas").delete().eq("membro_id", id).eq("chave", o.chave).eq("metodo", "lider");
        if (error) throw error;
        MK.presentes.delete(id);
        if (o.tipo === "reuniao") await sb.from("igr_reuniao_presencas").update({ presente: false }).eq("reuniao_id", o.id).eq("membro_id", id);
      }
    } catch (e) {
      console.error("marcar presença:", e); c.checked = !c.checked;
      typeof mostrarToast === "function" && mostrarToast("Não foi possível salvar. Verifique a internet e tente de novo.");
    }
    pintarMarcar();
  }

  const dBR = x => { const [y, m, d] = String(x).split("-"); return `${d}/${m}/${y}`; };
  function grupoDoMembro(m) {
    const { gruposDe, grupos } = ultimo, ids = [...(gruposDe.get(m.id) || [])];
    return ids.map(id => grupos.find(g => g.id === id)?.nome).filter(Boolean).join(", ");
  }
  function linhasMembros() {
    const { noEscopo, porMembro, ultimaVez, nE } = ultimo;
    return noEscopo.slice().sort((a, b) => porMembro.get(b.id) - porMembro.get(a.id) || (a.nome_completo || "").localeCompare(b.nome_completo || "", "pt"))
      .map(m => ({ m, n: porMembro.get(m.id) || 0, f: nE ? (porMembro.get(m.id) || 0) / nE : 0, ult: ultimaVez.get(m.id) || "", grupo: grupoDoMembro(m) }));
  }
  function salvar(blob, nome) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function nomeArq(ext) { const u = ultimo; return `frequencia-${String(u.nomeEscopo || "igreja").toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${iso(new Date())}.${ext}`; }

  function baixarCSV() {
    if (!ultimo || !ultimo.nE) { typeof mostrarToast === "function" && mostrarToast("Ainda não há presenças neste período."); return; }
    const u = ultimo, hoje = iso(new Date()), pc = x => Math.round(x * 100) + "%";
    const L = [
      ["Catedral Pão da Vida · Relatório de frequência"],
      ["Recorte", u.nomeEscopo], ["Período", `${dBR(u.desde)} a ${dBR(hoje)}`], ["Emitido em", dBR(hoje)], [],
      ["Resumo"], ["Média de presentes por encontro", u.media.toFixed(1).replace(".", ",")], ["Frequência média", pc(u.freqMedia)],
      ["Vieram ao menos 1 vez", `${u.vieram} de ${u.noEscopo.length}`], ["Encontros", u.nE], ["Presenças no total", u.totalPres], [],
      ["Frequência por membro"], ["Membro", "Grupo / departamento", "Presenças", "Encontros", "Frequência", "Última presença", "Telefone"],
      ...linhasMembros().map(r => [r.m.nome_completo, r.grupo, r.n, u.nE, pc(r.f), r.ult ? dBR(r.ult) : "—", r.m.telefone || ""]), [],
      ["Encontros do período"], ["Data", "Horário", "Culto / encontro", "Presentes"],
      ...u.encontros.slice().reverse().map(e => [dBR(e.data), String(e.horario || "").slice(0, 5), e.titulo, e.n]),
    ];
    if (u.resG.length || u.resD.length) {
      L.push([], ["Grupos e departamentos"], ["Nome", "Tipo", "Membros", "Vieram", "Frequência média"]);
      u.resG.forEach(x => L.push([x.g.nome, "Grupo", x.n, x.v, pc(x.fr)]));
      u.resD.forEach(x => L.push([x.g.nome, "Departamento", x.n, x.v, pc(x.fr)]));
    }
    const csv = "﻿" + L.map(l => l.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const blobCsv = new Blob([csv], { type: "text/csv;charset=utf-8" });
    if (window.cpvEntregarArquivo) window.cpvEntregarArquivo(blobCsv, nomeArq("csv"), "text/csv"); else salvar(blobCsv, nomeArq("csv"));
  }

  function carregarImg(src) {
    return new Promise(ok => { const i = new Image(); i.onload = () => { const c = document.createElement("canvas"); c.width = i.naturalWidth; c.height = i.naturalHeight; c.getContext("2d").drawImage(i, 0, 0); ok({ url: c.toDataURL("image/png"), w: i.naturalWidth, h: i.naturalHeight }); }; i.onerror = () => ok(null); i.src = src; });
  }
  async function baixarPDF(btn) {
    if (!ultimo || !ultimo.nE) { typeof mostrarToast === "function" && mostrarToast("Ainda não há presenças neste período."); return; }
    if (!window.jspdf) { typeof mostrarToast === "function" && mostrarToast("Carregando o gerador de PDF, tente de novo em instantes."); return; }
    const txt = btn && btn.textContent; if (btn) { btn.disabled = true; btn.textContent = "Gerando PDF…"; }
    try {
      const u = ultimo, hoje = iso(new Date());
      const { jsPDF } = window.jspdf, pdf = new jsPDF({ unit: "mm", format: "a4" });
      const W = 210, H = 297, M = 14, CW = W - 2 * M;
      const NOITE = [20, 17, 14], OURO = [217, 164, 65], OURO_ESC = [176, 122, 30], TINTA = [42, 33, 25], SUAVE = [120, 108, 96], CREME = [246, 238, 225], LINHA = [228, 218, 202], BRASA = [194, 103, 46];
      const cor = (f, c) => f === "t" ? pdf.setTextColor(...c) : f === "f" ? pdf.setFillColor(...c) : pdf.setDrawColor(...c);
      const fonte = (est, tam) => { pdf.setFont("helvetica", est); pdf.setFontSize(tam); };
      const logo = await carregarImg("assets/logo-branca.png");
      let y = 0;
      const pc = x => Math.round(x * 100) + "%", num = x => x.toFixed(x < 10 ? 1 : 0).replace(".", ",");

      function cabecalho(compacto) {
        const h = compacto ? 22 : 46;
        cor("f", NOITE); pdf.rect(0, 0, W, h, "F");
        cor("f", OURO); pdf.rect(0, h, W, 1.2, "F");
        if (logo) { const lh = compacto ? 14 : 30, lw = lh * logo.w / logo.h; pdf.addImage(logo.url, "PNG", M, (h - lh) / 2, lw, lh); }
        const x0 = M + (compacto ? 26 : 50);
        if (compacto) { cor("t", [243, 231, 211]); fonte("bold", 12); pdf.text("Relatório de frequência", x0, 12.5); cor("t", OURO); fonte("normal", 8.5); pdf.text(`${u.nomeEscopo} · ${dBR(u.desde)} a ${dBR(hoje)}`, x0, 17.5); return h + 8; }
        cor("t", OURO); fonte("bold", 8.5); pdf.text("CATEDRAL PÃO DA VIDA  ·  RELATÓRIO PASTORAL", x0, 15);
        cor("t", [243, 231, 211]); fonte("bold", 22); pdf.text("Frequência nos cultos", x0, 25.5);
        fonte("normal", 10); cor("t", [214, 200, 178]); pdf.text(`${u.nomeEscopo}  ·  ${dBR(u.desde)} a ${dBR(hoje)}`, x0, 33);
        fonte("normal", 8); cor("t", [160, 146, 128]); pdf.text(`Emitido em ${dBR(hoje)}`, W - M, 40, { align: "right" });
        return h + 10;
      }
      function titulo(t, sub) {
        cor("f", OURO); pdf.rect(M, y - 3.6, 1.4, 5.2, "F");
        cor("t", TINTA); fonte("bold", 13); pdf.text(t, M + 4, y + 0.6); y += 5;
        if (sub) { cor("t", SUAVE); fonte("normal", 8.5); pdf.text(sub, M + 4, y + 0.5); y += 5; }
        y += 2;
      }
      function precisa(h) { if (y + h > H - 18) { pdf.addPage(); y = cabecalho(true); } }
      function barra(x, yy, w, h, f, c) { cor("f", [236, 228, 214]); pdf.roundedRect(x, yy, w, h, h / 2, h / 2, "F"); if (f > 0) { cor("f", c || OURO); pdf.roundedRect(x, yy, Math.max(h, w * Math.min(1, f)), h, h / 2, h / 2, "F"); } }

      y = cabecalho(false);
      // KPIs
      const k = [["Média por encontro", num(u.media), u.tendencia || `${u.nE} encontros`], ["Frequência média", pc(u.freqMedia), "dos membros por encontro"], ["Vieram ao menos 1 vez", `${u.vieram}/${u.noEscopo.length}`, `${pc(u.noEscopo.length ? u.vieram / u.noEscopo.length : 0)} dos membros`], ["Encontros", String(u.nE), `${u.totalPres} presenças`]];
      const kw = (CW - 3 * 4) / 4;
      k.forEach(([r, v, s2], i) => {
        const x = M + i * (kw + 4);
        cor("f", i === 0 ? NOITE : CREME); pdf.roundedRect(x, y, kw, 30, 3, 3, "F");
        cor("t", i === 0 ? OURO : SUAVE); fonte("bold", 7.5); pdf.text(r.toUpperCase(), x + 4, y + 7);
        cor("t", i === 0 ? [241, 207, 134] : TINTA); fonte("bold", 21); pdf.text(v, x + 4, y + 19);
        cor("t", i === 0 ? [214, 200, 178] : SUAVE); fonte("normal", 7.5); pdf.text(pdf.splitTextToSize(s2, kw - 8)[0], x + 4, y + 25.5);
      });
      y += 40;

      // gráfico de colunas
      titulo("Presentes por encontro", `Os ${u.linha.length} encontros mais recentes do período`);
      const gh = 46, n = u.linha.length, gw = CW / Math.max(n, 1), mx = Math.max(...u.linha.map(e => e.n), 1);
      cor("d", LINHA); pdf.setLineWidth(0.2);
      [0, .5, 1].forEach(f => pdf.line(M, y + gh - gh * f, W - M, y + gh - gh * f));
      u.linha.forEach((e, i) => {
        const bh = Math.max(1, gh * e.n / mx), bw = Math.min(9, gw * 0.62), x = M + i * gw + (gw - bw) / 2;
        cor("f", i === n - 1 ? BRASA : OURO); pdf.roundedRect(x, y + gh - bh, bw, bh, 1.2, 1.2, "F");
        cor("t", TINTA); fonte("bold", 7.5); pdf.text(String(e.n), x + bw / 2, y + gh - bh - 1.6, { align: "center" });
        if (n <= 10 || i % 2 === 0 || i === n - 1) { cor("t", SUAVE); fonte("normal", 6.5); pdf.text(`${e.data.slice(8)}/${e.data.slice(5, 7)}`, x + bw / 2, y + gh + 4.5, { align: "center" }); }
      });
      y += gh + 13;

      // média por culto
      precisa(14 + u.titulos.length * 9);
      titulo("Média de presentes por culto e evento");
      const mt = Math.max(...u.titulos.map(x => x.m), 1);
      u.titulos.forEach(x => {
        cor("t", TINTA); fonte("bold", 9); pdf.text(pdf.splitTextToSize(x.k, 70)[0], M + 4, y + 3);
        cor("t", SUAVE); fonte("normal", 7.5); pdf.text(`${x.n} ${x.n === 1 ? "encontro" : "encontros"}`, M + 4, y + 7);
        barra(M + 80, y + 1, CW - 100, 3.2, x.m / mt);
        cor("t", OURO_ESC); fonte("bold", 10); pdf.text(num(x.m), W - M, y + 4, { align: "right" });
        y += 10;
      });
      y += 4;

      // grupos e departamentos
      [[u.resG, "Por grupo"], [u.resD, "Por departamento"]].forEach(([lista, t]) => {
        if (!lista.length) return;
        precisa(16 + Math.min(lista.length, 4) * 8);
        titulo(t, "Frequência média dos membros nos encontros do período");
        lista.forEach(x => {
          precisa(8);
          cor("t", TINTA); fonte("bold", 9); pdf.text(pdf.splitTextToSize(x.g.nome, 60)[0], M + 4, y + 3);
          cor("t", SUAVE); fonte("normal", 7.5); pdf.text(`${x.v} de ${x.n} vieram`, M + 66, y + 3);
          barra(M + 96, y + 0.8, CW - 116, 3.2, x.fr);
          cor("t", OURO_ESC); fonte("bold", 10); pdf.text(pc(x.fr), W - M, y + 3.8, { align: "right" });
          y += 8;
        });
        y += 5;
      });

      // tabela de membros
      y += 4; precisa(40);
      titulo("Frequência por membro", `${u.noEscopo.length} membros · ${u.nE} encontros no período`);
      const col = [M, M + 8, M + 68, M + 108, M + 128, M + 160];
      function cabTabela() {
        cor("f", NOITE); pdf.roundedRect(M, y - 4.5, CW, 7.5, 1.5, 1.5, "F");
        cor("t", [241, 207, 134]); fonte("bold", 7.5);
        ["#", "Membro", "Grupo / departamento", "Presenças", "Frequência", "Última vez"].forEach((h, i) => pdf.text(h, col[i] + 2, y));
        y += 6;
      }
      cabTabela();
      linhasMembros().forEach((r, i) => {
        if (y + 7 > H - 18) { pdf.addPage(); y = cabecalho(true); cabTabela(); }
        if (i % 2 === 0) { cor("f", [250, 245, 236]); pdf.rect(M, y - 4.2, CW, 7, "F"); }
        cor("t", SUAVE); fonte("normal", 8); pdf.text(String(i + 1), col[0] + 2, y);
        cor("t", TINTA); fonte("bold", 8.5); pdf.text(pdf.splitTextToSize(r.m.nome_completo || "", 56)[0], col[1] + 2, y);
        cor("t", SUAVE); fonte("normal", 7.5); pdf.text(pdf.splitTextToSize(r.grupo || "—", 37)[0], col[2] + 2, y);
        cor("t", TINTA); fonte("normal", 8.5); pdf.text(`${r.n} de ${u.nE}`, col[3] + 2, y);
        barra(col[4] + 2, y - 2.4, 20, 2.6, r.f, r.f >= .5 ? OURO : r.f > 0 ? [229, 196, 128] : BRASA);
        cor("t", TINTA); fonte("bold", 8); pdf.text(pc(r.f), col[4] + 24.5, y);
        cor("t", r.ult ? SUAVE : BRASA); fonte("normal", 8); pdf.text(r.ult ? dBR(r.ult) : "sem presença", col[5] + 2, y);
        y += 7;
      });

      // sentimos falta
      if (u.falta.length) {
        y += 6; precisa(24);
        titulo("Sentimos falta", "Sem presença registrada nos últimos 20 dias. Vale uma ligação ou visita.");
        u.falta.forEach(m => {
          precisa(8);
          cor("f", CREME); pdf.roundedRect(M, y - 4.4, CW, 7, 1.5, 1.5, "F");
          cor("t", TINTA); fonte("bold", 8.5); pdf.text(m.nome_completo || "", M + 4, y);
          cor("t", SUAVE); fonte("normal", 8); pdf.text(u.ultimaVez.has(m.id) ? `Última vez em ${dBR(u.ultimaVez.get(m.id))}` : "Sem presença no período", M + 92, y);
          const tel = String(m.telefone || "").replace(/\D/g, "");
          if (tel.length >= 10) pdf.text(tel.length === 11 ? `(${tel.slice(0, 2)}) ${tel.slice(2, 7)}-${tel.slice(7)}` : `(${tel.slice(0, 2)}) ${tel.slice(2, 6)}-${tel.slice(6)}`, W - M - 4, y, { align: "right" });
          y += 8;
        });
      }

      // rodapé em todas as páginas
      const tp = pdf.getNumberOfPages();
      for (let p = 1; p <= tp; p++) {
        pdf.setPage(p);
        cor("d", LINHA); pdf.setLineWidth(0.3); pdf.line(M, H - 12, W - M, H - 12);
        cor("t", SUAVE); fonte("normal", 7);
        pdf.text("Catedral Pão da Vida · IEQ Balneário Ipanema · Presenças registradas pelo app na igreja e marcadas pelos líderes", M, H - 7.5);
        pdf.text(`${p} / ${tp}`, W - M, H - 7.5, { align: "right" });
      }
      const blob = pdf.output("blob"), nome = nomeArq("pdf");
      if (window.cpvEntregarArquivo) await window.cpvEntregarArquivo(blob, nome, "application/pdf"); else salvar(blob, nome);
    } catch (e) {
      console.error("PDF frequência:", e);
      typeof mostrarToast === "function" && mostrarToast("Não foi possível gerar o PDF. Tente de novo.");
    } finally { if (btn) { btn.disabled = false; btn.textContent = txt; } }
  }


  /* ---------- entradas ---------- */
  function cardServir() {
    const lista = $("#tela-cpv-servir .cpv-servir"); if (!lista) return;
    let c = $('[data-area="frequencia"]', lista);
    const ac = meuAcesso();
    if (!c && ac) {
      c = document.createElement("button"); c.type = "button"; c.className = "cpv-area"; c.dataset.area = "frequencia"; c.style.setProperty("--cor", "var(--s-calice)");
      c.innerHTML = `<span class="cpv-area-ic"><svg class="ci" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg></span><span class="cpv-area-tx"><b>Frequência</b><small>${ac.geral ? "Presença nos cultos, por grupo e departamento" : "Presença do seu grupo nos cultos"}</small></span><svg class="ci cpv-seta-dir" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>`;
      c.addEventListener("click", () => abrirFrequencia("tela-cpv-servir"));
      lista.prepend(c);
    }
    if (c) c.hidden = !ac;
  }
  function iniciar() {
    document.getElementById("admin-card-frequencia")?.addEventListener("click", () => abrirFrequencia("tela-admin-painel"));
    let n = 0;
    (function esperar() {
      if (pronto() && state.membro) { tentar(false); return; }
      if (n++ < 120) setTimeout(esperar, 500);
    })();
    setInterval(() => { pintar(); cardServir(); }, 1500);
    setInterval(() => { if (document.visibilityState === "visible") tentar(false); }, 3 * 6e4);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { cacheDia = null; tentar(false); } });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else setTimeout(iniciar, 0);
})();
