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

  async function gerarRol(btn) {
    const txt = btn && btn.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = "Gerando planilha…"; }
    try {
      if (!window.ExcelJS) await carregarScript("vendor/exceljs.min.js");
      const ig = state.igreja;
      const [mb, gr, mg] = await Promise.all([
        sb.from("igr_membros").select("id,numero,nome_completo,genero,data_nascimento,estado_civil,telefone,email,endereco,profissao,grupo_id,eh_lider,batizado,data_batismo,pastor_batismo,created_at,ultimo_acesso,autoriza_fotos").eq("igreja_id", ig.id).order("nome_completo"),
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
          tipoGrupo: grupos.get(m.grupo_id)?.tipo,
        };
      });

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
      cabecalho(ws, "Rol de Membros", `${ig.nome || "Catedral Pão da Vida"} · Igreja do Evangelho Quadrangular · Pr. Ismair Soares e Pra. Débora Soares · ${linhas.length} membros`, N);
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
      cabecalho(rs, "Resumo da membresia", `${ig.nome || "Catedral Pão da Vida"} · ${linhas.length} membros`, 8);
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
  document.addEventListener("click", e => { const b = e.target.closest && e.target.closest("#admin-card-rol"); if (b) gerarRol(b); });
})();
