/*
 * Pressure phrases in English, German, French and Spanish: time pressure, threats, requests for
 * log-in or card details, and payment requests.
 *
 * Phrases, not single words: "password" alone would also flag a harmless "we will never ask for
 * your password". One finding per category, with the phrases found as evidence.
 */
import type { Email } from '../email';
import { clip, type Finding, type RuleId, type Severity } from './types';
import { normalizeText, wordsPattern } from './words';

interface Category {
  rule: Extract<RuleId, 'urgency' | 'threat' | 'credentials' | 'payment'>;
  severity: Severity;
  message: string;
  /** Lowercase phrases; whitespace matches any whitespace. */
  phrases: { en: string[]; de: string[]; fr: string[]; es: string[] };
}

const CATEGORIES: readonly Category[] = [
  {
    rule: 'urgency',
    severity: 'info',
    message: 'The email creates time pressure',
    phrases: {
      en: [
        'urgent',
        'urgently',
        'immediately',
        'act now',
        'right away',
        'as soon as possible',
        'within 12 hours',
        'within 24 hours',
        'within 48 hours',
        'today only',
        'expires today',
        'final notice',
        'final reminder',
        'last warning',
        'last chance',
      ],
      de: [
        'dringend',
        'sofort',
        'umgehend',
        'unverzüglich',
        'innerhalb von 12 stunden',
        'innerhalb von 24 stunden',
        'innerhalb von 48 stunden',
        'heute noch',
        'noch heute',
        'nur heute',
        'letzte mahnung',
        'letzte warnung',
        'letzte chance',
        'letzte erinnerung',
      ],
      fr: [
        'urgent',
        'urgente',
        'immédiatement',
        'sans délai',
        'dès que possible',
        'dans les 24 heures',
        'dans les 48 heures',
        'sous 24 heures',
        'sous 48 heures',
        "aujourd'hui seulement",
        'dernier avertissement',
        'dernier rappel',
        'dernière chance',
      ],
      es: [
        'urgente',
        'inmediatamente',
        'de inmediato',
        'lo antes posible',
        'en 24 horas',
        'en 48 horas',
        'en las próximas 24 horas',
        'en las próximas 48 horas',
        'solo hoy',
        'último aviso',
        'última advertencia',
        'última oportunidad',
      ],
    },
  },
  {
    rule: 'threat',
    severity: 'info',
    message: 'The email threatens consequences',
    phrases: {
      en: [
        'account has been locked',
        'account is locked',
        'account will be closed',
        'closed permanently',
        'account has been suspended',
        'account will be suspended',
        'unusual activity',
        'suspicious activity',
        'unauthorized access',
        'legal action',
        'will be deleted',
        'permanently deleted',
        'returned to the sender',
      ],
      de: [
        'konto wurde gesperrt',
        'konto gesperrt',
        'konto wird gesperrt',
        'konto wird geschlossen',
        'dauerhaft gesperrt',
        'wird gelöscht',
        'endgültig gelöscht',
        'ungewöhnliche aktivität',
        'ungewöhnliche aktivitäten',
        'verdächtige aktivität',
        'verdächtige aktivitäten',
        'unbefugter zugriff',
        'rechtliche schritte',
        'an den absender zurückgeschickt',
        'an den absender zurückgesendet',
      ],
      fr: [
        'compte a été bloqué',
        'compte bloqué',
        'compte sera bloqué',
        'compte sera fermé',
        'compte a été suspendu',
        'compte suspendu',
        'activité inhabituelle',
        'activité suspecte',
        'accès non autorisé',
        'poursuites judiciaires',
        'sera supprimé',
        "retourné à l'expéditeur",
      ],
      es: [
        'cuenta ha sido bloqueada',
        'cuenta bloqueada',
        'cuenta será bloqueada',
        'cuenta será cerrada',
        'cuenta ha sido suspendida',
        'cuenta suspendida',
        'actividad inusual',
        'actividad sospechosa',
        'acceso no autorizado',
        'acciones legales',
        'será eliminada',
        'devuelto al remitente',
      ],
    },
  },
  {
    rule: 'credentials',
    severity: 'warning',
    message: 'The email asks you to confirm your identity, log-in or card details',
    phrases: {
      en: [
        'confirm your identity',
        'verify your identity',
        'confirm your account',
        'verify your account',
        'confirm your password',
        'verify your password',
        'update your password',
        'enter your password',
        'enter your login details',
        'confirm your login details',
        'update your login details',
        'update your payment details',
        'update your billing information',
        'confirm your card details',
        'enter your card number',
        'enter your security code',
      ],
      de: [
        'identität bestätigen',
        'bestätigen sie ihre identität',
        'identität verifizieren',
        'konto bestätigen',
        'bestätigen sie ihr konto',
        'konto verifizieren',
        'passwort bestätigen',
        'passwort eingeben',
        'zugangsdaten bestätigen',
        'geben sie ihre zugangsdaten',
        'zahlungsdaten aktualisieren',
        'kartennummer eingeben',
        'geben sie ihre kartennummer',
      ],
      fr: [
        'confirmer votre identité',
        'confirmez votre identité',
        'vérifier votre identité',
        'vérifiez votre identité',
        'confirmez votre compte',
        'vérifier votre compte',
        'vérifiez votre compte',
        'confirmez votre mot de passe',
        'saisissez votre mot de passe',
        'confirmez vos identifiants',
        'saisissez vos identifiants',
        'saisissez votre numéro de carte',
        'saisissez le code de sécurité',
      ],
      es: [
        'confirme su identidad',
        'confirmar su identidad',
        'verifique su identidad',
        'verificar su identidad',
        'confirme su cuenta',
        'verifique su cuenta',
        'verificar su cuenta',
        'confirme su contraseña',
        'introduzca su contraseña',
        'confirme sus datos de acceso',
        'introduzca su número de tarjeta',
        'introduzca el código de seguridad',
      ],
    },
  },
  {
    rule: 'payment',
    severity: 'warning',
    message: 'The email asks for a payment',
    phrases: {
      en: [
        'payment required',
        'outstanding payment',
        'outstanding fee',
        'unpaid invoice',
        'customs fee',
        'delivery fee',
        'pay now',
        'pay the fee',
        'pay with a gift card',
        'make a wire transfer',
        'pay in bitcoin',
      ],
      de: [
        'zollgebühr',
        'zollgebühren',
        'versandgebühr',
        'zustellgebühr',
        'jetzt bezahlen',
        'jetzt zahlen',
        'bezahlen sie heute',
        'offene rechnung',
        'offener betrag',
        'mit einer geschenkkarte bezahlen',
        'mit gutscheinkarten bezahlen',
        'in bitcoin bezahlen',
      ],
      fr: [
        'frais de douane',
        'frais de livraison',
        'payer maintenant',
        'payez maintenant',
        'facture impayée',
        'paiement en attente',
        'payer avec une carte cadeau',
        'effectuez un virement',
        'payer en bitcoin',
      ],
      es: [
        'tasa de aduana',
        'gastos de aduana',
        'gastos de envío',
        'pagar ahora',
        'pague ahora',
        'factura pendiente',
        'pago pendiente',
        'pagar con una tarjeta regalo',
        'realice una transferencia',
        'pagar en bitcoin',
      ],
    },
  },
];

/** At most this many phrases are listed per category. */
const MAX_PHRASES_SHOWN = 5;

const patterns = CATEGORIES.map((category) => ({
  category,
  pattern: wordsPattern([...new Set(Object.values(category.phrases).flat())]),
}));

/** All phrases, for tests (e.g. that each one is lowercase and matches itself). */
export const ALL_PHRASES: readonly string[] = CATEGORIES.flatMap((category) =>
  Object.values(category.phrases).flat(),
);

export function checkPhrases(email: Pick<Email, 'subject' | 'bodyText'>): Finding[] {
  const text = normalizeText(`${email.subject}\n${email.bodyText}`);
  return patterns.flatMap(({ category, pattern }): Finding[] => {
    const found = [...new Set(Array.from(text.matchAll(pattern), ([match]) => match))];
    if (found.length === 0) return [];
    const shown = found.slice(0, MAX_PHRASES_SHOWN).map(clip);
    return [
      {
        rule: category.rule,
        severity: category.severity,
        message: `${category.message}: ${shown.map((phrase) => `"${phrase}"`).join(', ')}.`,
        evidence: shown,
      },
    ];
  });
}
