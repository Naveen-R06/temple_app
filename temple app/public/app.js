/**
 * Temple Contribution & Records Manager
 * Frontend Logic with Persistent SQLite Storage
 * Supports: Place, Contributor Name, Mobile Number, Address, Amount, Date & Time
 */

// Application State
const state = {
  places: [],
  records: [],
  selectedPlaceId: 'all',
  searchQuery: '',
  deleteTarget: null // { type: 'record'|'place', id: number, label: string }
};

// DOM Element References
const elements = {
  // Stats
  statTotalAmount: document.getElementById('statTotalAmount'),
  statTotalPersons: document.getElementById('statTotalPersons'),
  statTotalPlaces: document.getElementById('statTotalPlaces'),

  // Filters & Controls
  searchInput: document.getElementById('searchInput'),
  placeFilter: document.getElementById('placeFilter'),
  placeChipsContainer: document.getElementById('placeChipsContainer'),
  btnExportCsv: document.getElementById('btnExportCsv'),
  filterIndicator: document.getElementById('filterIndicator'),
  currentFilterText: document.getElementById('currentFilterText'),
  btnClearFilter: document.getElementById('btnClearFilter'),

  // Table
  recordsTable: document.getElementById('recordsTable'),
  recordsTbody: document.getElementById('recordsTbody'),
  recordCountBadge: document.getElementById('recordCountBadge'),
  emptyState: document.getElementById('emptyState'),
  emptyTitle: document.getElementById('emptyTitle'),
  emptyDesc: document.getElementById('emptyDesc'),
  btnEmptyAdd: document.getElementById('btnEmptyAdd'),

  // Buttons to open modals
  btnOpenAddRecord: document.getElementById('btnOpenAddRecord'),
  btnOpenAddPlace: document.getElementById('btnOpenAddPlace'),
  btnOpenManagePlaces: document.getElementById('btnOpenManagePlaces'),
  btnQuickAddPlace: document.getElementById('btnQuickAddPlace'),
  btnManageAddNewPlace: document.getElementById('btnManageAddNewPlace'),

  // Modals
  recordModal: document.getElementById('recordModal'),
  recordModalTitle: document.getElementById('recordModalTitle'),
  recordForm: document.getElementById('recordForm'),
  recordEditId: document.getElementById('recordEditId'),
  recordPlaceSelect: document.getElementById('recordPlaceSelect'),
  recordPersonName: document.getElementById('recordPersonName'),
  recordMobile: document.getElementById('recordMobile'),
  recordAddress: document.getElementById('recordAddress'),
  recordTime: document.getElementById('recordTime'),
  recordAmount: document.getElementById('recordAmount'),

  placeModal: document.getElementById('placeModal'),
  placeModalTitle: document.getElementById('placeModalTitle'),
  placeForm: document.getElementById('placeForm'),
  placeEditId: document.getElementById('placeEditId'),
  placeNameInput: document.getElementById('placeNameInput'),

  managePlacesModal: document.getElementById('managePlacesModal'),
  managePlacesList: document.getElementById('managePlacesList'),

  confirmModal: document.getElementById('confirmModal'),
  confirmModalTitle: document.getElementById('confirmModalTitle'),
  confirmModalMessage: document.getElementById('confirmModalMessage'),
  confirmModalSubtext: document.getElementById('confirmModalSubtext'),
  btnConfirmDelete: document.getElementById('btnConfirmDelete'),

  toastContainer: document.getElementById('toastContainer')
};

// Currency Formatter (Indian Rupee)
const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2
});

// Format Date and Time nicely
function formatDateTime(dateString) {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString.replace(' ', 'T'));
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch (e) {
    return dateString;
  }
}

// Convert Date object or ISO string to datetime-local format (YYYY-MM-DDTHH:mm)
function toDatetimeLocalString(date) {
  const d = date ? new Date(date.replace ? date.replace(' ', 'T') : date) : new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// Show Toast Notification
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✓' : '⚠️'}</span> <span>${message}</span>`;
  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(16px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Setup Light-Dismiss Fallback for all dialogs (as per modern-web-guidance)
function setupDialogLightDismiss(dialog) {
  if (!dialog) return;
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const isDialogContent = (
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width
      );
      if (isDialogContent) return;
      dialog.close();
    });
  }
}

