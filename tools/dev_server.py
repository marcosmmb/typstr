#!/usr/bin/env python3
import functools
import http.server
import socketserver
import sys
from pathlib import Path


class ReusableTcpServer(socketserver.TCPServer):
    allow_reuse_address = True


def main() -> int:
    root = Path(__file__).resolve().parent.parent / "web"
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root))

    with ReusableTcpServer(("127.0.0.1", port), handler) as server:
        print(f"typstr serving http://127.0.0.1:{port}", flush=True)
        server.serve_forever()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
