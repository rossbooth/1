"""
PDF Parser for Franchise Disclosure Documents
"""

import re
from typing import Optional, Dict, List
import pdfplumber
from datetime import datetime
from models import FranchiseInfo, FranchiseFinancials, FranchisePerformance, FranchiseData


class FDDParser:
    """Parser for Franchise Disclosure Documents"""

    def __init__(self, pdf_path: str):
        self.pdf_path = pdf_path
        self.text = ""
        self.pages_text = []

    def extract_text(self) -> str:
        """Extract all text from PDF"""
        try:
            with pdfplumber.open(self.pdf_path) as pdf:
                self.pages_text = []
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        self.pages_text.append(page_text)
                self.text = "\n".join(self.pages_text)
            return self.text
        except Exception as e:
            print(f"Error extracting text from PDF: {e}")
            return ""

    def parse(self) -> FranchiseData:
        """Parse FDD and extract all relevant data"""
        if not self.text:
            self.extract_text()

        info = self._extract_basic_info()
        financials = self._extract_financials()
        performance = self._extract_performance()

        return FranchiseData(
            info=info,
            financials=financials,
            performance=performance,
            raw_text=self.text[:1000]  # Store first 1000 chars as sample
        )

    def _extract_basic_info(self) -> FranchiseInfo:
        """Extract basic franchise information"""
        # Look for franchise name in first few pages
        franchise_name = self._find_franchise_name()
        franchisor_name = self._find_franchisor_name()

        # Extract contact information
        address_info = self._extract_address()

        # Extract franchise counts from Item 20
        counts = self._extract_franchise_counts()

        # Extract dates
        dates = self._extract_dates()

        return FranchiseInfo(
            franchise_name=franchise_name or "Unknown",
            franchisor_name=franchisor_name or "Unknown",
            address=address_info.get('address'),
            city=address_info.get('city'),
            state=address_info.get('state'),
            zip_code=address_info.get('zip'),
            phone=address_info.get('phone'),
            website=address_info.get('website'),
            total_franchises=counts.get('total'),
            company_owned=counts.get('company_owned'),
            franchised_outlets=counts.get('franchised'),
            year_founded=dates.get('founded'),
            year_franchising_began=dates.get('franchising_began'),
            date_filed=dates.get('filed'),
            effective_date=dates.get('effective'),
            pdf_path=self.pdf_path
        )

    def _find_franchise_name(self) -> Optional[str]:
        """Extract franchise name from document"""
        # Common patterns in FDDs
        patterns = [
            r'FRANCHISE\s+DISCLOSURE\s+DOCUMENT\s+(?:FOR\s+)?([A-Z][A-Z\s&]+)',
            r'DISCLOSURE\s+DOCUMENT\s+(?:FOR\s+)?([A-Z][A-Z\s&]+)',
            r'^([A-Z][A-Z\s&]+)\s+FRANCHISE',
        ]

        first_pages = "\n".join(self.pages_text[:5]) if self.pages_text else self.text[:2000]

        for pattern in patterns:
            match = re.search(pattern, first_pages, re.MULTILINE)
            if match:
                name = match.group(1).strip()
                # Clean up
                name = re.sub(r'\s+', ' ', name)
                if len(name) > 5 and len(name) < 100:
                    return name

        return None

    def _find_franchisor_name(self) -> Optional[str]:
        """Extract franchisor company name"""
        patterns = [
            r'To\s+the\s+Franchisee\s+by:\s*([A-Z][A-Za-z\s,\.&]+(?:LLC|Inc\.|Corporation|Corp\.))',
            r'Franchisor:\s*([A-Z][A-Za-z\s,\.&]+(?:LLC|Inc\.|Corporation|Corp\.))',
            r'issued\s+by\s+([A-Z][A-Za-z\s,\.&]+(?:LLC|Inc\.|Corporation|Corp\.))',
        ]

        first_pages = "\n".join(self.pages_text[:10]) if self.pages_text else self.text[:3000]

        for pattern in patterns:
            match = re.search(pattern, first_pages)
            if match:
                return match.group(1).strip()

        return None

    def _extract_address(self) -> Dict[str, Optional[str]]:
        """Extract contact information"""
        result = {
            'address': None,
            'city': None,
            'state': None,
            'zip': None,
            'phone': None,
            'website': None
        }

        # Look in first few pages for address
        first_pages = "\n".join(self.pages_text[:5]) if self.pages_text else self.text[:2000]

        # Phone pattern
        phone_match = re.search(r'(?:Phone|Tel|Telephone):\s*(\(?[\d]{3}\)?[-.\s]?[\d]{3}[-.\s]?[\d]{4})', first_pages, re.IGNORECASE)
        if phone_match:
            result['phone'] = phone_match.group(1)

        # Website pattern
        website_match = re.search(r'(?:www\.|https?://)([\w\-\.]+\.(?:com|net|org|biz))', first_pages, re.IGNORECASE)
        if website_match:
            result['website'] = website_match.group(0)

        # Address pattern (simplified)
        address_match = re.search(r'(\d+\s+[A-Za-z\s]+(?:Street|St\.|Avenue|Ave\.|Road|Rd\.|Boulevard|Blvd\.))', first_pages, re.IGNORECASE)
        if address_match:
            result['address'] = address_match.group(1).strip()

        return result

    def _extract_financials(self) -> FranchiseFinancials:
        """Extract financial data from Item 7"""
        financials = FranchiseFinancials()

        # Find Item 7 section
        item_7_match = re.search(r'ITEM\s+7[:\s]+ESTIMATED?\s+INITIAL\s+INVESTMENT(.*?)(?=ITEM\s+8|$)',
                                 self.text, re.IGNORECASE | re.DOTALL)

        if item_7_match:
            item_7_text = item_7_match.group(1)

            # Extract initial franchise fee
            fee_patterns = [
                r'Initial\s+Franchise\s+Fee.*?\$\s*([\d,]+)',
                r'Franchise\s+Fee.*?\$\s*([\d,]+)',
            ]

            for pattern in fee_patterns:
                match = re.search(pattern, item_7_text, re.IGNORECASE)
                if match:
                    try:
                        financials.initial_franchise_fee = float(match.group(1).replace(',', ''))
                        break
                    except:
                        pass

            # Extract investment range
            range_pattern = r'\$\s*([\d,]+)\s*(?:to|-)\s*\$\s*([\d,]+)'
            matches = re.findall(range_pattern, item_7_text)
            if matches:
                try:
                    # Usually the total investment is the last or largest range
                    amounts = [(float(m[0].replace(',', '')), float(m[1].replace(',', ''))) for m in matches]
                    max_range = max(amounts, key=lambda x: x[1])
                    financials.initial_investment_low = max_range[0]
                    financials.initial_investment_high = max_range[1]
                except:
                    pass

        # Find royalty fees (often in Item 6)
        royalty_match = re.search(r'(?:Royalty|Continuing\s+Fees?).*?([\d.]+)\s*%', self.text, re.IGNORECASE)
        if royalty_match:
            try:
                financials.royalty_fee_percentage = float(royalty_match.group(1))
            except:
                pass

        # Find advertising fees
        ad_match = re.search(r'(?:Advertising|Marketing)\s+Fee.*?([\d.]+)\s*%', self.text, re.IGNORECASE)
        if ad_match:
            try:
                financials.advertising_fee_percentage = float(ad_match.group(1))
            except:
                pass

        return financials

    def _extract_performance(self) -> FranchisePerformance:
        """Extract financial performance data from Item 19"""
        performance = FranchisePerformance()

        # Find Item 19 section
        item_19_match = re.search(r'ITEM\s+19[:\s]+FINANCIAL\s+PERFORMANCE\s+REPRESENTATIONS?(.*?)(?=ITEM\s+20|$)',
                                  self.text, re.IGNORECASE | re.DOTALL)

        if item_19_match:
            item_19_text = item_19_match.group(1)

            # Check if they provide performance data
            no_data_patterns = [
                r'does\s+not\s+(?:make|provide)',
                r'we\s+do\s+not\s+(?:make|provide)',
                r'no\s+financial\s+performance\s+representations?',
            ]

            has_data = True
            for pattern in no_data_patterns:
                if re.search(pattern, item_19_text[:500], re.IGNORECASE):
                    has_data = False
                    break

            performance.has_item_19 = has_data

            if has_data:
                # Extract average sales
                avg_sales_patterns = [
                    r'(?:Average|Avg\.?)\s+(?:Gross\s+)?(?:Annual\s+)?(?:Sales|Revenue).*?\$\s*([\d,]+)',
                    r'Mean\s+(?:Gross\s+)?Sales.*?\$\s*([\d,]+)',
                ]

                for pattern in avg_sales_patterns:
                    match = re.search(pattern, item_19_text, re.IGNORECASE)
                    if match:
                        try:
                            performance.avg_gross_sales = float(match.group(1).replace(',', ''))
                            break
                        except:
                            pass

                # Extract median sales
                median_patterns = [
                    r'Median\s+(?:Gross\s+)?(?:Annual\s+)?(?:Sales|Revenue).*?\$\s*([\d,]+)',
                ]

                for pattern in median_patterns:
                    match = re.search(pattern, item_19_text, re.IGNORECASE)
                    if match:
                        try:
                            performance.median_gross_sales = float(match.group(1).replace(',', ''))
                            break
                        except:
                            pass

        return performance

    def _extract_franchise_counts(self) -> Dict[str, Optional[int]]:
        """Extract franchise unit counts from Item 20"""
        result = {
            'total': None,
            'company_owned': None,
            'franchised': None
        }

        # Find Item 20 section
        item_20_match = re.search(r'ITEM\s+20[:\s]+OUTLETS\s+AND\s+FRANCHISEE\s+INFORMATION(.*?)(?=ITEM\s+21|$)',
                                  self.text, re.IGNORECASE | re.DOTALL)

        if item_20_match:
            item_20_text = item_20_match.group(1)[:3000]  # First 3000 chars should have the table

            # Look for numbers in tables
            numbers = re.findall(r'\b(\d{1,5})\b', item_20_text)
            if numbers:
                try:
                    # Often the totals are the largest numbers in Item 20
                    int_numbers = [int(n) for n in numbers if int(n) < 100000]
                    if int_numbers:
                        result['total'] = max(int_numbers)
                except:
                    pass

        return result

    def _extract_dates(self) -> Dict[str, Optional[datetime]]:
        """Extract important dates"""
        result = {
            'filed': None,
            'effective': None,
            'founded': None,
            'franchising_began': None
        }

        first_pages = "\n".join(self.pages_text[:5]) if self.pages_text else self.text[:2000]

        # Date patterns
        date_patterns = [
            r'(?:Effective\s+Date|Date\s+of\s+Issuance):\s*([A-Z][a-z]+\s+\d{1,2},\s*\d{4})',
            r'(?:Filed|Registration\s+Date):\s*([A-Z][a-z]+\s+\d{1,2},\s*\d{4})',
        ]

        for pattern in date_patterns:
            match = re.search(pattern, first_pages, re.IGNORECASE)
            if match:
                try:
                    date_str = match.group(1)
                    result['effective'] = datetime.strptime(date_str, '%B %d, %Y')
                    break
                except:
                    pass

        # Year founded
        founded_match = re.search(r'(?:founded|established|formed)\s+in\s+(\d{4})', self.text, re.IGNORECASE)
        if founded_match:
            try:
                result['founded'] = int(founded_match.group(1))
            except:
                pass

        return result
