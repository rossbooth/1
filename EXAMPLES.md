# Franchise Data Scraper - Examples and Guide

This guide provides examples of how to use the Franchise Data Scraper and what kind of data you can expect to extract.

## Understanding FDD Structure

A Franchise Disclosure Document (FDD) is divided into 23 items:

- **Item 1**: The Franchisor and its Parents, Predecessors, and Affiliates
- **Item 2**: Business Experience
- **Item 3**: Litigation
- **Item 4**: Bankruptcy
- **Item 5**: Initial Fees
- **Item 6**: Other Fees
- **Item 7**: Estimated Initial Investment
- **Item 8**: Restrictions on Sources of Products and Services
- **Item 19**: Financial Performance Representations (Most valuable for analysis)
- **Item 20**: Outlets and Franchisee Information
- **Item 21**: Financial Statements

This scraper focuses on Items 5, 6, 7, 19, and 20 as they contain the most critical financial and operational data.

## Example Usage Scenarios

### Scenario 1: Analyzing a Single Franchise

```bash
# Process a specific FDD
python main.py --file data/mcdonalds_fdd_2024.pdf --export json

# View summary
python main.py --file data/mcdonalds_fdd_2024.pdf --summary
```

**Expected Output:**
```
Processing: data/mcdonalds_fdd_2024.pdf
✓ Extracted data for: MCDONALD'S

================================================================================
FRANCHISE DATA SUMMARY (1 franchises)
================================================================================

1. MCDONALD'S
   Franchisor: McDonald's Corporation
   Initial Fee: $45,000
   Investment Range: $1,314,500 - $2,313,295
   Royalty Fee: 4.0%
   Total Franchises: 13,438
   Has Item 19 Data: Yes
   Avg Gross Sales: $2,900,000

✓ Exported data to: output/franchise_data_20260108_143052.json
```

### Scenario 2: Batch Processing Multiple FDDs

```bash
# Process all FDDs in a directory
python main.py --directory data/qsr_franchises --export csv
```

**Use Case:** Compare multiple quick-service restaurant franchises to identify investment patterns and performance metrics.

### Scenario 3: Export to Excel for Analysis

```bash
# Process and export to Excel for business analysis
python main.py --process --export excel --output franchise_comparison.xlsx
```

**Use Case:** Create detailed spreadsheets for financial modeling and franchise comparison analysis.

## Sample Output Data

### CSV Output Example

```csv
franchise_name,franchisor_name,initial_franchise_fee,initial_investment_low,initial_investment_high,royalty_fee_percentage,advertising_fee_percentage,total_franchises,has_item_19,avg_gross_sales
SUBWAY,Subway Franchising LLC,15000,150050,328700,8.0,4.5,20603,True,422000
MCDONALD'S,McDonald's Corporation,45000,1314500,2313295,4.0,4.0,13438,True,2900000
7-ELEVEN,7-Eleven Inc.,50000,50000,1635000,,,8500,False,
```

### JSON Output Example

```json
[
  {
    "franchise_name": "SUBWAY",
    "franchisor_name": "Subway Franchising LLC",
    "industry": "Quick Service Restaurant",
    "initial_franchise_fee": 15000,
    "initial_investment_low": 150050,
    "initial_investment_high": 328700,
    "royalty_fee_percentage": 8.0,
    "advertising_fee_percentage": 4.5,
    "total_franchises": 20603,
    "franchised_outlets": 20500,
    "company_owned": 103,
    "has_item_19": true,
    "avg_gross_sales": 422000,
    "median_gross_sales": 396000,
    "performance_sample_size": 2500,
    "year_founded": 1965,
    "year_franchising_began": 1974,
    "extraction_date": "2026-01-08T14:30:52"
  }
]
```

## Data Field Descriptions

### Financial Metrics

- **initial_franchise_fee**: One-time fee paid to franchisor for franchise rights
- **initial_investment_low/high**: Total estimated investment range to open franchise
- **royalty_fee_percentage**: Ongoing percentage of sales paid to franchisor
- **advertising_fee_percentage**: Percentage of sales paid for national advertising

### Performance Metrics (Item 19)

- **has_item_19**: Whether franchisor provided financial performance data
- **avg_gross_sales**: Average annual gross sales across reporting locations
- **median_gross_sales**: Median annual gross sales
- **avg_net_income**: Average net income (if provided)
- **performance_sample_size**: Number of locations in the sample

### System Size Metrics

- **total_franchises**: Total system size (franchised + company-owned)
- **franchised_outlets**: Number of franchised locations
- **company_owned**: Number of company-operated locations

