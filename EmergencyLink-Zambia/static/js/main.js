// static/js/main.js

document.addEventListener('DOMContentLoaded', function() {
    
    // --- GEOLOCATION LOGIC ---
    const getLocationBtn = document.getElementById('getLocationBtn');
    const latInput = document.getElementById('latitude');
    const longInput = document.getElementById('longitude');
    const locationNameInput = document.getElementById('locationName');
    const statusText = document.getElementById('locationStatus');

    async function reverseGeocode(lat, lng) {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;

        try {
            const response = await fetch(url, {
                headers: {
                    'Accept-Language': 'en'
                }
            });

            if (!response.ok) {
                throw new Error('Location lookup failed');
            }

            const data = await response.json();
            const address = data.address || {};
            const parts = [
                address.amenity,
                address.road,
                address.neighbourhood,
                address.suburb,
                address.city || address.town || address.village,
                address.state,
                address.country
            ].filter(Boolean);

            return parts.length ? parts.join(', ') : `Lat ${lat.toFixed(5)}, Lon ${lng.toFixed(5)}`;
        } catch (error) {
            console.error('Reverse geocoding failed:', error);
            return `Lat ${lat.toFixed(5)}, Lon ${lng.toFixed(5)}`;
        }
    }

    if (getLocationBtn) {
        getLocationBtn.addEventListener('click', async function() {
            if (!navigator.geolocation) {
                statusText.textContent = "Geolocation is not supported by your browser.";
                statusText.style.color = "red";
                return;
            }

            statusText.textContent = "Locating... Please wait.";
            statusText.style.color = "#002B5C";
            
            navigator.geolocation.getCurrentPosition(
                async function(position) {
                    const lat = position.coords.latitude;
                    const lng = position.coords.longitude;
                    latInput.value = lat.toFixed(6);
                    longInput.value = lng.toFixed(6);

                    const placeName = await reverseGeocode(lat, lng);
                    if (locationNameInput) {
                        locationNameInput.value = placeName;
                    }

                    statusText.textContent = "✅ Location captured successfully!";
                    statusText.style.color = "green";
                },
                function(error) {
                    statusText.textContent = "❌ Unable to retrieve location. Please enable permissions or enter manually.";
                    statusText.style.color = "red";
                    console.error("Geolocation error:", error);
                },
                { enableHighAccuracy: true, timeout: 10000 }
            );
        });
    }

    // --- EMERGENCY TYPE CARD SELECTION ---
    const typeCards = document.querySelectorAll('.type-card');
    const typeInput = document.getElementById('type');
    const typeError = document.getElementById('typeError');

    typeCards.forEach(card => {
        card.addEventListener('click', function() {
            // Remove selected class from all cards
            typeCards.forEach(c => c.classList.remove('selected'));
            
            // Add selected class to clicked card
            this.classList.add('selected');
            
            // Set hidden input value
            typeInput.value = this.getAttribute('data-value');
            
            // Hide error message if visible
            typeError.style.display = 'none';
        });
    });

    // --- FORM SUBMISSION ---
    const emergencyForm = document.getElementById('emergencyForm');

    if (emergencyForm) {
        emergencyForm.addEventListener('submit', function(event) {
            event.preventDefault();

            // Validate emergency type selection
            if (!typeInput.value) {
                typeError.style.display = 'block';
                return;
            }

            const submitBtn = document.querySelector('.submit-btn');
            const originalHTML = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
            submitBtn.disabled = true;

            const formData = {
                type: typeInput.value,
                description: document.getElementById('description').value,
                name: document.getElementById('name').value,
                phone: document.getElementById('phone').value,
                latitude: latInput.value || null,
                longitude: longInput.value || null,
                location_name: locationNameInput ? locationNameInput.value : null
            };

            fetch('/submit_emergency', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    window.location.href = `/confirmation/${data.emergency_id}`;
                } else {
                    alert("Error submitting emergency. Please try again.");
                    submitBtn.innerHTML = originalHTML;
                    submitBtn.disabled = false;
                }
            })
            .catch(error => {
                console.error('Error:', error);
                alert("Network error. Please check your connection.");
                submitBtn.innerHTML = originalHTML;
                submitBtn.disabled = false;
            });
        });
    }
});
// --- FOLLOW-UP LOGIC FOR CONFIRMATION PAGE ---
const followUpForm = document.getElementById('followUpForm');
const chatHistory = document.getElementById('chatHistory');
const confirmEmergencyId = document.getElementById('confirmEmergencyId');

if (followUpForm && confirmEmergencyId) {
    const emgId = confirmEmergencyId.value;

    // Load existing follow-ups
    async function loadFollowUps() {
        try {
            const res = await fetch(`/api/follow_ups/${emgId}`);
            const msgs = await res.json();
            
            if (msgs.length === 0) {
                chatHistory.innerHTML = '<p class="empty-chat">No updates yet.</p>';
                return;
            }

            chatHistory.innerHTML = '';
            msgs.forEach(m => {
                const isCitizen = m.sender === 'CITIZEN';
                const div = document.createElement('div');
                div.className = `chat-msg ${isCitizen ? 'citizen' : 'responder'}`;
                div.innerHTML = `
                    <div class="msg-bubble">${m.message}</div>
                    <small class="msg-time">${m.created_at.split(' ')[1]} • ${m.sender}</small>
                `;
                chatHistory.appendChild(div);
            });
            chatHistory.scrollTop = chatHistory.scrollHeight;
        } catch (e) { console.error(e); }
    }

    // Submit new follow-up
    followUpForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const msgInput = document.getElementById('followUpMessage');
        const btn = followUpForm.querySelector('button');
        
        await fetch('/submit_follow_up', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                emergency_id: emgId,
                message: msgInput.value,
                sender: 'CITIZEN'
            })
        });

        msgInput.value = '';
        loadFollowUps();
    });

    // Initial load + poll every 10 seconds
    loadFollowUps();
    setInterval(loadFollowUps, 10000);
}