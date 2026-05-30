// Reserve Radar — historical cadaster lookup. When a tunnus isn't in the
// CURRENT cadaster (kataster:ky_kehtiv), it may be a parcel that was split,
// merged or renumbered (common for parcels seen in the tehingute andmebaas).
// kataster:ky_versioonid keeps every version with validity dates + closure
// reason, so we can explain WHY it's gone instead of a blank "not found".
import { getFeatures } from "./wfs.mjs";

/**
 * Look up a tunnus in the version history. Returns null if never existed, else
 * the most recent version with its validity window + closure reason.
 */
export async function lookupParcelHistory(tunnus) {
  let fc;
  try {
    fc = await getFeatures("kataster:ky_versioonid", {
      cql: `tunnus='${tunnus}'`,
      count: 20,
    });
  } catch {
    return null;
  }
  const feats = fc?.features ?? [];
  if (!feats.length) return null;
  // Most recent version (latest kehtiv_alates / kehtiv_kuni).
  const latest = feats
    .map((f) => f.properties ?? {})
    .sort((a, b) => String(b.kehtiv_kuni ?? "").localeCompare(String(a.kehtiv_kuni ?? "")))[0];
  return {
    tunnus,
    address: latest.l_aadress ?? null,
    municipality: [latest.ov_nimi, latest.mk_nimi].filter(Boolean).join(", "),
    validFrom: (latest.kehtiv_alates ?? "").slice(0, 10) || null,
    validUntil: (latest.kehtiv_kuni ?? "").slice(0, 10) || null,
    closedReason: latest.sulgemise_pohjus ?? null, // e.g. "Jagamine", "Liitmine"
    successor: latest.tekkiv_ky ?? null, // the parcel(s) it became
    forestM2: typeof latest.mets === "number" ? latest.mets : null,
  };
}
