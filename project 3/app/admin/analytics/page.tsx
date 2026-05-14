'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Users,
  MousePointerClick,
  TrendingUp,
  BarChart3,
  Smartphone,
  Monitor,
  Tablet,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';

interface WizardStep {
  step: number;
  stepName: string;
  viewed: number;
  completed: number;
  dropoff: number;
  dropoffRate: number;
}

interface AnalyticsStats {
  summary: {
    uniqueVisitors: number;
    totalSessions: number;
    totalPageViews: number;
    totalConversions: number;
    kalkulationConversions: number;
    angebotConversions: number;
    formStarted: number;
    conversionRate: number;
    avgPagesPerSession: string;
  };
  pageViewsByPath: Record<string, number>;
  deviceTypes: Record<string, number>;
  trafficSources: Record<string, number>;
  formDropoffs: Record<string, number>;
  wizardFunnel: WizardStep[];
  sessionsOverTime: Record<string, number>;
  conversionsOverTime: Record<string, number>;
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState('30');

  useEffect(() => {
    fetchStats();
  }, [days]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      console.log('[Analytics Page] Fetching stats for days:', days);
      const response = await fetch(`/api/analytics/stats?days=${days}`);
      console.log('[Analytics Page] Response status:', response.status);
      const data = await response.json();
      console.log('[Analytics Page] Data received:', data);
      setStats(data);
    } catch (error) {
      console.error('[Analytics Page] Failed to fetch analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="text-lg text-gray-600">Lade Analytics-Daten...</div>
          </div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="text-lg text-red-600">Fehler beim Laden der Daten</div>
          </div>
        </div>
      </div>
    );
  }

  const getDeviceIcon = (device: string) => {
    if (device === 'mobile') return <Smartphone className="w-5 h-5" />;
    if (device === 'tablet') return <Tablet className="w-5 h-5" />;
    return <Monitor className="w-5 h-5" />;
  };

