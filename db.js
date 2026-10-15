// Soldi — database locale (IndexedDB).
// Due contenitori: "eventi" (il registro delle operazioni) e "meta" (impostazioni
// come la data dell'ultimo backup). Niente esce dal telefono.

const NOME = "soldi";
const VERSIONE = 1;
let dbp = null;

function apri() {
  if (dbp) return dbp;
  dbp = new Promise((ok, ko) => {
    const r = indexedDB.open(NOME, VERSIONE);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains("eventi")) db.createObjectStore("eventi", { keyPath: "id" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "k" });
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
    r.onblocked = () => ko(new Error("Database bloccato da un'altra finestra"));
  });
  return dbp;
}

async function tx(store, modo, lavoro) {
  const db = await apri();
  return new Promise((ok, ko) => {
    const t = db.transaction(store, modo);
    let risultato;
    t.oncomplete = () => ok(risultato);
    t.onerror = () => ko(t.error);
    t.onabort = () => ko(t.error || new Error("Operazione annullata"));
    const r = lavoro(t.objectStore(store));
    if (r) r.onsuccess = () => { risultato = r.result; };
  });
}

export const tuttiEventi = () => tx("eventi", "readonly", s => s.getAll());
export const salvaEvento = e => tx("eventi", "readwrite", s => s.put(e));
export const eliminaEvento = id => tx("eventi", "readwrite", s => s.delete(id));

// Sostituisce tutto il registro in un'unica transazione (ripristino backup)
export const sostituisciEventi = eventi => tx("eventi", "readwrite", s => {
  s.clear();
  for (const e of eventi) s.put(e);
});

export async function leggiMeta(k) {
  const r = await tx("meta", "readonly", s => s.get(k));
  return r ? r.v : undefined;
}
export const scriviMeta = (k, v) => tx("meta", "readwrite", s => s.put({ k, v }));

// Chiede al sistema di non cancellare i dati quando manca spazio
export async function chiediPersistenza() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch { return null; }
}
