# --- Imports ---
import os
import sqlite3
from flask import Flask, render_template, request, jsonify
import requests
from textblob import TextBlob
from datetime import date, timedelta
from typing import List, Dict, Any
import traceback

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
            conn.execute('''
                CREATE TABLE IF NOT EXISTS portfolio (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ticker TEXT NOT NULL UNIQUE,
                    quantity REAL NOT NULL,
                    purchase_price REAL NOT NULL,
                    target_price REAL,
                    stop_loss_price REAL,
                    sector TEXT
                )
            ''')
            conn.commit()
    except Exception as e:
        print(f"Error during database initialization: {e}")

# --- AI Logic ---
def analyze_sentiment(text: str) -> float:
    if not text: return 0.0
    return TextBlob(text).sentiment.polarity

# --- Page Routes ---
@app.route('/')
def home():
    """Renders the Home Page."""
    return render_template('index.html')

@app.route('/search')
def search():
    """Renders the Stock Search page, possibly with a pre-filled ticker."""
    # Check if a ticker was passed in the URL (e.g., /search?ticker=AAPL)
    ticker_to_search = request.args.get('ticker')
    
    # Pass this ticker to the template
    return render_template('search.html', auto_ticker=ticker_to_search)

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
    """Renders the Portfolio page with all saved stock data."""
    try:
        with get_db_connection() as conn:
            portfolio_items = conn.execute("SELECT * FROM portfolio ORDER BY ticker").fetchall()
            return render_template('portfolio.html', portfolio_items=portfolio_items)
    except Exception as e:
        print(f"Error fetching portfolio for page: {e}")
        return render_template('portfolio.html', portfolio_items=[])

@app.route('/history')
def history_page():
    """Renders the dedicated Search History page."""
    # We fetch page 1 by default, JS will handle other pages
    page = 1 
    limit = 10 
    offset = (page - 1) * limit

    try:
        with get_db_connection() as conn:
            total_items = conn.execute("SELECT COUNT(id) FROM history").fetchone()[0]
            total_pages = (total_items + limit - 1) // limit

            history_items = conn.execute(
                "SELECT ticker, score, timestamp FROM history ORDER BY id DESC LIMIT ? OFFSET ?",
                (limit, offset)
            ).fetchall()
            
            # Pass initial data to the template
            return render_template('history.html', 
                                   history_items=history_items,
                                   total_pages=total_pages,
                                   current_page=page)
    except Exception as e:
        print(f"Error fetching history for page: {e}")
        return render_template('history.html', history_items=[], total_pages=1, current_page=1)

# --- API Routes ---
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
            url = item.get('url', '#')  
            
            if full_text.strip():
                score = analyze_sentiment(full_text)
                total_score += score
                processed_news.append({
                    "headline": item.get('headline', 'No Headline'),
                    "summary": item.get('summary', 'No Summary'),
                    "sentiment_score": score,
                    "url": url  
                })
        
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

    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"API error: {e}"}), 500
    except Exception as e:
        return jsonify({"error": f"An unexpected error occurred: {str(e)}"}), 500

@app.route('/api/quote/<string:ticker>')
def get_quote(ticker):
    """Fetches the current price for a given ticker from Finnhub."""
    if not ticker:
        return jsonify({"error": "Ticker is required"}), 400
    
    try:
        quote_url = f"https://finnhub.io/api/v1/quote?symbol={ticker.upper()}&token={FINNHUB_API_KEY}"
        response = requests.get(quote_url, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        # The current price is in the 'c' key of the response
        current_price = data.get('c', 0)
        return jsonify({"ticker": ticker, "current_price": current_price})
        
    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"API error for {ticker}: {e}"}), 500
    except Exception as e:
        return jsonify({"error": f"An unexpected error occurred for {ticker}: {e}"}), 500

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

@app.route('/api/wishlist/delete/<string:ticker>', methods=['DELETE'])
def delete_from_wishlist(ticker):
    """Deletes a ticker from the wishlist."""
    if not ticker:
        return jsonify({"error": "Ticker is required"}), 400

    try:
        with get_db_connection() as conn:
            cursor = conn.execute("DELETE FROM wishlist WHERE ticker = ?", (ticker.upper(),))
            conn.commit()
            
            if cursor.rowcount > 0:
                return jsonify({"message": f"{ticker} was successfully deleted"}), 200
            else:
                return jsonify({"error": f"{ticker} not found in wishlist"}), 404
    except Exception as e:
        return jsonify({"error": f"Database error: {str(e)}"}), 500

