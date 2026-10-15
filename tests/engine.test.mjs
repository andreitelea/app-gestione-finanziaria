// Test del motore: node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import * as E from "../engine.js";

let n = 0;
const ev = (tipo, data, extra = {}) => ({ id: "e" + ++n, tipo, data, ts: ++n, ...extra });

const spese = [
  { id: "audi", nome: "Rata Audi", importo: 47025, giorno: 8 },
  { id: "net", nome: "Netflix", importo: 1399, giorno: 20 },
];
const acc = [{ id: "rca", nome: "RCA", quota: 2500, accantonato: 33000, scadenza: "15 dicembre" }];
const TOT = 47025 + 1399 + 2500;

function base(oggi = "2026-10-15") {
  return E.creaInizio({ soldi: 100000, spese, acc, giaProssimo: false }, oggi);
}

test("importi letti al centesimo", () => {
  assert.equal(E.leggiEuro("4,99"), 499);
  assert.equal(E.leggiEuro("1.234,56"), 123456);
  assert.equal(E.leggiEuro("1.234"), 123400);
  assert.equal(E.leggiEuro("12.5"), 1250);
  assert.equal(E.leggiEuro("12 €"), 1200);
  assert.equal(E.leggiEuro("0,1"), 10);
  assert.equal(E.leggiEuro("abc"), null);
  assert.equal(E.leggiEuro("1,234"), null);
  assert.equal(E.eur(123456).replace(/\s/g, " "), "1.234,56 €");
});

test("primo avvio: prenota solo le spese di questo mese non ancora passate", () => {
  const { stato } = E.calcola([base()], "2026-10-15");
  assert.equal(stato.soldi, 100000);
  assert.equal(stato.meseCoperto, "2026-10");
  assert.deepEqual(stato.prenotate["2026-10"].map(i => i.sid), ["net"]);
  assert.equal(E.totalePrenotato(stato), 1399);
});

test("primo avvio con mese prossimo già messo da parte", () => {
  const i = E.creaInizio({ soldi: 100000, spese, acc, giaProssimo: true }, "2026-10-15");
  const { stato } = E.calcola([i], "2026-10-15");
  assert.equal(stato.meseCoperto, "2026-11");
  assert.equal(stato.prenotate["2026-11"].length, 2);
});

test("spesa ed entrata extra", () => {
  const { stato } = E.calcola([base(), ev("spesa", "2026-10-15", { desc: "Pizza", importo: 1200 }), ev("extra", "2026-10-15", { desc: "Rimborso", importo: 5000 })], "2026-10-15");
  assert.equal(stato.soldi, 100000 - 1200 + 5000);
});

test("entrata mensile: toglie il totale, prenota il mese dopo, aggiunge le quote", () => {
  const { stato, movimenti } = E.calcola([base(), ev("mensile", "2026-10-15", { desc: "NASpI", importo: 120000 })], "2026-10-15");
  assert.equal(stato.meseCoperto, "2026-11");
  assert.equal(stato.soldi, 100000 + 120000 - TOT);
  assert.equal(stato.acc[0].accantonato, 33000 + 2500);
  assert.equal(stato.prenotate["2026-11"].length, 2);
  assert.equal(movimenti[0].tot, TOT);
});

test("le prenotate si addebitano da sole nel loro giorno, senza toccare i Soldi", () => {
  const evs = [base(), ev("mensile", "2026-10-15", { desc: "NASpI", importo: 120000 })];
  const prima = E.calcola(evs, "2026-11-07").stato;
  const dopo = E.calcola(evs, "2026-11-08").stato;
  assert.equal(prima.soldi, dopo.soldi);
  assert.equal(E.totalePrenotato(prima) - E.totalePrenotato(dopo), 47025);
});

