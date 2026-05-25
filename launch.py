"""
launch.py — starts BOTH servers and opens gothenburg_3d.html in the browser.

  • Port 8765 — static file server (serves assets/gothenburg_3d.html to Cesium)
  • Port 8000 — FastAPI backend  (PVGIS proxy, WWR AI, building lookup, …)

Both servers must be running; the 3D page calls http://localhost:8000/api/* for
every data action. Running this script is the single command needed.

Usage:  python launch.py
"""
import http.server
import subprocess
import threading
import webbrowser
import os
import sys
import socket
import time

PORT         = 8765
BACKEND_PORT = 8000
FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
URL    = f"http://localhost:{PORT}/gothenburg_3d.html"


# ── Helpers ──────────────────────────────────────────────────────────────────

def _free_port(port: int) -> None:
    """Terminate any process already listening on *port* (requires psutil)."""
    try:
        import psutil
        for conn in psutil.net_connections(kind="tcp"):
            if conn.laddr.port == port and conn.status == "LISTEN":
                try:
                    psutil.Process(conn.pid).terminate()
                except Exception:
                    pass
    except ImportError:
        pass  # psutil not installed — rely on SO_REUSEADDR


def _wait_for_port(port: int, timeout: float = 15.0) -> bool:
    """Block until *port* is accepting connections, or *timeout* seconds pass."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            s = socket.create_connection(("127.0.0.1", port), timeout=0.5)
            s.close()
            return True
        except OSError:
            time.sleep(0.3)
    return False


class _SilentHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=FOLDER, **kwargs)

    def log_message(self, *_):
        pass  # suppress per-request logs


# ── Free ports ───────────────────────────────────────────────────────────────
_free_port(BACKEND_PORT)
_free_port(PORT)

# ── Start FastAPI backend (uvicorn) ──────────────────────────────────────────
print("Starting backend …  http://localhost:%d/api/" % BACKEND_PORT)
_backend = subprocess.Popen(
    [
        sys.executable, "-m", "uvicorn",
        "backend.main:app",
        "--port", str(BACKEND_PORT),
        "--log-level", "warning",
    ],
    cwd=os.path.dirname(os.path.abspath(__file__)),
)

if not _wait_for_port(BACKEND_PORT, timeout=20):
    print("  ⚠  Backend did not start within 20 s — PVGIS / AI features may fail.")
else:
    print("  ✓  Backend ready.")

# ── Start static file server ──────────────────────────────────────────────────
print("Serving 3D view …  %s" % URL)
print("Press Ctrl+C to stop both servers.\n")

_static = http.server.HTTPServer(("127.0.0.1", PORT), _SilentHandler)
_static.allow_reuse_address = True

threading.Thread(target=lambda: webbrowser.open(URL), daemon=True).start()

try:
    _static.serve_forever()
except KeyboardInterrupt:
    print("\nStopping servers…")
finally:
    _backend.terminate()
    print("Done.")
