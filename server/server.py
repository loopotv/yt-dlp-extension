from flask import Flask, request, jsonify, abort
import yt_dlp
import os
import threading
import uuid

app = Flask(__name__)

HOST = "127.0.0.1"
PORT = 5055  # la 5000 su macOS è occupata da AirPlay Receiver

# Cartella di destinazione per i download
DOWNLOAD_FOLDER = os.path.expanduser("~/Downloads")

# Stato dei download in corso/completati (in memoria)
jobs = {}
jobs_lock = threading.Lock()


@app.before_request
def only_extensions():
    # Rifiuta le richieste dei siti web: impedisce a qualsiasi pagina aperta nel
    # browser di avviare download sul tuo computer. Chrome invia sempre Origin
    # nelle POST dei siti, mentre le GET dell'estensione possono arrivare senza.
    origin = request.headers.get("Origin")
    if origin is not None and not origin.startswith("chrome-extension://"):
        abort(403)


ACTIVE_STATUSES = ("starting", "downloading", "processing")


class DownloadCancelled(Exception):
    pass


def update_job(job_id, **fields):
    with jobs_lock:
        jobs[job_id].update(fields)


def is_cancelled(job_id):
    with jobs_lock:
        return jobs[job_id]["cancel_requested"]


def build_opts(job_id, mode, files):
    def progress_hook(d):
        # Tiene traccia dei file scritti, per poterli cancellare se si annulla
        files.update(f for f in (d.get("tmpfilename"), d.get("filename")) if f)
        if is_cancelled(job_id):
            raise DownloadCancelled()
        if d["status"] == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate")
            percent = round(d["downloaded_bytes"] * 100 / total, 1) if total else None
            update_job(job_id, status="downloading", percent=percent,
                       speed=d.get("_speed_str", "").strip(), eta=d.get("_eta_str", "").strip())
        elif d["status"] == "finished":
            update_job(job_id, status="processing", percent=100)

    opts = {
        "outtmpl": os.path.join(DOWNLOAD_FOLDER, "%(title)s.%(ext)s"),
        "noplaylist": True,
        "progress_hooks": [progress_hook],
        "quiet": True,
        "noprogress": True,
        "no_warnings": True,
    }
    if mode == "audio":
        opts["format"] = "bestaudio/best"
        opts["postprocessors"] = [{"key": "FFmpegExtractAudio", "preferredcodec": "mp3"}]
    else:
        opts["format"] = "bestvideo+bestaudio/best"
        opts["merge_output_format"] = "mp4"
    return opts


def remove_partial_files(files):
    for f in files:
        for path in (f, f + ".part", f + ".ytdl"):
            if os.path.exists(path):
                os.remove(path)


def run_download(job_id, url, mode):
    files = set()
    try:
        with yt_dlp.YoutubeDL(build_opts(job_id, mode, files)) as ydl:
            info = ydl.extract_info(url, download=False)
            update_job(job_id, title=info.get("title") or url)
            if is_cancelled(job_id):
                raise DownloadCancelled()
            ydl.process_ie_result(info, download=True)
        update_job(job_id, status="done", percent=100)
    except Exception as e:
        # yt-dlp può incapsulare DownloadCancelled in un'altra eccezione,
        # quindi conta la richiesta di annullamento, non il tipo di errore
        if is_cancelled(job_id):
            remove_partial_files(files)
            update_job(job_id, status="cancelled")
        else:
            update_job(job_id, status="error", error=str(e))


@app.route("/download", methods=["POST"])
def download():
    data = request.get_json(silent=True) or {}
    video_url = data.get("url")
    mode = data.get("mode", "video")

    if not video_url or not video_url.startswith(("http://", "https://")):
        return jsonify({"success": False, "error": "URL non valido"}), 400

    job_id = uuid.uuid4().hex[:8]
    with jobs_lock:
        # Se lo stesso video è già in download non ne avvia un secondo, che
        # scriverebbe sullo stesso file .part
        for job in jobs.values():
            if job["url"] == video_url and job["mode"] == mode and job["status"] in ACTIVE_STATUSES:
                return jsonify({"success": False, "error": "Download già in corso"}), 409
        jobs[job_id] = {"id": job_id, "url": video_url, "title": video_url, "mode": mode,
                        "status": "starting", "percent": 0, "error": None, "cancel_requested": False}
    threading.Thread(target=run_download, args=(job_id, video_url, mode), daemon=True).start()
    return jsonify({"success": True, "job_id": job_id})


@app.route("/jobs", methods=["GET"])
def list_jobs():
    with jobs_lock:
        return jsonify(list(reversed(list(jobs.values()))))


@app.route("/jobs/<job_id>/cancel", methods=["POST"])
def cancel_job(job_id):
    with jobs_lock:
        job = jobs.get(job_id)
        if not job:
            return jsonify({"success": False, "error": "Download non trovato"}), 404
        # Durante la conversione ffmpeg non c'è modo di interrompere yt-dlp
        if job["status"] not in ("starting", "downloading"):
            return jsonify({"success": False, "error": "Il download non può più essere annullato"}), 409
        job["cancel_requested"] = True
    return jsonify({"success": True})


@app.route("/jobs/clear", methods=["POST"])
def clear_jobs():
    with jobs_lock:
        for job_id in [k for k, j in jobs.items() if j["status"] not in ACTIVE_STATUSES]:
            del jobs[job_id]
    return jsonify({"success": True})


if __name__ == "__main__":
    print(f"Server locale YT-DLP in ascolto su http://{HOST}:{PORT}")
    print(f"I file verranno salvati in {DOWNLOAD_FOLDER}")
    app.run(host=HOST, port=PORT, threaded=True)