// Initialize light-dismiss on all dialog elements
document.querySelectorAll('dialog').forEach(setupDialogLightDismiss);

// Setup data-close-modal triggers
document.querySelectorAll('[data-close-modal]').forEach(button => {
  button.addEventListener('click', () => {
    const modalId = button.getAttribute('data-close-modal');
    const modal = document.getElementById(modalId);
    if (modal && typeof modal.close === 'function') {
      modal.close();
    }
  });
});

// ----------------------------------------------------
// DATA FETCHING & RENDERING
// ----------------------------------------------------

async function loadData() {
  try {
    await Promise.all([fetchSummary(), fetchPlaces(), fetchRecords()]);
    renderAll();
  } catch (error) {
    console.error('Error loading data:', error);
    showToast('Failed to load records from server', 'error');
  }
}

// 1. Fetch Summary
async function fetchSummary() {
  const res = await fetch('/api/summary');
  if (!res.ok) throw new Error('Failed to fetch summary');
  const summary = await res.json();
  elements.statTotalAmount.textContent = currencyFormatter.format(summary.total_amount || 0);
  elements.statTotalPersons.textContent = Number(summary.total_records || 0).toLocaleString('en-IN');
  elements.statTotalPlaces.textContent = Number(summary.total_places || 0).toLocaleString('en-IN');
}

// 2. Fetch Places
async function fetchPlaces() {
  const res = await fetch('/api/places');
  if (!res.ok) throw new Error('Failed to fetch places');
  state.places = await res.json();
}

