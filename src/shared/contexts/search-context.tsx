'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { GlobalSearch } from '@/shared/components/search/global-search';

interface SearchContextValue {
  openSearch: () => void;
}

const SearchContext = createContext<SearchContextValue | null>(null);

/**
 * Owns the global search dialog's open state and the Ctrl/Cmd+K shortcut
 * once, at the app shell level, so any page (e.g. the Operations Center's
 * own header) can trigger the same shared search UI without each page
 * mounting its own dialog instance.
 */
export function SearchProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <SearchContext.Provider value={{ openSearch: () => setOpen(true) }}>
      {children}
      <GlobalSearch open={open} onOpenChange={setOpen} />
    </SearchContext.Provider>
  );
}

export function useSearchContext(): SearchContextValue {
  const ctx = useContext(SearchContext);
  if (!ctx) {
    throw new Error('useSearchContext must be used within a SearchProvider');
  }
  return ctx;
}
