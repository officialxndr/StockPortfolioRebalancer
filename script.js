// --- DOM Elements ---

const piesList = document.getElementById('piesList');
const subHoldingsControls = document.getElementById('subHoldingsControls');
const addPieBtn = document.getElementById('addPieBtn');
const totalPercentageDisplay = document.getElementById('totalPercentageDisplay');

const overviewDetails = document.getElementById('overviewDetails');
const spendAmountInput = document.getElementById('spendAmount');
const linkedSpendAmountInput = document.getElementById('linkedSpendAmount'); 
const chartToggleBtn = document.getElementById('chartToggleBtn');
const darkModeToggle = document.getElementById('darkModeToggle');
const startOverBtn = document.getElementById('startOverBtn');

let pieChart; // Chart.js instance
let activePieIndex = 0; // Index of the currently selected pie for sub-holding controls
let currentChartView = 'top'; // 'top' or 'sub'

// --- Data Persistence & Structure ---

function savePortfolio() {
    localStorage.setItem('portfolioData', JSON.stringify(portfolio));
    localStorage.setItem('investmentAmount', linkedSpendAmountInput.value);
}

function loadPortfolio() {
    const data = localStorage.getItem('portfolioData');
    if (data) {
        // Load data, but ensure 'locked' property exists for compatibility
        const loadedData = JSON.parse(data);
        loadedData.forEach(pie => {
            if (pie.locked === undefined) pie.locked = false;
            if (pie.holdings) {
                pie.holdings.forEach(holding => {
                    if (holding.locked === undefined) holding.locked = false;
                });
            }
        });
        return loadedData;
    }
        // Return an empty array for a blank slate by default
    return [];
}

let portfolio = loadPortfolio();

// --- Core Rebalancing Logic (Lock-Aware and Fixed) ---

function getCurrentArray(path) {
    if (path.length === 1) {
        return portfolio; // Top-level pies
    } else if (path.length === 2) {
        return portfolio[path[0]].holdings; // Holdings inside a pie
    }
    return [];
}

/**
 * Rebalances the array by distributing the change (up or down)
 * only among UNLOCKED items, respecting the 0% floor and 100% total.
 */
function rebalanceArray(array, changedIndex, newTarget) {
    if (array.length === 0) return;
    if (array.length === 1) {
        array[0].target = 100;
        return;
    }

    const changedItem = array[changedIndex];
    
    // --- 1. Handle Locked Item Movement (Capping) ---
    if (changedItem.locked) {
        // Calculate the sum of all *other* items
        const sumOfOthers = array
            .filter((_, i) => i !== changedIndex)
            .reduce((sum, item) => sum + item.target, 0);

        // The maximum allowed target for the changed item is 100 minus the sum of others.
        const maxAllowed = Math.max(0, 100 - sumOfOthers);

        // Set the target, capped at the max allowed
        changedItem.target = Math.min(newTarget, maxAllowed);
        return; 
    }
    
    // --- 2. Handle Unlocked Item Movement (Proportional Rebalance) ---

    // Identify the pool of items available to share the adjustment (unlocked items excluding the changed one)
    const sharers = array.filter(item => !item.locked && item !== changedItem);
    const sharersCount = sharers.length;

    // Calculate the total percentage of the fixed pool (locked items)
    const lockedTotal = array
        .filter(item => item.locked)
        .reduce((sum, item) => sum + item.target, 0);

    // The maximum possible target for the changed item, leaving 0% for sharers
    const maxTarget = 100 - lockedTotal;
    
    // Set the changed item's target, capped at the max possible
    changedItem.target = Math.min(newTarget, maxTarget);

    // If there are no sharers, the changed item is the only one in the unlocked pool.
    if (sharersCount === 0) {
        // We already capped it above, so the total should be 100%.
        return;
    }

    // The required percentage remaining for all sharers combined
    let requiredSharersTotal = 100 - lockedTotal - changedItem.target;
    
    // Calculate the total of all sharers *before* this change
    const originalSharersTotal = sharers.reduce((sum, item) => sum + item.target, 0);

    if (originalSharersTotal === 0) {
        // If sharers were all at 0%, just distribute requiredSharersTotal equally
        let equalShare = requiredSharersTotal / sharersCount;
        sharers.forEach(item => item.target = Math.max(0, equalShare));
    } else {
        // Distribute the required percentage proportionally based on their current weights
        sharers.forEach(item => {
            const ratio = item.target / originalSharersTotal;
            let newTargetValue = ratio * requiredSharersTotal;
            item.target = Math.max(0, newTargetValue);
        });
    }

    // --- 3. Final Rounding and Error Correction ---
    
    let finalSum = 0;
    // Round all targets in the array
    array.forEach(item => {
        item.target = Math.round(item.target);
        finalSum += item.target;
    });

    // Final check and distribution of rounding errors to ensure 100%
    const error = 100 - finalSum;
    if (error !== 0) {
        // Prioritize putting the rounding error on the largest sharer
        let largestSharer = sharers.reduce((a, b) => a.target > b.target ? a : b);
        
        // If the changed item is the only unlocked item, put the error there
        if (sharersCount === 0 && !changedItem.locked) {
            changedItem.target = Math.max(0, changedItem.target + error);
        }
        
        // If there are sharers, apply error to the largest sharer
        else if (sharersCount > 0) {
            largestSharer.target = Math.max(0, largestSharer.target + error);
        }
    }
}


