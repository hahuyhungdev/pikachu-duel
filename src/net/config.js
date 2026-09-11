/**
 * Where the relay lives.
 *
 * RELAY_URL is filled in once the Worker is deployed. Until then, and for
 * testing against a local `wrangler dev`, the page accepts ?server=<url>.
 */

export const RELAY_URL = '';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no O/0/I/1 to keep codes dictatable
export const CODE_LENGTH = 6;

export function relayUrl() {
  const override = new URLSearchParams(location.search).get('server');
  return (override || RELAY_URL).replace(/\/+$/, '');
}

export function isRelayConfigured() {
  return relayUrl() !== '';
}

export function newRoomCode() {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export function isRoomCode(value) {
  return typeof value === 'string' && /^[A-Z0-9]{4,12}$/.test(value.toUpperCase());
}

/** The link to hand to the other player. */
export function inviteLink(code) {
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('room', code);
  const override = new URLSearchParams(location.search).get('server');
  if (override) url.searchParams.set('server', override);
  return url.toString();
}
