// Soldi — interfaccia.
// Ogni azione aggiunge, modifica o toglie un'operazione dal registro;
// poi lo stato viene ricalcolato da capo con engine.js.

import * as E from "./engine.js";
import * as DB from "./db.js";

const VERSIONE_APP = "1.0.0";
const GIORNI_PROMEMORIA_BACKUP = 7;

const S = { eventi: [], calc: null, tab: "oggi", mese: null, meta: {}, wizard: null };
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const { eur, conSegno: sgn, nomeMese: mName } = E;
const mCap = ym => { const n = mName(ym); return n[0].toUpperCase() + n.slice(1); };
const dLabel = d => { const [, m, g] = d.split("-").map(Number); return g + " " + E.MESI[m - 1].slice(0, 3); };
const oggi = () => E.oggiISO();
// "30 novembre 2026": ultimo giorno del mese, per dire chiaramente fin quando si è coperti
const fineMese = ym => E.daysIn(ym) + " " + mName(ym);
const meseIntero = ym => mName(ym) + " (dal 1° al " + fineMese(ym) + ")";

/* ---------- Dati ---------- */

function ricalcola() { S.calc = S.eventi.length ? E.calcola(S.eventi, oggi()) : null; }
const st = () => S.calc && S.calc.stato;

async function aggiungi(ev, msg) {
  const e = { id: E.uid(), ts: E.nuovoTs(), data: oggi(), ...ev };
  try { await DB.salvaEvento(e); } catch (err) { console.error(err); toast("Non sono riuscito a salvare"); return false; }
  S.eventi.push(e);
  ricalcola(); closeSheet(); render(); if (msg) toast(msg);
  return true;
}
async function sostituisci(e, msg) {
  try { await DB.salvaEvento(e); } catch (err) { console.error(err); toast("Non sono riuscito a salvare"); return; }
  S.eventi = S.eventi.map(x => (x.id === e.id ? e : x));
  ricalcola(); closeSheet(); render(); if (msg) toast(msg);
}
async function togli(id, msg) {
  try { await DB.eliminaEvento(id); } catch (err) { console.error(err); toast("Non sono riuscito a eliminare"); return; }
  S.eventi = S.eventi.filter(x => x.id !== id);
  ricalcola(); closeSheet(); render(); if (msg) toast(msg);
}
function ultimaOperazione() {
  return S.eventi.filter(e => e.tipo !== "inizio" && e.tipo !== "storico").sort((a, b) => b.ts - a.ts)[0];
}
function descrivi(e) {
  const s = st();
  switch (e.tipo) {
    case "spesa": return "spesa " + e.desc + " (" + eur(e.importo) + ")";
    case "extra": return "entrata " + e.desc + " (" + eur(e.importo) + ")";
    case "mensile": return (e.desc === "Entrata mensile" ? "entrata mensile" : "entrata mensile " + e.desc) + " (" + eur(e.importo) + ")";
    case "accPaga": { const a = s && s.acc.find(x => x.id === e.accId); return "pagamento " + (a ? a.nome : "accantonamento"); }
    case "rettifica": return "rettifica " + sgn(e.importo);
    case "spesaNuova": return "nuova spesa ricorrente " + e.spesa.nome;
    case "spesaModifica": return "modifica di " + e.nome;
    case "spesaDisdetta": return "disdetta di " + (e.nome || "una spesa");
    case "accNuovo": return "nuovo accantonamento " + e.acc.nome;
    case "accModifica": return "modifica di " + e.nome;
    case "accElimina": return "eliminazione di " + (e.nome || "un accantonamento");
    case "fattura": { const c = s && s.conti.find(x => x.id === e.contoId); return "fattura " + (c ? c.nome : "") + " (" + eur(e.importo) + ")"; }
    case "contoNuovo": return "nuovo conto a fattura " + e.conto.nome;
    case "contoModifica": return "modifica di " + e.nome;
    case "contoElimina": return "eliminazione di " + (e.nome || "un conto a fattura");
    default: return "ultima operazione";
  }
}

/* ---------- Componenti ---------- */

