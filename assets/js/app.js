// =========================
// CONFIG
// =========================
const ADMIN_TOKEN = '1234'; // <- změň si na svůj tajný klíč
const DEFAULT_CATEGORIES = [
  { id: 'all', name: 'Vše' },
  { id: 'izs', name: 'IZS' },
  { id: 'dilny', name: 'Dílny' },
  { id: 'restaurace', name: 'Restaurace' },
  { id: 'bary', name: 'Bary' },
  { id: 'kluby', name: 'Kluby' },
  { id: 'fastfoody', name: 'FastFoody' },
  { id: 'kavarny', name: 'Kavárny' },
  { id: 'other', name: 'Ostatní' }
];

// =========================
// ADMIN MODE (URL hash)
// =========================
function getAdminFromHash() {
  const h = (location.hash || '').replace('#', '');
  const m = h.match(/admin=([^&]+)/i);
  return m ? decodeURIComponent(m[1]) : '';
}
const isAdmin = getAdminFromHash() === ADMIN_TOKEN;

// =========================
// MAP
// =========================
const map = L.map('map', {
  crs: L.CRS.Simple,
  minZoom: 0,
  maxZoom: 7,
  zoomControl: true
}).setView([0, 0], 3);

// Lokální tiles (GitHub Pages) – máš strukturu tiles/atlas a názvy 7-40_29.png
L.tileLayer('./tiles/atlas/{z}-{x}_{y}.png', {
  tileSize: 256,
  minZoom: 0,
  maxZoom: 7,
  noWrap: true
  // ,tms: true
}).addTo(map);

