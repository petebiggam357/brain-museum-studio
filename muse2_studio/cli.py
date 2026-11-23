"""CLI & Native Desktop App entrypoint for Brain Museum Studio.

Launch priority (when not passed --browser or --no-browser):
1. Self-contained native window via pywebview (PyQt6-WebEngine on Linux, WKWebView on macOS, WebView2 on Windows)
2. Chromeless dedicated app window (--app=<url>) via installed Chromium/Chrome/Brave (with clean host env)
3. Standard browser fallback (with clean host env)
Also shows a graphical alert dialog on fatal startup errors when launched as a desktop app.
"""

from __future__ import annotations

import argparse
import os
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path
from typing import Dict

import uvicorn

from muse2_studio.server import app


def _clean_env() -> Dict[str, str]:
    """Return a clean environment without PyInstaller's LD_LIBRARY_PATH so host binaries never hit GLIBC mismatches."""
    env = dict(os.environ)
    if getattr(sys, "frozen", False):
        orig = env.get("LD_LIBRARY_PATH_ORIG")
        if orig is not None:
            env["LD_LIBRARY_PATH"] = orig
        else:
            env.pop("LD_LIBRARY_PATH", None)
    return env


def _show_graphical_error(title: str, message: str) -> None:
    """Display a graphical error alert on Linux, macOS, or Windows (best-effort)."""
    env = _clean_env()
    try:
        if sys.platform.startswith("linux"):
            if shutil.which("zenity"):
                subprocess.Popen(
                    ["zenity", "--error", "--title", title, "--text", message, "--width=420"],
                    env=env,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                return
            if shutil.which("kdialog"):
                subprocess.Popen(
                    ["kdialog", "--error", message, "--title", title],
                    env=env,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                return
        elif sys.platform == "darwin" and shutil.which("osascript"):
            safe = message.replace('"', '\\"')
            subprocess.Popen(
                ["osascript", "-e", f'display dialog "{safe}" with title "{title}" buttons {{"OK"}} with icon stop'],
                env=env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            return
        import tkinter as tk
        from tkinter import messagebox

        root = tk.Tk()
        root.withdraw()
        messagebox.showerror(title, message)
        root.destroy()
    except Exception:
        print(f"[{title}] {message}", file=sys.stderr)


def _find_free_port(preferred: int) -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        if s.connect_ex(("127.0.0.1", preferred)) != 0:
            return preferred
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _wait_for_server(url: str, timeout: float = 8.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{url}/api/status", timeout=0.25) as r:
                if r.status == 200:
                    return True
        except Exception:
            time.sleep(0.02)
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


def _launch_chromeless_app_window(url: str) -> bool:
    """Try launching a dedicated frameless/tabless app window using a host Chromium-family browser."""
    env = _clean_env()
    for browser_bin in ("google-chrome", "chromium", "chromium-browser", "brave-browser", "microsoft-edge"):
        exe = shutil.which(browser_bin)
        if exe:
            try:
                subprocess.Popen(
                    [exe, f"--app={url}", "--window-size=1420,900"],
                    env=env,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                return True
            except Exception:
                continue
    return False


def _open_browser_clean(url: str, delay: float = 1.0) -> None:
    time.sleep(delay)
    if _launch_chromeless_app_window(url):
        return
    env = _clean_env()
    if sys.platform.startswith("linux") and shutil.which("xdg-open"):
        subprocess.Popen(["xdg-open", url], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return
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

    port = _find_free_port(args.port)
    url = f"http://{args.host}:{port}"

    # 1. Try launching as a self-contained Native Desktop App window via pywebview
    use_native_window = (not args.browser) and (not args.no_browser)
    if use_native_window:
        try:
            if sys.platform.startswith("linux"):
                os.environ.setdefault("QT_API", "pyqt6")
                os.environ.setdefault("PYWEBVIEW_GUI", "qt")
            import webview  # type: ignore

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
            pass
        except Exception as exc:
            print(f"Native Qt/GTK window unavailable ({exc}); launching dedicated app window fallback.")

    # 2. Server + dedicated chromeless app window (or browser fallback)
    print(f"🧠 Brain Museum Studio running at {url}")
    if (args.browser or getattr(sys, "frozen", False)) and not args.no_browser:
        threading.Thread(target=_open_browser_clean, args=(url,), daemon=True).start()

    try:
        uvicorn.run(app, host=args.host, port=port, log_level="info")
    except Exception as exc:
        _show_graphical_error(
            "Brain Museum Studio — Startup Error",
            f"Could not start Brain Museum Studio on {url}.\n\nDetails: {exc}",
        )
        raise


if __name__ == "__main__":
    main()
