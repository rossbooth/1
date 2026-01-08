# Quick Start Guide - Franchise Data Scraper

## 🎯 Your Goal: Get Jersey Mike's FDD Data

Since the web interface isn't accessible in this environment, here's how to accomplish your goals using the CLI:

## Step 1: Get the FDD

### FREE Sources (No payment required):

1. **Wisconsin Database** (Recommended - Easiest)
   - Go to: https://apps.wi.gov/dfi-sb/home
   - Search for "Jersey Mike's"
   - Download the PDF for free

2. **California Database**
   - Go to: https://docqnet.dbo.ca.gov/search.asp
   - Search for "Jersey Mike's Franchising"
   - Free download

3. **Minnesota Database**
   - Go to: https://mn.gov/commerce/consumers/your-business/licensing-and-registration/franchise/
   - Search and download

### Paid Options (If you need immediate access):
- **FranChimp**: $167/month - 18,000+ FDDs - https://www.franchimp.com

## Step 2: Upload the FDD

Once you download the PDF:

```bash
# If you're on your local machine and have this repo:
# 1. Place the PDF in the data/ folder
# 2. Run:
python main.py --process --export all --summary

# Or process a specific file:
python main.py --file path/to/jersey_mikes_fdd.pdf --export csv
```

## Step 3: View the Results

The tool will extract:

### Basic Info
- Franchise name and franchisor
- Contact information
- Year founded and franchising began
- Industry category

### Financial Data (Item 7)
- Initial franchise fee: ~$18,500 - $35,000
- Total investment: ~$182,000 - $1,414,000
- Royalty fees: ~6.5%
- Advertising fees: ~5.0%

### System Size (Item 20)
- Total locations: 2,800+
- Franchised vs company-owned breakdown
- Geographic distribution

### Performance Data (Item 19)
- Average unit volume (if disclosed)
- Sales performance metrics
- Sample size and methodology

## Expected Output Files

After processing, you'll get files in the `output/` directory:

1. **franchise_data_YYYYMMDD_HHMMSS.csv**
   - Spreadsheet-ready data
   - Import into Excel/Google Sheets
   - Easy sorting and filtering

2. **franchise_data_YYYYMMDD_HHMMSS.json**
   - Structured data for APIs
   - Use in custom applications
   - Machine-readable format

3. **franchise_data_YYYYMMDD_HHMMSS.xlsx**
   - Excel workbook
   - Ready for business analysis
   - Formatted for presentations

## What You Can Analyze

Once you have data from multiple franchises:

### Compare Investments
```csv
Franchise,Initial Fee,Total Investment Low,Total Investment High
Jersey Mike's,35000,182000,1414000
Subway,15000,150050,328700
Jimmy John's,35000,330000,555500
```

### Compare Fee Structures
```csv
Franchise,Royalty %,Advertising %,Total Fees %
Jersey Mike's,6.5,5.0,11.5
Subway,8.0,4.5,12.5
Jimmy John's,8.0,4.5,12.5
```

### ROI Analysis
- Calculate payback periods
- Compare initial investments to avg sales
- Analyze profit margins

## Tips for Finding FDDs

1. **State Databases are Best**
   - Wisconsin has the most comprehensive free collection
   - California requires all franchises selling in CA to register
   - Minnesota and Indiana also have good free databases

2. **Direct from Franchisor**
   - If you're a serious buyer, franchisors must provide FDD
   - Usually given during discovery process
   - Takes 1-2 weeks typically

3. **What to Look For**
   - Most recent FDD (updated annually)
   - Look for effective date on cover page
   - Ensure it's the complete document (usually 100-200+ pages)

## Jersey Mike's Specific Info

Based on publicly available data:

- **Investment Range**: $182,000 - $1,414,000
- **Franchise Fee**: $18,500 - $35,000 (varies by territory)
- **Royalty**: 6.5% of gross sales
- **Advertising**: 5% of gross sales
- **Total System**: 2,800+ locations (as of 2024)
- **Item 19**: Yes, they provide financial performance data
- **Founded**: 1956 (Point Pleasant, NJ)
- **Franchising Since**: 1987

## Alternative: Web Interface for Local Use

If you want to use the web interface on your local machine:

1. Clone this repository to your computer
2. Install dependencies: `pip install -r requirements.txt`
3. Run: `python app.py`
4. Open: http://localhost:5000
5. Enjoy the full web UI with charts and visualizations!

## Need Help?

- Check EXAMPLES.md for detailed usage examples
- Read WEB_APP.md for API documentation
- Review README.md for full feature list

## What Makes This Tool Valuable

Traditional FDD analysis is manual and time-consuming:
- Reading 150+ page documents
- Copying data into spreadsheets by hand
- Comparing multiple franchises manually
- Hours of work per franchise

This tool automates it all:
- Extracts data in seconds
- Processes multiple FDDs at once
- Exports to any format you need
- Consistent, structured data for analysis

Perfect for:
- Franchise consultants comparing options for clients
- Prospective franchisees researching opportunities
- Financial analysts building valuation models
- Market researchers tracking industry trends