// --- Rendering and View Updates ---

function getRandomColor() {
    return '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
}

function updateChart() {
    const ctx = document.getElementById('portfolioPieChart').getContext('2d');

    // **FIX**: Always destroy the previous chart instance before drawing a new one.
    if (pieChart) {
        pieChart.destroy();
        pieChart = null;
    }

    // If portfolio is empty, show a message and stop.
    if (portfolio.length === 0) {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-color-secondary');
        ctx.font = '16px Arial';
        ctx.fillText('No categories yet. Add a pie to see the chart.', ctx.canvas.width / 2, ctx.canvas.height / 2);
        ctx.restore();
        chartToggleBtn.textContent = 'View Sub-Allocations (N/A)';
        return;
    }

    const activePie = portfolio[activePieIndex];
    let labels, data, colors;

    if (currentChartView === 'top' || !activePie) {
        labels = portfolio.map(p => `${p.name} (${p.target}%)`);
        data = portfolio.map(p => p.target);
        colors = portfolio.map(p => p.color);
        chartToggleBtn.textContent = `View Sub-Allocations (${activePie ? activePie.name : 'N/A'})`;
    } else {
        labels = activePie.holdings.map(h => `${h.name} (${h.target}%)`);
        data = activePie.holdings.map(h => h.target);
        colors = activePie.holdings.map(h => h.color);
        chartToggleBtn.textContent = `View Top-Level Pies`;
    }
    
    // Create a new chart instance.
    pieChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: colors, hoverOffset: 8 }] },
        options: { responsive: true, plugins: { legend: { position: 'right' } } }
    });
}

/**
 * Renders the pies and holdings controls. Uses a partial update for smooth dragging.
 * FIX: Only forces full re-render of sub-holdings on non-live updates or when the parent pie changes.
 */
