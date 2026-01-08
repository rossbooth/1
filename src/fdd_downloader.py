"""
FDD Downloader - Download FDDs from various public sources
"""

import requests
import time
from typing import Optional, List, Dict
from pathlib import Path
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.chrome.service import Service


class FDDDownloader:
    """Download FDD documents from public sources"""

    def __init__(self, download_dir: str = "data"):
        self.download_dir = Path(download_dir)
        self.download_dir.mkdir(exist_ok=True)
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })

    def search_franchimp(self, franchise_name: str) -> List[Dict]:
        """Search FranChimp for franchise FDD"""
        results = []

        try:
            # FranChimp search URL
            search_url = f"https://www.franchimp.com/?page=search&q={franchise_name.replace(' ', '+')}"

            print(f"Searching FranChimp for: {franchise_name}")
            print(f"URL: {search_url}")

            response = self.session.get(search_url, timeout=10)

            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')

                # Note: This is a placeholder - actual scraping would need to
                # inspect the FranChimp page structure
                results.append({
                    'source': 'FranChimp',
                    'franchise_name': franchise_name,
                    'url': search_url,
                    'note': 'FranChimp requires subscription for downloads'
                })

        except Exception as e:
            print(f"Error searching FranChimp: {e}")

        return results

    def search_fdd_exchange(self, franchise_name: str) -> List[Dict]:
        """Search FDD Exchange"""
        results = []

        try:
            # FDD Exchange search
            base_url = "https://fddexchange.com/"
            search_url = f"{base_url}?s={franchise_name.replace(' ', '+')}"

            print(f"Searching FDD Exchange for: {franchise_name}")
            print(f"URL: {search_url}")

            response = self.session.get(search_url, timeout=10)

            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')

                results.append({
                    'source': 'FDD Exchange',
                    'franchise_name': franchise_name,
                    'url': search_url,
                    'note': 'Check website for available documents'
                })

        except Exception as e:
            print(f"Error searching FDD Exchange: {e}")

        return results

    def get_wisconsin_database_url(self, franchise_name: str) -> Dict:
        """Get Wisconsin state database URL"""
        return {
            'source': 'Wisconsin State Database',
            'franchise_name': franchise_name,
            'url': 'https://apps.wi.gov/dfi-sb/home',
            'note': 'Search for franchise name on Wisconsin DFI database'
        }

    def get_california_database_url(self, franchise_name: str) -> Dict:
        """Get California state database URL"""
        return {
            'source': 'California DBO',
            'franchise_name': franchise_name,
            'url': 'https://docqnet.dbo.ca.gov/search.asp',
            'note': 'Search California Department of Business Oversight database'
        }

    def get_minnesota_database_url(self, franchise_name: str) -> Dict:
        """Get Minnesota state database URL"""
        return {
            'source': 'Minnesota Commerce',
            'franchise_name': franchise_name,
            'url': 'https://mn.gov/commerce/consumers/your-business/licensing-and-registration/franchise/',
            'note': 'Search Minnesota Commerce Department database'
        }

    def search_all_sources(self, franchise_name: str) -> List[Dict]:
        """Search all available FDD sources"""
        print(f"\n{'='*80}")
        print(f"Searching for FDD: {franchise_name}")
        print(f"{'='*80}\n")

        all_results = []

        # Search web sources
        all_results.extend(self.search_franchimp(franchise_name))
        all_results.extend(self.search_fdd_exchange(franchise_name))

        # Add state database links
        all_results.append(self.get_wisconsin_database_url(franchise_name))
        all_results.append(self.get_california_database_url(franchise_name))
        all_results.append(self.get_minnesota_database_url(franchise_name))

        print(f"\nFound {len(all_results)} sources")

        return all_results

    def download_pdf(self, url: str, filename: Optional[str] = None) -> Optional[str]:
        """Download a PDF from a direct URL"""
        try:
            print(f"Downloading from: {url}")

            response = self.session.get(url, timeout=30, stream=True)
            response.raise_for_status()

            # Determine filename
            if not filename:
                # Try to get from Content-Disposition header
                content_disp = response.headers.get('Content-Disposition', '')
                if 'filename=' in content_disp:
                    filename = content_disp.split('filename=')[1].strip('"')
                else:
                    filename = url.split('/')[-1]
                    if not filename.endswith('.pdf'):
                        filename += '.pdf'

            filepath = self.download_dir / filename

            # Download file
            with open(filepath, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)

            print(f"✓ Downloaded: {filepath}")
            return str(filepath)

        except Exception as e:
            print(f"✗ Error downloading PDF: {e}")
            return None

    def download_with_selenium(self, url: str, wait_time: int = 10) -> Optional[str]:
        """Download using Selenium for JavaScript-heavy sites"""
        try:
            chrome_options = Options()
            chrome_options.add_argument('--headless')
            chrome_options.add_argument('--no-sandbox')
            chrome_options.add_argument('--disable-dev-shm-usage')

            # Set download directory
            prefs = {
                'download.default_directory': str(self.download_dir.absolute()),
                'download.prompt_for_download': False,
                'plugins.always_open_pdf_externally': True
            }
            chrome_options.add_experimental_option('prefs', prefs)

            service = Service(ChromeDriverManager().install())
            driver = webdriver.Chrome(service=service, options=chrome_options)

            driver.get(url)
            time.sleep(wait_time)

            driver.quit()

            print(f"Selenium download initiated for: {url}")
            return str(self.download_dir)

        except Exception as e:
            print(f"Error with Selenium download: {e}")
            return None

    def print_sources(self, results: List[Dict]):
        """Print formatted list of sources"""
        print(f"\n{'='*80}")
        print("FDD SOURCES FOUND")
        print(f"{'='*80}\n")

        for i, result in enumerate(results, 1):
            print(f"{i}. {result['source']}")
            print(f"   URL: {result['url']}")
            if 'note' in result:
                print(f"   Note: {result['note']}")
            print()


# Example usage
if __name__ == '__main__':
    downloader = FDDDownloader()

    # Search for Jersey Mike's
    results = downloader.search_all_sources("Jersey Mike's")
    downloader.print_sources(results)

    # If you have a direct PDF URL, you can download it:
    # downloader.download_pdf('https://example.com/fdd.pdf', 'jersey_mikes_2024.pdf')
