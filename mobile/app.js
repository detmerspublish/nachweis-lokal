(function() {
  'use strict';

  // --- URL parameter extraction ---
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  const pathParts = window.location.pathname.split('/');
  const inspectionId = pathParts[pathParts.indexOf('inspect') + 1];

  if (!token || !inspectionId) {
    showError('Ungültiger Link', 'Bitte scannen Sie den QR-Code erneut.');
    return;
  }

  const headers = {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json',
  };

  let inspection = null;
  let results = [];
  let photos = {}; // resultId -> [{url, uploading}]
  let saving = false;
  let completing = false;
  let online = true;
  let pendingQueue = []; // offline queue

  // --- IndexedDB for offline persistence ---

  const DB_NAME = 'nachweis-mobile';
  const DB_VERSION = 1;
  let idb = null;

  function openIdb() {
    return new Promise(function(resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function(e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('inspections')) {
          db.createObjectStore('inspections', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('results')) {
          db.createObjectStore('results', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('queue')) {
          db.createObjectStore('queue', { autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('photos')) {
          db.createObjectStore('photos', { autoIncrement: true });
        }
      };
      req.onsuccess = function(e) { idb = e.target.result; resolve(idb); };
      req.onerror = function() { resolve(null); };
    });
  }

  function idbPut(store, data) {
    if (!idb) return Promise.resolve();
    return new Promise(function(resolve) {
      var tx = idb.transaction(store, 'readwrite');
      tx.objectStore(store).put(data);
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  }

  function idbGet(store, key) {
    if (!idb) return Promise.resolve(null);
    return new Promise(function(resolve) {
      var tx = idb.transaction(store, 'readonly');
      var req = tx.objectStore(store).get(key);
      req.onsuccess = function() { resolve(req.result || null); };
      req.onerror = function() { resolve(null); };
    });
  }

  function idbGetAll(store) {
    if (!idb) return Promise.resolve([]);
    return new Promise(function(resolve) {
      var tx = idb.transaction(store, 'readonly');
      var req = tx.objectStore(store).getAll();
      req.onsuccess = function() { resolve(req.result || []); };
      req.onerror = function() { resolve([]); };
    });
  }

  function idbClear(store) {
    if (!idb) return Promise.resolve();
    return new Promise(function(resolve) {
      var tx = idb.transaction(store, 'readwrite');
      tx.objectStore(store).clear();
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  }

  async function saveToLocal() {
    if (!inspection) return;
    await idbPut('inspections', {
      id: parseInt(inspectionId),
      inspection: inspection,
      token: token,
      savedAt: new Date().toISOString(),
    });
    for (var i = 0; i < results.length; i++) {
      await idbPut('results', results[i]);
    }
  }

  async function loadFromLocal() {
    var saved = await idbGet('inspections', parseInt(inspectionId));
    if (!saved) return false;
    inspection = saved.inspection;
    var savedResults = await idbGetAll('results');
    if (savedResults.length > 0) {
      // Only use results for this inspection
      results = savedResults.filter(function(r) {
        return results.length === 0 || true; // use all if fresh
      });
    }
    return true;
  }

  // --- API calls with retry ---

  async function apiFetch(url, options) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(body || 'HTTP ' + res.status);
      }
      setOnline(true);
      return res;
    } catch (err) {
      if (err.name === 'TypeError' || err.message.includes('fetch')) {
        setOnline(false);
      }
      throw err;
    }
  }

  async function fetchInspection() {
    const res = await apiFetch('/api/inspection/' + inspectionId, { headers });
    return res.json();
  }

  async function saveResult(resultId, result, remark) {
    await apiFetch('/api/inspection/' + inspectionId + '/result/' + resultId, {
      method: 'POST',
      headers,
      body: JSON.stringify({ result, remark: remark || '' }),
    });
  }

  async function uploadPhoto(resultId, file) {
    const formData = new FormData();
    formData.append('photo', file);
    const res = await apiFetch(
      '/api/inspection/' + inspectionId + '/photo/' + resultId + '?token=' + token,
      { method: 'POST', body: formData }
    );
    return res.json();
  }

  async function completeInspection() {
    await apiFetch('/api/inspection/' + inspectionId + '/complete', {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });
  }

  // --- Offline queue ---

  function setOnline(state) {
    if (online === state) return;
    online = state;
    updateConnectionBar();
    if (online) flushQueue();
  }

  async function flushQueue() {
    while (pendingQueue.length > 0) {
      const action = pendingQueue[0];
      try {
        await action.fn();
        pendingQueue.shift();
      } catch (_) {
        break; // still offline
      }
    }
    if (pendingQueue.length === 0) updateConnectionBar();
  }

  function enqueueOrRun(fn, persistData) {
    if (online) {
      return fn().catch(function() {
        pendingQueue.push({ fn, data: persistData });
        setOnline(false);
        savePendingQueue();
      });
    } else {
      pendingQueue.push({ fn, data: persistData });
      savePendingQueue();
    }
  }

  async function savePendingQueue() {
    // Save serializable queue actions to IndexedDB
    await idbClear('queue');
    for (var i = 0; i < pendingQueue.length; i++) {
      if (pendingQueue[i].data) {
        await idbPut('queue', pendingQueue[i].data);
      }
    }
  }

  async function restorePendingQueue() {
    var items = await idbGetAll('queue');
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (item.type === 'result') {
        pendingQueue.push({
          fn: function() { return saveResult(item.resultId, item.result, item.remark); },
          data: item,
        });
      }
    }
  }

  // --- Haptic feedback ---

  function vibrate(ms) {
    if (navigator.vibrate) navigator.vibrate(ms || 10);
  }

  // --- Toast ---

  let toastTimer = null;

  function showToast(msg) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('visible'), 2000);
  }

  // --- Rendering ---

  function render() {
    const app = document.getElementById('app');
    const done = results.filter(r => r.result && r.result !== 'offen').length;
    const total = results.length;
    const allDone = done === total && total > 0;

    let html = '';

    // Connection bar
    html += '<div id="connection-bar" class="connection-bar"></div>';

    // Header
    html += '<div class="header">';
    html += '<h1>' + esc(inspection.title) + '</h1>';
    html += '<div class="meta">';
    if (inspection.object_name) html += esc(inspection.object_name) + ' \u00b7 ';
    html += esc(inspection.inspector || 'Kein Prüfer');
    html += '</div>';
    html += '<div class="progress-bar"><div class="fill" style="width:' + (total ? (done/total*100) : 0) + '%"></div></div>';
    html += '<div class="progress-text">' + done + ' von ' + total + ' geprüft</div>';
    html += '</div>';

    // Checklist
    html += '<div class="checklist">';
    for (let i = 0; i < results.length; i++) {
      html += renderItem(results[i], i);
    }
    html += '</div>';

    // Footer
    html += '<div class="footer">';
    html += '<button class="btn-save" onclick="app.save()">Speichern</button>';
    html += '<button class="btn-complete" onclick="app.complete()"' + (allDone ? '' : ' disabled') + '>';
    html += completing ? 'Wird abgeschlossen...' : 'Abschließen';
    html += '</button>';
    html += '</div>';

    app.innerHTML = html;
    updateConnectionBar();
  }

  function renderItem(r, index) {
    const state = r.result === 'ok' ? 'done' : r.result === 'maengel' ? 'fail' : r.result === 'nicht_anwendbar' ? 'skip' : '';

    let html = '<div class="check-item ' + state + '" id="item-' + r.id + '">';

    // Label
    html += '<div class="item-label">';
    html += '<span class="item-num">' + (index + 1) + '</span>';
    html += '<span class="item-label-text">' + esc(r.label);
    if (r.required) html += ' <span class="item-required">Pflicht</span>';
    html += '</span></div>';

    // Hint
    if (r.hint) {
      html += '<div class="item-hint">' + esc(r.hint) + '</div>';
    }

    // Result buttons
    html += '<div class="result-buttons">';
    html += '<button class="result-btn ok' + (r.result === 'ok' ? ' active' : '') + '" onclick="app.setResult(' + r.id + ',\'ok\',' + index + ')">OK</button>';
    html += '<button class="result-btn fail' + (r.result === 'maengel' ? ' active' : '') + '" onclick="app.setResult(' + r.id + ',\'maengel\',' + index + ')">Mängel</button>';
    html += '<button class="result-btn skip' + (r.result === 'nicht_anwendbar' ? ' active' : '') + '" onclick="app.setResult(' + r.id + ',\'nicht_anwendbar\',' + index + ')">Entfällt</button>';
    html += '</div>';

    // Remark (show for maengel, or if there's existing remark text)
    if (r.result === 'maengel' || r.remark) {
      html += '<div class="remark-area">';
      html += '<textarea placeholder="Was ist das Problem?" onblur="app.setRemark(' + r.id + ',this.value)">' + esc(r.remark || '') + '</textarea>';
      html += '</div>';
    }

    // Photos
    html += '<div class="photo-section">';
    var itemPhotos = photos[r.id] || [];
    for (var p = 0; p < itemPhotos.length; p++) {
      if (itemPhotos[p].uploading) {
        html += '<div class="photo-uploading">...</div>';
      } else {
        html += '<div class="photo-thumb-wrap">';
        html += '<img class="photo-thumb" src="' + esc(itemPhotos[p].url) + '" alt="Foto">';
        html += '</div>';
      }
    }
    html += '<label class="photo-btn" for="photo-' + r.id + '">&#128247;</label>';
    html += '<input type="file" id="photo-' + r.id + '" accept="image/*" capture="environment" style="display:none" onchange="app.addPhoto(' + r.id + ',this)">';
    html += '</div>';

    html += '</div>';
    return html;
  }

  function updateConnectionBar() {
    var bar = document.getElementById('connection-bar');
    if (!bar) return;
    if (!online && pendingQueue.length > 0) {
      bar.className = 'connection-bar offline';
      bar.textContent = 'Keine Verbindung — ' + pendingQueue.length + ' Änderung(en) warten';
    } else {
      bar.className = 'connection-bar';
    }
  }

  // --- Error & success screens ---

  function showError(title, msg) {
    document.getElementById('app').innerHTML =
      '<div class="error-screen">' +
      '<div class="icon">&#9888;</div>' +
      '<h2>' + esc(title) + '</h2>' +
      '<p>' + esc(msg) + '</p>' +
      '<button onclick="location.reload()">Erneut versuchen</button>' +
      '</div>';
  }

  function showSuccess() {
    document.getElementById('app').innerHTML =
      '<div class="success-screen">' +
      '<div class="icon">&#10003;</div>' +
      '<h2>Prüfung abgeschlossen</h2>' +
      '<p>Die Ergebnisse wurden an Ihren Computer übertragen. Sie können dieses Fenster schließen.</p>' +
      '</div>';
  }

  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // --- Scroll to next item ---

  function scrollToNextOpen(afterIndex) {
    for (var i = afterIndex + 1; i < results.length; i++) {
      if (!results[i].result || results[i].result === 'offen') {
        var el = document.getElementById('item-' + results[i].id);
        if (el) {
          setTimeout(function() {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 200);
        }
        return;
      }
    }
  }

  // --- Event handlers (exposed globally) ---

  window.app = {
    setResult: function(resultId, result, index) {
      vibrate(10);
      var r = results.find(function(x) { return x.id === resultId; });
      if (!r) return;
      // Toggle: clicking same result again clears it
      if (r.result === result) {
        r.result = 'offen';
        result = 'offen';
      } else {
        r.result = result;
      }
      if (result !== 'maengel') r.remark = '';
      render();
      enqueueOrRun(function() {
        return saveResult(resultId, r.result, r.remark);
      }, { type: 'result', resultId: resultId, result: r.result, remark: r.remark });
      saveToLocal();
      if (result !== 'offen') scrollToNextOpen(index);
    },

    setRemark: function(resultId, remark) {
      var r = results.find(function(x) { return x.id === resultId; });
      if (!r || r.remark === remark) return;
      r.remark = remark;
      enqueueOrRun(function() {
        return saveResult(resultId, r.result, remark);
      }, { type: 'result', resultId: resultId, result: r.result, remark: remark });
      saveToLocal();
    },

    addPhoto: function(resultId, input) {
      var file = input.files && input.files[0];
      if (!file) return;
      // Reset input so same file can be selected again
      input.value = '';

      if (!photos[resultId]) photos[resultId] = [];
      var placeholder = { uploading: true, url: '' };
      photos[resultId].push(placeholder);
      render();

      // Create local preview immediately
      var reader = new FileReader();
      reader.onload = function(e) {
        placeholder.url = e.target.result;
        placeholder.uploading = false;
        render();
      };
      reader.readAsDataURL(file);

      // Upload to PC
      uploadPhoto(resultId, file).then(function(res) {
        showToast('Foto gespeichert');
      }).catch(function() {
        showToast('Foto-Upload fehlgeschlagen');
      });
    },

    save: function() {
      vibrate(10);
      if (pendingQueue.length > 0) {
        flushQueue().then(function() {
          showToast(pendingQueue.length === 0 ? 'Alles gespeichert' : pendingQueue.length + ' Änderung(en) noch offen');
        });
      } else {
        showToast('Alles gespeichert');
      }
    },

    complete: function() {
      var done = results.filter(function(r) { return r.result && r.result !== 'offen'; }).length;
      if (done < results.length) return;

      var required = results.filter(function(r) { return r.required && (!r.result || r.result === 'offen'); });
      if (required.length > 0) {
        showToast(required.length + ' Pflichtpunkt(e) fehlen');
        return;
      }

      completing = true;
      render();
      completeInspection().then(function() {
        showSuccess();
      }).catch(function(err) {
        completing = false;
        render();
        showToast('Fehler beim Abschließen');
      });
    },
  };

  // --- Online/offline detection ---

  window.addEventListener('online', function() { setOnline(true); });
  window.addEventListener('offline', function() { setOnline(false); });

  // --- Init ---

  async function init() {
    await openIdb();

    // Try online first
    try {
      var data = await fetchInspection();
      inspection = data.inspection;
      results = data.results;
      if (data.photos) {
        for (var resultId in data.photos) {
          photos[resultId] = data.photos[resultId].map(function(p) {
            return { url: p.url, uploading: false };
          });
        }
      }
      setOnline(true);
      await saveToLocal();
      render();
      return;
    } catch (_) {}

    // Offline: try loading from IndexedDB
    var loaded = await loadFromLocal();
    if (loaded) {
      setOnline(false);
      await restorePendingQueue();
      render();
      // Periodically try to reconnect
      setInterval(function() {
        if (!online) {
          fetch('/api/status?token=' + token).then(function(res) {
            if (res.ok) {
              setOnline(true);
              flushQueue().then(function() {
                showToast('Verbindung hergestellt — Daten synchronisiert');
              });
            }
          }).catch(function() {});
        }
      }, 15000);
    } else {
      showError(
        'Keine Verbindung',
        'Der Computer ist nicht erreichbar und es gibt keine gespeicherte Prüfung. Verbinden Sie sich mit dem gleichen WLAN wie Ihr Computer.'
      );
    }
  }

  init();
})();
