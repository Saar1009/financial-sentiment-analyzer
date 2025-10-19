# --- Imports ---
import os
import sqlite3
from flask import Flask, render_template, request, jsonify
import requests
from textblob import TextBlob
from datetime import date, timedelta
from typing import List, Dict, Any

# --- Configuration ---
FINNHUB_API_KEY = "d3p5mcpr01qt2em5qgugd3p5mcpr01qt2em5qgv0"
FINNHUB_NEWS_URL = "https://finnhub.io/api/v1/company-news"
DATABASE_NAME = "sentiment_history.db"

# --- Flask App Initialization ---
app = Flask(__name__)

# --- FIX: Disable caching during development ---
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
app.config['TEMPLATES_AUTO_RELOAD'] = True

# --- Database Setup & Connection Management ---
def get_db_connection():
    conn = sqlite3.connect(DATABASE_NAME, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    try:
        with get_db_connection() as conn:
            conn.execute('''
                CREATE TABLE IF NOT EXISTS history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, ticker TEXT NOT NULL,
                    score REAL NOT NULL, timestamp TEXT NOT NULL
                )
            ''')
            conn.execute('''
                CREATE TABLE IF NOT EXISTS wishlist (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, ticker TEXT NOT NULL UNIQUE,
                    timestamp TEXT NOT NULL
                )
            ''')
            conn.commit()
    except Exception as e:
        print(f"Error during database initialization: {e}")

# --- AI Logic ---
def analyze_sentiment(text: str) -> float:
    if not text: return 0.0
    return TextBlob(text).sentiment.polarity

# --- Page Routes (NEW) ---
@app.route('/')
def home():
    """Renders the Home Page."""
    return render_template('index.html')

@app.route('/search')
def search():
    """Renders the Stock Search page."""
    return render_template('search.html')

@app.route('/wishlist')
def wishlist_page():
    """Renders the Wishlist page, passing in the saved tickers."""
    try:
        with get_db_connection() as conn:
            # Select all items from the wishlist, newest first
            items = conn.execute("SELECT ticker, timestamp FROM wishlist ORDER BY id DESC").fetchall()
            
            # Pass the list of items to the template
            return render_template('wishlist.html', wishlist_items=items)
    except Exception as e:
        print(f"Error fetching wishlist for page: {e}")
        # In case of an error, render the page with an empty list
        return render_template('wishlist.html', wishlist_items=[])

@app.route('/portfolio')
def portfolio_page():
    """Renders the Portfolio page."""
    return render_template('portfolio.html')

# --- API Routes (Existing) ---
@app.route('/api/news', methods=['GET'])
def get_news():
    ticker = request.args.get('ticker')
    if not ticker:
        return jsonify({"error": "Missing ticker parameter"}), 400
    
    today = date.today().strftime('%Y-%m-%d')
    one_week_ago = (date.today() - timedelta(days=7)).strftime('%Y-%m-%d')
    params = {"symbol": ticker.upper(), "from": one_week_ago, "to": today, "token": FINNHUB_API_KEY}

    try:
        response = requests.get(FINNHUB_NEWS_URL, params=params, timeout=10)
        response.raise_for_status()
        news_data = response.json()
        
        processed_news, total_score = [], 0.0
        for item in news_data:
            full_text = item.get('headline', '') + " " + item.get('summary', '')
            if full_text.strip():
                score = analyze_sentiment(full_text)
                total_score += score
                processed_news.append({"headline": item['headline'], "summary": item['summary'], "sentiment_score": score})
        
        num_news = len(processed_news)
        overall_score = total_score / num_news if num_news > 0 else 0.0

        if num_news > 0:
            try:
                with get_db_connection() as conn:
                    conn.execute("DELETE FROM history WHERE ticker = ? AND timestamp = ?", (ticker.upper(), today))
                    conn.execute("INSERT INTO history (ticker, score, timestamp) VALUES (?, ?, ?)", (ticker.upper(), overall_score, today))
                    conn.commit()
            except Exception as db_e:
                print(f"Database history update failed: {db_e}")
        
        return jsonify({"news": processed_news[:10], "overall_score": overall_score}), 200

    except Exception as e:
        return jsonify({"error": f"An error occurred: {str(e)}"}), 500

@app.route('/api/wishlist/add', methods=['POST'])
def add_to_wishlist():
    ticker = request.get_json().get('ticker')
    if not ticker:
        return jsonify({"error": "Ticker is required"}), 400
    try:
        with get_db_connection() as conn:
            conn.execute("INSERT INTO wishlist (ticker, timestamp) VALUES (?, ?)", (ticker.upper(), date.today().strftime('%Y-%m-%d')))
            conn.commit()
        return jsonify({"message": f"{ticker} added to wishlist"}), 201
    except sqlite3.IntegrityError:
        return jsonify({"error": f"{ticker} is already in the wishlist"}), 409
    except Exception as e:
        return jsonify({"error": f"Failed to add to wishlist: {str(e)}"}), 500

@app.route('/api/wishlist', methods=['GET'])
def get_wishlist():
    try:
        with get_db_connection() as conn:
            items = conn.execute("SELECT ticker FROM wishlist ORDER BY id DESC").fetchall()
            return jsonify({"wishlist": [item['ticker'] for item in items]}), 200
    except Exception as e:
        return jsonify({"error": f"Failed to retrieve wishlist: {str(e)}"}), 500

@app.route('/api/history', methods=['GET'])
def get_history():
    try:
        with get_db_connection() as conn:
            history = conn.execute("SELECT ticker, score, timestamp FROM history ORDER BY id DESC LIMIT 20").fetchall()
            return jsonify({"history": [dict(row) for row in history]}), 200
    except Exception as e:
        return jsonify({"error": f"Failed to retrieve history: {str(e)}"}), 500

# --- App Runner ---
if __name__ == '__main__':
    init_db()
    app.run(debug=True)