/**
 * Turns whatever the network layer threw into something worth reading.
 *
 * "fetch failed: Fetch request has been canceled" is technically accurate and
 * tells you nothing you can act on. Every message here names the likely cause
 * and, where there is one, the thing to try.
 */

import type { Strings } from '../i18n';

export type Explained = {
  title: string;
  message: string;
};

export function explain(
  err: unknown,
  t: Strings,
  context: 'reach' | 'action' = 'action'
): Explained {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const lower = raw.toLowerCase();

  // AbortController firing our own timeout. By far the most common failure,
  // and the one whose default wording is least helpful.
  if (lower.includes('abort') || lower.includes('cancel')) {
    return {
      title: t.errNoAnswerTitle,
      message: context === 'reach' ? t.errNoAnswerReach : t.errNoAnswerAction,
    };
  }

  if (lower.includes('network request failed') || lower.includes('failed to fetch')) {
    return { title: t.errUnreachableTitle, message: t.errUnreachableBody };
  }

  if (lower.includes('401') || lower.includes('unauthorized')) {
    return { title: t.errTokenTitle, message: t.errTokenBody };
  }

  if (lower.includes('econnrefused') || lower.includes('connection refused')) {
    return { title: t.errRefusedTitle, message: t.errRefusedBody };
  }

  if (lower.includes('not set up') || lower.includes('install-firmware')) {
    return { title: t.errNotSetUp, message: raw };
  }

  return {
    title: t.errGenericTitle,
    // Strip the "fetch failed: " prefix React Native likes to add.
    message: raw.replace(/^fetch failed:\s*/i, '') || t.errGenericBody,
  };
}
