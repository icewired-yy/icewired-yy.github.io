"""Serve the static prototype without request logs that can fill test pipes."""

from __future__ import annotations

import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class QuietRequestHandler(SimpleHTTPRequestHandler):
    """Serve files from the working directory without per-request console logs.

    This handler is intended only for local browser automation where the parent
    process captures server output without continuously draining it. It adds no
    member variables and otherwise preserves ``SimpleHTTPRequestHandler``
    behavior, MIME handling, and path validation.

    Example:
        ``ThreadingHTTPServer(("127.0.0.1", 4173), QuietRequestHandler)``
    """

    def log_message(self, format_string: str, *arguments: object) -> None:
        """Suppress one normal HTTP access-log message.

        Args:
            format_string: Standard ``printf``-style access-log format supplied
                by ``SimpleHTTPRequestHandler``. Empty strings are accepted and
                ignored.
            *arguments: Values for ``format_string``. Any values are accepted
                and ignored because this local server is intentionally quiet.

        Returns:
            ``None``. No log line is emitted.

        Raises:
            No exceptions intentionally.

        Side Effects:
            Overrides the inherited logging side effect by doing nothing.

        Example:
            ``handler.log_message("%s", "GET /index.html")``
        """
        # Keep the pipe empty; browser assertions capture resource failures.
        del format_string, arguments


def _parse_arguments() -> argparse.Namespace:
    """Parse the required local TCP port.

    Returns:
        Namespace with integer ``port`` in the inclusive range 1 through 65535.

    Raises:
        SystemExit: If ``--port`` is missing, non-numeric, or outside the valid
            TCP port range.

    Side Effects:
        Reads ``sys.argv`` and may print argparse usage on invalid input.

    Example:
        ``arguments = _parse_arguments()``
    """
    # Declare the single explicit input required by the test server.
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", required=True, type=int)
    arguments = parser.parse_args()

    # Reject invalid ports before binding a socket.
    if not 1 <= arguments.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    return arguments


def main() -> int:
    """Run a loopback-only threaded static file server until terminated.

    Returns:
        Process status ``0`` after an orderly shutdown. The surrounding
        ``with_server.py`` helper normally terminates the process externally.

    Raises:
        OSError: If the requested port cannot be bound.

    Side Effects:
        Opens a loopback TCP listener and serves files from the current working
        directory until interrupted.

    Example:
        ``raise SystemExit(main())``
    """
    # Bind only to loopback so this test server is never exposed externally.
    arguments = _parse_arguments()
    server_address = ("127.0.0.1", arguments.port)

    # Serve concurrent font and image requests until the parent terminates us.
    with ThreadingHTTPServer(server_address, QuietRequestHandler) as http_server:
        http_server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
