import { describe, it, expect } from 'vitest';
// Cross-App-Import (Ausnahme): appendJobParam lebt im Kostenrechner
// (project 3/lib/portal-url.ts — pure Modul ohne Next-Imports), weil die
// Bridge dort die Kunden-Mails baut. Der KONSUMENT des Deeplinks ist aber
// dieses Portal (?job=<lead_jobs.id>-Scoping, Variant A) — der Test hält
// beide Seiten des Vertrags im selben Repo-Check zusammen.
import { appendJobParam } from '../../project 3/lib/portal-url';

describe('appendJobParam (Multi-Job-Deeplink, Bug #24)', () => {
  it('hängt &job an eine URL mit ?token an', () => {
    expect(appendJobParam('https://portal.test/?token=abc', 'aaaa-bbbb')).toBe(
      'https://portal.test/?token=abc&job=aaaa-bbbb',
    );
  });

  it('hängt ?job an eine URL ohne Query an', () => {
    expect(appendJobParam('https://portal.test/', 'aaaa-bbbb')).toBe(
      'https://portal.test/?job=aaaa-bbbb',
    );
  });

  it('null/undefined UUID → URL unverändert (fail-soft plain link)', () => {
    expect(appendJobParam('https://portal.test/?token=abc', null)).toBe('https://portal.test/?token=abc');
    expect(appendJobParam('https://portal.test/?token=abc', undefined)).toBe('https://portal.test/?token=abc');
  });

  it('leere URL bleibt leer (kein "?job=..." ohne Host)', () => {
    expect(appendJobParam('', 'aaaa-bbbb')).toBe('');
  });

  it('encodiert die UUID (defense in depth — lead_jobs.id ist eh eine UUID)', () => {
    expect(appendJobParam('https://portal.test/?token=abc', 'a b&c')).toBe(
      'https://portal.test/?token=abc&job=a%20b%26c',
    );
  });

  it('der Portal-Parser (URLSearchParams) liest den Wert zurück — Roundtrip', () => {
    // CustomerPortalPage liest ?job= via URLSearchParams (Variant A seit #296).
    const url = appendJobParam('https://portal.test/?token=abc', '11111111-2222-3333-4444-555555555555');
    const params = new URL(url).searchParams;
    expect(params.get('job')).toBe('11111111-2222-3333-4444-555555555555');
    expect(params.get('token')).toBe('abc');
  });
});
