#!/usr/bin/env python3
"""Threaded static file server — prevents single-request blocking on large files."""
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = 8765
DIR  = os.path.dirname(os.path.abspath(__file__))

os.chdir(DIR)
server = ThreadingHTTPServer(('127.0.0.1', PORT), SimpleHTTPRequestHandler)
print(f"Serving {DIR} on http://127.0.0.1:{PORT}/ (threaded)")
server.serve_forever()
