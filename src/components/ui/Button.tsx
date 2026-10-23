// Knöpfe im Primundus-Look (Portal-Redesign 24.09.2026), wie primundus.de und Kostenrechner:
// Koralle = Hauptaktion (eine pro Bereich), Umriss = zweitrangig, Link = Textaktion.
// Mindestens 44 px Tippfläche, Hauptknöpfe 52 px.
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';

type Variante = 'primaer' | 'sekundaer' | 'whatsapp' | 'link';
type Groesse = 'md' | 'sm';

const BASIS =
  'inline-flex items-center justify-center gap-2 text-center leading-tight rounded-full font-bold transition-colors ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-taupe ' +
  'disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.99]';

const VARIANTE: Record<Variante, string> = {
  primaer: 'bg-pm-coral hover:bg-pm-coral-deep text-white',
  sekundaer: 'bg-white border-[1.5px] border-pm-chip text-pm-taupe-ink hover:border-pm-taupe',
  whatsapp: 'bg-pm-whatsapp hover:bg-[#1FBA59] text-white',
  link: 'bg-transparent text-pm-taupe-ink underline underline-offset-4 decoration-pm-taupe/40 hover:decoration-pm-taupe-ink rounded-md font-semibold',
};

const GROESSE: Record<Groesse, string> = {
  md: 'min-h-[52px] px-6 text-[17px]',
  sm: 'min-h-[44px] px-5 text-[15px]',
};

type Gemeinsam = {
  variante?: Variante;
  groesse?: Groesse;
  breit?: boolean;
  laedt?: boolean;
  ladeText?: string;
  className?: string;
  children: ReactNode;
};

type AlsKnopf = Gemeinsam & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> & { href?: undefined };
type AlsLink = Gemeinsam & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'children'> & { href: string };

export function Button(props: AlsKnopf | AlsLink) {
  const { variante = 'primaer', groesse = 'md', breit = false, laedt = false, ladeText, className = '', children, ...rest } = props;
  const klassen = `${BASIS} ${VARIANTE[variante]} ${variante === 'link' ? 'min-h-[44px] px-1' : GROESSE[groesse]} ${breit ? 'w-full' : ''} ${className}`;
  if (props.href !== undefined) {
    return (
      <a {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)} className={klassen}>
        {children}
      </a>
    );
  }
  const { type = 'button', disabled, ...knopf } = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button {...knopf} type={type} disabled={disabled || laedt} className={klassen}>
      {laedt && ladeText ? ladeText : children}
    </button>
  );
}
