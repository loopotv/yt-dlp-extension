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
  error: 'Errore'
};

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

function renderJob(job) {
  const el = document.createElement('div');
  el.className = `job ${job.status}`;

  const title = document.createElement('div');
  title.className = 'job-title';
  title.textContent = (job.mode === 'audio' ? '🎵 ' : '🎬 ') + job.title;
  title.title = job.title;

  const info = document.createElement('div');
  info.className = 'job-info';
  let text = STATUS_LABELS[job.status] || job.status;
  if (job.status === 'downloading') {
    if (job.percent != null) text += ` · ${job.percent}%`;
    if (job.speed) text += ` · ${job.speed}`;
    if (job.eta) text += ` · ETA ${job.eta}`;
  }
  if (job.status === 'error') text += ': ' + job.error;
  info.textContent = text;

  el.append(title, info);

  if (['starting', 'downloading', 'processing'].includes(job.status)) {
    const bar = document.createElement('div');
    bar.className = 'bar';
    const fill = document.createElement('div');
    fill.style.width = `${job.percent || 0}%`;
    bar.append(fill);
    el.append(bar);
  }
  return el;
}

async function refreshJobs() {
  try {
    const response = await fetch(`${SERVER}/jobs`);
    const jobs = await response.json();
    jobsDiv.replaceChildren(...jobs.map(renderJob));
    clearBtn.style.display = jobs.some(j => ['done', 'error'].includes(j.status)) ? 'block' : 'none';
  } catch {
    // server non raggiungibile: lo segnala il click sul pulsante
  }
}

refreshJobs();
setInterval(refreshJobs, 1000);
