// Soldi — motore dei calcoli.
// Nessuna interfaccia e nessun accesso al database: riceve il registro delle
// operazioni e restituisce lo stato ricalcolato. Tutti gli importi sono in
// centesimi interi (4,99 € = 499).

export const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

/* ---------- Date ---------- */

const pad = n => String(n).padStart(2, "0");
export const oggiISO = (d = new Date()) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
export const ymOf = data => data.slice(0, 7);
export function addM(ym, n) {
  let [y, m] = ym.split("-").map(Number);
  m += n;
  while (m > 12) { m -= 12; y++; }
  while (m < 1) { m += 12; y--; }
  return y + "-" + pad(m);
}
export const daysIn = ym => { const [y, m] = ym.split("-").map(Number); return new Date(y, m, 0).getDate(); };
export const dataDi = (ym, giorno) => ym + "-" + pad(Math.min(giorno, daysIn(ym)));
export const nomeMese = ym => { const [y, m] = ym.split("-").map(Number); return MESI[m - 1] + " " + y; };

/* ---------- Importi ---------- */

// Formato italiano scritto a mano (1.234,56 €): toLocaleString non raggruppa
// sempre le migliaia allo stesso modo su tutti i telefoni.
export function eur(c) {
  const n = Math.round(Math.abs(c));
  const intero = String(Math.floor(n / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (c < 0 && n ? "-" : "") + intero + "," + pad(n % 100) + " €";
}
export const conSegno = c => (c > 0 ? "+" : c < 0 ? "−" : "") + eur(Math.abs(c));

// "12,50" "12.50" "1.234,56" "12" "12 €" → centesimi; null se non valido
export function leggiEuro(testo) {
  let s = String(testo ?? "").trim().replace(/[€\s]/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [i, d = ""] = s.split(".");
  return parseInt(i, 10) * 100 + parseInt((d + "00").slice(0, 2), 10);
}
export const perCampo = c => (c / 100).toFixed(2).replace(".", ",");

/* ---------- Identificatori ---------- */

let ultimoTs = 0;
export function nuovoTs() { const t = Date.now(); ultimoTs = t > ultimoTs ? t : ultimoTs + 1; return ultimoTs; }
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/* ---------- Spese prenotate ---------- */

// Crea le voci prenotate di un mese per tutte le spese ricorrenti.
// Se "dopoIlGiorno" è indicato, prende solo quelle che cadono dopo quel giorno.
export function prenotaMese(spese, ym, prefisso, dopoIlGiorno = 0) {
  return spese
    .filter(s => Math.min(s.giorno, daysIn(ym)) > dopoIlGiorno)
    .map(s => ({
      id: prefisso + ":" + s.id, sid: s.id, nome: s.nome, importo: s.importo,
      giorno: Math.min(s.giorno, daysIn(ym)), data: dataDi(ym, s.giorno),
      pagato: false, dalSoldi: false,
    }));
}

const somma = (a, f) => a.reduce((t, x) => t + f(x), 0);
export const totaleSpese = st => somma(st.spese, s => s.importo);
export const totaleQuote = st => somma(st.acc, a => a.quota);
export const totaleAccantonato = st => somma(st.acc, a => a.accantonato);
export const totaleQuoteConti = st => somma(st.conti, c => c.quota);
export const totaleMensile = st => totaleSpese(st) + totaleQuote(st) + totaleQuoteConti(st);
// Conto a fattura: spese già fatte (e tolte dai Soldi) che la banca addebiterà con la prossima fattura,
// più i costi fissi messi da parte a ogni entrata mensile
export const daPagareConto = c => somma(c.aperte, i => i.importo) + c.fisso;
export const totaleConti = st => somma(st.conti, daPagareConto);
export function totalePrenotato(st) {
  let t = 0;
  for (const k of Object.keys(st.prenotate)) for (const i of st.prenotate[k]) if (!i.pagato && !i.dalSoldi) t += i.importo;
  return t;
}
export const saldoAtteso = st => st.soldi + totalePrenotato(st) + totaleAccantonato(st) + totaleConti(st);

/* ---------- Tipi di operazione ---------- */

export const MODIFICABILI = new Set(["spesa", "extra", "mensile", "accPaga", "rettifica", "fattura"]);

// Il punto di partenza viene sempre per primo; poi per data e ordine di inserimento
const ordina = (a, b) => (a.tipo === "inizio") !== (b.tipo === "inizio") ? (a.tipo === "inizio" ? -1 : 1)
  : a.data < b.data ? -1 : a.data > b.data ? 1 : a.ts - b.ts;
const copia = x => JSON.parse(JSON.stringify(x));

/* ---------- Ricalcolo ---------- */

// Rilegge tutto il registro in ordine di data e restituisce:
// stato (soldi, spese, accantonamenti, prenotate…), movimenti da mostrare, avvisi.
export function calcola(eventi, oggi = oggiISO()) {
  const ev = [...eventi].sort(ordina);
  const movimenti = [];
  const avvisi = [];
  let st = null;

  const mov = (e, m) => movimenti.push({
    id: e.id, evId: e.id, data: e.data, ts: e.ts, tipo: e.tipo,
    modificabile: MODIFICABILI.has(e.tipo), eliminabile: e.tipo !== "inizio", ...m,
  });

  // Segna come addebitate le spese prenotate arrivate al loro giorno
  const addebita = fino => {
    for (const k of Object.keys(st.prenotate).sort()) {
      for (const it of st.prenotate[k].slice().sort((a, b) => a.data.localeCompare(b.data))) {
        if (it.pagato || it.data > fino) continue;
        it.pagato = true;
        if (it.dalSoldi) {
          st.soldi -= it.importo;
          movimenti.push({
            id: "auto:" + it.id, evId: null, data: it.data, ts: 0, tipo: "auto",
            desc: it.nome, lbl: "abbonamento dai Soldi", importo: -it.importo,
            modificabile: false, eliminabile: false,
            dettaglio: "Addebito automatico: per cambiarlo modifica o disdici la spesa ricorrente.",
          });
        }
      }
    }
  };

  for (const e of ev) {
    if (e.tipo === "inizio") {
      if (st) { avvisi.push("Ignorato un secondo punto di partenza del " + e.data); continue; }
      st = {
        soldi: e.soldi, meseCoperto: e.meseCoperto, inizio: e.data,
        spese: copia(e.spese || []), acc: copia(e.acc || []), prenotate: copia(e.prenotate || {}),
        conti: copia(e.conti || []).map(c => ({ aperte: [], fisso: 0, quota: 0, ...c })),
      };
      continue;
    }
    if (!st) { avvisi.push("Operazione del " + e.data + " precedente al punto di partenza: ignorata"); continue; }
    addebita(e.data < oggi ? e.data : oggi);

    switch (e.tipo) {
      case "spesa": {
        st.soldi -= e.importo;
        const c = e.conto && st.conti.find(x => x.id === e.conto);
        if (c) c.aperte.push({ id: e.id, desc: e.desc, data: e.data, importo: e.importo });
        mov(e, { desc: e.desc, lbl: c ? "spesa · " + c.nome : "spesa", importo: -e.importo, conto: c ? c.id : null,
          dettaglio: c ? "Tolta dai Soldi subito. La banca la addebiterà con la fattura " + c.nome + "." : "" });
        break;
      }

      case "extra":
        st.soldi += e.importo;
        mov(e, { desc: e.desc, lbl: "entrata extra", importo: e.importo });
        break;

      case "mensile": {
        const mese = addM(st.meseCoperto, 1);
        const tot = totaleMensile(st);
        st.prenotate[mese] = (st.prenotate[mese] || []).concat(prenotaMese(st.spese, mese, e.id));
        for (const a of st.acc) a.accantonato += a.quota;
        for (const c of st.conti) c.fisso += c.quota;
        st.soldi += e.importo - tot;
        st.meseCoperto = mese;
        mov(e, {
          desc: e.desc, lbl: "entrata mensile", importo: e.importo, mese, tot,
          dettaglio: "Copre " + nomeMese(mese) + ": tolti " + eur(tot) + ", nei Soldi " + conSegno(e.importo - tot),
        });
        break;
      }

      case "accPaga": {
        const a = st.acc.find(x => x.id === e.accId);
        if (!a) { avvisi.push("Pagamento di un accantonamento eliminato (" + e.data + ")"); mov(e, { desc: e.desc || "Pagamento accantonamento", lbl: "accantonamento non trovato", importo: 0 }); break; }
        const daAcc = Math.min(e.importo, Math.max(a.accantonato, 0));
        const daSoldi = e.importo - daAcc;
        a.accantonato -= daAcc;
        st.soldi -= daSoldi;
        mov(e, {
          desc: a.nome + " pagato", lbl: "dagli accantonamenti", importo: -daSoldi, pagato: e.importo,
          dettaglio: "Pagati " + eur(e.importo) + (daSoldi > 0 ? ": " + eur(daAcc) + " dall'accantonamento, " + eur(daSoldi) + " dai Soldi" : " dall'accantonamento"),
        });
        break;
      }

      case "rettifica":
        st.soldi += e.importo;
        mov(e, { desc: e.desc || "Rettifica con la banca", lbl: "rettifica", importo: e.importo });
        break;

      case "spesaNuova": {
        const s = copia(e.spesa);
        st.spese.push(s);
        // I mesi già coperti non la contenevano: i pagamenti che cadono da oggi
        // fino all'ultimo mese coperto escono subito dai Soldi e restano prenotati.
        // Dalla prossima entrata mensile la spesa è nel totale con le altre.
        const date = [];
        let messi = 0;
        for (let m = ymOf(e.data); m <= st.meseCoperto; m = addM(m, 1)) {
          const data = dataDi(m, s.giorno);
          if (data < e.data) continue;
          (st.prenotate[m] = st.prenotate[m] || []).push({
            id: e.id + ":" + m, sid: s.id, nome: s.nome, importo: s.importo,
            giorno: Math.min(s.giorno, daysIn(m)), data, pagato: false, dalSoldi: false, nuova: true,
          });
          date.push(data);
          messi += s.importo;
        }
        st.soldi -= messi;
        mov(e, {
          desc: s.nome + " (nuova spesa ricorrente)", lbl: "tolta dai Soldi", importo: -messi,
          dettaglio: (date.length
            ? "Tolti subito dai Soldi " + eur(messi) + " per " + date.map(d => Number(d.slice(8)) + " " + MESI[Number(d.slice(5, 7)) - 1]).join(", ") + ". "
            : "Nei mesi già coperti non cade nessun pagamento. ")
            + "Dalla prossima entrata mensile viene tolta insieme a tutte le spese ricorrenti.",
        });
        break;
      }

      case "spesaModifica": {
        const s = st.spese.find(x => x.id === e.sid);
        if (!s) { avvisi.push("Modifica di una spesa ricorrente non più presente (" + e.data + ")"); break; }
        // Il nuovo importo vale anche per le spese già prenotate e non ancora addebitate:
        // la differenza esce dai Soldi (o ci torna). Il nuovo giorno vale dalle prossime prenotazioni.
        let diff = 0;
        for (const k of Object.keys(st.prenotate)) for (const i of st.prenotate[k]) {
          if (i.sid !== e.sid || i.pagato) continue;
          if (!i.dalSoldi) diff += e.importo - i.importo;
          i.importo = e.importo; i.nome = e.nome;
        }
        Object.assign(s, { nome: e.nome, importo: e.importo, giorno: e.giorno });
        st.soldi -= diff;
        if (diff) mov(e, { desc: e.nome + " cambia importo", lbl: "spesa ricorrente", importo: -diff,
          dettaglio: "Aggiornate le spese già prenotate: la differenza " + (diff > 0 ? "esce dai" : "torna nei") + " Soldi." });
        break;
      }

      case "spesaDisdetta": {
        const s = st.spese.find(x => x.id === e.sid);
        let liberati = 0;
        for (const k of Object.keys(st.prenotate)) {
          st.prenotate[k] = st.prenotate[k].filter(i => {
            if (i.sid === e.sid && !i.pagato) { if (!i.dalSoldi) liberati += i.importo; return false; }
            return true;
          });
        }
        st.spese = st.spese.filter(x => x.id !== e.sid);
        st.soldi += liberati;
        mov(e, {
          desc: "Disdetta: " + (s ? s.nome : e.nome || "spesa ricorrente"), lbl: "impostazioni", importo: liberati,
          dettaglio: liberati ? "Gli importi già prenotati tornano nei Soldi." : "Nessun importo prenotato da liberare.",
        });
        break;
      }

      case "accNuovo": {
        const a = copia(e.acc);
        st.acc.push(a);
        st.soldi -= a.accantonato;
        mov(e, { desc: "Nuovo accantonamento: " + a.nome, lbl: "impostazioni", importo: -a.accantonato,
          dettaglio: "Quota " + eur(a.quota) + " al mese" + (a.accantonato ? "; " + eur(a.accantonato) + " già accantonati, tolti dai Soldi" : "") });
        break;
      }

      case "accModifica": {
        const a = st.acc.find(x => x.id === e.accId);
        if (!a) { avvisi.push("Modifica di un accantonamento non più presente (" + e.data + ")"); break; }
        const diff = e.accantonato - a.accantonato;
        Object.assign(a, { nome: e.nome, quota: e.quota, scadenza: e.scadenza, accantonato: e.accantonato });
        st.soldi -= diff;
        if (diff) mov(e, { desc: "Accantonamento " + a.nome + " corretto", lbl: "impostazioni", importo: -diff });
        break;
      }

      case "accElimina": {
        const a = st.acc.find(x => x.id === e.accId);
        if (!a) break;
        st.acc = st.acc.filter(x => x.id !== e.accId);
        st.soldi += a.accantonato;
        mov(e, { desc: "Accantonamento eliminato: " + a.nome, lbl: "impostazioni", importo: a.accantonato,
          dettaglio: a.accantonato ? "Quello che c'era torna nei Soldi." : "" });
        break;
      }

      case "contoNuovo": {
        const c = { aperte: [], ...copia(e.conto) };
        c.fisso = c.fisso || 0;
        st.conti.push(c);
        st.soldi -= c.fisso;
        mov(e, { desc: "Nuovo conto a fattura: " + c.nome, lbl: "impostazioni", importo: -c.fisso,
          dettaglio: (c.quota ? "Costi fissi: " + eur(c.quota) + " al mese, messi da parte a ogni entrata mensile. " : "") + (c.fisso ? eur(c.fisso) + " già messi da parte, tolti dai Soldi." : "") });
        break;
      }

      case "contoModifica": {
        const c = st.conti.find(x => x.id === e.contoId);
        if (!c) { avvisi.push("Modifica di un conto a fattura non più presente (" + e.data + ")"); break; }
        const diff = e.fisso - c.fisso;
        Object.assign(c, { nome: e.nome, quota: e.quota, fisso: e.fisso });
        st.soldi -= diff;
        if (diff) mov(e, { desc: "Conto " + c.nome + " corretto", lbl: "impostazioni", importo: -diff });
        break;
      }

      case "contoElimina": {
        const c = st.conti.find(x => x.id === e.contoId);
        if (!c) break;
        const tot = daPagareConto(c);
        st.conti = st.conti.filter(x => x !== c);
        st.soldi += tot;
        mov(e, { desc: "Conto a fattura eliminato: " + c.nome, lbl: "impostazioni", importo: tot });
        break;
      }

      case "fattura": {
        const c = st.conti.find(x => x.id === e.contoId);
        if (!c) { avvisi.push("Fattura di un conto non più presente (" + e.data + ")"); mov(e, { desc: "Fattura pagata", lbl: "conto non trovato", importo: 0 }); break; }
        const scelte = new Set(e.spese || []);
        const incluse = c.aperte.filter(i => scelte.has(i.id));
        const spese = somma(incluse, i => i.importo);
        const fisso = c.fisso;
        c.aperte = c.aperte.filter(i => !scelte.has(i.id));
        c.fisso = 0;
        const diff = e.importo - spese - fisso;
        st.soldi -= diff;
        mov(e, {
          desc: "Fattura " + c.nome + " pagata", lbl: "conto a fattura", importo: -diff, pagato: e.importo,
          dettaglio: "Fattura di " + eur(e.importo) + ": " + eur(spese) + " di spese già tolte dai Soldi"
            + (fisso ? " e " + eur(fisso) + " di costi fissi messi da parte" : "")
            + (diff === 0 ? ". Tornava al centesimo." : diff > 0 ? ". I " + eur(diff) + " in più escono dai Soldi." : ". I " + eur(-diff) + " in meno tornano nei Soldi."),
        });
        break;
      }

      case "storico":
        mov(e, { desc: e.desc, lbl: e.lbl || "dalla prova", importo: e.importo, modificabile: false, eliminabile: false,
          dettaglio: "Importato dalla versione di prova: già compreso nel punto di partenza." });
        break;

      default:
        avvisi.push("Operazione sconosciuta: " + e.tipo);
    }
  }

  if (st) addebita(oggi);
  movimenti.sort((a, b) => (b.data > a.data ? 1 : b.data < a.data ? -1 : b.ts - a.ts));
  return { stato: st, movimenti, avvisi };
}

/* ---------- Primo avvio ---------- */

// Crea il punto di partenza dalla configurazione guidata.
// soldi: Soldi liberi di oggi; giaProssimo: le spese del mese prossimo sono già messe da parte.
export function creaInizio({ soldi, spese, acc, giaProssimo, conti = [] }, oggi = oggiISO()) {
  const id = uid();
  const cur = ymOf(oggi);
  const giorno = Number(oggi.slice(8, 10));
  const prenotate = {};
  const questoMese = prenotaMese(spese, cur, id, giorno);
  if (questoMese.length) prenotate[cur] = questoMese;
  let meseCoperto = cur;
  if (giaProssimo) {
    meseCoperto = addM(cur, 1);
    prenotate[meseCoperto] = prenotaMese(spese, meseCoperto, id);
  }
  return { id, tipo: "inizio", data: oggi, ts: nuovoTs(), soldi, meseCoperto, spese, acc, prenotate, conti };
}

/* ---------- Backup ---------- */

export function creaBackup(eventi) {
  return { app: "soldi", versione: 2, esportato: new Date().toISOString(), eventi };
}

// Riconosce un backup di Soldi o della prova "Buste" e restituisce il registro.
export function leggiBackup(json, oggi = oggiISO()) {
  if (json && json.app === "soldi" && Array.isArray(json.eventi)) {
    if (!json.eventi.some(e => e.tipo === "inizio")) throw new Error("Il backup non contiene un punto di partenza");
    return { eventi: json.eventi, note: [] };
  }
  if (json && json.stato && typeof json.stato.soldi === "number") return daProva(json, oggi);
  throw new Error("Questo file non è un backup valido");
}

// Converte un backup della prova "Buste".
// Spese ed entrate extra diventano operazioni vere (modificabili); gli altri
// movimenti restano come storico, perché il loro effetto è già nel punto di partenza.
export function daProva(json, oggi = oggiISO()) {
  const p = json.stato;
  const note = [];
  const tutti = [];
  for (const k of Object.keys(json.movimenti || {})) for (const m of json.movimenti[k] || []) tutti.push(m);
  const tsDi = m => { const n = parseInt(m.ts, 36); return Number.isFinite(n) ? n : 1; };
  tutti.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : tsDi(a) - tsDi(b)));

  const eventi = [];
  let effetto = 0;
  for (const m of tutti) {
    const base = { id: m.id || uid(), data: m.data, ts: tsDi(m) };
    if ((m.tipo === "svago" || m.tipo === "pedaggio") && m.importo < 0) {
      eventi.push({ ...base, tipo: "spesa", desc: m.desc, importo: -m.importo });
      effetto += m.importo;
    } else if (m.tipo === "extra" && m.importo > 0) {
      eventi.push({ ...base, tipo: "extra", desc: m.desc, importo: m.importo });
      effetto += m.importo;
    } else {
      eventi.push({ ...base, tipo: "storico", desc: m.desc, lbl: m.tipoLbl || m.tipo, importo: m.importo || 0 });
    }
  }

  let soldi = p.soldi - effetto;
  if (p.cuscinetto > 0) { soldi += p.cuscinetto; note.push("Il cuscinetto (" + eur(p.cuscinetto) + ") è stato aggiunto ai Soldi."); }

  // Nella prova Telepass era una spesa ricorrente speciale più un totale "in attesa".
  // Qui diventa un conto a fattura: la spesa ricorrente diventa la quota fissa mensile,
  // gli importi già prenotati diventano costi fissi messi da parte, i pedaggi in attesa restano da pagare.
  const tpIds = new Set((p.spese || []).filter(s => s.telepass).map(s => s.id));
  let fissoTp = 0;
  const prenotate = {};
  for (const k of Object.keys(p.buste || {})) {
    const items = [];
    for (const i of p.buste[k].items || []) {
      if (tpIds.has(i.sid) && !i.pagato) { fissoTp += i.importo; if (i.fromSoldi) soldi -= i.importo; continue; }
      if (tpIds.has(i.sid)) continue;
      items.push({ id: i.id, sid: i.sid, nome: i.nome, importo: i.importo,
        giorno: Math.min(i.giorno, daysIn(k)), data: dataDi(k, i.giorno), pagato: !!i.pagato, dalSoldi: !!i.fromSoldi });
    }
    if (items.length) prenotate[k] = items;
  }
  const conti = [];
  if (tpIds.size || p.telepass > 0) {
    const quota = (p.spese || []).filter(s => s.telepass).reduce((t, s) => t + s.importo, 0);
    conti.push({ id: "telepass", nome: "Telepass", quota, fisso: fissoTp,
      aperte: p.telepass > 0 ? [{ id: "prova-telepass", desc: "Pedaggi in attesa (dalla prova)", data: oggi, importo: p.telepass }] : [] });
    note.push("Telepass è diventato un conto a fattura" + (p.telepass > 0 ? ", con " + eur(p.telepass) + " di pedaggi in attesa" : "")
      + (quota ? " e una quota fissa di " + eur(quota) + " al mese (controllala in Impostazioni)" : "") + ".");
  }
  const primaData = tutti.length ? tutti[0].data : oggi;
  const inizio = {
    id: uid(), tipo: "inizio", data: primaData < oggi ? primaData : oggi, ts: 0,
    soldi, meseCoperto: p.meseCoperto,
    spese: (p.spese || []).filter(s => !s.telepass).map(s => ({ id: s.id, nome: s.nome, importo: s.importo, giorno: s.giorno })),
    acc: (p.acc || []).map(a => ({ id: a.id, nome: a.nome, quota: a.quota, accantonato: a.accantonato, scadenza: a.scadenza || "" })),
    prenotate, conti,
  };
  return { eventi: [inizio, ...eventi], note, soldiProva: p.soldi };
}
