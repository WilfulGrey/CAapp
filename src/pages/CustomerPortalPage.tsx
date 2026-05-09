import { useState, useEffect, FC } from 'react';
import { Check, Bell, Phone, AlertCircle, AlertTriangle, ChevronDown } from 'lucide-react';
import { Nurse } from '../types';
import { displayName } from '../components/portal/shared';
import {
  fetchLeadByToken,
  Lead,
  cap,
  formatEuro,
} from '../lib/supabase';
import { useMamamiaSession } from '../hooks/useMamamiaSession';
import { useCustomer, useJobOffer, useApplications, useMatchings, useCaregiver, useInvitedCaregivers } from '../lib/mamamia/hooks';
import { prefetchCaregivers } from '../lib/mamamia/caregiverCache';
import {
  useRejectApplication,
  useStoreConfirmation,
  useInviteCaregiver,
  useUpdateCustomer,
} from '../lib/mamamia/mutations';
import {
  customerDisplayName,
  jobOfferArrivalDisplay,
  mapApplicationToUI,
  mapMatchingToNurse,
  mapCaregiverToNurse,
} from '../lib/mamamia/mappers';
import { mapPatientFormToUpdateCustomerInput } from '../lib/mamamia/patientFormMapper';
import { callMamamia } from '../lib/mamamia/client';
import {
  type Application,
  type NurseStatus,
  type NurseStatuses,
} from '../components/portal/shared';
import { BookedScreen } from '../components/portal/BookedScreen';
import { AngebotCard } from '../components/portal/AngebotCard';
import { AppCard } from '../components/portal/AppCard';
import { AppCardDone } from '../components/portal/AppCardDone';
import { MatchCard } from '../components/portal/MatchCard';
import { InfoPopup } from '../components/portal/InfoPopup';
import { ContactPopup } from '../components/portal/ContactPopup';
import { DeclineConfirmModal } from '../components/portal/DeclineConfirmModal';
import { AngebotPruefenModal } from '../components/portal/AngebotPruefenModal';
import { CustomerNurseModal } from '../components/portal/CustomerNurseModal';
// ─── Main Page ────────────────────────────────────────────────────────────────

