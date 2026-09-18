/**
 * Checks for releaseNotes. Run it with:
 *
 *     npx tsx src/lib/updates.test.ts
 *
 * Parsing someone else's text into a banner is a quiet place for a bug: get it
 * wrong and the app shows a SHA-256 where the explanation should be, or shows
 * nothing at all, and neither looks like a failure from the outside.
 *
 * The bodies below are real ones, copied from the releases page.
 */

import { releaseNotes } from './releaseNotes';

let pass = 0;
let fail = 0;

function is(label: string, got: unknown, want: unknown) {
  const ok = got === want;
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) {
    console.log(`        got:  ${JSON.stringify(got)}`);
    console.log(`        want: ${JSON.stringify(want)}`);
  }
}

// v1.0.17 as it actually reads today.
const withChangelog = [
  'Your pairing secret no longer travels over the network. Each request is signed',
  'with it instead, so anyone watching learns nothing they can reuse.',
  '',
  'Requests from outside your local network are now refused outright.',
  '',
  'Android APK built from `666f663`.',
  '',
  'Download **reveille.apk** below and open it on your phone to install.',
  'It installs over any earlier version and keeps your saved PCs.',
  '',
  '- Size: 38 MB',
  '- Needs a 64-bit ARM phone (anything from roughly 2017 onwards)',
  '- SHA-256: `9f2c...`',
].join('\n');

// v1.0.16 and earlier: no changelog, only the build block.
const withoutChangelog = [
  'Android APK built from `49bbb36`.',
  '',
  'Download **reveille.apk** below and open it on your phone to install.',
  '',
  '- Size: 38 MB',
  '- SHA-256: `aa11...`',
].join('\n');

console.log('=== a release with a changelog ===');
{
  const notes = releaseNotes(withChangelog);
  is('keeps the first line', notes.startsWith('Your pairing secret no longer travels'), true);
  is('keeps the second paragraph', notes.includes('refused outright'), true);
  is('drops the build block', notes.includes('Android APK built from'), false);
  is('drops the download line', notes.includes('reveille.apk'), false);
  is('drops the size', notes.includes('38 MB'), false);
  is('drops the checksum', notes.includes('SHA-256'), false);
  is('no trailing blank lines', notes, notes.trim());
}

console.log('\n=== a release from before changelogs existed ===');
{
  const notes = releaseNotes(withoutChangelog);
  is('produces nothing rather than build details', notes, '');
}

console.log('\n=== markdown that would show as literal characters ===');
{
  is('bold is unwrapped', releaseNotes('A **bold** word'), 'A bold word');
  is('code ticks are removed', releaseNotes('Run `npm test` now'), 'Run npm test now');
  is(
    'both together',
    releaseNotes('**Important:** run `setup.ps1`'),
    'Important: run setup.ps1'
  );
}

console.log('\n=== things GitHub could hand over instead of a string ===');
{
  is('null', releaseNotes(null), '');
  is('undefined', releaseNotes(undefined), '');
  is('a number', releaseNotes(42), '');
  is('an object', releaseNotes({ body: 'x' }), '');
  is('an empty string', releaseNotes(''), '');
  is('only whitespace', releaseNotes('   \n\n  '), '');
}

console.log('\n=== hard wrapping is undone, paragraphs are kept ===');
{
  const wrapped = [
    'Your pairing secret no longer travels over the network. Each request is',
    'signed with it instead, so anyone watching learns nothing.',
    '',
    'Requests from outside your local network are now refused.',
  ].join('\n');
  const notes = releaseNotes(wrapped);
  is(
    'the paragraph becomes one line',
    notes.split('\n')[0],
    'Your pairing secret no longer travels over the network. Each request is signed with it instead, so anyone watching learns nothing.'
  );
  is('the blank line survives as a paragraph break', notes.split('\n\n').length, 2);
  is('joining introduced no double spaces', /  /.test(notes), false);
}

console.log('\n=== a list keeps its line breaks ===');
{
  const list = [
    'What changed:',
    '',
    '- Wake is faster',
    '- Lock works again',
    '* Also this',
    '1. And this',
  ].join('\n');
  const notes = releaseNotes(list);
  is('dash bullets stay on their own lines', notes.includes('- Wake is faster\n- Lock works again'), true);
  is('star bullets stay too', notes.includes('\n* Also this'), true);
  is('numbered items stay too', notes.includes('\n1. And this'), true);
}

console.log('\n=== line endings ===');
{
  is(
    'CRLF is normalised, and the wrap undone with it',
    releaseNotes('One line\r\nAnother line\r\n\r\nAndroid APK built from `x`.'),
    'One line Another line'
  );
}

console.log('\n=== the marker only counts at the start of a line ===');
{
  const body = 'We changed how the Android APK built from source works.\n\nAndroid APK built from `x`.';
  const notes = releaseNotes(body);
  is('a mention mid-sentence is kept', notes.includes('how the Android APK built from source works'), true);
  is('the real block is still dropped', notes.includes('`x`'), false);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
