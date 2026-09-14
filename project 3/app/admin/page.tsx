"use client";

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { createClient } from '@supabase/supabase-js';
import { Users, FileText, CheckCircle2, TrendingUp, Loader2 } from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalLeads: 0,
    leadsToday: 0,
    leadsThisWeek: 0,
    leadsThisMonth: 0,
    infoRequested: 0,
    angebotsRequested: 0,
    vertraegeAbgeschlossen: 0,
    conversionRate: 0,
    avgEigenanteil: 0,
  });
  const [loading, setLoading] = useState(true);
  const [recentLeads, setRecentLeads] = useState<any[]>([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      const { data: allLeads } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });

      if (!allLeads) {
        setLoading(false);
        return;
      }

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

      const leadsToday = allLeads.filter(
        (l) => new Date(l.created_at) >= today
      ).length;
      const leadsThisWeek = allLeads.filter(
        (l) => new Date(l.created_at) >= weekAgo
      ).length;
      const leadsThisMonth = allLeads.filter(
        (l) => new Date(l.created_at) >= monthAgo
      ).length;

      const infoRequested = allLeads.filter((l) => l.status === 'info_requested').length;
      const angebotsRequested = allLeads.filter(
        (l) => l.status === 'angebot_requested'
      ).length;
      const vertraegeAbgeschlossen = allLeads.filter(
        (l) => l.status === 'vertrag_abgeschlossen'
      ).length;

      const conversionRate =
        allLeads.length > 0
          ? Math.round((vertraegeAbgeschlossen / allLeads.length) * 100)
          : 0;

      const leadsWithEigenanteil = allLeads.filter(
        (l) => l.kalkulation?.eigenanteil
      );
      const avgEigenanteil =
        leadsWithEigenanteil.length > 0
          ? Math.round(
              leadsWithEigenanteil.reduce(
                (sum, l) => sum + l.kalkulation.eigenanteil,
                0
              ) / leadsWithEigenanteil.length
            )
          : 0;

      setStats({
        totalLeads: allLeads.length,
        leadsToday,
        leadsThisWeek,
        leadsThisMonth,
        infoRequested,
        angebotsRequested,
        vertraegeAbgeschlossen,
        conversionRate,
        avgEigenanteil,
      });

      setRecentLeads(allLeads.slice(0, 5));
      setLoading(false);
    } catch (error) {
      console.error('Fehler beim Laden der Dashboard-Daten:', error);
      setLoading(false);
    }
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
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">Übersicht über Ihr Lead-Management</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Gesamt Leads</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats.totalLeads}</p>
            </div>
            <Users className="w-10 h-10 text-blue-500" />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Heute: {stats.leadsToday} · Woche: {stats.leadsThisWeek} · Monat:{' '}
            {stats.leadsThisMonth}
          </p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Info angefordert</p>
              <p className="text-3xl font-bold text-yellow-600 mt-1">
                {stats.infoRequested}
              </p>
            </div>
            <FileText className="w-10 h-10 text-yellow-500" />
          </div>
          <p className="text-xs text-gray-500 mt-2">Status: info_requested</p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Angebot angefordert</p>
              <p className="text-3xl font-bold text-orange-600 mt-1">
                {stats.angebotsRequested}
              </p>
            </div>
            <TrendingUp className="w-10 h-10 text-orange-500" />
          </div>
          <p className="text-xs text-gray-500 mt-2">Status: angebot_requested</p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Verträge abgeschlossen</p>
              <p className="text-3xl font-bold text-green-600 mt-1">
                {stats.vertraegeAbgeschlossen}
              </p>
            </div>
            <CheckCircle2 className="w-10 h-10 text-green-500" />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Conversion: {stats.conversionRate}%
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="text-lg font-bold mb-4">Statistiken</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-sm text-gray-600">Conversion-Rate</span>
              <span className="text-lg font-bold text-[#5C4A32]">
                {stats.conversionRate}%
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-sm text-gray-600">Ø Eigenanteil</span>
              <span className="text-lg font-bold text-[#5C4A32]">
                {stats.avgEigenanteil.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €
              </span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-gray-600">Leads diese Woche</span>
              <span className="text-lg font-bold text-[#5C4A32]">
                {stats.leadsThisWeek}
              </span>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-bold mb-4">Neueste Leads</h3>
          <div className="space-y-3">
            {recentLeads.length === 0 ? (
              <p className="text-sm text-gray-500">Noch keine Leads vorhanden</p>
            ) : (
              recentLeads.map((lead) => (
                <div
                  key={lead.id}
                  className="flex justify-between items-center py-2 border-b last:border-b-0"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {lead.vorname || lead.email}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(lead.created_at).toLocaleDateString('de-DE')}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      lead.status === 'vertrag_abgeschlossen'
                        ? 'bg-green-100 text-green-800'
                        : lead.status === 'angebot_requested'
                        ? 'bg-orange-100 text-orange-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {lead.status === 'vertrag_abgeschlossen'
                      ? 'Vertrag'
                      : lead.status === 'angebot_requested'
                      ? 'Angebot'
                      : 'Info'}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
