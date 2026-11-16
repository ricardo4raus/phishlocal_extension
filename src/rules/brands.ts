/*
 * Real brands that phishing often imitates, with domains they really use. Without this list,
 * `paypa1.com` would only be caught when the email itself names paypal.com.
 *
 * This is reference data for the rules (nominative use). The sample emails still use made-up
 * brands only (see tests/samples.test.ts).
 */
export interface Brand {
  /** The name as it appears in a sender name, e.g. "PayPal". */
  name: string;
  /**
   * Domains the brand really uses. The first one is the main domain: lookalikes are measured
   * against it. The others only count as "belongs to the brand".
   */
  domains: readonly [string, ...string[]];
}

export const BRANDS: readonly Brand[] = [
  { name: 'PayPal', domains: ['paypal.com', 'paypal.de', 'paypal.ch', 'paypal.fr', 'paypal.es'] },
  {
    name: 'Google',
    domains: [
      'google.com',
      'google.ch',
      'google.de',
      'google.fr',
      'google.es',
      'googleusercontent.com',
      'gstatic.com',
      'youtube.com',
    ],
  },
  {
    name: 'Microsoft',
    domains: [
      'microsoft.com',
      'microsoftonline.com',
      'microsoft365.com',
      'office.com',
      'outlook.com',
      'live.com',
    ],
  },
  { name: 'Apple', domains: ['apple.com', 'icloud.com'] },
  {
    name: 'Amazon',
    domains: ['amazon.com', 'amazon.de', 'amazon.fr', 'amazon.es', 'amazon.co.uk'],
  },
  { name: 'Netflix', domains: ['netflix.com'] },
  { name: 'Facebook', domains: ['facebook.com', 'facebookmail.com'] },
  { name: 'Instagram', domains: ['instagram.com'] },
  { name: 'LinkedIn', domains: ['linkedin.com', 'lnkd.in'] },
  { name: 'DHL', domains: ['dhl.com', 'dhl.de', 'dhl.ch'] },
  { name: 'UPS', domains: ['ups.com'] },
  { name: 'FedEx', domains: ['fedex.com'] },
  { name: 'PostFinance', domains: ['postfinance.ch'] },
  { name: 'UBS', domains: ['ubs.com'] },
  { name: 'Swisscom', domains: ['swisscom.ch', 'swisscom.com'] },
  { name: 'Sparkasse', domains: ['sparkasse.de'] },
  { name: 'La Poste', domains: ['laposte.fr', 'laposte.net'] },
  { name: 'Correos', domains: ['correos.es'] },
];

/** Domains of all brands (also secondary ones), for "this belongs to a real brand". */
export const BRAND_DOMAINS: ReadonlySet<string> = new Set(BRANDS.flatMap((brand) => brand.domains));
