/**
 * Logical creative identity used at the data-contract boundary.
 *
 * Meta duplicates frequently append a trailing "Copy" marker while leaving the
 * underlying creative name unchanged. We strip only recognized trailing suffixes;
 * there is deliberately no fuzzy matching here. `Summer Copy` remains distinct,
 * while `Quote VO - Copy 2` resolves to `Quote VO`.
 *
 * Keep this helper narrow. Campaign/ad-set hierarchy may retain distinct Meta ad
 * IDs; performance rollups can safely group rows after their names are canonical.
 */
const COPY_SUFFIXES = [
  /\s*[-–—]\s*copy(?:\s+\d+)?$/i,
  /\s*\(copy(?:\s+\d+)?\)$/i,
];

export function canonicalCreativeName(value) {
  let name = String(value || '').replace(/\s+/g, ' ').trim();
  if (!name) return '';

  // Repeated duplication can create `Name - Copy - Copy 2`. Peel only recognized
  // terminal markers until the stable base name remains.
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of COPY_SUFFIXES) {
      const next = name.replace(suffix, '').trim();
      if (next && next !== name) {
        name = next;
        changed = true;
        break;
      }
    }
  }
  return name;
}

export function logicalCreativeKey(value) {
  return canonicalCreativeName(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function isCopyVariant(value) {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  return Boolean(raw && canonicalCreativeName(raw) !== raw);
}