test("il saldo atteso torna", () => {
  const { stato } = E.calcola([base(), ev("mensile", "2026-10-15", { desc: "NASpI", importo: 120000 }), ev("spesa", "2026-10-16", { desc: "Benzina", importo: 6000 })], "2026-10-21");
  // in banca: 100000 liberi + 1399 Netflix di ottobre (già addebitato il 20) + 33000 accantonati
  // + 120000 entrata - 6000 spesa
  assert.equal(E.saldoAtteso(stato), 100000 + 33000 + 120000 - 6000);
});

test("disdetta: le prenotate non addebitate tornano nei Soldi", () => {
  const evs = [base(), ev("mensile", "2026-10-15", { desc: "NASpI", importo: 120000 }), ev("spesaDisdetta", "2026-10-16", { sid: "net" })];
  const { stato } = E.calcola(evs, "2026-10-16");
  assert.equal(stato.soldi, 100000 + 120000 - TOT + 1399 * 2);
  assert.equal(stato.spese.length, 1);
  assert.equal(E.totalePrenotato(stato), 47025);
});

test("disdetta il giorno dell'addebito: quello di oggi è già addebitato", () => {
  const evs = [base(), ev("spesaDisdetta", "2026-10-20", { sid: "net" })];
  const { stato } = E.calcola(evs, "2026-10-20");
  assert.equal(stato.soldi, 100000);
});

test("nuova spesa ricorrente: i mesi già coperti escono subito dai Soldi, poi entra nel totale", () => {
  const evs = [base(), ev("mensile", "2026-10-15", { desc: "NASpI", importo: 120000 }),
    ev("spesaNuova", "2026-10-16", { spesa: { id: "spot", nome: "Spotify", importo: 1099, giorno: 18 } })];
  const r = E.calcola(evs, "2026-10-16");
  const prima = E.calcola(evs.slice(0, 2), "2026-10-16").stato;
  assert.equal(prima.soldi - r.stato.soldi, 1099 * 2); // 18 ottobre e 18 novembre
  assert.equal(r.movimenti[0].importo, -2198);
  // nel giorno dell'addebito i Soldi non cambiano più
  assert.equal(E.calcola(evs, "2026-11-18").stato.soldi, r.stato.soldi);
  // il saldo atteso non cambia: i soldi sono solo spostati da Soldi a prenotate
  assert.equal(E.saldoAtteso(r.stato), E.saldoAtteso(prima));
  // dalla prossima entrata è nel totale
  const st = E.calcola([...evs, ev("mensile", "2026-11-15", { desc: "NASpI", importo: 120000 })], "2026-11-15").stato;
  assert.equal(st.prenotate["2026-12"].length, 3);
});

test("cambio importo di una spesa ricorrente: aggiorna anche le prenotate", () => {
  const evs = [base(), ev("mensile", "2026-10-15", { desc: "NASpI", importo: 120000 }),
    ev("spesaModifica", "2026-10-16", { sid: "net", nome: "Netflix", importo: 1599, giorno: 20 })];
  const prima = E.calcola(evs.slice(0, 2), "2026-10-16").stato;
  const dopo = E.calcola(evs, "2026-10-16").stato;
  assert.equal(prima.soldi - dopo.soldi, 200 * 2);
  assert.equal(E.saldoAtteso(dopo), E.saldoAtteso(prima));
});

test("pagamento accantonamento: se non basta la differenza esce dai Soldi", () => {
  const { stato, movimenti } = E.calcola([base(), ev("accPaga", "2026-10-15", { accId: "rca", importo: 40000 })], "2026-10-15");
  assert.equal(stato.acc[0].accantonato, 0);
  assert.equal(stato.soldi, 100000 - 7000);
  assert.equal(movimenti[0].importo, -7000);
});

