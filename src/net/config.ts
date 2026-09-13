/**
 * Relay server configuration and room code utility functions.
 *
 * Provides endpoints for multiplayer WebSocket signaling and deterministic
 * room code generation / validation.
 */

/** Default Cloudflare Worker relay URL for real-time room signaling. */
export const RELAY_URL = 'https://pikachu-duel-room.marcus-eng.workers.dev';

/** URL search parameter key used to override the relay URL in dev/testing. */
export const SERVER_QUERY_PARAM = 'server';

/** Room query parameter key used in invite links. */
export const ROOM_QUERY_PARAM = 'room';

/**
 * Character alphabet used for generating room codes.
 * Omits ambiguous lookalikes: 'O', '0', 'I', '1'.
 */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Default character length of a newly generated room code. */
export const CODE_LENGTH = 6;

/** Minimum allowed room code length for validation. */
export const MIN_ROOM_CODE_LENGTH = 4;

/** Maximum allowed room code length for validation. */
export const MAX_ROOM_CODE_LENGTH = 12;

/** Regular expression for validating alphanumeric room codes. */
const ROOM_CODE_REGEX = /^[A-Z0-9]{4,12}$/;

/**
 * Resolves the active relay WebSocket/HTTP URL.
 * Prefers the `?server=<url>` query param if specified, otherwise defaults to `RELAY_URL`.
 *
 * @returns The normalized relay base URL without trailing slashes.
 */
export function relayUrl(): string {
  if (typeof location === 'undefined') {
    return RELAY_URL;
  }
  const override = new URLSearchParams(location.search).get(SERVER_QUERY_PARAM);
  return (override || RELAY_URL).replace(/\/+$/, '');
}

/**
 * Checks whether a valid relay URL is configured and non-empty.
 *
 * @returns True if relay URL is defined and non-empty.
 */
export function isRelayConfigured(): boolean {
  return relayUrl() !== '';
}

/**
 * Generates a cryptographically random, human-dictatable room code.
 *
 * @returns An uppercase alphanumeric room code of length `CODE_LENGTH`.
 */
export function newRoomCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < CODE_LENGTH; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes)
    .map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length])
    .join('');
}

/**
 * Validates whether an arbitrary input string matches valid room code formatting.
 *
 * @param value - The input value to validate.
 * @returns True if `value` is a string of 4-12 alphanumeric characters.
 */
export function isRoomCode(value: unknown): value is string {
  return typeof value === 'string' && ROOM_CODE_REGEX.test(value.toUpperCase());
}

/**
 * Builds a shareable duel invitation URL containing the room code.
 * Preserves the `?server=` query parameter if present in the current location.
 *
 * @param code - The room code to append.
 * @returns The fully qualified invitation URL string.
 */
export function inviteLink(code: string): string {
  if (typeof location === 'undefined') {
    return `?${ROOM_QUERY_PARAM}=${encodeURIComponent(code)}`;
  }
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set(ROOM_QUERY_PARAM, code);
  const override = new URLSearchParams(location.search).get(SERVER_QUERY_PARAM);
  if (override) {
    url.searchParams.set(SERVER_QUERY_PARAM, override);
  }
  return url.toString();
}
