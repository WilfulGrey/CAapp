"use client";

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createClient } from '@supabase/supabase-js';
import { Search, Loader as Loader2, Mail, Phone, Calendar, ExternalLink } from 'lucide-react';
import Link from 'next/link';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function LeadsPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    loadLeads();
  }, []);

  useEffect(() => {
    filterLeads();
  }, [searchTerm, statusFilter, leads]);

  const loadLeads = async () => {
    try {
      setLoading(true);
      // lead_jobs(count) via FK-Embedding: liefert pro Lead die Anzahl
      // Mamamia-Einsätze OHNE N+1 (Badge „N Einsätze" bei Multi-Job-Kunden).
      const { data } = await supabase
        .from('leads')
        .select('*, lead_jobs(count)')
        .order('created_at', { ascending: false });

      if (data) {
        setLeads(data);
      }
      setLoading(false);
    } catch (error) {
      console.error('Fehler beim Laden der Leads:', error);
      setLoading(false);
    }
  };

  const filterLeads = () => {
    let filtered = [...leads];

    if (statusFilter !== 'all') {
      filtered = filtered.filter((lead) => lead.status === statusFilter);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (lead) =>
          lead.email?.toLowerCase().includes(term) ||
          lead.vorname?.toLowerCase().includes(term) ||
          lead.telefon?.includes(term)
      );
    }

    setFilteredLeads(filtered);
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      info_requested: 'bg-yellow-100 text-yellow-800',
      angebot_requested: 'bg-orange-100 text-orange-800',
      folge_einsatz: 'bg-blue-100 text-blue-800',
      vertrag_abgeschlossen: 'bg-green-100 text-green-800',
      nicht_interessiert: 'bg-gray-200 text-gray-600',
    };
    const labels: Record<string, string> = {
      info_requested: 'Info angefordert',
      angebot_requested: 'Angebot angefordert',
      folge_einsatz: 'Folge-Einsatz',
      vertrag_abgeschlossen: 'Vertrag abgeschlossen',
      nicht_interessiert: 'Nicht interessiert',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
        {labels[status] || status}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[#5C4A32]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Leads</h1>
          <p className="text-gray-600 mt-1">
            Verwalten Sie alle Interessenten ({filteredLeads.length} von {leads.length})
          </p>
        </div>
        <Button onClick={loadLeads} variant="outline">
          Aktualisieren
        </Button>
      </div>

      <Card className="p-6">
        <div className="flex gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Suche nach E-Mail, Name oder Telefon..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Status filtern" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Status</SelectItem>
              <SelectItem value="info_requested">Info angefordert</SelectItem>
              <SelectItem value="angebot_requested">Angebot angefordert</SelectItem>
              <SelectItem value="folge_einsatz">Folge-Einsatz</SelectItem>
              <SelectItem value="vertrag_abgeschlossen">Vertrag abgeschlossen</SelectItem>
              <SelectItem value="nicht_interessiert">Nicht interessiert</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">
                  Kontakt
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">
                  Status
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">
                  Eigenanteil
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">
                  Erstellt
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">
                  Aktionen
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-gray-500">
                    Keine Leads gefunden
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) => (
                  <tr key={lead.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-medium text-gray-900">
                          {[lead.anrede_text, lead.vorname, lead.nachname].filter(Boolean).join(' ') || 'Unbekannt'}
                        </p>
                        <div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
                          <Mail className="w-3 h-3" />
                          {lead.email}
                        </div>
                        {lead.telefon && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Phone className="w-3 h-3" />
                            {lead.telefon}
                          </div>
                        )}
                        {/* Mamamia-Verknüpfung (read-only): zeigt auf einen Blick,
                            welche Leads im Portal onboardet sind + ihre MM-Kunden-ID
                            (Abgleich, Doppel-Anlagen erkennen). */}
                        {lead.mamamia_customer_id && (
                          <span className="inline-block mt-1 text-[11px] font-mono bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded">
                            MM {lead.mamamia_customer_id}
                          </span>
                        )}
                        {/* Multi-Job-Badge: >1 Einsatz im lead_jobs-Spiegel =
                            Folge-Einsatz-Kunde (Bug #25) — Detailseite zeigt
                            die Liste in der Card „Einsätze (Mamamia)". */}
                        {(lead.lead_jobs?.[0]?.count ?? 0) > 1 && (
                          <span className="inline-block mt-1 ml-1 text-[11px] font-medium bg-blue-50 text-blue-800 border border-blue-200 px-1.5 py-0.5 rounded">
                            {lead.lead_jobs[0].count} Einsätze
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">{getStatusBadge(lead.status)}</td>
                    <td className="py-3 px-4">
                      {lead.kalkulation?.eigenanteil ? (
                        <span className="font-medium text-gray-900">
                          {lead.kalkulation.eigenanteil.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        <Calendar className="w-3 h-3 flex-shrink-0" />
                        <span>
                          {new Date(lead.created_at).toLocaleDateString('de-DE', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })}
                          <span className="text-gray-400 ml-1">
                            {new Date(lead.created_at).toLocaleTimeString('de-DE', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Link
                        href={`/admin/leads/${lead.id}`}
                        className="text-[#5C4A32] hover:text-[#7D6850] text-sm font-medium inline-flex items-center gap-1"
                      >
                        Details
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
