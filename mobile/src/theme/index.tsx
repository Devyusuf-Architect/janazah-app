// Theme context.
//
// Three states, matching the web app's prefs.js: follow the system, force
// light, force dark. The stored choice is device-local until a signed-in user
// has a preference document (Phase 4), at which point it becomes one of the
// synchronized preferences.

import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { palettes, type Palette, type Scheme } from './tokens';

export type ThemeChoice = 'system' | 'light' | 'dark';

const KEY = 'taziyah.appearance.theme';

type ThemeValue = {
  choice: ThemeChoice;
  scheme: Scheme;
  colors: Palette;
  setChoice: (next: ThemeChoice) => void;
};

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [choice, setChoiceState] = useState<ThemeChoice>('system');

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(KEY)
      .then((stored) => {
        if (cancelled) return;
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setChoiceState(stored);
        }
      })
      // Storage being unavailable is not an error worth showing anyone. The
      // default is the design's own, so the app looks correct either way.
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    AsyncStorage.setItem(KEY, next).catch(() => {});
  }, []);

  const value = useMemo<ThemeValue>(() => {
    const scheme: Scheme = choice === 'system'
      ? (system === 'dark' ? 'dark' : 'light')
      : choice;
    return { choice, scheme, colors: palettes[scheme], setChoice };
  }, [choice, system, setChoice]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme called outside ThemeProvider');
  return value;
}

/** Shorthand, since almost every component wants only the palette. */
export const useColors = (): Palette => useTheme().colors;

export * from './tokens';
