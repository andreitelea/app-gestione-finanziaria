// Prova "al centesimo": un simulatore indipendente fa finta di essere la banca.
// Giorno per giorno applica stipendi, spese, addebiti delle spese ricorrenti e
// pagamenti, senza usare la logica dell'app. Poi confronta ogni giorno:
//   saldo in banca  ==  Soldi + prenotate non addebitate + accantonamenti
// e controlla che Soldi, prenotate e accantonamenti siano ciascuno giusto.
// Lo fa su centinaia di storie casuali, anche dopo modifiche ed eliminazioni.
import test from "node:test";
import assert from "node:assert/strict";
import * as E from "../engine.js";

function rng(seed) { // generatore pseudo-casuale ripetibile
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const giorniTra = (da, a) => { const out = []; const d = new Date(da + "T12:00:00"); const fine = new Date(a + "T12:00:00"); while (d <= fine) { out.push(E.oggiISO(d)); d.setDate(d.getDate() + 1); } return out; };
const giornoDi = (s, ym) => Math.min(s.giorno, E.daysIn(ym));

/* ---------- Generatore di storie casuali ---------- */

function storia(seed) {
  const r = rng(seed);
  const int = (a, b) => a + Math.floor(r() * (b - a + 1));
  const pick = a => a[Math.floor(r() * a.length)];
  const inizioData = "2026-10-15";
  const spese = Array.from({ length: int(1, 5) }, (_, i) => ({ id: "s" + i, nome: "Spesa " + i, importo: int(100, 60000), giorno: int(1, 31) }));
  const acc = Array.from({ length: int(0, 3) }, (_, i) => ({ id: "a" + i, nome: "Acc " + i, quota: int(0, 5000), accantonato: int(0, 50000), scadenza: "" }));
  const saldo = int(50000, 900000);
  const prov = E.creaInizio({ soldi: 0, spese, acc, giaProssimo: r() < .5 }, inizioData);
  const daParte = Object.values(prov.prenotate).flat().reduce((t, i) => t + i.importo, 0) + acc.reduce((t, a) => t + a.accantonato, 0);
  const inizio = { ...prov, soldi: saldo - daParte };
  const eventi = [inizio];
  const vive = new Set(spese.map(s => s.id)), accVivi = new Set(acc.map(a => a.id));
  const conti = new Map(); // id -> id delle spese aperte
  let ts = 1, n = 0;
  const ev = (tipo, data, x) => eventi.push({ id: "e" + ++n, tipo, data, ts: ++ts, ...x });
  for (const d of giorniTra("2026-10-15", "2027-06-30")) {
    if (d.slice(8) === "15" || (d === "2026-10-15")) ev("mensile", d, { desc: "Entrata", importo: int(80000, 200000) });
    if (r() < .5) {
      const conto = conti.size && r() < .35 ? pick([...conti.keys()]) : null;
      ev("spesa", d, { desc: "Spesa", importo: int(1, 20000), ...(conto ? { conto } : {}) });
      if (conto) conti.get(conto).push(eventi[eventi.length - 1].id);
    }
    if (r() < .01 || (d === "2026-10-20" && r() < .7)) { const id = "c" + n; conti.set(id, []); ev("contoNuovo", d, { conto: { id, nome: "Conto", quota: int(0, 2000), fisso: int(0, 3000) } }); }
    if (conti.size && r() < .02) {
      const id = pick([...conti.keys()]); const aperte = conti.get(id);
      const incluse = aperte.filter(() => r() < .8);
      conti.set(id, aperte.filter(x => !incluse.includes(x)));
      ev("fattura", d, { contoId: id, importo: int(0, 60000), spese: incluse });
    }
    if (conti.size && r() < .01) { const id = pick([...conti.keys()]); ev("contoModifica", d, { contoId: id, nome: "Conto", quota: int(0, 2000), fisso: int(0, 4000) }); }
    if (r() < .05) ev("extra", d, { desc: "Extra", importo: int(100, 50000) });
    if (r() < .03 && accVivi.size) ev("accPaga", d, { accId: pick([...accVivi]), importo: int(100, 80000) });
    if (r() < .03) { const id = "n" + n; vive.add(id); ev("spesaNuova", d, { spesa: { id, nome: "Nuova", importo: int(100, 3000), giorno: int(1, 31) } }); }
    if (r() < .03 && vive.size) { const id = pick([...vive]); const s = [...spese].find(x => x.id === id) || { giorno: 0 }; ev("spesaModifica", d, { sid: id, nome: "Mod", importo: int(100, 60000), giorno: null }); }
    if (r() < .015 && vive.size) { const id = pick([...vive]); vive.delete(id); ev("spesaDisdetta", d, { sid: id }); }
    if (r() < .02) { const id = "b" + n; accVivi.add(id); ev("accNuovo", d, { acc: { id, nome: "Acc", quota: int(0, 3000), accantonato: int(0, 20000), scadenza: "" } }); }
    if (r() < .02 && accVivi.size) ev("accModifica", d, { accId: pick([...accVivi]), nome: "Acc", quota: int(0, 3000), accantonato: int(0, 30000), scadenza: "" });
    if (r() < .01 && accVivi.size) { const id = pick([...accVivi]); accVivi.delete(id); ev("accElimina", d, { accId: id }); }
  }
  return fixGiorni(eventi);
}
// spesaModifica nei test cambia solo l'importo: il giorno resta quello attuale
function fixGiorni(eventi) {
  const g = {};
  for (const s of eventi[0].spese) g[s.id] = s.giorno;
  for (const e of eventi) {
    if (e.tipo === "spesaNuova") g[e.spesa.id] = e.spesa.giorno;
    if (e.tipo === "spesaModifica") e.giorno = g[e.sid] ?? 1;
  }
  return eventi;
}

/* ---------- La banca simulata (non usa la logica dell'app) ---------- */

function* banca(eventi, fine) {
  const ini = eventi.find(e => e.tipo === "inizio");
  const ordinati = eventi.filter(e => e !== ini).sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : a.ts - b.ts);
  let saldo = ini.soldi + Object.values(ini.prenotate).flat().reduce((t, i) => t + i.importo, 0) + ini.acc.reduce((t, a) => t + a.accantonato, 0);
  const spese = new Map(ini.spese.map(s => [s.id, { ...s, da: ini.data }]));
  const acc = new Map(ini.acc.map(a => [a.id, { v: a.accantonato, quota: a.quota }]));
  const conti = new Map((ini.conti || []).map(c => [c.id, { quota: c.quota, fisso: c.fisso, aperte: new Map((c.aperte || []).map(i => [i.id, i.importo])) }]));
  let coperto = ini.meseCoperto;
  let k = 0;
  for (const d of giorniTra(ini.data, fine)) {
    const ym = E.ymOf(d), g = Number(d.slice(8));
    // la banca addebita le spese ricorrenti a inizio giornata
    for (const s of spese.values()) if (d > s.da && giornoDi(s, ym) === g) saldo -= s.importo;
    for (; k < ordinati.length && ordinati[k].data === d; k++) {
      const e = ordinati[k];
      switch (e.tipo) {
        case "spesa": if (e.conto && conti.has(e.conto)) conti.get(e.conto).aperte.set(e.id, e.importo); else saldo -= e.importo; break;
        case "contoNuovo": conti.set(e.conto.id, { quota: e.conto.quota, fisso: e.conto.fisso || 0, aperte: new Map() }); break;
        case "contoModifica": if (conti.has(e.contoId)) Object.assign(conti.get(e.contoId), { quota: e.quota, fisso: e.fisso }); break;
        case "fattura": if (conti.has(e.contoId)) { const c = conti.get(e.contoId); saldo -= e.importo; for (const id of e.spese) c.aperte.delete(id); c.fisso = 0; } break;
        case "extra": saldo += e.importo; break;
        case "mensile": saldo += e.importo; coperto = E.addM(coperto, 1); for (const a of acc.values()) a.v += a.quota; for (const c of conti.values()) c.fisso += c.quota; break;
        case "accPaga": if (acc.has(e.accId)) { const a = acc.get(e.accId); saldo -= e.importo; a.v -= Math.min(e.importo, Math.max(a.v, 0)); } break;
        case "spesaNuova": { const s = { ...e.spesa, da: d, nuovaDal: d }; spese.set(s.id, s); if (giornoDi(s, ym) === g) saldo -= s.importo; break; }
        case "spesaModifica": if (spese.has(e.sid)) spese.get(e.sid).importo = e.importo; break;
        case "spesaDisdetta": spese.delete(e.sid); break;
        case "accNuovo": acc.set(e.acc.id, { v: e.acc.accantonato, quota: e.acc.quota }); break;
        case "accModifica": if (acc.has(e.accId)) acc.set(e.accId, { v: e.accantonato, quota: e.quota }); break;
        case "accElimina": acc.delete(e.accId); break;
      }
    }
    // spese ancora da addebitare nei mesi coperti (dopo oggi)
    let prenotato = 0;
    for (const s of spese.values()) for (let m = ym; m <= coperto; m = E.addM(m, 1)) {
      const data = E.dataDi(m, s.giorno);
      if (data > d) prenotato += s.importo;
    }
    const accTot = [...acc.values()].reduce((t, a) => t + a.v, 0);
    const contiTot = [...conti.values()].reduce((t, c) => t + c.fisso + [...c.aperte.values()].reduce((x, v) => x + v, 0), 0);
    yield { d, saldo, prenotato, acc: accTot, conti: contiTot, soldi: saldo - prenotato - accTot - contiTot };
  }
}

