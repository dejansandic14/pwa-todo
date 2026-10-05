// All user-visible text in one place. Serbian, Latin script, ijekavica.

export const strings = {
  appTitle: 'PWA Todo',
  appSubtitle: 'Lista zadataka i vrijeme u Banjoj Luci — radi i bez interneta.',

  install: {
    button: 'Instaliraj aplikaciju',
  },

  offline: {
    banner: 'Nema veze sa internetom — prikazuju se sačuvani podaci.',
  },

  notifications: {
    allow: 'Dozvoli obavještenja',
    granted: 'Obavještenja su uključena',
    denied: 'Obavještenja su blokirana u pregledaču',
    unsupported: 'Obavještenja nisu podržana',
    doneTitle: 'Zadatak završen',
  },

  todos: {
    heading: 'Zadaci',
    inputLabel: 'Novi zadatak',
    inputPlaceholder: 'Šta treba uraditi?',
    add: 'Dodaj zadatak',
    filterLabel: 'Filter zadataka',
    filters: {
      all: 'Svi',
      active: 'Aktivni',
      done: 'Završeni',
    },
    empty: {
      all: 'Nema zadataka. Dodaj prvi iznad.',
      active: 'Nema aktivnih zadataka.',
      done: 'Nema završenih zadataka.',
    },
    remaining: (n: number) =>
      n === 1 ? '1 zadatak preostao' : n >= 2 && n <= 4 ? `${n} zadatka preostala` : `${n} zadataka preostalo`,
    edit: 'Izmijeni',
    save: 'Sačuvaj',
    cancel: 'Otkaži',
    remove: 'Obriši',
    loadError: 'Zadaci se nisu mogli učitati iz lokalne baze. Osvježi stranicu i pokušaj ponovo.',
    saveError: 'Zadatak nije sačuvan — upis u lokalnu bazu nije uspio. Pokušaj ponovo.',
    deleteError: 'Zadatak nije obrisan — brisanje iz lokalne baze nije uspjelo. Pokušaj ponovo.',
    markDone: 'Označi kao završen',
    markUndone: 'Označi kao nezavršen',
    editLabel: 'Izmjena zadatka',
  },

  weather: {
    heading: 'Vrijeme u Banjoj Luci',
    refresh: 'Osvježi',
    refreshing: 'Osvježavanje…',
    loading: 'Učitavanje vremenske prognoze…',
    updated: 'Ažurirano',
    fromCache: 'iz keša',
    wind: 'Vjetar',
    today: 'Danas',
    min: 'min',
    max: 'maks',
    error: 'Vremenska prognoza trenutno nije dostupna.',
    refreshFailed: 'Osvježavanje nije uspjelo — prikazana je sačuvana prognoza.',
    syncScheduled: 'Osvježavanje je zakazano — izvršiće se kad se veza vrati.',
    syncFallback: 'Nema veze — vrijeme će se osvježiti čim se veza vrati.',
    codes: {
      clear: 'Vedro',
      mainlyClear: 'Uglavnom vedro',
      partlyCloudy: 'Djelimično oblačno',
      overcast: 'Oblačno',
      fog: 'Magla',
      drizzle: 'Rosulja',
      freezingDrizzle: 'Ledena rosulja',
      rain: 'Kiša',
      freezingRain: 'Ledena kiša',
      snow: 'Snijeg',
      snowGrains: 'Snježna zrna',
      showers: 'Pljuskovi',
      snowShowers: 'Snježni pljuskovi',
      thunderstorm: 'Grmljavina',
      thunderstormHail: 'Grmljavina sa gradom',
      unknown: 'Nepoznato',
    },
  },
} as const
