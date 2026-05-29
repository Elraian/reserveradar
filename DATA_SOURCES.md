# Reserve Radar — Andmeallikad (data sources)

What we collect, from where, and what's still to add. Status: ✅ wired into the app · 🟡 available, not yet used · ⬜ to add.

---

## 1. Maa-amet — Kitsenduste API  ✅  (THE core source)

The official restrictions aggregator. **One call returns every restriction on a parcel** — nature, utility, road, water — with geometry + overlap size. Same data the official `kitsendused.kataster.ee` app shows.

| | |
|---|---|
| **Endpoint** | `GET https://kitsendused.kataster.ee/api/v2/cadastre-unit/restrictions?cadastreUnit=<tunnus>` |
| **Auth** | none (public) |
| **Input** | katastritunnus (`NNNNN:NNN:NNNN`) |
| **Official UI** | `https://kitsendused.kataster.ee/public?code=<tunnus>` (our "open source" link) |

**Fields per restriction (`restrictionObjects[]`):**
- `restrictionObject.name` — name (e.g. "AMKA.3x70+95", "Pandivere…nitraaditundlik ala")
- `restrictionObject.feature.{code,name}` — kind (e.g. "Elektriõhuliin alla 1 kV", "Puurkaev")
- `restrictionObject.type.code` — nature-area type (only for kaitsealad: MAASTIKUKAITSEALA…)
- `restrictionObject.objectType` — geometry kind: `JOON` (line) / `PIND` (area) / point
- `restrictionObject.externalReference` — **KKR code** (KLO…/RAH…/LTA…) → bridge to eeskiri
- `intersectionArea` (m²), `intersectionLength` (m) — overlap with the parcel
- `intersectingGeometry` — GeoJSON in **EPSG:3301** (we reproject → 4326 for the map)
- `cadastreUnit.{code, fullAddress, geometry}` — parcel itself

---

## 2. Maa-amet — Kataster WFS  ✅

Parcel geometry + address by tunnus (authoritative, nightly-updated, ~777k units).

| | |
|---|---|
| **Endpoint** | `https://gsavalik.envir.ee/geoserver/kataster/wfs` |
| **Layer** | `kataster:ky_kehtiv` (currently valid parcels) |
| **Query** | `?service=WFS&version=2.0.0&request=GetFeature&typeNames=kataster:ky_kehtiv&CQL_FILTER=tunnus='…'&outputFormat=application/json&srsName=EPSG:4326` |
| **Gives** | parcel polygon (4326 for map / 3301 for area calc), address |

---

## 3. EELIS WFS — looduskaitse  ✅ (nature) / 🟡 (extras)

Protected areas, Natura, species, water, heritage. Host: `https://gsavalik.envir.ee/geoserver/eelis/wfs`

| Layer | What | Status |
|---|---|---|
| `eelis:kr_kaitseala` | Kaitsealad (rahvuspark, LKA, MKA) | ✅ |
| `eelis:kr_hoiuala` | Hoiualad | ✅ |
| `eelis:kr_loodusala` / `kr_linnuala` | Natura 2000 (habitat / bird) | ✅ |
| `eelis:kr_piirang` | Piiranguvööndid (→ zone detection) | ✅ |
| `eelis:kr_looduslik_skv` / `kr_hooldatav_skv` | Sihtkaitsevööndid | ✅ |
| `eelis:kr_reservaat` | Reservaadid (rangeim — majandus keelatud) | ✅ |
| `eelis:kr_yksikobjektid` / `kr_yksikobjekti_kaitsetsoon` | Kaitsealused üksikobjektid + kaitsetsoon | ✅ |
| `eelis:kr_taimed_iii` / `kr_loomad_iii` / `kr_seened_samblikud_iii` | III kaitsekategooria liigid | ✅ |
| `eelis:kr_vep` | Vääriselupaigad (VEP) | ✅ |
| `eelis:toetus_mets` | LK metsahüvitised (**toetused!**) | 🟡 add — positive signal |
| `eelis:pk_objekt_metsas` | Pärandkultuur metsas | 🟡 add |
| `eelis:avalikud_jarved` / `avalikud_vooluveekogud` / `kr_allikas` / `kr_karst` | Vesi → kalda piiranguvöönd | 🟡 add |
| `eelis:kr_yleujutusohuga_ala` / `kr_jaakreostus` | Üleujutus / jääkreostus | 🟡 add |

*Full layer list (~90): add `?request=GetCapabilities` to the WFS URL.*

### 3b. Maa-amet karuputk (invasive hogweed) ✅
Same GeoServer, workspace `maaamet`. `maaamet:karuputk` — hogweed colonies (polygon) with `seisund` (tõrjutav/hävinud), `torjemeetod`, `pindala`, `raskusaste`. Surfaced as a "Võõrliik" card (orange on the map). Source app: `xgis.maaamet.ee/xgis2/page/app/karuputk`. Managing land with a colony is allowed only while spread is actively controlled.

---

## 4. Metsaregister WFS — mets  🟡 (available, not fully wired)

Host: `https://gsavalik.envir.ee/geoserver/metsaregister/wfs`

| Layer | What | Status |
|---|---|---|
| `metsaregister:eraldis` | Metsaeraldised (puistu: liik, vanus) | 🟡 add to answer |
| `metsaregister:eraldis_element` | Puistu koosseis | 🟡 add |
| `metsaregister:teatis` | **Aktiivsed metsateatised (raie!)** | 🟡 add — high value |
| `metsaregister:mke` | Metsakaitseekspertiis / raiesoovitused | 🟡 add |

---

## 5. Riigi Teataja — kaitse-eeskirjad + seadused  ✅ (eeskiri) / ⬜ (acts)

The legal text. Each protected area has its own kaitse-eeskiri (VV määrus).

| | |
|---|---|
| **Akt (XML)** | `https://www.riigiteataja.ee/akt/<aktId>.xml` (parsed by §) |
| **Resolution** | area name → akt id via Gemini+Google-search, **verified** against the real akt (title match, not repealed) |
| **Bulk** | `https://www.riigiteataja.ee/avaandmed/ERT/` |
| Looduskaitseseadus, Metsaseadus, Veeseadus, Ehitusseadustik, Maapõueseadus | general acts (cited by name in answers) | ⬜ index for direct §-lookup |

---

## 6. Tuletatud kategooriad (how we classify each kitsendus)

`looduskaitse` · `liik` · `elektri` · `gaas` · `side` · `tee` · `vesi` · `muu`
→ UI categories: protection / species / utility / road / water / info (color-coded on map + chips).

---

## 7. ⬜ To add (future / v2)

| Source | What | Why |
|---|---|---|
| **Maa-amet tehingute andmebaas** | naabertehingute hinnad | turuväärtuse kontekst (hind) |
| **SMI** (statistiline metsainventuur, opendata.riik.ee) | metsastatistika (valimipõhine) | usaldusväärsuse kontekst, mitte per-parcel |
| **kaitsealad.ee** | kaitsealade kirjeldused | inimkeelne lisainfo, lingid |
| **Metsaregister `teatis`/`mke`** | aktiivsed raieteatised + soovitused | "kas keegi juba raiub / mida soovitatakse" |
| **EELIS `toetus_mets`** | looduskaitselised metsahüvitised | näita toetust, mitte ainult piirangut |

---

## Architecture note
All sources are queried **live per request** (Vercel serverless functions). Nothing is stored — the answer is always current. The only cache worth adding is the Riigi Teataja eeskiri text (it's large and rarely changes).
