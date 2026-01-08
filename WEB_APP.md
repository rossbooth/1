# Web Application Guide

This guide covers the web interface for the Franchise Data Scraper.

## Starting the Web Application

### Development Mode

```bash
python app.py
```

The app will start on `http://localhost:5000` with debug mode enabled for development.

### Production Mode

For production deployment, use gunicorn:

```bash
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

This starts the app with 4 worker processes for better performance.

## Features Overview

### 1. Dashboard (`/`)

The main dashboard provides:

- **Statistics Cards**: Quick overview of total franchises, average fees, and investments
- **Franchise List**: Grid view of all processed franchises
- **Search**: Real-time search across franchise and franchisor names
- **Actions**: Process PDFs, export data, clear data

**Key Actions:**
- **Process All PDFs**: Processes all PDF files in the `data/` directory
- **Export CSV/JSON/Excel**: Download processed data in various formats
- **Clear Data**: Remove all processed franchises from memory

### 2. Upload Interface (`/upload`)

Upload FDD documents for processing:

- **Drag & Drop**: Drag PDF files directly onto the upload area
- **File Browser**: Click to browse and select PDF files
- **Multi-file Upload**: Process multiple FDDs at once
- **Real-time Progress**: See upload and processing status for each file
- **Auto-redirect**: Automatically returns to dashboard after processing

**Supported:**
- PDF files only
- Maximum 50MB per file
- Multiple simultaneous uploads

### 3. Search FDDs (`/search`)

Find FDDs from publicly available sources:

- **Search Box**: Enter franchise name (e.g., "Jersey Mike's")
- **Multiple Sources**: Searches across:
  - FranChimp
  - FDD Exchange
  - Wisconsin State Database
  - California DBO
  - Minnesota Commerce
  - NASAA

**Results Include:**
- Source name and URL
- Direct links to search results
- Notes about access (free vs paid)

**Popular Free Sources:**
- **Wisconsin**: Best free state database
- **California**: Comprehensive franchise registry
- **Minnesota**: Easy-to-use database

### 4. Data Visualization (`/visualize`)

Interactive charts and graphs:

1. **Initial Investment Comparison**
   - Bar chart comparing min/max investments
   - Grouped by franchise

2. **Fee Structure Comparison**
   - Initial franchise fees across franchises
   - Top 10 by fee amount

3. **Franchise System Size**
   - Pie chart of franchise counts
   - Top 10 largest systems

4. **Item 19 Performance Data**
   - Average gross sales comparison
   - Only includes franchises with Item 19 data

5. **Investment Range Distribution**
   - Histogram showing investment distribution
   - Helps identify investment tiers

6. **Royalty vs Advertising Fees**
   - Scatter plot comparing fee structures
   - Interactive hover for franchise names

All charts are powered by Plotly and support:
- Zoom and pan
- Export as PNG
- Hover for details
- Interactive legends

## API Endpoints

The web app provides a RESTful API for programmatic access:

### GET `/api/franchises`

Get all processed franchise data.

**Response:**
```json
{
  "success": true,
  "count": 5,
  "franchises": [...]
}
```

### GET `/api/franchise/<index>`

Get a specific franchise by index.

**Response:**
```json
{
  "success": true,
  "franchise": {...}
}
```

### POST `/api/upload`

Upload and process a PDF file.

**Request:** Multipart form data with `file` field
**Response:**
```json
{
  "success": true,
  "message": "Successfully processed McDonald's",
  "franchise": {...}
}
```

### POST `/api/process-directory`

Process all PDFs in the data directory.

**Response:**
```json
{
  "success": true,
  "message": "Processed 5 files",
  "count": 5
}
```

### GET `/api/export/<format>`

Export data in specified format (csv, json, excel).

**Response:** File download

### POST `/api/search-fdd`

Search for FDD sources.

**Request:**
```json
{
  "franchise_name": "Jersey Mike's"
}
```

**Response:**
```json
{
  "success": true,
  "franchise_name": "Jersey Mike's",
  "sources": [...]
}
```

### GET `/api/stats`

Get statistics about processed franchises.

**Response:**
```json
{
  "success": true,
  "stats": {
    "total_franchises": 5,
    "avg_initial_fee": 45000,
    "avg_investment": 500000,
    "avg_royalty": 6.5,
    "with_item_19": 3,
    "with_item_19_pct": 60
  }
}
```

### DELETE `/api/delete/<index>`

Delete a franchise from the list.

**Response:**
```json
{
  "success": true,
  "message": "Deleted McDonald's"
}
```

### POST `/api/clear`

Clear all franchise data.

**Response:**
```json
{
  "success": true,
  "message": "All data cleared"
}
```

## Using the API with cURL

### Get all franchises
```bash
curl http://localhost:5000/api/franchises
```

### Upload a PDF
```bash
curl -X POST -F "file=@path/to/fdd.pdf" http://localhost:5000/api/upload
```

### Search for FDD
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"franchise_name":"Jersey Mikes"}' \
  http://localhost:5000/api/search-fdd
```

