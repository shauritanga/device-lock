import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Crumb } from '../components/Breadcrumbs';

type TrailState = { trail: Crumb[] | null; setTrail: (t: Crumb[] | null) => void };

const TrailContext = createContext<TrailState>({ trail: null, setTrail: () => {} });

/** Holds the breadcrumb trail the current page declared; the top bar renders it. */
export function PageTrailProvider({ children }: { children: ReactNode }) {
  const [trail, setTrail] = useState<Crumb[] | null>(null);
  const value = useMemo(() => ({ trail, setTrail }), [trail]);
  return <TrailContext.Provider value={value}>{children}</TrailContext.Provider>;
}

/** The trail the page declared, or null on top-level pages. */
export function usePageTrailValue(): Crumb[] | null {
  return useContext(TrailContext).trail;
}

/**
 * Declare the breadcrumb for a drill-down page, e.g.
 *   usePageTrail([{ label: 'Cases', to: '/cases' }, { label: customerName }]);
 * The last crumb is the current page. It replaces the page title in the top bar
 * and is cleared automatically when the page unmounts.
 */
export function usePageTrail(items: Crumb[] | null) {
  const { setTrail } = useContext(TrailContext);
  const key = JSON.stringify(items);
  useEffect(() => {
    setTrail(items);
    return () => setTrail(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
