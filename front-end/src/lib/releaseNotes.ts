/**
 * Pulls the human part out of a GitHub release body.
 *
 * The build workflow writes a release as the changelog first, then a fixed
 * block of build details -- the commit it came from, the download line, the
 * size and the SHA-256. That block is for someone standing on the releases
 * page, not for a banner on a phone, so everything from it onwards is dropped.
 *
 * Releases from before changelogs existed are *only* that block, which leaves
 * nothing -- and nothing is the right answer. Better the app's own generic
 * line than a checksum where the explanation should be.
 *
 * Its own file, importing nothing, so it can be tested without a phone: the
 * module that uses it reaches expo-application and therefore the whole of
 * React Native, which no test runner here can load.
 */

/** Where the workflow's build details begin. Only counts at the start of a line. */
const BUILD_BLOCK = /^Android APK built from/m;

export function releaseNotes(body: unknown): string {
  if (typeof body !== 'string') return '';

  const normalised = body.replace(/\r\n/g, '\n');
  const marker = normalised.search(BUILD_BLOCK);
  const human = marker === -1 ? normalised : normalised.slice(0, marker);

  return (
    human
      // A react-native Text shows markdown as literal characters, so the two
      // kinds the workflow emits are unwrapped rather than displayed raw.
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      // The changelog files are hard-wrapped near 78 columns, which is right for
      // a text file and wrong for a phone: Text re-wraps to the screen anyway,
      // so keeping those breaks leaves every other line half empty. Single
      // newlines become spaces and blank lines stay as paragraph breaks.
      //
      // List items are left alone -- a line starting with a bullet or a number
      // is a break the author meant.
      .replace(/([^\n])\n(?![\n\s]|[-*•]\s|\d+[.)]\s)/g, '$1 ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}
