"use client";

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { adminDb as supabase } from '@/lib/admin-db';
import { Loader2, Save, Edit2 } from 'lucide-react';

export default function PreisePage() {
  const [pricing, setPricing] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    loadPricing();
  }, []);

  const loadPricing = async () => {
    try {
      setLoading(true);
      const { data } = await supabase
        .from('pricing_config')
        .select('*')
        .order('kategorie')
        .order('sortierung');

      if (data) {
        setPricing(data);
      }
      setLoading(false);
    } catch (error) {
      console.error('Fehler beim Laden der Preise:', error);
      setLoading(false);
    }
  };

  const startEdit = (id: string, currentValue: number) => {
    setEditingId(id);
    setEditValue(currentValue.toString());
  };

  const saveEdit = async (id: string) => {
    try {
      setSaving(true);
      const newValue = parseFloat(editValue);

      if (isNaN(newValue)) {
        alert('Bitte einen gültigen Betrag eingeben');
        setSaving(false);
        return;
      }

      const scrollPosition = window.scrollY;

      const { error } = await supabase
        .from('pricing_config')
        .update({ aufschlag_euro: newValue })
        .eq('id', id);

      if (error) throw error;

      await loadPricing();
      setEditingId(null);
      setEditValue('');
      setSaving(false);

      requestAnimationFrame(() => {
        window.scrollTo(0, scrollPosition);
      });
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
      alert('Fehler beim Speichern');
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const groupedPricing = pricing.reduce((acc, item) => {
    if (!acc[item.kategorie]) {
      acc[item.kategorie] = [];
    }
    acc[item.kategorie].push(item);
    return acc;
  }, {} as Record<string, any[]>);

  const categoryNames: Record<string, string> = {
    basis: 'Basispreis',
    betreuung_fuer: 'Betreuung für',
    pflegegrad: 'Pflegegrad',
    weitere_personen: 'Weitere Personen im Haushalt',
    mobilitaet: 'Mobilität',
    nachteinsaetze: 'Nachteinsätze',
    deutschkenntnisse: 'Deutschkenntnisse',
    erfahrung: 'Erfahrung',
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
        <h1 className="text-3xl font-bold text-gray-900">Preiskonfiguration</h1>
        <p className="text-gray-600 mt-1">
          Verwalten Sie alle Preiskomponenten und Aufschläge
        </p>
      </div>

      <div className="space-y-6">
        {Object.entries(groupedPricing).map(([kategorie, items]) => {
          const itemsArray = items as any[];
          return (
          <Card key={kategorie} className="p-6">
            <h2 className="text-xl font-bold mb-4">
              {categoryNames[kategorie] || kategorie}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 text-sm font-medium text-gray-600">
                      Option
                    </th>
                    <th className="text-right py-2 px-3 text-sm font-medium text-gray-600">
                      Aufschlag (€)
                    </th>
                    <th className="text-right py-2 px-3 text-sm font-medium text-gray-600">
                      Aktionen
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {itemsArray.map((item) => (
                    <tr key={item.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-3">
                        <span className="font-medium text-gray-900">
                          {item.antwort_label}
                        </span>
                        {!item.aktiv && (
                          <span className="ml-2 text-xs text-gray-400">(Inaktiv)</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {editingId === item.id ? (
                          <Input
                            type="number"
                            step="0.01"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-32 ml-auto"
                            autoFocus
                          />
                        ) : (
                          <span
                            className={`font-bold ${
                              item.aufschlag_euro > 0
                                ? 'text-orange-600'
                                : item.aufschlag_euro < 0
                                ? 'text-green-600'
                                : 'text-gray-600'
                            }`}
                          >
                            {item.aufschlag_euro > 0 && '+'}
                            {item.aufschlag_euro.toFixed(2)} €
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {editingId === item.id ? (
                          <div className="flex gap-2 justify-end">
                            <Button
                              size="sm"
                              onClick={() => saveEdit(item.id)}
                              disabled={saving}
                            >
                              {saving ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <>
                                  <Save className="w-4 h-4 mr-1" />
                                  Speichern
                                </>
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={cancelEdit}
                              disabled={saving}
                            >
                              Abbrechen
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => startEdit(item.id, item.aufschlag_euro)}
                          >
                            <Edit2 className="w-4 h-4 mr-1" />
                            Bearbeiten
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          );
        })}
      </div>
    </div>
  );
}
