"""
Franchise Data Scraper Package
Extract structured data from Franchise Disclosure Documents
"""

__version__ = "1.0.0"
__author__ = "Franchise Data Scraper"

from .models import FranchiseData, FranchiseInfo, FranchiseFinancials, FranchisePerformance
from .pdf_parser import FDDParser
from .scraper import FranchiseScraper

__all__ = [
    'FranchiseData',
    'FranchiseInfo',
    'FranchiseFinancials',
    'FranchisePerformance',
    'FDDParser',
    'FranchiseScraper',
]
