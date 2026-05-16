"""
Structured logging configuration using structlog.
Produces JSON in production, colored console output in development.
"""

import logging
import sys
import structlog
from app.core.config import settings


def configure_logging() -> None:
    """Configure structlog for the service.

    Uses PrintLoggerFactory (no stdlib dependency) so processors must be
    compatible with structlog's native logger — stdlib.add_logger_name is
    excluded because it expects a stdlib Logger object.
    """

    shared_processors: list = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
    ]

    if settings.is_production:
        processors = shared_processors + [
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ]
    else:
        processors = shared_processors + [
            structlog.dev.ConsoleRenderer(colors=False),  # no ANSI in Cloud Run
        ]

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )

    # Also configure stdlib so uvicorn / httpx logs are captured at INFO
    logging.basicConfig(format="%(message)s", stream=sys.stdout, level=logging.INFO)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("google.auth").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
