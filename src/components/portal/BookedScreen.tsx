import type { FC } from 'react';
import type { Nurse } from '../../types';
import type { Application } from './shared';
import { nurseLevel, displayName, initials } from './shared';

export const BookedScreen: FC<{ app: Application; onNurseClick: (n: Nurse) => void }> = ({ app, onNurseClick }) => {
  const { nurse, offer } = app;
  const name = displayName(nurse.name);
  const inits = initials(nurse.name);
  const lvl = nurseLevel(nurse.experienceYears ?? 0, nurse.history?.assignments ?? 0);
  const bars = Array.from({ length: 5 }, (_, i) => i < nurse.language.bars);

  const milestones = [
    {
      icon: '📄',
      title: 'Vertrag',
      desc: 'Ihr Betreuungsvertrag wird vorbereitet und steht bald zum Download bereit.',
      ready: false,
    },
    {
      icon: '✈️',
      title: 'Anreisedaten',
      desc: `Anreise am ${offer.anreisedatum} · Abreise am ${offer.abreisedatum}. Details folgen in Kürze.`,
      ready: false,
    },
    {
      icon: '🔄',
      title: 'Folge-Einsatz',
      desc: 'Zur Hälfte des Einsatzes öffnet sich automatisch ein neuer Suchlauf — Sie können dann wieder Pflegekräfte einladen und neue Bewerbungen erhalten.',
      ready: false,
    },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5" style={{ animation: 'fadeIn 0.4s ease-out' }}>
      <div className="text-center py-4">
        <div className="text-5xl mb-3">🎊</div>
        <h1 className="text-xl font-bold text-gray-900 mb-1">Pflegekraft gebucht!</h1>
        <p className="text-sm text-gray-600">Alles ist bestätigt. Die Agentur wurde benachrichtigt.</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div
          className="flex items-center gap-3.5 px-4 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => onNurseClick(nurse)}
        >
          <div className="relative flex-shrink-0">
            {nurse.image ? (
              <img src={nurse.image} alt={nurse.name} className="w-14 h-14 rounded-xl object-cover" />
            ) : (
              <div className="w-14 h-14 rounded-xl flex items-center justify-center text-lg font-bold text-white"
                style={{ backgroundColor: nurse.color }}>{inits}</div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-bold text-gray-900">{name}</span>
              <span className={`flex items-center gap-0.5 text-xs font-bold pl-1 pr-2 py-0.5 rounded-full border flex-shrink-0 ${lvl.cls}`}>
                <span className="text-xs leading-none">{lvl.emoji}</span>{lvl.label}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="flex gap-0.5">
                {bars.map((f, i) => <div key={i} className={`w-2.5 h-[5px] rounded-full ${f ? 'bg-[#9B1FA1]' : 'bg-gray-200'}`} />)}
              </div>
              <span className="text-xs text-gray-500">{nurse.language.level}</span>
              <span className="text-gray-300 text-xs">·</span>
              <span className="text-xs font-bold text-[#9B1FA1]">{nurse.experience}</span>
            </div>
          </div>
          <span className="text-xs text-gray-500 flex-shrink-0">Profil →</span>
        </div>

        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {[
            { label: 'Mtl. Betreuungskosten', value: `${offer.monatlicheKosten.toLocaleString('de-DE')} €`, bold: true },
            { label: 'Anreise', value: offer.anreisedatum },
            { label: 'Abreise', value: offer.abreisedatum },
            { label: 'Reisekosten', value: `${offer.anreisekosten} € pro Fahrt` },
            { label: 'Kündigungsfrist', value: offer.kuendigungsfrist },
          ].map(row => (
            <div key={row.label} className="flex justify-between items-center px-4 py-2.5">
              <span className="text-xs text-gray-500">{row.label}</span>
              <span className={`text-xs ${row.bold ? 'font-bold text-gray-900' : 'font-semibold text-gray-700'}`}>{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2.5">
        <p className="text-xs font-bold text-gray-600 uppercase tracking-wider px-1">Als nächstes</p>
        {milestones.map((m) => (
          <div key={m.title} className="bg-white border border-gray-200 rounded-2xl px-4 py-3.5 flex items-start gap-3.5 shadow-sm">
            <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 text-lg">
              {m.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm font-bold text-gray-800">{m.title}</p>
                <span className="text-xs font-bold text-gray-400 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">Folgt</span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">{m.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
