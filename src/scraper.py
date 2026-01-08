"""
Main scraper for Franchise Disclosure Documents
"""

import os
import json
from typing import List, Optional
from pathlib import Path
import pandas as pd
from datetime import datetime

from models import FranchiseData
from pdf_parser import FDDParser


class FranchiseScraper:
    """Main scraper class for processing FDD documents"""

    def __init__(self, data_dir: str = "data", output_dir: str = "output"):
        self.data_dir = Path(data_dir)
        self.output_dir = Path(output_dir)

        # Create directories if they don't exist
        self.data_dir.mkdir(exist_ok=True)
        self.output_dir.mkdir(exist_ok=True)

        self.franchises: List[FranchiseData] = []

    def process_pdf(self, pdf_path: str) -> Optional[FranchiseData]:
        """Process a single PDF file"""
        try:
            print(f"Processing: {pdf_path}")
            parser = FDDParser(pdf_path)
            franchise_data = parser.parse()

            # Set the PDF path
            franchise_data.info.pdf_path = pdf_path

            self.franchises.append(franchise_data)
            print(f"✓ Extracted data for: {franchise_data.info.franchise_name}")

            return franchise_data

        except Exception as e:
            print(f"✗ Error processing {pdf_path}: {e}")
            return None

    def process_directory(self, directory: Optional[str] = None) -> int:
        """Process all PDF files in a directory"""
        dir_path = Path(directory) if directory else self.data_dir

        if not dir_path.exists():
            print(f"Directory not found: {dir_path}")
            return 0

        pdf_files = list(dir_path.glob("*.pdf"))

        if not pdf_files:
            print(f"No PDF files found in {dir_path}")
            return 0

        print(f"Found {len(pdf_files)} PDF files to process")
        print("-" * 60)

        successful = 0
        for pdf_file in pdf_files:
            if self.process_pdf(str(pdf_file)):
                successful += 1

        print("-" * 60)
        print(f"Successfully processed {successful}/{len(pdf_files)} files")

        return successful

    def export_to_csv(self, filename: Optional[str] = None) -> str:
        """Export collected data to CSV"""
        if not self.franchises:
            print("No data to export")
            return ""

        if not filename:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"franchise_data_{timestamp}.csv"

        output_path = self.output_dir / filename

        # Convert to list of dictionaries
        data_dicts = [f.to_dict() for f in self.franchises]

        # Create DataFrame and export
        df = pd.DataFrame(data_dicts)
        df.to_csv(output_path, index=False)

        print(f"✓ Exported data to: {output_path}")
        return str(output_path)

    def export_to_json(self, filename: Optional[str] = None) -> str:
        """Export collected data to JSON"""
        if not self.franchises:
            print("No data to export")
            return ""

        if not filename:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"franchise_data_{timestamp}.json"

        output_path = self.output_dir / filename

        # Convert to list of dictionaries
        data_dicts = [f.to_dict() for f in self.franchises]

        # Export to JSON
        with open(output_path, 'w') as f:
            json.dump(data_dicts, f, indent=2, default=str)

        print(f"✓ Exported data to: {output_path}")
        return str(output_path)

    def export_to_excel(self, filename: Optional[str] = None) -> str:
        """Export collected data to Excel"""
        if not self.franchises:
            print("No data to export")
            return ""

        if not filename:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"franchise_data_{timestamp}.xlsx"

        output_path = self.output_dir / filename

        # Convert to list of dictionaries
        data_dicts = [f.to_dict() for f in self.franchises]

        # Create DataFrame and export
        df = pd.DataFrame(data_dicts)
        df.to_excel(output_path, index=False, sheet_name='Franchise Data')

        print(f"✓ Exported data to: {output_path}")
        return str(output_path)

    def print_summary(self):
        """Print summary of collected data"""
        if not self.franchises:
            print("No data collected yet")
            return

        print("\n" + "=" * 80)
        print(f"FRANCHISE DATA SUMMARY ({len(self.franchises)} franchises)")
        print("=" * 80)

        for i, franchise in enumerate(self.franchises, 1):
            print(f"\n{i}. {franchise.info.franchise_name}")
            print(f"   Franchisor: {franchise.info.franchisor_name}")

            if franchise.financials.initial_franchise_fee:
                print(f"   Initial Fee: ${franchise.financials.initial_franchise_fee:,.0f}")

            if franchise.financials.initial_investment_low and franchise.financials.initial_investment_high:
                print(f"   Investment Range: ${franchise.financials.initial_investment_low:,.0f} - "
                      f"${franchise.financials.initial_investment_high:,.0f}")

            if franchise.financials.royalty_fee_percentage:
                print(f"   Royalty Fee: {franchise.financials.royalty_fee_percentage}%")

            if franchise.info.total_franchises:
                print(f"   Total Franchises: {franchise.info.total_franchises}")

            if franchise.performance.has_item_19:
                print(f"   Has Item 19 Data: Yes")
                if franchise.performance.avg_gross_sales:
                    print(f"   Avg Gross Sales: ${franchise.performance.avg_gross_sales:,.0f}")

        print("\n" + "=" * 80)

    def clear_data(self):
        """Clear all collected franchise data"""
        self.franchises = []
        print("Data cleared")
