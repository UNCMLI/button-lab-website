#!/usr/bin/env python3
"""Local dev server for the Button Lab website.

Serves the current directory over HTTP with no-cache headers so that
edits to .html/.css/.js/.json are picked up on a plain browser refresh.
"""
import http.server
import socketserver
import sys


class Server(socketserver.TCPServer):
    allow_reuse_address = True


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 9999
    with Server(("", port), NoCacheHandler) as httpd:
        print(f"Serving on http://localhost:{port}/  (no-cache enabled)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