function renderPiesAndHoldings(isLiveUpdate = false, changedPath = null) {
    const totalInvestment = parseFloat(linkedSpendAmountInput.value) || 0;
    
    // --- 1. Render Top-Level Pies ---
    if (!isLiveUpdate) {
        piesList.innerHTML = ''; 
    }
    
    portfolio.forEach((pie, pieIndex) => {
        const pieAmount = (pie.target / 100) * totalInvestment;
        const amountDisplay = `\$${pieAmount.toFixed(2)}`;
        const isCurrentItem = changedPath && changedPath.length === 1 && changedPath[0] === pieIndex;

        let item = piesList.querySelector(`.pie-item[data-index="${pieIndex}"]`);
        
        // --- Button HTML Templates (Includes Lock Button) ---
        const lockIcon = pie.locked ? '🔒' : '🔓';
        const lockClass = pie.locked ? 'locked-btn' : 'unlocked-btn';
        const lockPieBtnHtml = `<button class="lock-item-btn action-button ${lockClass}" data-path="${pieIndex}">${lockIcon}</button>`;
        
        const removePieBtnHtml = `<button class="remove-item-btn action-button" data-path="${pieIndex}">Remove</button>`;
        const viewHoldingsBtnHtml = `<button class="select-pie-btn action-button" data-index="${pieIndex}">View Holdings</button>`;
        const clearHoldingsBtnHtml = `<button class="clear-holdings-btn action-button" data-path="${pieIndex}">Clear</button>`;
        
        const buttonsHtml = `${lockPieBtnHtml}${clearHoldingsBtnHtml}${removePieBtnHtml}${viewHoldingsBtnHtml}`;
        
        if (isLiveUpdate && item) {
             const percentageEl = item.querySelector('.percentage-display');
             
             percentageEl.childNodes[0].nodeValue = `${pie.target}% `;
             const amountSpan = percentageEl.querySelector('span');
             if(amountSpan) amountSpan.textContent = `(${amountDisplay})`;
             
             if (!isCurrentItem) {
                 const slider = item.querySelector('.target-slider');
                 if(slider) slider.value = pie.target;
             }
             
             item.classList.toggle('active-pie', pieIndex === activePieIndex);
             
        } else if (!isLiveUpdate || !item) {
            item = document.createElement('div');
            item.className = 'pie-item';
            item.setAttribute('data-index', pieIndex); 
            
            item.classList.toggle('active-pie', pieIndex === activePieIndex);
            
            item.innerHTML = `
                <div class="item-header">
                    <div class="item-details">
                        <input type="text" value="${pie.name}" data-path="${pieIndex}" class="pie-name-input styled-input" ${pie.locked ? 'disabled' : ''}>
                    </div>
                                                            <div class="percentage-display">
                        ${pie.target}% <span style="margin-left: 5px;">(${amountDisplay})</span>
                        ${buttonsHtml}
                    </div>
                </div>
                <input type="range" min="0" max="100" value="${pie.target}" data-path="${pieIndex}" class="target-slider" ${pie.locked ? 'disabled' : ''}>
            `;
            if (!isLiveUpdate) piesList.appendChild(item);
        }
    });

    // --- 2. Render Sub-Holdings of the Active Pie ---
    const activePie = portfolio[activePieIndex];
    if (activePie) {
        if (!isLiveUpdate) {
            subHoldingsControls.innerHTML = `
                <h3>Holdings in: ${activePie.name} (must total 100%)</h3>
                <div id="activeHoldingsList"></div>
                <button id="addHoldingBtn" class="add-button" data-pie-index="${activePieIndex}">+ Add Holding to ${activePie.name}</button>
            `;
        }
        
        const activeHoldingsList = document.getElementById('activeHoldingsList');
        if (!activeHoldingsList) return;
        
        const needsFullHoldingRender = !isLiveUpdate || (changedPath && changedPath.length === 1);
        
        if (needsFullHoldingRender) {
             activeHoldingsList.innerHTML = '';
        }

        activePie.holdings.forEach((holding, holdingIndex) => {
            const pieAmount = (activePie.target / 100) * totalInvestment;
            const finalAmount = (holding.target / 100) * pieAmount;
            const amountDisplay = `\$${finalAmount.toFixed(2)}`;

            let item = activeHoldingsList.querySelector(`.holding-item[data-index="${holdingIndex}"]`);
            const isCurrentHolding = changedPath && changedPath.length === 2 && changedPath[0] === activePieIndex && changedPath[1] === holdingIndex;
            
            const lockIcon = holding.locked ? '🔒' : '🔓';
            const lockClass = holding.locked ? 'locked-btn' : 'unlocked-btn';
            const lockHoldingBtnHtml = `<button class="lock-item-btn action-button ${lockClass}" data-path="${activePieIndex}-${holdingIndex}">${lockIcon}</button>`;
            
            const removeHoldingBtnHtml = `<button class="remove-item-btn action-button" data-path="${activePieIndex}-${holdingIndex}">Remove</button>`;
            
            const buttonsHtml = `${lockHoldingBtnHtml}${removeHoldingBtnHtml}`;

            if (isLiveUpdate && item && !needsFullHoldingRender) {
                const percentageEl = item.querySelector('.percentage-display');
                
                percentageEl.childNodes[0].nodeValue = `${holding.target}% `;
                const amountSpan = percentageEl.querySelector('span');
                if(amountSpan) amountSpan.textContent = `(${amountDisplay})`;

                if (!isCurrentHolding) {
                    const slider = item.querySelector('.target-slider');
                    if(slider) slider.value = holding.target;
                }

            } else if (needsFullHoldingRender || !item) {
                item = document.createElement('div');
                item.className = 'holding-item';
                item.setAttribute('data-index', holdingIndex); 
                item.innerHTML = `
                    <div class="item-header">
                        <div class="item-details">
                            <input type="text" value="${holding.name}" data-path="${activePieIndex}-${holdingIndex}" class="holding-name-input styled-input" placeholder="Holding Name" ${holding.locked ? 'disabled' : ''}>
                            <input type="text" value="${holding.description || ''}" data-path="${activePieIndex}-${holdingIndex}" class="holding-description-input styled-input" placeholder="Add notes here" ${holding.locked ? 'disabled' : ''}>
                        </div>
                                                                        <div class="percentage-display">
                            ${holding.target}% <span style="margin-left: 5px;">(${amountDisplay})</span>
                            ${buttonsHtml}
                        </div>
                    </div>
                    <input type="range" min="0" max="100" value="${holding.target}" data-path="${activePieIndex}-${holdingIndex}" class="target-slider" ${holding.locked ? 'disabled' : ''}>
                `;
                activeHoldingsList.appendChild(item);
            }
        });
    } else {
        subHoldingsControls.innerHTML = `<p>Add a new pie to see sub-allocations.</p>`;
    }

    const total = portfolio.reduce((sum, p) => sum + p.target, 0);
    totalPercentageDisplay.textContent = `Total Target: ${total}%`;
    totalPercentageDisplay.style.color = total === 100 ? 'var(--success-color)' : 'var(--danger-color)';
    
    attachEventListeners();
}

