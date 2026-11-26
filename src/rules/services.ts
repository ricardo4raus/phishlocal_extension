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
  'kmail-lists.com', // Klaviyo (subscription pages)
  'rs6.net', // Constant Contact
]);

/**
 * Click-tracking services that put the real target in the link's path, e.g.
 * `x.r.eu-west-1.awstrack.me/L0/https:%2F%2Fshop.example/…` (Amazon SES). The service itself
 * redirects there, so that target counts as the link's final target, like a forwarding parameter.
 */
const PATH_FORWARD_DOMAINS: ReadonlySet<string> = new Set(['awstrack.me']);

export const forwardsByPath = (domain: string | undefined): boolean =>
  domain !== undefined && PATH_FORWARD_DOMAINS.has(domain);

/**
 * Platforms that send emails for their customers' shops and businesses (invoices, order
 * confirmations), with Reply-To set to the shop. A Reply-To elsewhere is normal for them when
 * the platform's own domain is confirmed (DMARC pass).
 */
export const SENDING_PLATFORMS: ReadonlySet<string> = new Set([
  'stripe.com', // Stripe invoices and receipts
  'shopifyemail.com', // Shopify stores
]);

/**
 * Free email providers: anyone can send from them, and DMARC confirms only the provider. A
 * sender there is no company, so no other domain counts as its own (`linksLeaveSender`).
 */
export const FREE_MAIL_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'yahoo.com',
  'icloud.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.ch',
  'gmx.de',
  'gmx.net',
  'web.de',
  'bluewin.ch',
]);

/**
 * Domains that real emails of any sender link to besides their own: social networks, app
 * stores, and the click tracking of mailing services. A link there does not take the reader
 * away from the sender in a way that matters for phishing.
 */
const COMMON_LINK_DOMAINS: ReadonlySet<string> = new Set([
  'facebook.com',
  'instagram.com',
  'youtube.com',
  'linkedin.com',
  'twitter.com',
  'x.com',
  'tiktok.com',
  'xing.com',
  'pinterest.com',
  'reddit.com',
  'apple.com',
  'appsflyer.com',
  'huawei.com',
]);

export const isCommonLinkDomain = (domain: string): boolean =>
  COMMON_LINK_DOMAINS.has(domain) ||
  MAILING_SERVICES.has(domain) ||
  PATH_FORWARD_DOMAINS.has(domain);