  const topPages = Object.entries(stats.pageViewsByPath || {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  const topSources = Object.entries(stats.trafficSources || {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  const topDropoffs = Object.entries(stats.formDropoffs || {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  // Ensure summary exists with defaults
  const summary = stats.summary || {
    uniqueVisitors: 0,
    totalSessions: 0,
    totalPageViews: 0,
    avgPagesPerSession: '0.00',
    totalConversions: 0,
    kalkulationConversions: 0,
    angebotConversions: 0,
    formStarted: 0,
    conversionRate: 0,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Analytics Dashboard</h1>
            <p className="text-gray-600 mt-1">Website- und Conversion-Performance</p>
          </div>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Letzte 7 Tage</SelectItem>
              <SelectItem value="30">Letzte 30 Tage</SelectItem>
              <SelectItem value="90">Letzte 90 Tage</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Besucher</CardTitle>
              <Users className="h-4 w-4 text-gray-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.uniqueVisitors}</div>
              <p className="text-xs text-gray-600 mt-1">
                {summary.totalSessions} Sessions
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Seitenaufrufe</CardTitle>
              <MousePointerClick className="h-4 w-4 text-gray-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.totalPageViews}</div>
              <p className="text-xs text-gray-600 mt-1">
                Ø {summary.avgPagesPerSession} pro Session
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Conversions</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {summary.totalConversions}
              </div>
              <p className="text-xs text-gray-600 mt-1">
                {summary.conversionRate.toFixed(1)}% Conversion Rate
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Anfragen</CardTitle>
              <BarChart3 className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {summary.angebotConversions}
              </div>
              <p className="text-xs text-gray-600 mt-1">
                {summary.formStarted} Formular gestartet
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Übersicht</TabsTrigger>
            <TabsTrigger value="traffic">Traffic</TabsTrigger>
            <TabsTrigger value="conversions">Conversions</TabsTrigger>
            <TabsTrigger value="forms">Formular-Analyse</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Top Seiten</CardTitle>
                  <CardDescription>Meistbesuchte Seiten</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {topPages.map(([path, views]) => (
                      <div key={path} className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {path}
                          </p>
                        </div>
                        <div className="ml-4 flex items-center">
                          <span className="text-sm font-semibold text-gray-700">
                            {views}
                          </span>
                          <ArrowUpRight className="w-4 h-4 text-green-500 ml-1" />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Gerätetypen</CardTitle>
                  <CardDescription>Verteilung nach Geräten</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {Object.entries(stats.deviceTypes || {}).map(([device, count]) => {
                      const total = summary.totalSessions;
                      const percentage = ((count / total) * 100).toFixed(1);
                      return (
                        <div key={device} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {getDeviceIcon(device)}
                              <span className="text-sm font-medium capitalize">
                                {device}
                              </span>
                            </div>
                            <span className="text-sm font-semibold">
                              {count} ({percentage}%)
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="traffic" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Traffic-Quellen</CardTitle>
                <CardDescription>Woher kommen die Besucher?</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {topSources.map(([source, count]) => {
                    const total = summary.totalSessions;
                    const percentage = ((count / total) * 100).toFixed(1);
                    return (
                      <div key={source} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium capitalize">
                            {source}
                          </span>
                          <span className="text-sm font-semibold">
                            {count} ({percentage}%)
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-purple-600 h-2 rounded-full"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="conversions" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Conversion-Funnel</CardTitle>
                  <CardDescription>Von Besucher bis Angebot</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                      <span className="font-medium">Besucher</span>
                      <span className="font-bold text-lg">
                        {summary.totalSessions}
                      </span>
                    </div>
                    <div className="flex justify-center">
                      <ArrowDownRight className="w-6 h-6 text-gray-400" />
                    </div>
                    <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
                      <span className="font-medium">Formular gestartet</span>
                      <div className="text-right">
                        <div className="font-bold text-lg text-green-600">
                          {summary.formStarted}
                        </div>
                        <div className="text-sm text-gray-600">
                          {summary.totalSessions > 0
                            ? ((summary.formStarted / summary.totalSessions) * 100).toFixed(1)
                            : '0.0'}%
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-center">
                      <ArrowDownRight className="w-6 h-6 text-gray-400" />
                    </div>
                    <div className="flex items-center justify-between p-4 bg-purple-50 rounded-lg">
                      <span className="font-medium">Angebot angefordert</span>
                      <div className="text-right">
                        <div className="font-bold text-lg text-purple-600">
                          {summary.angebotConversions}
                        </div>
                        <div className="text-sm text-gray-600">
                          {summary.formStarted > 0
                            ? ((summary.angebotConversions / summary.formStarted) * 100).toFixed(1)
                            : '0.0'}%
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Conversion-Rate Analyse</CardTitle>
                  <CardDescription>Performance-Metriken</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div>
                      <div className="flex justify-between mb-2">
                        <span className="text-sm font-medium">Besucher → Formular gestartet</span>
                        <span className="text-sm font-bold">
                          {summary.totalSessions > 0
                            ? ((summary.formStarted / summary.totalSessions) * 100).toFixed(1)
                            : '0.0'}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className="bg-green-500 h-3 rounded-full"
                          style={{
                            width: summary.totalSessions > 0
                              ? `${(summary.formStarted / summary.totalSessions) * 100}%`
                              : '0%'
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between mb-2">
                        <span className="text-sm font-medium">Formular gestartet → Angebot</span>
                        <span className="text-sm font-bold">
                          {summary.formStarted > 0
                            ? ((summary.angebotConversions / summary.formStarted) * 100).toFixed(1)
                            : '0.0'}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className="bg-purple-500 h-3 rounded-full"
                          style={{
                            width: summary.formStarted > 0
                              ? `${(summary.angebotConversions / summary.formStarted) * 100}%`
                              : '0%'
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between mb-2">
                        <span className="text-sm font-medium">Gesamt Conversion-Rate</span>
                        <span className="text-sm font-bold text-blue-600">
                          {summary.conversionRate.toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className="bg-blue-600 h-3 rounded-full"
                          style={{ width: `${summary.conversionRate}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="forms" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Formular-Funnel — Schritt für Schritt</CardTitle>
                <CardDescription>
                  Wie viele Nutzer sehen jeden Schritt, und wo steigen sie aus?
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(stats.wizardFunnel || []).some((s) => s.viewed > 0) ? (
                  <div className="space-y-3">
                    {(stats.wizardFunnel || []).map((s) => {
                      const completedPct = s.viewed > 0 ? (s.completed / s.viewed) * 100 : 0;
                      const highDropoff = s.dropoffRate >= 25 && s.viewed >= 10;
                      return (
                        <div key={s.step} className="space-y-1.5">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-gray-900">
                              <span className="text-gray-400 mr-1.5">{s.step}.</span>
                              {s.stepName}
                            </span>
                            <span className="text-gray-600">
                              {s.viewed} gesehen → <span className="font-semibold text-gray-900">{s.completed}</span> weiter
                              {s.dropoff > 0 && (
                                <span className={highDropoff ? 'text-red-600 font-semibold ml-2' : 'text-gray-500 ml-2'}>
                                  −{s.dropoff} ({s.dropoffRate}%)
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="w-full bg-red-100 rounded-full h-2.5 overflow-hidden">
                            <div
                              className={`h-2.5 rounded-full ${highDropoff ? 'bg-amber-500' : 'bg-green-500'}`}
                              style={{ width: `${completedPct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    Keine Funnel-Daten verfügbar
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Kontaktformular — Feld-Abbrüche</CardTitle>
                <CardDescription>
                  Wo im Kontaktformular (Schritt 10) steigen Nutzer aus?
                </CardDescription>
              </CardHeader>
              <CardContent>
                {topDropoffs.length > 0 ? (
                  <div className="space-y-3">
                    {topDropoffs.map(([field, count]) => {
                      const [formName, fieldName] = field.split('_');
                      return (
                        <div
                          key={field}
                          className="flex items-center justify-between p-3 bg-red-50 rounded-lg"
                        >
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">
                              {fieldName || formName}
                            </p>
                            <p className="text-xs text-gray-600">{formName}</p>
                          </div>
                          <div className="ml-4">
                            <span className="text-sm font-bold text-red-600">
                              {count} Abbrüche
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    Keine Feld-Abbruch-Daten im gewählten Zeitraum
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
