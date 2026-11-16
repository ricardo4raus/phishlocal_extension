import { BRANDS } from './brands';
import type { Host } from './domains';

/**
 * How two domains relate: the `same` company (same registrable domain, or two domains of one
 * listed brand such as paypal.de and paypal.com), the `same-name` with another ending
 * (shop.ch and shop.de: often the same company, sometimes a fake), or an `other` company.
 */
export function companyRelation(a: Host, b: Host): 'same' | 'same-name' | 'other' {
  const first = a.domain;
  const second = b.domain;
  if (first === second) return 'same';
  if (
    first &&
    second &&
    BRANDS.some((brand) => brand.domains.includes(first) && brand.domains.includes(second))
  ) {
    return 'same';
  }
  return a.label !== undefined && a.label === b.label ? 'same-name' : 'other';
}