// 3. Fetch Records
async function fetchRecords() {
  const params = new URLSearchParams();
  if (state.selectedPlaceId !== 'all') {
    params.set('place_id', state.selectedPlaceId);
  }
  if (state.searchQuery) {
    params.set('search', state.searchQuery);
  }

  const res = await fetch(`/api/records?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch records');
  state.records = await res.json();
}

// ----------------------------------------------------
// UI RENDERING
// ----------------------------------------------------

function renderAll() {
  renderPlaceOptions();
  renderPlaceChips();
  renderTable();
  renderManagePlacesList();
}

// Render dropdown selectors for places
function renderPlaceOptions() {
  // Update Filter dropdown
  let filterHtml = '<option value="all">All Places</option>';
  state.places.forEach(p => {
    const count = p.person_count || 0;
    const amount = currencyFormatter.format(p.total_amount || 0);
    filterHtml += `<option value="${p.id}">${escapeHtml(p.name)} (${count} persons - ${amount})</option>`;
  });
  elements.placeFilter.innerHTML = filterHtml;
  elements.placeFilter.value = state.selectedPlaceId;

  // Update Record Form place dropdown
  let formPlaceHtml = '<option value="" disabled selected>-- Select a Place --</option>';
  state.places.forEach(p => {
    formPlaceHtml += `<option value="${p.id}">${escapeHtml(p.name)}</option>`;
  });
  elements.recordPlaceSelect.innerHTML = formPlaceHtml;
}

// Render place chips
function renderPlaceChips() {
  let html = `
    <button type="button" class="chip ${state.selectedPlaceId === 'all' ? 'active' : ''}" data-place-id="all">
      <span>All Places</span>
      <span class="chip-count">${state.places.reduce((acc, p) => acc + (p.person_count || 0), 0)}</span>
    </button>
  `;

  state.places.forEach(p => {
    const isActive = String(state.selectedPlaceId) === String(p.id);
    html += `
      <button type="button" class="chip ${isActive ? 'active' : ''}" data-place-id="${p.id}" title="${escapeHtml(p.name)}: ${currencyFormatter.format(p.total_amount || 0)}">
        <span>${escapeHtml(p.name)}</span>
        <span class="chip-count">${p.person_count || 0}</span>
      </button>
    `;
  });

  elements.placeChipsContainer.innerHTML = html;

  elements.placeChipsContainer.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const placeId = chip.getAttribute('data-place-id');
      setPlaceFilter(placeId);
    });
  });
}

// Render main records table
function renderTable() {
  const count = state.records.length;
  elements.recordCountBadge.textContent = count;

  // Filter indicator
  if (state.selectedPlaceId !== 'all') {
    const place = state.places.find(p => String(p.id) === String(state.selectedPlaceId));
    elements.currentFilterText.textContent = place ? place.name : 'Selected Place';
    elements.filterIndicator.style.display = 'flex';
  } else {
    elements.filterIndicator.style.display = 'none';
  }

  if (count === 0) {
    elements.recordsTable.style.display = 'none';
    elements.emptyState.style.display = 'block';

    if (state.searchQuery || state.selectedPlaceId !== 'all') {
      elements.emptyTitle.textContent = 'No matching records found';
      elements.emptyDesc.textContent = 'Try clearing your search or selecting a different place.';
      elements.btnEmptyAdd.style.display = 'none';
    } else {
      elements.emptyTitle.textContent = 'No records added yet';
      elements.emptyDesc.textContent = 'Start by adding a place and recording each person’s contribution.';
      elements.btnEmptyAdd.style.display = 'inline-flex';
    }
    return;
  }

  elements.recordsTable.style.display = 'table';
  elements.emptyState.style.display = 'none';

  let tbodyHtml = '';
  state.records.forEach((rec, index) => {
    const formattedAmount = currencyFormatter.format(rec.amount);
    const dateFormatted = formatDateTime(rec.created_at);

    // Contributor sub-details (Mobile and Address)
    let subinfoHtml = '';
    if (rec.mobile) {
      subinfoHtml += `
        <a href="tel:${escapeHtml(rec.mobile)}" class="phone-link" title="Call or WhatsApp ${escapeHtml(rec.mobile)}">
          📞 ${escapeHtml(rec.mobile)}
        </a>
      `;
    }
    if (rec.address) {
      subinfoHtml += `
        <span class="address-tag" title="Address">
          🏠 ${escapeHtml(rec.address)}
        </span>
      `;
    }

    tbodyHtml += `
      <tr data-record-id="${rec.id}">
        <td class="col-sno" data-label="#">${index + 1}</td>
        <td class="col-place" data-label="Place">
          <span class="place-pill">${escapeHtml(rec.place_name)}</span>
        </td>
        <td class="col-person" data-label="Contributor">
          <div class="person-card">
            <span class="person-name">${escapeHtml(rec.person_name)}</span>
            ${subinfoHtml ? `<div class="person-subinfo">${subinfoHtml}</div>` : ''}
          </div>
        </td>
        <td class="col-amount" data-label="Amount">${formattedAmount}</td>
        <td class="col-date" data-label="Date & Time">${dateFormatted}</td>
        <td class="col-actions" data-label="Actions">
          <div class="action-btn-group">
            <button type="button" class="btn-icon-action" onclick="openEditRecordModal(${rec.id})" title="Edit record">
              ✏️ <span>Edit</span>
            </button>
            <button type="button" class="btn-icon-action delete" onclick="promptDeleteRecord(${rec.id}, '${escapeForJs(rec.person_name)}', ${rec.amount})" title="Delete record">
              🗑️ <span>Delete</span>
            </button>
          </div>
        </td>
      </tr>
    `;
  });

  elements.recordsTbody.innerHTML = tbodyHtml;
}

// Render Manage Places modal list
function renderManagePlacesList() {
  if (state.places.length === 0) {
    elements.managePlacesList.innerHTML = `
      <div style="text-align: center; padding: 1.5rem; color: var(--text-muted);">
        No places registered yet. Click "+ Add Place" above to create one.
      </div>
    `;
    return;
  }

  let html = '';
  state.places.forEach(p => {
    const count = p.person_count || 0;
    const amount = currencyFormatter.format(p.total_amount || 0);
    html += `
      <div class="place-item">
        <div class="place-item-details">
          <span class="place-item-name">${escapeHtml(p.name)}</span>
          <span class="place-item-meta">${count} contributors • Total: ${amount}</span>
        </div>
        <div class="place-item-actions">
          <button type="button" class="btn btn-sm btn-secondary" onclick="openEditPlaceModal(${p.id}, '${escapeForJs(p.name)}')">
            ✏️ Edit
          </button>
          <button type="button" class="btn btn-sm btn-danger" onclick="promptDeletePlace(${p.id}, '${escapeForJs(p.name)}', ${count})">
            🗑️ Delete
          </button>
        </div>
      </div>
    `;
  });

  elements.managePlacesList.innerHTML = html;
}

// Set place filter
function setPlaceFilter(placeId) {
  state.selectedPlaceId = placeId;
  elements.placeFilter.value = placeId;
  fetchRecords().then(() => {
    renderPlaceChips();
    renderTable();
  });
}

// ----------------------------------------------------
// MODAL CONTROLLERS & ACTIONS
// ----------------------------------------------------

// 1. ADD / EDIT RECORD
function openAddRecordModal(preselectedPlaceId = null) {
  if (state.places.length === 0) {
    showToast('Please add at least one place first', 'error');
    openAddPlaceModal();
    return;
  }

  elements.recordModalTitle.textContent = 'Add Person & Amount';
  elements.recordEditId.value = '';
  elements.recordForm.reset();

  // Set default time to right now
  elements.recordTime.value = toDatetimeLocalString();

  if (preselectedPlaceId && preselectedPlaceId !== 'all') {
    elements.recordPlaceSelect.value = preselectedPlaceId;
  } else if (state.selectedPlaceId !== 'all') {
    elements.recordPlaceSelect.value = state.selectedPlaceId;
  } else {
    elements.recordPlaceSelect.selectedIndex = 1;
  }

  elements.recordModal.showModal();
  setTimeout(() => elements.recordPersonName.focus(), 50);
}

window.openEditRecordModal = function(id) {
  const record = state.records.find(r => r.id === id);
  if (!record) return;

  elements.recordModalTitle.textContent = 'Edit Record';
  elements.recordEditId.value = record.id;
  elements.recordPlaceSelect.value = record.place_id;
  elements.recordPersonName.value = record.person_name;
  elements.recordMobile.value = record.mobile || '';
  elements.recordAddress.value = record.address || '';
  elements.recordAmount.value = record.amount;
  elements.recordTime.value = toDatetimeLocalString(record.created_at);

  elements.recordModal.showModal();
  setTimeout(() => elements.recordPersonName.focus(), 50);
};

// 2. ADD / EDIT PLACE
function openAddPlaceModal() {
  elements.placeModalTitle.textContent = 'Add New Place';
  elements.placeEditId.value = '';
  elements.placeForm.reset();
  elements.placeModal.showModal();
  setTimeout(() => elements.placeNameInput.focus(), 50);
}

window.openEditPlaceModal = function(id, name) {
  elements.placeModalTitle.textContent = 'Edit Place Name';
  elements.placeEditId.value = id;
  elements.placeNameInput.value = name;
  elements.placeModal.showModal();
  setTimeout(() => elements.placeNameInput.focus(), 50);
};

// 3. DELETE PROMPTS
window.promptDeleteRecord = function(id, personName, amount) {
  state.deleteTarget = { type: 'record', id, label: personName };
  elements.confirmModalTitle.textContent = 'Delete Record?';
  elements.confirmModalMessage.textContent = `Are you sure you want to delete the record for "${personName}" (${currencyFormatter.format(amount)})?`;
  elements.confirmModalSubtext.textContent = 'This action cannot be undone.';
  elements.confirmModal.showModal();
};

window.promptDeletePlace = function(id, placeName, count) {
  state.deleteTarget = { type: 'place', id, label: placeName };
  elements.confirmModalTitle.textContent = 'Delete Place?';
  elements.confirmModalMessage.textContent = `Are you sure you want to delete "${placeName}"?`;
  if (count > 0) {
    elements.confirmModalSubtext.textContent = `⚠️ WARNING: This place contains ${count} contributor records. Deleting this place will permanently delete all ${count} records!`;
  } else {
    elements.confirmModalSubtext.textContent = 'This action cannot be undone.';
  }
  elements.confirmModal.showModal();
};

// ----------------------------------------------------
// FORM SUBMISSIONS & MUTATIONS
// ----------------------------------------------------

// Submit Record Form (Add or Edit)
elements.recordForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const editId = elements.recordEditId.value;
  const placeId = parseInt(elements.recordPlaceSelect.value, 10);
  const personName = elements.recordPersonName.value.trim();
  const amount = parseFloat(elements.recordAmount.value);
  const mobile = elements.recordMobile.value.trim();
  const address = elements.recordAddress.value.trim();
  const timeVal = elements.recordTime.value ? elements.recordTime.value.replace('T', ' ') + ':00' : null;

  if (!placeId) {
    showToast('Please select a place', 'error');
    return;
  }
  if (!personName) {
    showToast('Please enter a person name', 'error');
    return;
  }
  if (isNaN(amount) || amount < 0) {
    showToast('Please enter a valid amount', 'error');
    return;
  }

  try {
    const payload = {
      place_id: placeId,
      person_name: personName,
      amount,
      mobile,
      address,
      created_at: timeVal
    };
    const url = editId ? `/api/records/${editId}` : '/api/records';
    const method = editId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save record');

    elements.recordModal.close();
    showToast(editId ? 'Record updated successfully!' : 'Record added successfully!');
    await loadData();
  } catch (error) {
    console.error('Error saving record:', error);
    showToast(error.message, 'error');
  }
});

// Submit Place Form (Add or Edit)
elements.placeForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const editId = elements.placeEditId.value;
  const name = elements.placeNameInput.value.trim();

  if (!name) {
    showToast('Please enter a place name', 'error');
    return;
  }

  try {
    const url = editId ? `/api/places/${editId}` : '/api/places';
    const method = editId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save place');

    elements.placeModal.close();
    showToast(editId ? `Place "${name}" updated!` : `Place "${name}" added successfully!`);
    
    // Refresh places
    await Promise.all([fetchSummary(), fetchPlaces(), fetchRecords()]);
    renderAll();

    // If adding a new place while adding a record, auto-select it
    if (!editId && elements.recordModal.open) {
      elements.recordPlaceSelect.value = data.id;
    }
  } catch (error) {
    console.error('Error saving place:', error);
    showToast(error.message, 'error');
  }
});

// Confirm Delete Handler
elements.btnConfirmDelete.addEventListener('click', async () => {
  if (!state.deleteTarget) return;

  const { type, id, label } = state.deleteTarget;
  try {
    const url = type === 'record' ? `/api/records/${id}` : `/api/places/${id}`;
    const res = await fetch(url, { method: 'DELETE' });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Failed to delete');

    elements.confirmModal.close();
    showToast(type === 'record' ? `Record for "${label}" deleted` : `Place "${label}" deleted`);

    if (type === 'place' && String(state.selectedPlaceId) === String(id)) {
      state.selectedPlaceId = 'all';
    }

    state.deleteTarget = null;
    await loadData();
  } catch (error) {
    console.error('Delete error:', error);
    showToast(error.message, 'error');
  }
});

// ----------------------------------------------------
// EVENT LISTENERS & SEARCH
// ----------------------------------------------------

// Open Add Record
elements.btnOpenAddRecord.addEventListener('click', () => openAddRecordModal());
elements.btnEmptyAdd.addEventListener('click', () => openAddRecordModal());

// Open Add Place
elements.btnOpenAddPlace.addEventListener('click', openAddPlaceModal);
elements.btnQuickAddPlace.addEventListener('click', openAddPlaceModal);
elements.btnManageAddNewPlace.addEventListener('click', () => {
  elements.managePlacesModal.close();
  openAddPlaceModal();
});

// Open Manage Places
elements.btnOpenManagePlaces.addEventListener('click', () => {
  renderManagePlacesList();
  elements.managePlacesModal.showModal();
});

// Filter Dropdown Change
elements.placeFilter.addEventListener('change', (e) => {
  setPlaceFilter(e.target.value);
});

// Clear Filter
elements.btnClearFilter.addEventListener('click', () => {
  setPlaceFilter('all');
});

// Live Search with Debounce (searches name, place, phone, and address)
let searchDebounceTimer = null;
elements.searchInput.addEventListener('input', (e) => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    state.searchQuery = e.target.value.trim();
    fetchRecords().then(() => renderTable());
  }, 200);
});

// Export CSV Download
elements.btnExportCsv.addEventListener('click', () => {
  window.location.href = '/api/export';
});

// ----------------------------------------------------
// UTILITIES
// ----------------------------------------------------
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeForJs(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// ----------------------------------------------------
// INITIAL LOAD
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', loadData);
