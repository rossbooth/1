"""
Configuration settings for Franchise Data Scraper
"""

import os
from pathlib import Path

# Base directory
BASE_DIR = Path(__file__).parent

# Data directories
DATA_DIR = BASE_DIR / "data"
OUTPUT_DIR = BASE_DIR / "output"

# Parsing settings
MAX_TEXT_LENGTH = 1000000  # Maximum text length to parse (1MB)
PDF_TIMEOUT = 300  # Timeout for PDF processing in seconds

# Export settings
DEFAULT_EXPORT_FORMAT = "csv"
TIMESTAMP_FORMAT = "%Y%m%d_%H%M%S"

# Extraction patterns - customize these for better accuracy
PATTERNS = {
    "franchise_name": [
        r'FRANCHISE\s+DISCLOSURE\s+DOCUMENT\s+(?:FOR\s+)?([A-Z][A-Z\s&]+)',
        r'DISCLOSURE\s+DOCUMENT\s+(?:FOR\s+)?([A-Z][A-Z\s&]+)',
        r'^([A-Z][A-Z\s&]+)\s+FRANCHISE',
    ],
    "money": r'\$\s*([\d,]+(?:\.\d{2})?)',
    "percentage": r'([\d.]+)\s*%',
    "phone": r'(?:Phone|Tel|Telephone):\s*(\(?[\d]{3}\)?[-.\s]?[\d]{3}[-.\s]?[\d]{4})',
    "website": r'(?:www\.|https?://)([\w\-\.]+\.(?:com|net|org|biz))',
}

# Logging
LOGGING_ENABLED = True
LOG_LEVEL = "INFO"

# Performance
ENABLE_CACHING = False  # Set to True to cache parsed PDFs
CACHE_DIR = BASE_DIR / ".cache"