function calculateAndRenderOverview() {
    const spendAmount = parseFloat(spendAmountInput.value) || 0;
    let html = `<h3>Top-Level Allocation (Total Spend: \$${spendAmount.toFixed(2)})</h3>`;

    portfolio.forEach(pie => {
        const pieAmount = (pie.target / 100) * spendAmount;

        html += `<div class="pie-summary">
            <h4>
                <span>${pie.name} (${pie.target}%)</span>
                <span style="font-weight: normal;">\$${pieAmount.toFixed(2)}</span>
            </h4>
            <ul>`;
        
        if (pie.holdings && pie.holdings.length > 0) {
            pie.holdings.forEach(holding => {
                const holdingWeightOfPie = holding.target / 100;
                const finalAmount = holdingWeightOfPie * pieAmount;
                const description = holding.description ? ` (${holding.description})` : '';

                html += `<li>
                    <span class="details">
                        <strong>${holding.name}</strong>
                        | Target: ${holding.target}% (of ${pie.name}) ${description}
                    </span>
                    <span class="final-amount">\$${finalAmount.toFixed(2)}</span>
                </li>`;
            });
        }
        html += '</ul></div>';
    });

    overviewDetails.innerHTML = html;
}

// --- Event Listeners and Handlers ---

function attachEventListeners() {
    // 1. Slider Listeners
    document.querySelectorAll('.target-slider').forEach(slider => {
        
        slider.oninput = (e) => {
            e.stopPropagation(); 
            
            const path = e.target.dataset.path.split('-').map(Number);
            const changedIndex = path[path.length - 1];
            const newTarget = parseInt(e.target.value);
            
            const arrayToRebalance = getCurrentArray(path);
            rebalanceArray(arrayToRebalance, changedIndex, newTarget);
            
            // Forcing a full render for sub-holdings (path.length === 2) 
            // is handled by the logic inside renderPiesAndHoldings now.
            renderPiesAndHoldings(true, path); 
            updateChart();
        };

        slider.onchange = (e) => {
            savePortfolio();
        };
    });

    // 2. Name Change Listener
     document.querySelectorAll('.pie-name-input, .holding-name-input').forEach(input => {
        input.onchange = (e) => {
            e.stopPropagation(); 
            
            const path = e.target.dataset.path.split('-').map(Number);
            const item = getCurrentArray(path)[path[path.length - 1]];
            item.name = e.target.value;
            renderPiesAndHoldings();
            updateChart();
            savePortfolio();
        };
        input.onclick = (e) => {
             e.stopPropagation();
        }
    });
    
    // 3. Description Change Listener
     document.querySelectorAll('.holding-description-input').forEach(input => {
        input.onchange = (e) => {
            e.stopPropagation(); 
            
            const path = e.target.dataset.path.split('-').map(Number);
            const holding = portfolio[path[0]].holdings[path[1]];
            holding.description = e.target.value;
            calculateAndRenderOverview();
            savePortfolio();
        };
                        input.onclick = (e) => {
             e.stopPropagation();
        }
    });

    // 4. Remove Button Listener
    document.querySelectorAll('.remove-item-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation(); 

            const path = e.target.dataset.path.split('-').map(Number);
            const arrayToRebalance = getCurrentArray(path);
            const removedIndex = path[path.length - 1];

            if (arrayToRebalance.length > 1) {
                const removedTarget = arrayToRebalance[removedIndex].target;
                arrayToRebalance.splice(removedIndex, 1);
                
                // Distribute removed target equally among UNLOCKED remaining items
                const unlockedRemaining = arrayToRebalance.filter(item => !item.locked);
                const unlockedCount = unlockedRemaining.length;

                if (unlockedCount > 0) {
                    const distribution = removedTarget / unlockedCount;
                    unlockedRemaining.forEach(item => {
                        item.target = Math.round(item.target + distribution);
                    });
                    
                    // Rebalance the entire array after distribution (handles floor and rounding)
                    // We treat the largest unlocked item as the "changed" item to absorb error
                    let changedIndex = -1;
                    if (unlockedCount > 0) {
                       changedIndex = arrayToRebalance.findIndex(item => item === unlockedRemaining.reduce((a, b) => a.target > b.target ? a : b));
                    }
                    if (changedIndex !== -1) {
                        // Rebalance to ensure total is 100% after the distribution
                        rebalanceArray(arrayToRebalance, changedIndex, arrayToRebalance[changedIndex].target); 
                    }
                } else {
                     arrayToRebalance.forEach(item => {
                         item.target = Math.round(item.target);
                     });
                }
                

            } else {
                 arrayToRebalance.splice(removedIndex, 1);
            }
            
            if (path.length === 1 && removedIndex === activePieIndex) {
                 activePieIndex = Math.max(0, portfolio.length - 1);
            }

            renderPiesAndHoldings();
            updateChart();
            savePortfolio();
        };
    });

    // 5. Select Pie Button Listener
    document.querySelectorAll('.select-pie-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation(); 
            activePieIndex = parseInt(e.target.dataset.index);
            currentChartView = 'sub';
            renderPiesAndHoldings();
            updateChart();
        };
    });
    
    // 6. Generic click handler on the top-level pie items for selection
    piesList.querySelectorAll('.pie-item').forEach((item, index) => {
        item.onclick = (e) => {
            // Only select the pie if the click is directly on the item container or the header elements, 
            // NOT an input, button, or slider.
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.closest('.action-button') || e.target.classList.contains('target-slider')) {
                return;
            }
            
            activePieIndex = index;
            renderPiesAndHoldings();
            updateChart();
        };
    });
    
    // 7. Prevent clicks in the sub-holding area from bubbling up.
    document.querySelectorAll('#activeHoldingsList .holding-item').forEach(item => {
        item.onclick = (e) => {
            e.stopPropagation();
        }
    });

    // 8. Lock Button Listener
    document.querySelectorAll('.lock-item-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation(); 
            const path = e.target.dataset.path.split('-').map(Number);
            const arrayToRebalance = getCurrentArray(path);
            const index = path[path.length - 1];
            const item = arrayToRebalance[index];
            
            // Toggle the locked state
            item.locked = !item.locked;

            // If the item is unlocked, rebalance to ensure 100% total (it won't move, but others might)
            if (!item.locked) {
                 rebalanceArray(arrayToRebalance, index, item.target);
            }
            
                        renderPiesAndHoldings();
            updateChart();
            savePortfolio();
        };
    });

    // 9. Clear Holdings Button Listener
    document.querySelectorAll('.clear-holdings-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const path = e.target.dataset.path.split('-').map(Number);
            const pieIndex = path[0];
            const pie = portfolio[pieIndex];

            if (confirm(`Are you sure you want to remove all holdings from "${pie.name}"?`)) {
                // Clear the holdings array
                pie.holdings = [];

                // Add a default 'Cash' holding to prevent the category from being empty
                pie.holdings.push({
                    name: 'Cash',
                    description: 'Placeholder cash balance',
                    target: 100,
                    color: '#f0f0f0',
                    locked: false
                });

                // Re-render everything to reflect the change
                renderPiesAndHoldings();
                updateChart();
                savePortfolio();
            }
        };
    });
}

