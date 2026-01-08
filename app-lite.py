#!/usr/bin/env python3
"""
Franchise Data Scraper - Lightweight Web Application
Flask-based web interface for viewing and managing franchise data
Simplified version without heavy dependencies
"""

import os
import sys
import json
import csv
from pathlib import Path
from datetime import datetime
from flask import Flask, render_template, request, jsonify, send_file, redirect, url_for, Response
from werkzeug.utils import secure_filename
from io import StringIO

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / 'src'))

from pdf_parser import FDDParser
from fdd_downloader import FDDDownloader
from models import FranchiseData, FranchiseInfo

app = Flask(__name__)
app.config['SECRET_KEY'] = 'franchise-data-scraper-secret-key'
app.config['UPLOAD_FOLDER'] = 'data'
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max file size

# Initialize
franchises = []
downloader = FDDDownloader()


def process_pdf_file(pdf_path):
    """Process a single PDF file"""
    try:
        print(f"Processing: {pdf_path}")
        parser = FDDParser(pdf_path)
        franchise_data = parser.parse()
        franchise_data.info.pdf_path = pdf_path
        franchises.append(franchise_data)
        print(f"✓ Extracted data for: {franchise_data.info.franchise_name}")
        return franchise_data
    except Exception as e:
        print(f"✗ Error processing {pdf_path}: {e}")
        return None


def export_to_csv_simple(data_list, filename):
    """Simple CSV export without pandas"""
    if not data_list:
        return None

    output_path = Path('output') / filename

    # Get all data as dicts
    data_dicts = [f.to_dict() for f in data_list]

    # Write CSV
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        if data_dicts:
            writer = csv.DictWriter(f, fieldnames=data_dicts[0].keys())
            writer.writeheader()
            writer.writerows(data_dicts)

    return str(output_path)


@app.route('/')
def index():
    """Home page"""
    return render_template('index.html')


@app.route('/api/franchises')
def get_franchises():
    """Get all processed franchise data"""
    data = [f.to_dict() for f in franchises]
    return jsonify({
        'success': True,
        'count': len(data),
        'franchises': data
    })


@app.route('/api/franchise/<int:index>')
def get_franchise(index):
    """Get a specific franchise by index"""
    if index < 0 or index >= len(franchises):
        return jsonify({'success': False, 'error': 'Invalid index'}), 404

    franchise = franchises[index]
    return jsonify({
        'success': True,
        'franchise': franchise.to_dict()
    })


