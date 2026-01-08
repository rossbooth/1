# Franchise Data Scraper

A Python application for extracting structured data from Franchise Disclosure Documents (FDDs). This tool automates the process of parsing FDD PDFs and extracting key franchise information including financial data, fees, franchise counts, and performance metrics.

## Features

- **Automated PDF Parsing**: Extract text and data from FDD PDF documents
- **Comprehensive Data Extraction**: Captures key information from multiple FDD items:
  - Item 5: Initial fees and investment requirements
  - Item 6: Ongoing fees (royalties, advertising)
  - Item 7: Estimated initial investment breakdown
  - Item 19: Financial performance representations
  - Item 20: Franchise unit counts and locations
- **Multiple Export Formats**: Export data to CSV, JSON, or Excel
- **Batch Processing**: Process multiple FDD files at once
- **CLI Interface**: Easy-to-use command-line interface

## Data Extracted

The scraper extracts the following information from each FDD:

### Basic Information
- Franchise name
- Franchisor company name
- Contact information (address, phone, website)
- Filing dates and effective dates
- Year founded and year franchising began

### Financial Data (Item 7)
- Initial franchise fee
- Initial investment range (low to high)
- Royalty fee percentage
- Advertising fee percentage
- Additional fees

### Franchise Counts (Item 20)
- Total number of franchises
- Company-owned outlets
- Franchised outlets

### Performance Data (Item 19)
- Whether Item 19 financial performance data is provided
- Average gross sales
- Median gross sales
- Average net income
- Sample size and year of data

## Installation

### Prerequisites
- Python 3.8 or higher
- pip (Python package manager)

### Setup

1. Clone or download this repository:
```bash
git clone <repository-url>
cd franchise-data-scraper
```

2. Install required dependencies:
```bash
pip install -r requirements.txt
```

3. Create necessary directories (if they don't exist):
```bash
mkdir -p data output
```

## Usage

### Quick Start

1. Place your FDD PDF files in the `data/` directory
2. Run the scraper:
```bash
python main.py --process --export csv
```
3. Find your results in the `output/` directory

### Command-Line Options

```bash
# Process all PDFs in the data directory
python main.py --process

# Process a specific PDF file
python main.py --file path/to/fdd.pdf

# Process PDFs from a specific directory
python main.py --directory path/to/pdfs

# Export to CSV
python main.py --process --export csv

# Export to JSON
python main.py --process --export json

# Export to Excel
python main.py --process --export excel

# Export to all formats
python main.py --process --export all

# Specify custom output filename
python main.py --process --export csv --output my_franchise_data.csv

# Use custom data and output directories
python main.py --data-dir my_pdfs --output-dir my_results --process --export csv

# Show summary without exporting
python main.py --process --summary
```

### Full Command-Line Arguments

```
--file, -f          Process a single PDF file
--directory, -d     Process all PDF files in a directory
--process, -p       Process all PDFs in the default data directory
--export, -e        Export format (csv, json, excel, or all)
--output, -o        Output filename (optional)
--data-dir          Directory containing PDF files (default: data/)
--output-dir        Directory for output files (default: output/)
--summary, -s       Print summary of extracted data
```

## Project Structure

```
franchise-data-scraper/
├── main.py                 # CLI interface
├── requirements.txt        # Python dependencies
├── README.md              # This file
├── src/
│   ├── models.py          # Data models for franchise information
│   ├── pdf_parser.py      # PDF parsing and data extraction logic
│   └── scraper.py         # Main scraper orchestration
├── data/                  # Place your FDD PDFs here
└── output/                # Exported data files go here
```

## Data Models

### FranchiseInfo
Basic franchise and franchisor information including contact details, filing dates, and franchise counts.

### FranchiseFinancials
Financial data from Item 7 including initial fees, investment ranges, and ongoing fee percentages.

### FranchisePerformance
Financial performance representations from Item 19 including sales averages and medians.

### FranchiseData
Complete franchise data container that combines all the above models.

## Output Formats

### CSV
Flat file format with one row per franchise, ideal for spreadsheet analysis and data import.

### JSON
Structured format preserving all data relationships, ideal for programmatic access and APIs.

### Excel
Spreadsheet format with formatted columns, ideal for business analysis and reporting.

## Finding FDD Documents

FDDs are public documents that franchisors are required to provide to prospective franchisees. Here's where to find them:

1. **State Franchise Regulators**: Some states (CA, NY, IL, etc.) require FDD registration
   - California: https://www.dbo.ca.gov/
   - New York: https://www.dos.ny.gov/

2. **Directly from Franchisors**: Request from the franchise company
3. **Franchise Disclosure Registries**: Some online databases maintain FDD collections
4. **SEC EDGAR**: Some franchisors file FDDs as exhibits to SEC filings

## Limitations

- **PDF Format Variations**: FDDs vary significantly in format. The parser uses heuristics and may not capture 100% of data from all FDDs.
- **OCR Not Included**: Scanned PDFs require OCR preprocessing (not included in this tool).
- **Manual Review Recommended**: Always verify extracted data against source documents for critical business decisions.
- **Item 19 Complexity**: Financial performance data varies widely in format and may require manual review.

## Improving Extraction Accuracy

The parser uses regular expressions and text pattern matching. To improve results:

1. Use text-based PDFs (not scanned images)
2. Ensure PDFs are not password-protected
3. Review the extraction patterns in `pdf_parser.py` and adjust for your specific FDD formats
4. Consider manual verification of critical data points

## Development

### Adding New Data Fields

1. Update the data models in `src/models.py`
2. Add extraction logic in `src/pdf_parser.py`
3. Update the `to_dict()` method for export compatibility

### Extending the Parser

The `FDDParser` class in `pdf_parser.py` contains all extraction logic. Add new methods following the pattern:

```python
def _extract_new_field(self) -> Optional[str]:
    """Extract new field from FDD"""
    # Search for pattern in self.text
    # Return extracted value
```

## Troubleshooting

### No data extracted
- Verify PDFs are text-based (not scanned images)
- Check PDF is not password-protected
- Ensure PDF is actually an FDD document

### Incorrect or missing values
- FDD formats vary significantly
- Adjust regex patterns in `pdf_parser.py` for your specific documents
- Some fields may not be present in all FDDs

### Import errors
- Ensure all dependencies are installed: `pip install -r requirements.txt`
- Check Python version: `python --version` (requires 3.8+)

## Legal Disclaimer

This tool is provided for research and analysis purposes. FDD documents contain important legal and financial information. Always:

- Verify extracted data against original documents
- Consult with legal and financial professionals before making franchise decisions
- Respect copyright and intellectual property rights of FDD documents
- Comply with all applicable laws regarding use of FDD information

## Contributing

Contributions are welcome! Areas for improvement:

- Enhanced pattern matching for different FDD formats
- OCR integration for scanned documents
- Web scraping capabilities for public FDD repositories
- Additional data fields and Item coverage
- Improved entity extraction (locations, executives, etc.)

## License

This project is provided as-is for educational and research purposes.

## Support

For issues, questions, or contributions, please open an issue in the repository.
