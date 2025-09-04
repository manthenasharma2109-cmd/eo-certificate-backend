// ====== API BASE ======
const API_BASE =
  location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? 'http://localhost:5000/api'
    : '/api';

// Set API URL in the UI if element exists
const apiUrlView = document.getElementById('apiUrlView');
if (apiUrlView) {
  apiUrlView.textContent = API_BASE;
}

// Debug log
console.log('API Base URL:', API_BASE);

// ====== DOM / UTIL ======
const el = (id) => document.getElementById(id);

function show(e) { if (e) e.classList.remove('hidden'); }
function hide(e) { if (e) e.classList.add('hidden'); }

function token(t) { if (t) localStorage.setItem('token', t); return localStorage.getItem('token'); }
function clearToken() { localStorage.removeItem('token'); localStorage.removeItem('user'); }

function authHeaders() {
  const t = localStorage.getItem('token'); // or sessionStorage
  return {
    'Authorization': `Bearer ${t}`,
    'Content-Type': 'application/json'
  };
}

function notify(msg, type = 'info') {
  const c = el('toastContainer');
  if (!c) { console[type === 'error' ? 'error' : 'log'](msg); return; }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => {
    t.style.animation = 'toast-out 0.3s forwards';
    setTimeout(() => t.remove(), 300);
  }, 3000);
}

// ====== Admin cert pagination state ======

const itemsPerPage = 20;
let totalCertificates = 0;

// ====== INITIALIZATION ======
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM fully loaded, initializing event listeners...');
  initializeEventListeners();
  checkAuthOnLoad();
});

