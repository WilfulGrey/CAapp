"use client";

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { adminDb as supabase } from '@/lib/admin-db';
import { Loader2, Save, Edit2, Info } from 'lucide-react';

export default function ZuschussePage() {
  const [subsidies, setSubsidies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingValueId, setEditingValueId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    loadSubsidies();
  }, []);

  const loadSubsidies = async () => {
    try {
      setLoading(true);
      const { data: subsidiesData } = await supabase
        .from('subsidies_config')
        .select(`
          *,
          values:subsidies_values(*)
        `)
        .order('sortierung');

      if (subsidiesData) {
        setSubsidies(subsidiesData);
      }
      setLoading(false);
    } catch (error) {
      console.error('Fehler beim Laden der Zuschüsse:', error);
      setLoading(false);
    }
  };

  const startEditValue = (id: string, currentValue: number) => {
    setEditingValueId(id);
    setEditValue(currentValue.toString());
  };

  const saveEditValue = async (id: string) => {
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
        .from('subsidies_values')
        .update({ betrag: newValue })
        .eq('id', id);

      if (error) throw error;

      await loadSubsidies();
      setEditingValueId(null);
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
    setEditingValueId(null);
    setEditValue('');
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
        <h1 className="text-3xl font-bold text-gray-900">Zuschüsse & Fördermittel</h1>
        <p className="text-gray-600 mt-1">
          Verwalten Sie alle Zuschüsse und deren Beträge
        </p>
      </div>

      <div className="space-y-6">
        {subsidies.map((subsidy) => (
          <Card key={subsidy.id} className="p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
                <Info className="w-5 h-5 text-green-600" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-gray-900">{subsidy.label}</h2>
                <p className="text-sm text-gray-600 mt-1">{subsidy.beschreibung}</p>
                <div className="flex gap-4 mt-2">
                  <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                    {subsidy.typ}
                  </span>
                  {!subsidy.aktiv && (
                    <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">
                      Inaktiv
                    </span>
                  )}
                </div>
              </div>
            </div>

            {subsidy.values && subsidy.values.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3 text-sm font-medium text-gray-600">
                        Bedingung
                      </th>
                      <th className="text-right py-2 px-3 text-sm font-medium text-gray-600">
                        Betrag
                      </th>
                      <th className="text-left py-2 px-3 text-sm font-medium text-gray-600">
                        Hinweis
                      </th>
                      <th className="text-right py-2 px-3 text-sm font-medium text-gray-600">
                        Aktionen
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {subsidy.values.map((value: any) => (
                      <tr key={value.id} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-3">
                          {value.bedingung_key ? (
                            <span className="text-sm">
                              {value.bedingung_key} = <strong>{value.bedingung_value}</strong>
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">Allgemein</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          {editingValueId === value.id ? (
                            <Input
                              type="number"
                              step="0.01"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-32 ml-auto"
                              autoFocus
                            />
                          ) : (
                            <span className="font-bold text-green-600">
                              {value.betrag.toFixed(2)} €
                              {value.betrag_typ === 'prozent_vom_brutto' && ' (%)'}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <span className="text-xs text-gray-600">{value.hinweis || '-'}</span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          {editingValueId === value.id ? (
                            <div className="flex gap-2 justify-end">
                              <Button
                                size="sm"
                                onClick={() => saveEditValue(value.id)}
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
                              onClick={() => startEditValue(value.id, value.betrag)}
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
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
