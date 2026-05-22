"""
launch.py — starts a local HTTP server and opens gothenburg_3d.html in the browser.
This is required for Cesium to work (Edge blocks CDN from file://, but not from http://localhost).

Usage:  python launch.py
"""
import http.server
import threading
import webbrowser
import os
import sys
import socket

PORT = 8765
FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
URL = f"http://localhost:{PORT}/gothenburg_3d.html"

# Kill any existing process on this port before binding
def _free_port(port):
    try:
        import psutil
        for conn in psutil.net_connections(kind='tcp'):
            if conn.laddr.port == port and conn.status == 'LISTEN':
                try:
                    psutil.Process(conn.pid).terminate()
                except Exception:
                    pass
    except ImportError:
        pass  # psutil not available — rely on SO_REUSEADDR

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=FOLDER, **kwargs)
    def log_message(self, *_):
        pass  # suppress request logs

_free_port(PORT)

print(f"Serving from:  {FOLDER}")
print(f"Opening:       {URL}")
print(f"Press Ctrl+C to stop the server.\n")

server = http.server.HTTPServer(("127.0.0.1", PORT), Handler)
server.allow_reuse_address = True
threading.Thread(target=lambda: webbrowser.open(URL), daemon=True).start()
try:
    server.serve_forever()
except KeyboardInterrupt:
    print("\nServer stopped.")
