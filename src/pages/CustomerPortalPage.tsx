import { useState, useEffect, FC } from 'react';
import { Check, Bell, Phone, AlertCircle, ChevronDown } from 'lucide-react';
import { Nurse } from '../types';
import { displayName } from '../components/portal/shared';
import {
  fetchLeadByToken,
  Lead,
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
      <nav className="sticky top-0 z-40 bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/LOGO-PRIMUNDUS.webp" alt="Primundus" className="h-6" />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowContactPopup(true)}
              className="flex items-center gap-1.5 bg-[#F5EDF6] hover:bg-[#EDD9EF] text-[#9B1FA1] border border-[#D8A9DC] rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
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
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">

        {/* ── Intro ── */}
        <div className="px-1 pt-2">
          <h1 className="text-2xl font-bold text-gray-900 leading-snug mb-2">
            Unser Kundenportal.<br />Transparent. In Ihren Händen.
          </h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            Kein Rätselraten — Angebot ansehen, passende Betreuungskräfte einladen und Bewerbungen direkt annehmen.
          </p>
        </div>

        {/* ── Kombinierte Karte: Identität + Anfrage + Stepper ── */}
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

        {/* ── Bewerbungsstatus ── */}
        {!hasPending ? (
          <div className="bg-gray-50 rounded-2xl px-5 py-4 flex items-center gap-4">
            <div className="w-9 h-9 rounded-full bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
              <Bell className="w-4 h-4 text-gray-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800">Bewerbungen werden für Sie vorbereitet</p>
              <p className="text-xs text-gray-400 mt-0.5">Sie erhalten eine E-Mail sobald eine Pflegekraft sich bewirbt.</p>
              <div className="flex items-center gap-1.5 mt-1.5">
                <svg className="w-3 h-3 text-[#22A06B] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                <span className="text-xs font-medium text-[#22A06B]">{lead?.email ?? mmCustomer?.email ?? ''}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-[#F0FAF5] rounded-2xl px-5 py-4 flex items-center gap-4">
            <div className="w-9 h-9 rounded-full bg-white border border-[#B8E8D4] flex items-center justify-center flex-shrink-0 text-lg">
              🎉
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">
                {pendingApps.length === 1 ? 'Eine Bewerbung aktiv!' : `${pendingApps.length} Bewerbungen aktiv!`}
              </p>
              <p className="text-sm text-[#1a7a4f] mt-0.5">
                Schauen Sie sich {pendingApps.length === 1 ? 'die Pflegekraft' : 'die Pflegekräfte'} in Ruhe an und entscheiden Sie, welches Angebot am besten passt.
              </p>
            </div>
          </div>
        )}

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
                  <div className="flex items-center justify-between mb-3 px-1">
                    <h2 className="text-base font-bold text-gray-900">
                      Für Sie vorausgewählte Pflegekräfte
                      <span className="text-sm font-normal text-gray-400 ml-2">({visibleNurses.length})</span>
                    </h2>
                  </div>

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

        {/* ── SECTION: Was passiert nach der Annahme? ── */}
        <div className="rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Was passiert nach der Annahme?</p>
          </div>
          <div className="divide-y divide-gray-100 bg-white">
            {[
              { n: '1', title: 'Vertragsbestätigung per E-Mail', desc: 'Sie erhalten sofort eine Bestätigung mit allen Details.' },
              { n: '2', title: 'Anreise & Betreuungsbeginn', desc: 'Die Pflegekraft reist zum vereinbarten Startdatum an und beginnt die Betreuung.' },
              { n: '3', title: 'Laufende Begleitung', desc: 'Ihr persönlicher Ansprechpartner ist jederzeit für Sie da — auch während des Einsatzes.' },
              { n: '4', title: 'Nächsten Einsatz planen', desc: 'Zur Mitte des laufenden Einsatzes starten wir die Planung der Nachfolge. Neue Pflegekräfte und alle Infos erscheinen direkt hier im Portal.' },
            ].map((s) => (
              <div key={s.n} className="flex items-start gap-3 px-4 py-3">
                <div className="w-5 h-5 rounded-full bg-[#F5EDF6] text-[#9B1FA1] text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{s.n}</div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{s.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── SECTION: FAQ ── */}
        <div className="rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Häufige Fragen</p>
          </div>
          <div className="divide-y divide-gray-100 bg-white">
            {[
              { q: 'Was bedeutet "Einladen"?', a: 'Wenn Sie eine Pflegekraft einladen, erhält sie eine direkte Anfrage und kann sich offiziell bei Ihnen bewerben. Erst nach einer Bewerbung sehen Sie das konkrete Angebot und können annehmen oder ablehnen.' },
              { q: 'Kann ich kündigen, wenn es nicht passt?', a: 'Ja — Sie können täglich kündigen, sofern in Ihrem Angebot so vereinbart. Es entstehen keine weiteren Kosten nach Abreise der Pflegekraft.' },
              { q: 'Wie läuft die Zahlung ab?', a: 'Die Abrechnung erfolgt monatsgenau. Sie erhalten am Monatsende eine Rechnung für die tatsächlichen Betreuungstage.' },
              { q: 'Was passiert, wenn die Pflegekraft ausfällt?', a: 'Primundus organisiert schnellstmöglich eine Vertretung. Ihr Ansprechpartner informiert Sie proaktiv.' },
              { q: 'Kann ich eine andere Pflegekraft wählen?', a: 'Ja — Sie können Bewerbungen ablehnen und weitere Pflegekräfte einladen. Wir helfen Ihnen, die beste Lösung zu finden.' },
              { q: 'Wie werden Reisekosten abgerechnet?', a: 'Reisekosten fallen einmalig bei An- und Abreise an und sind im Angebot als Pauschale ausgewiesen.' },
            ].map((item, i) => (
              <div key={i}>
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="text-sm font-medium text-gray-800 pr-4">{item.q}</span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === i && (
                  <div className="px-4 pb-3">
                    <p className="text-sm text-gray-500 leading-relaxed">{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>
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
