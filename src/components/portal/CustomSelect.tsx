import { useState, useEffect, useRef } from 'react';
import type { FC } from 'react';
import { ChevronDown } from 'lucide-react';

export const CustomSelect: FC<{
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}> = ({ value, onChange, options, placeholder = 'Bitte wählen' }) => {
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleOpen = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setDropdownStyle({
        position: 'fixed',
        top: r.bottom + 4,
        left: r.left,
        width: r.width,
        zIndex: 9999,
      });
    }
    setOpen(o => !o);
  };

  useEffect(() => {
    if (!open) return;
    // Close on outside-click. Dropdown menu lives in a position:fixed
    // overlay that is NOT inside btnRef, so we must check both refs —
    // otherwise mousedown on an option fires this listener first,
    // setOpen(false) unmounts the menu, and the option's onClick never
    // gets dispatched (silent select bug).
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      const inButton = btnRef.current?.contains(target);
      const inDropdown = dropdownRef.current?.contains(target);
      if (!inButton && !inDropdown) {
        setOpen(false);
      }
    };
    const updatePos = () => {
      if (btnRef.current) {
        const r = btnRef.current.getBoundingClientRect();
        setDropdownStyle({ position: 'fixed', top: r.bottom + 4, left: r.left, width: r.width, zIndex: 9999 });
      }
    };
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={e => { e.stopPropagation(); handleOpen(); }}
        className={`w-full border rounded-xl px-3 py-2.5 text-base text-left flex items-center justify-between gap-2 transition-all bg-white ${
          open ? 'border-[#8B7355] ring-2 ring-[#8B7355]/10' : 'border-gray-300'
        } ${value ? 'text-gray-800' : 'text-gray-400'}`}
      >
        <span className="truncate">{value || placeholder}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div ref={dropdownRef} style={dropdownStyle} className="bg-white border border-gray-200 rounded-xl shadow-xl overflow-y-auto max-h-48">
          {options.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={e => { e.stopPropagation(); onChange(opt); setOpen(false); }}
              className={`w-full text-left px-4 py-2.5 text-base transition-colors ${
                opt === value
                  ? 'bg-[#F5F1EA] text-[#8B7355] font-semibold'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
