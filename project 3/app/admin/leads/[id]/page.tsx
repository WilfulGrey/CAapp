"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient } from '@supabase/supabase-js';
import { Loader as Loader2, ArrowLeft, Mail, Phone, Calendar, MapPin, FileText, Clock, Download, CreditCard as Edit, Save, X, RefreshCw, User, BellOff, CircleCheck as CheckCircle, MessageSquare, Copy, Check } from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const leadId = params.id as string;

  const [lead, setLead] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [scheduledEmails, setScheduledEmails] = useState<any[]>([]);
  const [vertrag, setVertrag] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedData, setEditedData] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [editedContact, setEditedContact] = useState<any>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  // Token recovery UI: feedback flags for the two Copy buttons. Each
  // flips to true for 2s then back so the icon/label shows "Kopiert".
  const [tokenCopied, setTokenCopied] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  useEffect(() => {
    loadLeadDetails();
  }, [leadId]);

  const loadLeadDetails = async () => {
    try {
      setLoading(true);

      const { data: leadData } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single();

      const { data: eventsData } = await supabase
        .from('lead_events')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });

      const { data: vertragData } = await supabase
        .from('vertraege')
        .select('*')
        .eq('lead_id', leadId)
        .maybeSingle();

      const { data: scheduledEmailsData } = await supabase
        .from('scheduled_emails')
        .select('*')
        .eq('lead_id', leadId)
        .order('scheduled_for', { ascending: true });

      if (leadData) {
        setLead(leadData);
        setAdminNotes(leadData.admin_notes || '');
      }
      if (eventsData) setEvents(eventsData);
      if (vertragData) setVertrag(vertragData);
      if (scheduledEmailsData) setScheduledEmails(scheduledEmailsData);

      setLoading(false);
    } catch (error) {
      console.error('Fehler beim Laden der Lead-Details:', error);
      setLoading(false);
    }
  };

  const handleEditStart = () => {
    const formularDaten = getFormularDatenDisplay();
    const defaultData = {
      care_start_timing: 'sofort',
      betreuung_fuer: '1-person',
      pflegegrad: 0,
      weitere_personen: 'nein',
      mobilitaet: 'mobil',
      nachteinsaetze: 'nein',
      deutschkenntnisse: 'grundlegend',
      erfahrung: 'einsteiger',
      fuehrerschein: 'egal',
      geschlecht: 'egal',
    };
    setEditedData({ ...defaultData, ...formularDaten });
    setIsEditMode(true);
  };

  const handleEditCancel = () => {
    setIsEditMode(false);
    setEditedData(null);
  };

  const handleRecalculate = async () => {
    if (!editedData) return;

    setIsRecalculating(true);
    try {
      const response = await fetch('/api/kalkulation-berechnen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formularDaten: editedData }),
      });

      if (response.ok) {
        const kalkulation = await response.json();
        const updatedKalkulation = {
          ...kalkulation,
          formularDaten: editedData,
        };

        const { error } = await supabase
          .from('leads')
          .update({ kalkulation: updatedKalkulation })
          .eq('id', leadId);

        if (!error) {
          await loadLeadDetails();
          setIsEditMode(false);
          setEditedData(null);
        }
      }
    } catch (error) {
      console.error('Fehler bei Neuberechnung:', error);
    } finally {
      setIsRecalculating(false);
    }
  };

  const handleSaveChanges = async () => {
    if (!editedData) return;

    setIsSaving(true);
    try {
      const updatedKalkulation = {
        ...lead.kalkulation,
        formularDaten: editedData,
      };

      const { error } = await supabase
        .from('leads')
        .update({ kalkulation: updatedKalkulation })
        .eq('id', leadId);

      if (!error) {
        await loadLeadDetails();
        setIsEditMode(false);
        setEditedData(null);
      }
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenKalkulation = () => {
    window.open(`/kalkulation/${leadId}`, '_blank');
  };

  const handleEditContactStart = () => {
    setEditedContact({
      vorname: lead.vorname || '',
      nachname: lead.nachname || '',
      anrede: lead.anrede || '',
      anrede_text: (lead as any).anrede_text || '',
      email: lead.email || '',
      telefon: lead.telefon || '',
    });
    setIsEditingContact(true);
  };

  const handleEditContactCancel = () => {
    setIsEditingContact(false);
    setEditedContact(null);
  };

  const handleSetStatus = async (newStatus: string) => {
    setIsSavingStatus(true);
    try {
      const { error } = await supabase
        .from('leads')
        .update({ status: newStatus })
        .eq('id', leadId);

      if (!error) {
        if (newStatus === 'nicht_interessiert') {
          await supabase
            .from('scheduled_emails')
            .update({ status: 'cancelled' })
            .eq('lead_id', leadId)
            .eq('status', 'pending');
        }
        await loadLeadDetails();
      }
    } catch (error) {
      console.error('Fehler beim Status-Update:', error);
    } finally {
      setIsSavingStatus(false);
    }
  };

  const handleSaveNotes = async () => {
    try {
      await supabase
        .from('leads')
        .update({ admin_notes: adminNotes })
        .eq('id', leadId);
      setIsEditingNotes(false);
      await loadLeadDetails();
    } catch (error) {
      console.error('Fehler beim Speichern der Notizen:', error);
    }
  };

  const handleSaveContact = async () => {
    if (!editedContact) return;

    setIsSaving(true);
    try {
      const vorname = editedContact.vorname || null;
      const nachname = editedContact.nachname || null;
      const anrede = editedContact.anrede || null;
      const anrede_text = editedContact.anrede_text || null;
      const email = editedContact.email || null;
      const telefon = editedContact.telefon || null;

      const { data, error } = await supabase.rpc('update_lead_contact', {
        lead_id: leadId,
        p_vorname: vorname,
        p_nachname: nachname,
        p_anrede: anrede,
        p_anrede_text: anrede_text
      });

      if (!error && (email !== lead.email || telefon !== lead.telefon)) {
        await supabase
          .from('leads')
          .update({ email, telefon })
          .eq('id', leadId);
      }

      if (error) {
        console.error('Fehler beim Speichern:', error);
        alert(`Fehler beim Speichern: ${error.message}`);
        return;
      }

      console.log('✅ Kontaktdaten gespeichert');
      await loadLeadDetails();
      setIsEditingContact(false);
      setEditedContact(null);
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
      alert(`Fehler: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[#5C4A32]" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Lead nicht gefunden</p>
        <Button onClick={() => router.push('/admin/leads')} className="mt-4">
          Zurück zur Übersicht
        </Button>
      </div>
    );
  }

  const kalkulation = lead.kalkulation;

  const getFormularDatenDisplay = () => {
    if (kalkulation?.formularDaten) {
      return kalkulation.formularDaten;
    }

    if (kalkulation?.aufschluesselung && Array.isArray(kalkulation.aufschluesselung)) {
      const aufschluesselung = kalkulation.aufschluesselung;
      const extractedData: any = {};

      aufschluesselung.forEach((item: any) => {
        if (item.kategorie && item.antwort) {
          if (item.kategorie === 'care_start_timing') {
            extractedData.care_start_timing = item.antwort;
          } else if (item.kategorie === 'betreuung_fuer') {
            extractedData.betreuung_fuer = item.antwort;
          } else if (item.kategorie === 'pflegegrad') {
            extractedData.pflegegrad = item.antwort;
          } else if (item.kategorie === 'weitere_personen') {
            extractedData.weitere_personen = item.antwort;
          } else if (item.kategorie === 'mobilitaet') {
            extractedData.mobilitaet = item.antwort;
          } else if (item.kategorie === 'nachteinsaetze') {
            extractedData.nachteinsaetze = item.antwort;
          } else if (item.kategorie === 'deutschkenntnisse') {
            extractedData.deutschkenntnisse = item.antwort;
          } else if (item.kategorie === 'erfahrung') {
            extractedData.erfahrung = item.antwort;
          } else if (item.kategorie === 'fuehrerschein') {
            extractedData.fuehrerschein = item.antwort;
          } else if (item.kategorie === 'geschlecht') {
            extractedData.geschlecht = item.antwort;
          }
        }
      });

      if (Object.keys(extractedData).length > 0) {
        return extractedData;
      }
    }

    return null;
  };

  const formularDaten = getFormularDatenDisplay();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            onClick={() => router.push('/admin/leads')}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Zurück
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {lead.vorname || 'Lead'} #{lead.id.slice(0, 8)}
            </h1>
            <p className="text-gray-600 mt-1">Lead-Details und Timeline</p>
          </div>
        </div>
        {kalkulation && (
          <Button
            onClick={handleOpenKalkulation}
            className="flex items-center gap-2 bg-[#5C4A32] hover:bg-[#4A3A28]"
          >
            <FileText className="w-4 h-4" />
            Kalkulation anzeigen
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Kontaktinformationen</h2>
              {!isEditingContact && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleEditContactStart}
                  className="flex items-center gap-2"
                >
                  <Edit className="w-4 h-4" />
                  Bearbeiten
                </Button>
              )}
            </div>

            {isEditingContact ? (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">
                    Anrede
                  </label>
                  <select
                    value={editedContact.anrede}
                    onChange={(e) =>
                      setEditedContact({ ...editedContact, anrede: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#5C4A32]"
                  >
                    <option value="">Automatisch ermitteln</option>
                    <option value="Herr">Herr</option>
                    <option value="Frau">Frau</option>
                    <option value="Familie">Familie</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">
                    Vorname
                  </label>
                  <input
                    type="text"
                    value={editedContact.vorname}
                    onChange={(e) =>
                      setEditedContact({ ...editedContact, vorname: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#5C4A32]"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">
                    Nachname
                  </label>
                  <input
                    type="text"
                    value={editedContact.nachname}
                    onChange={(e) =>
                      setEditedContact({ ...editedContact, nachname: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#5C4A32]"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">
                    Anrede-Text (individuell)
                  </label>
                  <input
                    type="text"
                    value={editedContact.anrede_text || ''}
                    onChange={(e) =>
                      setEditedContact({ ...editedContact, anrede_text: e.target.value })
                    }
                    placeholder="z.B. Sehr geehrte Frau Schmidt"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#5C4A32]"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Optional: Überschreibt die automatische Anrede in der Kalkulation
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">
                    E-Mail
                  </label>
                  <input
                    type="email"
                    value={editedContact.email || ''}
                    onChange={(e) =>
                      setEditedContact({ ...editedContact, email: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#5C4A32]"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">
                    Telefon
                  </label>
                  <input
                    type="tel"
                    value={editedContact.telefon || ''}
                    onChange={(e) =>
                      setEditedContact({ ...editedContact, telefon: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#5C4A32]"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={handleSaveContact}
                    disabled={isSaving}
                    className="flex-1 bg-[#5C4A32] hover:bg-[#4A3A28]"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Speichern...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Speichern
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleEditContactCancel}
                    disabled={isSaving}
                    className="flex-1"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Abbrechen
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {lead.anrede && (
                  <div className="flex items-center gap-3">
                    <User className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-600">Anrede</p>
                      <p className="font-medium">{lead.anrede}</p>
                    </div>
                  </div>
                )}
                {lead.vorname && (
                  <div className="flex items-center gap-3">
                    <User className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-600">Vorname</p>
                      <p className="font-medium">{lead.vorname}</p>
                    </div>
                  </div>
                )}
                {lead.nachname && (
                  <div className="flex items-center gap-3">
                    <User className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-600">Nachname</p>
                      <p className="font-medium">{lead.nachname}</p>
                    </div>
                  </div>
                )}
                {(lead as any).anrede_text && (
                  <div className="flex items-center gap-3">
                    <User className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-600">Individuelle Anrede</p>
                      <p className="font-medium">{(lead as any).anrede_text}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-600">E-Mail</p>
                    <p className="font-medium">{lead.email}</p>
                  </div>
                </div>
                {lead.telefon && (
                  <div className="flex items-center gap-3">
                    <Phone className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-600">Telefon</p>
                      <p className="font-medium">{lead.telefon}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-600">Erstellt am</p>
                    <p className="font-medium">
                      {new Date(lead.created_at).toLocaleString('de-DE')}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {lead.order_confirmed_at && (
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-5">
                <MapPin className="w-5 h-5 text-[#5C4A32]" />
                <h2 className="text-xl font-bold">Beauftragung & Einsatzort</h2>
                <span className="ml-auto text-xs text-gray-500">
                  {new Date(lead.order_confirmed_at).toLocaleString('de-DE')}
                </span>
              </div>

              <div className="space-y-5">
                {/* Kontaktperson (aktualisiert bei Beauftragung) */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Kontaktperson (bestätigt)</p>
                  <div className="grid grid-cols-2 gap-3">
                    {lead.anrede_text && (
                      <div>
                        <p className="text-sm text-gray-500">Anrede</p>
                        <p className="font-medium">{lead.anrede_text}</p>
                      </div>
                    )}
                    {lead.vorname && (
                      <div>
                        <p className="text-sm text-gray-500">Name</p>
                        <p className="font-medium">{lead.vorname} {lead.nachname}</p>
                      </div>
                    )}
                    {lead.email && (
                      <div>
                        <p className="text-sm text-gray-500">E-Mail</p>
                        <p className="font-medium">{lead.email}</p>
                      </div>
                    )}
                    {lead.telefon && (
                      <div>
                        <p className="text-sm text-gray-500">Telefon</p>
                        <p className="font-medium">{lead.telefon}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Einsatzort / Zu betreuende Person */}
                {(lead.patient_vorname || lead.patient_street) && (
                  <div className="border-t pt-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Zu betreuende Person & Einsatzort</p>
                    <div className="grid grid-cols-2 gap-3">
                      {(lead.patient_anrede || lead.patient_vorname || lead.patient_nachname) && (
                        <div className="col-span-2">
                          <p className="text-sm text-gray-500">Person</p>
                          <p className="font-medium">
                            {[lead.patient_anrede, lead.patient_vorname, lead.patient_nachname].filter(Boolean).join(' ')}
                          </p>
                        </div>
                      )}
                      {lead.patient_street && (
                        <div className="col-span-2">
                          <p className="text-sm text-gray-500">Adresse</p>
                          <p className="font-medium">
                            {lead.patient_street}, {lead.patient_zip} {lead.patient_city}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Besondere Anforderungen */}
                {lead.special_requirements && (
                  <div className="border-t pt-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Besondere Anforderungen</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{lead.special_requirements}</p>
                  </div>
                )}
              </div>
            </Card>
          )}

          {vertrag && (
            <Card className="p-6">
              <h2 className="text-xl font-bold mb-4">Vertragsdaten</h2>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Patient</p>
                    <p className="font-medium">
                      {vertrag.patient_vorname} {vertrag.patient_nachname}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Geburtsdatum</p>
                    <p className="font-medium">
                      {new Date(vertrag.patient_geburtsdatum).toLocaleDateString('de-DE')}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Adresse</p>
                  <p className="font-medium">
                    {vertrag.patient_strasse}, {vertrag.patient_plz}{' '}
                    {vertrag.patient_ort}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Einsatzort</p>
                  <p className="font-medium">
                    {vertrag.einsatzort_strasse}, {vertrag.einsatzort_plz}{' '}
                    {vertrag.einsatzort_ort}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Gewünschter Start</p>
                  <p className="font-medium">
                    {new Date(vertrag.startdatum).toLocaleDateString('de-DE')}
                  </p>
                </div>
              </div>
            </Card>
          )}

          {kalkulation && (
            <>
              {formularDaten && (
                <Card className="p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">Eingaben des Kunden</h2>
                    {!isEditMode ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleEditStart}
                        className="flex items-center gap-2"
                      >
                        <Edit className="w-4 h-4" />
                        Bearbeiten
                      </Button>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleEditCancel}
                          className="flex items-center gap-2"
                        >
                          <X className="w-4 h-4" />
                          Abbrechen
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleRecalculate}
                          disabled={isRecalculating}
                          className="flex items-center gap-2 bg-[#5C4A32] hover:bg-[#4A3A28]"
                        >
                          {isRecalculating ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
                          )}
                          Neu berechnen
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Ab wann wird eine Betreuung benötigt?</p>
                      {isEditMode ? (
                        <select
                          value={editedData?.care_start_timing || 'sofort'}
                          onChange={(e) =>
                            setEditedData({ ...editedData, care_start_timing: e.target.value })
                          }
                          className="w-full px-3 py-2 border rounded-md"
                        >
                          <option value="sofort">So schnell wie möglich</option>
                          <option value="1-2-wochen">In 1-2 Wochen</option>
                          <option value="1-monat">In ca. 1 Monat</option>
                          <option value="spaeter">Später / noch unklar</option>
                        </select>
                      ) : (
                        <p className="font-medium">
                          {formularDaten.care_start_timing === 'sofort' ? 'So schnell wie möglich' :
                           formularDaten.care_start_timing === '1-2-wochen' ? 'In 1-2 Wochen' :
                           formularDaten.care_start_timing === '1-monat' ? 'In ca. 1 Monat' :
                           formularDaten.care_start_timing === 'spaeter' ? 'Später / noch unklar' :
                           'So schnell wie möglich'}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Betreuung für</p>
                      {isEditMode ? (
                        <select
                          value={editedData?.betreuung_fuer || '1-person'}
                          onChange={(e) =>
                            setEditedData({ ...editedData, betreuung_fuer: e.target.value })
                          }
                          className="w-full px-3 py-2 border rounded-md"
                        >
                          <option value="1-person">1 Person</option>
                          <option value="ehepaar">Ehepaar</option>
                        </select>
                      ) : (
                        <p className="font-medium">
                          {formularDaten.betreuung_fuer === '1-person' ? '1 Person' : 'Ehepaar'}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Pflegegrad</p>
                      {isEditMode ? (
                        <select
                          value={editedData?.pflegegrad || 0}
                          onChange={(e) =>
                            setEditedData({ ...editedData, pflegegrad: parseInt(e.target.value) })
                          }
                          className="w-full px-3 py-2 border rounded-md"
                        >
                          <option value="0">Kein Pflegegrad</option>
                          <option value="1">Pflegegrad 1</option>
                          <option value="2">Pflegegrad 2</option>
                          <option value="3">Pflegegrad 3</option>
                          <option value="4">Pflegegrad 4</option>
                          <option value="5">Pflegegrad 5</option>
                        </select>
                      ) : (
                        <p className="font-medium">Pflegegrad {formularDaten.pflegegrad}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Weitere Personen im Haushalt</p>
                      {isEditMode ? (
                        <select
                          value={editedData?.weitere_personen || 'nein'}
                          onChange={(e) =>
                            setEditedData({ ...editedData, weitere_personen: e.target.value })
                          }
                          className="w-full px-3 py-2 border rounded-md"
                        >
                          <option value="nein">Nein</option>
                          <option value="ja">Ja</option>
                        </select>
                      ) : (
                        <p className="font-medium">
                          {formularDaten.weitere_personen === 'ja' ? 'Ja' : 'Nein'}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Mobilität</p>
                      {isEditMode ? (
                        <select
                          value={editedData?.mobilitaet || 'mobil'}
                          onChange={(e) =>
                            setEditedData({ ...editedData, mobilitaet: e.target.value })
                          }
                          className="w-full px-3 py-2 border rounded-md"
                        >
                          <option value="mobil">Mobil</option>
                          <option value="rollator">Rollator</option>
                          <option value="rollstuhl">Rollstuhl</option>
                          <option value="bettlaegerig">Bettlägerig</option>
                        </select>
                      ) : (
                        <p className="font-medium capitalize">{formularDaten.mobilitaet}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Nachteinsätze</p>
                      {isEditMode ? (
                        <select
                          value={editedData?.nachteinsaetze || 'nein'}
                          onChange={(e) =>
                            setEditedData({ ...editedData, nachteinsaetze: e.target.value })
                          }
                          className="w-full px-3 py-2 border rounded-md"
                        >
                          <option value="nein">Nein</option>
                          <option value="gelegentlich">Gelegentlich</option>
                          <option value="taeglich">Täglich</option>
                          <option value="mehrmals">Mehrmals</option>
                        </select>
                      ) : (
                        <p className="font-medium capitalize">{formularDaten?.nachteinsaetze || 'Nein'}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Deutschkenntnisse</p>
                      {isEditMode ? (
                        <select
                          value={editedData?.deutschkenntnisse || 'grundlegend'}
                          onChange={(e) =>
                            setEditedData({
                              ...editedData,
                              deutschkenntnisse: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 border rounded-md"
                        >
                          <option value="grundlegend">Grundlegend</option>
                          <option value="kommunikativ">Kommunikativ</option>
                          <option value="sehr-gut">Fortgeschritten</option>
                        </select>
                      ) : (
                        <p className="font-medium capitalize">
                          {formularDaten?.deutschkenntnisse?.replace('-', ' ') || 'Grundlegend'}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Erfahrung</p>
                      {isEditMode ? (
                        <select
                          value={editedData?.erfahrung || 'einsteiger'}
                          onChange={(e) =>
                            setEditedData({ ...editedData, erfahrung: e.target.value })
                          }
                          className="w-full px-3 py-2 border rounded-md"
                        >
                          <option value="einsteiger">Einsteiger</option>
                          <option value="erfahren">Erfahren</option>
                          <option value="sehr-erfahren">Sehr erfahren</option>
                        </select>
                      ) : (
                        <p className="font-medium capitalize">
                          {formularDaten?.erfahrung?.replace('-', ' ') || 'Einsteiger'}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Führerschein</p>
                      {isEditMode ? (
                        <select
                          value={editedData?.fuehrerschein || 'egal'}
                          onChange={(e) =>
                            setEditedData({ ...editedData, fuehrerschein: e.target.value })
                          }
                          className="w-full px-3 py-2 border rounded-md"
                        >
                          <option value="egal">Egal</option>
                          <option value="ja">Ja</option>
                          <option value="nein">Nein</option>
                        </select>
                      ) : (
                        <p className="font-medium capitalize">
                          {formularDaten?.fuehrerschein === 'egal' ? 'Egal' : formularDaten?.fuehrerschein === 'ja' ? 'Ja' : formularDaten?.fuehrerschein === 'nein' ? 'Nein' : 'Egal'}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Geschlecht Betreuungskraft</p>
                      {isEditMode ? (
                        <select
                          value={editedData?.geschlecht || 'egal'}
                          onChange={(e) =>
                            setEditedData({ ...editedData, geschlecht: e.target.value })
                          }
                          className="w-full px-3 py-2 border rounded-md"
                        >
                          <option value="egal">Egal</option>
                          <option value="weiblich">Weiblich</option>
                          <option value="maennlich">Männlich</option>
                        </select>
                      ) : (
                        <p className="font-medium capitalize">
                          {formularDaten?.geschlecht === 'egal' ? 'Egal' : formularDaten?.geschlecht === 'weiblich' ? 'Weiblich' : formularDaten?.geschlecht === 'maennlich' ? 'Männlich' : 'Egal'}
                        </p>
                      )}
                    </div>
                  </div>
                  {isEditMode && (
                    <div className="mt-4 p-3 bg-blue-50 rounded-md">
                      <p className="text-sm text-blue-800">
                        💡 Klicken Sie auf "Neu berechnen", um die Kalkulation mit den geänderten
                        Daten zu aktualisieren.
                      </p>
                    </div>
                  )}
                </Card>
              )}

              <Card className="p-6">
                <h2 className="text-xl font-bold mb-4">Preisberechnung</h2>
                <div className="space-y-3">
                  {kalkulation.aufschluesselung && kalkulation.aufschluesselung.length > 0 ? (
                    <>
                      <div className="bg-[#F8F7F5] rounded-lg p-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-gray-700">Basispreis</span>
                          <span className="font-bold text-gray-900">
                            {(
                              kalkulation.bruttopreis -
                              kalkulation.aufschluesselung.reduce(
                                (sum: number, item: any) => sum + item.aufschlag,
                                0
                              )
                            ).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}{' '}
                            €
                          </span>
                        </div>
                      </div>
                      {kalkulation.aufschluesselung.map((item: any, idx: number) => (
                        <div key={idx} className="bg-blue-50 rounded-lg p-3">
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="text-sm font-medium text-gray-700">
                                {item.label}
                              </p>
                              <p className="text-xs text-gray-500 capitalize">
                                {item.kategorie.replace('_', ' ')}
                              </p>
                            </div>
                            <span className="font-bold text-blue-700">
                              + {item.aufschlag.toLocaleString('de-DE')} €
                            </span>
                          </div>
                        </div>
                      ))}
                      <div className="bg-gray-100 rounded-lg p-3 border-t-2 border-gray-300">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-gray-900">Bruttopreis gesamt</span>
                          <span className="text-xl font-bold text-gray-900">
                            {kalkulation.bruttopreis?.toLocaleString('de-DE')} €
                          </span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="bg-[#F8F7F5] rounded-lg p-4">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Bruttopreis</span>
                        <span className="font-bold text-gray-900">
                          {kalkulation.bruttopreis?.toLocaleString('de-DE')} €
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </Card>

              <Card className="p-6">
                <h2 className="text-xl font-bold mb-4">Entlastungen & Zuschüsse</h2>
                <div className="space-y-3">
                  {kalkulation.zuschüsse?.items && kalkulation.zuschüsse.items.length > 0 ? (
                    <>
                      {kalkulation.zuschüsse.items.map((zuschuss: any, idx: number) => (
                        <div
                          key={idx}
                          className={`rounded-lg p-4 ${
                            zuschuss.in_kalkulation
                              ? 'bg-green-50 border-2 border-green-200'
                              : 'bg-gray-50'
                          }`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-1">
                              <p className="font-medium text-gray-900">{zuschuss.label}</p>
                              {zuschuss.beschreibung && (
                                <p className="text-xs text-gray-600 mt-1">
                                  {zuschuss.beschreibung}
                                </p>
                              )}
                            </div>
                            <div className="text-right ml-4">
                              <p className="font-bold text-green-700">
                                {zuschuss.betrag_monatlich?.toLocaleString('de-DE')} €
                              </p>
                              <p className="text-xs text-gray-500">pro Monat</p>
                            </div>
                          </div>
                          {zuschuss.hinweis && (
                            <p className="text-xs text-gray-600 mt-2 italic">
                              💡 {zuschuss.hinweis}
                            </p>
                          )}
                          {zuschuss.in_kalkulation && (
                            <p className="text-xs text-green-700 font-medium mt-2">
                              ✓ In Eigenanteil-Berechnung berücksichtigt
                            </p>
                          )}
                        </div>
                      ))}
                      <div className="bg-green-100 rounded-lg p-4 border-t-2 border-green-300 mt-4">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-gray-900">
                            Entlastung gesamt (in Kalkulation)
                          </span>
                          <span className="text-xl font-bold text-green-700">
                            - {kalkulation.zuschüsse.gesamt?.toLocaleString('de-DE')} €
                          </span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-gray-500">Keine Zuschüsse verfügbar</p>
                  )}
                </div>
              </Card>

              <Card className="p-6 bg-gradient-to-br from-[#5C4A32] to-[#8B7355]">
                <h2 className="text-xl font-bold mb-4 text-white">
                  Finales Angebot (monatlich)
                </h2>
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-white/90">
                    <span className="text-sm">Bruttopreis</span>
                    <span className="font-medium">
                      {kalkulation.bruttopreis?.toLocaleString('de-DE')} €
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-white/90">
                    <span className="text-sm">Abzgl. Entlastungen</span>
                    <span className="font-medium">
                      - {kalkulation.zuschüsse?.gesamt?.toLocaleString('de-DE')} €
                    </span>
                  </div>
                  <div className="border-t border-white/30 pt-3">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-bold text-white">
                        Eigenanteil des Kunden
                      </span>
                      <span className="text-3xl font-bold text-white">
                        {kalkulation.eigenanteil?.toLocaleString('de-DE')} €
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-white/70 mt-2">
                    Zzgl. Kost & Logis, Fahrtkosten sowie Feiertagszuschläge
                  </p>
                </div>
              </Card>
            </>
          )}
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-xl font-bold mb-4">Status</h2>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-2">Aktueller Status</p>
                <span
                  className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                    lead.status === 'vertrag_abgeschlossen'
                      ? 'bg-green-100 text-green-800'
                      : lead.status === 'angebot_requested'
                      ? 'bg-orange-100 text-orange-800'
                      : lead.status === 'nicht_interessiert'
                      ? 'bg-gray-200 text-gray-600'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}
                >
                  {lead.status === 'vertrag_abgeschlossen'
                    ? 'Vertrag abgeschlossen'
                    : lead.status === 'angebot_requested'
                    ? 'Angebot angefordert'
                    : lead.status === 'info_requested'
                    ? 'Info angefordert'
                    : lead.status === 'nicht_interessiert'
                    ? 'Nicht interessiert'
                    : lead.status}
                </span>
              </div>

              {lead.status !== 'nicht_interessiert' && lead.status !== 'vertrag_abgeschlossen' && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">Aktionen</p>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isSavingStatus}
                    onClick={() => handleSetStatus('nicht_interessiert')}
                    className="w-full flex items-center gap-2 border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400"
                  >
                    <BellOff className="w-4 h-4" />
                    Nachfassmails stoppen
                  </Button>
                </div>
              )}

              {lead.status === 'nicht_interessiert' && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isSavingStatus}
                  onClick={() => handleSetStatus('angebot_requested')}
                  className="w-full flex items-center gap-2 border-[#5C4A32] text-[#5C4A32] hover:bg-[#5C4A32] hover:text-white"
                >
                  <CheckCircle className="w-4 h-4" />
                  Lead reaktivieren
                </Button>
              )}
              {lead.token && (() => {
                const portalBase =
                  process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://kundenportal.primundus.de';
                const portalUrl = `${portalBase}/?token=${encodeURIComponent(lead.token)}`;
                const copy = async (
                  text: string,
                  setFlag: (v: boolean) => void,
                ): Promise<void> => {
                  try {
                    await navigator.clipboard.writeText(text);
                    setFlag(true);
                    setTimeout(() => setFlag(false), 2000);
                  } catch (err) {
                    console.error('clipboard write failed:', err);
                  }
                };
                const isExpired =
                  lead.token_expires_at &&
                  new Date(lead.token_expires_at) < new Date();
                return (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-600">Vertrags-Token</p>
                    {/* Token + Copy */}
                    <div className="flex items-start gap-2">
                      <p className="flex-1 text-xs font-mono bg-gray-100 p-2 rounded break-all">
                        {lead.token}
                      </p>
                      <button
                        type="button"
                        onClick={() => copy(lead.token, setTokenCopied)}
                        title="Token kopieren"
                        className="px-3 py-2 text-xs font-semibold text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded border border-gray-200 flex items-center gap-1.5 transition-colors flex-shrink-0"
                      >
                        {tokenCopied ? (
                          <Check className="w-3.5 h-3.5 text-green-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        {tokenCopied ? 'Kopiert' : 'Token'}
                      </button>
                    </div>
                    {/* Portal URL + Copy */}
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Portal-Link für den Kunden</p>
                      <div className="flex items-start gap-2">
                        <p className="flex-1 text-xs font-mono bg-gray-50 p-2 rounded break-all text-gray-600">
                          {portalUrl}
                        </p>
                        <button
                          type="button"
                          onClick={() => copy(portalUrl, setUrlCopied)}
                          title="Portal-Link kopieren"
                          className="px-3 py-2 text-xs font-semibold text-white bg-[#5C4A32] hover:bg-[#4A3B26] rounded flex items-center gap-1.5 transition-colors flex-shrink-0"
                        >
                          {urlCopied ? (
                            <Check className="w-3.5 h-3.5" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          {urlCopied ? 'Kopiert' : 'Link'}
                        </button>
                      </div>
                    </div>
                    {lead.token_used && (
                      <p className="text-xs text-green-600">✓ Verwendet</p>
                    )}
                    {lead.token_expires_at && !isExpired && (
                      <p className="text-xs text-gray-500">
                        Gültig bis:{' '}
                        {new Date(lead.token_expires_at).toLocaleDateString('de-DE')}
                      </p>
                    )}
                    {isExpired && (
                      <p className="text-xs text-red-600 font-semibold">
                        ⚠ Token abgelaufen ({new Date(lead.token_expires_at).toLocaleDateString('de-DE')}) — der Kunde kann den Link nicht mehr nutzen.
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-gray-400" />
                Interne Notizen
              </h2>
              {!isEditingNotes && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditingNotes(true)}
                  className="text-xs"
                >
                  <Edit className="w-3 h-3 mr-1" />
                  Bearbeiten
                </Button>
              )}
            </div>
            {isEditingNotes ? (
              <div className="space-y-2">
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={4}
                  placeholder="z.B. Kunde hat sich gemeldet, ruft nächste Woche zurück..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#5C4A32] resize-none"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSaveNotes}
                    className="flex-1 bg-[#5C4A32] hover:bg-[#4A3A28] text-xs"
                  >
                    <Save className="w-3 h-3 mr-1" />
                    Speichern
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setIsEditingNotes(false); setAdminNotes(lead.admin_notes || ''); }}
                    className="flex-1 text-xs"
                  >
                    <X className="w-3 h-3 mr-1" />
                    Abbrechen
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-600 whitespace-pre-wrap">
                {lead.admin_notes || <span className="text-gray-400 italic">Keine Notizen vorhanden</span>}
              </p>
            )}
          </Card>

          <Card className="p-6">
            <h2 className="text-xl font-bold mb-1">Timeline</h2>
            {scheduledEmails.length > 0 && (
              <div className="mb-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Geplante & gesendete Mails</p>
                <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
                  {scheduledEmails.map((email) => {
                    const emailTypeLabels: Record<string, string> = {
                      angebot: 'Angebot',
                      nachfass_1: 'Nachfassmail 1',
                      nachfass_2: 'Nachfassmail 2',
                    };
                    const statusConfig: Record<string, { label: string; className: string }> = {
                      pending: { label: 'Geplant', className: 'bg-amber-50 text-amber-700 border border-amber-200' },
                      processing: { label: 'Wird gesendet', className: 'bg-blue-50 text-blue-700 border border-blue-200' },
                      sent: { label: 'Gesendet', className: 'bg-green-50 text-green-700 border border-green-200' },
                      failed: { label: 'Fehlgeschlagen', className: 'bg-red-50 text-red-700 border border-red-200' },
                      cancelled: { label: 'Abgebrochen', className: 'bg-gray-100 text-gray-500 border border-gray-200' },
                    };
                    const cfg = statusConfig[email.status] ?? { label: email.status, className: 'bg-gray-100 text-gray-500 border border-gray-200' };
                    const dateValue = email.status === 'sent' ? email.sent_at : email.scheduled_for;
                    const dateLabel = email.status === 'sent' ? 'Gesendet' : 'Geplant für';
                    return (
                      <div key={email.id} className="flex items-center gap-3 px-3 py-2.5 bg-white">
                        <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-gray-800">
                            {emailTypeLabels[email.email_type] ?? email.email_type}
                          </span>
                          {dateValue && (
                            <span className="text-xs text-gray-400 ml-2">
                              {dateLabel}: {new Date(dateValue).toLocaleString('de-DE')}
                            </span>
                          )}
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${cfg.className}`}>
                          {cfg.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Aktivitäten</p>
            <div className="space-y-0">
              {events.length === 0 ? (
                <p className="text-sm text-gray-500">Keine Events vorhanden</p>
              ) : (
                events.map((event, idx) => {
                  const eventLabels: Record<string, { label: string; color: string }> = {
                    angebot_requested: { label: 'Anfrage eingegangen', color: 'bg-blue-600' },
                    angebot_requested_duplicate: { label: 'Erneute Anfrage (Duplikat)', color: 'bg-gray-400' },
                    info_requested: { label: 'Info angefordert', color: 'bg-blue-400' },
                    info_requested_duplicate: { label: 'Info erneut angefordert (Duplikat)', color: 'bg-gray-400' },
                    email_eingangsbestaetigung_sent: { label: 'Eingangsbestätigung gesendet', color: 'bg-green-600' },
                    email_eingangsbestaetigung_failed: { label: 'Eingangsbestätigung fehlgeschlagen', color: 'bg-red-500' },
                    email_angebot_scheduled: { label: 'Angebotsmail geplant', color: 'bg-amber-500' },
                    email_angebot_schedule_failed: { label: 'Angebotsmail konnte nicht geplant werden', color: 'bg-red-500' },
                    email_angebot_sent: { label: 'Angebotsmail gesendet', color: 'bg-green-600' },
                    email_angebot_failed: { label: 'Angebotsmail fehlgeschlagen', color: 'bg-red-500' },
                    email_nachfass_1_sent: { label: 'Nachfassmail 1 gesendet', color: 'bg-green-600' },
                    email_nachfass_1_failed: { label: 'Nachfassmail 1 fehlgeschlagen', color: 'bg-red-500' },
                    email_nachfass_1_cancelled: { label: 'Nachfassmail 1 abgebrochen', color: 'bg-gray-400' },
                    email_nachfass_2_sent: { label: 'Nachfassmail 2 gesendet', color: 'bg-green-600' },
                    email_nachfass_2_failed: { label: 'Nachfassmail 2 fehlgeschlagen', color: 'bg-red-500' },
                    email_nachfass_2_cancelled: { label: 'Nachfassmail 2 abgebrochen', color: 'bg-gray-400' },
                    email_kalkulation_sent: { label: 'Kalkulations-Mail gesendet', color: 'bg-green-600' },
                    team_notified: { label: 'Team benachrichtigt', color: 'bg-[#5C4A32]' },
                    team_notified_beauftragt: { label: 'Team über Beauftragung informiert', color: 'bg-[#5C4A32]' },
                    betreuung_beauftragt: { label: 'Betreuung beauftragt', color: 'bg-green-700' },
                    status_upgrade_to_angebot_requested: { label: 'Status auf Angebot hochgestuft', color: 'bg-blue-500' },
                  };
                  const cfg = eventLabels[event.event_type] ?? { label: event.event_type.replace(/_/g, ' '), color: 'bg-[#5C4A32]' };
                  return (
                    <div key={event.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`w-8 h-8 rounded-full ${cfg.color} flex items-center justify-center flex-shrink-0`}>
                          <Clock className="w-4 h-4 text-white" />
                        </div>
                        {idx < events.length - 1 && (
                          <div className="w-px flex-1 bg-gray-200 my-1" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 pb-4">
                        <p className="text-sm font-semibold text-gray-900">
                          {cfg.label}
                        </p>
                        <p className="text-xs text-gray-400 mb-1">
                          {new Date(event.created_at).toLocaleString('de-DE')}
                        </p>
                        {event.metadata && Object.keys(event.metadata).length > 0 && (
                          <div className="mt-1 bg-gray-50 border border-gray-100 rounded-md px-3 py-2 space-y-1">
                            {Object.entries(event.metadata).map(([key, value]) => (
                              <div key={key} className="flex gap-2 text-xs min-w-0">
                                <span className="text-gray-400 flex-shrink-0 font-medium">{key}:</span>
                                <span className="text-gray-700 break-all">{String(value)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
