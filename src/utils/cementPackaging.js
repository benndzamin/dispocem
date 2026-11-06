// Pakovanje vrste cementa (kolona cement_types.packaging, provjerava je i baza).
// Puni naziv vrste = "<osnovni naziv> - <dodatak>", npr.
// "CEM I 52,5 N - PREMILUK - rinfuzni".
export const PACKAGING_OPTIONS = [
  { value: "25/1", label: "25/1", suffix: "uvrećani 25/1" },
  { value: "20/1", label: "20/1", suffix: "uvrećani 20/1" },
  { value: "rinfuzni", label: "rinfuzni", suffix: "rinfuzni" },
];

export const DEFAULT_PACKAGING = "25/1";

export function isBulkPackaging(packaging) {
  return packaging === "rinfuzni";
}

// Rezerva za nazive kojih nema u katalogu (npr. stare najave):
// prepoznaje i "RINFUZA" i "rinfuzni".
export function isBulkName(name) {
  return /rinfuz/i.test(name || "");
}

export function packagingLabel(packaging) {
  return PACKAGING_OPTIONS.find((o) => o.value === packaging)?.label || packaging || "-";
}

export function composeCementName(baseName, packaging) {
  const option = PACKAGING_OPTIONS.find((o) => o.value === packaging);
  const base = (baseName || "").trim();
  return option ? `${base} - ${option.suffix}` : base;
}

// Odvaja poznati dodatak pakovanja s kraja naziva (za formu izmjene).
export function splitCementName(name, packaging) {
  const full = (name || "").trim();
  for (const option of PACKAGING_OPTIONS) {
    const tail = ` - ${option.suffix}`;
    if (full.toLowerCase().endsWith(tail.toLowerCase())) {
      return { baseName: full.slice(0, -tail.length).trim(), packaging: option.value };
    }
  }
  return { baseName: full, packaging: packaging || DEFAULT_PACKAGING };
}
