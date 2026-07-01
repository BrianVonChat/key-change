const CATEGORIES = [
  { id: 'piano', label: 'Piano' },
  { id: 'rhythm', label: 'Rhythm' },
  { id: 'ear-training', label: 'Ear Training' },
  { id: 'theory', label: 'Theory' },
  { id: 'keyboard-geography', label: 'Keyboard Geography' },
];

const DIFFICULTY_ORDER = { beginner: 0, intermediate: 1, advanced: 2 };

function labelForCategory(id) {
  const match = CATEGORIES.find((c) => c.id === id);
  return match ? match.label : id;
}

async function loadGames() {
  const res = await fetch('games.json');
  if (!res.ok) throw new Error(`Failed to load games.json: ${res.status}`);
  return res.json();
}
