// Karte im Primundus-Look: weiß, 20 px Radius, feine warme Linie.
// ton „hinweis" = cremefarbener Kasten für den einen Hinweis im Bereich (z. B. „Noch 2 Minuten").
import type { HTMLAttributes, ReactNode } from 'react';

const TON = {
  standard: 'bg-white border border-[#EFEBE4]',
  hinweis: 'bg-[#FFFDF9] border border-[#EBE2D2]',
  hervorgehoben: 'bg-white border-[1.5px] border-[#CDBFA8]',
} as const;

export function Card({
  ton = 'standard', className = '', children, ...rest
}: { ton?: keyof typeof TON; className?: string; children: ReactNode } & Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'>) {
  return (
    <div {...rest} className={`rounded-card ${TON[ton]} ${className}`}>
      {children}
    </div>
  );
}
