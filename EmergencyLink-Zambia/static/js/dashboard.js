// static/js/dashboard.js

let map;
let markers = [];
let knownEmergencyIds = null;
let audioContext = null;
let soundAlertsEnabled = false;

function playEmergencyAlert() {
    if (!soundAlertsEnabled || !audioContext) return;

    const now = audioContext.currentTime;
    const notes = [
        { frequency: 880, start: 0, duration: 0.2 },
        { frequency: 1174.66, start: 0.26, duration: 0.2 },
        { frequency: 880, start: 0.52, duration: 0.32 }
    ];

    notes.forEach(note => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = note.frequency;
        gain.gain.setValueAtTime(0.0001, now + note.start);
        gain.gain.exponentialRampToValueAtTime(0.22, now + note.start + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.duration);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(now + note.start);
        oscillator.stop(now + note.start + note.duration);
    });
}

function announceNewEmergencies(emergencies) {
    const newRequests = emergencies.filter(emergency =>
        emergency.status === 'REQUESTED' && !knownEmergencyIds.has(emergency.emergency_id)
    );
    emergencies.forEach(emergency => knownEmergencyIds.add(emergency.emergency_id));

    if (newRequests.length === 0) return;

    const alert = document.getElementById('emergencyAlert');
    const alertText = document.getElementById('emergencyAlertText');
    alertText.textContent = newRequests.length === 1
        ? `New ${newRequests[0].type} emergency received.`
        : `${newRequests.length} new emergency requests received.`;
    alert.hidden = false;
    playEmergencyAlert();
}

async function enableSoundAlerts() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const button = document.getElementById('soundToggle');

    if (!AudioContextClass) {
        button.querySelector('span').textContent = 'Sound unavailable';
        button.disabled = true;
        return;
    }

    if (!audioContext) audioContext = new AudioContextClass();
    await audioContext.resume();
    soundAlertsEnabled = true;
    button.setAttribute('aria-pressed', 'true');
    button.querySelector('i').className = 'fas fa-volume-high';
    button.querySelector('span').textContent = 'Mute sound alerts';
    playEmergencyAlert();
}

function disableSoundAlerts() {
    soundAlertsEnabled = false;
    const button = document.getElementById('soundToggle');
    button.setAttribute('aria-pressed', 'false');
    button.querySelector('i').className = 'fas fa-volume-xmark';
    button.querySelector('span').textContent = 'Enable sound alerts';
}

function clearEmergencyAlert() {
    document.getElementById('emergencyAlert').hidden = true;
}

