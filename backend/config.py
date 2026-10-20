"""
config.py
---------
Loads all configuration values for the AquaFleet backend.

Nothing is hard-coded here. Every MySQL setting is read from environment
variables, which are loaded from a local `.env` file using python-dotenv.

Copy `.env.example` to `.env` and fill in your own values before running.
"""

import os
from datetime import timedelta

from dotenv import load_dotenv

# Read the .env file (if present) and put its values into the environment.
load_dotenv()


class Config:
    """Simple container for the settings used by the application."""

    # ---- MySQL connection settings -------------------------------------
    # os.getenv(NAME, DEFAULT) returns DEFAULT when the variable is missing.
    DB_HOST = os.getenv("DB_HOST", "localhost")
    DB_PORT = int(os.getenv("DB_PORT", "3306"))
    DB_USER = os.getenv("DB_USER", "root")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "")  # never hard-code a real password
    DB_NAME = os.getenv("DB_NAME", "aquafleet_db")
    DB_CONNECT_TIMEOUT = int(os.getenv("DB_CONNECT_TIMEOUT", "10"))
    DB_SSL_CA = os.getenv("DB_SSL_CA", "").strip()
    DB_SSL_VERIFY_CERT = os.getenv("DB_SSL_VERIFY_CERT", "True").lower() == "true"
    DB_SSL_VERIFY_IDENTITY = (
        os.getenv("DB_SSL_VERIFY_IDENTITY", "True").lower() == "true"
    )

    # ---- Flask settings ------------------------------------------------
    FLASK_HOST = os.getenv("FLASK_HOST", "127.0.0.1")
    FLASK_PORT = int(os.getenv("PORT", os.getenv("FLASK_PORT", "5000")))
    # DEBUG is a string in the environment, so compare it to "true".
    DEBUG = os.getenv("FLASK_DEBUG", "True").lower() == "true"

    # ---- Session / authentication settings -----------------------------
    # SECRET_KEY signs the session cookie. Anyone holding it can forge a
    # login, so it is read from .env and never committed. The fallback is a
    # fixed development string on purpose: it keeps a fresh checkout running,
    # and is rejected outright below when DEBUG is off.
    SECRET_KEY = os.getenv("SECRET_KEY", "aquafleet-development-secret-change-me")

    # Origins allowed to make credentialed browser requests. Comma-separated
    # in .env. A credentialed CORS setup may never use "*", so this list stays
    # explicit. 127.0.0.1 and localhost are different origins to a browser,
    # so both spellings of the frontend host are included by default.
    CORS_ORIGINS = [
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS",
            "http://127.0.0.1:5500,http://localhost:5500"
        ).split(",")
        if origin.strip()
    ]

    # Cookie hardening. HTTPONLY keeps JavaScript - including anything
    # injected by an XSS - from reading the session cookie. SAMESITE "Lax"
    # blocks the cookie on cross-site POSTs, which removes the basic CSRF
    # case while still allowing normal navigation.
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"

    # SECURE=True tells the browser to send the cookie over HTTPS only. It
    # MUST be turned on for any HTTPS deployment; left False here because the
    # local coursework setup is plain HTTP on 127.0.0.1 and a secure cookie
    # would simply never be sent.
    SESSION_COOKIE_SECURE = (
        os.getenv("SESSION_COOKIE_SECURE", "False").lower() == "true"
    )
    PERMANENT_SESSION_LIFETIME = timedelta(
        minutes=int(os.getenv("SESSION_LIFETIME_MINUTES", "480"))
    )
    SESSION_REFRESH_EACH_REQUEST = False

    # Only the login endpoint is rate limited. The default in-memory backend is
    # appropriate for the single-process faculty deployment in render.yaml.
    # A shared limiter backend can be supplied later without code changes.
    LOGIN_RATE_LIMIT = os.getenv("LOGIN_RATE_LIMIT", "10 per minute")
    RATELIMIT_STORAGE_URI = os.getenv("RATELIMIT_STORAGE_URI", "memory://")
    TRUST_PROXY_HEADERS = (
        os.getenv("TRUST_PROXY_HEADERS", "False").lower() == "true"
    )

    @classmethod
    def check_secret_key(cls):
        """Return a warning string when the SECRET_KEY is unsafe, else None.

        The built-in fallback is fine for a local demo but must never sign
        real sessions, so app.py refuses to start with it outside DEBUG.
        """
        if cls.SECRET_KEY == "aquafleet-development-secret-change-me":
            return ("SECRET_KEY is still the built-in development value. "
                    "Set SECRET_KEY in backend/.env before deploying.")
        if len(cls.SECRET_KEY) < 32:
            return "SECRET_KEY is shorter than 32 characters."
        return None

    @classmethod
    def db_params(cls):
        """Return the MySQL settings as a dictionary.

        This dictionary is passed straight into mysql.connector.connect().
        """
        params = {
            "host": cls.DB_HOST,
            "port": cls.DB_PORT,
            "user": cls.DB_USER,
            "password": cls.DB_PASSWORD,
            "database": cls.DB_NAME,
            "connection_timeout": cls.DB_CONNECT_TIMEOUT,
        }
        if cls.DB_SSL_CA:
            params.update({
                "ssl_ca": cls.DB_SSL_CA,
                "ssl_verify_cert": cls.DB_SSL_VERIFY_CERT,
                "ssl_verify_identity": cls.DB_SSL_VERIFY_IDENTITY,
            })
        return params