function initializeEventListeners() {
  console.log('Initializing event listeners...');

  // ====== AUTH TABS ======
  el('tabLogin')?.addEventListener('click', () => {
    show(el('loginForm'));
    hide(el('registerForm'));
  });

  el('tabRegister')?.addEventListener('click', () => {
    show(el('registerForm'));
    hide(el('loginForm'));
  });

  // ====== LOGIN ======
  el('doLogin')?.addEventListener('click', async (e) => {
    e.preventDefault(); 
    console.log('Login button clicked');

    const email = el('loginEmail')?.value?.trim();
    const pass = el('loginPassword')?.value?.trim();
    if (!email || !pass) return notify('Enter email & password', 'error');

    try {
      const r = await fetch(API_BASE + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass })
      });
      const d = await r.json();
      if (!r.ok) return notify(d.message || 'Login failed', 'error');

      token(d.token);
      localStorage.setItem('user', JSON.stringify(d.user));
      const userGreeting = el('userGreeting');
      if (userGreeting) userGreeting.textContent = `Hi, ${d.user.username} (${d.user.role})`;
      show(el('logoutBtn'));
      d.user.role === 'admin' ? openAdmin() : openUser();
      hide(el('authSection'));
    } catch (err) {
      console.error('Login error:', err);
      notify('Unable to login. Please try again.', 'error');
    }
  });

  // ====== REGISTER ======
  el('doRegister')?.addEventListener('click', async (e) => {
    e.preventDefault();
    console.log('Register button clicked');

    const u = el('regName')?.value?.trim();
    const em = el('regEmail')?.value?.trim();
    const p = el('regPassword')?.value;
    const c = el('regConfirm')?.value;

    if (!u || !em || !p) return notify('Complete the form', 'error');
    if (p !== c) return notify('Passwords do not match', 'error');

    try {
      const r = await fetch(API_BASE + '/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, email: em, password: p, confirmPassword: c })
      });
      const d = await r.json();
      if (!r.ok) return notify(d.message || 'Registration failed', 'error');
      notify('Registered. Awaiting admin approval.', 'success');
      el('tabLogin')?.click();
    } catch (err) {
      console.error('Register error:', err);
      notify('Unable to register. Please try again.', 'error');
    }
  });

  // ====== LOGOUT ======
  el('logoutBtn')?.addEventListener('click', () => {
    console.log('Logout button clicked');
    clearToken();
    const userGreeting = el('userGreeting');
    if (userGreeting) userGreeting.textContent = 'Not signed in';
    hide(el('logoutBtn'));
    hide(el('userDashboard'));
    hide(el('adminDashboard'));
    show(el('authSection'));
  });

  // ====== PAGINATION EVENT LISTENERS (Admin Certs) ======
  el('prevPage')?.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      loadAdminCerts(currentPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  el('nextPage')?.addEventListener('click', () => {
    if (currentPage * itemsPerPage < totalCertificates) {
      currentPage++;
      loadAdminCerts(currentPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  // ====== MODAL events ======
  el('closeModal')?.addEventListener('click', closeModalFn);

  el('modal')?.addEventListener('click', (e) => {
    const modal = el('modal');
    if (e.target === modal) closeModalFn();
  });

  document.addEventListener('keydown', (e) => {
    const modal = el('modal');
    if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) closeModalFn();
  });

  // ====== USER FILTERS ======
  el('applyFilters')?.addEventListener('click', () => {
    userCurrentPage = 1;
    loadCertificates();
  });

  el('resetFilters')?.addEventListener('click', () => {
    // Clear all filter inputs
    const ids = ['filterEoNumber', 'filterMake', 'filterModel', 'filterYear'];
    ids.forEach((id) => { const i = el(id); if (i) i.value = ''; });
    // Reload certificates without filters
    userCurrentPage = 1;
    loadCertificates();
  });
  
  // ====== PAGINATION ======
  el('userPrevPage')?.addEventListener('click', () => {
    if (userCurrentPage > 1) {
      loadCertificates(userCurrentPage - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  el('userNextPage')?.addEventListener('click', () => {
    loadCertificates(userCurrentPage + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  ['filterEoNumber', 'filterMake', 'filterModel', 'filterYear'].forEach((id) => {
    el(id)?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') loadCertificates();
    });
  });

  // ====== ADMIN DASH ACTIONS ======
  el('refreshUsers')?.addEventListener('click', loadUsers);
  el('refreshCerts')?.addEventListener('click', () => loadAdminCerts(currentPage));

  el('addCertBtn')?.addEventListener('click', () => {
    showModal('Add Certificate', certFormHTML());
    el('saveCert')?.addEventListener('click', saveCert, { once: true });
  });
}

// ====== AUTH CHECK ON LOAD ======
async function checkAuthOnLoad() {
  if (!token()) return;

  try {
    const r = await fetch(API_BASE + '/user/profile', { headers: authHeaders() });
    if (!r.ok) return clearToken();
    const u = await r.json();

    const userGreeting = el('userGreeting');
    if (userGreeting) userGreeting.textContent = `Hi, ${u.username} (${u.role})`;
    show(el('logoutBtn'));
    u.role === 'admin' ? openAdmin() : openUser();
    hide(el('authSection'));
  } catch (err) {
    console.error('Auth check failed:', err);
    clearToken();
  }
}

let userCurrentPage = 1;
let userItemsPerPage = 20;
// ====== USER DASH ======
async function openUser() {
  hide(el('adminDashboard'));
  show(el('userDashboard'));
  userCurrentPage = 1; 
  await populateYearDropdown();  // load initial year dropdown
  loadCertificates(1);           // load first page certificates
}

// ===== Dropdown Populators =====
async function populateYearDropdown() {
  try {
    const res = await fetch(`${API_BASE}/eo-certificates/dropdowns/years`, {
      headers: authHeaders(),
      credentials: 'include'
    });
    const years = await res.json();
    const yearSelect = el('filterYear');
    yearSelect.innerHTML = '<option value="">-- Select Year --</option>';
    years.forEach(y => {
      yearSelect.innerHTML += `<option value="${y}">${y}</option>`;
    });
    yearSelect.disabled = false;
  } catch (err) {
    console.error("Error loading years:", err);
  }
}

async function populateMakeDropdown(year) {
  try {
    const res = await fetch(`${API_BASE}/eo-certificates/dropdowns/vehicle-makes?year=${year}`, {
      headers: authHeaders(),
      credentials: 'include'
    });
    const makes = await res.json();
    const makeSelect = el('filterMake');
    makeSelect.innerHTML = '<option value="">-- Select Make --</option>';
    makes.forEach(m => makeSelect.innerHTML += `<option value="${m}">${m}</option>`);
    makeSelect.disabled = false;
  } catch (err) {
    console.error("Error loading makes:", err);
  }
}

async function populateModelDropdown(year, make) {
  try {
    const res = await fetch(`${API_BASE}/eo-certificates/dropdowns/vehicle-models?year=${year}&make=${make}`, {
      headers: authHeaders(),
      credentials: 'include'
    });
    const models = await res.json();
    const modelSelect = el('filterModel');
    modelSelect.innerHTML = '<option value="">-- Select Model --</option>';
    models.forEach(m => modelSelect.innerHTML += `<option value="${m}">${m}</option>`);
    modelSelect.disabled = false;
  } catch (err) {
    console.error("Error loading models:", err);
  }
}

async function populateEoDropdown(year, make, model) {
  try {
    const res = await fetch(`${API_BASE}/eo-certificates/dropdowns/eo-numbers?year=${year}&make=${make}&model=${model}`, {
      headers: authHeaders(),
      credentials: 'include'
    });
    const eos = await res.json();
    const eoSelect = el('filterEoNumber');
    eoSelect.innerHTML = '<option value="">-- Select EO Number --</option>';
    eos.forEach(e => eoSelect.innerHTML += `<option value="${e}">${e}</option>`);
    eoSelect.disabled = false;
  } catch (err) {
    console.error("Error loading EO numbers:", err);
  }
}

// Single certificate viewing function
async function viewCertificate(id) {
  console.log('viewCertificate called with id:', id);
  if (!id) {
    console.error("No ID provided");
    alert("Error: No certificate ID provided");
    return;
  }

  try {
    console.log("Fetching certificate data...");
    const response = await fetch(`${API_BASE}/eo-certificates/${id}`, {
      headers: authHeaders(),
      cache: 'no-store',
      credentials: 'include'
    });

    console.log('Response status:', response.status);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}`);
    }

    const cert = await response.json();
    console.log('Certificate data received:', cert);
    
    if (!cert) {
      throw new Error("No certificate data received");
    }

    // Build certificate details table
    const certHtml = `
      <div class="certificate-details">
        <style>
          .certificate-details table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
            font-size: 0.9em;
          }
          .certificate-details th, .certificate-details td {
            padding: 12px 15px;
            text-align: left;
            border-bottom: 1px solid #ddd;
            vertical-align: top;
          }
          .certificate-details th {
            background-color: #f8f9fa;
            font-weight: 600;
            width: 30%;
            min-width: 150px;
            white-space: nowrap;
            color: #495057;
          }
          .certificate-details td {
            width: 70%;
            word-break: break-word;
            color: #212529;
          }
          .certificate-details tr:hover {
            background-color: #f5f5f5;
          }
          .certificate-details tr:last-child th,
          .certificate-details tr:last-child td {
            border-bottom: none;
          }
        </style>
        <table>
          <tr><th>EO Number</th><td><strong>${cert['EO Number'] || '-'}</strong></td></tr>
          <tr><th>Year</th><td>${cert.Year || '-'}</td></tr>
          <tr><th>Make</th><td>${cert['Vehicle Make'] || '-'}</td></tr>
          <tr><th>Model</th><td>${cert['Vehicle Model'] || '-'}</td></tr>
          <tr><th>Manufacturer</th><td>${cert.Manufacturer || '-'}</td></tr>
          <tr><th>Engine Size (L)</th><td>${cert['Engine Size(L)'] || '-'}</td></tr>
          <tr><th>Test Group</th><td>${cert['Test Group'] || '-'}</td></tr>
          <tr><th>Evaporative Family</th><td>${cert['Evaporative Family'] || '-'}</td></tr>
          <tr><th>Exhaust ECS Features</th><td>${cert['Exhaust Emission Control System (ECS)'] || '-'}</td></tr>
          <tr><th>Vehicle Class</th><td>${cert['Vehicle Class'] || '-'}</td></tr>
        </table>
      </div>
    `;

    console.log('About to show modal...');
    showCertificateModal('Certificate Details', certHtml);

  } catch (error) {
    console.error('Error in viewCertificate:', error);
    if (typeof notify === 'function') {
      notify('Error loading certificate: ' + error.message, 'error');
    } else {
      alert('Error loading certificate: ' + error.message);
    }
  }
}

// ===== Certificate Modal Display =====
function showCertificateModal(title, contentHtml) {
  // Create modal HTML
  const modalHTML = `
    <div id="certificateModal" class="modal" style="display: block; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000;">
      <div class="modal-content" style="background: white; margin: 50px auto; padding: 20px; width: 90%; max-width: 800px; border-radius: 8px; max-height: 80vh; overflow-y: auto; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
        <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
          <h2 style="margin: 0; color: #333;">${title}</h2>
          <button id="closeCertModal" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #666; padding: 0; width: 30px; height: 30px;">&times;</button>
        </div>
        <div class="modal-body">
          ${contentHtml}
        </div>
      </div>
    </div>
  `;
  
  // Remove existing modal if any
  const existingModal = document.getElementById('certificateModal');
  if (existingModal) {
    existingModal.remove();
  }
  
  // Add modal to page
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  // Add close event listener
  document.getElementById('closeCertModal').addEventListener('click', () => {
    document.getElementById('certificateModal').remove();
  });
  
  // Close on background click
  document.getElementById('certificateModal').addEventListener('click', (e) => {
    if (e.target.id === 'certificateModal') {
      document.getElementById('certificateModal').remove();
    }
  });
  
  // Close on Escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      document.getElementById('certificateModal')?.remove();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
}
function getUserFilters() {
  return {
    year: el('filterYear')?.value?.trim(),
    make: el('filterMake')?.value?.trim(),
    model: el('filterModel')?.value?.trim(),
    eo_number: el('filterEoNumber')?.value?.trim()
  };
}

// ===== Certificates Loader =====
async function loadCertificates(page = 1) {
  show(el('certLoading'));
  hide(el('certTable'));
  hide(el('userPagination'));

  const certBody = el('certBody');
  if (certBody) certBody.innerHTML = '';
  
  const filters = getUserFilters();
  const filteredParams = Object.entries(filters).reduce((acc, [key, value]) => {
    if (value) acc[key] = value;
    return acc;
  }, {});

  const params = new URLSearchParams({
    ...filteredParams,
    limit: userItemsPerPage,
    page: page
  });

  try {
    const url = `${API_BASE}/eo-certificates?${params}`;
    console.log('Fetching certificates with URL:', url);

    const response = await fetch(url, {
      headers: authHeaders(),
      credentials: 'include'
    });

    const responseData = await response.json();
    if (!response.ok) throw new Error(responseData.message || 'Failed to load');

    const certificates = responseData.certificates || [];
    const { pagination } = responseData;

    // Update current page only after successful response
    userCurrentPage = page;
    
    // Store pagination info globally for button state management
    window.currentPagination = pagination;

    if (certificates.length === 0 && page > 1) {
      // If no results on a page > 1, go back to page 1
      await loadCertificates(1);
      return;
    }

    if (certificates.length === 0) {
      hide(el('certLoading'));
      el('certLoading').textContent = 'No certificates found';
      show(el('certLoading'));
      return;
    }

    hide(el('certLoading'));
    show(el('certTable'));

    certBody.innerHTML = certificates.map(cert => `
      <tr>
        <td>${cert['EO Number'] || '-'}</td>
        <td>${cert.Year || '-'}</td>
        <td>${cert['Vehicle Make'] || '-'}</td>
        <td>${cert['Vehicle Model'] || '-'}</td>
        <td>${cert.Manufacturer || '-'}</td>
        <td>${cert['Engine Size(L)'] || '-'}</td>
        <td>${cert['Evaporative Family'] || '-'}</td>
        <td>${cert['Test Group'] || '-'}</td>
        <td><button class="btn btn-ghost small view-btn" data-id="${cert.id}">View</button></td>
      </tr>
    `).join('');

    // Re-attach event listeners for view buttons
    certBody.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await viewCertificate(btn.dataset.id);
      });
    });

    // Show pagination if there are multiple pages
    if (pagination && pagination.totalPages > 1) {
      show(el('userPagination'));
      const pageInfoEl = el('userPageInfo');
      const prevPageEl = el('userPrevPage');
      const nextPageEl = el('userNextPage');
      
      if (pageInfoEl) {
        pageInfoEl.textContent = `Page ${pagination.currentPage} of ${pagination.totalPages}`;
      }
      if (prevPageEl) {
        prevPageEl.disabled = pagination.currentPage <= 1;
      }
      if (nextPageEl) {
        nextPageEl.disabled = pagination.currentPage >= pagination.totalPages;
      }
    } else {
      // Hide pagination if only one page or no data
      hide(el('userPagination'));
    }

  } catch (err) {
    console.error('Error loading certificates:', err);
    hide(el('certLoading'));
    hide(el('certTable'));
    el('certLoading').textContent = `Error: ${err.message}`;
    show(el('certLoading'));
  }
}

// ===== Dropdown Change Events =====
el('filterYear')?.addEventListener('change', async (e) => {
  // Reset dependent dropdowns
  const makeEl = el('filterMake');
  const modelEl = el('filterModel');
  const eoEl = el('filterEoNumber');
  
  makeEl.disabled = true;
  modelEl.disabled = true;
  eoEl.disabled = true;
  makeEl.innerHTML = '<option value="">-- Select Make --</option>';
  modelEl.innerHTML = '<option value="">-- Select Model --</option>';
  eoEl.innerHTML = '<option value="">-- Select EO Number --</option>';

  if (e.target.value) {
    await populateMakeDropdown(e.target.value);
  }
  
  userCurrentPage = 1;
  await loadCertificates(1);
});

el('filterMake')?.addEventListener('change', async (e) => {
  // Reset dependent dropdowns
  const modelEl = el('filterModel');
  const eoEl = el('filterEoNumber');
  
  modelEl.disabled = true;
  eoEl.disabled = true;
  modelEl.innerHTML = '<option value="">-- Select Model --</option>';
  eoEl.innerHTML = '<option value="">-- Select EO Number --</option>';

  if (e.target.value) {
    await populateModelDropdown(el('filterYear').value, e.target.value);
  }
  
  userCurrentPage = 1;
  await loadCertificates(1);
});

el('filterModel')?.addEventListener('change', async (e) => {
  // Reset dependent dropdown
  const eoEl = el('filterEoNumber');
  eoEl.disabled = true;
  eoEl.innerHTML = '<option value="">-- Select EO Number --</option>';

  if (e.target.value) {
    await populateEoDropdown(el('filterYear').value, el('filterMake').value, e.target.value);
  }
  
  userCurrentPage = 1;
  await loadCertificates(1);
});

el('filterEoNumber')?.addEventListener('change', async () => {
  userCurrentPage = 1;
  await loadCertificates(1);
});

// ===== Clear Filters =====
el('clearFilters')?.addEventListener('click', async () => {
  // Reset all dropdowns to initial state
  const yearEl = el('filterYear');
  const makeEl = el('filterMake');
  const modelEl = el('filterModel');
  const eoEl = el('filterEoNumber');
  
  if (yearEl) yearEl.value = '';
  if (makeEl) {
    makeEl.innerHTML = '<option value="">-- Select Make --</option>';
    makeEl.disabled = true;
  }
  if (modelEl) {
    modelEl.innerHTML = '<option value="">-- Select Model --</option>';
    modelEl.disabled = true;
  }
  if (eoEl) {
    eoEl.innerHTML = '<option value="">-- Select EO Number --</option>';
    eoEl.disabled = true;
  }
  
  userCurrentPage = 1;
  await loadCertificates(1);
});

// ===== Pagination Event Listeners =====
// Previous Page
el('userPrevPage')?.addEventListener('click', async (e) => {
  e.preventDefault();
  if (userCurrentPage > 1) {
    await loadCertificates(userCurrentPage - 1);
  }
});

// Next Page  
el('userNextPage')?.addEventListener('click', async (e) => {
  e.preventDefault();
  const pagination = window.currentPagination;
  if (pagination && userCurrentPage < pagination.totalPages) {
    await loadCertificates(userCurrentPage + 1);
  }
});
// ====== ADMIN DASH ======
async function openAdmin() {
  hide(el('userDashboard'));
  show(el('adminDashboard'));
  loadUsers();
  loadAdminCerts(currentPage);
}

async function loadUsers() {
  show(el('usersLoading'));
  hide(el('usersTable'));
  const tbody = el('usersBody');
  if (tbody) tbody.innerHTML = '';

  try {
    const r = await fetch(API_BASE + '/admin/users', { headers: authHeaders() });
    if (!r.ok) {
      const msg = (await r.json()).message;
      const loading = el('usersLoading');
      if (loading) loading.textContent = msg || 'Failed to load users';
      return;
    }

    const u = (await r.json()).users || [];
    if (!u.length) {
      const loading = el('usersLoading');
      if (loading) loading.textContent = 'No users';
      return;
    }

    hide(el('usersLoading'));
    show(el('usersTable'));

    // Separate pending users
    const pendingUsers = u.filter(x => x.status === 'pending');
    const otherUsers = u.filter(x => x.status !== 'pending');

    if (tbody) {
      // Pending first
      if (pendingUsers.length) {
        tbody.innerHTML += `<tr class="table-section"><td colspan="5"><strong>Pending Users</strong></td></tr>`;
        pendingUsers.forEach(x => {
          tbody.innerHTML += `
            <tr>
              <td>${x.username}</td>
              <td>${x.email}</td>
              <td><span class="badge pending">Pending</span></td>
              <td>${x.role}</td>
              <td>
                <button class="btn success" onclick="updateUserStatus(${x.id},'approved')">Approve</button>
                <button class="btn danger" onclick="updateUserStatus(${x.id},'denied')">Deny</button>
              </td>
            </tr>`;
        });
      }

      // All other users
      if (otherUsers.length) {
        tbody.innerHTML += `<tr class="table-section"><td colspan="5"><strong>All Users</strong></td></tr>`;
        otherUsers.forEach(x => {
          tbody.innerHTML += `
            <tr>
              <td>${x.username}</td>
              <td>${x.email}</td>
              <td><span class="badge ${x.status}">${x.status}</span></td>
              <td>${x.role}</td>
              <td>
                <button class="btn btn-ghost" onclick="deleteUser(${x.id})">Delete</button>
              </td>
            </tr>`;
        });
      }
    }
  } catch (err) {
    console.error('Load users error:', err);
    const loading = el('usersLoading');
    if (loading) loading.textContent = 'Error loading users';
  }
}

window.updateUserStatus = async (id, status) => {
  if (!confirm(`Are you sure you want to ${status} this user?`)) return;

  const button = event.target;
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'Updating...';

  try {
    const r = await fetch(`${API_BASE}/admin/users/${id}/status`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ status })
    });

    if (!r.ok) {
      const error = await r.json();
      throw new Error(error.message || 'Failed to update user status');
    }

    notify(`User ${status} successfully`, 'success');
    await loadUsers();
  } catch (error) {
    console.error('Update status error:', error);
    notify(error.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
};

window.deleteUser = async (id) => {
  if (!confirm('Delete user?')) return;
  try {
    const r = await fetch(`${API_BASE}/admin/users/${id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    if (!r.ok) return notify((await r.json()).message, 'error');
    notify('User deleted', 'success');
    loadUsers();
  } catch (err) {
    console.error('Delete user error:', err);
    notify('Failed to delete user', 'error');
  }
};

// ====== ADMIN CERTS ======
let currentPage = 1;
const limit = 10; // same as backend default

let adminCurrentPage = 1;
const adminItemsPerPage = 10;

async function loadAdminCerts(page = 1) {
  show(el('certsLoadingAdmin'));
  hide(el('adminCertTable'));

  // More robust element selection with error checking
  function getFilterValue(id, placeholder) {
    // Try by ID first
    const elById = document.getElementById(id);
    if (elById && elById.value.trim().length > 0) {
      return elById.value.trim();
    }
  
    // Fallback by placeholder only if ID not found
    const elByPlaceholder = document.querySelector(`input[placeholder="${placeholder}"]`);
    if (elByPlaceholder && elByPlaceholder.value.trim().length > 0) {
      return elByPlaceholder.value.trim();
    }
  
    return '';
  }
  
  const eo_number = getFilterValue('filterEONumber', 'EO Number');
  const year = getFilterValue('filterYear', 'Year');
  const make = getFilterValue('filterMake', 'Make');
  const model = getFilterValue('filterModel', 'Model');

  // Debug logging to see what values we're getting
  console.log('Filter values:', { eo_number, year, make, model });
 
  try {
    // build query params - Fixed: Initialize URLSearchParams without parameters
    const params = new URLSearchParams();
  
  // Add page and limit first
  params.append("page", page);
  params.append("limit", adminItemsPerPage);
  
  // Add filter parameters only if they have values
  if (eo_number && eo_number.length > 0) params.append("eo_number", eo_number);
  if (year && year.length > 0) params.append("year", year);
  if (make && make.length > 0) params.append("make", make);
  if (model && model.length > 0) params.append("model", model);

  // Debug logging to see the final URL
  const finalUrl = `${API_BASE}/admin/eo-certificates?${params.toString()}`;
  console.log('Final URL:', finalUrl);

  const r = await fetch(`${API_BASE}/admin/eo-certificates?${params.toString()}`, {
    headers: authHeaders(),
    cache: "no-store"
  });

  if (!r.ok) throw new Error('Failed to load admin certificates');
  const data = await r.json();

    const list = data.certificates || [];
    const pagination = data.pagination || { currentPage: 1, totalPages: 1, total: list.length };

    const tbody = el('adminCertBody');
    tbody.innerHTML = '';

    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;">No certificates found</td></tr>`;
    } else {
      list.forEach(cert => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${cert['EO Number'] || '-'}</td>
          <td>${cert.Year || '-'}</td>
          <td>${cert['Vehicle Make'] || '-'}</td>
          <td>${cert['Vehicle Model'] || '-'}</td>
          <td>${cert.Manufacturer || '-'}</td>
          <td>${cert['Engine Size(L)'] || '-'}</td>
          <td>${cert['Evaporative Family'] || '-'}</td>
          <td>${cert['Test Group'] || '-'}</td>
          <td>${cert['Exhaust Emission Control System (ECS)'] || '-'}</td>
          <td>
            <button class="btn btn-ghost" onclick="editCert('${cert.id}')">Edit</button>
            <button class="btn danger" onclick="deleteCert('${cert.id}')">Delete</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }

    hide(el('certsLoadingAdmin'));
    show(el('adminCertTable'));

    updateAdminPaginationUI(pagination.currentPage, pagination.totalPages);
    show(el('pagination'));

    adminCurrentPage = pagination.currentPage;
  } catch (err) {
    console.error(err);
    notify('Error loading admin certificates', 'error');
  }
}

let filterTimeout;
          
          function handleFilterChange() {
            clearTimeout(filterTimeout);
            filterTimeout = setTimeout(() => {
              loadAdminCerts(1);
            }, 300); // Wait 300ms after user stops typing
          }
          
          function handleFilterKeyup(event) {
            if (event.key === 'Enter') {
              clearTimeout(filterTimeout);
              loadAdminCerts(1);
            }
          }
          
          
          

function updateAdminPaginationUI(currentPageVal, totalPages) {
  const pageInfo = el('pageInfo');
  const prevBtn = el('prevPage');
  const nextBtn = el('nextPage');

  if (pageInfo) pageInfo.textContent = `Page ${currentPageVal} of ${totalPages}`;
  if (prevBtn) prevBtn.disabled = currentPageVal <= 1;
  if (nextBtn) nextBtn.disabled = currentPageVal >= totalPages || totalPages === 0;
}

// Event listeners
el('prevPage')?.addEventListener('click', () => {
  if (adminCurrentPage > 1) loadAdminCerts(adminCurrentPage - 1);
});
el('nextPage')?.addEventListener('click', () => {
  loadAdminCerts(adminCurrentPage + 1);
});


window.editCert = async (id) => {
  try {
    const r = await fetch(`${API_BASE}/eo-certificates/${id}`, { headers: authHeaders() });
    if (!r.ok) return notify('Not found', 'error');
    const data = await r.json();

    showModal('Edit Certificate', certFormHTML(data));

    const saveBtn = el('saveCert');
    if (saveBtn) {
      const handler = async () => {
        try {
          const formData = getCertFormData(); // 👈 Get form data instead of HTML
          console.log("Updating cert data:", formData);

          if (!formData['EO Number'] || !formData['Year']) {
            return notify('EO number & year required', 'error');
          }

          const r2 = await fetch(`${API_BASE}/admin/eo-certificates/${id}`, {
            method: 'PUT',
            headers: {
              ...authHeaders(),
              'Content-Type': 'application/json' // 👈 Add content type
            },
            body: JSON.stringify(formData) // 👈 Send form data, not HTML
          });

          if (!r2.ok) {
            const errMsg = await r2.json();
            return notify(errMsg.message || 'Error updating certificate', 'error');
          }

          notify('Updated', 'success');
          closeModalFn();
          loadAdminCerts(currentPage);
        } catch (err) {
          console.error('Update cert error:', err);
          notify('Failed to update certificate', 'error');
        }
      };
      saveBtn.addEventListener('click', handler, { once: true });
    }
  } catch (err) {
    console.error('Edit cert load error:', err);
    notify('Failed to load certificate', 'error');
  }
};

window.deleteCert = async (id) => {
  if (!confirm('Delete certificate?')) return;
  try {
    const r = await fetch(`${API_BASE}/admin/eo-certificates/${id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    if (!r.ok) return notify((await r.json()).message, 'error');
    notify('Deleted', 'success');
    loadAdminCerts(currentPage);
  } catch (err) {
    console.error('Delete cert error:', err);
    notify('Failed to delete certificate', 'error');
  }
};

async function saveCert() {
  try {
    const data = getCertFormData(); // 👈 Changed to get data from form inputs
    console.log("Submitting cert data:", data);

    if (!data['EO Number'] || !data['Year']) {
      return notify('EO number & year required', 'error');
    }

    const r = await fetch(`${API_BASE}/admin/eo-certificates`, {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    if (!r.ok) {
      const errMsg = await r.json();
      console.error("Save cert failed:", errMsg);
      return notify(errMsg.message || 'Error adding certificate', 'error');
    }

    notify('Certificate added', 'success');
    closeModalFn();
    loadAdminCerts(currentPage);
  } catch (err) {
    console.error('Save cert error:', err);
    notify('Failed to add certificate', 'error');
  }
}

// ====== FORM HELPERS ======
function certFormHTML(c = {}) {
  return `<div class="grid">
    <label>EO Number <span class="required">*</span></label>
    <input id="m_eo" value="${c['EO Number'] || ''}" required>

    <label>Year <span class="required">*</span></label>
    <input id="m_year" type="number" value="${c['Year'] || ''}" required>

    <label>Make</label>
    <input id="m_make" value="${c['Vehicle Make'] || ''}">

    <label>Model</label>
    <input id="m_model" value="${c['Vehicle Model'] || ''}">

    <label>Manufacturer</label>
    <input id="m_man" value="${c['Manufacturer'] || ''}">

    <label>Engine Size</label>
    <input id="m_engine_size" value="${c['Engine Size(L)'] || ''}">

    <label>Evaporative Family</label>
    <input id="m_evap_family" value="${c['Evaporative Family'] || ''}">

    <label>Test Group</label>
    <input id="m_test_group" value="${c['Test Group'] || ''}">

    <label>Exhaust ECS Special Features</label>
    <textarea id="m_exhaust_features" rows="3">${c['Exhaust Emission Control System (ECS)'] || ''}</textarea>

    <div class="form-actions">
      <button type="button" class="btn btn-secondary" onclick="closeModalFn()">Cancel</button>
      <button id="saveCert" class="btn btn-primary">Save</button>
    </div>
  </div>`;
}

// 👈 NEW: Function to extract data from form inputs
function getCertFormData() {
  return {
    'EO Number': document.getElementById('m_eo')?.value || '',
    'Year': parseInt(document.getElementById('m_year')?.value) || null,
    'Vehicle Make': document.getElementById('m_make')?.value || '',
    'Vehicle Model': document.getElementById('m_model')?.value || '',
    'Manufacturer': document.getElementById('m_man')?.value || '',
    'Engine Size(L)': document.getElementById('m_engine_size')?.value || '',
    'Evaporative Family': document.getElementById('m_evap_family')?.value || '',
    'Test Group': document.getElementById('m_test_group')?.value || '',
    'Exhaust Emission Control System (ECS)': document.getElementById('m_exhaust_features')?.value || ''
  };
}


// ====== MODAL HELPERS ======
function showModal(title, html) {
  const modal = el('modal');
  const modalBody = el('modalBody');
  const modalTitle = el('modalTitle');
  if (modalTitle) modalTitle.textContent = title;
  if (modalBody) modalBody.innerHTML = html;
  show(modal);
}

function closeModalFn() {
  const modal = el('modal');
  const modalBody = el('modalBody');
  hide(modal);
  if (modalBody) modalBody.innerHTML = '';
}


// Load Years first
async function loadYears() {
  const res = await fetch(`${API_BASE}/eo-certificates/years`);
  const years = await res.json();

  const yearSelect = document.getElementById("yearFilter");
  years.forEach(y => {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    yearSelect.appendChild(opt);
  });
}

// Load Makes when Year is chosen
async function loadMakes() {
  const year = document.getElementById("yearFilter").value;
  const makeSelect = document.getElementById("makeFilter");

  makeSelect.innerHTML = `<option value="">-- Select Make --</option>`;
  document.getElementById("modelFilter").innerHTML = `<option value="">-- Select Model --</option>`;
  document.getElementById("eoFilter").innerHTML = `<option value="">-- Select EO --</option>`;

  if (!year) return;

  const res = await fetch(`${API_BASE}/eo-certificates/vehicle-makes?year=${year}`);
  const makes = await res.json();

  makes.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    makeSelect.appendChild(opt);
  });
}

// Load Models when Make is chosen
async function loadModels() {
  const year = document.getElementById("yearFilter").value;
  const make = document.getElementById("makeFilter").value;
  const modelSelect = document.getElementById("modelFilter");

  modelSelect.innerHTML = `<option value="">-- Select Model --</option>`;
  document.getElementById("eoFilter").innerHTML = `<option value="">-- Select EO --</option>`;

  if (!year || !make) return;

  const res = await fetch(`${API_BASE}/eo-certificates/vehicle-models?year=${year}&make=${make}`);
  const models = await res.json();

  models.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    modelSelect.appendChild(opt);
  });
}

// Load EO Numbers when Model is chosen
async function loadEOs() {
  const year = document.getElementById("yearFilter").value;
  const make = document.getElementById("makeFilter").value;
  const model = document.getElementById("modelFilter").value;
  const eoSelect = document.getElementById("eoFilter");

  eoSelect.innerHTML = `<option value="">-- Select EO --</option>`;

  if (!year || !make || !model) return;

  const res = await fetch(`${API_BASE}/eo-certificates/eo-numbers?year=${year}&make=${make}&model=${model}`);
  const eos = await res.json();

  eos.forEach(e => {
    const opt = document.createElement("option");
    opt.value = e;
    opt.textContent = e;
    eoSelect.appendChild(opt);
  });
}

// Final load of table when EO is chosen
async function loadCerts(page = 1) {
  const year = document.getElementById("yearFilter").value;
  const make = document.getElementById("makeFilter").value;
  const model = document.getElementById("modelFilter").value;
  const eo = document.getElementById("eoFilter").value;

  let url = `${API_BASE}/eo-certificates?page=${page}&limit=10`;
  if (year) url += `&year=${year}`;
  if (make) url += `&make=${make}`;
  if (model) url += `&model=${model}`;
  if (eo) url += `&eo_number=${eo}`;

  const res = await fetch(url, { headers: authHeaders() });
  const data = await res.json();
  renderTable(data);
}

// Run on page load
loadYears();
