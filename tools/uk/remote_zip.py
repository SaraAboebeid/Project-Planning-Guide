"""
Read members of a remote ZIP over HTTP Range requests, so one local
authority's CSV can be pulled out of the EPC register's multi-GB full-load
archive without downloading all of it.

The register hands out pre-signed S3 links that expire after 30 seconds, so the
file takes a URL factory and fetches a fresh link whenever S3 answers 403.
"""
from __future__ import annotations

import io
import time
from typing import Callable

import requests


class HttpRangeFile(io.RawIOBase):
    """Seekable, read-only file over an HTTP URL that honours Range requests."""

    def __init__(self, url_factory: Callable[[], str], session: requests.Session | None = None, block: int = 4 << 20):
        self.url_factory, self.s, self.pos, self.block = url_factory, session or requests.Session(), 0, block
        self.url = url_factory()
        r = self._get("bytes=0-0")
        self.size = int(r.headers["Content-Range"].split("/")[-1])
        self._cache_start, self._cache = -1, b""

    def _get(self, byte_range: str) -> requests.Response:
        for attempt in range(6):
            try:
                r = self.s.get(self.url, headers={"Range": byte_range}, timeout=300)
            except (requests.ConnectionError, requests.Timeout):
                time.sleep(2 * (attempt + 1))
                continue
            if r.status_code == 403:  # link expired: ask the register for a new one
                self.url = self.url_factory()
                continue
            r.raise_for_status()
            return r
        raise IOError(f"range request {byte_range} kept failing")

    def seekable(self): return True
    def readable(self): return True
    def tell(self): return self.pos

    def seek(self, offset, whence=io.SEEK_SET):
        self.pos = {io.SEEK_SET: offset, io.SEEK_CUR: self.pos + offset, io.SEEK_END: self.size + offset}[whence]
        return self.pos

    def readinto(self, b) -> int:
        n = min(len(b), self.size - self.pos)
        if n <= 0:
            return 0
        end = self.pos + n
        cs = self._cache_start
        if not (cs <= self.pos and end <= cs + len(self._cache)):
            # Read ahead a block: zipfile does many small sequential reads.
            want_end = min(self.size, max(end, self.pos + self.block)) - 1
            self._cache_start, self._cache = self.pos, self._get(f"bytes={self.pos}-{want_end}").content
            cs = self.pos
        chunk = self._cache[self.pos - cs:end - cs]
        b[:len(chunk)] = chunk
        self.pos += len(chunk)
        return len(chunk)