### Export to CSV
```bash
curl -O http://localhost:5000/api/export/csv
```

## Using the API with Python

```python
import requests

# Base URL
base_url = "http://localhost:5000"

# Get all franchises
response = requests.get(f"{base_url}/api/franchises")
data = response.json()
franchises = data['franchises']

# Upload a PDF
with open('jersey_mikes.pdf', 'rb') as f:
    files = {'file': f}
    response = requests.post(f"{base_url}/api/upload", files=files)
    result = response.json()

# Search for FDD
response = requests.post(
    f"{base_url}/api/search-fdd",
    json={"franchise_name": "Subway"}
)
sources = response.json()['sources']

# Get statistics
response = requests.get(f"{base_url}/api/stats")
stats = response.json()['stats']
print(f"Total franchises: {stats['total_franchises']}")
```

## Using the API with JavaScript

```javascript
// Fetch all franchises
async function getFranchises() {
  const response = await fetch('/api/franchises');
  const data = await response.json();
  return data.franchises;
}

// Upload PDF
async function uploadPDF(file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/upload', {
    method: 'POST',
    body: formData
  });

  return await response.json();
}

// Search for FDD
async function searchFDD(franchiseName) {
  const response = await fetch('/api/search-fdd', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ franchise_name: franchiseName })
  });

  return await response.json();
}
```

## Keyboard Shortcuts

- **Escape**: Close modal windows
- **Ctrl/Cmd + F**: Focus search box (when available)

## Browser Support

The web application supports:
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers

**Minimum requirements:**
- JavaScript enabled
- Modern browser (ES6+ support)
- Screen resolution 320px+ width

## Customization

### Change Port

Edit `app.py`:
```python
app.run(debug=True, host='0.0.0.0', port=8080)  # Change port here
```

### Custom Styling

Edit `static/css/style.css` to customize:
- Colors (CSS variables in `:root`)
- Fonts
- Layout
- Component styles

### Add Custom Routes

Add new routes in `app.py`:
```python
@app.route('/custom')
def custom_page():
    return render_template('custom.html')
```

## Troubleshooting

### Port Already in Use

If port 5000 is already in use:
```bash
# Find process using port 5000
lsof -i :5000

# Kill process
kill -9 <PID>

# Or use a different port
python app.py --port 8080
```

### Upload Fails

Check:
- File is a valid PDF
- File size under 50MB
- `data/` directory exists and is writable

### Charts Not Loading

Ensure:
- Internet connection (Plotly loads from CDN)
- JavaScript enabled
- No browser extensions blocking scripts

### No Data Showing

- Process PDFs first (Dashboard → "Process All PDFs")
- Or upload PDFs via Upload page
- Check `data/` directory has PDF files

## Security Considerations

**For Production:**

1. **Change Secret Key**: Update `app.config['SECRET_KEY']` in `app.py`
2. **Disable Debug**: Set `debug=False` in `app.run()`
3. **Use HTTPS**: Deploy behind nginx/Apache with SSL
4. **Limit File Size**: Adjust `MAX_CONTENT_LENGTH` as needed
5. **Add Authentication**: Implement user authentication for sensitive data

## Performance Tips

1. **Use Gunicorn**: For production, always use gunicorn
2. **Enable Caching**: Consider adding Redis for caching
3. **Optimize PDFs**: Pre-process large PDFs to reduce size
4. **Batch Processing**: Process multiple PDFs during off-hours
5. **Database**: For large datasets, consider adding SQLite/PostgreSQL

## Deployment

### Docker Deployment

Create `Dockerfile`:
```dockerfile
FROM python:3.9-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "app:app"]
```

Build and run:
```bash
docker build -t franchise-scraper .
docker run -p 5000:5000 franchise-scraper
```

### Cloud Deployment

The app can be deployed to:
- **Heroku**: Add `Procfile` with gunicorn command
- **AWS EC2**: Install dependencies and run with gunicorn
- **Google Cloud**: Use App Engine or Cloud Run
- **Azure**: Use App Service

## Support

For issues with the web application:
1. Check browser console for errors
2. Review server logs
3. Verify all dependencies installed
4. Check file permissions on `data/` and `output/` directories
