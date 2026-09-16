import { getLocales } from 'expo-localization';
import { en, nl, Strings } from './strings';

/**
 * Follows the phone unless someone picks a language explicitly, which is what
 * people expect and means most users never see a language setting at all.
 */

export type LanguageCode = 'en' | 'nl';
export type LanguageChoice = LanguageCode | 'system';

const DICTIONARIES: Record<LanguageCode, Strings> = { en, nl };

export const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  en: 'English',
  nl: 'Nederlands',
};

/** What the phone is set to, if it is a language we actually have. */
export function deviceLanguage(): LanguageCode {
  try {
    for (const locale of getLocales()) {
      const code = (locale.languageCode ?? '').toLowerCase();
      if (code in DICTIONARIES) return code as LanguageCode;
    }
  } catch {
    // Localization can fail on odd devices; English is a safe floor.
  }
  return 'en';
}

export function resolveLanguage(choice: LanguageChoice): LanguageCode {
  return choice === 'system' ? deviceLanguage() : choice;
}

export function stringsFor(choice: LanguageChoice): Strings {
  return DICTIONARIES[resolveLanguage(choice)];
}

export type { Strings };