test("modificare o eliminare un'entrata mensile vecchia ricalcola tutto", () => {
  const m1 = ev("mensile", "2026-10-15", { desc: "NASpI", importo: 120000 });
  const sp = ev("spesa", "2026-10-20", { desc: "Cena", importo: 3000 });
  const m2 = ev("mensile", "2026-11-15", { desc: "NASpI", importo: 120000 });
  const evs = [base(), m1, sp, m2];
  const a = E.calcola(evs, "2026-11-15").stato;
  assert.equal(a.meseCoperto, "2026-12");
  const corretto = E.calcola([base(), { ...m1, importo: 110000 }, sp, m2], "2026-11-15").stato;
  assert.equal(a.soldi - corretto.soldi, 10000);
  const senza = E.calcola([base(), sp, m2], "2026-11-15").stato;
  assert.equal(senza.meseCoperto, "2026-11");
});

test("accantonamento nuovo, modificato, eliminato", () => {
  const evs = [base(),
    ev("accNuovo", "2026-10-15", { acc: { id: "bollo", nome: "Bollo", quota: 2000, accantonato: 10000, scadenza: "" } }),
    ev("accModifica", "2026-10-16", { accId: "bollo", nome: "Bollo auto", quota: 2000, accantonato: 12000, scadenza: "" }),
  ];
  let st = E.calcola(evs, "2026-10-16").stato;
  assert.equal(st.soldi, 100000 - 12000);
  st = E.calcola([...evs, ev("accElimina", "2026-10-17", { accId: "bollo" })], "2026-10-17").stato;
  assert.equal(st.soldi, 100000);
});

test("ordine: un'operazione inserita dopo con data vecchia viene ricalcolata al suo posto", () => {
  const m1 = ev("mensile", "2026-10-15", { desc: "NASpI", importo: 120000 });
  const vecchia = ev("spesaDisdetta", "2026-10-10", { sid: "net" });
  vecchia.data = "2026-10-15"; vecchia.ts = 0.5; // stesso giorno ma prima dell'entrata
  const { stato } = E.calcola([base(), m1, vecchia], "2026-10-15");
  assert.equal(stato.prenotate["2026-11"].length, 1);
});

test("migrazione dalla prova Buste: stessi Soldi e spese modificabili", () => {
  const prova = {
    esportato: "2026-10-15T08:00:00.000Z",
    stato: {
      versione: 1, soldi: 507727, meseCoperto: "2026-11", telepass: 12204, cuscinetto: 0,
      spese: [{ id: "audi", nome: "Rata Audi A3", importo: 47025, giorno: 8 }, { id: "tp", nome: "Telepass", importo: 887, giorno: 31, telepass: true }],
      acc: [{ id: "rca", nome: "Polizza RCA", quota: 2500, accantonato: 33000, scadenza: "15 Dicembre" }],
      buste: { "2026-11": { items: [
        { id: "n-audi", sid: "audi", nome: "Rata Audi A3", importo: 47025, giorno: 8, pagato: false, fromSoldi: false },
        { id: "n-tp", sid: "tp", nome: "Telepass", importo: 887, giorno: 31, pagato: false, fromSoldi: false, tel: true },
      ] } },
    },
    movimenti: { "2026-10": [
      { id: "m0", data: "2026-10-15", desc: "NASpI → busta novembre", tipo: "mensile", tipoLbl: "entrata mensile", importo: 100000, tot: 50412, ts: "mg0" },
      { id: "x1", data: "2026-10-15", desc: "Pizza", tipo: "svago", tipoLbl: "spesa", importo: -1200, ts: "mg1" },
      { id: "x2", data: "2026-10-15", desc: "Pedaggio A12", tipo: "pedaggio", tipoLbl: "spesa", importo: -450, ts: "mg2" },
    ] },
  };
  const { eventi, note, soldiProva } = E.leggiBackup(prova, "2026-10-15");
  const { stato, movimenti } = E.calcola(eventi, "2026-10-15");
  assert.equal(stato.soldi, soldiProva);
  assert.equal(stato.meseCoperto, "2026-11");
  assert.equal(E.totalePrenotato(stato), 47025);
  // Telepass diventa un conto a fattura: quota 8,87 €, 8,87 € già messi da parte, 122,04 € di pedaggi in attesa
  assert.equal(stato.conti[0].quota, 887);
  assert.equal(E.totaleConti(stato), 887 + 12204);
  assert.equal(stato.spese.length, 1);
  // il saldo atteso è identico a quello della prova (Soldi + buste + accantonamenti + Telepass in attesa)
  assert.equal(E.saldoAtteso(stato), 507727 + 47025 + 887 + 33000 + 12204);
  assert.equal(movimenti.find(m => m.id === "x1").modificabile, true);
  assert.equal(movimenti.find(m => m.id === "m0").modificabile, false);
  assert.equal(note.length, 1);
  // correggo la pizza: i Soldi cambiano della differenza
  const corr = eventi.map(e => (e.id === "x1" ? { ...e, importo: 1500 } : e));
  assert.equal(E.calcola(corr, "2026-10-15").stato.soldi, 507727 - 300);
});

