'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/shared/lib/utils';

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  /** Stagger multiple Reveals in the same section by passing 0, 1, 2… */
  delay?: number;
}

/**
 * Fades + slides content in the first time it scrolls into view. Plain
 * IntersectionObserver rather than a motion library — this page is the
 * only place in the app that needs scroll-triggered animation, so a
 * dependency wasn't worth adding for it.
 */
export function Reveal({ children, className, delay = 0 }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        'transition-all duration-700 ease-out motion-reduce:transition-none',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6',
        className
      )}
      style={{ transitionDelay: `${delay * 90}ms` }}
    >
      {children}
    </div>
  );
}