function confronta(eventi, fine, etichetta) {
  for (const b of banca(eventi, fine)) {
    const visibili = eventi.filter(e => e.data <= b.d);
    const { stato } = E.calcola(visibili, b.d);
    const msg = etichetta + " il " + b.d;
    assert.ok(Number.isInteger(stato.soldi), msg + ": Soldi non intero");
    assert.equal(E.saldoAtteso(stato), b.saldo, msg + ": saldo atteso diverso dalla banca");
    assert.equal(E.totalePrenotato(stato), b.prenotato, msg + ": prenotate diverse");
    assert.equal(E.totaleAccantonato(stato), b.acc, msg + ": accantonamenti diversi");
    assert.equal(E.totaleConti(stato), b.conti, msg + ": conti a fattura diversi");
    assert.equal(stato.soldi, b.soldi, msg + ": Soldi diversi");
  }
}

test("200 storie casuali di 8 mesi: ogni giorno tutto torna al centesimo con la banca", () => {
  for (let seed = 1; seed <= 200; seed++) confronta(storia(seed), "2027-06-30", "storia " + seed);
});

test("modifiche ed eliminazioni di movimenti vecchi: tutto torna lo stesso", () => {
  for (let seed = 1000; seed < 1100; seed++) {
    const r = rng(seed);
    let ev = storia(seed);
    for (let volta = 0; volta < 5; volta++) {
      const candidati = ev.filter(e => e.tipo !== "inizio");
      const e = candidati[Math.floor(r() * candidati.length)];
      if (e.tipo === "mensile" || r() < .5) {
        // cambio importo (le entrate mensili si correggono, non si tolgono, per restare sempre coperti)
        if ("importo" in e) ev = ev.map(x => x === e ? { ...x, importo: 1 + Math.floor(r() * 90000) } : x);
      } else {
        ev = ev.filter(x => x !== e); // eliminazione
      }
      ev = fixGiorni(ev);
    }
    confronta(ev, "2027-06-30", "storia modificata " + seed);
  }
});

test("l'ordine in cui le operazioni sono salvate non cambia il risultato", () => {
  for (let seed = 2000; seed < 2050; seed++) {
    const ev = storia(seed);
    const r = rng(seed);
    const mescolati = [...ev].sort(() => r() - .5);
    assert.deepEqual(E.calcola(mescolati, "2027-06-30").stato, E.calcola(ev, "2027-06-30").stato);
  }
});
