#!/usr/bin/env python3
"""GitHub webhook listener for HamaFX-Ai auto-deploy.

Listens on port 9000. Receives push events from GitHub, validates the
HMAC-SHA256 signature against WEBHOOK_SECRET, and runs docker-update.sh
in the background.

Stdlib only — no pip packages needed.

Systemd socket activation: systemd listens on port 9000 and passes the
socket to this script, so it only runs when a request arrives.

Secret validation: GitHub sends X-Hub-Signature-256 = sha256=<hmac>.
We compute HMAC(secret, body) and compare in constant time.
"""

import hashlib
import hmac
import json
import os
import subprocess
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler

WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET", "")
UPDATE_SCRIPT = "/opt/hamafx/scripts/docker-update.sh"
PORT = int(os.environ.get("WEBHOOK_PORT", "9000"))


def verify_signature(body: bytes, signature_header: str) -> bool:
    """Constant-time HMAC-SHA256 comparison."""
    if not WEBHOOK_SECRET:
        return True  # No secret configured — accept all (for testing)
    if not signature_header:
        return False
    # GitHub format: "sha256=<hex>"
    try:
        algo, sig_hex = signature_header.split("=", 1)
        if algo != "sha256":
            return False
    except ValueError:
        return False
    expected = hmac.new(
        WEBHOOK_SECRET.encode(), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, sig_hex)


class WebhookHandler(BaseHTTPRequestHandler):
    """Handles POST /hooks/update from GitHub."""

    def do_POST(self):
        if self.path != "/hooks/update":
            self.send_error(404, "Not Found")
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(content_length) if content_length > 0 else b""

        # Validate event type
        event = self.headers.get("X-GitHub-Event", "")
        if event != "push":
            # We only care about push events
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'{"status":"ignored","reason":"not a push event"}\n')
            return

        # Validate HMAC signature
        signature = self.headers.get("X-Hub-Signature-256", "")
        if not verify_signature(body, signature):
            self.send_error(403, "Invalid signature")
            return

        # Parse payload to check branch
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            self.send_error(400, "Invalid JSON")
            return

        ref = payload.get("ref", "")
        if ref != "refs/heads/main":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(
                b'{"status":"ignored","reason":"not main branch"}\n'
            )
            return

        # Trigger the update asynchronously
        print(
            f"[webhook] push to main detected — running {UPDATE_SCRIPT}",
            flush=True,
        )
        subprocess.Popen(
            ["/opt/hamafx/scripts/docker-update.sh"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        self.send_response(202)
        self.end_headers()
        self.wfile.write(b'{"status":"accepted"}\n')

    def log_message(self, format, *args):
        print(f"[webhook] {args[0]}", flush=True)


def main():
    print(f"[webhook] starting on port {PORT}", flush=True)
    server = HTTPServer(("0.0.0.0", PORT), WebhookHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
