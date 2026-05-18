import Store from 'electron-store';

type Settings = {
  mode: 'cash' | 'tournament';
  cash: { smallBlind: number; bigBlind: number; buyIn: number };
  tournament: {
    startingStack: number;
    levelDurationMinutes: number;
    levels: { sb: number; bb: number; ante: number }[];
  };
};

const DEFAULT_SETTINGS: Settings = {
  mode: 'cash',
  cash: { smallBlind: 1, bigBlind: 2, buyIn: 200 },
  tournament: {
    startingStack: 1500,
    levelDurationMinutes: 10,
    levels: [
      { sb: 10, bb: 20, ante: 0 },
      { sb: 15, bb: 30, ante: 0 },
      { sb: 25, bb: 50, ante: 0 },
      { sb: 50, bb: 100, ante: 10 },
      { sb: 75, bb: 150, ante: 15 },
      { sb: 100, bb: 200, ante: 25 },
      { sb: 150, bb: 300, ante: 30 },
      { sb: 200, bb: 400, ante: 50 },
    ],
  },
};

const settingsStore = new Store<{ settings: Settings }>({
  name: 'settings',
  defaults: { settings: DEFAULT_SETTINGS },
});

const historyStore = new Store<{ hands: unknown[] }>({
  name: 'hand-history',
  defaults: { hands: [] },
});

export function loadSettings(): Settings {
  return settingsStore.get('settings');
}

export function saveSettings(data: Settings): void {
  settingsStore.set('settings', data);
}

export function loadHandHistory(): unknown[] {
  return historyStore.get('hands');
}

export function appendHandHistory(entry: unknown): void {
  const hands = historyStore.get('hands');
  hands.push(entry);
  if (hands.length > 500) hands.splice(0, hands.length - 500);
  historyStore.set('hands', hands);
}
