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
            newsCard.className = 'font-news-card rounded-lg bg-slate-500 border border-slate-600 p-4 mb-4';
            newsCard.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <a href="${item.url}" target="_blank" rel="noopener noreferrer" class="hover:text-blue-600 transition duration-150">
                        <h3 class="text-lg font-semibold text-gray-900">${item.headline}</h3>
                    </a>
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

        // ---Wishlist Button Logic ---
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
 * Async function to fetch and display a specific page of search history.
 * @param {number} page - The page number to fetch (defaults to 1).
 */
async function fetchHistory(page = 1) {
    const historyList = document.getElementById('history-list');
    const paginationControls = document.getElementById('history-pagination');
    if (!historyList || !paginationControls) return; 
    
    historyList.innerHTML = '<p class="text-gray-500 text-center">Loading history...</p>';
    paginationControls.innerHTML = ''; 

    try {
        const response = await fetch(`/api/history?page=${page}`);
        const data = await response.json();

        if (!response.ok || data.error) {
            historyList.innerHTML = '<p class="text-red-500 text-center">Could not load search history.</p>';
            return;
        }

        const history = data.history;
        const totalPages = data.total_pages;
        const currentPage = data.current_page;

        // --- Build Table --- 
        if (history.length === 0) {
            historyList.innerHTML = '<p class="text-gray-300 text-center">No previous searches found.</p>';
            // No pagination needed if no history
        } else {
             // ** START: Make sure this section matches your previous code **
            let tableHTML = `
                <table class="min-w-full divide-y divide-slate-400"> <thead class="bg-slate-600"> <tr>
                            <th class="px-6 py-3 text-left text-base font-bold text-gray-100 border-r uppercase tracking-wider">Symbol</th>
                            <th class="px-6 py-3 text-left text-base font-bold text-gray-100 border-r uppercase tracking-wider">Score</th>
                            <th class="px-6 py-3 text-left text-base font-bold text-gray-100 uppercase tracking-wider">Date</th>
                        </tr>
                    </thead>
                    <tbody class="bg-slate-500 divide-y divide-slate-400"> 
            `;

            history.forEach(item => {
                const info = getSentimentInfo(item.score); // Assuming getSentimentInfo exists
                tableHTML += `
                    <tr>
                        <td class="px-6 py-4 whitespace-nowrap text-left text-md font-bold text-black">${item.ticker}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-base font-bold ${info.class}">${item.score.toFixed(4)} (${info.text})</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-black">${item.timestamp}</td>
                    </tr>
                `;
            });

            tableHTML += `</tbody></table>`;
            historyList.innerHTML = tableHTML;
             // ** END: Make sure this section matches your previous code **

            // --- Build Pagination Controls ---
            if (totalPages > 1) {
                // Previous Button
                const prevButton = document.createElement('button');
                prevButton.textContent = 'Previous';
                prevButton.className = 'px-4 py-2 bg-slate-600 text-gray-100 rounded hover:bg-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-opacity-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium';
                prevButton.disabled = currentPage === 1;
                prevButton.onclick = () => fetchHistory(currentPage - 1);
                paginationControls.appendChild(prevButton);

                // Page Indicator
                const pageInfo = document.createElement('span');
                pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
                pageInfo.className = 'text-sm text-gray-200 font-medium';
                paginationControls.appendChild(pageInfo);

                // Next Button
                const nextButton = document.createElement('button');
                nextButton.textContent = 'Next';
                nextButton.className = 'px-4 py-2 bg-slate-600 text-gray-100 rounded hover:bg-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-opacity-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium';
                nextButton.disabled = currentPage === totalPages;
                nextButton.onclick = () => fetchHistory(currentPage + 1);
                paginationControls.appendChild(nextButton);
            }
        } // End of else (history.length > 0)

    } catch (error) {
        console.error("Failed to fetch history:", error);
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

/**
 * Fetches current prices and calculates all dynamic portfolio values.
 */
/**
 * Fetches current prices and calculates ALL portfolio values (per-stock and total).
 */
async function fetchCurrentPrices() {
    const priceCells = document.querySelectorAll('.current-price');
    if (priceCells.length === 0) return;

    // --- 1. Initialize aggregators ---
    let totalPortfolioValue = 0;
    let totalPurchaseCost = 0;
    let sectorData = {}; // To store value by sector, e.g., {"Technology": 12000, "Finance": 5000}

    const requests = Array.from(priceCells).map(cell => {
        const ticker = cell.dataset.ticker;
        return fetch(`/api/quote/${ticker}`);
    });

    const responses = await Promise.all(requests);

    for (let i = 0; i < responses.length; i++) {
        const currentPriceCell = priceCells[i];
        const response = responses[i];
        const row = currentPriceCell.closest('tr');
        if (!row) continue;

        const holdingValueCell = row.querySelector('.holding-value');
        const profitLossCell = row.querySelector('.profit-loss');
        const targetCell = row.querySelector('.target-price');
        const stopLossCell = row.querySelector('.stop-loss-price');
        const sector = row.cells[1].textContent; // Get sector text from the 2nd cell

        if (response.ok) {
            const data = await response.json();
            const currentPrice = data.current_price;

            const quantity = parseFloat(row.dataset.quantity);
            const purchasePrice = parseFloat(row.dataset.purchasePrice);
            const targetPrice = parseFloat(targetCell.textContent.replace('$', ''));
            const stopLossPrice = parseFloat(stopLossCell.textContent.replace('$', ''));

            const holdingValue = quantity * currentPrice;
            const totalCostForThisStock = quantity * purchasePrice;
            const profitLoss = holdingValue - totalCostForThisStock;
            const profitLossPercent = (profitLoss / totalCostForThisStock) * 100;

            // --- 2. Update Per-Stock Cells (as before) ---
            currentPriceCell.textContent = `$${currentPrice.toFixed(2)}`;
            holdingValueCell.textContent = `$${holdingValue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
            profitLossCell.innerHTML = `<div>$${profitLoss.toFixed(2)}</div><div class="text-xs">(${profitLossPercent.toFixed(2)}%)</div>`;

            if (profitLoss > 0) profitLossCell.classList.add('text-green-400');
            else if (profitLoss < 0) profitLossCell.classList.add('text-red-400');

            if (!isNaN(targetPrice) && currentPrice >= targetPrice) targetCell.classList.add('text-green-400');
            if (!isNaN(stopLossPrice) && currentPrice <= stopLossPrice) stopLossCell.classList.add('text-red-400');

            // --- 3. Add data to aggregators ---
            totalPortfolioValue += holdingValue;
            totalPurchaseCost += totalCostForThisStock;

            // Add to sector data
            if (sectorData[sector]) {
                sectorData[sector] += holdingValue;
            } else {
                sectorData[sector] = holdingValue;
            }

        } else {
            // Handle failed price fetches
            currentPriceCell.textContent = 'N/A';
            holdingValueCell.textContent = 'N/A';
            profitLossCell.textContent = 'N/A';
        }
    }

    // --- 4. AFTER THE LOOP: Update the new Summary Dashboard ---
    const totalProfitLoss = totalPortfolioValue - totalPurchaseCost;
    const totalReturnPercent = (totalProfitLoss / totalPurchaseCost) * 100;

    const totalValueEl = document.getElementById('total-portfolio-value');
    const totalPlEl = document.getElementById('total-portfolio-pl');
    const totalReturnEl = document.getElementById('total-portfolio-return');

    if (totalValueEl) totalValueEl.textContent = `$${totalPortfolioValue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

    if (totalPlEl) {
        totalPlEl.textContent = `$${totalProfitLoss.toFixed(2)}`;
        if (totalProfitLoss > 0) totalPlEl.classList.add('text-green-400');
        else if (totalProfitLoss < 0) totalPlEl.classList.add('text-red-400');
    }

    if (totalReturnEl) {
        totalReturnEl.textContent = `${totalReturnPercent.toFixed(2)}%`;
        if (totalReturnPercent > 0) totalReturnEl.classList.add('text-green-400');
        else if (totalReturnPercent < 0) totalReturnEl.classList.add('text-red-400');
    }

    // --- 5. Draw the Chart ---
    drawSectorChart(sectorData);
}

/**
 * Draws the sector allocation pie chart.
 * @param {Object} sectorData - An object where keys are sectors and values are their total value.
 */
function drawSectorChart(sectorData) {
    const ctx = document.getElementById('sectorPieChart');
    if (!ctx) return;

    // Destroy existing chart if it exists, to prevent flickering on reload
    if (ctx.chart) {
        ctx.chart.destroy();
    }

    const labels = Object.keys(sectorData);
    const data = Object.values(sectorData);

    // A pre-defined, high-contrast palette of 12 colors (11 GICS sectors + "Other")
const colors = [
    '#3b82f6', // 1. Blue (e.g., Information Technology)
    '#10b981', // 2. Green (e.g., Health Care)
    '#ef4444', // 3. Red (e.g., Financials)
    '#f97316', // 4. Orange (e.g., Consumer Discretionary)
    '#6b7280', // 5. Gray (e.g., Communication Services)
    '#a855f7', // 6. Purple (e.g., Industrials)
    '#06b6d4', // 7. Cyan (e.g., Consumer Staples)
    '#eab308', // 8. Yellow (e.g., Energy)
    '#d946ef', // 9. Fuchsia (e.g., Utilities)
    '#14b8a6', // 10. Teal (e.g., Real Estate)
    '#84cc16', // 11. Lime (e.g., Materials)
    '#ca8a04'  // 12. Dark Yellow (for Other)
];
    ctx.chart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                label: 'Portfolio Value',
                data: data,
                backgroundColor: colors,
                borderColor: '#475569',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#cbd5e1'
                    }
                },
                tooltip: {
                    bodyColor: '#e2e8f0', // Sets tooltip body text color (slate-200)
                    titleColor: '#ffffff', // Sets tooltip title text color (white)
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            let value = context.parsed;
                            let total = context.chart.getDatasetMeta(0).total;
                            let percentage = ((value / total) * 100).toFixed(2);
                            return `${label}: $${value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Fetches comparison data from the server and builds the comparison table.
 * @param {string[]} tickers - An array of stock tickers to compare.
 */
async function fetchComparisonData(tickers) {
    const comparisonResultsDiv = document.getElementById('comparison-results');
    const comparisonTableContainer = document.getElementById('comparison-table-container');

    // Show loading state
    comparisonResultsDiv.classList.remove('hidden');
    comparisonTableContainer.innerHTML = '<p class="text-center text-gray-500 py-8">Fetching comparison data...</p>';

    try {
        const response = await fetch('/api/compare', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tickers: tickers })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Server responded with an error');
        }

        const results = await response.json();
        const metrics = results.metrics;
        const data = results.data;
        const ranking = results.ranking;

        // --- Build the HTML Table ---
        let tableHTML = `
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-slate-600">
                    <tr>
                        <th class="px-4 py-3 text-left text-large font-bold text-black uppercase tracking-wider">Metric</th>
        `;
        // Add table headers for each ticker
        tickers.forEach(ticker => {
            tableHTML += `<th class="px-4 py-3 text-left text-large font-semibold text-black uppercase tracking-wider">${ticker}</th>`;
        });
        tableHTML += `</tr></thead><tbody class="bg-slate-500 divide-y divide-gray-200">`;

        // Add table rows for each metric
        metrics.forEach(metric => {
            tableHTML += `<tr><td class="w-1/4 px-4 py-3 whitespace-nowrap font-medium text-gray-100 text-left border-r border-slate-600">${metric}</td>`;
            
            tickers.forEach(ticker => {
                const value = data[ticker]?.[metric];
                let displayValue = 'No Data';
                let cellClass = 'text-gray-700'; // Default text color

                // Format the value nicely
                if (value !== null && value !== undefined) {
            if (typeof value === 'number') {
                // Base number formatted (will be overwritten for Market Cap/%)
                const numberPart = value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
                let unitPart = ''; // Will hold 'M', 'B', 'T', '%' or '$'

                // Determine unit and create styled span
                if (metric.includes('%')) {
                    unitPart = `<span class="font-semibold ml-1">%</span>`;
                    displayValue = numberPart + unitPart;
                } else if (metric === 'Market Cap') {
                    // Correctly format Market Cap (value is in Millions from Finnhub)
                    // Includes your Trillion check!
                    let numberVal = value;
                    let unitLetter = '';
                    if (value >= 1000000) { // Trillions (1,000,000 Millions)
                        numberVal = value / 1000000;
                        unitLetter = 'T';
                    } else if (value >= 1000) { // Billions (1,000 Millions)
                        numberVal = value / 1000;
                        unitLetter = 'B';
                    } else { // Millions
                        unitLetter = 'M';
                    }
                    unitPart = `<span class="font-semibold ml-1">${unitLetter}</span>`;
                    displayValue = '$' + numberVal.toFixed(2) + unitPart;
                } else if (['Current Price', '52 Week High', '52 Week Low'].includes(metric)) {
                    // Add dollar sign for prices, no unit
                    displayValue = '$' + numberPart;
                }
                 else {
                    // Default number formatting (e.g., P/E Ratio, EPS)
                     displayValue = numberPart;
                }
            } else {
                 // Handle non-numeric values (like Sector) or explicitly set No Data
                 displayValue = value ? value : 'No Data'; // Use 'No Data' if value is empty/null
            }
        } else {
             displayValue = 'No Data'; // Use 'No Data' if value is null/undefined
        }

                // Apply ranking colors
                const rankInfo = ranking[metric];
                if (rankInfo) {
                    if (ticker === rankInfo.best) {
                        cellClass = 'text-green-400 font-bold'; // Best value
                    } else if (ticker === rankInfo.worst) {
                        cellClass = 'text-red-400 font-bold'; // Worst value
                    }
                }
                
                tableHTML += `<td class="px-6 py-4 whitespace-nowrap text-left ${cellClass}">${displayValue}</td>`;
            });
            tableHTML += `</tr>`;
        });

        tableHTML += `</tbody></table>`;
        comparisonTableContainer.innerHTML = tableHTML;

    } catch (error) {
        console.error("Comparison failed:", error);
        comparisonTableContainer.innerHTML = `<p class="text-center text-red-500 py-4">Error loading comparison: ${error.message}</p>`;
    }
}

// Attach event listeners when the document content is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // --- Declarations ---
    const analyzeButton = document.getElementById('analyzeButton');
    const clearButton = document.getElementById('clearButton');
    const tickerInput = document.getElementById('tickerInput');
    const portfolioForm = document.getElementById('add-portfolio-form');
    const portfolioTableBody = document.getElementById('portfolio-tbody');
    const wishlistContainer = document.getElementById('wishlist-container');
    const compareButton = document.getElementById('compare-button');
    const selectedCountSpan = document.getElementById('selected-count');
    const comparisonResultsDiv = document.getElementById('comparison-results');
    const comparisonTableContainer = document.getElementById('comparison-table-container');
    const urlParams = new URLSearchParams(window.location.search);
    const autoTicker = urlParams.get('ticker');

    // --- Logic for Wishlist Comparison ---
    if (wishlistContainer && compareButton && selectedCountSpan) {
        let selectedTickers = [];

        // Listen for changes on any checkbox within the wishlist container
        wishlistContainer.addEventListener('change', (event) => {
            if (event.target.classList.contains('wishlist-checkbox')) {
                // Get all checked checkboxes
                const checkedBoxes = wishlistContainer.querySelectorAll('.wishlist-checkbox:checked');
                selectedTickers = Array.from(checkedBoxes).map(checkbox => checkbox.value);

                // Update the count display
                selectedCountSpan.textContent = selectedTickers.length;

                // Enable/disable and show/hide the compare button
                if (selectedTickers.length >= 2) {
                    compareButton.disabled = false;
                    compareButton.classList.remove('bg-gray-400', 'text-gray-700', 'cursor-not-allowed', 'opacity-50'); // Remove disabled styles
                    compareButton.classList.add('bg-green-500', 'text-white', 'hover:bg-green-600'); // Add enabled styles
                    } else {
                        compareButton.disabled = true;
                        compareButton.classList.remove('bg-green-500', 'text-white', 'hover:bg-green-600'); // Remove enabled styles
                        compareButton.classList.add('bg-gray-400', 'text-gray-700', 'cursor-not-allowed', 'opacity-50'); // Add disabled styles
                    }
            }
        });

        // Add listener for the compare button click
        compareButton.addEventListener('click', () => {
            if (selectedTickers.length >= 2) {
                // Call the function to fetch and display comparison data
                fetchComparisonData(selectedTickers);
            }
        });
    }
    // --- End of Wishlist Comparison Logic ---

    // Auto-analyze logic ---
    if (autoTicker && tickerInput) {
        tickerInput.value = autoTicker; // Put the ticker in the input box
        analyzeSentiment(); // Run the analysis automatically
    }

    // --- Logic for the Search Page ---
    if (analyzeButton && clearButton && tickerInput) {
        analyzeButton.addEventListener('click', analyzeSentiment);
        clearButton.addEventListener('click', clearResults);
        tickerInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                analyzeSentiment();
            }
        });
    }
    
    // --- Logic for Deleting from Wishlist ---
    if (wishlistContainer) {
        wishlistContainer.addEventListener('click', async (event) => {
            const removeButton = event.target.closest('.wishlist-remove-btn');
            
            if (removeButton) {
                const ticker = removeButton.dataset.ticker;
                
                if (confirm(`Are you sure you want to remove ${ticker} from your wishlist?`)) {
                    try {
                        const response = await fetch(`/api/wishlist/delete/${ticker}`, {
                            method: 'DELETE',
                        });
                        
                        if (response.ok) {
                            location.reload(); // Reload the page to show the updated list
                        } else {
                            const errorData = await response.json();
                            alert(`Error: ${errorData.error}`);
                        }
                    } catch (e) {
                        alert('An unexpected error occurred.');
                    }
                }
            }
        });
    }

    // --- Logic for the Portfolio Page Form ---
    if (portfolioForm) {
        portfolioForm.addEventListener('submit', async (event) => {
            event.preventDefault(); // Prevent default page reload

            const data = {
                ticker: document.getElementById('p-ticker').value,
                quantity: document.getElementById('p-quantity').value,
                purchase_price: document.getElementById('p-purchase-price').value,
                target_price: document.getElementById('p-target-price').value || null,
                stop_loss_price: document.getElementById('p-stop-loss-price').value || null,
            };

            const response = await fetch('/api/portfolio/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            if (response.ok) {
                location.reload(); // Reload the page to show the new entry
            } else {
                const errorData = await response.json();
                const portfolioError = document.getElementById('portfolio-error');
                if(portfolioError) portfolioError.textContent = `Error: ${errorData.error}`;
            }
        });
    }

    // --- Logic for Deleting from Portfolio ---
    if (portfolioTableBody) {
        portfolioTableBody.addEventListener('click', async (event) => {
            const deleteButton = event.target.closest('.delete-btn');
            if (deleteButton) {
                const ticker = deleteButton.dataset.ticker;
                if (confirm(`Are you sure you want to delete ${ticker} from your portfolio?`)) {
                    try {
                        const response = await fetch(`/api/portfolio/delete/${ticker}`, {
                            method: 'DELETE',
                        });
                        if (response.ok) {
                            location.reload();
                        } else {
                            const errorData = await response.json();
                            alert(`Error: ${errorData.error}`);
                        }
                    } catch (e) {
                        alert('An unexpected error occurred. Please try again.');
                    }
                }
            }
        });
    }    

    // --- General functions to run on page load ---
    fetchHistory().catch(e => console.error("Initial history fetch failed:", e));
    fetchWishlist().catch(e => console.error("Initial wishlist fetch failed:", e));

    // Fetch live prices but only if the portfolio table exists on the page
    if (portfolioTableBody) {
        fetchCurrentPrices().catch(e => console.error("Error fetching current prices:", e));
    }
});
