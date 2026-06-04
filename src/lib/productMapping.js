export function normalizeProductText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function productTaxonomyForName(value) {
  const text = normalizeProductText(value);
  if (!text) return { family: 'unknown_product', subtype: 'unknown_product' };
  if (['tip', 'shipping', 'post card'].includes(text)) return { family: null, subtype: null };

  const hasSkirt = /skirt|skit|تنورة/.test(text);
  const hasKuffiyah = /kuffiyah|kuffiya|kuffiyeh|kufiya|keffiyeh/.test(text);
  const hasZaytoun = /zaytoun|zaytoon|zaitoun|olive|زيتون/.test(text);
  const hasQuoteCrewneck = /quote\s*(vo|crewneck)|\bvo\b/.test(text);
  const hasGhalabany = /ghalabany|ghalabny|ghalabni|al shawq|al shawq|غلبني|الشوق/.test(text);
  const hasNinetyEight = /\b98\b|vescarts?\s*98|vescartes?\s*98/.test(text);
  const hasCrewneck = /crew\s*neck|crewneck/.test(text);
  const hasHoodie = /hoodie/.test(text);
  const hasLongSleeve = /long\s*sleeve/.test(text);
  const hasShortSleeve = /short\s*sleeve|t\s*shirt|t-shirt|tee\b|blurry\s*shirt|\bshirt\b/.test(text);
  const hasDenimPants = /(denim|pants|jeans)/.test(text) && !hasSkirt;

  if (hasSkirt || (hasKuffiyah && /engraved|denim/.test(text))) {
    if (hasZaytoun) return { family: 'Skirts', subtype: 'Zaytoun skirt' };
    if (hasKuffiyah) return { family: 'Skirts', subtype: 'Kuffiyah skirt' };
    return { family: 'Skirts', subtype: 'Other skirt' };
  }

  if (hasQuoteCrewneck) return { family: 'Crewnecks', subtype: 'Quote crewneck' };
  if (hasHoodie) return { family: 'Hoodies', subtype: hasGhalabany ? 'Ghalabany Al-ShawQ hoodie' : 'Other hoodie' };
  if (hasNinetyEight) return { family: 'Crewnecks', subtype: 'Vescartes 98 crewneck' };
  if (hasLongSleeve) return { family: 'Tops', subtype: 'Long sleeve' };
  if (hasShortSleeve) return { family: 'Tops', subtype: 'Short sleeve' };
  if (hasDenimPants) return { family: 'Denim pants', subtype: 'Denim pants' };
  if (hasCrewneck) return { family: 'Crewnecks', subtype: hasGhalabany ? 'Ghalabany Al-ShawQ crewneck' : 'Other crewneck' };
  if (/al\s*madaan|madaan|mada.?en|madain|almad|mad2en|mada2en/.test(text)) return { family: 'Al Madaan', subtype: 'Al Madaan' };
  if (hasKuffiyah) return { family: 'Kuffiyah accessory', subtype: 'Kuffiyah accessory' };
  if (/art\s*frame|art-frame/.test(text)) return { family: 'Art-frame', subtype: 'Art-frame' };

  return { family: 'unknown_product', subtype: 'unknown_product' };
}

export function productFamilyForName(value) {
  return productTaxonomyForName(value).family;
}

export function productSubtypeForName(value) {
  return productTaxonomyForName(value).subtype;
}