// =========================
// Helpers
// =========================
function escapeHtml(s) {
  return String(s || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// =========================
// DATA
// =========================
function normalizeFaction(f) {
  if (Array.isArray(f.markers)) return f;

  const fallbackColorMap = {
    default: 'rgba(255,255,255,0.85)',
    purple: '#a855f7',
    cyan: '#22d3ee',
    green: '#34d399',
    red: '#fb7185'
  };

  const color = fallbackColorMap[f.markerStyle || 'purple'] || '#a855f7';

  return {
    id: f.id || crypto.randomUUID(),
    name: f.name || 'Frakce',
    category: f.category || 'other',
    url: f.url || '',
    img: f.img || '',
    desc: f.desc || '',
    markers: [{
      id: crypto.randomUUID(),
      x: typeof f.x === 'number' ? f.x : 0,
      y: typeof f.y === 'number' ? f.y : 0,
      color
    }]
  };
}

function loadState() {
  // Jednorázově vyčisti stará data z dřívějška, aby nic nepřebíjelo změny v souborech.
  // (i kdyby to někdo měl uložené z minulosti)
  try {
    localStorage.removeItem('fivem_factions_v4');
  } catch {}

  // Vždy bereme pouze nastavení z JS souboru.
  return { factions: [], categories: DEFAULT_CATEGORIES };
}

function saveState(state) {
  // Záměrně nic – na této stránce se nic neukládá do prohlížeče.
}

let state = loadState();
let activeCategory = 'all';
let searchTerm = '';

// =========================
// MARKERS
// =========================
const leafletMarkers = new Map();

function markerIcon(color) {
  const c = color || 'rgba(255,255,255,0.85)';
  return L.divIcon({
    className: '',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    html: `
      <div style="
        width:18px;height:18px;border-radius:999px;
        background:${c};
        box-shadow: 0 0 0 3px rgba(0,0,0,0.35), 0 8px 18px rgba(0,0,0,0.35);
        border: 1px solid rgba(255,255,255,0.22);
      "></div>
    `
  });
}

function popupHtml(f) {
  const img = f.img ? `<img src="${f.img}" alt="${escapeHtml(f.name)}">` : '';
  const url = f.url ? `<a href="${f.url}" target="_blank" rel="noopener">Otevřít odkaz</a>` : '';
  const desc = f.desc ? `<div style="font-size:12px;color:rgba(229,231,235,0.75);line-height:1.35;margin:8px 0 10px;">${escapeHtml(f.desc)}</div>` : '';
  const cat = (state.categories.find(c => c.id === f.category) || { name: '—' }).name;

  return `
    <div class="popup">
      <h3>${escapeHtml(f.name || 'Frakce')}</h3>
      <div class="row">
        <div class="pill">${escapeHtml(cat)}</div>
        <div class="pill">${f.markers?.length || 0}× marker</div>
      </div>
      ${img}
      ${desc}
      ${url}
    </div>
  `;
}

function removeFactionMarkers(factionId) {
  Array.from(leafletMarkers.keys()).forEach(key => {
    if (!key.startsWith(factionId + ':')) return;
    const m = leafletMarkers.get(key);
    if (m) map.removeLayer(m);
    leafletMarkers.delete(key);
  });
}

function renderFactionMarkers(f) {
  removeFactionMarkers(f.id);

  (f.markers || []).forEach(mk => {
    const key = `${f.id}:${mk.id}`;
    const marker = L.marker([mk.y, mk.x], { icon: markerIcon(mk.color) })
      .addTo(map)
      .bindPopup(popupHtml(f));
    leafletMarkers.set(key, marker);
  });
}

function renderAllMarkers() {
  leafletMarkers.forEach(m => map.removeLayer(m));
  leafletMarkers.clear();
  state.factions.forEach(renderFactionMarkers);
  refreshMarkersVisibility();
}

function getFilteredFactions() {
  return state.factions.filter(f => {
    const okCat = (activeCategory === 'all') || (f.category === activeCategory);
    const okSearch = !searchTerm || (f.name || '').toLowerCase().includes(searchTerm);
    return okCat && okSearch;
  });
}

function refreshMarkersVisibility() {
  const visible = getFilteredFactions();
  const visibleIds = new Set(visible.map(f => f.id));

  state.factions.forEach(f => {
    const isVisible = visibleIds.has(f.id);

    (f.markers || []).forEach(mk => {
      const key = `${f.id}:${mk.id}`;
      const m = leafletMarkers.get(key);
      if (!m) return;

      if (isVisible) {
        if (!map.hasLayer(m)) m.addTo(map);
        m.setPopupContent(popupHtml(f));
      } else {
        if (map.hasLayer(m)) map.removeLayer(m);
      }
    });
  });
}

// =========================
// UI: Categories
// =========================
function renderCategoryChips() {
  const chips = document.getElementById('chips');
  chips.innerHTML = '';

  state.categories.forEach(cat => {
    const el = document.createElement('div');
    el.className = 'chip' + (cat.id === activeCategory ? ' active' : '');
    el.textContent = cat.name;
    el.addEventListener('click', () => {
      activeCategory = cat.id;
      renderCategoryChips();
      renderList();
      refreshMarkersVisibility();
    });
    chips.appendChild(el);
  });
}

function fillCategorySelect() {
  const sel = document.getElementById('fCategory');
  sel.innerHTML = '';
  state.categories.filter(c => c.id !== 'all').forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    sel.appendChild(opt);
  });
}

// =========================
// UI: List
// =========================
function zoomToFaction(f) {
  const first = (f.markers || [])[0];
  if (!first) return;

  map.setView([first.y, first.x], Math.max(map.getZoom(), 5));
  const key = `${f.id}:${first.id}`;
  const m = leafletMarkers.get(key);
  if (m) m.openPopup();
}

