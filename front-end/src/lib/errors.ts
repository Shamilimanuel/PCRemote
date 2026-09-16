/**
 * Turns whatever the network layer threw into something worth reading.
 *
 * "fetch failed: Fetch request has been canceled" is technically accurate and
 * tells you nothing you can act on. Every message here names the likely cause
 * and, where there is one, the thing to try.
 */

export type Explained = {
  title: string;
  message: string;
};

export function explain(err: unknown, context: 'reach' | 'action' = 'action'): Explained {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const lower = raw.toLowerCase();

  // AbortController firing our own timeout. By far the most common failure,
  // and the one whose default wording is least helpful.
  if (lower.includes('abort') || lower.includes('cancel')) {
    return {
      title: 'No answer',
      message:
        context === 'reach'
          ? 'Your PC didn’t reply. It may be asleep, switched off, or not running the agent yet.'
          : 'Your PC didn’t reply in time. It may have gone to sleep.',
    };
  }

  if (lower.includes('network request failed') || lower.includes('failed to fetch')) {
    return {
      title: 'Can’t reach it',
      message:
        'Nothing answered at that address. Check your phone is on the same Wi-Fi as the PC, and that the address is right.',
    };
  }

  if (lower.includes('401') || lower.includes('unauthorized')) {
    return {
      title: 'Wrong token',
      message:
        'The PC answered but refused the token. Run the pairing command again and scan the new code.',
    };
  }

  if (lower.includes('econnrefused') || lower.includes('connection refused')) {
    return {
      title: 'Nothing listening',
      message:
        'The PC is on the network but nothing is listening on that port. The agent probably isn’t running.',
    };
  }

  if (lower.includes('not set up') || lower.includes('install-firmware')) {
    return { title: 'Not set up', message: raw };
  }

  return {
    title: 'That didn’t work',
    // Strip the "fetch failed: " prefix React Native likes to add.
    message: raw.replace(/^fetch failed:\s*/i, '') || 'Something went wrong.',
  };
}
