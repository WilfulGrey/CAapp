# Pipeline filtrowania opiekunek w Salead

## ⚠️ Krytyczna notka dla developera

Pole `hp_caregiver_id` **MUSI** być uwzględnione w zapytaniu GraphQL — backend nie załaduje pól HP (`hp_total_jobs`, `hp_total_days`, `hp_avg_mission_days`, `hp_recent_assignments`) bez niego.

Bez `hp_caregiver_id` w query:
```json
{ "hp_total_jobs": 0, "hp_total_days": 0, "hp_avg_mission_days": 0, "hp_recent_assignments": [] }
```

Z `hp_caregiver_id`:
```json
{ "hp_caregiver_id": "22205", "hp_total_jobs": 24, "hp_total_days": 948, "hp_avg_mission_days": 39.5, "hp_recent_assignments": [...] }
```

To wymóg ze strony backend developera mamamia — bez tego pola Laravel nie eager-loaduje relacji HP.

---

## Przebieg

### Tryb produkcyjny

```
mamamia GraphQL API (PROD)
    |
    v
Supabase Edge Function: get-caregivers
    |
    v
DB cache (edge_cache table, TTL 30 min)
    |
    v
Frontend (React SPA)
```

### Tryb lokalny (dev z VPN)

```
mamamia GraphQL API (PROD)
    |  (bezpośrednio, przez VPN, z tokenem w VITE_MAMAMIA_API_TOKEN)
    v
Frontend (Vite dev server na localhost:5174)
```

Przełącznik: `VITE_USE_LOCAL_API=true` w `.env`.

---

## Krok 0: Cache (tylko w trybie produkcyjnym)

Edge function najpierw sprawdza tabelę `edge_cache` w Supabase:

```typescript
const cached = await getCachedData();
if (cached) return cached;  // X-Cache: HIT, ~1.5s response
```

Cache TTL: **30 minut**. Wpis trzymany w tabeli `edge_cache` jako jeden wiersz `key='caregivers_v1'`.

Jeśli cache miss → idziemy do Kroku 1.

---

## Krok 1: Zapytanie GraphQL

Jedno zapytanie do `backend.prod.mamamia.app/graphql` z trzema filtrami server-side:

```graphql
query($cutoff: String!) {
  CaregiversWithPagination(
    limit: 100,
    page: 1,
    filters: {
      last_contact: $cutoff,
      has_retouched_avatar: true,
      min_hp_jobs: 1
    }
  ) {
    total
    data {
      id first_name last_name gender birth_date year_of_birth
      care_experience available_from
      last_contact_at last_login_at is_active_user
      germany_skill hp_caregiver_id
      hp_total_jobs hp_total_days hp_avg_mission_days
      avatar_retouched { aws_url }
      hp_recent_assignments(limit: 5) {
        arrival_date departure_date postal_code city status
      }
    }
  }
}
```

### Zmienne

| Zmienna | Wartość | Opis |
|---------|---------|------|
| `$cutoff` | data sprzed 30 dni (np. `2026-04-13`) | obliczana dynamicznie: `new Date() - 30 dni`, format `YYYY-MM-DD` |

### Filtry server-side (w WHERE clause bazy mamamia)

| Filtr | Wartość | Co robi | Wpływ |
|-------|---------|---------|-------|
| `last_contact` | `$cutoff` | Tylko opiekunki, z którymi był kontakt w ostatnich 30 dniach (WhatsApp, notatka rekrutera, aplikacja, telefon) | wszystkie ~28 000 → ~780 |
| `has_retouched_avatar` | `true` | Tylko opiekunki z profesjonalnie retuszowanym zdjęciem (gotowe do prezentacji) | (połączone z `last_contact` daje ~780) |
| `min_hp_jobs` | `1` | Tylko opiekunki, które mają wpis w tabeli `hp_caregivers` (mapowanie do systemu Helden Pflege) | ~780 → ~520 |

**Uwaga**: filtr `min_hp_jobs: 1` w obecnej wersji backendu sprawdza **istnienie mapowania HP**, a nie faktyczną liczbę misji. Dlatego część zwracanych CG ma `hp_total_jobs = 1` (lub niskie), ale mogą mieć krótkie/jednodniowe misje — odsiewamy ich client-side filtrem `hp_avg_mission_days >= 15`.

