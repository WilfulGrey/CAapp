import { useState } from 'react';
import type { FC } from 'react';
import { Check, X, UserPlus } from 'lucide-react';
import type { Nurse } from '../../types';
import type { Application } from './shared';
import { nurseLevel, displayName, initials } from './shared';

export const CustomerNurseModal: FC<{
  nurse: Nurse;
  onClose: () => void;
  app?: Application;
  onReview?: () => void;
  onDecline?: () => void;
  onUndo?: () => void;
  /** Performs the actual backend mutation. Spinner stays up until the
   *  promise resolves; on rejection modal rolls back to idle and the
   *  parent surfaces the error (CLAUDE.md §1 — no fake animation). */
  onInvite?: () => Promise<void>;
  onDeclineMatch?: () => void;
  isInvited?: boolean;
}> = ({ nurse, onClose, app, onReview, onDecline, onUndo, onInvite, onDeclineMatch, isInvited = false }) => {
  const [invited, setInvited] = useState(isInvited);
  const [invitePhaseModal, setInvitePhaseModal] = useState<'idle' | 'sending' | 'done'>('idle');

  const handleModalInvite = async () => {
    setInvitePhaseModal('sending');
    try {
      await onInvite?.();
      setInvitePhaseModal('done');
      setTimeout(() => { setInvited(true); setInvitePhaseModal('idle'); }, 1200);
    } catch {
      // Parent already shows the error toast.
      setInvitePhaseModal('idle');
    }
  };
  const inits = initials(nurse.name);
  const name = displayName(nurse.name);
  const bars = Array.from({ length: 5 }, (_, i) => i < nurse.language.bars);
  const avgWo = nurse.history ? Math.round(nurse.history.avgDurationMonths * 4.3) : 0;
  const lvl = nurseLevel(nurse.history?.assignments ?? 0);
  const p = nurse.profile;
  const dash = '—';
  const yesNo = (v: boolean | undefined): string => v == null ? dash : v ? 'Ja' : 'Nein';
  const smokingLabel: Record<string, string> = {
    no: 'Nein',
    yes: 'Ja',
    yes_outside: 'Ja, draußen',
  };
  // "Über die Pflegekraft" prose — built from real fields only. If the
  // backend hasn't filled them in we show a neutral placeholder rather
  // than fabricating personality traits (CLAUDE.md §1).
  const aboutSentence = p?.aboutDe
    ? p.aboutDe
    : p?.motivation
    ? p.motivation
    : `${name} verfügt über ${nurse.experience} in der 24h-Betreuung und spricht Deutsch auf ${nurse.language.level}-Niveau.${
        nurse.history ? ` Mit ${nurse.history.assignments} erfolgreich abgeschlossenen Einsätzen bringt sie bewährte Praxiserfahrung mit.` : ''
      }`;

  const InfoRow = ({ emoji, label, value, chips }: { emoji: string; label: string; value?: string; chips?: string[] }) => (
    <div className="flex gap-3.5 py-3 border-b border-gray-100 last:border-0">
      <span className="text-xl w-7 flex-shrink-0 text-center leading-none mt-0.5">{emoji}</span>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 mb-0.5">{label}</p>
        {value && <p className="text-sm font-bold text-gray-800">{value}</p>}
        {chips && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {chips.map(c => <span key={c} className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">{c}</span>)}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={onClose}
        style={{ animation: 'fadeIn 0.2s ease-out' }} />

      <div className="fixed z-50 inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center sm:p-4 pointer-events-none"
        style={{ animation: 'fadeIn 0.2s ease-out' }}>
        <div
          className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-3xl max-h-[92dvh] overflow-hidden pointer-events-auto shadow-2xl flex flex-col"
          style={{ animation: 'slideSheet 0.3s cubic-bezier(0.32,0.72,0,1)' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex justify-center pt-3 pb-2 sm:hidden flex-shrink-0">
            <div className="w-10 h-1 rounded-full bg-gray-300" />
          </div>

          <div className="px-5 pb-4 flex-shrink-0" style={{ backgroundColor: `${nurse.color}12` }}>
            <div className="flex items-start justify-between gap-3 pt-2">
              <div className="relative flex-shrink-0">
                {nurse.image ? (
                  <img src={nurse.image} alt={nurse.name} className="w-16 h-16 rounded-2xl object-cover border-2 border-white shadow" />
                ) : (
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-white border-2 border-white shadow"
                    style={{ backgroundColor: nurse.color }}>
                    {inits}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0 pt-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold text-gray-900 leading-tight">{name}</h2>
                  <span className={`flex items-center gap-1 text-xs font-bold pl-1.5 pr-2 py-0.5 rounded-full border flex-shrink-0 ${lvl.cls}`}>
                    <span className="text-sm leading-none">{lvl.emoji}</span>{lvl.label}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{nurse.age} Jahre</p>
                <span className={`inline-block mt-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${
                  nurse.availableSoon ? 'bg-[#E3F7EF] text-[#22A06B] border-[#B8E8D4]' : 'bg-[#FEF3E2] text-[#B45309] border-[#F9D99A]'
                }`}>
                  {nurse.availability}
                </span>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/80 flex items-center justify-center shadow-sm flex-shrink-0 mt-1">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4">
              <div className="bg-white rounded-xl px-3 py-2.5 shadow-sm">
                <p className="text-xs text-gray-600 mb-1">Erfahrung</p>
                <p className="text-sm font-bold text-[#9B1FA1]">{nurse.experience}</p>
              </div>
              <div className="bg-white rounded-xl px-3 py-2.5 shadow-sm">
                <p className="text-xs text-gray-600 mb-1">Deutschkenntnisse</p>
                <div className="flex items-center gap-1.5">
                  <div className="flex gap-0.5">
                    {bars.map((f, i) => <div key={i} className={`w-3 h-1.5 rounded-full ${f ? 'bg-[#9B1FA1]' : 'bg-gray-200'}`} />)}
                  </div>
                  <span className="text-xs font-bold text-gray-700">{nurse.language.level}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="px-5 pt-4 pb-5">
              <h3 className="text-sm font-bold text-gray-900 mb-2">Über die Pflegekraft</h3>
              <div className="bg-[#F5EDF6] rounded-xl p-4">
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{aboutSentence}</p>
              </div>
            </div>

            {nurse.detailedAssignments && nurse.detailedAssignments.length > 0 && (
              <div className="px-5 pb-5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-gray-900">Letzte Einsätze</h3>
                  {nurse.history && (
                    <span className="text-xs font-semibold text-gray-500 bg-gray-100 border border-gray-200 px-2.5 py-0.5 rounded-full">
                      {nurse.history.assignments} Einsätze · Ø {avgWo} Wo.
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {nurse.detailedAssignments.map((a, i) => (
                    <div key={i} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                        <div><p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Zeitraum</p><p className="text-xs font-semibold text-gray-800">{a.startDate} – {a.endDate}</p></div>
                        <div><p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Ort</p><p className="text-xs font-semibold text-gray-800">{a.postalCode} {a.city}</p></div>
                        <div><p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Patienten</p><p className="text-xs font-semibold text-gray-800">{a.patientCount} {a.patientCount === 1 ? 'Patient' : 'Patienten'}</p></div>
                        <div><p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Mobilität</p><p className="text-xs font-semibold text-gray-800">{a.mobility}</p></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="px-5 pb-5">
              <h3 className="text-sm font-bold text-gray-900 mb-3">Über mich</h3>
              <div className="divide-y divide-gray-100">
                <InfoRow emoji="👤" label="Geschlecht" value={nurse.gender === 'female' ? 'Weiblich' : 'Männlich'} />
                <InfoRow emoji="🌍" label="Nationalität" value={p?.nationality ?? dash} />
                <InfoRow emoji="🎂" label="Geburtsjahr" value={p?.yearOfBirth ? String(p.yearOfBirth) : dash} />
                <InfoRow emoji="⚖️" label="Gewicht" value={p?.weight ?? dash} />
                <InfoRow emoji="📏" label="Größe" value={p?.height ?? dash} />
                {p && p.personalities.length > 0 && (
                  <InfoRow emoji="🧠" label="Persönlichkeit" chips={p.personalities} />
                )}
                {p && p.hobbies.length > 0 && (
                  <InfoRow emoji="🎯" label="Hobbys" chips={p.hobbies} />
                )}
              </div>
            </div>

            <div className="px-5 pb-5">
              <h3 className="text-sm font-bold text-gray-900 mb-3">Besondere Merkmale</h3>
              <div className="divide-y divide-gray-100">
                <InfoRow emoji="🚗" label="Führerschein" value={yesNo(p?.drivingLicense)} />
                <InfoRow emoji="🚬" label="Raucher" value={p?.smoking ? smokingLabel[p.smoking] ?? dash : dash} />
                <InfoRow emoji="🎓" label="Pflegeberuf erlernt" value={yesNo(p?.isNurse)} />
                {p?.qualifications && (
                  <InfoRow emoji="🏥" label="Qualifikationen" value={p.qualifications} />
                )}
                {p?.education && (
                  <InfoRow emoji="📚" label="Ausbildung" value={p.education} />
                )}
                {p && p.otherLanguages.length > 0 && (
                  <InfoRow
                    emoji="🌐"
                    label="Andere Sprachkenntnisse"
                    chips={p.otherLanguages.map(l => `${l.name} (${l.level})`)}
                  />
                )}
              </div>
            </div>

            {p && p.acceptedMobilities.length > 0 && (
              <div className="px-5 pb-6">
                <h3 className="text-sm font-bold text-gray-900 mb-3">Berufliche Anforderungen</h3>
                <div className="divide-y divide-gray-100">
                  <InfoRow emoji="🦽" label="Akzeptierte Mobilität" chips={p.acceptedMobilities} />
                </div>
              </div>
            )}
          </div>

          <div className="px-5 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
            {app ? (
              app.status === 'declined' ? (
                <button
                  onClick={() => { onUndo?.(); onClose(); }}
                  className="flex-1 bg-[#F5EDF6] text-[#9B1FA1] border border-[#D8A9DC] rounded-xl py-3 font-bold text-sm hover:bg-[#EDD9EF] transition-colors flex items-center justify-center gap-2"
                >
                  ↩ Ablehnung rückgängig machen
                </button>
              ) : (
                <>
                  <button
                    onClick={() => onDecline?.()}
                    className="flex-1 border-2 border-red-100 bg-red-50 text-red-500 rounded-xl py-3 font-semibold text-sm hover:bg-red-100 transition-colors"
                  >
                    Ablehnen
                  </button>
                  <button
                    onClick={onReview}
                    className="flex-[2] bg-[#9B1FA1] text-white rounded-xl py-3 font-bold text-sm hover:bg-[#7B1A85] transition-colors"
                  >
                    Angebot prüfen
                  </button>
                </>
              )
            ) : (
              <>
                {!invited ? (
                  <>
                    <button
                      onClick={() => { onDeclineMatch?.(); }}
                      className="flex-1 border-2 border-gray-200 text-gray-500 rounded-xl py-3 font-semibold text-sm hover:bg-gray-50 transition-colors"
                    >
                      Nein danke
                    </button>
                    {invitePhaseModal === 'sending' ? (
                      <div className="flex-[2] bg-[#F5EDF6] text-[#9B1FA1] rounded-xl py-3 font-bold text-sm border border-[#D8A9DC] flex items-center justify-center gap-2">
                        <svg className="w-4 h-4 animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                        </svg>
                        Pflegekraft wird eingeladen…
                      </div>
                    ) : invitePhaseModal === 'done' ? (
                      <div className="flex-[2] bg-[#E3F7EF] text-[#22A06B] rounded-xl py-3 font-bold text-sm border border-[#B8E8D4] flex items-center justify-center gap-2">
                        <Check className="w-4 h-4" /> Pflegekraft wurde eingeladen!
                      </div>
                    ) : (
                      <button
                        onClick={handleModalInvite}
                        className="flex-[2] bg-[#9B1FA1] text-white rounded-xl py-3 font-bold text-sm hover:bg-[#7B1A85] transition-colors flex items-center justify-center gap-2"
                      >
                        <UserPlus className="w-4 h-4" /> Einladen
                      </button>
                    )}
                  </>
                ) : (
                  <div className="flex-1 bg-[#F5EDF6] text-[#9B1FA1] rounded-xl py-3 font-bold text-sm border border-[#D8A9DC] flex items-center justify-center gap-2">
                    <Check className="w-4 h-4" /> Eingeladen — warten auf Bewerbung
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
