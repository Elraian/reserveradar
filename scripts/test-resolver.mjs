import { resolveEeskiriAktSearch } from "./rt.mjs";
for (const name of ["Vahtrepa maastikukaitseala", "Otepää looduspark", "Karula rahvuspark"]) {
  const id = await resolveEeskiriAktSearch(name);
  console.log(`${name} → akt ${id ?? "NONE"}  ${id ? "https://www.riigiteataja.ee/akt/" + id : ""}`);
}
