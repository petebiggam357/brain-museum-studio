"""CLI entrypoint for Muse 2 Studio."""

from __future__ import annotations

import argparse
import uvicorn


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="brain-museum-studio",
        description="Brain Museum Studio — Real-time Linux/Cross-Platform Muse 2 EEG, BCI, OSC & ML Studio",
    )
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8765, help="Port to bind (default: 8765)")
    args = parser.parse_args()

    print(f"🧠 Brain Museum Studio running at http://{args.host}:{args.port}")
    uvicorn.run("muse2_studio.server:app", host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
