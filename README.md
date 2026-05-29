# Reserve Radar

Sisesta katastritunnus → näe kinnistu looduskaitselisi piiranguid lihtsalt ja kiiresti.
Hackathon "Metsikult andmetes 2026" (Keskkonnaagentuur).

## Käivitamine

```bash
npm install
npm run dev    # http://localhost:3000
```

## Koodi jaotus (merge-conflict-free)

Et UI ja süsteem ei satuks git-konflikti, hoiame need rangelt eraldi kaustades:

| Kaust | Omanik | Sisu |
|-------|--------|------|
| `app/`, `components/` | **UI** | Lehed, vaade, kaart, vestlus |
| `app/_data/` | **UI** | Ajutine näidisandmestik (Vahtrepa) |
| `lib/` | **Süsteem** | Päris andmemootor (EELIS / Maa-amet / RT päringud) |
| `data/` | jagatud | Allalaaditud avaandmed (gitignore'is) |

**Reegel:** UI pool ei muuda `lib/`, süsteemi pool ei muuda `app/` ega `components/`.
Ainus jagatud fail on `package.json` — uue sõltuvuse lisamisel anna teada.

### Andmeleping (seam)

UI loeb praegu kõvakodeeritud näidist failist `app/_data/sampleReport.ts`
(tüüp `ParcelReport`). Kui süsteemipoolne mootor `lib/`-s valmib ja tagastab
sama kujuga objekti, vahetatakse `app/page.tsx`-s üksainus import — muud UI-d
muuta pole vaja.