// Handler for adding a new top-level Pie
addPieBtn.onclick = () => {
    const newPie = { 
        id: `pie-${Date.now()}`,
        name: `New Pie`, 
        target: 0, 
        color: getRandomColor(), 
        locked: false,
        holdings: [{ name: 'Cash', description: 'Placeholder cash balance', target: 100, color: '#f0f0f0', locked: false }] 
    };
    portfolio.push(newPie);
    activePieIndex = portfolio.length - 1;
    rebalanceArray(portfolio, portfolio.length - 1, portfolio[portfolio.length - 1].target);
    renderPiesAndHoldings();
    updateChart();
    savePortfolio();
};

// Handler for adding a new sub-Holding
document.addEventListener('click', (e) => {
    if (e.target.id === 'addHoldingBtn') {
        const pieIndex = parseInt(e.target.dataset.pieIndex);
        const holdingsArray = portfolio[pieIndex].holdings;
        
        const newHolding = { 
            name: `New Holding ${holdingsArray.length + 1}`, 
            description: `Description ${holdingsArray.length + 1}`,
            target: 0, 
            color: getRandomColor(),
            locked: false
        };

        holdingsArray.push(newHolding);

        const newIndex = holdingsArray.length - 1;
        rebalanceArray(holdingsArray, newIndex, holdingsArray[newIndex].target);
        
        renderPiesAndHoldings();
        savePortfolio();
    }
});