function renderList() {
  const list = document.getElementById('list');
  list.innerHTML = '';

  const arr = getFilteredFactions();

  if (arr.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'card';
    empty.innerHTML = `<div style="font-weight:850;">Nic nenalezeno</div><div style="margin-top:6px;color:rgba(229,231,235,0.72);font-size:12px;">Zkus jinou kategorii nebo hledání.</div>`;
    list.appendChild(empty);
    return;
  }

  arr.forEach(f => {
    const cat = (state.categories.find(c => c.id === f.category) || { name: '—' }).name;

    const card = document.createElement('div');
    card.className = 'card';

    const linkPart = f.url ? `<a href="${f.url}" target="_blank" rel="noopener" class="tag">Odkaz</a>` : '';
    const imgPart = f.img ? `<span class="tag">Obrázek</span>` : '';
    const markerPart = `<span class="tag">${(f.markers || []).length}× marker</span>`;

    card.innerHTML = `
      <div class="cardTop">
        <div>
          <div class="cardName">${escapeHtml(f.name)}</div>
          <div class="cardMeta">
            <span class="tag">${escapeHtml(cat)}</span>
            ${markerPart}
            ${imgPart}
            ${linkPart}
          </div>
        </div>
      </div>

      <div class="cardActions">
        <button class="btn" data-zoom="${f.id}">📍 Najít na mapě</button>
        ${isAdmin ? `<button class="btn good" data-edit="${f.id}">✏️ Upravit</button>` : ''}
        ${isAdmin ? `<button class="btn danger" data-del="${f.id}">🗑 Smazat</button>` : ''}
      </div>
    `;

    list.appendChild(card);
  });

  list.querySelectorAll('button[data-zoom]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-zoom');
      const f = state.factions.find(x => x.id === id);
      if (!f) return;
      zoomToFaction(f);
    });
  });

  if (isAdmin) {
    list.querySelectorAll('button[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => openModalForEdit(btn.getAttribute('data-edit')));
    });
    list.querySelectorAll('button[data-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-del');
        const f = state.factions.find(x => x.id === id);
        if (!f) return;
        if (!confirm(`Smazat frakci "${f.name}"?`)) return;

        state.factions = state.factions.filter(x => x.id !== id);
        saveState(state);
        removeFactionMarkers(id);
        renderList();
        refreshMarkersVisibility();
      });
    });
  }
}

// =========================
// Modal / Editor
// =========================
const modalBackdrop = document.getElementById('modalBackdrop');
const modalEl = document.getElementById('modalEl');

const btnCloseModal = document.getElementById('btnCloseModal');
const btnCancel = document.getElementById('btnCancel');
const btnSave = document.getElementById('btnSave');
const btnDelete = document.getElementById('btnDelete');
const coordNote = document.getElementById('coordNote');
const btnMinimize = document.getElementById('btnMinimize');

const fName = document.getElementById('fName');
const fCategory = document.getElementById('fCategory');
const fUrl = document.getElementById('fUrl');
const fImg = document.getElementById('fImg');
const fDesc = document.getElementById('fDesc');

const btnAddMarker = document.getElementById('btnAddMarker');
const markerList = document.getElementById('markerList');

let modalMode = 'add';
let currentFactionDraft = null;
let addingMarkerMode = false;
let userMinimized = false;

function applyModalState() {
  const shouldMinimize = addingMarkerMode || userMinimized;
  modalEl.classList.toggle('minimized', shouldMinimize);

  btnMinimize.style.display = modalBackdrop.classList.contains('open') ? 'inline-block' : 'none';
  btnMinimize.textContent = modalEl.classList.contains('minimized') ? 'Zpět' : 'Zmenšit';
}

function setCoordNote() {
  if (!currentFactionDraft) {
    coordNote.textContent = '';
    return;
  }

  if (addingMarkerMode) {
    coordNote.textContent = 'Režim přidávání markerů: klikej do mapy (můžeš vícekrát). Vypneš znovu tlačítkem “✔ Režim přidávání”.';
    return;
  }

  const count = (currentFactionDraft.markers || []).length;
  coordNote.textContent = count
    ? 'Tip: přidej další pointy přes “+ Přidat marker” a barvy měň u každého markeru.'
    : 'Nejdřív přidej alespoň jeden marker: klikni na “+ Přidat marker (klikni do mapy)”.';
}

function refreshMarkerEditorUI() {
  markerList.innerHTML = '';
  const markersArr = (currentFactionDraft && currentFactionDraft.markers) ? currentFactionDraft.markers : [];

  if (markersArr.length === 0) {
    const div = document.createElement('div');
    div.className = 'mutedNote';
    div.textContent = 'Zatím žádné markery. Přidej alespoň jeden.';
    markerList.appendChild(div);
    return;
  }

  markersArr.forEach(mk => {
    const row = document.createElement('div');
    row.className = 'markerRow';

    const coords = document.createElement('div');
    coords.className = 'mono';
    coords.textContent = `x=${Math.round(mk.x)}  y=${Math.round(mk.y)}`;

    const color = document.createElement('input');
    color.type = 'color';
    color.value = mk.color || '#a855f7';

    color.addEventListener('input', () => {
      mk.color = color.value;
      renderFactionMarkers(currentFactionDraft);
      refreshMarkersVisibility();
    });

    const del = document.createElement('button');
    del.className = 'btn danger';
    del.textContent = 'Smazat';
    del.addEventListener('click', () => {
      currentFactionDraft.markers = currentFactionDraft.markers.filter(x => x.id !== mk.id);
      renderFactionMarkers(currentFactionDraft);
      refreshMarkersVisibility();
      refreshMarkerEditorUI();
      setCoordNote();
    });

    row.appendChild(coords);
    row.appendChild(color);
    row.appendChild(del);
    markerList.appendChild(row);
  });
}

