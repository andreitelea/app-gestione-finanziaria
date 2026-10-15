# Soldi

**Apri l'app: https://andreitelea.github.io/app-gestione-finanziaria/**

App per iPhone (PWA) per gestire i soldi con il metodo del **mese in anticipo**:
ogni entrata mensile paga le spese ricorrenti e gli accantonamenti del mese successivo,
e quello che resta sono i **Soldi** liberi, sempre aggiornati al centesimo.

- Nessun server, nessun account, nessun tracciamento: i dati restano nel telefono (IndexedDB).
- Funziona offline (service worker).
- Gratis e open source (licenza MIT).

## Installazione su iPhone

1. Apri **https://andreitelea.github.io/app-gestione-finanziaria/** con **Safari**.
2. Tocca **Condividi** → **Aggiungi alla schermata Home**.
3. Apri **Soldi** dall'icona: si apre a schermo intero, come un'app.

## Come funziona

| Operazione | Effetto |
|---|---|
| Entrata mensile | Copre il mese successivo: toglie spese ricorrenti + quote degli accantonamenti, il resto va nei Soldi |
| Entrata extra | Va tutta nei Soldi |
| Spesa | Esce subito dai Soldi |
| Spese prenotate | Risultano addebitate da sole nel loro giorno |
| Nuova spesa ricorrente | I pagamenti nei mesi già coperti escono subito dai Soldi; dalla prossima entrata mensile è nel totale |
| Cambio importo di una spesa ricorrente | Vale anche per le prenotate non ancora addebitate: la differenza esce dai Soldi o ci torna |
| Disdetta | Gli importi già prenotati tornano nei Soldi |
| Spesa con un conto a fattura (Telepass, carta di credito…) | Esce subito dai Soldi e resta nel conto finché non arriva la fattura |
| Fattura pagata | Svuota il conto (spese scelte + costi fissi messi da parte); la differenza esce dai Soldi o ci torna |
| Controllo con la banca | Saldo atteso = Soldi + prenotate non addebitate + accantonamenti + conti a fattura da pagare |

Ogni operazione finisce in un **registro**. Lo stato non viene salvato: viene ricalcolato
rileggendo il registro, come un estratto conto. Per questo qualsiasi movimento, anche vecchio,
si può correggere o eliminare.

## Backup

I dati esistono solo sul telefono. **Impostazioni → Backup → Esporta** crea il file
`soldi-backup-AAAA-MM-GG.json` da salvare in iCloud Drive (conviene tenerne 2–3).
L'app ricorda di farlo se l'ultimo backup ha più di 7 giorni.

Attenzione: eliminare l'icona dalla schermata Home cancella i dati.

## Struttura

```
index.html            pagina
styles.css            aspetto (tema chiaro e scuro)
app.js                interfaccia
engine.js             regole del metodo e ricalcolo (nessuna interfaccia)
db.js                 database locale IndexedDB
sw.js                 service worker per l'uso offline
manifest.webmanifest  nome, icona, schermo intero
icons/                icone
tests/                test del motore (node --test tests/*.test.mjs)
```

Importi sempre in centesimi interi (4,99 € = `499`) per evitare errori di arrotondamento.

## Sviluppo

```
npm test                      # test del motore + simulazione della banca su 300 storie casuali
python3 -m http.server 8000   # prova in locale su http://localhost:8000
```

Per pubblicare una nuova versione cambia `VERSIONE` in `sw.js`, così i telefoni scaricano i file aggiornati.
