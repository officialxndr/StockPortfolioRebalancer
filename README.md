Nested Portfolio Rebalancer

This is a web-based tool for managing and visualizing nested investment portfolios. This application allows you to create top-level categories (or 'pies') and allocate specific holdings within them. All percentages automatically rebalance as you make adjustments, giving you a powerful way to model your asset allocation.

Your portfolio is automatically saved to your browser's local storage, so your data persists between sessions.

🚀 Live Demo

You can view a live demo of this project hosted on GitHub Pages:
https://officialxndr.github.io/StockPortfolioRebalancer/

✨ Features

 Nested Structure: Create top-level 'pies' (e.g., 'Stocks', 'Real Estate') and add nested 'holdings' (e.g., 'AAPL', 'VTI') within each pie.
 Automatic Rebalancing: Adjust the target percentage of any item, and all other unlocked items in the same category will automatically rebalance to maintain a 100% total.
 Lock Allocations: Lock the percentage of any pie or holding to prevent it from being changed during rebalancing.
 CSV Import: Import your current portfolio positions directly from a Fidelity CSV export.
 Interactive Chart: Visualize your portfolio with an interactive doughnut chart (powered by Chart.js) that can toggle between top-level pies and sub-allocations.
 Investment Preview: An 'Overview' tab calculates the dollar amount for each holding based on a total investment amount.
 Persistent Storage: Automatically saves your entire portfolio setup in the browser's `localStorage`.
 Dark/Light Mode: Includes a theme-switcher for user comfort.

🛠️ How to Use

1.  Import (Optional): Go to the Import CSV tab to upload a Fidelity portfolio file. This will populate your categories and holdings.
2.  Create Pies: Go to the Pies & Controls tab. Click "+ Add New Pie" to create a top-level category (e.g., "US Stocks").
3.  Adjust Pies: Use the slider for your new pie to set its target percentage of your total portfolio.
4.  Add Holdings: Click "View Holdings" on a pie to manage its sub-allocations. Use "+ Add Holding" to add individual assets (e.g., "VTI").
5.  Adjust Holdings: Use the sliders for each holding to set its target percentage within that pie.
6.  Preview: Go to the Overview & Preview tab, enter a total investment amount, and see a full dollar-based breakdown of your entire portfolio.

## 💻 Local Development

You have two main options for running this project locally.

### Option 1: Simple Browser
Since this is a static site (HTML, CSS, JavaScript), you can just open the `index.html` file directly in your web browser.

### Option 2: Docker Compose
This repository includes a `Dockerfile` and a `docker-compose.yml` file to serve the site using Nginx, which is a more realistic way to test a web application.
```
services:
  portfolio-rebalancer:
    container_name: portfolio-rebalancer-app
    image: officialxndr/portfolio-rebalancer:latest
    ports:
      - '18673:80'
    restart: unless-stopped
version: '3.8'
```

