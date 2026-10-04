"""Local dev server: serves the repo at / and proxies sibling project sites (/blockchainlab-*, /sites-monitor) from the live org domain."""
import http.server, urllib.request, sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path.startswith(("/blockchainlab-", "/sites-monitor")):
            try:
                with urllib.request.urlopen("https://blockchains.github.io" + self.path, timeout=30) as r:
                    body = r.read(); self.send_response(200)
                    self.send_header("Content-Type", r.headers.get("Content-Type", "application/octet-stream"))
                    self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
            except Exception as e:  # noqa: BLE001
                self.send_error(502, str(e))
            return
        return super().do_GET()


if __name__ == "__main__":
    http.server.ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1]) if len(sys.argv) > 1 else 8765), H).serve_forever()
