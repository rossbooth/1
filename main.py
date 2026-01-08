#!/usr/bin/env python3
"""
Franchise Data Scraper - Main CLI Interface
Extracts data from Franchise Disclosure Documents (FDDs)
"""

import argparse
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / 'src'))

from scraper import FranchiseScraper


def main():
    parser = argparse.ArgumentParser(
        description='Scrape franchise data from FDD (Franchise Disclosure Document) PDFs',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Process all PDFs in the data directory
  python main.py --process

  # Process a specific PDF file
  python main.py --file path/to/fdd.pdf

  # Process PDFs from a specific directory
  python main.py --directory path/to/pdfs

  # Export to different formats
  python main.py --process --export csv
  python main.py --process --export json
  python main.py --process --export excel
  python main.py --process --export all

  # Process and export in one command
  python main.py --directory data --export csv --output franchise_data.csv
        """
    )

    parser.add_argument(
        '--file', '-f',
        type=str,
        help='Process a single PDF file'
    )

    parser.add_argument(
        '--directory', '-d',
        type=str,
        help='Process all PDF files in a directory (default: data/)'
    )

    parser.add_argument(
        '--process', '-p',
        action='store_true',
        help='Process all PDFs in the default data directory'
    )

    parser.add_argument(
        '--export', '-e',
        type=str,
        choices=['csv', 'json', 'excel', 'all'],
        help='Export format (csv, json, excel, or all)'
    )

    parser.add_argument(
        '--output', '-o',
        type=str,
        help='Output filename (optional, will auto-generate if not provided)'
    )

    parser.add_argument(
        '--data-dir',
        type=str,
        default='data',
        help='Directory containing PDF files (default: data/)'
    )

    parser.add_argument(
        '--output-dir',
        type=str,
        default='output',
        help='Directory for output files (default: output/)'
    )

    parser.add_argument(
        '--summary', '-s',
        action='store_true',
        help='Print summary of extracted data'
    )

    args = parser.parse_args()

    # Create scraper instance
    scraper = FranchiseScraper(
        data_dir=args.data_dir,
        output_dir=args.output_dir
    )

    # Process files
    processed = False

    if args.file:
        # Process single file
        if not Path(args.file).exists():
            print(f"Error: File not found: {args.file}")
            sys.exit(1)
        scraper.process_pdf(args.file)
        processed = True

    elif args.directory or args.process:
        # Process directory
        directory = args.directory if args.directory else args.data_dir
        count = scraper.process_directory(directory)
        if count == 0:
            print("\nNo files were processed. Please check your directory and try again.")
            sys.exit(1)
        processed = True

    # Print summary if requested or if processing was done
    if processed and (args.summary or not args.export):
        scraper.print_summary()

    # Export data
    if args.export and processed:
        print("\n" + "=" * 80)
        print("EXPORTING DATA")
        print("=" * 80)

        if args.export == 'all':
            scraper.export_to_csv()
            scraper.export_to_json()
            scraper.export_to_excel()
        elif args.export == 'csv':
            scraper.export_to_csv(args.output)
        elif args.export == 'json':
            scraper.export_to_json(args.output)
        elif args.export == 'excel':
            scraper.export_to_excel(args.output)

    # If no arguments provided, show help
    if not any([args.file, args.directory, args.process]):
        parser.print_help()
        print("\n" + "=" * 80)
        print("QUICK START:")
        print("=" * 80)
        print("1. Place your FDD PDF files in the 'data/' directory")
        print("2. Run: python main.py --process --export csv")
        print("3. Find your results in the 'output/' directory")
        print("\nFor more examples, see the help text above.")


if __name__ == '__main__':
    main()
