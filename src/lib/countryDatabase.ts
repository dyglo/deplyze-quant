

/** Reliable flag image URL via flagcdn.com */
export function countryFlagUrl(isoCode: string, size: 20 | 40 | 80 = 20): string {
  return `https://flagcdn.com/w${size}/${isoCode.toLowerCase()}.png`;
}
