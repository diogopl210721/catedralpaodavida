/* Editar e excluir itens do Calendário e Avisos de onde eles aparecem.
   Pode: administração (senha), quem tem acesso especial àquela área, ou quem criou o item. */
(function () {
  const $ = (q, r = document) => r.querySelector(q);
  const esc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const itens = new Map();
  const SECAO = { cal: "calendario", aviso: "avisos" };
  const DIAS = [["", "Todos os dias do período"], ["domingo", "Domingo"], ["segunda", "Segunda-feira"], ["terca", "Terça-feira"], ["quarta", "Quarta-feira"], ["quinta", "Quinta-feira"], ["sexta", "Sexta-feira"], ["sabado", "Sábado"]];
  const REP = [["", "Toda semana"], ["1", "Só no 1º do mês"], ["2", "Só no 2º do mês"], ["3", "Só no 3º do mês"], ["4", "Só no 4º do mês"], ["5", "Só no último do mês"]];

  function gerente(secao) {
    if (state.adminNome && state.adminPapel === "geral") return true;
    if (state.adminPapel === "custom" && (state.adminSecoes || []).includes(secao)) return true;
    return typeof secoesEspeciaisDoMembro === "function" && secoesEspeciaisDoMembro(state.membro).includes(secao);
  }
  function pode(tipo, item) {
    if (!item) return false;
    if (gerente(SECAO[tipo])) return true;
    return !!(state.membro && item.criado_por_membro_id && item.criado_por_membro_id === state.membro.id);
  }
  window.cpvPodeGerir = pode;
  window.cpvGerirBotoes = function (tipo, item) {
    if (!pode(tipo, item)) return "";
    itens.set(tipo + ":" + item.id, item);
    return `<div class="gr-acoes"><button type="button" class="btn btn-ghost" data-gr-editar="${tipo}:${item.id}">✏️ Editar</button><button type="button" class="btn btn-ghost gr-del" data-gr-excluir="${tipo}:${item.id}">🗑️ Excluir</button></div>`;
  };

  /* ---------- folha de edição ---------- */
  function campo(id, rot, html) { return `<label class="gr-campo" for="${id}"><span>${rot}</span>${html}</label>`; }
  function input(id, v, tipo = "text", extra = "") { return `<input id="${id}" type="${tipo}" value="${esc(v || "")}" ${extra}>`; }
  function select(id, ops, v) { return `<select id="${id}">${ops.map(([k, r]) => `<option value="${k}" ${String(v ?? "") === k ? "selected" : ""}>${r}</option>`).join("")}</select>`; }

  function abrirEdicao(chave) {
    const item = itens.get(chave); if (!item) return;
    const [tipo] = chave.split(":");
    const cal = tipo === "cal";
    const f = document.createElement("div"); f.className = "gr-folha"; f.setAttribute("role", "dialog"); f.setAttribute("aria-modal", "true");
    f.innerHTML = `<form class="gr-c">
      <div class="gr-cab"><h2>${cal ? "Editar no calendário" : "Editar aviso"}</h2><button type="button" class="gr-x" data-gr-fechar aria-label="Fechar">✕</button></div>
      ${campo("gr-titulo", "Título", input("gr-titulo", item.titulo, "text", "required"))}
      ${cal ? `
        ${campo("gr-local", "Local", input("gr-local", item.local))}
        <div class="gr-dupla">${campo("gr-data", "Data (início)", input("gr-data", item.data, "date", "required"))}${campo("gr-data-fim", "Data final", input("gr-data-fim", item.data_fim, "date"))}</div>
        <div class="gr-dupla">${campo("gr-dia", "Dia da semana", select("gr-dia", DIAS, item.dia_semana || ""))}${campo("gr-rep", "Repetir", select("gr-rep", REP, item.semana_do_mes || ""))}</div>
        ${campo("gr-horario", "Horário", input("gr-horario", item.horario, "text", 'placeholder="Ex: 19h30"'))}
        ${campo("gr-obs", "Descrição", `<textarea id="gr-obs" rows="3">${esc(item.observacoes || "")}</textarea>`)}
      ` : `
        ${campo("gr-texto", "Texto", `<textarea id="gr-texto" rows="4">${esc(item.texto || "")}</textarea>`)}
        <div class="gr-dupla">${campo("gr-data", "Data do evento", input("gr-data", item.data_evento, "date"))}${campo("gr-horario", "Horário", input("gr-horario", item.horario_evento, "text", 'placeholder="Ex: 19h30"'))}</div>
        ${campo("gr-local", "Local", input("gr-local", item.local_evento))}
      `}
      <div class="gr-img">
        ${(cal ? item.imagem_url : item.imagem_url) ? `<img src="${esc(item.imagem_url)}" alt=""><label class="gr-check"><input type="checkbox" id="gr-tirar-img"> Remover a imagem</label>` : ""}
        ${campo("gr-imagem", item.imagem_url ? "Trocar a imagem" : "Imagem (opcional)", `<input id="gr-imagem" type="file" accept="image/*">`)}
      </div>
      <p class="gr-erro" data-gr-erro></p>
      <button type="submit" class="btn btn-primary">Salvar alterações</button>
    </form>`;
    document.body.appendChild(f); document.documentElement.classList.add("gr-travado");
    const fechar = () => { f.remove(); document.documentElement.classList.remove("gr-travado"); };
    f.addEventListener("click", e => { if (e.target === f || e.target.closest("[data-gr-fechar]")) fechar(); });
    const dia = $("#gr-dia", f), rep = $("#gr-rep", f);
    if (dia) { const ajusta = () => { rep.closest(".gr-campo").style.display = dia.value ? "" : "none"; if (!dia.value) rep.value = ""; }; dia.addEventListener("change", ajusta); ajusta(); }
    $("form", f).addEventListener("submit", async e => {
      e.preventDefault();
      const b = $("button[type=submit]", f); b.disabled = true; b.textContent = "Salvando…";
      const erro = $("[data-gr-erro]", f); erro.textContent = "";
      try {
        const arq = $("#gr-imagem", f).files[0];
        let imagem_url = item.imagem_url || null;
        if ($("#gr-tirar-img", f)?.checked) imagem_url = null;
        if (arq) imagem_url = await uploadArquivo(arq, cal ? "calendario" : "avisos");
        const titulo = $("#gr-titulo", f).value.trim(); if (!titulo) throw new Error("Preencha o título.");
        const horario = $("#gr-horario", f).value.trim() || null, local = $("#gr-local", f).value.trim() || null;
        if (cal) {
          const data = $("#gr-data", f).value; if (!data) throw new Error("Preencha a data de início.");
          const data_fim = $("#gr-data-fim", f).value || null, dia_semana = dia.value || null, semana_do_mes = dia_semana ? (+rep.value || null) : null;
          const observacoes = $("#gr-obs", f).value.trim() || null;
          const upd = { titulo, local: local || "A definir", data, data_fim, dia_semana, semana_do_mes, horario, observacoes, imagem_url };
          const { error } = await sb.from("igr_calendario_eventos").update(upd).eq("id", item.id);
          if (error) throw error;
          // mantém a origem (culto, evento ou aviso) igual ao que aparece no calendário
          if (item.aviso_id) await sb.from("igr_avisos").update({ titulo, data_evento: data, horario_evento: horario, local_evento: local, imagem_url }).eq("id", item.aviso_id);
          if (item.evento_id) await sb.from("igr_eventos").update({ titulo, local, data, data_fim, horario, banner_url: imagem_url, descricao: observacoes }).eq("id", item.evento_id);
          if (item.culto_id) await sb.from("igr_cultos").update({ titulo, local, horario, imagem_url, dia_semana, semana_do_mes, data: dia_semana ? null : data, data_inicio: dia_semana ? data : null, data_fim: dia_semana ? data_fim : null }).eq("id", item.culto_id);
          Object.assign(item, upd);
        } else {
          const texto = $("#gr-texto", f).value.trim() || null, data_evento = $("#gr-data", f).value || null;
          const upd = { titulo, texto, data_evento, horario_evento: horario, local_evento: local, imagem_url };
          const { error } = await sb.from("igr_avisos").update(upd).eq("id", item.id);
          if (error) throw error;
          if (data_evento) await sb.from("igr_calendario_eventos").update({ titulo, data: data_evento, horario, local: local || "A definir", imagem_url }).eq("aviso_id", item.id);
          Object.assign(item, upd);
        }
        fechar();
        typeof mostrarToast === "function" && mostrarToast("Alterações salvas ✓");
        atualizar(tipo, item.id);
      } catch (err) {
        console.error("editar:", err);
        erro.textContent = err.message && !/fetch/i.test(err.message) ? err.message : "Não foi possível salvar. Verifique a internet e tente de novo.";
        b.disabled = false; b.textContent = "Salvar alterações";
      }
    });
  }

  async function excluir(chave) {
    const item = itens.get(chave); if (!item) return;
    const [tipo] = chave.split(":");
    const origem = tipo === "cal" ? (item.culto_id ? "o culto" : item.evento_id ? "o evento" : item.aviso_id ? "o aviso" : "") : "";
    const msg = tipo === "cal"
      ? `Excluir “${item.titulo}” do calendário?${origem ? `\n\n${origem.charAt(0).toUpperCase() + origem.slice(1)} ligado a ele também será excluído.` : ""}\n\nIsso não pode ser desfeito.`
      : `Excluir o aviso “${item.titulo}”?\n\nEle sai do mural e do calendário. Isso não pode ser desfeito.`;
    if (!confirm(msg)) return;
    try {
      if (tipo === "cal") {
        const { error } = await sb.from("igr_calendario_eventos").delete().eq("id", item.id);
        if (error) throw error;
        if (item.aviso_id) await sb.from("igr_avisos").delete().eq("id", item.aviso_id);
        if (item.evento_id) await sb.from("igr_eventos").delete().eq("id", item.evento_id);
        if (item.culto_id) await sb.from("igr_cultos").delete().eq("id", item.culto_id);
      } else {
        await sb.from("igr_calendario_eventos").delete().eq("aviso_id", item.id);
        const { error } = await sb.from("igr_avisos").delete().eq("id", item.id);
        if (error) throw error;
      }
      itens.delete(chave);
      typeof mostrarToast === "function" && mostrarToast("Excluído ✓");
      atualizar(tipo, null);
    } catch (err) {
      console.error("excluir:", err);
      typeof mostrarToast === "function" ? mostrarToast("Não foi possível excluir. Tente de novo.") : alert("Não foi possível excluir.");
    }
  }

  async function atualizar(tipo, id) {
    try {
      if (tipo === "cal") {
        if (document.getElementById("admin-lista-calendario")?.offsetParent) carregarCalendarioAdminLista();
        if (typeof carregarCalendario === "function" && document.getElementById("tela-calendario")) {
          const diaAberto = document.getElementById("calendario-view-dia")?.style.display === "block" ? document.getElementById("cal-dia-titulo")?.dataset.iso : null;
          await carregarCalendario();
          if (diaAberto && typeof abrirDiaCalendario === "function") abrirDiaCalendario(diaAberto);
        }
      } else {
        if (document.getElementById("admin-lista-avisos")?.offsetParent && typeof carregarAvisosAdmin === "function") carregarAvisosAdmin();
        if (id && document.getElementById("tela-aviso-detalhe")?.classList.contains("active") && typeof abrirAvisoDetalhe === "function") abrirAvisoDetalhe(id, document.getElementById("aviso-detalhe-voltar")?.dataset.nav);
        else if (!id) document.getElementById("aviso-detalhe-voltar")?.click();
      }
    } catch (e) { console.warn(e); }
  }

  document.addEventListener("click", e => {
    const ed = e.target.closest && e.target.closest("[data-gr-editar]"); if (ed) { e.stopPropagation(); abrirEdicao(ed.dataset.grEditar); return; }
    const ex = e.target.closest && e.target.closest("[data-gr-excluir]"); if (ex) { e.stopPropagation(); excluir(ex.dataset.grExcluir); }
  }, true);

  /* ---------- lista no painel: Calendário ---------- */
  async function carregarCalendarioAdminLista() {
    const el = document.getElementById("admin-lista-calendario"); if (!el) return;
    el.innerHTML = `<p class="hint">Carregando…</p>`;
    const { data } = await sb.from("igr_calendario_eventos").select("*, igr_grupos(nome)").eq("igreja_id", state.igreja.id).order("data", { ascending: false }).limit(300);
    const hoje = typeof isoLocal === "function" ? isoLocal(new Date()) : new Date().toISOString().slice(0, 10);
    const lista = (data || []).filter(ev => ev.dia_semana ? (!ev.data_fim || ev.data_fim >= hoje) : (ev.data_fim || ev.data) >= hoje)
      .concat((data || []).filter(ev => !(ev.dia_semana ? (!ev.data_fim || ev.data_fim >= hoje) : (ev.data_fim || ev.data) >= hoje)));
    const quando = ev => typeof formatarPeriodoCalendario === "function" ? formatarPeriodoCalendario(ev.data, ev.data_fim, ev.dia_semana, ev.semana_do_mes) : ev.data;
    let passou = false;
    el.innerHTML = lista.map(ev => {
      const velho = !(ev.dia_semana ? (!ev.data_fim || ev.data_fim >= hoje) : (ev.data_fim || ev.data) >= hoje);
      const sep = velho && !passou ? (passou = true, `<p class="gr-sep">Já passaram</p>`) : "";
      return `${sep}<div class="card gr-linha${velho ? " velho" : ""}">
        ${ev.imagem_url ? `<img src="${esc(ev.imagem_url)}" alt="" class="gr-mini">` : ""}
        <div class="gr-info"><b>${esc(ev.titulo)}</b><span>${esc(quando(ev))}${ev.horario ? " · " + esc(ev.horario) : ""}</span><small>${esc(ev.igr_grupos?.nome || "Igreja toda")}${ev.culto_id ? " · Culto" : ev.evento_id ? " · Evento" : ev.aviso_id ? " · Aviso" : ""}</small></div>
        ${window.cpvGerirBotoes("cal", ev)}
      </div>`;
    }).join("") || `<div class="empty">Nada publicado no calendário ainda.</div>`;
  }
  window.carregarCalendarioAdminLista = carregarCalendarioAdminLista;
})();
