const SERVER = 'http://127.0.0.1:5055';

const btn = document.getElementById('downloadBtn');
const statusDiv = document.getElementById('status');
const jobsDiv = document.getElementById('jobs');
const clearBtn = document.getElementById('clearBtn');

const STATUS_LABELS = {
  starting: 'Avvio...',
  downloading: 'Download in corso',
  processing: 'Elaborazione con ffmpeg...',
  done: 'Completato nella cartella Downloads',
  cancelled: 'Annullato',
  error: 'Errore'
};

const CANCELLABLE = ['starting', 'downloading'];
const ACTIVE = ['starting', 'downloading', 'processing'];

// Elementi già disegnati, per id: vengono aggiornati invece di essere ricreati,
// altrimenti il refresh ogni secondo può far perdere il click su "Annulla"
const jobElements = new Map();

btn.addEventListener('click', async () => {
  btn.disabled = true;
  statusDiv.innerText = '';

  try {
    // 1. Estrae la scheda attiva
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url) {
      statusDiv.innerText = 'Errore: URL scheda non reperibile.';
      return;
    }

    // 2. Invia l'URL al backend Python (il download prosegue anche chiudendo il popup)
    const mode = document.querySelector('input[name="mode"]:checked').value;
    const response = await fetch(`${SERVER}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: tab.url, mode })
    });

    const result = await response.json();
    if (!result.success) {
      statusDiv.innerText = 'Errore: ' + result.error;
    }
    refreshJobs();
  } catch (err) {
    statusDiv.innerText = 'Errore: impossibile contattare il server locale. Hai avviato server.py?';
  } finally {
    btn.disabled = false;
  }
});

clearBtn.addEventListener('click', async () => {
  await fetch(`${SERVER}/jobs/clear`, { method: 'POST' }).catch(() => {});
  refreshJobs();
});

function createJobElement(job) {
  const el = document.createElement('div');

  const header = document.createElement('div');
  header.className = 'job-header';
  const title = document.createElement('div');
  title.className = 'job-title';
  const cancel = document.createElement('button');
  cancel.className = 'cancel-btn';
  cancel.textContent = 'Annulla';
  cancel.addEventListener('click', async () => {
    cancel.disabled = true;
    try {
      const response = await fetch(`${SERVER}/jobs/${job.id}/cancel`, { method: 'POST' });
      const result = await response.json();
      if (!result.success) statusDiv.innerText = 'Errore: ' + result.error;
    } catch {
      statusDiv.innerText = 'Errore: impossibile contattare il server locale.';
    }
    refreshJobs();
  });
  header.append(title, cancel);

  const info = document.createElement('div');
  info.className = 'job-info';
  const bar = document.createElement('div');
  bar.className = 'bar';
  bar.append(document.createElement('div'));

  el.append(header, info, bar);
  el.parts = { title, cancel, info, bar };
  return el;
}

function updateJobElement(el, job) {
  const { title, cancel, info, bar } = el.parts;
  el.className = `job ${job.status}`;

  title.textContent = (job.mode === 'audio' ? '🎵 ' : '🎬 ') + job.title;
  title.title = job.title;

  let text = STATUS_LABELS[job.status] || job.status;
  if (job.cancel_requested && ACTIVE.includes(job.status)) {
    text = 'Annullamento...';
  } else if (job.status === 'downloading') {
    if (job.percent != null) text += ` · ${job.percent}%`;
    if (job.speed) text += ` · ${job.speed}`;
    if (job.eta) text += ` · ETA ${job.eta}`;
  }
  if (job.status === 'error') text += ': ' + job.error;
  info.textContent = text;

  cancel.hidden = !CANCELLABLE.includes(job.status) || job.cancel_requested;
  bar.hidden = !ACTIVE.includes(job.status);
  bar.firstChild.style.width = `${job.percent || 0}%`;
}

async function refreshJobs() {
  try {
    const response = await fetch(`${SERVER}/jobs`);
    const jobs = await response.json();

    const ids = new Set(jobs.map(j => j.id));
    for (const [id, el] of jobElements) {
      if (!ids.has(id)) {
        el.remove();
        jobElements.delete(id);
      }
    }
    jobs.forEach(job => {
      let el = jobElements.get(job.id);
      if (!el) {
        el = createJobElement(job);
        jobElements.set(job.id, el);
      }
      updateJobElement(el, job);
      jobsDiv.append(el); // append su un elemento esistente lo sposta: mantiene l'ordine
    });

    clearBtn.style.display = jobs.some(j => !ACTIVE.includes(j.status)) ? 'block' : 'none';
  } catch {
    // server non raggiungibile: lo segnala il click sul pulsante
  }
}

refreshJobs();
setInterval(refreshJobs, 1000);
