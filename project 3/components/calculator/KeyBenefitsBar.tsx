'use client';

import { Clock, Shield, FileText, CircleCheck as CheckCircle } from 'lucide-react';

export function KeyBenefitsBar() {
  const benefits = [
    {
      icon: Clock,
      title: 'Kurzfristiger',
      subtitle: 'Betreuungsbeginn (4–7 Werktagen)',
    },
    {
      icon: Shield,
      title: 'Täglich kündbar',
      subtitle: 'Faire Abrechnung',
    },
    {
      icon: FileText,
      title: 'Tagesgenaue',
      subtitle: 'Abrechnung',
    },
    {
      icon: CheckCircle,
      title: 'Kosten erst bei',
      subtitle: 'Betreuungsbeginn',
    },
  ];

  return null;
}
