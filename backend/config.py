"""
config.py
---------
Loads all configuration values for the AquaFleet backend.

Nothing is hard-coded here. Every MySQL setting is read from environment
variables, which are loaded from a local `.env` file using python-dotenv.

Copy `.env.example` to `.env` and fill in your own values before running.
"""

import os

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
    DB_NAME = os.getenv("DB_NAME", "aquafleet")

    # ---- Flask settings ------------------------------------------------
    FLASK_HOST = os.getenv("FLASK_HOST", "127.0.0.1")
    FLASK_PORT = int(os.getenv("FLASK_PORT", "5000"))
    # DEBUG is a string in the environment, so compare it to "true".
    DEBUG = os.getenv("FLASK_DEBUG", "True").lower() == "true"

    @classmethod
    def db_params(cls):
        """Return the MySQL settings as a dictionary.

        This dictionary is passed straight into mysql.connector.connect().
        """
        return {
            "host": cls.DB_HOST,
            "port": cls.DB_PORT,
            "user": cls.DB_USER,
            "password": cls.DB_PASSWORD,
            "database": cls.DB_NAME,
        }