@app.route('/api/compare', methods=['POST'])
def compare_stocks():
    data = request.get_json()
    tickers = data.get('tickers')

    if not tickers or len(tickers) < 2:
        return jsonify({"error": "At least two tickers are required for comparison"}), 400

    comparison_data = {}
    metric_definitions = {
        # Metric Name: [Finnhub Key, API Endpoint ('metric'/'quote'/'profile'), HigherIsBetter (True/False/None)]
        "Market Cap": ["marketCapitalization", 'profile', None], # From profile2 endpoint
        "Current Price": ["c", 'quote', None],
        "52 Week High": ["52WeekHigh", 'metric', None],
        "52 Week Low": ["52WeekLow", 'metric', None],
        "Revenue Per Share": ["revenuePerShareTTM", 'metric', True],
        "Gross Margin %": ["grossMarginTTM", 'metric', True],
        "Operating Margin %": ["operatingMarginTTM", 'metric', True],
        "EPS": ["epsBasicTTM", 'metric', True],
        "P/E Ratio": ["peTTM", 'metric', False], # Lower P/E is generally better
        "ROE %": ["roeTTM", 'metric', True],
        "Debt/Equity": ["totalDebt/totalEquity", 'metric', False], # Lower D/E is generally better
        "Dividend Yield %": ["dividendYieldIndicatedAnnual", 'metric', True],
        "Sector": ["finnhubIndustry", 'profile', None] # From profile2 endpoint
    }

    print(f"Starting comparison for: {tickers}") # Debug print

    # --- Step 1: Fetch data for each ticker ---
    for ticker in tickers:
        ticker = ticker.upper()
        comparison_data[ticker] = {}
        try:
            # Fetch basic metrics
            metric_url = f"https://finnhub.io/api/v1/stock/metric?symbol={ticker}&metric=all&token={FINNHUB_API_KEY}"
            metric_res = requests.get(metric_url, timeout=15)
            metric_res.raise_for_status()
            metric_data = metric_res.json().get('metric', {})

            # Fetch quote data (current price)
            quote_url = f"https://finnhub.io/api/v1/quote?symbol={ticker}&token={FINNHUB_API_KEY}"
            quote_res = requests.get(quote_url, timeout=10)
            quote_res.raise_for_status()
            quote_data = quote_res.json()

            # Fetch profile data (Market Cap, Sector)
            profile_url = f"https://finnhub.io/api/v1/stock/profile2?symbol={ticker}&token={FINNHUB_API_KEY}"
            profile_res = requests.get(profile_url, timeout=10)
            profile_res.raise_for_status()
            profile_data = profile_res.json()

            # Populate comparison_data for this ticker
            for name, (key, endpoint, _) in metric_definitions.items():
                value = None
                if endpoint == 'metric':
                    value = metric_data.get(key)
                elif endpoint == 'quote':
                    value = quote_data.get(key)
                elif endpoint == 'profile':
                    value = profile_data.get(key)
                
                # Special handling for Debt/Equity which involves calculation
                if name == "Debt/Equity" and metric_data.get('totalDebt') is not None and metric_data.get('totalEquity') is not None and metric_data.get('totalEquity') != 0:
                     value = metric_data.get('totalDebt') / metric_data.get('totalEquity')

                comparison_data[ticker][name] = round(value, 2) if isinstance(value, (int, float)) else value

            print(f"Successfully fetched data for {ticker}") # Debug print

        except Exception as e:
            print(f"ERROR fetching data for {ticker}: {e}")
            traceback.print_exc() # Print detailed error
            # Store None for all metrics if fetch fails for this ticker
            for name in metric_definitions.keys():
                comparison_data[ticker][name] = None

    # --- Step 2: Identify best/worst for each metric ---
    results = {"metrics": list(metric_definitions.keys()), "data": comparison_data, "ranking": {}}
    for metric_name, (_, _, higher_is_better) in metric_definitions.items():
        if higher_is_better is None: continue # Skip metrics we don't rank (like Sector, Price)

        valid_values = []
        for ticker in tickers:
            value = comparison_data[ticker].get(metric_name)
            if value is not None and isinstance(value, (int, float)):
                valid_values.append((value, ticker))
        
        if not valid_values: continue # Skip if no valid data for this metric

        valid_values.sort(key=lambda x: x[0], reverse=higher_is_better) # Sort based on value and rule

        results["ranking"][metric_name] = {
            "best": valid_values[0][1] if valid_values else None,
            "worst": valid_values[-1][1] if valid_values else None
        }
        
    print("Comparison analysis complete.") # Debug print
    return jsonify(results), 200

