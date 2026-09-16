import React, { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react';
import { ClayTheme, THEMES } from './clay';
import { DEFAULTS, loadSettings, saveSettings, Settings } from '../lib/settings';
import { setSoundEnabled } from '../lib/sound';
import { setHapticsEnabled } from '../lib/haptics';
import { stringsFor, Strings } from '../i18n';

type Ctx = {
  theme: ClayTheme;
  /** Every visible string, already in the right language. */
  t: Strings;
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  /** False until the saved settings have come back from storage. */
  ready: boolean;
};

const ThemeContext = createContext<Ctx>({
  theme: THEMES[DEFAULTS.theme],
  t: stringsFor(DEFAULTS.language),
  settings: DEFAULTS,
  update: () => {},
  ready: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadSettings().then((saved) => {
      setSettings(saved);
      setSoundEnabled(saved.sound);
      setHapticsEnabled(saved.haptics);
      setReady(true);
    });
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      // These two live outside React so any module can fire a sound without
      // threading the settings through every component.
      if (patch.sound !== undefined) setSoundEnabled(patch.sound);
      if (patch.haptics !== undefined) setHapticsEnabled(patch.haptics);
      void saveSettings(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      theme: THEMES[settings.theme],
      t: stringsFor(settings.language),
      settings,
      update,
      ready,
    }),
    [settings, update, ready]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
