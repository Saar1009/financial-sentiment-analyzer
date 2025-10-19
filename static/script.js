// static/script.js

/**
 * Helper function to determine the color class and text based on sentiment score.
 * @param {number} score - The sentiment polarity score (-1.0 to 1.0).
 * @returns {{text: string, class: string}}
 */
function getSentimentInfo(score) {
    if (score > 0.1) {
        return { text: "Positive", class: "sentiment-positive" };
    } else if (score < -0.1) {
        return { text: "Negative", class: "sentiment-negative" };
    } else {
        return { text: "Neutral", class: "sentiment-neutral" };
    }
}

/**
 * Async function to perform sentiment analysis and display results.
 */
async function analyzeSentiment() {
    const tickerInput = document.getElementById('tickerInput');
    const ticker = tickerInput.value.trim().toUpperCase();
    const errorMessage = document.getElementById('error-message');
    const newsList = document.getElementById('news-list');
    const statusContainer = document.getElementById('status-container');
    const loadingIndicator = document.getElementById('loading-indicator');
    const analyzeButton = document.getElementById('analyzeButton');
    const initialMessage = document.getElementById('initial-message');
    const summaryCard = document.getElementById('summary-card');

    if (!ticker) {
        errorMessage.textContent = "Please enter a valid stock ticker.";
        errorMessage.classList.remove('hidden');
        return;
    }
    
    // Reset UI and enter loading state
    errorMessage.classList.add('hidden');
    initialMessage.classList.add('hidden');
    summaryCard.classList.add('hidden');
    newsList.innerHTML = '';
    
    loadingIndicator.classList.remove('hidden');
    analyzeButton.disabled = true;
    analyzeButton.textContent = 'Analyzing...';

    try {
        const response = await fetch(`/api/news?ticker=${ticker}`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to fetch data from the server.');
        }

        const newsItems = data.news;

        if (newsItems.length === 0) {
            errorMessage.textContent = `No relevant news found for ticker ${ticker}. Please check the symbol.`;
            errorMessage.classList.remove('hidden');
            initialMessage.classList.remove('hidden');
            return;
        }

        newsItems.forEach(item => {
            const score = item.sentiment_score;
            const info = getSentimentInfo(score);

            const newsCard = document.createElement('div');
            newsCard.className = 'border border-gray-200 p-4 rounded-lg hover:shadow-md transition duration-150 ease-in-out';
            newsCard.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <h3 class="text-lg font-semibold text-gray-900">${item.headline}</h3>
                    <span class="text-sm font-bold px-3 py-1 rounded-full whitespace-nowrap ${info.class} bg-opacity-10">${info.text}</span>
                </div>
                <p class="text-sm text-gray-600">${item.summary}</p>
                <p class="text-xs text-gray-400 mt-2">Score: ${score.toFixed(4)}</p>
            `;
            newsList.appendChild(newsCard);
        });

        const averageScore = data.overall_score;
        const avgInfo = getSentimentInfo(averageScore);

        document.getElementById('summary-ticker').textContent = ticker;
        document.getElementById('avg-score').textContent = averageScore.toFixed(4);
        document.getElementById('avg-sentiment-text').textContent = `(${avgInfo.text})`;
        document.getElementById('avg-sentiment-text').className = `text-xl font-bold ${avgInfo.class}`;
        
        summaryCard.classList.remove('hidden');

        // --- NEW: Wishlist Button Logic ---
        const wishlistButton = document.getElementById('wishlist-button');
        const currentWishlist = await fetchWishlist(); // Fetch and display the latest wishlist

        // Set the initial state of the heart button
        if (currentWishlist.includes(ticker)) {
            wishlistButton.classList.add('active');
        } else {
            wishlistButton.classList.remove('active');
        }

        // Add the click event listener for the heart button
        wishlistButton.onclick = async () => {
            // Prevent multiple clicks while request is in progress
            wishlistButton.disabled = true;
            try {
                const response = await fetch('/api/wishlist/add', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ticker: ticker })
                });

                if (response.ok) {
                    wishlistButton.classList.add('active'); // Make the heart active
                    await fetchWishlist(); // Refresh the displayed wishlist
                } else {
                    const errorData = await response.json();
                    console.warn("Could not add to wishlist:", errorData.error);
                }
            } catch (e) {
                console.error("Wishlist 'add' request failed:", e);
            } finally {
                wishlistButton.disabled = false; // Re-enable the button
            }
        };
        // --- End of Wishlist Logic ---

        fetchHistory().catch(e => console.error("History fetch failed:", e)); 

    } catch (e) {
        errorMessage.textContent = `An error occurred: ${e.message}`;
        errorMessage.classList.remove('hidden');
        initialMessage.classList.remove('hidden');
    } finally {
        loadingIndicator.classList.add('hidden');
        analyzeButton.disabled = false;
        analyzeButton.textContent = 'Analyze News';
    }
}

/**
 * Function to clear all displayed results and reset the application state.
 */
function clearResults() {
    const tickerInput = document.getElementById('tickerInput');
    const errorMessage = document.getElementById('error-message');
    const newsList = document.getElementById('news-list');
    const summaryCard = document.getElementById('summary-card');
    const initialMessage = document.getElementById('initial-message');

    tickerInput.value = '';
    errorMessage.classList.add('hidden');
    summaryCard.classList.add('hidden');
    newsList.innerHTML = '';
    initialMessage.classList.remove('hidden');

    fetchHistory().catch(e => console.error("History fetch failed during clear:", e));
    fetchWishlist().catch(e => console.error("Wishlist fetch failed during clear:", e));
}

/**
 * Async function to fetch and display search history.
 */
async function fetchHistory() {
    const historyList = document.getElementById('history-list');
    if (!historyList) return;
    
    historyList.innerHTML = '<p class="text-gray-500 text-center">Loading history...</p>';

    try {
        const response = await fetch('/api/history');
        const data = await response.json();

        if (!response.ok || data.error) {
            historyList.innerHTML = '<p class="text-red-500 text-center">Could not load search history.</p>';
            return;
        }

        const history = data.history;
        if (history.length === 0) {
            historyList.innerHTML = '<p class="text-gray-500 text-center">No previous searches found.</p>';
            return;
        }

        let tableHTML = `
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ticker</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
        `;

        history.forEach(item => {
            const info = getSentimentInfo(item.score);
            tableHTML += `
                <tr>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${item.ticker}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-bold ${info.class}">${item.score.toFixed(4)} (${info.text})</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${item.timestamp}</td>
                </tr>
            `;
        });

        tableHTML += `</tbody></table>`;
        historyList.innerHTML = tableHTML;
    } catch (error) {
        historyList.innerHTML = '<p class="text-red-500 text-center">Failed to load history.</p>';
    }
}

/**
 * Fetches the user's wishlist from the server and displays it.
 * @returns {Promise<string[]>} A promise that resolves to an array of tickers in the wishlist.
 */
async function fetchWishlist() {
    const wishlistDisplay = document.getElementById('wishlist-display');
    if (!wishlistDisplay) {
        return []; // Stop the function if the element doesn't exist
    }
    try {
        const response = await fetch('/api/wishlist');
        const data = await response.json();
        
        wishlistDisplay.innerHTML = ''; // Clear previous items
        
        const wishlist = data.wishlist || [];
        if (wishlist.length > 0) {
            wishlist.forEach(ticker => {
                const tickerPill = document.createElement('span');
                tickerPill.className = 'bg-red-100 text-red-800 text-sm font-semibold px-3 py-1 rounded-full cursor-pointer hover:bg-red-200';
                tickerPill.textContent = ticker;
                wishlistDisplay.appendChild(tickerPill);
            });
        } else {
            wishlistDisplay.innerHTML = '<p class="text-gray-500">Your wishlist is empty.</p>';
        }
        return wishlist; // Return the list for other functions to use
    } catch (error) {
        console.error("Failed to fetch wishlist:", error);
        wishlistDisplay.innerHTML = '<p class="text-red-500">Could not load wishlist.</p>';
        return []; // Return empty array on error
    }
}


// Attach event listeners when the document content is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('analyzeButton').addEventListener('click', analyzeSentiment);
    document.getElementById('clearButton').addEventListener('click', clearResults);
    document.getElementById('tickerInput').addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            analyzeSentiment();
        }
    });
    
    document.getElementById('error-message').classList.add('hidden');
    
    // Fetch initial data when the page loads
    fetchHistory().catch(e => console.error("Initial history fetch failed:", e));
    fetchWishlist().catch(e => console.error("Initial wishlist fetch failed:", e)); // <-- Added this line
});