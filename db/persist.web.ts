/**
 * The web half of the persistence hooks. The real work lives in client.web.ts,
 * next to the database handle it serialises; this file only forwards, so that
 * callers can import from one place on both platforms.
 */

export { persist, flush } from './client.web';