### Pobierane pola (inline, bez dodatkowych requestów)

| Pole | Źródło | Do czego służy |
|------|--------|----------------|
| `id` | Caregiver | Wewnętrzny identyfikator MM |
| `first_name`, `last_name` | Caregiver | Wyświetlane jako "Imię N." (inicjał nazwiska) |
| `gender` | Caregiver | Ikona/avatar fallback |
| `birth_date` / `year_of_birth` | Caregiver | Wyliczenie wieku (birth_date priorytetowe, year_of_birth fallback) |
| `care_experience` | Caregiver | Lata doświadczenia (surowa liczba, formatowana do "X J. Erfahrung") |
| `available_from` | Caregiver | Data dostępności (formatowana do "Sofort" / "ab 15. April") |
| `last_contact_at` | Caregiver | Kiedy ostatni kontakt ("gerade eben", "gestern", "vor 3 Tagen") |
| `last_login_at` | Caregiver | Czy jest "Live" (zalogowana w ciągu 30 min) |
| `is_active_user` | Caregiver | Czy konto aktywne (warunek dla Live badge) |
| `germany_skill` | Caregiver | Poziom niemieckiego: level_0..level_4 → A1..B2-C1 |
| **`hp_caregiver_id`** | Caregiver | **WYMAGANE** — bez tego pola HP relacje się nie ładują |
| `hp_total_jobs` | HP Stats (inline) | Liczba zrealizowanych misji |
| `hp_total_days` | HP Stats (inline) | Łączna liczba dni na misjach |
| `hp_avg_mission_days` | HP Stats (inline) | Średnia długość misji w dniach |
| `avatar_retouched.aws_url` | File (inline) | URL retuszowanego zdjęcia (S3 signed URL, wygasa po 30 min) |
| `hp_recent_assignments` | HP History (inline, limit 5) | Ostatnie 5 misji ze szczegółami |

---

## Krok 2: Filtr client-side w Edge Function

Po otrzymaniu wyników z GraphQL stosujemy dodatkowy filtr:

### Filtr: średnia długość misji ≥ 15 dni

```typescript
const qualified = page.data.filter(
  (cg) => Math.abs(cg.hp_avg_mission_days || 0) >= 15
);
```

| Warunek | Opis |
|---------|------|
| `hp_avg_mission_days >= 15` | Odrzuca opiekunki z bardzo krótkimi misjami (jednorazowe zastępstwa, błędne wpisy w HP) |

Używamy `Math.abs()` bo backend czasem zwraca ujemne wartości dla misji z `departure_date` w przyszłości (`duration_days = -42`).

Wpływ: ~520 → ~92 opiekunek.

---

## Krok 3: Sortowanie

```typescript
qualified.sort((a, b) => {
  const dateA = a.last_contact_at ? new Date(a.last_contact_at).getTime() : 0;
  const dateB = b.last_contact_at ? new Date(b.last_contact_at).getTime() : 0;
  return dateB - dateA;
});
```

Opiekunki sortowane od **najświeższego kontaktu** do najstarszego. Najnowszy kontakt = na górze listy.

---

## Krok 4: Filtrowanie zleceń w szczegółach

Dla `hp_recent_assignments` (wyświetlane w modalu profilu) stosujemy dodatkowe filtry:

```typescript
const today = new Date().toISOString().split("T")[0];

assignments
  .filter((a) =>
    a.arrival_date &&
    a.departure_date &&
    a.status === "finish" &&                 // tylko zakończone
    a.departure_date.slice(0, 10) < today    // tylko przeszłe
  )
  .slice(0, 3)  // max 3 ostatnie
```

| Warunek | Dlaczego |
|---------|----------|
| `status === "finish"` | Wyklucza anulowane (`rejected`) i trwające (`in_progress`, `accepted`) |
| `departure_date < today` | Wyklucza przyszłe i aktualnie trwające misje |
| `.slice(0, 3)` | Pokazujemy max 3 ostatnie misje w szczegółach profilu |

---

## Krok 5: Transformacja

Każda opiekunka jest transformowana do formatu frontendowego:

