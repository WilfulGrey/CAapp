"use client";

import { ArrowLeft, X, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface TopbarProps {
  onBack?: () => void;
  onClose?: () => void;
  title?: string;
  showCompleteBadge?: boolean;
}

export function Topbar({ onBack, onClose, title = "IHRE KALKULATION", showCompleteBadge = false }: TopbarProps) {
  const router = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      router.push('/');
    }
  };

  return (
    <div className="w-full px-5 py-4 flex items-center justify-between border-b border-[#E5E3DF] bg-white">
      <button
        onClick={handleBack}
        className="w-9 h-9 rounded-full hover:bg-[#F8F7F5] flex items-center justify-center text-[#3D3D3D] transition-all"
        aria-label="Zurück"
      >
        <ArrowLeft className="w-5 h-5" />
      </button>
      {showCompleteBadge ? (
        <div className="inline-flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-full text-xs md:text-sm font-semibold">
          <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5" />
          Anfrage abgeschlossen
        </div>
      ) : (
        <div className="text-xs font-semibold text-[#8B8B8B] tracking-wider uppercase">
          {title}
        </div>
      )}
      <button
        onClick={handleClose}
        className="w-9 h-9 rounded-full hover:bg-[#F8F7F5] flex items-center justify-center text-[#3D3D3D] transition-all"
        aria-label="Schließen"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}
