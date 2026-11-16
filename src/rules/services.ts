/*
 * Services that legitimate emails route links through. Real emails use them all the time, so
 * the rules treat them differently from an unknown domain.
 */

/**
 * Redirect and link-protection services. A link through one hides its final target, so a
 * mismatch with the link text is only a note (Google's own emails link through `c.gle`).
 */
const REDIRECT_HOSTS = [
  'c.gle',
  't.co',
  'bit.ly',
  'tinyurl.com',
  'ow.ly',
  'lnkd.in',
  'safelinks.protection.outlook.com',
  'urldefense.com',
  'urldefense.proofpoint.com',
];

export const isRedirect = (hostname: string): boolean =>
  REDIRECT_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));

/**
 * Mailing services (registrable domains) that build click-tracking hosts with their customer's
 * name in front, e.g. `shop.us14.list-manage.com` for a newsletter from shop.example. The
 * email's own name there is normal; a real brand's name is not, because anyone can open an
 * account under any name.
 */
export const MAILING_SERVICES: ReadonlySet<string> = new Set([
  'list-manage.com', // Mailchimp
  'mcsv.net', // Mailchimp
  'mandrillapp.com', // Mailchimp Transactional
  'sendgrid.net', // Twilio SendGrid
  'mailgun.org',
  'sparkpostmail.com',
  'hubspotlinks.com',
  'exacttarget.com', // Salesforce Marketing Cloud
  'mjt.lu', // Mailjet
  'klclick.com', // Klaviyo
  'rs6.net', // Constant Contact
]);
