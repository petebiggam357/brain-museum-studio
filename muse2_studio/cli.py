"""CLI & Native Desktop App entrypoint for Brain Museum Studio.

- In standalone/desktop mode (when pywebview is available and --browser is not passed),
  launches Uvicorn in a background thread and opens a dedicated native OS window
  (no browser tab required!) with the Brain Museum Studio icon.
- In CLI/browser mode (--browser or headless environments), serves on http://127.0.0.1:8765.
"""

from __future__ import annotations

import argparse
import socket
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

import uvicorn

from muse2_studio.server import app


def _find_free_port(preferred: int) -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        if s.connect_ex(("127.0.0.1", preferred)) != 0:
            return preferred
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _wait_for_server(url: str, timeout: float = 10.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{url}/api/status", timeout=0.5) as r:
                if r.status == 200:
                    return True
        except Exception:
            time.sleep(0.1)
    return False


def _icon_path() -> str | None:
    candidates = []
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        candidates.append(Path(sys._MEIPASS) / "packaging" / "brain-museum-studio.png")
    candidates.append(Path(__file__).resolve().parent.parent / "packaging" / "brain-museum-studio.png")
    for p in candidates:
        if p.is_file():
            return str(p)
    return None


def _open_browser_later(url: str, delay: float = 1.2) -> None:
    time.sleep(delay)
    try:
        webbrowser.open(url)
    except Exception:
        pass


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="brain-museum-studio",
        description="Brain Museum Studio — Native Desktop & Web Muse 2 EEG, Neuro Lab, Games, Meditation & ML Studio",
    )
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8765, help="Port to bind (default: 8765)")
    parser.add_argument(
        "--browser",
        action="store_true",
        help="Run in browser/server mode instead of opening a native desktop app window",
    )
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="Do not open a browser tab or native desktop window (headless server mode)",
    )
    args = parser.parse_args()

    # Try launching as a self-contained Native Desktop App window via pywebview
    use_native_window = (not args.browser) and (not args.no_browser)
    if use_native_window:
        try:
            import os
            if sys.platform.startswith("linux"):
                os.environ.setdefault("QT_API", "pyqt6")
                os.environ.setdefault("PYWEBVIEW_GUI", "qt")
            import webview  # type: ignore

            port = _find_free_port(args.port)
            url = f"http://{args.host}:{port}"
            config = uvicorn.Config(app, host=args.host, port=port, log_level="warning")
            server = uvicorn.Server(config)
            thread = threading.Thread(target=server.run, daemon=True)
            thread.start()

            _wait_for_server(url)
            webview.create_window(
                "Brain Museum Studio",
                url,
                width=1420,
                height=900,
                min_size=(960, 640),
                background_color="#08090c",
            )
            icon = _icon_path()
            start_kwargs = {"icon": icon} if icon else {}
            try:
                webview.start(**start_kwargs)
            except TypeError:
                webview.start()
            server.should_exit = True
            return
        except ImportError:
            # pywebview not installed in dev venv -> fall back cleanly to web server mode
            pass
        except Exception as exc:
            print(f"Native window unavailable ({exc}); falling back to browser server mode.")

    port = _find_free_port(args.port)
    url = f"http://{args.host}:{port}"
    print(f"🧠 Brain Museum Studio running at {url}")
    if (args.browser or getattr(sys, "frozen", False)) and not args.no_browser:
        threading.Thread(target=_open_browser_later, args=(url,), daemon=True).start()

    uvicorn.run(app, host=args.host, port=port, log_level="info")


if __name__ == "__main__":
    main()