function openModal({ mode, faction = null, xy = null }) {
  modalMode = mode;
  addingMarkerMode = false;
  userMinimized = false;

  document.getElementById('modalTitle').textContent = (mode === 'add') ? 'Přidat frakci' : 'Upravit frakci';
  btnDelete.style.display = (mode === 'edit') ? 'inline-block' : 'none';

  if (mode === 'add') {
    currentFactionDraft = {
      id: crypto.randomUUID(),
      name: '',
      category: (state.categories.find(c => c.id !== 'all') || { id: 'other' }).id,
      url: '',
      img: '',
      desc: '',
      markers: []
    };

    if (xy) {
      currentFactionDraft.markers.push({
        id: crypto.randomUUID(),
        x: xy.x,
        y: xy.y,
        color: '#a855f7'
      });
    }

    fName.value = '';
    fCategory.value = currentFactionDraft.category;
    fUrl.value = '';
    fImg.value = '';
    fDesc.value = '';
  } else {
    const f = state.factions.find(x => x.id === faction.id);
    if (!f) return;
    currentFactionDraft = JSON.parse(JSON.stringify(f));

    fName.value = currentFactionDraft.name || '';
    fCategory.value = currentFactionDraft.category || 'other';
    fUrl.value = currentFactionDraft.url || '';
    fImg.value = currentFactionDraft.img || '';
    fDesc.value = currentFactionDraft.desc || '';
  }

  btnAddMarker.textContent = '+ Přidat marker (klikni do mapy)';
  btnAddMarker.classList.remove('good');

  refreshMarkerEditorUI();
  setCoordNote();

  modalBackdrop.classList.add('open');
  modalBackdrop.setAttribute('aria-hidden', 'false');
  applyModalState();

  renderFactionMarkers(currentFactionDraft);
  refreshMarkersVisibility();

  setTimeout(() => fName.focus(), 0);
}

function closeModal() {
  modalBackdrop.classList.remove('open');
  modalBackdrop.setAttribute('aria-hidden', 'true');

  addingMarkerMode = false;
  userMinimized = false;
  btnAddMarker.textContent = '+ Přidat marker (klikni do mapy)';
  btnAddMarker.classList.remove('good');

  renderAllMarkers();

  currentFactionDraft = null;
  applyModalState();
}

btnCloseModal.addEventListener('click', closeModal);
btnCancel.addEventListener('click', closeModal);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalBackdrop.classList.contains('open')) closeModal();
});

btnMinimize.addEventListener('click', () => {
  userMinimized = !modalEl.classList.contains('minimized');
  applyModalState();
});

btnAddMarker.addEventListener('click', () => {
  if (!isAdmin) return;
  if (!currentFactionDraft) return;

  addingMarkerMode = !addingMarkerMode;

  btnAddMarker.textContent = addingMarkerMode
    ? '✔ Režim přidávání (klikej do mapy)'
    : '+ Přidat marker (klikni do mapy)';

  btnAddMarker.classList.toggle('good', addingMarkerMode);

  applyModalState();
  setCoordNote();
});

btnSave.addEventListener('click', () => {
  if (!currentFactionDraft) return;

  const name = (fName.value || '').trim();
  if (!name) {
    alert('Vyplň název frakce.');
    fName.focus();
    return;
  }

  currentFactionDraft.name = name;
  currentFactionDraft.category = fCategory.value || 'other';
  currentFactionDraft.url = (fUrl.value || '').trim();
  currentFactionDraft.img = (fImg.value || '').trim();
  currentFactionDraft.desc = (fDesc.value || '').trim();

  if (!Array.isArray(currentFactionDraft.markers) || currentFactionDraft.markers.length === 0) {
    alert('Frakce musí mít alespoň jeden marker.');
    return;
  }

  if (modalMode === 'add') {
    state.factions.push(currentFactionDraft);
  } else {
    const idx = state.factions.findIndex(x => x.id === currentFactionDraft.id);
    if (idx !== -1) state.factions[idx] = currentFactionDraft;
  }

  saveState(state);
  renderAllMarkers();
  closeModal();
  renderList();
});