| Pole frontendowe | Źródło | Transformacja |
|-----------------|--------|---------------|
| `name` | `first_name` + `last_name` | "Imię N." (inicjał nazwiska z kropką) |
| `age` | `birth_date` lub `year_of_birth` | Dokładny wiek z birth_date, przybliżony z year_of_birth. 0 jeśli brak danych (frontend ukrywa) |
| `experience` | `care_experience` lub `hp_total_days` | Priorytet: care_experience (np. "5" → "5 J. Erfahrung"), fallback: hp_total_days / 365 |
| `availability` | `available_from` | "Sofort" / "ab 15. April" |
| `availableSoon` | `available_from` | `true` jeśli ≤ 14 dni lub brak daty |
| `language.level` | `germany_skill` | level_0="A1", level_1="A1-A2", level_2="A2-B1", level_3="B1-B2", level_4="B2-C1" |
| `language.bars` | `germany_skill` | level_0=1, level_1=2, level_2=3, level_3=4, level_4=5 |
| `color` | `id` | Deterministyczny kolor z palety 20 kolorów: `COLORS[id % 20]` |
| `addedTime` | `last_contact_at` | "gerade eben" / "vor 3 Std." / "gestern" / "vor 4 Tagen" / "vor 2 Wo." |
| `isLive` | `is_active_user` + `last_login_at` | `true` jeśli aktywny i zalogowany w ciągu 30 minut |
| `image` | `avatar_retouched.aws_url` | URL retuszowanego zdjęcia (podpisany, wygasa po 30 min) |
| `history.assignments` | `hp_total_jobs` | Liczba misji |
| `history.avgDurationWeeks` | `hp_avg_mission_days` | Średnia długość w tygodniach (dni / 7, zaokrąglone do 1 miejsca) |
| `detailedAssignments` | `hp_recent_assignments` | Max 3 zakończone, przeszłe misje z lokalizacją |

---

## Krok 6: Zapis do cache (tylko w trybie produkcyjnym)

Wynik jest zapisywany w tabeli `edge_cache` w Supabase:

```typescript
await supabase.from('edge_cache').upsert({
  key: 'caregivers_v1',
  data: result,
  expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
});
```

Następne requesty (w ciągu 30 min) zwracają dane z cache bez odpytywania GraphQL.

---

## Podsumowanie pipeline

```
~28 000 opiekunek w bazie mamamia
    |  filtr server-side: last_contact >= 30 dni temu
    |                     + has_retouched_avatar = true
    v
~780 opiekunek
    |  filtr server-side: min_hp_jobs >= 1 (mapowanie HP)
    v
~520 opiekunek
    |  paginacja: limit 100, page 1
    v
~100 opiekunek (jedna strona)
    |  filtr client-side: hp_avg_mission_days >= 15
    v
~92 opiekunek
    |  sort: last_contact_at DESC
    |  limit: 100
    v
~92 opiekunek na liście Salead

    W szczegółach profilu:
    hp_recent_assignments (do 5)
        |  filtr: status == "finish"
        |  filtr: departure_date < today
        |  limit: 3
        v
    max 3 zakończone misje
```

## Autentykacja

| Element | Mechanizm |
|---------|-----------|
| Frontend → Edge Function (PROD) | Supabase Anon Key (publiczny, w headerze `Authorization: Bearer ...`) |
| Edge Function → GraphQL API | Mamamia API Token (prywatny, w `Deno.env.get("MAMAMIA_API_TOKEN")`) |
| Frontend → GraphQL API (DEV) | Mamamia API Token z `.env` (`VITE_MAMAMIA_API_TOKEN`) — wymaga VPN |
| Konto API | `mm+salead@vitanas.pl` — `LoginAgency` mutation na `backend.prod.mamamia.app/graphql/auth` |

Token wygasa — w razie potrzeby pobierz świeży przez `LoginAgency` z `remember: true`.

## Timing

| Scenariusz | Czas |
|------------|------|
| Cold start, cache miss (PROD) | ~7s |
| Cache hit (PROD) | ~1.5s |
| Cache TTL | 30 minut |
| Local dev (VPN, brak cache) | ~3-5s |
