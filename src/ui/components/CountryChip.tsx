let names: Intl.DisplayNames | null = null;

/** Country name in pt-BR ("Coreia do Sul"), or the code itself when the runtime can't say. */
export function countryName(code: string): string {
  try {
    names ??= new Intl.DisplayNames(['pt-BR'], { type: 'region' });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Small ISO-code chip for a player's country (no emoji flags: they render inconsistently and read as decoration). */
export function CountryChip({ code }: { code: string }) {
  if (!code) return null;
  const name = countryName(code);
  return (
    <span className="country-chip" title={name} aria-label={name} role="img">
      {code}
    </span>
  );
}