@app.route('/api/upload', methods=['POST'])
def upload_pdf():
    """Upload and process a PDF file"""
    if 'file' not in request.files:
        return jsonify({'success': False, 'error': 'No file provided'}), 400

    file = request.files['file']

    if file.filename == '':
        return jsonify({'success': False, 'error': 'No file selected'}), 400

    if not file.filename.endswith('.pdf'):
        return jsonify({'success': False, 'error': 'File must be a PDF'}), 400

    try:
        # Save file
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)

        # Process PDF
        franchise_data = process_pdf_file(filepath)

        if franchise_data:
            return jsonify({
                'success': True,
                'message': f'Successfully processed {franchise_data.info.franchise_name}',
                'franchise': franchise_data.to_dict()
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to extract data from PDF'
            }), 500

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/process-directory', methods=['POST'])
def process_directory():
    """Process all PDFs in the data directory"""
    try:
        # Clear existing data
        franchises.clear()

        # Process directory
        data_dir = Path('data')
        if not data_dir.exists():
            return jsonify({'success': False, 'error': 'Data directory not found'}), 400

        pdf_files = list(data_dir.glob("*.pdf"))

        count = 0
        for pdf_file in pdf_files:
            if process_pdf_file(str(pdf_file)):
                count += 1

        return jsonify({
            'success': True,
            'message': f'Processed {count} files',
            'count': count
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/export/<format>')
def export_data(format):
    """Export data to specified format"""
    if not franchises:
        return jsonify({'success': False, 'error': 'No data to export'}), 400

    try:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        if format == 'csv':
            filename = f'franchise_data_{timestamp}.csv'
            filepath = export_to_csv_simple(franchises, filename)
            return send_file(filepath, as_attachment=True, download_name=filename)

        elif format == 'json':
            filename = f'franchise_data_{timestamp}.json'
            data_dicts = [f.to_dict() for f in franchises]

            # Create JSON response
            json_str = json.dumps(data_dicts, indent=2, default=str)

            return Response(
                json_str,
                mimetype='application/json',
                headers={'Content-Disposition': f'attachment;filename={filename}'}
            )
        else:
            return jsonify({'success': False, 'error': 'Invalid format'}), 400

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/search-fdd', methods=['POST'])
def search_fdd():
    """Search for FDD sources"""
    data = request.get_json()
    franchise_name = data.get('franchise_name', '')

    if not franchise_name:
        return jsonify({'success': False, 'error': 'Franchise name required'}), 400

    try:
        results = downloader.search_all_sources(franchise_name)

        return jsonify({
            'success': True,
            'franchise_name': franchise_name,
            'sources': results
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/stats')
def get_stats():
    """Get statistics about processed franchises"""
    if not franchises:
        return jsonify({
            'success': True,
            'stats': {
                'total_franchises': 0,
                'avg_initial_fee': 0,
                'avg_investment': 0,
                'avg_royalty': 0,
                'with_item_19': 0
            }
        })

    # Calculate stats
    initial_fees = [f.financials.initial_franchise_fee for f in franchises
                    if f.financials.initial_franchise_fee]
    investments = [f.financials.initial_investment_high for f in franchises
                   if f.financials.initial_investment_high]
    royalties = [f.financials.royalty_fee_percentage for f in franchises
                 if f.financials.royalty_fee_percentage]
    with_item_19 = sum(1 for f in franchises if f.performance.has_item_19)

    stats = {
        'total_franchises': len(franchises),
        'avg_initial_fee': sum(initial_fees) / len(initial_fees) if initial_fees else 0,
        'avg_investment': sum(investments) / len(investments) if investments else 0,
        'avg_royalty': sum(royalties) / len(royalties) if royalties else 0,
        'with_item_19': with_item_19,
        'with_item_19_pct': (with_item_19 / len(franchises) * 100) if franchises else 0
    }

    return jsonify({
        'success': True,
        'stats': stats
    })


@app.route('/api/delete/<int:index>', methods=['DELETE'])
def delete_franchise(index):
    """Delete a franchise from the list"""
    if index < 0 or index >= len(franchises):
        return jsonify({'success': False, 'error': 'Invalid index'}), 404

    try:
        deleted = franchises.pop(index)
        return jsonify({
            'success': True,
            'message': f'Deleted {deleted.info.franchise_name}'
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/clear', methods=['POST'])
def clear_data():
    """Clear all franchise data"""
    franchises.clear()
    return jsonify({
        'success': True,
        'message': 'All data cleared'
    })


@app.route('/visualize')
def visualize():
    """Data visualization page"""
    return render_template('visualize.html')


@app.route('/search')
def search():
    """FDD search page"""
    return render_template('search.html')


@app.route('/upload')
def upload():
    """Upload page"""
    return render_template('upload.html')


if __name__ == '__main__':
    # Ensure directories exist
    Path('data').mkdir(exist_ok=True)
    Path('output').mkdir(exist_ok=True)

    # Run app
    print("\n" + "="*60)
    print("🚀 Franchise Data Scraper - Lite Version")
    print("="*60)
    print("\nStarting web server...")
    print("Open your browser and go to: http://localhost:5000")
    print("\nPress Ctrl+C to stop the server")
    print("="*60 + "\n")

    app.run(debug=True, host='0.0.0.0', port=5000)
