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

PORT = 8765
FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
URL = f"http://localhost:{PORT}/gothenburg_3d.html"

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=FOLDER, **kwargs)
    def log_message(self, *_):
        pass  # suppress request logs

print(f"Serving from:  {FOLDER}")
print(f"Opening:       {URL}")
print(f"Press Ctrl+C to stop the server.\n")

server = http.server.HTTPServer(("localhost", PORT), Handler)
threading.Thread(target=lambda: webbrowser.open(URL), daemon=True).start()
try:
    server.serve_forever()
except KeyboardInterrupt:
    print("\nServer stopped.")
