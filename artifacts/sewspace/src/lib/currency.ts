// Prices on pattern pages are stored in the page's own currency and shown as
// they are: nothing is converted (live exchange rates would need an outside
// service, which the owner hasn't approved). When someone adds a page, the
// currency starts on the one for their browser's region (from its language
// setting: no location lookup, nothing sent or stored), else AUD.

export const CURRENCIES = ['AUD', 'NZD', 'USD', 'CAD', 'GBP', 'EUR', 'CHF', 'SEK', 'NOK', 'DKK', 'JPY', 'SGD', 'HKD', 'INR', 'ZAR'] as const;

const EURO = 'AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK'.split(' ');
const BY_REGION: Record<string, string> = {
  AU: 'AUD', NZ: 'NZD', US: 'USD', CA: 'CAD', GB: 'GBP', CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK',
  JP: 'JPY', SG: 'SGD', HK: 'HKD', IN: 'INR', ZA: 'ZAR', ...Object.fromEntries(EURO.map(r => [r, 'EUR'])),
};

export function defaultCurrency(): string {
  try {
    for (const tag of navigator.languages?.length ? navigator.languages : [navigator.language]) {
      const region = new Intl.Locale(tag).maximize().region;
      if (region && BY_REGION[region]) return BY_REGION[region];
    }
  } catch {
    // Unusual language tags: fall back.
  }
  return 'AUD';
}

/** "$16", "$12.50", "£9": the narrow symbol, in the page's currency. */
export function formatPrice(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(cents % 100 ? 2 : 0)} ${currency}`;
  }
}