// Linked Input Handlers
function handleAmountChange(e) {
    const value = e.target.value;
    spendAmountInput.value = value;
    linkedSpendAmountInput.value = value;
    
    // We call renderPiesAndHoldings *without* the live update flag to ensure a full refresh
    // which is necessary for the sub-holding area to correctly re-render amounts.
    renderPiesAndHoldings(); 
    calculateAndRenderOverview();
    savePortfolio();
}

spendAmountInput.oninput = handleAmountChange;
linkedSpendAmountInput.oninput = handleAmountChange;

// Chart Toggle Handler
chartToggleBtn.onclick = () => {
    if (currentChartView === 'top') {
        currentChartView = 'sub';
    } else {
        currentChartView = 'top';
    }
    updateChart();
};

// Dark Mode Toggle Handler
darkModeToggle.onclick = () => {
    document.body.classList.toggle('dark-mode');
    document.body.classList.toggle('light-mode');
};

// Start Over Button Handler
startOverBtn.onclick = () => {
    if (confirm("Are you sure you want to start over? This will clear all categories and holdings.")) {
        // Clear the portfolio data
        portfolio = [];
        activePieIndex = 0;
        
        // Clear the saved data from the browser
        localStorage.removeItem('portfolioData');
        
        // Re-render everything to reflect the blank slate
        renderPiesAndHoldings();
        updateChart();
        calculateAndRenderOverview();
        
        // Switch to the main pies tab
        document.querySelector('.tab-button[data-tab="pies"]').click();
    }
};

