#!/usr/bin/env python3
"""
Franchise Data Scraper - Web Application
Flask-based web interface for viewing and managing franchise data
"""

import os
import sys
import json
from pathlib import Path
from datetime import datetime
from flask import Flask, render_template, request, jsonify, send_file, redirect, url_for
from werkzeug.utils import secure_filename

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / 'src'))

from scraper import FranchiseScraper
from fdd_downloader import FDDDownloader
from models import FranchiseData

app = Flask(__name__)
app.config['SECRET_KEY'] = 'franchise-data-scraper-secret-key'
app.config['UPLOAD_FOLDER'] = 'data'
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max file size

# Initialize scraper
scraper = FranchiseScraper()
downloader = FDDDownloader()


@app.route('/')
def index():
    """Home page"""
    return render_template('index.html')


@app.route('/api/franchises')
def get_franchises():
    """Get all processed franchise data"""
    data = [f.to_dict() for f in scraper.franchises]
    return jsonify({
        'success': True,
        'count': len(data),
        'franchises': data
    })


@app.route('/api/franchise/<int:index>')
def get_franchise(index):
    """Get a specific franchise by index"""
    if index < 0 or index >= len(scraper.franchises):
        return jsonify({'success': False, 'error': 'Invalid index'}), 404

    franchise = scraper.franchises[index]
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
        franchise_data = scraper.process_pdf(filepath)

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
        scraper.clear_data()

        # Process directory
        count = scraper.process_directory()

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
    if not scraper.franchises:
        return jsonify({'success': False, 'error': 'No data to export'}), 400

    try:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        if format == 'csv':
            filename = f'franchise_data_{timestamp}.csv'
            filepath = scraper.export_to_csv(filename)
        elif format == 'json':
            filename = f'franchise_data_{timestamp}.json'
            filepath = scraper.export_to_json(filename)
        elif format == 'excel':
            filename = f'franchise_data_{timestamp}.xlsx'
            filepath = scraper.export_to_excel(filename)
        else:
            return jsonify({'success': False, 'error': 'Invalid format'}), 400

        return send_file(
            filepath,
            as_attachment=True,
            download_name=filename
        )

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
    if not scraper.franchises:
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

    franchises = scraper.franchises

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
    if index < 0 or index >= len(scraper.franchises):
        return jsonify({'success': False, 'error': 'Invalid index'}), 404

    try:
        deleted = scraper.franchises.pop(index)
        return jsonify({
            'success': True,
            'message': f'Deleted {deleted.info.franchise_name}'
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/clear', methods=['POST'])
def clear_data():
    """Clear all franchise data"""
    scraper.clear_data()
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
    app.run(debug=True, host='0.0.0.0', port=5000)
