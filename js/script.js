// js/script.js
// Fungsi permintaan izin lokasi, perhitungan jadwal sholat, dan update otomatis setiap hari

(function() {
    'use strict';

    // Elemen-elemen utama
    const fajrEl = document.getElementById('fajrTime');
    const dhuhrEl = document.getElementById('dhuhrTime');
    const asrEl = document.getElementById('asrTime');
    const maghribEl = document.getElementById('maghribTime');
    const ishaEl = document.getElementById('ishaTime');
    const timezoneInfo = document.getElementById('timezoneInfo');
    const zoneWIB = document.getElementById('zoneWIB');
    const zoneWITA = document.getElementById('zoneWITA');
    const zoneWIT = document.getElementById('zoneWIT');
    const lokasiSelect = document.getElementById('lokasiSelect');

    // Modal elements
    const locationPermissionModal = document.getElementById('locationPermissionModal');
    const closeLocationPermissionBtn = document.getElementById('closeLocationPermissionModal');
    const allowLocationBtn = document.getElementById('allowLocationBtn');
    const denyLocationBtn = document.getElementById('denyLocationBtn');
    const locationResultModal = document.getElementById('locationResultModal');
    const locationResultMessage = document.getElementById('locationResultMessage');
    const closeLocationResultBtn = document.getElementById('closeLocationResultModal');
    const notificationModal = document.getElementById('notificationModal');
    const notificationMessage = document.getElementById('notificationMessage');
    const closeNotificationBtn = document.getElementById('closeNotificationModal');

    // Variabel global
    let currentLat = null;
    let currentLng = null;
    let currentTzOffset = 7;      // default WIB
    let currentZone = 'WIB';
    let lastDateStr = '';
    let locationWatchId = null;
    let bestLocation = null;

    // Helper: format dua digit
    const twoDigits = (num) => String(num).padStart(2, '0');

    // Helper: tentukan zona dan offset berdasarkan bujur (Indonesia)
    function getZoneFromLongitude(lng) {
        if (lng >= 95 && lng < 115) return { zone: 'WIB', offset: 7 };
        if (lng >= 115 && lng < 125) return { zone: 'WITA', offset: 8 };
        return { zone: 'WIT', offset: 9 }; // lng >= 125
    }

    // Fungsi membuka modal
    function openModal(modal) {
        if (modal) modal.classList.add('show');
    }
    function closeModal(modal) {
        if (modal) modal.classList.remove('show');
    }

    // Notifikasi
    function showNotification(msg) {
        if (notificationMessage) notificationMessage.innerHTML = msg;
        openModal(notificationModal);
    }
    function hideNotification() {
        closeModal(notificationModal);
    }

    // Tutup modal dengan tombol close
    if (closeNotificationBtn) closeNotificationBtn.addEventListener('click', hideNotification);
    if (closeLocationPermissionBtn) closeLocationPermissionBtn.addEventListener('click', () => closeModal(locationPermissionModal));
    if (closeLocationResultBtn) closeLocationResultBtn.addEventListener('click', () => closeModal(locationResultModal));

    // Tutup modal jika klik di luar
    window.addEventListener('click', function(event) {
        if (event.target.classList.contains('modal')) {
            closeModal(event.target);
        }
    });

    // Tutup dengan tombol ESC
    window.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            const openModals = document.querySelectorAll('.modal.show');
            openModals.forEach(modal => closeModal(modal));
        }
    });

    // Reverse geocoding (ambil nama lokasi dari koordinat)
    function reverseGeocode(lat, lon, callback) {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
        fetch(url, {
            headers: { 'User-Agent': 'MyTimes/1.0 (userlinuxorg@gmail.com)' }
        })
        .then(response => response.json())
        .then(data => {
            if (data && data.display_name) callback(data.display_name);
            else callback(null);
        })
        .catch(() => callback(null));
    }

    // Fungsi mencari lokasi terbaik dengan watchPosition
    function watchLocation(resolve, reject) {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation not supported'));
            return;
        }
        locationWatchId = navigator.geolocation.watchPosition(
            (position) => {
                const acc = position.coords.accuracy;
                if (!bestLocation || acc < bestLocation.accuracy) {
                    bestLocation = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: acc,
                        timestamp: position.timestamp
                    };
                    if (acc < 10) { // akurasi cukup
                        stopWatching();
                        resolve(bestLocation);
                    }
                }
            },
            (error) => {
                stopWatching();
                reject(error);
            },
            {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 0
            }
        );
        setTimeout(() => {
            if (bestLocation) {
                stopWatching();
                resolve(bestLocation);
            } else {
                stopWatching();
                reject(new Error('Timeout'));
            }
        }, 30000);
    }

    function stopWatching() {
        if (locationWatchId !== null) {
            navigator.geolocation.clearWatch(locationWatchId);
            locationWatchId = null;
        }
    }

    // Simpan lokasi ke localStorage (base64)
    function saveLocationToStorage(lat, lng, tzOffset, zone) {
        const data = { lat, lng, tzOffset, zone, timestamp: Date.now() };
        try {
            localStorage.setItem('mytimes_location', btoa(JSON.stringify(data)));
        } catch (e) {
            console.warn('Gagal menyimpan lokasi:', e);
        }
    }

    // Baca lokasi dari storage (jika masih valid < 24 jam)
    function loadLocationFromStorage() {
        const stored = localStorage.getItem('mytimes_location');
        if (!stored) return null;
        try {
            const decoded = atob(stored);
            const data = JSON.parse(decoded);
            if (Date.now() - data.timestamp < 86400000) return data;
        } catch (e) {}
        return null;
    }

    // Hitung jadwal sholat menggunakan PrayTimes
    function calculatePrayerTimes(lat, lng, tzOffset, zoneLabel) {
        try {
            const pray = new PrayTime('MWL');
            pray.adjust({ fajr: 20, isha: 18 }); // Kemenag
            pray.tune({ fajr: 2, dhuhr: 2, asr: 2, maghrib: 2, isha: 2 }); // ihtiyat 2 menit

            const now = new Date();
            const year = now.getFullYear();
            const month = now.getMonth() + 1;
            const day = now.getDate();
            const times = pray.getTimes([year, month, day], [lat, lng], tzOffset, 0, '24h');

            fajrEl.innerText = times.fajr || '--:--';
            dhuhrEl.innerText = times.dhuhr || '--:--';
            asrEl.innerText = times.asr || '--:--';
            maghribEl.innerText = times.maghrib || '--:--';
            ishaEl.innerText = times.isha || '--:--';

            timezoneInfo.innerText = `Zona: ${zoneLabel} (UTC${tzOffset >= 0 ? '+' + tzOffset : tzOffset}) · ${lat.toFixed(4)}, ${lng.toFixed(4)}`;

            // Aktifkan badge zona
            zoneWIB.classList.remove('active');
            zoneWITA.classList.remove('active');
            zoneWIT.classList.remove('active');
            if (zoneLabel === 'WIB') zoneWIB.classList.add('active');
            else if (zoneLabel === 'WITA') zoneWITA.classList.add('active');
            else if (zoneLabel === 'WIT') zoneWIT.classList.add('active');

            lastDateStr = `${year}-${twoDigits(month)}-${twoDigits(day)}`;
        } catch (e) {
            console.error('Gagal hitung jadwal:', e);
            fajrEl.innerText = dhuhrEl.innerText = asrEl.innerText = maghribEl.innerText = ishaEl.innerText = '--:--';
        }
    }

    // Cek apakah hari sudah berganti
    function isNewDay() {
        const now = new Date();
        return `${now.getFullYear()}-${twoDigits(now.getMonth()+1)}-${twoDigits(now.getDate())}` !== lastDateStr;
    }

    // Mulai interval pengecekan harian
    function startDailyUpdate() {
        setInterval(() => {
            if (currentLat && currentLng && isNewDay()) {
                calculatePrayerTimes(currentLat, currentLng, currentTzOffset, currentZone);
            }
        }, 60000); // cek setiap menit
    }

    // Fungsi utama inisialisasi lokasi
    function initLocation() {
        const stored = loadLocationFromStorage();
        if (stored) {
            // Gunakan data tersimpan
            currentLat = stored.lat;
            currentLng = stored.lng;
            currentTzOffset = stored.tzOffset;
            currentZone = stored.zone;
            calculatePrayerTimes(stored.lat, stored.lng, stored.tzOffset, stored.zone);
            if (lokasiSelect) {
                lokasiSelect.disabled = true;
                lokasiSelect.title = 'Lokasi menggunakan data tersimpan (nonaktifkan dengan hapus localStorage)';
            }
            startDailyUpdate();
        } else {
            // Tampilkan modal izin
            openModal(locationPermissionModal);
        }
    }

    // Event listener untuk tombol izin
    if (allowLocationBtn) {
        allowLocationBtn.addEventListener('click', function() {
            closeModal(locationPermissionModal);
            bestLocation = null;
            watchLocation(
                (position) => {
                    const lat = position.latitude;
                    const lng = position.longitude;
                    const { zone, offset } = getZoneFromLongitude(lng);
                    currentLat = lat;
                    currentLng = lng;
                    currentTzOffset = offset;
                    currentZone = zone;

                    calculatePrayerTimes(lat, lng, offset, zone);
                    saveLocationToStorage(lat, lng, offset, zone);

                    // Nonaktifkan dropdown
                    if (lokasiSelect) {
                        lokasiSelect.disabled = true;
                        lokasiSelect.title = 'Lokasi menggunakan GPS';
                    }

                    // Tampilkan hasil lokasi
                    reverseGeocode(lat, lng, address => {
                        let msg = `<p>Lokasi Anda berhasil didapatkan:</p>
                            <p>Latitude: ${lat.toFixed(4)}<br>Longitude: ${lng.toFixed(4)}<br>Akurasi: ${position.accuracy} meter</p>`;
                        if (address) msg += `<p>Alamat: ${address}</p>`;
                        else msg += `<p>Alamat tidak dapat ditemukan.</p>`;
                        if (position.accuracy > 50) {
                            msg += `<p style="color: #ffaa66;">⚠️ Akurasi rendah. Untuk hasil terbaik, pastikan Anda di luar ruangan.</p>`;
                        }
                        msg += `<p>Jadwal sholat telah diperbarui sesuai lokasi Anda.</p>`;
                        locationResultMessage.innerHTML = msg;
                        openModal(locationResultModal);
                    });

                    startDailyUpdate();
                },
                (error) => {
                    let msg = 'Gagal mendapatkan lokasi. ';
                    if (error.code === 1) msg += 'Izin ditolak. Gunakan pilihan manual.';
                    else if (error.code === 2) msg += 'Posisi tidak tersedia.';
                    else if (error.code === 3) msg += 'Waktu habis.';
                    else msg += error.message;
                    locationResultMessage.innerHTML = `<p>${msg}</p><p>Silakan pilih lokasi secara manual dari dropdown.</p>`;
                    openModal(locationResultModal);
                    // Jangan nonaktifkan dropdown, biarkan user memilih manual
                }
            );
        });
    }

    if (denyLocationBtn) {
        denyLocationBtn.addEventListener('click', function() {
            closeModal(locationPermissionModal);
            stopWatching();
            sessionStorage.setItem('locationPermissionDenied', 'true');
            locationResultMessage.innerHTML = '<p>Anda menolak izin lokasi. Silakan pilih lokasi secara manual dari dropdown.</p>';
            openModal(locationResultModal);
            // Dropdown tetap aktif
        });
    }

    // Jika user memilih lokasi manual dari dropdown
    if (lokasiSelect) {
        lokasiSelect.addEventListener('change', function() {
            const selected = this.value;
            const parts = selected.split(',');
            if (parts.length >= 4) {
                const lat = parseFloat(parts[0]);
                const lng = parseFloat(parts[1]);
                const tzOffset = parseInt(parts[2]);
                const zone = parts[3].trim();
                currentLat = lat;
                currentLng = lng;
                currentTzOffset = tzOffset;
                currentZone = zone;
                calculatePrayerTimes(lat, lng, tzOffset, zone);
                saveLocationToStorage(lat, lng, tzOffset, zone);
                // Nonaktifkan dropdown (karena sudah pakai manual, tapi jika user ingin ganti manual lagi, dia bisa refresh)
                this.disabled = true;
                this.title = 'Lokasi dipilih manual. Refresh untuk mengubah.';
            }
        });
    }

    // Mulai
    document.addEventListener('DOMContentLoaded', initLocation);
})();