function setupTabs() {
    document.querySelectorAll('.tab-button').forEach(button => {
        button.onclick = (e) => {
            document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            
            e.target.classList.add('active');
            const targetTab = document.getElementById(`${e.target.dataset.tab}-content`);
            if (targetTab) {
                targetTab.classList.add('active');
            }

                                    if (e.target.dataset.tab === 'overview') {
                calculateAndRenderOverview();
            } else if (e.target.dataset.tab === 'pies') {
                // **FIX**: Delay chart rendering to ensure the container is visible.
                setTimeout(() => updateChart(), 0);
            }
        };
    });
}

// --- CSV Import Functionality ---

let parsedCSVData = [];
let selectedAccount = '';

const csvFileInput = document.getElementById('csvFileInput');
const parseCSVBtn = document.getElementById('parseCSVBtn');
const accountSelect = document.getElementById('accountSelect');
const positionsList = document.getElementById('positionsList');
const importPositionsBtn = document.getElementById('importPositionsBtn');

csvFileInput.onchange = () => {
    parseCSVBtn.disabled = !csvFileInput.files.length;
};

parseCSVBtn.onclick = () => {
    const file = csvFileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        parseCSV(text);
    };
    reader.readAsText(file);
};

function parseCSV(text) {
    const lines = text.split('\n').filter(line => line.trim());
    const data = [];
    
    // Find the header row
    let headerIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('Account Number') && lines[i].includes('Symbol')) {
            headerIndex = i;
            break;
        }
    }
    
    if (headerIndex === -1) {
        alert('Could not find header row in CSV. Please ensure this is a Fidelity portfolio CSV file.');
        return;
    }
    
    const headers = parseCSVLine(lines[headerIndex]);
    
    // Parse data rows
    for (let i = headerIndex + 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        
        // Skip rows that are not actual positions
        if (values.length < headers.length || !values[2] || values[2].includes('Pending activity')) {
            continue;
        }
        
        // Skip disclaimer rows
        if (values[0] && values[0].includes('The data and information')) {
            break;
        }
        
        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index] || '';
        });
        
        // Only add rows with symbols
        if (row['Symbol'] && row['Symbol'] !== 'Symbol') {
            data.push(row);
        }
    }
    
    parsedCSVData = data;
    displayAccountSelection(data);
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    
    return result;
}

function displayAccountSelection(data) {
    // Get unique accounts
    const accounts = [...new Set(data.map(row => row['Account Name']).filter(a => a))];
    
    accountSelect.innerHTML = '<option value="">-- Select an account --</option>';
    accounts.forEach(account => {
        const option = document.createElement('option');
        option.value = account;
        option.textContent = account;
        accountSelect.appendChild(option);
    });
    
    document.getElementById('account-step').style.display = 'block';
    accountSelect.onchange = () => {
        if (accountSelect.value) {
            displayPositionMapping(accountSelect.value);
        }
    };
}

function displayPositionMapping(account) {
    selectedAccount = account;
    const accountPositions = parsedCSVData.filter(row => row['Account Name'] === account);
    
    positionsList.innerHTML = '';
    
    accountPositions.forEach((position, index) => {
        const symbol = position['Symbol'];
        const description = position['Description'];
        const quantity = position['Quantity'];
        const currentValue = position['Current Value'];
        const gainLoss = position['Total Gain/Loss Dollar'];
        const gainLossPercent = position['Total Gain/Loss Percent'];
        
        const item = document.createElement('div');
        item.className = 'position-item';
        item.setAttribute('data-index', index);
        
        // Generate options, including the "Create New" one
        const categoryOptions = portfolio.map((pie, i) => `<option value="${i}">${pie.name}</option>`).join('');
        
        item.innerHTML = `
            <div class="position-header">
                <div class="position-info">
                    <strong>${symbol}</strong>
                    <div class="position-details">
                        ${description}<br>
                        Quantity: ${quantity} | Value: ${currentValue} | Gain/Loss: ${gainLoss} (${gainLossPercent})
                    </div>
                </div>
            </div>
            <div class="category-mapping">
                <label>Assign to Category:</label>
                <select class="pie-select" data-index="${index}">
                    <option value="">-- Select Category --</option>
                    ${categoryOptions}
                    <option value="new-category" style="font-weight: bold; color: var(--primary-color);">+ Create New Category</option>
                </select>
            </div>
        `;
        
        positionsList.appendChild(item);
    });
    
    // Attach the new, more advanced event handler
    document.querySelectorAll('.pie-select').forEach(select => {
        select.onchange = handleCategorySelection;
    });
    
    document.getElementById('mapping-step').style.display = 'block';
    importPositionsBtn.style.display = 'block';
}