test("migrazione: il cuscinetto finisce nei Soldi", () => {
  const prova = { stato: { soldi: 1000, meseCoperto: "2026-10", cuscinetto: 500, spese: [], acc: [], buste: {} }, movimenti: {} };
  const { eventi, note } = E.leggiBackup(prova, "2026-10-15");
  assert.equal(E.calcola(eventi, "2026-10-15").stato.soldi, 1500);
  assert.equal(note.length, 1);
});

test("backup di Soldi: andata e ritorno", () => {
  const evs = [base(), ev("spesa", "2026-10-15", { desc: "Pizza", importo: 1200 })];
  const j = JSON.parse(JSON.stringify(E.creaBackup(evs)));
  assert.deepEqual(E.leggiBackup(j).eventi, evs);
  assert.throws(() => E.leggiBackup({ foo: 1 }));
});

test("conto a fattura: spese, quota fissa e fattura tornano al centesimo", () => {
  const evs = [base(),
    ev("contoNuovo", "2026-10-15", { conto: { id: "tp", nome: "Telepass", quota: 770, fisso: 0 } }),
    ev("spesa", "2026-10-16", { desc: "Autostrada", importo: 3000, conto: "tp" }),
    ev("spesa", "2026-10-17", { desc: "Parcheggio", importo: 500, conto: "tp" }),
    ev("mensile", "2026-10-17", { desc: "Entrata", importo: 120000 }),
  ];
  const a = E.calcola(evs, "2026-10-17").stato;
  assert.equal(E.totaleConti(a), 3000 + 500 + 770);
  assert.equal(E.totaleMensile(a), TOT + 770);
  // fattura: 35 € di pedaggi + 7,70 di fissi + 2 € di bollo
  const conFattura = [...evs, ev("fattura", "2026-10-18", { contoId: "tp", importo: 3000 + 500 + 770 + 200, spese: evs.slice(2, 4).map(e => e.id) })];
  const b = E.calcola(conFattura, "2026-10-18").stato;
  assert.equal(E.totaleConti(b), 0);
  assert.equal(a.soldi - b.soldi, 200);
  assert.equal(E.saldoAtteso(a) - E.saldoAtteso(b), 3000 + 500 + 770 + 200);
  // un pedaggio non compreso nella fattura resta da pagare
  const parziale = [...evs, ev("fattura", "2026-10-18", { contoId: "tp", importo: 3000 + 770, spese: [evs[2].id] })];
  const c = E.calcola(parziale, "2026-10-18").stato;
  assert.equal(E.totaleConti(c), 500);
  assert.equal(c.soldi, a.soldi);
});

test("fine mese: giorno 31 a febbraio diventa 28", () => {
  assert.equal(E.dataDi("2027-02", 31), "2027-02-28");
  assert.equal(E.addM("2026-12", 1), "2027-01");
  assert.equal(E.addM("2027-01", -1), "2026-12");
});