btnDelete.addEventListener('click', () => {
  if (modalMode !== 'edit') return;
  if (!currentFactionDraft) return;

  if (!confirm(`Smazat frakci "${currentFactionDraft.name}"?`)) return;

  const id = currentFactionDraft.id;
  state.factions = state.factions.filter(x => x.id !== id);
  saveState(state);
  removeFactionMarkers(id);

  closeModal();
  renderList();
  refreshMarkersVisibility();
});

function openModalForEdit(id) {
  const f = state.factions.find(x => x.id === id);
  if (!f) return;
  openModal({ mode: 'edit', faction: f });
}

// =========================
// Admin UI visibility
// =========================
const modeBadge = document.getElementById('modeBadge');
const adminBar = document.getElementById('adminBar');

if (isAdmin) {
  modeBadge.textContent = 'Admin';
  modeBadge.classList.add('admin');
  adminBar.classList.add('visible');
} else {
  modeBadge.textContent = 'Public';
  modeBadge.classList.remove('admin');
}

// =========================
// Admin actions
// =========================
const btnAdd = document.getElementById('btnAdd');
const btnExport = document.getElementById('btnExport');
const btnImport = document.getElementById('btnImport');
const btnClear = document.getElementById('btnClear');
const fileInput = document.getElementById('fileInput');

if (isAdmin) {
  btnAdd.addEventListener('click', () => openModal({ mode: 'add', xy: null }));

  btnExport.addEventListener('click', async () => {
    const out = JSON.stringify({ factions: state.factions, categories: state.categories }, null, 2);
    try {
      await navigator.clipboard.writeText(out);
      alert('Export JSON zkopírován do schránky ✅');
    } catch {
      const w = window.open();
      w.document.write('<pre>' + out.replaceAll('<', '&lt;') + '</pre>');
    }
  });

  btnImport.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;

    const text = await file.text();
    try {
      const parsed = JSON.parse(text);

      const incomingFactions = Array.isArray(parsed.factions) ? parsed.factions : [];
      const incomingCategories = Array.isArray(parsed.categories) ? parsed.categories : state.categories;

      state = {
        factions: incomingFactions.map(normalizeFaction),
        categories: incomingCategories
      };

      saveState(state);

      renderCategoryChips();
      fillCategorySelect();
      renderList();
      renderAllMarkers();

      alert('Import hotový ✅');
    } catch {
      alert('Import selhal: JSON není validní.');
    }
  });

  btnClear.addEventListener('click', () => {
    if (!confirm('Fakt smazat všechny frakce?')) return;
    state.factions.forEach(f => removeFactionMarkers(f.id));
    state.factions = [];
    saveState(state);
    renderList();
    refreshMarkersVisibility();
  });
}

// =========================
// Map click (admin): přidávání markerů
// =========================
map.on('click', (e) => {
  if (!isAdmin) return;

  const x = e.latlng.lng;
  const y = e.latlng.lat;

  if (modalBackdrop.classList.contains('open') && addingMarkerMode && currentFactionDraft) {
    currentFactionDraft.markers.push({
      id: crypto.randomUUID(),
      x,
      y,
      color: '#a855f7'
    });

    renderFactionMarkers(currentFactionDraft);
    refreshMarkersVisibility();
    refreshMarkerEditorUI();
    setCoordNote();
    return;
  }

  if (!modalBackdrop.classList.contains('open')) {
    if (!confirm('Založit novou frakci na tomto místě?')) return;
    openModal({ mode: 'add', xy: { x, y } });
  }
});

// =========================
// Search
// =========================
document.getElementById('search').addEventListener('input', (e) => {
  searchTerm = (e.target.value || '').trim().toLowerCase();
  renderList();
  refreshMarkersVisibility();
});

// =========================
// Init
// =========================
renderCategoryChips();
fillCategorySelect();
renderList();
state.factions.forEach(renderFactionMarkers);
refreshMarkersVisibility();
