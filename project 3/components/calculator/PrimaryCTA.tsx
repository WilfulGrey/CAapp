"use client";

import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";

interface PrimaryCTAProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  showArrow?: boolean;
  className?: string;
  type?: "button" | "submit";
  variant?: "default" | "green";
}

export function PrimaryCTA({
  children,
  onClick,
  disabled = false,
  showArrow = true,
  className,
  type = "button",
  variant = "green",
}: PrimaryCTAProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full font-bold py-4 px-6 rounded-xl",
        "hover:shadow-xl hover:scale-[1.01] active:scale-[0.99]",
        "transition-all duration-200",
        "disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-lg",
        "flex items-center justify-center gap-2 text-base",
        "shadow-lg relative overflow-hidden group",
        "bg-[#E76F63] hover:bg-[#D65E52] text-white",
        className
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
      <span className="relative z-10">{children}</span>
      {showArrow && <ArrowRight className="w-5 h-5 relative z-10 group-hover:translate-x-1 transition-transform duration-300" />}
    </button>
  );
}