// Tab Switching Logic
window.switchTab = function(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active-tab'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    
    // Show selected tab
    document.getElementById(`tab-${tabName}`).classList.add('active-tab');
    event.currentTarget.classList.add('active');
    
    // Update page title
    const titles = { overview: 'Overview', map: 'Map View', history: 'History' };
    document.getElementById('pageTitle').textContent = titles[tabName];

    // Resize maps when tab becomes visible
    setTimeout(() => {
        if (tabName === 'map' && window.fullMapInstance) window.fullMapInstance.invalidateSize();
        if (tabName === 'overview' && map) map.invalidateSize();
    }, 100);
};
// 1. Initialize Map centered on Lusaka, Zambia
function initMap() {
    // Check if map element exists to prevent errors on other pages
    if (!document.getElementById('map')) return;

    map = L.map('map').setView([-15.3875, 28.3228], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
        // Initialize full-screen map for Map View tab
    if (document.getElementById('fullMap')) {
        window.fullMapInstance = L.map('fullMap').setView([-15.3875, 28.3228], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(window.fullMapInstance);
    }
}

// 2. Fetch and Render Data
async function loadEmergencies() {
    try {
        const response = await fetch('/api/emergencies');
        if (response.status === 401) {
            window.location.replace('/responder/login');
            return;
        }
        if (!response.ok) {
            throw new Error(`Emergency request failed with status ${response.status}`);
        }

        const emergencies = await response.json();
        if (!Array.isArray(emergencies)) {
            throw new Error('Emergency API returned an invalid response');
        }

        if (knownEmergencyIds === null) {
            knownEmergencyIds = new Set(emergencies.map(emergency => emergency.emergency_id));
        } else {
            announceNewEmergencies(emergencies);
        }
        
        updateStats(emergencies);
        updateTable(emergencies);
        updateMap(emergencies);
    } catch (error) {
        console.error("Failed to load emergencies:", error);
    }
}

// 3. Update Statistics Cards
function updateStats(data) {
    document.getElementById('totalCount').textContent = data.length;
    
    const active = data.filter(e => e.status !== 'RESOLVED').length;
    const resolved = data.filter(e => e.status === 'RESOLVED').length;
    const newNotifs = data.filter(e => e.status === 'REQUESTED').length;
    
    document.getElementById('activeCount').textContent = active;
    document.getElementById('resolvedCount').textContent = resolved;
    document.getElementById('notifCount').textContent = newNotifs;
}

// 4. Helper for Status Badge Colors
function getStatusClass(status) {
    return status.toLowerCase();
}

// 5. Update Table Rows
function updateTable(data) {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = ''; // Clear existing rows

    data.forEach(e => {
        const locationText = (e.location_name && e.location_name !== 'Unknown location')
            ? e.location_name
            : ((e.latitude && e.longitude)
                ? `${e.latitude.toFixed(4)}, ${e.longitude.toFixed(4)}`
                : 'N/A');

        const row = `
            <tr>
                <td><strong>${e.emergency_id}</strong></td>
                <td>${e.type}</td>
                <td style="max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${e.description || ''}">${e.description || '-'}</td>
                <td><small title="${locationText}">${locationText.length > 28 ? locationText.slice(0, 28) + '...' : locationText}</small></td>
                <td>${e.created_at.split(' ')[1]}</td>
                <td><span class="status-badge ${getStatusClass(e.status)}">${e.status}</span></td>
                <td>
                    <button class="action-btn" onclick="cycleStatus(${e.id}, '${e.status}')">
                        <i class="fas fa-sync-alt"></i> Update
                    </button>
                </td>
            </tr>
        `;
        tbody.innerHTML += row;
    });
}

// 6. Update Map Markers
function updateMap(data) {
    if (!map) return;

    // Clear old markers
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];

    const bounds = [];

    data.forEach(e => {
        if (e.latitude && e.longitude) {
            const locationText = e.location_name || `Lat ${Number(e.latitude).toFixed(4)}, Lon ${Number(e.longitude).toFixed(4)}`;
            const marker = L.marker([e.latitude, e.longitude])
                .bindPopup(`
                    <div style="min-width: 180px; font-family: 'Poppins', sans-serif;">
                        <strong style="color: #0A2540;">${e.type}</strong><br>
                        <small>ID: ${e.emergency_id}</small><br>
                        <span><b>Location:</b> ${locationText}</span><br>
                        Status: <b>${e.status}</b><br>
                        <small style="color: #666;">${e.created_at}</small>
                    </div>
                `)
                .addTo(map);
            markers.push(marker);
            bounds.push([e.latitude, e.longitude]);
        }
    });

    if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [30, 30] });
    }
}

// 7. Handle Status Updates (Cycles through statuses)
window.cycleStatus = async function(id, currentStatus) {
    const statuses = ['REQUESTED', 'RECEIVED', 'RESPONDING', 'ARRIVED', 'RESOLVED'];
    const currentIndex = statuses.indexOf(currentStatus);
    
    // Cycle to next status, or back to REQUESTED if it was RESOLVED
    const nextStatus = statuses[(currentIndex + 1) % statuses.length];

    try {
        await fetch('/update_status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id, status: nextStatus })
        });
        loadEmergencies(); // Refresh data immediately
    } catch (error) {
        console.error("Failed to update status:", error);
    }
};

// 8. Start everything when page loads
document.addEventListener('DOMContentLoaded', () => {
    const soundToggle = document.getElementById('soundToggle');
    soundToggle.addEventListener('click', async () => {
        if (soundAlertsEnabled) {
            disableSoundAlerts();
            return;
        }

        try {
            await enableSoundAlerts();
        } catch (error) {
            console.error('Could not enable sound alerts:', error);
            soundToggle.querySelector('span').textContent = 'Click to enable sound';
        }
    });

    document.getElementById('dismissEmergencyAlert').addEventListener('click', clearEmergencyAlert);
    initMap();
    loadEmergencies();
    
    // Poll for new data every 5 seconds
    setInterval(loadEmergencies, 5000);
});