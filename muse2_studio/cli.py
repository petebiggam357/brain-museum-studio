"""CLI entrypoint for Brain Museum Studio (source & PyInstaller standalone builds)."""

from __future__ import annotations

import argparse
import sys
import threading
import time
import webbrowser

import uvicorn

from muse2_studio.server import app


def _open_browser_later(url: str, delay: float = 1.2) -> None:
    time.sleep(delay)
    try:
        webbrowser.open(url)
    except Exception:
        pass


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="brain-museum-studio",
        description="Brain Museum Studio — Real-time Linux/Cross-Platform Muse 2 EEG, BCI, OSC & ML Studio",
    )
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8765, help="Port to bind (default: 8765)")
    parser.add_argument(
        "--open-browser",
        action="store_true",
        default=getattr(sys, "frozen", False),
        help="Automatically open the web UI in the default browser",
    )
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="Do not open the web browser automatically",
    )
    args = parser.parse_args()

    url = f"http://{args.host}:{args.port}"
    print(f"🧠 Brain Museum Studio running at {url}")

    if args.open_browser and not args.no_browser:
        threading.Thread(target=_open_browser_later, args=(url,), daemon=True).start()

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