## Common Analysis Tasks

### 1. Calculate Total Startup Cost

```python
import pandas as pd

df = pd.read_csv('output/franchise_data.csv')

# Total startup cost (investment high + franchise fee)
df['total_startup'] = df['initial_investment_high'] + df['initial_franchise_fee']

# Sort by total startup cost
df_sorted = df.sort_values('total_startup')
print(df_sorted[['franchise_name', 'total_startup']])
```

### 2. Compare ROI Potential

```python
# Calculate estimated first-year fees
df['annual_royalties'] = df['avg_gross_sales'] * (df['royalty_fee_percentage'] / 100)
df['annual_ad_fees'] = df['avg_gross_sales'] * (df['advertising_fee_percentage'] / 100)
df['total_annual_fees'] = df['annual_royalties'] + df['annual_ad_fees']

# Estimated gross profit (simplified)
df['estimated_gross_profit'] = df['avg_gross_sales'] - df['total_annual_fees']

# Sort by estimated gross profit
print(df.sort_values('estimated_gross_profit', ascending=False))
```

### 3. Filter by Investment Range

```python
# Find franchises under $500k investment
affordable = df[df['initial_investment_high'] <= 500000]
print(affordable[['franchise_name', 'initial_investment_high', 'avg_gross_sales']])
```

## Tips for Best Results

### 1. Pre-processing PDFs
- Ensure PDFs are text-based, not scanned images
- Remove password protection before processing
- Use the most recent FDD available (they're updated annually)

### 2. Data Validation
- Always cross-reference critical numbers with the source PDF
- Item 19 data varies significantly in format - may need manual review
- Some franchisors don't provide Item 19 data at all

### 3. Batch Processing
- Organize FDDs by industry in separate folders
- Use consistent naming: `franchisename_fdd_year.pdf`
- Process similar franchises together for easier comparison

### 4. Export Strategy
- Use CSV for data analysis and import to other tools
- Use JSON for programmatic access and APIs
- Use Excel for business presentations and reporting

## Real-World Use Cases

### Franchise Consultant
Process 50+ FDDs to create comparison reports for clients considering franchise opportunities.

### Financial Analyst
Extract Item 19 financial performance data to build valuation models and investment theses.

### Market Researcher
Analyze franchise system growth rates and geographic expansion patterns.

### Prospective Franchisee
Compare initial investments, fees, and performance metrics across multiple franchise brands.

## Advanced Customization

### Modify Extraction Patterns

Edit `src/pdf_parser.py` to improve extraction for specific FDD formats:

```python
def _extract_custom_field(self) -> Optional[str]:
    """Extract custom data field"""
    pattern = r'Your Custom Pattern Here'
    match = re.search(pattern, self.text, re.IGNORECASE)
    if match:
        return match.group(1)
    return None
```

### Add Industry Classification

Extend the `FranchiseInfo` model in `src/models.py`:

```python
@dataclass
class FranchiseInfo:
    # ... existing fields ...
    industry_category: Optional[str] = None  # QSR, Retail, Services, etc.
    sub_category: Optional[str] = None       # Pizza, Burgers, Coffee, etc.
```

## Troubleshooting Common Issues

### Issue: No financial data extracted

**Cause:** FDD may not include Item 19 financial performance data (not required)

**Solution:** Check `has_item_19` field. Many franchisors choose not to provide this data.

### Issue: Incorrect franchise name

**Cause:** Name extraction patterns may not match your FDD format

**Solution:** Manually review first page of FDD and adjust patterns in `_find_franchise_name()`

### Issue: Missing investment range

**Cause:** Item 7 table format varies significantly

**Solution:** Review Item 7 in the PDF and adjust extraction patterns in `_extract_financials()`

## Getting Help

If you encounter issues:

1. Check the PDF is actually an FDD (not a franchise agreement or other document)
2. Verify the PDF is text-based (try copying text from it)
3. Review the extraction patterns in `pdf_parser.py`
4. Open an issue with a sample of the problematic PDF section

## Next Steps

After extracting data:

1. **Validate**: Cross-check critical numbers against source documents
2. **Analyze**: Use pandas, Excel, or BI tools for deeper analysis
3. **Visualize**: Create charts comparing investment levels, fees, and performance
4. **Report**: Generate reports for stakeholders or clients

Remember: FDD data is just one input for franchise evaluation. Always conduct thorough due diligence including:
- Talking to existing franchisees
- Visiting franchise locations
- Reviewing legal documents with an attorney
- Consulting with financial advisors