function handleCategorySelection(e) {
    const selectElement = e.target;
    const selectedValue = selectElement.value;
    const itemIndex = selectElement.dataset.index;

    if (selectedValue === 'new-category') {
        const newCategoryName = prompt('Enter a name for the new category:');
        
        if (newCategoryName && newCategoryName.trim() !== '') {
            const newPie = {
                id: `pie-${Date.now()}`,
                name: newCategoryName.trim(),
                target: 0, // Target will be adjusted when rebalancing
                color: getRandomColor(),
                locked: false,
                holdings: [] // Starts empty, positions will be added on import
            };
            
            portfolio.push(newPie);
            const newPieIndex = portfolio.length - 1;
            
            // Refresh the entire mapping view to update all dropdowns
            displayPositionMapping(selectedAccount);

            // After re-rendering, find the dropdown for the item that initiated the creation
            // and set its value to the newly created category.
            const currentItemDropdown = document.querySelector(`.pie-select[data-index="${itemIndex}"]`);
            if (currentItemDropdown) {
                currentItemDropdown.value = newPieIndex;
            }

        } else {
            // If the user cancels or enters an empty name, reset the dropdown
            selectElement.value = '';
        }
    }
}

importPositionsBtn.onclick = () => {
    const accountPositions = parsedCSVData.filter(row => row['Account Name'] === selectedAccount);
    let importedCount = 0;
    
    accountPositions.forEach((position, index) => {
        const pieSelect = document.querySelector(`.pie-select[data-index="${index}"]`);
        const pieIndex = parseInt(pieSelect.value);
        
        if (!isNaN(pieIndex)) {
            const symbol = position['Symbol'];
            const description = position['Description'];
            const pie = portfolio[pieIndex];
            
            // Add the position as a new holding in the selected category
            const newHolding = {
                name: symbol,
                description: description,
                target: 0,
                color: getRandomColor(),
                locked: false
            };
            
            pie.holdings.push(newHolding);
            importedCount++;
        }
    });
    
    if (importedCount > 0) {
        // Rebalance all categories that received new holdings
        const affectedPies = new Set();
        accountPositions.forEach((position, index) => {
            const pieSelect = document.querySelector(`.pie-select[data-index="${index}"]`);
            const pieIndex = parseInt(pieSelect.value);
            if (!isNaN(pieIndex)) {
                affectedPies.add(pieIndex);
            }
        });
        
        // Rebalance each affected pie's holdings
        affectedPies.forEach(pieIndex => {
            const holdings = portfolio[pieIndex].holdings;
            if (holdings.length > 0) {
                // Distribute evenly among all holdings
                const equalShare = 100 / holdings.length;
                holdings.forEach(holding => {
                    holding.target = Math.round(equalShare);
                });
                
                // Fix rounding errors
                const total = holdings.reduce((sum, h) => sum + h.target, 0);
                if (total !== 100 && holdings.length > 0) {
                    holdings[0].target += (100 - total);
                }
            }
        });
        
        alert(`Successfully imported ${importedCount} position(s)!`);
        renderPiesAndHoldings();
        updateChart();
        savePortfolio();
        
        // Switch to the Pies tab
        document.querySelector('.tab-button[data-tab="pies"]').click();
    } else {
        alert('No positions were selected for import. Please assign categories to your positions.');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const savedAmount = localStorage.getItem('investmentAmount') || '1000';
    spendAmountInput.value = savedAmount;
    linkedSpendAmountInput.value = savedAmount;

    renderPiesAndHoldings();
    setupTabs();
    calculateAndRenderOverview();

    if (!document.body.classList.contains('dark-mode')) {
        document.body.classList.add('light-mode');
    }
});