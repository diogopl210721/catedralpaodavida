/* Rol de membros em Excel (.xlsx) formatado — painel administrativo da Catedral Pão da Vida */
(function () {
  const DOURADO = "FFD9A441", NOITE = "FF14110E", CREME = "FFF6EEE1", CREME2 = "FFFBF7EF", TINTA = "FF2A2119", SUAVE = "FF786C60", LINHA = "FFE4DACA";
  const MES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const GENERO = { masculino: "Masculino", feminino: "Feminino", m: "Masculino", f: "Feminino" };
  const EST = { solteiro: "Solteiro(a)", casado: "Casado(a)", divorciado: "Divorciado(a)", viuvo: "Viúvo(a)", "viúvo": "Viúvo(a)", uniao_estavel: "União estável" };

  function carregarScript(src) {
    return new Promise((ok, erro) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => erro(new Error("Falha ao carregar " + src)); document.head.appendChild(s); });
  }
  const data = iso => { if (!iso) return null; const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const dBR = d => d ? `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}` : "";
  function idade(nasc) { if (!nasc) return null; const h = new Date(); let a = h.getFullYear() - nasc.getUTCFullYear(); const m = h.getMonth() - nasc.getUTCMonth(); if (m < 0 || (m === 0 && h.getDate() < nasc.getUTCDate())) a--; return a >= 0 && a < 130 ? a : null; }
  function tel(t) { const n = String(t || "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, ""); if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 3)} ${n.slice(3, 7)}-${n.slice(7)}`; if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`; return t || ""; }
  const cap = s => String(s || "").trim();
  function generoTxt(g) { const k = String(g || "").toLowerCase().trim(); return GENERO[k] || cap(g); }
  function estadoTxt(e) { const k = String(e || "").toLowerCase().trim(); return EST[k] || cap(e); }

  async function logoBase64() {
    try {
      const r = await fetch("assets/logo-branca.png"); const b = await r.blob();
      const url = await new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(b); });
      const img = await new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = url; });
      return img ? { b64: url.split(",")[1], w: img.naturalWidth, h: img.naturalHeight } : null;
    } catch (e) { return null; }
  }

  async function carregarDados() {
    const ig = state.igreja;
      const [mb, gr, mg] = await Promise.all([
      sb.from("igr_membros").select("id,numero,foto_url,nome_completo,genero,data_nascimento,estado_civil,telefone,email,endereco,profissao,grupo_id,eh_lider,batizado,data_batismo,pastor_batismo,created_at,ultimo_acesso,autoriza_fotos").eq("igreja_id", ig.id).order("nome_completo"),
      sb.from("igr_grupos").select("id,nome,tipo").eq("igreja_id", ig.id),
      sb.from("igr_membros_grupos").select("membro_id,grupo_id"),
    ]);
    if (mb.error) throw mb.error;
    const membros = mb.data || [], grupos = new Map((gr.data || []).map(g => [g.id, g]));
    const extras = new Map();
    (mg.data || []).forEach(r => { if (!grupos.has(r.grupo_id)) return; if (!extras.has(r.membro_id)) extras.set(r.membro_id, new Set()); extras.get(r.membro_id).add(r.grupo_id); });
    // número de membro: o salvo, senão a ordem de cadastro (igual à carteirinha)
    const porCadastro = membros.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const ordem = new Map(porCadastro.map((m, i) => [m.id, "CPV-" + String(i + 1).padStart(4, "0")]));

    const linhas = membros.map(m => {
      const nasc = data(m.data_nascimento), outros = [...(extras.get(m.id) || [])].filter(g => g !== m.grupo_id).map(g => grupos.get(g)?.nome).filter(Boolean);
      return {
        num: m.numero || ordem.get(m.id), nome: cap(m.nome_completo), genero: generoTxt(m.genero), nasc, idade: idade(nasc), estado: estadoTxt(m.estado_civil),
        tel: tel(m.telefone), email: cap(m.email), endereco: cap(m.endereco), profissao: cap(m.profissao),
        grupo: grupos.get(m.grupo_id)?.nome || "", outros: outros.join(", "), lider: m.eh_lider ? "Sim" : "Não",
        batizado: m.batizado ? "Sim" : "Não", dataBat: data(m.data_batismo), porQuem: cap(m.pastor_batismo),
        desde: data(m.created_at), acesso: data(m.ultimo_acesso), fotos: m.autoriza_fotos === false ? "Não" : m.autoriza_fotos ? "Sim" : "",
        tipoGrupo: grupos.get(m.grupo_id)?.tipo, id: m.id, foto: m.foto_url, gids: new Set([m.grupo_id, ...(extras.get(m.id) || [])].filter(Boolean)), telBruto: m.telefone,
      };
    });

    return { linhas, grupos };
  }

  async function gerarRol(btn, dadosProntos, filtrar) {
    const txt = btn && btn.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = "Gerando planilha…"; }
    try {
      if (!window.ExcelJS) await carregarScript("vendor/exceljs.min.js");
      const ig = state.igreja;
      const { linhas: todas, grupos } = dadosProntos || await carregarDados();
      const linhas = filtrar ? filtrar.fn(todas) : todas, rotulo = filtrar && filtrar.rotulo ? ` · ${filtrar.rotulo}` : "";
      const wb = new ExcelJS.Workbook();
      wb.creator = "App Catedral Pão da Vida"; wb.created = new Date();
      const logo = await logoBase64();
      const logoId = logo ? wb.addImage({ base64: logo.b64, extension: "png" }) : null;
      const hoje = new Date(), hojeTxt = `${String(hoje.getDate()).padStart(2, "0")}/${String(hoje.getMonth() + 1).padStart(2, "0")}/${hoje.getFullYear()}`;

      const COLS = [
        ["Nº", "num", 11], ["Nome completo", "nome", 34], ["Gênero", "genero", 12], ["Nascimento", "nasc", 13, "dd/mm/yyyy"], ["Idade", "idade", 8],
        ["Estado civil", "estado", 14], ["Telefone", "tel", 18], ["E-mail", "email", 28], ["Endereço", "endereco", 36], ["Profissão", "profissao", 20],
        ["Grupo / departamento", "grupo", 22], ["Também participa de", "outros", 28], ["Líder", "lider", 8], ["Batizado", "batizado", 10],
        ["Data do batismo", "dataBat", 15, "dd/mm/yyyy"], ["Batizado(a) por", "porQuem", 22], ["Membro desde", "desde", 14, "dd/mm/yyyy"],
        ["Último acesso ao app", "acesso", 18, "dd/mm/yyyy"], ["Autoriza fotos", "fotos", 13],
      ];
      const N = COLS.length;
      const cabecalho = (ws, titulo, sub, nCols) => {
        ws.properties.defaultRowHeight = 20;
        for (let r = 1; r <= 4; r++) { const row = ws.getRow(r); row.height = r === 1 ? 14 : r === 2 ? 34 : r === 3 ? 22 : 20; for (let c = 1; c <= nCols; c++) row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: NOITE } }; }
        const t = ws.getCell(2, 3); t.value = titulo; t.font = { name: "Calibri", size: 22, bold: true, color: { argb: "FFF3E7D3" } }; t.alignment = { vertical: "middle" };
        const s = ws.getCell(3, 3); s.value = sub; s.font = { name: "Calibri", size: 11, color: { argb: DOURADO } }; s.alignment = { vertical: "middle" };
        const e = ws.getCell(4, 3); e.value = `Emitido em ${hojeTxt} pelo app da igreja`; e.font = { name: "Calibri", size: 9, color: { argb: "FFA09280" } };
        for (let c = 1; c <= nCols; c++) ws.getCell(5, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: DOURADO } };
        ws.getRow(5).height = 4;
        if (logoId !== null) { const h = 62, w = h * logo.w / logo.h; ws.addImage(logoId, { tl: { col: 0.25, row: 0.5 }, ext: { width: w, height: h }, editAs: "absolute" }); }
      };
      const borda = { top: { style: "thin", color: { argb: LINHA } }, bottom: { style: "thin", color: { argb: LINHA } }, left: { style: "thin", color: { argb: LINHA } }, right: { style: "thin", color: { argb: LINHA } } };

      /* ---- aba 1: rol ---- */
      const ws = wb.addWorksheet("Rol de membros", {
        views: [{ state: "frozen", ySplit: 7, xSplit: 2, showGridLines: false }],
        pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: .3, right: .3, top: .4, bottom: .5, header: .2, footer: .2 }, printTitlesRow: "7:7" },
        headerFooter: { oddFooter: `&L&8Catedral Pão da Vida · Rol de membros · ${hojeTxt}&R&8Página &P de &N` },
      });
      COLS.forEach(([, , w], i) => { ws.getColumn(i + 1).width = w; });
      cabecalho(ws, "Rol de Membros", `${ig.nome || "Catedral Pão da Vida"} · Igreja do Evangelho Quadrangular · Pr. Ismair Soares e Pra. Débora Soares · ${linhas.length} membros${rotulo}`, N);
      ws.getRow(6).height = 10;
      const hr = ws.getRow(7); hr.height = 30;
      COLS.forEach(([t], i) => {
        const c = hr.getCell(i + 1); c.value = t;
        c.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: "FFF1CF86" } };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2A2119" } };
        c.alignment = { vertical: "middle", horizontal: i === 0 || i === 4 || i >= 12 && i !== 15 ? "center" : "left", wrapText: true, indent: i === 0 || i === 4 || (i >= 12 && i !== 15) ? 0 : 1 };
        c.border = { bottom: { style: "medium", color: { argb: DOURADO } } };
      });
      linhas.forEach((l, k) => {
        const row = ws.getRow(8 + k); row.height = 22;
        COLS.forEach(([, chave, , fmt], i) => {
          const c = row.getCell(i + 1); const v = l[chave];
          c.value = v === "" || v === undefined ? null : v;
          if (fmt) c.numFmt = fmt;
          c.font = { name: "Calibri", size: 10.5, color: { argb: i === 1 ? TINTA : "FF4A3F35" }, bold: i === 1 };
          c.alignment = { vertical: "middle", horizontal: i === 0 || i === 3 || i === 4 || (i >= 12 && i !== 15) ? "center" : "left", indent: i === 0 || i === 3 || i === 4 || (i >= 12 && i !== 15) ? 0 : 1 };
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: k % 2 ? CREME2 : "FFFFFFFF" } };
          c.border = borda;
        });
        if (l.lider === "Sim") { const c = row.getCell(13); c.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: "FFB07A1E" } }; }
        if (l.batizado === "Sim") row.getCell(14).font = { name: "Calibri", size: 10.5, bold: true, color: { argb: "FF2E7D4F" } };
      });
      const fim = 7 + linhas.length;
      ws.autoFilter = { from: { row: 7, column: 1 }, to: { row: Math.max(fim, 7), column: N } };
      // rodapé com totais
      const tr = ws.getRow(fim + 2);
      tr.getCell(2).value = `Total: ${linhas.length} membros · ${linhas.filter(l => l.batizado === "Sim").length} batizados · ${linhas.filter(l => l.lider === "Sim").length} líderes`;
      tr.getCell(2).font = { name: "Calibri", size: 10.5, bold: true, color: { argb: "FFB07A1E" } };

      /* ---- aba 2: resumo ---- */
      const rs = wb.addWorksheet("Resumo", { views: [{ showGridLines: false }], pageSetup: { orientation: "portrait", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
      [26, 14, 4, 26, 14, 4, 22, 14].forEach((w, i) => { rs.getColumn(i + 1).width = w; });
      cabecalho(rs, "Resumo da membresia", `${ig.nome || "Catedral Pão da Vida"} · ${linhas.length} membros${rotulo}`, 8);
      const bloco = (col, linha0, titulo, pares) => {
        const h = rs.getCell(linha0, col); h.value = titulo; h.font = { name: "Calibri", size: 13, bold: true, color: { argb: TINTA } };
        rs.getCell(linha0 + 1, col).border = { top: { style: "medium", color: { argb: DOURADO } } }; rs.getCell(linha0 + 1, col + 1).border = { top: { style: "medium", color: { argb: DOURADO } } };
        pares.forEach(([k, v], i) => {
          const a = rs.getCell(linha0 + 1 + i, col), b = rs.getCell(linha0 + 1 + i, col + 1);
          a.value = k; b.value = v;
          [a, b].forEach((c, j) => { c.font = { name: "Calibri", size: 11, bold: j === 1, color: { argb: j ? "FFB07A1E" : TINTA } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: i % 2 ? CREME2 : CREME } }; c.alignment = { vertical: "middle", horizontal: j ? "center" : "left", indent: j ? 0 : 1 }; c.border = borda; });
          rs.getRow(linha0 + 1 + i).height = 21;
        });
        return linha0 + 2 + pares.length;
      };
      const cont = f => { const m = new Map(); linhas.forEach(l => { const k = f(l) || "Não informado"; m.set(k, (m.get(k) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
      const idades = linhas.map(l => l.idade).filter(x => x != null);
      const faixa = a => a < 12 ? "Crianças (0–11)" : a < 18 ? "Adolescentes (12–17)" : a < 30 ? "Jovens (18–29)" : a < 60 ? "Adultos (30–59)" : "Melhor idade (60+)";
      let y1 = bloco(1, 7, "Visão geral", [
        ["Membros", linhas.length], ["Batizados", linhas.filter(l => l.batizado === "Sim").length], ["Ainda não batizados", linhas.filter(l => l.batizado !== "Sim").length],
        ["Líderes", linhas.filter(l => l.lider === "Sim").length], ["Idade média", idades.length ? Math.round(idades.reduce((s, x) => s + x, 0) / idades.length) : "—"],
        ["Com telefone", linhas.filter(l => l.tel).length], ["Usaram o app (30 dias)", linhas.filter(l => l.acesso && Date.now() - l.acesso < 30 * 864e5).length],
      ]);
      y1 = bloco(1, y1 + 1, "Gênero", cont(l => l.genero));
      y1 = bloco(1, y1 + 1, "Estado civil", cont(l => l.estado));
      bloco(1, y1 + 1, "Faixa etária", cont(l => l.idade == null ? "" : faixa(l.idade)));
      let y2 = bloco(4, 7, "Grupos", cont(l => l.tipoGrupo === "departamento" ? null : l.grupo).filter(([k]) => k !== "Não informado"));
      const deps = new Map(); linhas.forEach(l => { [l.tipoGrupo === "departamento" ? l.grupo : null, ...l.outros.split(", ")].filter(Boolean).forEach(n => { if ([...grupos.values()].some(g => g.nome === n && g.tipo === "departamento")) deps.set(n, (deps.get(n) || 0) + 1); }); });
      bloco(4, y2 + 1, "Departamentos e ministérios", [...deps.entries()].sort((a, b) => b[1] - a[1]));
      const porMes = MES.map((m, i) => [m, linhas.filter(l => l.nasc && l.nasc.getUTCMonth() === i).length]);
      bloco(7, 7, "Aniversariantes por mês", porMes);

      /* ---- aba 3: aniversariantes ---- */
      const an = wb.addWorksheet("Aniversariantes", { views: [{ state: "frozen", ySplit: 7, showGridLines: false }], pageSetup: { orientation: "portrait", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
      [14, 34, 12, 10, 18, 22].forEach((w, i) => { an.getColumn(i + 1).width = w; });
      cabecalho(an, "Aniversariantes", "Membros com data de nascimento, mês a mês", 6);
      const ah = an.getRow(7); ah.height = 26;
      ["Mês", "Nome", "Dia", "Idade", "Telefone", "Grupo / departamento"].forEach((t, i) => { const c = ah.getCell(i + 1); c.value = t; c.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: "FFF1CF86" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2A2119" } }; c.alignment = { vertical: "middle", horizontal: i === 1 || i >= 4 ? "left" : "center", indent: i === 1 || i >= 4 ? 1 : 0 }; });
      let r = 8;
      MES.forEach((mes, i) => {
        const lista = linhas.filter(l => l.nasc && l.nasc.getUTCMonth() === i).sort((a, b) => a.nasc.getUTCDate() - b.nasc.getUTCDate());
        if (!lista.length) return;
        lista.forEach((l, k) => {
          const row = an.getRow(r++); row.height = 21;
          [k === 0 ? mes : "", l.nome, String(l.nasc.getUTCDate()).padStart(2, "0") + "/" + String(i + 1).padStart(2, "0"), l.idade != null ? l.idade + 1 : null, l.tel, l.grupo].forEach((v, j) => {
            const c = row.getCell(j + 1); c.value = v === "" ? null : v;
            c.font = { name: "Calibri", size: 10.5, bold: j <= 1, color: { argb: j === 0 ? "FFB07A1E" : TINTA } };
            c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: i % 2 ? CREME2 : "FFFFFFFF" } };
            c.alignment = { vertical: "middle", horizontal: j === 1 || j >= 4 ? "left" : "center", indent: j === 1 || j >= 4 ? 1 : 0 };
            c.border = borda;
          });
        });
      });
      if (r > 8) an.getCell(r + 1, 2).value = "A idade mostrada é a que a pessoa vai completar no aniversário.";
      an.getCell(r + 1, 2).font = { name: "Calibri", size: 9, italic: true, color: { argb: SUAVE } };

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const nome = `rol-de-membros-catedral-${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}.xlsx`;
      if (window.cpvEntregarArquivo) await window.cpvEntregarArquivo(blob, nome, blob.type);
      else { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); a.remove(); }
    } catch (e) {
      console.error("Rol de membros:", e);
      typeof mostrarToast === "function" ? mostrarToast("Não foi possível gerar a planilha. Tente de novo.") : alert("Não foi possível gerar a planilha.");
    } finally { if (btn) { btn.disabled = false; btn.innerHTML = txt; } }
  }
  window.gerarRolMembros = gerarRol;

  /* ================= tela do rol ================= */
  const $ = (q, r = document) => r.querySelector(q);
  const esc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const R = { dados: null, busca: "", grupo: "", filtro: "", aberto: null };
  const semAcento = t => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  function filtroAtual() {
    const g = R.grupo && R.dados ? R.dados.grupos.get(R.grupo) : null;
    const partes = [];
    if (g) partes.push(g.nome);
    if (R.filtro === "batizados") partes.push("batizados");
    if (R.filtro === "nao") partes.push("ainda não batizados");
    if (R.filtro === "lideres") partes.push("líderes");
    if (R.busca.trim()) partes.push(`busca “${R.busca.trim()}”`);
    const q = semAcento(R.busca.trim());
    return {
      rotulo: partes.join(" · "),
      fn: lista => lista.filter(l =>
        (!R.grupo || l.gids.has(R.grupo)) &&
        (R.filtro !== "batizados" || l.batizado === "Sim") &&
        (R.filtro !== "nao" || l.batizado !== "Sim") &&
        (R.filtro !== "lideres" || l.lider === "Sim") &&
        (!q || semAcento(`${l.nome} ${l.num} ${l.tel} ${l.email} ${l.grupo} ${l.outros}`).includes(q))),
    };
  }

  async function abrirRol() {
    let t = $("#tela-cpv-rol");
    if (!t) {
      t = document.createElement("div");
      t.className = "screen cpv-layout"; t.id = "tela-cpv-rol";
      t.innerHTML = `<div class="scroll">
        <div class="cpv-topo-tela"><button type="button" class="cpv-voltar" data-cpv-voltar="tela-admin-painel" aria-label="Voltar"><svg class="ci" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
          <header class="cpv-saudacao"><p>Secretaria</p><h1>Rol de membros</h1></header></div>
        <div class="rl-acoes">
          <button type="button" class="cpv-btn ouro" data-rl-xlsx>Baixar Excel</button>
          <button type="button" class="cpv-btn linha" data-rl-pdf>Baixar PDF</button>
        </div>
        <div class="rl-filtros">
          <input type="search" class="rl-busca" placeholder="Buscar por nome, telefone ou nº" aria-label="Buscar membro" data-rl-busca>
          <select class="rl-sel" data-rl-grupo aria-label="Filtrar por grupo ou departamento"></select>
          <div class="rl-chips" role="group" aria-label="Filtro">
            <button type="button" data-f="">Todos</button><button type="button" data-f="batizados">Batizados</button><button type="button" data-f="nao">Não batizados</button><button type="button" data-f="lideres">Líderes</button>
          </div>
        </div>
        <div class="rl-resumo" data-rl-resumo></div>
        <ul class="rl-lista" data-rl-lista><li class="rl-vazio">Carregando…</li></ul>
        <p class="rl-nota">Os downloads levam só os membros que estão aparecendo, com os filtros escolhidos.</p>
      </div>`;
      ($("#tela-admin-painel") || document.body).after(t);
      $("[data-rl-busca]", t).addEventListener("input", e => { R.busca = e.target.value; pintar(); });
      $("[data-rl-grupo]", t).addEventListener("change", e => { R.grupo = e.target.value; pintar(); });
      $(".rl-chips", t).addEventListener("click", e => { const b = e.target.closest("button"); if (b) { R.filtro = b.dataset.f; pintar(); } });
      $("[data-rl-lista]", t).addEventListener("click", e => {
        const li = e.target.closest("[data-rl-id]"); if (!li || e.target.closest("a")) return;
        R.aberto = R.aberto === li.dataset.rlId ? null : li.dataset.rlId; pintar();
      });
      $("[data-rl-xlsx]", t).addEventListener("click", e => { if (R.dados) gerarRol(e.currentTarget, R.dados, filtroAtual()); });
      $("[data-rl-pdf]", t).addEventListener("click", e => { if (R.dados) gerarPDF(e.currentTarget); });
    }
    window.mostrarTela("tela-cpv-rol");
    R.dados = null; pintar();
    try { R.dados = await carregarDados(); }
    catch (e) { console.error(e); $("[data-rl-lista]").innerHTML = `<li class="rl-vazio">Não foi possível carregar os membros. Verifique a internet.</li>`; return; }
    const sel = $("[data-rl-grupo]");
    const gs = [...R.dados.grupos.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
    const op = tipo => gs.filter(g => (g.tipo === "departamento") === (tipo === "dep")).map(g => `<option value="${g.id}">${esc(g.nome)}</option>`).join("");
    sel.innerHTML = `<option value="">Todos os grupos e departamentos</option><optgroup label="Grupos">${op("grupo")}</optgroup><optgroup label="Departamentos">${op("dep")}</optgroup>`;
    sel.value = R.grupo;
    pintar();
  }
  window.abrirRolMembros = abrirRol;

  function pintar() {
    const t = $("#tela-cpv-rol"); if (!t) return;
    t.querySelectorAll(".rl-chips button").forEach(b => b.setAttribute("aria-pressed", b.dataset.f === R.filtro));
    const ul = $("[data-rl-lista]", t), res = $("[data-rl-resumo]", t);
    if (!R.dados) { ul.innerHTML = `<li class="rl-vazio">Carregando…</li>`; res.innerHTML = ""; return; }
    const lista = filtroAtual().fn(R.dados.linhas);
    const idades = lista.map(l => l.idade).filter(x => x != null);
    const kpi = (n, r) => `<div><b>${n}</b><span>${r}</span></div>`;
    res.innerHTML = kpi(lista.length, lista.length === 1 ? "membro" : "membros") + kpi(lista.filter(l => l.batizado === "Sim").length, "batizados") +
      kpi(lista.filter(l => l.lider === "Sim").length, "líderes") + kpi(idades.length ? Math.round(idades.reduce((s, x) => s + x, 0) / idades.length) : "—", "idade média");
    if (!lista.length) { ul.innerHTML = `<li class="rl-vazio">Nenhum membro com esses filtros.</li>`; return; }
    const ini = n => esc((n || "?").trim().split(/\s+/).map(p => p[0]).slice(0, 2).join("").toUpperCase());
    const zap = l => { const n = String(l.telBruto || "").replace(/\D/g, ""); return n.length >= 10 ? `https://wa.me/${n.length <= 11 ? "55" + n : n}` : ""; };
    const campo = (r, v) => v ? `<div><span>${r}</span><b>${esc(v)}</b></div>` : "";
    ul.innerHTML = lista.map(l => {
      const aberto = R.aberto === l.id;
      return `<li class="rl-item${aberto ? " aberto" : ""}" data-rl-id="${l.id}">
        <button type="button" class="rl-cab" aria-expanded="${aberto}">
          <span class="rl-av">${l.foto ? `<img src="${esc(l.foto)}" alt="" loading="lazy">` : ini(l.nome)}</span>
          <span class="rl-tx"><b>${esc(l.nome)}</b><small>${esc(l.num)}${l.grupo ? " · " + esc(l.grupo) : ""}</small></span>
          <span class="rl-tags">${l.lider === "Sim" ? `<i class="t-lider">Líder</i>` : ""}${l.batizado === "Sim" ? `<i class="t-bat">Batizado</i>` : ""}</span>
        </button>
        ${aberto ? `<div class="rl-det">
          ${campo("Telefone", l.tel)}${campo("E-mail", l.email)}
          ${campo("Nascimento", l.nasc ? dBR(l.nasc) + (l.idade != null ? ` · ${l.idade} anos` : "") : "")}
          ${campo("Gênero", l.genero)}${campo("Estado civil", l.estado)}${campo("Profissão", l.profissao)}
          ${campo("Endereço", l.endereco)}${campo("Também participa de", l.outros)}
          ${campo("Batismo", l.batizado === "Sim" ? [l.dataBat ? dBR(l.dataBat) : "", l.porQuem ? "por " + l.porQuem : ""].filter(Boolean).join(" ") || "Sim" : "Ainda não")}
          ${campo("Membro desde", l.desde ? dBR(l.desde) : "")}${campo("Último acesso ao app", l.acesso ? dBR(l.acesso) : "Nunca")}
          ${zap(l) ? `<a class="rl-zap" href="${zap(l)}" target="_blank" rel="noopener">Conversar no WhatsApp</a>` : ""}
        </div>` : ""}
      </li>`;
    }).join("");
  }

  /* ---------- PDF do rol ---------- */
  async function gerarPDF(btn) {
    const txt = btn.textContent; btn.disabled = true; btn.textContent = "Gerando PDF…";
    try {
      if (!window.jspdf) await carregarScript("vendor/jspdf.umd.min.js");
      const f = filtroAtual(), lista = f.fn(R.dados.linhas), ig = state.igreja;
      const { jsPDF } = window.jspdf, pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const W = 297, H = 210, M = 12, CW = W - 2 * M;
      const NOITE = [20, 17, 14], OURO = [217, 164, 65], OURO_ESC = [176, 122, 30], TINTA = [42, 33, 25], SUAVE = [120, 108, 96], ZEBRA = [250, 245, 236], VERDE = [46, 125, 79];
      const cor = (k, c) => k === "t" ? pdf.setTextColor(...c) : k === "f" ? pdf.setFillColor(...c) : pdf.setDrawColor(...c);
      const fonte = (e, t) => { pdf.setFont("helvetica", e); pdf.setFontSize(t); };
      const hoje = new Date(), hojeTxt = `${String(hoje.getDate()).padStart(2, "0")}/${String(hoje.getMonth() + 1).padStart(2, "0")}/${hoje.getFullYear()}`;
      let logo = null;
      try { const im = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = "assets/logo-branca.png"; }); const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext("2d").drawImage(im, 0, 0); logo = { url: c.toDataURL("image/png"), r: im.naturalWidth / im.naturalHeight }; } catch (e) {}
      const sub = `${ig.nome || "Catedral Pão da Vida"} · ${lista.length} ${lista.length === 1 ? "membro" : "membros"}${f.rotulo ? " · " + f.rotulo : ""}`;
      let y;
      const cab = grande => {
        const h = grande ? 34 : 18;
        cor("f", NOITE); pdf.rect(0, 0, W, h, "F"); cor("f", OURO); pdf.rect(0, h, W, 1, "F");
        if (logo) { const lh = grande ? 24 : 12; pdf.addImage(logo.url, "PNG", M, (h - lh) / 2, lh * logo.r, lh); }
        const x0 = M + (grande ? 40 : 22);
        if (grande) {
          cor("t", OURO); fonte("bold", 8); pdf.text("CATEDRAL PÃO DA VIDA  ·  SECRETARIA", x0, 12);
          cor("t", [243, 231, 211]); fonte("bold", 20); pdf.text("Rol de membros", x0, 21);
          cor("t", [214, 200, 178]); fonte("normal", 9.5); pdf.text(sub, x0, 28);
          cor("t", [160, 146, 128]); fonte("normal", 8); pdf.text(`Emitido em ${hojeTxt}`, W - M, 28, { align: "right" });
        } else { cor("t", [243, 231, 211]); fonte("bold", 11); pdf.text("Rol de membros", x0, 10.5); cor("t", OURO); fonte("normal", 8); pdf.text(sub, x0, 14.8); }
        return h + 8;
      };
      y = cab(true);
      // resumo
      const idades = lista.map(l => l.idade).filter(x => x != null);
      const k = [["Membros", lista.length], ["Batizados", lista.filter(l => l.batizado === "Sim").length], ["Líderes", lista.filter(l => l.lider === "Sim").length], ["Idade média", idades.length ? Math.round(idades.reduce((s, x) => s + x, 0) / idades.length) : "—"]];
      const kw = (CW - 3 * 4) / 4;
      k.forEach(([r, v], i) => { const x = M + i * (kw + 4); cor("f", i ? [246, 238, 225] : NOITE); pdf.roundedRect(x, y, kw, 15, 2.5, 2.5, "F"); cor("t", i ? SUAVE : OURO); fonte("bold", 7.5); pdf.text(r.toUpperCase(), x + 4, y + 6); cor("t", i ? TINTA : [241, 207, 134]); fonte("bold", 13); pdf.text(String(v), x + 4, y + 12.5); });
      y += 23;
      // tabela
      const C = [["Nº", 20], ["Nome", 62], ["Nascimento", 30], ["Estado civil", 23], ["Telefone", 30], ["Grupo / departamento", 42], ["Líder", 12], ["Batismo", 31], ["Membro desde", 23]];
      const xs = []; C.reduce((x, [, w]) => { xs.push(x); return x + w; }, M);
      const corta = (t, w) => { const s = String(t || "—"); return pdf.splitTextToSize(s, w - 3)[0] + (pdf.splitTextToSize(s, w - 3).length > 1 ? "…" : ""); };
      const thead = () => { cor("f", NOITE); pdf.roundedRect(M, y - 4.6, CW, 7.6, 1.5, 1.5, "F"); cor("t", [241, 207, 134]); fonte("bold", 7.8); C.forEach(([t], i) => pdf.text(t, xs[i] + 2, y)); y += 6.2; };
      thead();
      lista.forEach((l, i) => {
        if (y + 6.5 > H - 14) { pdf.addPage(); y = cab(false); thead(); }
        if (i % 2 === 0) { cor("f", ZEBRA); pdf.rect(M, y - 4.3, CW, 6.6, "F"); }
        const vals = [l.num, l.nome, l.nasc ? dBR(l.nasc) + (l.idade != null ? ` (${l.idade})` : "") : "—", l.estado || "—", l.tel || "—", [l.grupo, l.outros].filter(Boolean).join(", ") || "—", l.lider === "Sim" ? "Sim" : "—", l.batizado === "Sim" ? (l.dataBat ? dBR(l.dataBat) : "Sim") : "Ainda não", l.desde ? dBR(l.desde) : "—"];
        vals.forEach((v, j) => {
          fonte(j === 1 ? "bold" : "normal", j === 1 ? 8.4 : 8);
          cor("t", j === 0 ? SUAVE : j === 6 && v === "Sim" ? OURO_ESC : j === 7 && l.batizado === "Sim" ? VERDE : TINTA);
          pdf.text(corta(v, C[j][1]), xs[j] + 2, y);
        });
        y += 6.6;
      });
      const tp = pdf.getNumberOfPages();
      for (let p = 1; p <= tp; p++) {
        pdf.setPage(p); cor("d", [228, 218, 202]); pdf.setLineWidth(.3); pdf.line(M, H - 9, W - M, H - 9);
        cor("t", SUAVE); fonte("normal", 7); pdf.text(`Catedral Pão da Vida · Rol de membros · ${hojeTxt} · documento interno da secretaria`, M, H - 5); pdf.text(`${p} / ${tp}`, W - M, H - 5, { align: "right" });
      }
      const blob = pdf.output("blob"), nome = `rol-de-membros-catedral-${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}.pdf`;
      if (window.cpvEntregarArquivo) await window.cpvEntregarArquivo(blob, nome, "application/pdf");
      else { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); a.remove(); }
    } catch (e) {
      console.error("PDF do rol:", e);
      typeof mostrarToast === "function" && mostrarToast("Não foi possível gerar o PDF. Tente de novo.");
    } finally { btn.disabled = false; btn.textContent = txt; }
  }

  document.addEventListener("click", e => { const b = e.target.closest && e.target.closest("#admin-card-rol"); if (b) abrirRol(); });
})();
