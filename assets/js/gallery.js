let allGames = [];
const state = { search: '', category: 'all', difficulty: 'all', sort: 'newest' };

function applyFiltersAndSort(games) {
  const q = state.search.trim().toLowerCase();

  let result = games.filter((g) => {
    const matchesCategory = state.category === 'all' || g.category.includes(state.category);
    const matchesDifficulty = state.difficulty === 'all' || g.difficulty === state.difficulty;
    const haystack = `${g.title} ${g.description} ${(g.tags || []).join(' ')}`.toLowerCase();
    const matchesSearch = q === '' || haystack.includes(q);
    return matchesCategory && matchesDifficulty && matchesSearch;
  });

  result = result.slice().sort((a, b) => {
    if (state.sort === 'title') return a.title.localeCompare(b.title);
    if (state.sort === 'difficulty') return DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty];
    return new Date(b.dateAdded) - new Date(a.dateAdded);
  });

  return result;
}

function renderCard(game) {
  const card = document.createElement('a');
  card.className = 'card';
  card.href = game.entry;
  card.dataset.slug = game.slug;

  const thumb = game.thumbnail || 'assets/img/placeholder-thumbnail.svg';
  const categoryTags = game.category
    .map((c) => `<span class="tag">${escapeHtml(labelForCategory(c))}</span>`)
    .join('');

  card.innerHTML = `
    <img class="card__thumb" src="${escapeHtml(thumb)}" alt="" loading="lazy" onerror="this.src='assets/img/placeholder-thumbnail.svg'">
    <h3 class="card__title">${escapeHtml(game.title)}</h3>
    <p class="card__desc">${escapeHtml(game.description)}</p>
    <div class="card__meta">
      <span class="tag tag--${escapeHtml(game.difficulty)}">${escapeHtml(capitalize(game.difficulty))}</span>
      ${categoryTags}
    </div>
    <p class="card__author">by ${escapeHtml(game.author)}</p>
  `;
  return card;
}

function render() {
  const filtered = applyFiltersAndSort(allGames);
  const grid = document.getElementById('games-grid');
  grid.replaceChildren(...filtered.map(renderCard));
  document.getElementById('results-count').textContent =
    `Showing ${filtered.length} of ${allGames.length} game${allGames.length === 1 ? '' : 's'}`;
  document.getElementById('empty-state').hidden = filtered.length !== 0;
}

function renderCategoryChips() {
  const container = document.getElementById('category-filters');
  const allChip = container.querySelector('[data-filter="all"]');
  CATEGORIES.forEach((cat) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'filter-chip';
    chip.dataset.filter = cat.id;
    chip.textContent = cat.label;
    container.appendChild(chip);
  });
  return allChip;
}

function wireFilterGroup(containerId, datasetKey, stateKey) {
  const container = document.getElementById(containerId);
  container.addEventListener('click', (event) => {
    const btn = event.target.closest('.filter-chip');
    if (!btn) return;
    container.querySelectorAll('.filter-chip').forEach((el) => el.classList.remove('is-active'));
    btn.classList.add('is-active');
    state[stateKey] = btn.dataset[datasetKey];
    render();
  });
}

function clearFilters() {
  state.search = '';
  state.category = 'all';
  state.difficulty = 'all';
  document.getElementById('search-input').value = '';
  document.querySelectorAll('#category-filters .filter-chip').forEach((el) => el.classList.remove('is-active'));
  document.querySelector('#category-filters [data-filter="all"]').classList.add('is-active');
  document.querySelectorAll('#difficulty-filters .filter-chip').forEach((el) => el.classList.remove('is-active'));
  document.querySelector('#difficulty-filters [data-difficulty="all"]').classList.add('is-active');
  render();
}

function init() {
  renderCategoryChips();
  wireFilterGroup('category-filters', 'filter', 'category');
  wireFilterGroup('difficulty-filters', 'difficulty', 'difficulty');

  document.getElementById('search-input').addEventListener('input', debounce((event) => {
    state.search = event.target.value;
    render();
  }, 150));

  document.getElementById('sort-select').addEventListener('change', (event) => {
    state.sort = event.target.value;
    render();
  });

  document.getElementById('clear-filters').addEventListener('click', clearFilters);

  loadGames()
    .then((games) => {
      allGames = games;
      render();
    })
    .catch((err) => {
      console.error(err);
      const grid = document.getElementById('games-grid');
      grid.innerHTML = '<p>Could not load games right now. Please try refreshing the page.</p>';
    });
}

document.addEventListener('DOMContentLoaded', init);