@app.route('/api/history', methods=['GET'])
def get_history():
    """Retrieves paginated search history entries."""
    # Get page number from query parameters, default to page 1
    page = request.args.get('page', 1, type=int)
    limit = 10 # Entries per page
    offset = (page - 1) * limit

    try:
        with get_db_connection() as conn:
            # Get total count for pagination calculation
            total_items = conn.execute("SELECT COUNT(id) FROM history").fetchone()[0]
            total_pages = (total_items + limit - 1) // limit # Calculate total pages

            # Fetch only the items for the current page
            history = conn.execute(
                "SELECT ticker, score, timestamp FROM history ORDER BY id DESC LIMIT ? OFFSET ?",
                (limit, offset)
            ).fetchall()

            history_list = [dict(row) for row in history]

            # Return data including pagination info
            return jsonify({
                "history": history_list,
                "total_pages": total_pages,
                "current_page": page
            }), 200
    except Exception as e:
        return jsonify({"error": f"Failed to retrieve history: {str(e)}"}), 500

@app.route('/api/portfolio/add', methods=['POST'])
def add_to_portfolio():
    """Adds a new stock holding to the portfolio."""
    data = request.get_json()
    ticker = data.get('ticker').upper()

    # --- Step 1: Fetch company sector from Finnhub ---
    sector = "N/A" # Default value
    try:
        profile_url = f"https://finnhub.io/api/v1/stock/profile2?symbol={ticker}&token={FINNHUB_API_KEY}"
        profile_res = requests.get(profile_url, timeout=10)
        profile_res.raise_for_status()
        profile_data = profile_res.json()
        if profile_data and profile_data.get('finnhubIndustry'):
            sector = profile_data['finnhubIndustry']
    except Exception as e:
        print(f"Could not fetch sector for {ticker}: {e}")

    # --- Step 2: Insert all data into the database ---
    try:
        with get_db_connection() as conn:
            conn.execute(
                """INSERT INTO portfolio (ticker, quantity, purchase_price, target_price, stop_loss_price, sector)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    ticker,
                    data.get('quantity'),
                    data.get('purchase_price'),
                    data.get('target_price'),
                    data.get('stop_loss_price'),
                    sector
                )
            )
            conn.commit()
        return jsonify({"message": f"{ticker} added to portfolio"}), 201
    except sqlite3.IntegrityError:
        return jsonify({"error": f"{ticker} is already in the portfolio"}), 409
    except Exception as e:
        return jsonify({"error": f"Database error: {str(e)}"}), 500

@app.route('/api/portfolio/delete/<string:ticker>', methods=['DELETE'])
def delete_from_portfolio(ticker):
    """Deletes a stock holding from the portfolio based on its ticker."""
    if not ticker:
        return jsonify({"error": "Ticker is required"}), 400

    try:
        with get_db_connection() as conn:
            # The cursor's rowcount will tell us if a row was actually deleted.
            cursor = conn.execute("DELETE FROM portfolio WHERE ticker = ?", (ticker.upper(),))
            conn.commit()
            
            if cursor.rowcount > 0:
                return jsonify({"message": f"{ticker} was successfully deleted"}), 200
            else:
                return jsonify({"error": f"{ticker} not found in portfolio"}), 404
    except Exception as e:
        return jsonify({"error": f"Database error: {str(e)}"}), 500

# --- App Runner ---
if __name__ == '__main__':
    init_db()
    app.run(debug=True)