function toast(msg) {
  document.querySelectorAll(".toast").forEach(t => t.remove());
  const t = document.createElement("div");
  t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
}
function closeSheet() { document.querySelectorAll(".sheet-wrap").forEach(w => w.remove()); }
function sheet(title, html, mount) {
  closeSheet();
  const w = document.createElement("div");
  w.className = "sheet-wrap";
  w.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h3>${esc(title)}</h3>${html}</div>`;
  w.addEventListener("click", e => { if (e.target === w) closeSheet(); });
  document.body.appendChild(w);
  const no = w.querySelector("#no"); if (no) no.onclick = closeSheet;
  mount && mount(w);
}
const campoImporto = (id, label, val) => `<label class="f" for="${id}">${label}</label><input id="${id}" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${val != null ? esc(E.perCampo(val)) : ""}"><p class="err" id="${id}-err"></p>`;
const campoTesto = (id, label, val, ph = "") => `<label class="f" for="${id}">${label}</label><input id="${id}" autocomplete="off" value="${esc(val || "")}" placeholder="${esc(ph)}"><p class="err" id="${id}-err"></p>`;
const campoGiorno = (id, val) => `<label class="f" for="${id}">Giorno del mese in cui viene addebitata</label><input id="${id}" type="number" inputmode="numeric" min="1" max="31" value="${val ?? ""}"><p class="err" id="${id}-err"></p>`;
const campoData = (id, val, min) => `<label class="f" for="${id}">Data</label><input id="${id}" type="date" value="${val}" max="${oggi()}"${min ? ` min="${min}"` : ""}><p class="err" id="${id}-err"></p>`;
function campoConto(val) {
  const conti = st() ? st().conti : [];
  if (!conti.length) return "";
  return `<label class="f" for="cnt">Pagata con</label><select id="cnt"><option value="">Conto in banca (esce subito)</option>${conti.map(c => `<option value="${esc(c.id)}"${c.id === val ? " selected" : ""}>${esc(c.nome)} (arriva in fattura)</option>`).join("")}</select>`;
}
const leggiConto = w => { const el = w.querySelector("#cnt"); return el && el.value ? el.value : null; };
function errore(w, id, msg) { w.querySelector("#" + id + "-err").textContent = msg; w.querySelector("#" + id).focus(); return null; }
function leggiImporto(w, id, { zero = false, segno = false, vuotoZero = false } = {}) {
  const el = w.querySelector("#" + id);
  let t = el.value.trim(), neg = false;
  if (!t && vuotoZero) { w.querySelector("#" + id + "-err").textContent = ""; return 0; }
  if (segno && /^[-−]/.test(t)) { neg = true; t = t.slice(1); }
  const v = E.leggiEuro(t);
  if (v === null || (!zero && v <= 0)) return errore(w, id, "Scrivi un importo valido, per esempio 12,50");
  w.querySelector("#" + id + "-err").textContent = "";
  return neg ? -v : v;
}
function leggiGiorno(w, id) {
  const g = parseInt(w.querySelector("#" + id).value, 10);
  if (!(g >= 1 && g <= 31)) return errore(w, id, "Scrivi un giorno tra 1 e 31");
  w.querySelector("#" + id + "-err").textContent = ""; return g;
}
function leggiTesto(w, id, msg) {
  const v = w.querySelector("#" + id).value.trim();
  if (!v && msg) return errore(w, id, msg);
  return v;
}
function leggiData(w, id) {
  const v = w.querySelector("#" + id).value;
  const min = st() ? st().inizio : "0000";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return errore(w, id, "Scegli una data");
  if (v > oggi()) return errore(w, id, "La data non può essere nel futuro");
  if (v < min) return errore(w, id, "La data non può essere prima dell'inizio (" + dLabel(min) + ")");
  return v;
}
function segmento(w, onChange) {
  w.querySelectorAll(".seg button").forEach(b => b.onclick = () => {
    w.querySelectorAll(".seg button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    onChange(b.dataset.v);
  });
}

/* ---------- Render ---------- */

function render() {
  const a = $("#app");
  if (!st()) { $("#tabs").hidden = true; a.innerHTML = wizardHTML(); bindWizard(); return; }
  $("#tabs").hidden = false;
  document.querySelectorAll(".tab").forEach(t => t.setAttribute("aria-selected", String(t.dataset.tab === S.tab)));
  a.innerHTML = { oggi: oggiHTML, movimenti: movimentiHTML, prenotate: prenotateHTML, impostazioni: impostazioniHTML }[S.tab]();
  bind();
}

function movRow(m) {
  return `<button class="row" data-mov="${esc(m.id)}"><div class="l"><p class="n">${esc(m.desc)}</p><p class="d">${dLabel(m.data)} · ${esc(m.lbl)}</p></div><p class="r num ${m.importo > 0 ? "pos" : ""}">${m.importo === 0 ? "—" : sgn(m.importo)}</p></button>`;
}

function promemoriaBackup() {
  const ult = S.meta.ultimoBackup;
  if (ult && (Date.now() - ult) / 86400000 < GIORNI_PROMEMORIA_BACKUP) return "";
  const testo = ult ? "L'ultimo backup è di " + Math.floor((Date.now() - ult) / 86400000) + " giorni fa." : "Non hai ancora fatto un backup.";
  return `<div class="note warn" style="margin-top:16px">${testo} Se elimini l'app o cambi telefono, i dati si recuperano solo dal backup.<button class="linkbtn" data-act="esporta">Fai il backup adesso</button></div>`;
}

function oggiHTML() {
  const s = st();
  const ult = ultimaOperazione();
  const movs = S.calc.movimenti.slice(0, 5);
  return `
  <section class="hero">
    <p class="lbl">Soldi</p>
    <p class="big num ${s.soldi < 0 ? "neg" : ""}">${eur(s.soldi)}</p>
    <p class="status"><span class="dot" aria-hidden="true"></span><span>Coperto fino al <strong>${fineMese(s.meseCoperto)}</strong> compreso. La prossima entrata mensile copre ${meseIntero(E.addM(s.meseCoperto, 1))}.</span></p>
  </section>
  <div class="actions">
    <button class="btn" data-act="spesa">Spesa</button>
    <button class="btn primary" data-act="entrata">Entrata</button>
  </div>
  ${E.ymOf(oggi()) > s.meseCoperto ? `<div class="note bad" style="margin-top:16px">${mCap(E.ymOf(oggi()))} non è coperto: le spese ricorrenti di questo mese non sono messe da parte. Registra l'entrata mensile appena arriva.</div>` : ""}
  ${promemoriaBackup()}
  ${S.calc.avvisi.length ? `<div class="note bad" style="margin-top:12px">${S.calc.avvisi.map(esc).join("<br>")}</div>` : ""}
  <h2>Messi da parte</h2>
  <div class="grid2">
    <button class="env" data-goto="prenotate"><p class="t">Spese prenotate</p><p class="v num">${eur(E.totalePrenotato(s))}</p><p class="s">fino al ${fineMese(s.meseCoperto)}</p></button>
    <button class="env" data-goto="prenotate"><p class="t">Accantonamenti</p><p class="v num">${eur(E.totaleAccantonato(s))}</p><p class="s">${s.acc.length} ${s.acc.length === 1 ? "voce" : "voci"}</p></button>
    ${s.conti.map(contoCard).join("")}
  </div>
  <div style="margin-top:14px"><button class="btn full" data-act="controllo">Controlla con la banca</button></div>
  ${S.meta.ultimoControllo ? `<p class="small faint" style="margin-top:8px">Ultimo controllo ${dLabel(S.meta.ultimoControllo.data)}: ${S.meta.ultimoControllo.diff === 0 ? "tornava al centesimo" : "differenza di " + sgn(S.meta.ultimoControllo.diff)}</p>` : ""}
  <h2>Ultimi movimenti</h2>
  ${movs.length ? `<div class="card">${movs.map(movRow).join("")}</div><button class="linkbtn" data-goto="movimenti">Tutti i movimenti</button>` : `<p class="muted">Qui compariranno le spese e le entrate che registri.</p>`}
  ${ult ? `<div><button class="linkbtn" data-act="annulla">Annulla ultima operazione: ${esc(descrivi(ult))}</button></div>` : ""}`;
}

function contoCard(c) {
  return `<button class="env" data-conto="${esc(c.id)}"><p class="t">${esc(c.nome)}</p><p class="v num">${eur(E.daPagareConto(c))}</p><p class="s">da pagare con la fattura</p></button>`;
}

function movimentiHTML() {
  const k = S.mese || (S.mese = E.ymOf(oggi()));
  const list = S.calc.movimenti.filter(m => E.ymOf(m.data) === k);
  const usc = list.filter(m => m.importo < 0).reduce((t, m) => t - m.importo, 0);
  const ent = list.filter(m => m.importo > 0).reduce((t, m) => t + m.importo, 0);
  return `<div class="mnav"><button data-mm="-1" aria-label="Mese precedente">‹</button><p class="num">${mCap(k)}</p><button data-mm="1" aria-label="Mese successivo">›</button></div>
  <div class="grid2"><div class="env"><p class="t">Uscite dai Soldi</p><p class="v num">${eur(usc)}</p></div><div class="env"><p class="t">Entrate</p><p class="v num pos">${eur(ent)}</p></div></div>
  <p class="small faint" style="margin:12px 0 6px">Tocca un movimento per vederlo, correggerlo o eliminarlo.</p>
  ${list.length ? `<div class="card">${list.map(movRow).join("")}</div>` : `<p class="muted">Nessun movimento in ${mName(k)}.</p>`}`;
}

function prenotateHTML() {
  const s = st(), cur = E.ymOf(oggi());
  const mesi = Object.keys(s.prenotate).sort().filter(k => (k >= cur || s.prenotate[k].some(i => !i.pagato)) && s.prenotate[k].length);
  const blocchi = mesi.map(k => {
    const items = [...s.prenotate[k]].sort((a, b) => a.data.localeCompare(b.data));
    const resto = items.filter(i => !i.pagato && !i.dalSoldi).reduce((t, i) => t + i.importo, 0);
    return `<section class="env"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><p class="t">${mCap(k)}</p><p class="v num" style="font-size:20px">${eur(resto)}</p></div>
    <p class="s">${resto === 0 ? "Niente da addebitare" : "Da addebitare"}</p>
    <div style="margin-top:6px">${items.map(i => `<div class="row ${i.pagato ? "paid" : ""}"><div class="l"><p class="n">${esc(i.nome)}${i.dalSoldi ? '<span class="chip">dai Soldi</span>' : i.nuova ? '<span class="chip">nuova</span>' : ""}</p><p class="d">${i.pagato ? "addebitata il " + dLabel(i.data) : "il " + dLabel(i.data)}</p></div><p class="r num">${eur(i.importo)}</p></div>`).join("")}</div></section>`;
  }).join("");
  const acc = s.acc.map(a => `<button class="env" data-accpaga="${esc(a.id)}"><p class="t">${esc(a.nome)}</p><p class="v num ${a.accantonato < 0 ? "neg" : ""}">${eur(a.accantonato)}</p><p class="s">${eur(a.quota)}/mese${a.scadenza ? " · " + esc(a.scadenza) : ""}</p></button>`).join("");
  return `<h2 style="margin-top:8px">Spese prenotate</h2>
  <div class="stack">${blocchi || `<p class="muted">Nessuna spesa prenotata. La prossima entrata mensile prenota ${mName(E.addM(s.meseCoperto, 1))}.</p>`}</div>
  <h2>Accantonamenti</h2>
  ${acc ? `<p class="small faint" style="margin:-4px 0 10px">Tocca un accantonamento quando lo paghi.</p><div class="grid2">${acc}</div>` : `<p class="muted">Nessun accantonamento. Puoi aggiungerli dalle Impostazioni.</p>`}
  ${s.conti.length ? `<h2>Conti a fattura</h2><p class="small faint" style="margin:-4px 0 10px">Tocca un conto quando arriva la fattura.</p><div class="grid2">${s.conti.map(contoCard).join("")}</div>` : ""}`;
}

function impostazioniHTML() {
  const s = st();
  const sp = [...s.spese].sort((a, b) => a.giorno - b.giorno);
  const ult = S.meta.ultimoBackup;
  return `<h2 style="margin-top:8px">Spese ricorrenti</h2>
  <div class="card">${sp.map(x => `<button class="row" data-spesa="${esc(x.id)}"><div class="l"><p class="n">${esc(x.nome)}</p><p class="d">giorno ${x.giorno}</p></div><p class="r num">${eur(x.importo)}</p></button>`).join("") || `<p class="muted" style="padding:12px 0">Nessuna spesa ricorrente.</p>`}</div>
  <button class="linkbtn" data-act="nuovaSpesa">Aggiungi spesa ricorrente</button>
  <h2>Accantonamenti</h2>
  <div class="card">${s.acc.map(a => `<button class="row" data-acc="${esc(a.id)}"><div class="l"><p class="n">${esc(a.nome)}</p><p class="d">${a.scadenza ? esc(a.scadenza) : "senza scadenza"}</p></div><p class="r num">${eur(a.quota)}/mese</p></button>`).join("") || `<p class="muted" style="padding:12px 0">Nessun accantonamento.</p>`}</div>
  <button class="linkbtn" data-act="nuovoAcc">Aggiungi accantonamento</button>
  <h2>Conti a fattura</h2>
  <p class="muted small" style="margin:-4px 0 10px">Servizi che usi giorno per giorno e che la banca addebita dopo, con una fattura: Telepass, carta di credito…</p>
  <div class="card">${s.conti.map(c => `<button class="row" data-contoedit="${esc(c.id)}"><div class="l"><p class="n">${esc(c.nome)}</p><p class="d">${c.quota ? "costi fissi " + eur(c.quota) + "/mese" : "senza costi fissi"}</p></div><p class="r num">${eur(E.daPagareConto(c))}</p></button>`).join("") || `<p class="muted" style="padding:12px 0">Nessun conto a fattura.</p>`}</div>
  <button class="linkbtn" data-act="nuovoConto">Aggiungi conto a fattura</button>
  <div class="env" style="margin-top:18px"><p class="t">Totale da togliere a ogni entrata mensile</p><p class="v num">${eur(E.totaleMensile(s))}</p><p class="s">${eur(E.totaleSpese(s))} di spese + ${eur(E.totaleQuote(s))} di quote${E.totaleQuoteConti(s) ? " + " + eur(E.totaleQuoteConti(s)) + " di costi fissi dei conti a fattura" : ""}</p></div>
  <h2>Backup</h2>
  <p class="muted small">I dati sono solo su questo telefono. Il backup è un file da salvare in iCloud Drive: tieni gli ultimi 2–3.</p>
  <p class="small faint" style="margin-top:4px">${ult ? "Ultimo backup: " + new Date(ult).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" }) : "Nessun backup fatto finora."}</p>
  <div class="grid2" style="margin-top:10px"><button class="btn" data-act="esporta">Esporta</button><button class="btn" data-act="ripristina">Ripristina</button></div>
  <h2>Da sapere</h2>
  <div class="card small muted" style="padding:12px 16px">
    <p>• Se elimini l'icona dalla schermata Home, i dati vengono cancellati.</p>
    <p>• Cambiando telefono i dati non passano da soli: serve il backup.</p>
    <p>• Nessun dato esce dal telefono: l'app non usa server.</p>
  </div>
  <p class="foot">Soldi ${VERSIONE_APP} · ${S.eventi.length} operazioni nel registro</p>`;
}

/* ---------- Eventi dell'interfaccia ---------- */

function bind() {
  document.querySelectorAll("[data-act]").forEach(b => b.onclick = () => ACT[b.dataset.act]());
  document.querySelectorAll("[data-goto]").forEach(b => b.onclick = () => vai(b.dataset.goto));
  document.querySelectorAll("[data-mov]").forEach(b => b.onclick = () => movimentoSheet(b.dataset.mov));
  document.querySelectorAll("[data-mm]").forEach(b => b.onclick = () => { S.mese = E.addM(S.mese, +b.dataset.mm); render(); });
  document.querySelectorAll("[data-spesa]").forEach(b => b.onclick = () => spesaSheet(b.dataset.spesa));
  document.querySelectorAll("[data-acc]").forEach(b => b.onclick = () => accSheet(b.dataset.acc));
  document.querySelectorAll("[data-accpaga]").forEach(b => b.onclick = () => accPagaSheet(b.dataset.accpaga));
  document.querySelectorAll("[data-conto]").forEach(b => b.onclick = () => fatturaSheet(b.dataset.conto));
  document.querySelectorAll("[data-contoedit]").forEach(b => b.onclick = () => contoSheet(b.dataset.contoedit));
}
function vai(tab) { S.tab = tab; closeSheet(); render(); window.scrollTo(0, 0); }

const ACT = {
  spesa() {
    sheet("Nuova spesa", `${campoImporto("imp", "Importo")}${campoTesto("desc", "Descrizione", "", "Pizza, benzina, pedaggio")}${campoConto(null)}${campoData("dt", oggi(), st().inizio)}
    <div class="btns"><button class="btn primary" id="ok">Registra spesa</button><button class="btn ghost" id="no">Annulla</button></div>`, w => {
      w.querySelector("#ok").onclick = () => {
        const v = leggiImporto(w, "imp"); if (v === null) return;
        const data = leggiData(w, "dt"); if (!data) return;
        const conto = leggiConto(w);
        aggiungi({ tipo: "spesa", data, desc: leggiTesto(w, "desc") || "Spesa", importo: v, ...(conto ? { conto } : {}) }, "Spesa registrata");
      };
    });
  },

  entrata() {
    let tipo = "mensile";
    const s = st(), mese = E.addM(s.meseCoperto, 1), tot = E.totaleMensile(s);
    sheet("Nuova entrata", `${campoImporto("imp", "Importo arrivato")}${campoTesto("desc", "Descrizione (facoltativa)", "", "Da dove arrivano")}
    <label class="f">Tipo</label><div class="seg"><button data-v="mensile" aria-pressed="true">Mensile</button><button data-v="extra" aria-pressed="false">Extra</button></div>
    ${campoData("dt", oggi(), s.inizio)}
    <p class="note" id="prev" aria-live="polite"></p>
    <div class="btns"><button class="btn primary" id="ok">Registra entrata</button><button class="btn ghost" id="no">Annulla</button></div>`, w => {
      const upd = () => {
        const v = E.leggiEuro(w.querySelector("#imp").value) || 0, n = w.querySelector("#prev");
        if (tipo === "extra") { n.className = "note"; n.textContent = "Va tutta nei Soldi: " + sgn(v) + "."; return; }
        const r = v - tot;
        n.className = "note" + (r < 0 ? " warn" : "");
        n.textContent = `Copre ${meseIntero(mese)}: tolgo ${eur(tot)} per spese ricorrenti e accantonamenti${E.totaleQuoteConti(s) ? " e costi fissi dei conti a fattura" : ""}. ` + (r >= 0 ? `Nei Soldi vanno ${eur(r)}.` : `L'entrata non basta: mancano ${eur(-r)}, che escono dai Soldi.`);
      };
      w.querySelector("#imp").oninput = upd; upd();
      segmento(w, v => { tipo = v; upd(); });
      w.querySelector("#ok").onclick = () => {
        const v = leggiImporto(w, "imp"); if (v === null) return;
        const data = leggiData(w, "dt"); if (!data) return;
        const desc = leggiTesto(w, "desc") || (tipo === "mensile" ? "Entrata mensile" : "Entrata extra");
        aggiungi({ tipo, data, desc, importo: v }, tipo === "mensile" ? mCap(mese) + " è coperto" : "Entrata aggiunta ai Soldi");
      };
    });
  },

  controllo() {
    const s = st(), att = E.saldoAtteso(s);
    sheet("Controlla con la banca", `<p class="muted">Apri l'app della banca e scrivi il saldo disponibile.</p>${campoImporto("imp", "Saldo in banca", null)}<div id="res" aria-live="polite"></div>
    <div class="btns"><button class="btn primary" id="ok">Controlla</button><button class="btn ghost" id="no">Chiudi</button></div>`, w => {
      w.querySelector("#ok").onclick = () => {
        const v = leggiImporto(w, "imp", { zero: true, segno: true }); if (v === null) return;
        const diff = v - att;
        const righe = [["Soldi", s.soldi], ["Spese prenotate non ancora addebitate", E.totalePrenotato(s)], ["Accantonamenti", E.totaleAccantonato(s)],
          ...s.conti.map(c => [c.nome + " da pagare con la fattura", E.daPagareConto(c)]), ["Dovrebbe esserci", att]];
        w.querySelector("#res").innerHTML = `<div class="note ${diff === 0 ? "ok" : "warn"}">${diff === 0 ? "Torna al centesimo."
          : diff > 0 ? `In banca ci sono ${eur(diff)} in più del previsto. Può essere un'entrata non registrata, o un addebito che la banca non ha ancora fatto.`
            : `In banca mancano ${eur(-diff)}. Cerca una spesa non registrata, o un addebito arrivato prima del previsto.`}</div>
          <div class="card" style="margin-top:10px">${righe.map(([n, c]) => `<div class="row"><p>${n}</p><p class="r num">${eur(c)}</p></div>`).join("")}</div>
          ${diff !== 0 ? `<p class="small muted" style="margin-top:10px">Se hai capito il motivo e vuoi che i Soldi tornino con la banca, puoi registrare una rettifica.</p><button class="btn full" id="rett" style="margin-top:8px">Rettifica i Soldi di ${sgn(diff)}</button>` : ""}`;
        S.meta.ultimoControllo = { data: oggi(), saldo: v, diff };
        DB.scriviMeta("ultimoControllo", S.meta.ultimoControllo).catch(console.error);
        const r = w.querySelector("#rett");
        if (r) r.onclick = () => aggiungi({ tipo: "rettifica", desc: "Rettifica con la banca", importo: diff }, "Soldi rettificati");
      };
    });
  },

  annulla() {
    const u = ultimaOperazione(); if (!u) return;
    sheet("Annulla ultima operazione", `<p class="muted">Tolgo dal registro: ${esc(descrivi(u))}. Tutto viene ricalcolato come se non l'avessi mai fatta.</p>
    <div class="btns"><button class="btn primary" id="ok">Annulla operazione</button><button class="btn ghost" id="no">Lascia così</button></div>`, w => {
      w.querySelector("#ok").onclick = () => togli(u.id, "Operazione annullata");
    });
  },

  nuovaSpesa() { spesaSheet(null); },
  nuovoAcc() { accSheet(null); },
  nuovoConto() { contoSheet(null); },
  esporta,
  ripristina() { $("#fileBackup").click(); },
};

/* ---------- Movimenti ---------- */

function movimentoSheet(id) {
  const m = S.calc.movimenti.find(x => x.id === id); if (!m) return;
  const e = m.evId && S.eventi.find(x => x.id === m.evId);
  const info = `<p class="muted">${dLabel(m.data)} · ${esc(m.lbl)}${m.importo ? " · " + sgn(m.importo) : ""}</p>${m.dettaglio ? `<p class="note">${esc(m.dettaglio)}</p>` : ""}`;

  if (!e || !m.modificabile) {
    const elim = e && m.eliminabile;
    sheet(m.desc, `${info}${elim ? `<p class="small muted" style="margin-top:10px">Puoi eliminare questa operazione: tutto viene ricalcolato come se non l'avessi mai fatta.</p>` : ""}
    <div class="btns">${elim ? `<button class="btn danger" id="del">Elimina operazione</button>` : ""}<button class="btn ghost" id="no">Chiudi</button></div>`, w => {
      const d = w.querySelector("#del"); if (d) d.onclick = () => togli(e.id, "Operazione eliminata");
    });
    return;
  }

  const conDesc = e.tipo !== "accPaga" && e.tipo !== "fattura";
  const avvisoMensile = e.tipo === "mensile" ? `<p class="note">${esc(m.dettaglio)}. Se la elimini, il mese coperto torna indietro e le entrate mensili successive coprono un mese prima.</p>` : "";
  sheet("Modifica movimento", `${campoImporto("imp", e.tipo === "accPaga" ? "Importo pagato" : e.tipo === "fattura" ? "Importo della fattura" : "Importo", Math.abs(e.importo))}
  ${e.tipo === "rettifica" ? `<p class="small faint">Per una rettifica in meno scrivi il segno meno davanti, es. -12,50</p>` : ""}
  ${conDesc ? campoTesto("desc", "Descrizione", e.desc) : ""}${e.tipo === "spesa" ? campoConto(e.conto) : ""}${campoData("dt", e.data, st().inizio)}${avvisoMensile}
  ${e.tipo === "fattura" ? `<p class="note">${esc(m.dettaglio)}</p>` : ""}
  <div class="btns"><button class="btn primary" id="ok">Salva modifiche</button><button class="btn danger" id="del">Elimina movimento</button><button class="btn ghost" id="no">Annulla</button></div>`, w => {
    if (e.tipo === "rettifica") w.querySelector("#imp").value = (e.importo < 0 ? "-" : "") + E.perCampo(Math.abs(e.importo));
    w.querySelector("#ok").onclick = () => {
      const v = leggiImporto(w, "imp", { segno: e.tipo === "rettifica" }); if (v === null) return;
      const data = leggiData(w, "dt"); if (!data) return;
      const nuovo = { ...e, importo: v, data };
      if (conDesc) nuovo.desc = leggiTesto(w, "desc") || e.desc;
      if (e.tipo === "spesa" && w.querySelector("#cnt")) { const c = leggiConto(w); if (c) nuovo.conto = c; else delete nuovo.conto; }
      sostituisci(nuovo, "Movimento modificato");
    };
    w.querySelector("#del").onclick = () => togli(e.id, "Movimento eliminato");
  });
}

/* ---------- Spese ricorrenti ---------- */

function spesaSheet(id) {
  const s = st(), x = id ? s.spese.find(v => v.id === id) : null;
  if (id && !x) return;
  if (!x) {
    sheet("Nuova spesa ricorrente", `${campoTesto("nm", "Nome", "", "Netflix, rata auto")}${campoImporto("imp", "Importo mensile")}${campoGiorno("gg", new Date().getDate())}
    <p class="note" id="exp" aria-live="polite"></p>
    <div class="btns"><button class="btn primary" id="ok">Aggiungi</button><button class="btn ghost" id="no">Annulla</button></div>`, w => {
      const upd = () => {
        const g = parseInt(w.querySelector("#gg").value, 10), out = [];
        const v = E.leggiEuro(w.querySelector("#imp").value) || 0;
        if (g >= 1 && g <= 31) for (let m = E.ymOf(oggi()); m <= s.meseCoperto; m = E.addM(m, 1)) { const d = E.dataDi(m, g); if (d >= oggi()) out.push(dLabel(d)); }
        w.querySelector("#exp").textContent = (out.length ? `Tolgo subito dai Soldi ${eur(v * out.length)} per ${out.length > 1 ? "i pagamenti del " + out.slice(0, -1).join(", del ") + " e del " + out[out.length - 1] : "il pagamento del " + out[0]}, perché quei mesi sono già coperti. ` : "Nei mesi già coperti non cade nessun pagamento. ") + `Dalla prossima entrata mensile (${mName(E.addM(s.meseCoperto, 1))}) viene tolta insieme a tutte le altre spese ricorrenti.`;
      };
      w.querySelector("#gg").oninput = upd; w.querySelector("#imp").oninput = upd; upd();
      w.querySelector("#ok").onclick = () => {
        const nome = leggiTesto(w, "nm", "Scrivi un nome"); if (!nome) return;
        const v = leggiImporto(w, "imp"); if (v === null) return;
        const g = leggiGiorno(w, "gg"); if (g === null) return;
        aggiungi({ tipo: "spesaNuova", spesa: { id: E.uid(), nome, importo: v, giorno: g } }, nome + " aggiunta");
      };
    });
    return;
  }
  let liberabili = 0;
  for (const k of Object.keys(s.prenotate)) for (const i of s.prenotate[k]) if (i.sid === x.id && !i.pagato && !i.dalSoldi) liberabili += i.importo;
  sheet(x.nome, `${campoTesto("nm", "Nome", x.nome)}${campoImporto("imp", "Importo mensile", x.importo)}${campoGiorno("gg", x.giorno)}
  <p class="note">Il nuovo importo vale anche per le spese già prenotate e non ancora addebitate: la differenza esce dai Soldi (o ci torna). Il nuovo giorno vale dalla prossima entrata mensile.</p>
  <div class="btns"><button class="btn primary" id="ok">Salva</button><button class="btn danger" id="del">Disdici${liberabili ? ": " + eur(liberabili) + " tornano nei Soldi" : ""}</button><button class="btn ghost" id="no">Annulla</button></div>`, w => {
    w.querySelector("#ok").onclick = () => {
      const nome = leggiTesto(w, "nm", "Scrivi un nome"); if (!nome) return;
      const v = leggiImporto(w, "imp"); if (v === null) return;
      const g = leggiGiorno(w, "gg"); if (g === null) return;
      aggiungi({ tipo: "spesaModifica", sid: x.id, nome, importo: v, giorno: g }, "Spesa aggiornata");
    };
    w.querySelector("#del").onclick = () => aggiungi({ tipo: "spesaDisdetta", sid: x.id, nome: x.nome }, liberabili ? eur(liberabili) + " tornati nei Soldi" : x.nome + " disdetta");
  });
}

/* ---------- Accantonamenti ---------- */

function accSheet(id) {
  const s = st(), a = id ? s.acc.find(v => v.id === id) : null;
  if (id && !a) return;
  sheet(a ? a.nome : "Nuovo accantonamento", `${campoTesto("nm", "Nome", a && a.nome, "Bollo, polizza, cuscinetto")}${campoTesto("sc", "Scadenza (facoltativa)", a && a.scadenza, "15 dicembre")}
  ${campoImporto("q", "Quota mensile", a ? a.quota : null)}${campoImporto("acc", "Già accantonato (facoltativo)", a ? a.accantonato : null)}
  <p class="note">${a ? "Se cambi il già accantonato, la differenza esce dai Soldi (o ci torna)." : "Il già accantonato lo tolgo dai Soldi. La quota si aggiunge a ogni entrata mensile."}</p>
  <div class="btns"><button class="btn primary" id="ok">Salva</button>${a ? `<button class="btn danger" id="del">Elimina${a.accantonato ? ": " + eur(a.accantonato) + " tornano nei Soldi" : ""}</button>` : ""}<button class="btn ghost" id="no">Annulla</button></div>`, w => {
    w.querySelector("#ok").onclick = () => {
      const nome = leggiTesto(w, "nm", "Scrivi un nome"); if (!nome) return;
      const scadenza = leggiTesto(w, "sc");
      const quota = leggiImporto(w, "q", { zero: true }); if (quota === null) return;
      const accantonato = leggiImporto(w, "acc", { zero: true, vuotoZero: true }); if (accantonato === null) return;
      if (a) aggiungi({ tipo: "accModifica", accId: a.id, nome, scadenza, quota, accantonato }, "Accantonamento aggiornato");
      else aggiungi({ tipo: "accNuovo", acc: { id: E.uid(), nome, scadenza, quota, accantonato } }, nome + " aggiunto");
    };
    const d = w.querySelector("#del");
    if (d) d.onclick = () => aggiungi({ tipo: "accElimina", accId: a.id, nome: a.nome }, a.nome + " eliminato");
  });
}

function accPagaSheet(id) {
  const a = st().acc.find(v => v.id === id); if (!a) return;
  sheet("Pago " + a.nome, `<p class="muted">Accantonati ${eur(a.accantonato)}. Scrivi l'importo esatto che hai pagato: esce da qui e, se non basta, la differenza esce dai Soldi.</p>${campoImporto("imp", "Importo pagato")}${campoData("dt", oggi(), st().inizio)}
  <p class="note" id="prev" aria-live="polite"></p>
  <div class="btns"><button class="btn primary" id="ok">Registra pagamento</button><button class="btn" id="mod">Modifica accantonamento</button><button class="btn ghost" id="no">Chiudi</button></div>`, w => {
    const upd = () => {
      const v = E.leggiEuro(w.querySelector("#imp").value) || 0, extra = v - Math.min(v, Math.max(a.accantonato, 0)), n = w.querySelector("#prev");
      n.className = "note" + (extra > 0 ? " warn" : "");
      n.textContent = extra > 0 ? `Non basta: ${eur(extra)} escono dai Soldi.` : `Resteranno ${eur(a.accantonato - v)} accantonati.`;
    };
    w.querySelector("#imp").oninput = upd; upd();
    w.querySelector("#mod").onclick = () => accSheet(a.id);
    w.querySelector("#ok").onclick = () => {
      const v = leggiImporto(w, "imp"); if (v === null) return;
      const data = leggiData(w, "dt"); if (!data) return;
      aggiungi({ tipo: "accPaga", data, accId: a.id, desc: a.nome + " pagato", importo: v }, "Pagamento registrato");
    };
  });
}

/* ---------- Conti a fattura ---------- */

function contoSheet(id) {
  const s = st(), c = id ? s.conti.find(v => v.id === id) : null;
  if (id && !c) return;
  const daPagare = c ? E.daPagareConto(c) : 0;
  sheet(c ? c.nome : "Nuovo conto a fattura", `${c ? "" : `<p class="muted">Per i servizi che usi giorno per giorno e che la banca addebita dopo, tutti insieme, con una fattura. Quando registri una spesa scegli "Pagata con" questo conto: esce subito dai Soldi e resta qui finché non arriva la fattura.</p>`}
  ${campoTesto("nm", "Nome", c && c.nome, "Telepass, carta di credito")}
  ${campoImporto("q", "Costi fissi al mese (facoltativo)", c && c.quota ? c.quota : null)}
  <p class="small faint">Canoni e abbonamenti compresi nella fattura, divisi per mese. Li metto da parte a ogni entrata mensile.</p>
  ${campoImporto("fx", "Costi fissi già messi da parte (facoltativo)", c && c.fisso ? c.fisso : null)}
  <p class="small faint">${c ? "Se cambi questo importo, la differenza esce dai Soldi (o ci torna)." : "Quello che scrivi qui lo tolgo dai Soldi."}</p>
  <div class="btns"><button class="btn primary" id="ok">Salva</button>${c ? (daPagare ? `<p class="small muted">Per eliminarlo registra prima l'ultima fattura: ci sono ancora ${eur(daPagare)} da pagare.</p>` : `<button class="btn danger" id="del">Elimina conto</button>`) : ""}<button class="btn ghost" id="no">Annulla</button></div>`, w => {
    w.querySelector("#ok").onclick = () => {
      const nome = leggiTesto(w, "nm", "Scrivi un nome"); if (!nome) return;
      const quota = leggiImporto(w, "q", { zero: true, vuotoZero: true }); if (quota === null) return;
      const fisso = leggiImporto(w, "fx", { zero: true, vuotoZero: true }); if (fisso === null) return;
      if (c) aggiungi({ tipo: "contoModifica", contoId: c.id, nome, quota, fisso }, "Conto aggiornato");
      else aggiungi({ tipo: "contoNuovo", conto: { id: E.uid(), nome, quota, fisso } }, nome + " aggiunto");
    };
    const d = w.querySelector("#del");
    if (d) d.onclick = () => aggiungi({ tipo: "contoElimina", contoId: c.id, nome: c.nome }, c.nome + " eliminato");
  });
}

function fatturaSheet(id) {
  const c = st().conti.find(v => v.id === id); if (!c) return;
  const aperte = [...c.aperte].sort((a, b) => a.data.localeCompare(b.data));
  sheet("Fattura " + c.nome, `<p class="muted">Quando la banca addebita la fattura, scrivi l'importo esatto e togli la spunta alle spese che non ci sono dentro (per esempio quelle degli ultimi giorni, che arriveranno nella prossima).</p>
  ${campoImporto("imp", "Importo addebitato dalla banca")}${campoData("dt", oggi(), st().inizio)}
  <label class="f">Comprese nella fattura</label>
  <div class="card">${aperte.map(i => `<label class="row" style="cursor:pointer"><span class="l" style="display:flex;gap:10px;align-items:center"><input type="checkbox" data-sp="${esc(i.id)}" checked style="width:22px;height:22px;min-height:0;flex:none"><span><span class="n" style="display:block">${esc(i.desc)}</span><span class="d" style="display:block">${dLabel(i.data)}</span></span></span><span class="r num">${eur(i.importo)}</span></label>`).join("") || `<p class="muted" style="padding:12px 0">Nessuna spesa registrata su questo conto.</p>`}
  ${c.fisso ? `<div class="row"><p>Costi fissi messi da parte</p><p class="r num">${eur(c.fisso)}</p></div>` : ""}</div>
  <p class="note" id="prev" aria-live="polite"></p>
  <div class="btns"><button class="btn primary" id="ok">Registra fattura</button><button class="btn" id="mod">Modifica conto</button><button class="btn ghost" id="no">Chiudi</button></div>`, w => {
    const scelte = () => [...w.querySelectorAll("[data-sp]")].filter(x => x.checked).map(x => x.dataset.sp);
    const upd = () => {
      const ids = new Set(scelte());
      const previsto = aperte.filter(i => ids.has(i.id)).reduce((t, i) => t + i.importo, 0) + c.fisso;
      const v = E.leggiEuro(w.querySelector("#imp").value), n = w.querySelector("#prev");
      if (v === null) { n.className = "note"; n.textContent = "Previsto: " + eur(previsto) + "."; return; }
      const diff = v - previsto;
      n.className = "note" + (diff > 0 ? " warn" : diff < 0 ? " ok" : " ok");
      n.textContent = "Previsto " + eur(previsto) + ". " + (diff === 0 ? "Torna al centesimo." : diff > 0 ? "La fattura è più alta: " + eur(diff) + " escono dai Soldi." : "La fattura è più bassa: " + eur(-diff) + " tornano nei Soldi.");
    };
    w.querySelector("#imp").oninput = upd; w.querySelectorAll("[data-sp]").forEach(x => x.onchange = upd); upd();
    w.querySelector("#mod").onclick = () => contoSheet(c.id);
    w.querySelector("#ok").onclick = () => {
      const v = leggiImporto(w, "imp", { zero: true }); if (v === null) return;
      const data = leggiData(w, "dt"); if (!data) return;
      aggiungi({ tipo: "fattura", data, contoId: c.id, importo: v, spese: scelte() }, "Fattura registrata");
    };
  });
}

/* ---------- Backup ---------- */

async function esporta() {
  const testo = JSON.stringify(E.creaBackup(S.eventi), null, 1);
  const nome = "soldi-backup.json";
  let fatto = false;
  try {
    const file = new File([testo], nome, { type: "application/json" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "Backup Soldi" });
      fatto = true;
    }
  } catch (err) {
    if (err && err.name === "AbortError") { toast("Backup non salvato"); return; }
    console.warn(err);
  }
  if (!fatto) {
    const url = URL.createObjectURL(new Blob([testo], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: nome });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    fatto = true;
  }
  S.meta.ultimoBackup = Date.now();
  await DB.scriviMeta("ultimoBackup", S.meta.ultimoBackup).catch(console.error);
  closeSheet(); render(); toast("Backup pronto: salvalo in iCloud Drive");
}

async function fileScelto(ev) {
  const f = ev.target.files[0]; ev.target.value = "";
  if (!f) return;
  let r;
  try { r = E.leggiBackup(JSON.parse(await f.text()), oggi()); }
  catch (err) { toast(err && err.message && !(err instanceof SyntaxError) ? err.message : "Questo file non è un backup valido"); return; }
  const prova = E.calcola(r.eventi, oggi());
  if (!prova.stato) { toast("Il backup non contiene un punto di partenza"); return; }
  const sost = S.eventi.length ? `<p class="note warn">Sostituisco tutti i dati attuali. Quelli di adesso andranno persi.</p>` : "";
  sheet("Ripristina backup", `<p class="muted">Ho letto il backup${r.soldiProva !== undefined ? " della versione di prova" : ""}.</p>
  <div class="card" style="margin-top:10px"><div class="row"><p>Soldi</p><p class="r num">${eur(prova.stato.soldi)}</p></div><div class="row"><p>Coperto fino al</p><p class="r">${fineMese(prova.stato.meseCoperto)}</p></div><div class="row"><p>Movimenti</p><p class="r">${prova.movimenti.length}</p></div></div>
  ${r.note.map(n => `<p class="note">${esc(n)}</p>`).join("")}${sost}
  <div class="btns"><button class="btn primary" id="ok">Ripristina</button><button class="btn ghost" id="no">Annulla</button></div>`, w => {
    w.querySelector("#ok").onclick = async () => {
      try { await DB.sostituisciEventi(r.eventi); } catch (err) { console.error(err); toast("Ripristino non riuscito"); return; }
      S.eventi = r.eventi; S.wizard = null; S.tab = "oggi";
      ricalcola(); closeSheet(); render(); toast("Backup ripristinato");
      DB.chiediPersistenza();
    };
  });
}

/* ---------- Primo avvio ---------- */

function wizardHTML() {
  const W = S.wizard || (S.wizard = { passo: 0, spese: [], acc: [] });
  const cur = E.ymOf(oggi()), pros = E.addM(cur, 1);
  const passi = `<div class="steps" aria-hidden="true">${[1, 2, 3].map(i => `<span class="${W.passo >= i ? "on" : ""}"></span>`).join("")}</div>`;
  if (W.passo === 0) return `<section class="hero"><p class="lbl">Benvenuto in Soldi</p><p class="big" style="font-size:34px">Sempre un mese avanti</p></section>
    <h2>Come funziona</h2>
    <div class="card" style="padding:4px 16px">
      <div class="row"><div class="l"><p style="font-weight:600">Ogni entrata mensile paga il mese dopo</p><p class="small muted" style="white-space:normal">Quando arriva un'entrata mensile, tolgo subito tutte le spese ricorrenti e le quote degli accantonamenti del mese successivo. Così sei sempre un mese avanti.</p></div></div>
      <div class="row"><div class="l"><p style="font-weight:600">Quello che resta sono i tuoi Soldi</p><p class="small muted">Sono liberi: puoi spenderli senza pensare alle bollette.</p></div></div>
      <div class="row"><div class="l"><p style="font-weight:600">Registri ogni spesa quando la fai</p><p class="small muted">I Soldi si aggiornano subito, al centesimo.</p></div></div>
      <div class="row"><div class="l"><p style="font-weight:600">Le spese ricorrenti vanno da sole</p><p class="small muted">Sono già messe da parte: nel loro giorno risultano addebitate senza fare niente.</p></div></div>
    </div>
    <p class="note">Alla fine della configurazione sarai già coperto fino al <strong>${fineMese(pros)}</strong> compreso: dal saldo in banca metto da parte subito le spese ricorrenti di ${mName(cur)} ancora da pagare e tutte quelle di ${mName(pros)}. La prima entrata mensile che registri coprirà ${meseIntero(E.addM(pros, 1))}.</p><p class="small faint" style="margin-top:10px">I dati restano solo su questo telefono.</p>
    <div class="stack" style="margin-top:20px"><button class="btn primary" data-w="avanti">Inizia da zero</button><button class="btn" data-w="backup">Ho un backup</button></div>`;
  if (W.passo === 1) return `${passi}<h2 style="margin-top:0">Spese ricorrenti</h2><p class="muted">Rate, abbonamenti, bollette: tutto quello che paghi ogni mese.</p>
    <div class="note warn"><strong>Prima di continuare</strong> apri l'app della banca e scorri gli addebiti degli ultimi due o tre mesi. Segnati ogni spesa ricorrente con l'importo esatto e il giorno in cui viene addebitata: se i dati sono precisi, i conti tornano al centesimo.</div>
    <div class="card" style="margin-top:12px">${W.spese.map((x, i) => `<div class="row"><div class="l"><p class="n">${esc(x.nome)}</p><p class="d">giorno ${x.giorno}</p></div><p class="r num">${eur(x.importo)} <button class="linkbtn" data-wdel="spese:${i}" aria-label="Togli ${esc(x.nome)}">✕</button></p></div>`).join("") || `<p class="muted" style="padding:12px 0">Nessuna spesa ancora.</p>`}</div>
    <button class="linkbtn" data-w="aggSpesa">Aggiungi spesa ricorrente</button>
    <div class="stack" style="margin-top:16px"><button class="btn primary" data-w="avanti">Avanti</button><button class="btn ghost" data-w="indietro">Indietro</button></div>`;
  if (W.passo === 2) return `${passi}<h2 style="margin-top:0">Accantonamenti</h2><p class="muted">Soldi che metti da parte ogni mese per spese grandi: bollo, assicurazione, un cuscinetto…</p>
    <div class="card" style="margin-top:12px">${W.acc.map((a, i) => `<div class="row"><div class="l"><p class="n">${esc(a.nome)}</p><p class="d">${eur(a.quota)}/mese · già ${eur(a.accantonato)}</p></div><p class="r"><button class="linkbtn" data-wdel="acc:${i}" aria-label="Togli ${esc(a.nome)}">✕</button></p></div>`).join("") || `<p class="muted" style="padding:12px 0">Nessun accantonamento ancora.</p>`}</div>
    <button class="linkbtn" data-w="aggAcc">Aggiungi accantonamento</button>
    <div class="stack" style="margin-top:16px"><button class="btn primary" data-w="avanti">Avanti</button><button class="btn ghost" data-w="indietro">Indietro</button></div>`;
  // passo 3: saldo in banca → Soldi
  const giorno = Number(oggi().slice(8, 10));
  const restanti = E.prenotaMese(W.spese, cur, "x", giorno).reduce((t, i) => t + i.importo, 0);
  const prossime = E.prenotaMese(W.spese, pros, "x").reduce((t, i) => t + i.importo, 0);
  const accTot = W.acc.reduce((t, a) => t + a.accantonato, 0);
  return `${passi}<h2 style="margin-top:0">Quanto hai in banca?</h2><p class="muted">Scrivi il saldo disponibile di oggi. Tolgo le spese ricorrenti fino al ${fineMese(pros)} e gli accantonamenti: quello che resta sono i tuoi Soldi.</p>
    ${campoImporto("saldo", "Saldo in banca oggi", null)}
    <div class="card" style="margin-top:8px">
      <div class="row"><p>Spese di ${mName(cur)} non ancora addebitate</p><p class="r num">${eur(restanti)}</p></div>
      <div class="row"><p>Spese di ${mName(pros)}</p><p class="r num">${eur(prossime)}</p></div>
      <div class="row"><p>Accantonamenti</p><p class="r num">${eur(accTot)}</p></div>
      <div class="row"><p><strong>Soldi</strong></p><p class="r num" id="soldiCalc">—</p></div>
    </div>
    <div class="stack" style="margin-top:16px"><button class="btn primary" data-w="fine" data-tot="${restanti + prossime + accTot}">Inizia</button><button class="btn ghost" data-w="indietro">Indietro</button></div>`;
}

function bindWizard() {
  const W = S.wizard;
  const sal = $("#saldo");
  const tot = () => Number($("[data-w=fine]").dataset.tot);
  if (sal) {
    const upd = () => { const v = E.leggiEuro(sal.value); const el = $("#soldiCalc"); el.textContent = v === null ? "—" : eur(v - tot()); el.className = "r num" + (v !== null && v - tot() < 0 ? " neg" : ""); };
    sal.oninput = upd; upd();
  }
  document.querySelectorAll("[data-wdel]").forEach(b => b.onclick = () => { const [k, i] = b.dataset.wdel.split(":"); W[k].splice(+i, 1); render(); });
  document.querySelectorAll("[data-w]").forEach(b => b.onclick = async () => {
    const a = b.dataset.w;
    if (a === "avanti") { W.passo++; render(); window.scrollTo(0, 0); }
    else if (a === "indietro") { W.passo--; render(); }
    else if (a === "backup") $("#fileBackup").click();
    else if (a === "aggSpesa") sheet("Spesa ricorrente", `${campoTesto("nm", "Nome", "", "Rata auto, Netflix")}${campoImporto("imp", "Importo mensile")}${campoGiorno("gg", "")}
      <div class="btns"><button class="btn primary" id="ok">Aggiungi</button><button class="btn ghost" id="no">Annulla</button></div>`, w => {
        w.querySelector("#ok").onclick = () => {
          const nome = leggiTesto(w, "nm", "Scrivi un nome"); if (!nome) return;
          const importo = leggiImporto(w, "imp"); if (importo === null) return;
          const giorno = leggiGiorno(w, "gg"); if (giorno === null) return;
          W.spese.push({ id: E.uid(), nome, importo, giorno }); closeSheet(); render();
        };
      });
    else if (a === "aggAcc") sheet("Accantonamento", `${campoTesto("nm", "Nome", "", "Bollo, polizza")}${campoImporto("q", "Quota mensile")}${campoImporto("acc", "Già accantonato (facoltativo)")}${campoTesto("sc", "Scadenza (facoltativa)", "", "15 dicembre")}
      <div class="btns"><button class="btn primary" id="ok">Aggiungi</button><button class="btn ghost" id="no">Annulla</button></div>`, w => {
        w.querySelector("#ok").onclick = () => {
          const nome = leggiTesto(w, "nm", "Scrivi un nome"); if (!nome) return;
          const quota = leggiImporto(w, "q", { zero: true }); if (quota === null) return;
          const accantonato = leggiImporto(w, "acc", { zero: true, vuotoZero: true }); if (accantonato === null) return;
          W.acc.push({ id: E.uid(), nome, quota, accantonato, scadenza: leggiTesto(w, "sc") }); closeSheet(); render();
        };
      });
    else if (a === "fine") {
      const w = $("#app");
      const saldo = leggiImporto(w, "saldo", { zero: true, segno: true }); if (saldo === null) return;
      const inizio = E.creaInizio({ soldi: saldo - tot(), spese: W.spese, acc: W.acc, giaProssimo: true }, oggi());
      try { await DB.salvaEvento(inizio); } catch (err) { console.error(err); toast("Non sono riuscito a salvare"); return; }
      S.eventi = [inizio]; S.wizard = null; ricalcola(); render(); toast("Tutto pronto");
      DB.chiediPersistenza();
    }
  });
}

/* ---------- Avvio ---------- */

document.querySelectorAll(".tab").forEach(t => t.onclick = () => vai(t.dataset.tab));
$("#fileBackup").onchange = fileScelto;
// Quando riapri l'app (anche dopo giorni) ricalcolo: le spese prenotate del giorno risultano addebitate
document.addEventListener("visibilitychange", () => { if (!document.hidden && S.eventi.length) { ricalcola(); if (!document.querySelector(".sheet-wrap")) render(); } });

(async () => {
  try {
    S.eventi = await DB.tuttiEventi();
    S.meta.ultimoBackup = await DB.leggiMeta("ultimoBackup");
    S.meta.ultimoControllo = await DB.leggiMeta("ultimoControllo");
    ricalcola(); render();
  } catch (err) {
    console.error(err);
    $("#app").innerHTML = `<div class="empty"><p style="font-size:22px;font-weight:700;color:var(--ink)">Non riesco ad aprire i dati</p><p style="margin-top:8px">${esc(err && err.message || err)}</p></div>`;
  }
  if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("sw.js").catch(console.warn);
  }
})();