const CustomerPortalPage: FC = () => {
  // ─── Lead loading via token ──────────────────────────────────────────────────
  const [lead, setLead] = useState<Lead | null>(null);
  const [leadLoading, setLeadLoading] = useState(true);
  const [leadError, setLeadError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (!token) {
      // No token → nothing to show. No demo fallback (CLAUDE.md §1).
      setLeadError('Ihr persönlicher Link fehlt. Bitte öffnen Sie die E-Mail erneut und klicken Sie auf den Angebots-Link.');
      setLeadLoading(false);
      return;
    }
    fetchLeadByToken(token).then(({ lead: l, error }) => {
      if (error || !l) {
        setLeadError('Ihr Angebot konnte nicht geladen werden. Bitte öffnen Sie den Link aus Ihrer E-Mail erneut.');
      } else {
        setLead(l);
      }
      setLeadLoading(false);
    });
  }, []);

  // Applications state. Empty by default — populated once Mamamia session
  // is ready and `listApplications` returns. No mock seeds (CLAUDE.md §1).
  const [applications, setApplications] = useState<Application[]>([]);
  const [nurseStatuses, setNurseStatuses] = useState<NurseStatuses>({});
  const [selectedNurse, setSelectedNurse] = useState<Nurse | null>(null);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [nurseModalApp, setNurseModalApp] = useState<Application | null>(null);
  const [nurseMatchIdx, setNurseMatchIdx] = useState<number | null>(null);
  const [declineConfirmApp, setDeclineConfirmApp] = useState<Application | null>(null);
  const [showInfoPopup, setShowInfoPopup] = useState(false);
  const [showContactPopup, setShowContactPopup] = useState(false);
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [patientSaved, setPatientSaved] = useState(false);
  const [showPatientReminder, setShowPatientReminder] = useState(false);
  const [triggerOpenPatient, setTriggerOpenPatient] = useState(false);
  const [firstInviteDone, setFirstInviteDone] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // ─── Mamamia session + queries (K2-K4 integration) ───────────────────────
  const { session, ready: mmReady, error: mmError } = useMamamiaSession(lead?.token ?? null);
  const { data: mmCustomer, loading: mmCustomerLoading, error: mmCustomerError } = useCustomer(mmReady);
  const { data: mmJobOffer, loading: mmJobOfferLoading, error: mmJobOfferError } = useJobOffer(mmReady);
  const { data: mmApplications, loading: mmApplicationsLoading, error: mmApplicationsError, refetch: refetchApplications } = useApplications({ limit: 20 }, mmReady);
  // limit=20 is intentional — client-side ranking (see `effectiveMatched`)
  // re-orders the page-1 batch by our own criteria (availability, freshness,
  // experience) rather than relying on Mamamia's server-side `order_by`.
  const { data: mmMatchings, loading: mmMatchingsLoading, error: mmMatchingsError } = useMatchings({ limit: 20 }, mmReady);
  // Mamamia's default listMatchings excludes matchings where is_request=true
  // (already-invited caregivers), so without this second call the invited
  // ones simply vanish from the list after F5 — only their ids would survive
  // via useInvitedCaregivers, but the seed-effect below can only flip the
  // status of caregivers that are still in `effectiveMatched`. Fetching the
  // invited matchings explicitly puts them back into the list with full
  // caregiver data so the modal click and badge both work.
  const { data: mmInvitedMatchings } = useMatchings({ limit: 100, filters: { is_request: true } }, mmReady);
  // Set of caregiver IDs already invited (Request rows in Mamamia). Used
  // below to seed nurseStatuses with 'invited' so the badge survives F5.
  const { data: invitedCaregiverIds, loading: invitedLoading, error: invitedError, refetch: refetchInvited } = useInvitedCaregivers(mmReady);

  // K5 mutations
  const rejectAppMutation = useRejectApplication();
  const confirmMutation = useStoreConfirmation();
  const inviteMutation = useInviteCaregiver();
  const updateCustomerMutation = useUpdateCustomer();
  // K6 (replaced) — customer-scope auth used to require a verify-mail
  // round-trip. As of the panel-style flow (mamamia-proxy → Sanctum SPA
  // login + ImpersonateCustomer), the Edge Function impersonates the
  // customer server-side, so no banner / token exchange is needed in
  // the browser. Invite simply calls the proxy.

  // Lazy-load full caregiver profile when modal opens — replaces mockProfile().
  // Backed by `caregiverCache` so that prefetched ids (visible matchings +
  // application caregivers) open instantly instead of paying GET_CAREGIVER's
  // 1.7-3.1s round-trip every click.
  const { data: fullCaregiver, loading: caregiverLoading } = useCaregiver(
    selectedNurse?.caregiverId ?? null,
  );
  const enrichedSelectedNurse = (() => {
    if (!selectedNurse) return null;
    if (!fullCaregiver) return selectedNurse;
    const enriched = mapCaregiverToNurse(fullCaregiver, {
      nowIso: new Date().toISOString(),
      nowYear: new Date().getFullYear(),
    });
    // Preserve color (deterministic by id, identical anyway) + caregiverId.
    return { ...selectedNurse, ...enriched };
  })();

  // Caregiver id mapping per match index (for invite flow).
  // effectiveMatched[idx].caregiverId resolves to real Mamamia id. Empty
  // array until session ready — NO mock/demo fallback (CLAUDE.md §1).
  //
  // Client-side ranking — Mamamia returns up to 20 already wish-filtered
  // candidates (gender, skill floor, driving license — verified live
  // 2026-04-29: 0 wish violations across 6 customers / 241 matches).
  // What we add on top: order by signals we care about per business rule.
  //   primary  : available_from ASC  (next available first; null/past = top)
  //   secondary: last_contact_at DESC (recently-active CGs respond faster)
  //   tertiary : hp_total_jobs   DESC (more experience first)
  const effectiveMatched = (() => {
    if (!mmReady || !mmMatchings?.data) return [];
    const nowIso = new Date().toISOString();
    const nowYear = new Date().getFullYear();
    const nowMs = new Date(nowIso).getTime();

    // Merge open matchings (default listMatchings) + already-invited matchings
    // (filters: is_request:true). Dedup by caregiver.id — a row should never
    // appear in both lists, but be defensive against backend overlap.
    const seen = new Set<number>();
    const merged: typeof mmMatchings.data = [];
    for (const m of mmMatchings.data) {
      if (seen.has(m.caregiver.id)) continue;
      seen.add(m.caregiver.id);
      merged.push(m);
    }
    if (mmInvitedMatchings?.data) {
      for (const m of mmInvitedMatchings.data) {
        if (seen.has(m.caregiver.id)) continue;
        seen.add(m.caregiver.id);
        merged.push(m);
      }
    }

    // Numeric sort keys built from raw Mamamia fields. NaN guard: missing
    // values rank "best" — null available_from = "Sofort" should be top,
    // missing last_contact = treat as long ago (rank lower).
    const availMs = (iso: string | null): number => {
      if (!iso) return 0; // "Sofort" → top
      const t = new Date(iso).getTime();
      // CGs already past their availability date are equally "available now".
      return Number.isFinite(t) ? Math.max(0, t - nowMs) : Infinity;
    };
    const contactMs = (iso: string | null): number => {
      if (!iso) return -Infinity;
      const t = new Date(iso).getTime();
      return Number.isFinite(t) ? t : -Infinity;
    };

    return merged
      .filter(m => m.is_show !== false)
      .sort((a, b) => {
        const av = availMs(a.caregiver.available_from);
        const bv = availMs(b.caregiver.available_from);
        if (av !== bv) return av - bv;

        const ac = contactMs(a.caregiver.last_contact_at);
        const bc = contactMs(b.caregiver.last_contact_at);
        if (ac !== bc) return bc - ac;

        const aj = a.caregiver.hp_total_jobs ?? 0;
        const bj = b.caregiver.hp_total_jobs ?? 0;
        return bj - aj;
      })
      .map(m => ({
        nurse: mapMatchingToNurse(m, { nowIso, nowYear }),
        caregiverId: m.caregiver.id,
      }));
  })();

  // Sync real applications from Mamamia → local state (keeps existing mutation flow).
  useEffect(() => {
    if (!mmReady || !mmApplications) return;
    const nowIso = new Date().toISOString();
    const nowYear = new Date().getFullYear();
    setApplications(prev => {
      // Preserve local status overlays (accepted/declined) on top of fresh Mamamia data
      const statusById = new Map(prev.map(p => [p.id, p.status]));
      return mmApplications.data.map(a => {
        const mapped = mapApplicationToUI(a, null, { nowIso, nowYear });
        return { ...mapped, status: statusById.get(mapped.id) ?? 'new' };
      });
    });
  }, [mmReady, mmApplications]);

  // Background prefetch full caregiver profiles for visible matchings +
  // applications. GET_CAREGIVER takes 1.7-3.1s on Mamamia beta — without
  // prefetch, every modal open pays full latency. With prefetch, by the
  // time the user clicks the data is already cached.
  // Concurrency capped inside prefetchCaregivers; safe even with 50 ids.
  useEffect(() => {
    if (!mmReady) return;
    const ids = new Set<number>();
    for (const m of effectiveMatched) ids.add(m.caregiverId);
    if (mmApplications?.data) {
      for (const a of mmApplications.data) ids.add(a.caregiver.id);
    }
    if (ids.size > 0) prefetchCaregivers([...ids]);
    // intentionally not depending on `effectiveMatched` reference identity —
    // its caregiverIds is what we care about, derived from mmMatchings.
  }, [mmReady, mmMatchings, mmApplications]);

  // Seed nurseStatuses with 'invited' for caregivers that already have a
  // Request in Mamamia. Without this the badge state lives only in
  // memory — F5 wipes it and the user re-sees "Einladen" on already-
  // invited cgs (UX bug; could even double-invite). We merge instead of
  // replace so locally-set 'declined' overlays survive a refetch.
  useEffect(() => {
    if (!mmReady || !invitedCaregiverIds || effectiveMatched.length === 0) return;
    const invitedSet = new Set(invitedCaregiverIds);
    setNurseStatuses(prev => {
      const next: NurseStatuses = { ...prev };
      effectiveMatched.forEach((m, idx) => {
        if (invitedSet.has(m.caregiverId) && next[idx] !== 'declined') {
          next[idx] = 'invited';
        }
      });
      return next;
    });
  }, [mmReady, invitedCaregiverIds, effectiveMatched]);

  const animateThenProcess = (id: string, fn: () => void) => {
    setExitingIds(prev => new Set([...prev, id]));
    setTimeout(() => {
      fn();
      setExitingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }, 320);
  };

  const openNurseFromApp = (nurse: Nurse, app: Application) => {
    setSelectedApp(null);
    setNurseModalApp(app);
    setNurseMatchIdx(null);
    setSelectedNurse(nurse);
  };
  const openNurseFromMatch = (nurse: Nurse, idx: number) => {
    setNurseModalApp(null);
    setNurseMatchIdx(idx);
    setSelectedNurse(nurse);
  };

  const pendingApps = applications.filter((a) => a.status === 'new');
  const doneApps = applications.filter((a) => a.status !== 'new');
  const acceptedApp = applications.find((a) => a.status === 'accepted') ?? null;
  const hasPending = pendingApps.length > 0;
  const matchesUnlocked = !hasPending;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const acceptApp = (id: string) => {
    setSelectedApp(null);
    animateThenProcess(id, () => {
      // Optimistic update
      setApplications((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: 'accepted' } : a))
      );
      showToast('✓ Betreuungskraft akzeptiert — die Agentur wird benachrichtigt.');

      // Persist to Mamamia when session is live (minimal StoreConfirmation —
      // full contract_patient/contract_contact fill-out happens in K5 refactor
      // of AngebotPruefenModal step 2).
      if (mmReady && Number.isFinite(Number(id))) {
        confirmMutation.mutate({
          application_id: Number(id),
          is_confirm_binding: true,
          update_customer: false,
          message: 'Angenommen via Portal',
        }).then(() => refetchApplications())
          .catch(err => {
            console.error('storeConfirmation failed:', err);
            setApplications((prev) =>
              prev.map((a) => (a.id === id ? { ...a, status: 'new' } : a))
            );
            showToast('Fehler beim Akzeptieren — bitte erneut versuchen.');
          });
      }
    });
  };

  const declineApp = (id: string, message?: string) => {
    // Optimistic update
    setApplications((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: 'declined' } : a))
    );

    // Persist to Mamamia
    if (mmReady && Number.isFinite(Number(id))) {
      rejectAppMutation.mutate({
        application_id: Number(id),
        reject_message: message,
      }).then(() => refetchApplications())
        .catch(err => {
          console.error('rejectApplication failed:', err);
          setApplications((prev) =>
            prev.map((a) => (a.id === id ? { ...a, status: 'new' } : a))
          );
          showToast('Fehler beim Ablehnen — bitte erneut versuchen.');
        });
    }
  };

  // Mamamia currently has no RestoreApplication mutation (verified 2026-04-24
  // via schema introspection — zero hits for restore/unreject/undo/revert/cancel).
  // Backend will add the mutation later; for now we show a support-contact dialog.
  const [undoErrorOpen, setUndoErrorOpen] = useState(false);
  const undoApp = (_id: string) => {
    setUndoErrorOpen(true);
  };

  const canInviteNurse = (idx: number): boolean => {
    if (!patientSaved && firstInviteDone) {
      setShowPatientReminder(true);
      return false;
    }
    return true;
  };

  const confirmInviteNurse = async (idx: number, name: string): Promise<void> => {
    const match = effectiveMatched[idx];
    if (!mmReady || typeof match?.caregiverId !== 'number') {
      showToast('Einladung derzeit nicht möglich. Bitte später erneut versuchen.');
      throw new Error('not-ready');
    }

    const nurseName = match.nurse.name ?? '';

    if (!patientSaved && !firstInviteDone) {
      setFirstInviteDone(true);
      setShowPatientReminder(true);
    }

    try {
      await inviteMutation.mutate({ caregiver_id: match.caregiverId });
      // Persist invited state ONLY after backend confirmed.
      setNurseStatuses((prev) => ({ ...prev, [idx]: 'invited' }));
      // Refetch the invited-IDs set so a subsequent F5 already sees this
      // caregiver as invited (without depending on local state survival).
      refetchInvited();
      if (nurseName) {
        setApplications((prev) =>
          prev.map((a) => a.nurse.name === nurseName ? { ...a, isInvited: true } : a)
        );
      }
      showToast(`✓ ${name} wurde eingeladen!`);
    } catch (err) {
      console.error('inviteCaregiver failed:', (err as Error).message);
      // Onboard now lands the customer at status='active' (Customer.arrival_at
      // wired in 175468f), so the previous Unauthorized-for-draft branch is
      // obsolete. Any error here is an upstream outage; show generic message.
      showToast('Einladung konnte nicht gesendet werden. Bitte kontaktieren Sie uns.');
      throw err;
    }
  };

  // Used by modal (calls after own animation). Modal doesn't await — it just
  // needs to know whether the gating check (patient reminder) passed.
  const inviteNurse = (idx: number, name: string): boolean => {
    if (!canInviteNurse(idx)) return false;
    confirmInviteNurse(idx, name).catch(() => { /* already toasted */ });
    return true;
  };

  const declineNurse = (idx: number) => {
    setNurseStatuses((prev) => ({ ...prev, [idx]: 'declined' }));
  };

  // ─── Debug overlay (?debug=1) ────────────────────────────────────────────
  // Renders fixed-bottom black panel with key state. Only active when URL
  // has `?debug=1` so production traffic doesn't see it. Designed for
  // iPhone-side diagnosis where remote DevTools isn't always available —
  // user opens with ?debug=1, screenshots panel, sends.
  //
  // Auth section reflects the dual mechanism added in Bug #13j: cookie
  // (cross-site, often dropped on iOS) AND X-Session-Token header
  // (sessionStorage-backed, bulletproof). The header path is what works
  // on iOS WebKit incognito; cookie is transparent fallback for desktop.
  const debugOn = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('debug');
  const fmtErr = (e: Error | null) => e ? `${e.name}: ${e.message.slice(0, 80)}` : 'null';
  const fmtVal = (v: unknown) => v == null ? 'null' : typeof v === 'object' ? JSON.stringify(v).slice(0, 60) : String(v);

  // Read auth artifacts safely (guard SSR / private mode throws).
  let sessionTokenInStorage: string | null = null;
  try { sessionTokenInStorage = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('mamamia_session_token') : null; } catch { /* private mode */ }
  const cookieDoc = typeof document !== 'undefined' ? (document.cookie || '') : '';
  const sessionCookieVisible = cookieDoc.includes('session=');
  const hasAnyCookie = cookieDoc.length > 0;

  // Infer which auth method is actively carrying proxy calls. The
  // frontend prefers header when sessionStorage has a token (Bug #13j);
  // otherwise it falls back to credentials: include cookie path. We can
  // verify the cookie path is *probably* live by checking mmReady but
  // not seeing the token in storage — meaning cookie HttpOnly carried it.
  let authMethod: string;
  if (sessionTokenInStorage) {
    authMethod = 'X-Session-Token header (sessionStorage)';
  } else if (sessionCookieVisible) {
    authMethod = 'session cookie (visible — non-HttpOnly?)';
  } else if (mmReady && hasAnyCookie) {
    authMethod = 'session cookie (HttpOnly — JS-invisible)';
  } else if (mmReady) {
    authMethod = 'unknown — mmReady=true but no token visible (proxy calls likely failing)';
  } else {
    authMethod = 'none yet (mmSession not ready)';
  }

  const tokenPreview = (t: string | null) => t ? `${t.slice(0, 12)}…(${t.length} chars)` : '(absent)';

  const debugOverlay = debugOn ? (
    <div style={{position:'fixed',bottom:0,left:0,right:0,zIndex:9999,background:'rgba(0,0,0,0.92)',color:'#0f0',fontFamily:'ui-monospace,Menlo,monospace',fontSize:10,lineHeight:1.4,padding:'8px 10px',maxHeight:'45vh',overflowY:'auto',borderTop:'2px solid #0f0'}}>
      <div style={{color:'#ff0',fontWeight:'bold',marginBottom:4}}>🔧 DEBUG (?debug=1)</div>
      <div>UA: {typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 100) : '?'}</div>
      <div>online: {typeof navigator !== 'undefined' ? String(navigator.onLine) : '?'} · cookieEnabled: {typeof navigator !== 'undefined' ? String(navigator.cookieEnabled) : '?'}</div>
      <div>lead.token URL: {new URLSearchParams(window.location.search).get('token')?.slice(0, 12) ?? 'MISSING'}…</div>
      <hr style={{borderColor:'#0f04',margin:'4px 0'}}/>
      <div style={{color:'#ff0'}}>auth via: {authMethod}</div>
      <div>sessionStorage.mamamia_session_token: {tokenPreview(sessionTokenInStorage)}</div>
      <div>document.cookie has any: {String(hasAnyCookie)} · session= visible: {String(sessionCookieVisible)}</div>
      <div>cookie raw (truncated): {cookieDoc.slice(0, 120) || '(empty — iOS WebKit incognito normalny stan)'}</div>
      <hr style={{borderColor:'#0f04',margin:'4px 0'}}/>
      <div>lead: loading={String(leadLoading)} err={leadError ?? 'null'} loaded={lead ? 'yes id='+lead.id.slice(0,8) : 'null'}</div>
      <div>mmSession: ready={String(mmReady)} err={fmtErr(mmError)} session={fmtVal(session)}</div>
      <div>mmCustomer: loading={String(mmCustomerLoading)} err={fmtErr(mmCustomerError)} id={fmtVal(mmCustomer?.id)} status={fmtVal(mmCustomer?.status)}</div>
      <div>mmJobOffer: loading={String(mmJobOfferLoading)} err={fmtErr(mmJobOfferError)} id={fmtVal(mmJobOffer?.id)} status={fmtVal(mmJobOffer?.status)}</div>
      <div>mmApplications: loading={String(mmApplicationsLoading)} err={fmtErr(mmApplicationsError)} total={fmtVal(mmApplications?.total)} count={fmtVal(mmApplications?.data.length)}</div>
      <div>mmMatchings: loading={String(mmMatchingsLoading)} err={fmtErr(mmMatchingsError)} total={fmtVal(mmMatchings?.total)} count={fmtVal(mmMatchings?.data.length)}</div>
      <div>invitedCaregiverIds: loading={String(invitedLoading)} err={fmtErr(invitedError)} count={fmtVal(invitedCaregiverIds?.length)}</div>
    </div>
  ) : null;

  // ─── Loading / Error states ──────────────────────────────────────────────────
  if (leadLoading) {
    return (
      <>
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-[#9B1FA1] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-400">Ihr Angebot wird geladen…</p>
        </div>
      </div>
      {debugOverlay}
      </>
    );
  }

  if (leadError) {
    return (
      <>
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto">
            <AlertCircle className="w-7 h-7 text-red-400" />
          </div>
          <p className="text-sm font-semibold text-gray-800">Link nicht mehr gültig</p>
          <p className="text-sm text-gray-500 leading-relaxed">{leadError}</p>
          <a href="tel:+4989200000830" className="inline-flex items-center gap-2 text-sm font-semibold text-[#9B1FA1] border border-[#D8A9DC] bg-[#F5EDF6] rounded-xl px-4 py-2.5">
            <Phone className="w-4 h-4" /> 089 200 000 830
          </a>
        </div>
      </div>
      {debugOverlay}
      </>
    );
  }

  // Mamamia session failure — surface it rather than silently falling back.
  if (lead && mmError) {
    return (
      <>
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto">
            <AlertCircle className="w-7 h-7 text-red-400" />
          </div>
          <p className="text-sm font-semibold text-gray-800">Verbindung zum Betreuungs-System fehlgeschlagen</p>
          <p className="text-sm text-gray-500 leading-relaxed">{mmError.message || 'Bitte versuchen Sie es in wenigen Augenblicken erneut.'}</p>
          <div className="flex gap-2 justify-center">
            <button onClick={() => window.location.reload()} className="text-sm font-semibold text-[#9B1FA1] border border-[#D8A9DC] bg-[#F5EDF6] rounded-xl px-4 py-2.5">
              Erneut versuchen
            </button>
            <a href="tel:+4989200000830" className="inline-flex items-center gap-2 text-sm font-semibold text-white bg-[#9B1FA1] rounded-xl px-4 py-2.5">
              <Phone className="w-4 h-4" /> Kontakt
            </a>
          </div>
        </div>
      </div>
      {debugOverlay}
      </>
    );
  }

  // Lead loaded but Mamamia session still bootstrapping.
  if (lead && !mmReady) {
    return (
      <>
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-[#9B1FA1] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-400">Betreuungskräfte werden geladen…</p>
        </div>
      </div>
      {debugOverlay}
      </>
    );
  }

  return (
    <>
    <div className="min-h-screen bg-gray-100 md:flex md:items-start md:justify-center md:py-10">
    <div className="min-h-screen md:min-h-0 bg-white w-full md:w-[390px] md:min-h-[844px] md:rounded-[48px] md:shadow-2xl md:overflow-hidden md:border-[8px] md:border-gray-800 md:ring-4 md:ring-gray-900/10 relative" style={{fontFamily: 'inherit'}}>
    <div className="md:h-[844px] md:overflow-y-auto md:overflow-x-hidden">
      {/* Toast */}
      {toast && (
        <div
          className="fixed top-5 left-1/2 -translate-x-1/2 z-[60] max-w-[85vw] bg-white border border-[#E8D0EA] text-gray-800 px-4 py-3 rounded-2xl shadow-lg text-sm font-medium flex items-center gap-2.5"
          style={{ animation: 'slideDown 0.25s ease-out' }}
        >
          <div className="w-5 h-5 rounded-full bg-[#9B1FA1] flex items-center justify-center flex-shrink-0">
            <Check className="w-3 h-3 text-white" strokeWidth={3} />
          </div>
          <span className="leading-snug">{toast.replace(/^✓\s*/, '')}</span>
        </div>
      )}

      {/* Navbar */}
      <nav className="sticky top-0 z-40" style={{background:'white', boxShadow:'0 1px 0 #E5E3DF, 0 2px 8px rgba(0,0,0,0.06)'}}>
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/LOGO-PRIMUNDUS.webp" alt="Primundus" className="h-6" />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowContactPopup(true)}
              className="flex items-center gap-1.5 bg-white hover:bg-[#F8F7F5] text-[#8B7355] border border-[#E5E3DF] rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
            >
              <Phone className="w-3.5 h-3.5" />
              Hilfe
            </button>
          </div>
        </div>
      </nav>

      {acceptedApp ? (
        <BookedScreen app={acceptedApp} onNurseClick={setSelectedNurse} />
      ) : (
      <>
      {/* ── Hero (full-width gradient) ── */}
      {(() => {
        const anrede = lead?.anrede_text ?? lead?.anrede;
        const nachname = cap(lead?.nachname);
        const vorname = cap(lead?.vorname);
        const heroNameLine = lead
          ? (anrede && nachname
              ? `${anrede} ${nachname}`
              : nachname || vorname || '')
          : 'Herr Mustermann';
        return (
          <div className="relative overflow-hidden" style={{background:'linear-gradient(135deg, #6B5444 0%, #8B7355 55%, #A18973 100%)'}}>
            <div className="absolute -top-12 -right-12 w-52 h-52 rounded-full" style={{background:'rgba(255,255,255,0.06)'}} />
            <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full" style={{background:'rgba(255,255,255,0.06)'}} />
            <div className="relative max-w-3xl mx-auto px-5 pt-8 pb-3">
              <p className="text-[15px] font-medium mb-3" style={{color:'rgba(255,255,255,0.8)'}}>
                Guten Tag{heroNameLine ? `, ${heroNameLine}` : ''}.
              </p>
              <h1 className="text-[1.65rem] font-bold text-white leading-tight mb-2">
                Ihr Angebot ist fertig. 🎉
              </h1>
              <p className="text-[14px] leading-relaxed mb-5" style={{color:'rgba(255,255,255,0.8)'}}>
                Prüfen Sie Ihr persönliches Angebot, ergänzen Sie die Patientendaten und laden Sie Ihre Wunsch-Pflegekraft direkt ein.
              </p>
              <div className="inline-flex items-center gap-2 rounded-full px-4 py-2" style={{background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)'}}>
                <Check className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={3} style={{color:'rgba(255,255,255,0.9)'}} />
                <span className="text-[14px] font-medium" style={{color:'rgba(255,255,255,0.95)'}}>Angebot kostenlos &amp; unverbindlich</span>
              </div>
            </div>
            <svg viewBox="0 0 390 28" className="w-full block" style={{marginBottom:'-1px'}} preserveAspectRatio="none">
              <path d="M0,14 C100,28 290,0 390,14 L390,28 L0,28 Z" fill="#F8F7F5"/>
            </svg>
          </div>
        );
      })()}

      {/* ── SECTION: Ihr Angebot (header + price card + conditions card + PDF) ── */}
      <div style={{background:'#F8F7F5'}}>
        <div className="max-w-3xl mx-auto">
          <div className="px-5 pt-6 pb-4 flex items-center justify-between">
            <div>
              <h2 className="text-[1.1rem] font-bold" style={{color:'#3D3D3D'}}>Ihr Angebot</h2>
              <div className="mt-1.5 h-[2px] w-10 rounded-full" style={{background:'#8B7355'}} />
            </div>
            <span className="text-[12px] font-semibold px-3 py-1 rounded-full" style={{background:'#E3F7EF', color:'#2a9a6f'}}>
              100 % risikofrei
            </span>
          </div>

          {(() => {
            const brutto = lead?.kalkulation?.bruttopreis ?? 3050;
            const tagessatz = Math.round(brutto / 30);
            const items = [
              { text: 'Täglich kündbar' },
              { text: 'Tagesgenaue Abrechnung' },
              { text: 'Kosten entstehen immer erst, wenn Pflegekraft vor Ort ist' },
            ];
            return (
              <div className="px-4 pb-4">
                <div className="rounded-2xl border px-5 pt-5 pb-4" style={{background:'white', borderColor:'#E5E3DF'}}>
                  <p className="text-[12px] font-semibold uppercase tracking-widest mb-2" style={{color:'#8B7355'}}>Betreuungskosten</p>
                  <div className="flex items-center gap-4">
                    <div className="flex items-baseline gap-1 flex-shrink-0" style={{minWidth:'55%'}}>
                      <span className="text-[2.2rem] font-bold leading-none" style={{color:'#3D3D3D'}}>{formatEuro(tagessatz)}</span>
                      <span className="text-[15px]" style={{color:'#8B8B8B'}}>/&nbsp;Tag</span>
                    </div>
                    <p className="text-[13px] leading-snug flex-1" style={{color:'#ABABAB'}}>inkl. Steuern, Gebühren &amp; Sozialabgaben</p>
                  </div>
                  <p className="text-[15px] mt-3 leading-snug" style={{color:'#3D3D3D'}}>zzgl. 125 € Anreisekosten pro Strecke sowie Kost &amp; Logis</p>
                </div>

                <div className="rounded-2xl overflow-hidden border mt-3" style={{background:'white', borderColor:'#E5E3DF'}}>
                  <div className="px-5 pt-4 pb-1">
                    <p className="text-[12px] font-semibold uppercase tracking-widest" style={{color:'#8B7355'}}>Unsere fairen Konditionen</p>
                  </div>
                  {items.map((item, i, arr) => (
                    <div key={i} className={`flex items-start gap-3 px-5 py-3.5 ${i < arr.length - 1 ? 'border-b' : ''}`} style={{borderColor:'#E5E3DF'}}>
                      <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{background:'#E3F7EF'}}>
                        <Check className="w-3 h-3" strokeWidth={3} style={{color:'#2a9a6f'}} />
                      </div>
                      <span className="text-[15px] leading-snug" style={{color:'#3D3D3D'}}>{item.text}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-2 flex justify-center">
                  <button onClick={() => {}} className="flex items-center gap-1.5 transition-opacity hover:opacity-70">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{width:14,height:14,color:'#3D3D3D'}}>
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="12" x2="12" y2="18"/><polyline points="9 15 12 18 15 15"/>
                    </svg>
                    <span className="text-[13px] underline" style={{color:'#3D3D3D'}}>Angebot als PDF herunterladen</span>
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">

        {/* ── SECTION HEADER: Passende Pflegekräfte ── */}
        <div className="px-1">
          <h2 className="text-[1.1rem] font-bold" style={{color:'#3D3D3D'}}>Passende Pflegekräfte</h2>
          <div className="mt-1.5 h-[2px] w-10 rounded-full" style={{background:'#8B7355'}} />
        </div>

        {/* ── INFO-Box: Profil unvollständig ── */}
        {!patientSaved && (
          <div className="rounded-2xl border px-5 py-4 flex gap-3" style={{background:'#FFFBF5', borderColor:'#E8D9C0'}}>
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{color:'#D97706'}} />
            <div>
              <p className="text-[15px] font-semibold" style={{color:'#3D3D3D'}}>Achtung: Profil unvollständig</p>
              <p className="text-[15px] mt-1 leading-relaxed" style={{color:'#8B8B8B'}}>
                Damit Sie Bewerbungen erhalten und Pflegekräfte einladen können, vervollständigen Sie bitte das Patientenprofil hier.
              </p>
            </div>
          </div>
        )}

        {/* ── Kombinierte Karte: Identität + Anfrage + Stepper ── */}
        <div id="patientendaten">
        <AngebotCard
          lead={lead}
          mmCustomer={mmCustomer}
          onPatientSaved={setPatientSaved}
          triggerOpenPatient={triggerOpenPatient}
          onTriggerHandled={() => setTriggerOpenPatient(false)}
          mamamiaEnabled={mmReady}
          onSaveToMamamia={async (form) => {
            const existingPatientIds = mmCustomer?.patients?.map(p => p.id) ?? [];
            // Resolve Mamamia location_id from PLZ via Locations(search).
            // Without a canonical id, panel "Lokalizacja opieki" stays empty
            // even if location_custom_text is set — verified 2026-05-07 on
            // Customer 7655 (location_custom_text="80332 Munchen", panel
            // location dropdown empty). Best-effort: errors fall back to
            // the location_custom_text path inside the mapper.
            let locationId: number | undefined;
            const plz = form.plz?.trim();
            if (plz && /^\d{4,5}$/.test(plz)) {
              try {
                const r = await callMamamia<{
                  LocationsWithPagination: {
                    data: Array<{ id: number; zip_code: string; country_code: string }>;
                  };
                }>('searchLocations', { search: plz, limit: 10, page: 1 });
                const rows = r.LocationsWithPagination.data;
                const de = rows.find(l => l.country_code === 'DE');
                const match = de ?? rows[0];
                if (match) locationId = match.id;
              } catch {
                // swallow — fall back to location_custom_text in mapper
              }
            }
            const patch = mapPatientFormToUpdateCustomerInput(form, {
              existingPatientIds,
              locationId,
            });
            await updateCustomerMutation.mutate(patch as Record<string, unknown>);
          }}
        />
        </div>

        {/* ── SECTION: Pending Applications ── */}
        {hasPending && (
          <div className="space-y-3">
            {pendingApps.map((app) => (
              <AppCard
                key={app.id}
                app={app}
                exiting={exitingIds.has(app.id)}
                onReview={() => setSelectedApp(app)}
                onDecline={() => setDeclineConfirmApp(app)}
                onNurseClick={(n) => openNurseFromApp(n, app)}
              />
            ))}
          </div>
        )}

        {/* ── SECTION: Matched Nurses — pending + invited, nur wenn keine offenen Bewerbungen ── */}
        {!hasPending && (() => {
          const visibleNurses = effectiveMatched.map((m, i) => ({ nurse: m.nurse, i, status: nurseStatuses[i] ?? 'pending' as NurseStatus }))
            .filter(({ status }) => status === 'pending' || status === 'invited')
            .sort((a, b) => (a.status === 'invited' ? 1 : 0) - (b.status === 'invited' ? 1 : 0));
          return (
            <>
              {visibleNurses.length > 0 && (
                <div>
                  {!patientSaved && (
                    <p className="text-[14px] leading-relaxed pb-2 px-1" style={{color:'#3D3D3D'}}>
                      Damit sich Pflegekräfte bewerben bzw. Sie diese einladen können, vervollständigen Sie bitte die Patienteninformationen.
                    </p>
                  )}
                  <div className="space-y-3">
                    {visibleNurses.map(({ nurse, i, status }) => (
                      <MatchCard key={i} nurse={nurse} status={status} onNurseClick={() => openNurseFromMatch(nurse, i)} onInvite={() => canInviteNurse(i)} onInviteConfirm={() => confirmInviteNurse(i, displayName(nurse.name))} />
                    ))}
                  </div>
                </div>
              )}

              {/* ── SECTION: Processed applications ── */}
              {doneApps.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 px-1">Bereits bearbeitet</p>
                  {doneApps.map((app) => (
                    <AppCardDone key={app.id} app={app} onNurseClick={(n, a) => { setNurseModalApp(a); setSelectedNurse(n); }} onUndo={undoApp} />
                  ))}
                </div>
              )}
            </>
          );
        })()}

        {/* ── SECTION: Processed applications (mit pending) ── */}
        {hasPending && doneApps.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 px-1">Bereits bearbeitet</p>
            {doneApps.map((app) => (
              <AppCardDone key={app.id} app={app} onNurseClick={(n, a) => { setNurseModalApp(a); setSelectedNurse(n); }} onUndo={undoApp} />
            ))}
          </div>
        )}

        {/* ── SECTION HEADER: So funktioniert's ── */}
        <div className="px-1 pt-3">
          <h2 className="text-[1.1rem] font-bold" style={{color:'#3D3D3D'}}>So funktioniert's</h2>
          <div className="mt-1.5 h-[2px] w-10 rounded-full" style={{background:'#8B7355'}} />
          <p className="text-[15px] mt-2" style={{color:'#8B8B8B'}}>Von der ersten Anfrage bis zur laufenden Betreuung.</p>
        </div>
        <div className="rounded-2xl overflow-hidden border" style={{background:'white', borderColor:'#E5E3DF'}}>
          {[
            { n: 1, title: 'Patientendaten vervollständigen', desc: 'Das Angebot sagt Ihnen zu? Ergänzen Sie jetzt die Angaben zum Patienten — so können sich Pflegekräfte optimal vorbereiten.', cta: !patientSaved },
            { n: 2, title: 'Bewerbungen erhalten & Pflegekräfte einladen', desc: 'Geeignete Pflegekräfte bewerben sich bei Ihnen. In der Zwischenzeit können Sie Wunschkandidatinnen gezielt einladen.', cta: false },
            { n: 3, title: 'Vertrag abschließen', desc: 'Sie wählen Ihre Favoritin aus und bestätigen das Angebot — den Rest übernehmen wir.', cta: false },
            { n: 4, title: 'Laufende Betreuung', desc: 'Die Pflegekraft ist da. Ihr persönlicher Ansprechpartner begleitet Sie während des gesamten Einsatzes.', cta: false },
          ].map((s, i, arr) => (
            <div key={s.n} className={`flex items-start gap-4 px-5 py-4 ${i < arr.length - 1 ? 'border-b' : ''}`} style={{borderColor:'#E5E3DF'}}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-white mt-0.5" style={{background:'#8B7355', fontSize:'15px'}}>{s.n}</div>
              <div>
                <p className="text-[15px] font-semibold" style={{color:'#3D3D3D'}}>{s.title}</p>
                <p className="text-[15px] mt-0.5 leading-relaxed" style={{color:'#8B8B8B'}}>{s.desc}</p>
                {s.cta && (
                  <button
                    onClick={() => { setTriggerOpenPatient(true); document.getElementById('patientendaten')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                    className="mt-1.5 text-[13px] font-semibold flex items-center gap-1 transition-colors"
                    style={{color:'#8B7355'}}
                  >
                    Jetzt ausfüllen ↑
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── SECTION HEADER: Häufige Fragen ── */}
        <div className="px-1 pt-3">
          <h2 className="text-[1.1rem] font-bold" style={{color:'#3D3D3D'}}>Häufige Fragen</h2>
          <div className="mt-1.5 h-[2px] w-10 rounded-full" style={{background:'#8B7355'}} />
        </div>
        <div className="rounded-2xl overflow-hidden border" style={{background:'white', borderColor:'#E5E3DF'}}>
          {[
            { q: 'Was bedeutet „Einladen"?', a: 'Wenn Ihnen eine Pflegekraft gefällt, können Sie sie einladen, sich bei Ihnen zu bewerben. Voraussetzung ist, dass das Patientenprofil vollständig ausgefüllt ist — damit sich die Pflegekraft optimal vorbereiten kann. Erst wenn Sie ein konkretes Angebot annehmen, kommt ein Vertrag zustande.' },
            { q: 'Gehe ich mit dem Einladen einen Vertrag ein?', a: 'Nein — das Einladen und Anschauen von Profilen ist vollständig unverbindlich. Ein Vertrag kommt erst zustande, wenn Sie ein konkretes Angebot ausdrücklich annehmen.' },
            { q: 'Kann ich jederzeit kündigen?', a: 'Ja, täglich kündbar — ohne Mindestlaufzeit und ohne Angabe von Gründen. Kosten entstehen ausschließlich für Tage, an denen die Pflegekraft tatsächlich vor Ort ist.' },
            { q: 'Wie funktioniert die Abrechnung?', a: 'Tagesgenau: Sie zahlen nur für geleistete Betreuungstage. Die Rechnung für den laufenden Monat wird jeweils zur Monatsmitte erstellt — transparent, nachvollziehbar, ohne versteckte Posten.' },
            { q: 'Wie lange bleibt die Pflegekraft — und wie läuft der Wechsel?', a: 'Pflegekräfte bleiben im Durchschnitt 6 bis 8 Wochen. Zur Mitte des Einsatzes beginnen wir bereits mit der Planung der Nachfolge, damit der Übergang nahtlos klappt. Sie müssen sich um nichts kümmern — Primundus organisiert den gesamten Wechsel.' },
            { q: 'Was passiert, wenn die Pflegekraft ausfällt?', a: 'Primundus kümmert sich umgehend um eine qualifizierte Vertretung. Ihr persönlicher Ansprechpartner informiert Sie proaktiv und begleitet die Übergabe.' },
            { q: 'Wie werden Reisekosten abgerechnet?', a: 'Die Reisekosten betragen pauschal 125 € pro Strecke — also je einmal bei der Anreise und bei der Abreise. Weitere versteckte Reisekosten gibt es nicht.' },
            { q: 'Ist das legal?', a: 'Ja, vollständig. Die Pflegekräfte sind sozialversicherungspflichtig bei uns angestellt und werden von uns nach Deutschland entsandt. Für jeden Einsatz liegt eine offizielle A1-Bescheinigung vor — der Nachweis der Sozialversicherungspflicht im Herkunftsland.' },
            { q: 'Mit wem wird der Vertrag geschlossen?', a: 'Der Betreuungsvertrag wird mit unserer Muttergesellschaft, der Vitanas Group, geschlossen — einem der größten und erfahrensten Pflegeunternehmen Deutschlands.' },
            { q: 'Welche Kosten entstehen insgesamt?', a: 'Es gibt vier Kostenpunkte: Die monatlichen Betreuungskosten laut Ihrem Angebot. Anreise und Abreise pauschal je 125 €. Kost und Logis, die Sie der Pflegekraft frei zur Verfügung stellen. Fällt der Einsatz in einen Sommermonat (Juli oder August), kommen einmalig 200 € Urlaubszuschlag hinzu. Gesetzliche Feiertage werden mit dem doppelten Tagessatz berechnet. Darüber hinaus gibt es keinerlei versteckte Kosten.' },
          ].map((item, i, arr) => (
            <div key={i} className={i < arr.length - 1 ? 'border-b' : ''} style={{borderColor:'#E5E3DF'}}>
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between px-5 py-5 text-left transition-colors duration-150"
                style={{background: openFaq === i ? '#FAFAF9' : 'transparent'}}
              >
                <span className="text-[15px] font-semibold pr-4 leading-snug transition-colors duration-150"
                  style={{color: openFaq === i ? '#6B5444' : '#3D3D3D'}}>
                  {item.q}
                </span>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
                  openFaq === i ? 'bg-[#8B7355]' : 'bg-[#F0EDE8]'
                }`}>
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${
                    openFaq === i ? 'rotate-180 text-white' : 'text-[#8B7355]'
                  }`} />
                </div>
              </button>
              {openFaq === i && (
                <div className="px-5 pb-6 pt-1" style={{background:'#FAFAF9'}}>
                  <p className="text-[15px] leading-[1.75] text-gray-600">{item.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Ilka-Box (Beraterin / Trust / CTA) ── */}
        <div className="rounded-2xl overflow-hidden border bg-white" style={{borderColor:'#E5E3DF'}}>
          <div className="px-5 pt-5 pb-5 space-y-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Noch Fragen? Ihre Beraterin</p>
            <div className="flex items-center gap-4">
              <div className="relative flex-shrink-0">
                <img
                  src="/ilka.webp"
                  alt="Ilka Wysocki"
                  className="w-[72px] h-[72px] rounded-2xl object-cover object-top"
                  style={{border:'1.5px solid #F0C4B4'}}
                />
                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-[#22A06B] rounded-full border-2 border-white">
                  <span className="relative flex h-full w-full items-center justify-center">
                    <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-white opacity-60" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
                  </span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 text-base leading-tight">Ilka Wysocki</p>
                <p className="text-xs text-gray-500 mb-2">Pflegeberaterin · Primundus</p>
                <a href="tel:089200000830" className="inline-flex items-center gap-1.5 text-[#8B7355] font-bold text-sm hover:opacity-80 transition-opacity">
                  <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                  089 200 000 830
                </a>
                <p className="text-xs text-gray-500 mt-0.5">Mo–So, 8:00–18:00 Uhr</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="text-center bg-gray-50 rounded-xl py-3 px-1 border border-gray-100">
                <img src="/badge-testsieger.webp" alt="Testsieger" className="h-8 w-auto mx-auto mb-1.5 object-contain" />
                <p className="text-xs font-semibold text-gray-500 leading-tight">Testsieger<br/>Die Welt</p>
              </div>
              <div className="text-center bg-gray-50 rounded-xl py-3 px-1 border border-gray-100">
                <div className="flex justify-center mb-1.5">
                  <svg className="w-6 h-6 text-[#8B7355]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-xs font-semibold text-gray-500 leading-tight">20+ Jahre<br/>Erfahrung</p>
              </div>
              <div className="text-center bg-gray-50 rounded-xl py-3 px-1 border border-gray-100">
                <div className="flex justify-center mb-1.5">
                  <svg className="w-6 h-6 text-[#8B7355]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <p className="text-xs font-semibold text-gray-500 leading-tight">60.000+<br/>Einsätze</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider text-center mb-2.5">Bekannt aus</p>
              <div className="flex items-center justify-center gap-4 flex-wrap">
                {[
                  { src: '/media-welt.webp', alt: 'Die Welt' },
                  { src: '/media-bildderfau.webp', alt: 'Bild der Frau' },
                  { src: '/media-faz.webp', alt: 'FAZ' },
                  { src: '/media-ard.webp', alt: 'ARD' },
                  { src: '/media-ndr.webp', alt: 'NDR' },
                  { src: '/media-sat1.webp', alt: 'SAT.1' },
                ].map(logo => (
                  <img key={logo.alt} src={logo.src} alt={logo.alt} className="h-4 w-auto object-contain opacity-50 grayscale" />
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <a
                href="tel:089200000830"
                className="flex-1 flex items-center justify-center gap-2 bg-[#E76F63] hover:bg-[#D65E52] text-white rounded-xl py-3 text-sm font-bold transition-colors"
              >
                <Phone className="w-4 h-4" />
                Anrufen
              </a>
              <a
                href="https://wa.me/4989200000830"
                target="_blank"
                rel="noreferrer"
                className="flex-1 flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20BA5A] text-white rounded-xl py-3 text-sm font-bold transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.555 4.116 1.529 5.845L.057 23.571l5.865-1.539A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.894a9.86 9.86 0 01-5.031-1.378l-.361-.214-3.741.981.999-3.648-.235-.374A9.86 9.86 0 012.106 12C2.106 6.58 6.58 2.106 12 2.106S21.894 6.58 21.894 12 17.42 21.894 12 21.894z"/>
                </svg>
                WhatsApp
              </a>
            </div>
          </div>
        </div>

      </div>
      </>
      )}

      {/* Angebot prüfen Modal */}
      {selectedApp && (
        <AngebotPruefenModal
          app={selectedApp}
          onClose={() => setSelectedApp(null)}
          onAccept={acceptApp}
          onNurseClick={(n) => openNurseFromApp(n, selectedApp)}
        />
      )}

      {/* Nurse Detail Modal */}
      {selectedNurse && enrichedSelectedNurse && (
        <CustomerNurseModal
          nurse={enrichedSelectedNurse}
          profileLoading={caregiverLoading && !fullCaregiver}
          onClose={() => { setSelectedNurse(null); setNurseModalApp(null); setNurseMatchIdx(null); }}
          app={nurseModalApp ?? undefined}
          onReview={() => { setSelectedNurse(null); setSelectedApp(nurseModalApp); setNurseModalApp(null); }}
          onDecline={() => { setDeclineConfirmApp(nurseModalApp); setSelectedNurse(null); setNurseModalApp(null); }}
          onUndo={() => { if (nurseModalApp) undoApp(nurseModalApp.id); setNurseModalApp(null); }}
          isInvited={nurseMatchIdx !== null && nurseStatuses[nurseMatchIdx] === 'invited'}
          onInvite={nurseMatchIdx !== null ? async () => {
            const idx = nurseMatchIdx;
            // Modal animation is driven by the returned Promise — surfaces
            // failure to the user instead of fake success (CLAUDE.md §1).
            try {
              if (canInviteNurse(idx)) {
                await confirmInviteNurse(idx, displayName(selectedNurse.name));
              }
            } finally {
              setSelectedNurse(null); setNurseMatchIdx(null);
            }
          } : undefined}
          onDeclineMatch={nurseMatchIdx !== null ? () => {
            declineNurse(nurseMatchIdx);
            setSelectedNurse(null); setNurseMatchIdx(null);
          } : undefined}
        />
      )}

      {/* Info Popup */}
      {showInfoPopup && <InfoPopup onClose={() => setShowInfoPopup(false)} />}

      {undoErrorOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]" onClick={() => setUndoErrorOpen(false)}
            style={{ animation: 'fadeIn 0.15s ease-out' }} />
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 pointer-events-none"
            style={{ animation: 'fadeIn 0.15s ease-out' }}>
            <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl pointer-events-auto shadow-2xl"
              style={{ animation: 'slideSheet 0.25s cubic-bezier(0.32,0.72,0,1)' }}
              onClick={e => e.stopPropagation()}>
              <div className="flex justify-center pt-3 pb-1 sm:hidden"><div className="w-10 h-1 rounded-full bg-gray-300" /></div>
              <div className="px-5 pt-4 pb-6 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0 text-xl">⚠️</div>
                  <div>
                    <h2 className="text-base font-bold text-gray-900">Rückgängig machen derzeit nicht möglich</h2>
                    <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                      Eine abgelehnte Bewerbung kann aktuell nicht automatisch wiederhergestellt werden.
                      Bitte kontaktieren Sie Ihre Ansprechpartnerin — sie kann die Bewerbung manuell
                      reaktivieren.
                    </p>
                  </div>
                </div>
                <a
                  href="tel:089200000830"
                  className="flex items-center justify-center gap-2 w-full bg-[#9B1FA1] hover:bg-[#7B1A85] text-white rounded-xl py-3 text-sm font-bold transition-colors"
                >
                  <Phone className="w-4 h-4" />
                  Beraterin anrufen: 089 200 000 830
                </a>
                <button
                  onClick={() => setUndoErrorOpen(false)}
                  className="w-full text-gray-500 font-semibold py-2 text-sm"
                >
                  Schließen
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Contact Popup */}
      {showContactPopup && <ContactPopup onClose={() => setShowContactPopup(false)} />}

      {/* Patient Reminder Popup */}
      {showPatientReminder && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70]" onClick={() => setShowPatientReminder(false)} style={{ animation: 'fadeIn 0.2s ease-out' }} />
          <div className="fixed inset-0 z-[70] flex items-end justify-center pointer-events-none" style={{ animation: 'fadeIn 0.2s ease-out' }}>
            <div className="bg-white w-full rounded-t-3xl pointer-events-auto shadow-2xl px-5 pt-5 pb-8 space-y-4" style={{ animation: 'slideSheet 0.3s cubic-bezier(0.32,0.72,0,1)' }}
              onClick={e => e.stopPropagation()}>
              <div className="flex justify-center mb-1">
                <div className="w-10 h-1 rounded-full bg-gray-200" />
              </div>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0 text-xl">⚠️</div>
                <div>
                  <p className="text-base font-bold text-gray-900">Patientendaten fehlen noch</p>
                  <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                    Bevor Pflegekräfte eingeladen werden können, benötigen wir noch Angaben zum Patienten und Haushalt — damit sich alle Bewerberinnen optimal vorbereiten können.
                  </p>
                </div>
              </div>
              <div className="bg-[#FFF8E7] border border-amber-200 rounded-xl px-4 py-3">
                <p className="text-xs text-amber-800 leading-relaxed">
                  Ohne vollständige Patientendaten können Pflegekräfte keine fundierte Bewerbung einreichen.
                </p>
              </div>
              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={() => { setShowPatientReminder(false); setTriggerOpenPatient(true); }}
                  className="w-full bg-[#9B1FA1] text-white font-bold py-3.5 rounded-2xl text-sm hover:bg-[#7B1A85] transition-colors"
                >
                  Jetzt Patientendaten ausfüllen
                </button>
                <button
                  onClick={() => setShowPatientReminder(false)}
                  className="w-full text-gray-500 font-semibold py-2.5 text-sm"
                >
                  Später erledigen
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Decline Confirm Modal */}
      {declineConfirmApp && (
        <DeclineConfirmModal
          app={declineConfirmApp}
          onCancel={() => setDeclineConfirmApp(null)}
          onConfirm={(msg) => {
            const id = declineConfirmApp.id;
            setDeclineConfirmApp(null);
            animateThenProcess(id, () => {
              declineApp(id, msg);
              showToast('Bewerbung abgelehnt' + (msg ? ' — Nachricht wurde gesendet.' : '.'));
            });
          }}
        />
      )}

      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translate(-50%, -12px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideSheet { from { opacity: 0; transform: translateY(24px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes exitCard { 0% { opacity: 1; transform: translateY(0) } 100% { opacity: 0; transform: translateY(16px) } }
      `}</style>
    </div>
    </div>
    </div>

    {import.meta.env.VITE_DEBUG === '1' && (
      <div className="fixed bottom-0 inset-x-0 bg-black/85 text-white text-[11px] font-mono px-3 py-2 z-[100] overflow-x-auto whitespace-nowrap">
        <span className="text-emerald-400">Mamamia</span>
        {' '}ready={String(mmReady)}
        {mmError && <span className="text-red-400"> · err={mmError.message}</span>}
        {session && (
          <>
            {' · '}cust={session.customer_id}
            {' · '}job={session.job_offer_id}
            {' · '}apps={mmApplications?.total ?? '…'}
            {' · '}matches={mmMatchings?.total ?? '…'}
            {' · '}name={customerDisplayName(mmCustomer) ?? '…'}
            {' · '}arrival={jobOfferArrivalDisplay(mmJobOffer) ?? '…'}
          </>
        )}
      </div>
    )}
    {debugOverlay}
    </>
  );
};

export default CustomerPortalPage;
