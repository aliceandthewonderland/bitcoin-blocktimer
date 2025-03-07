// DOM Elements
const taskInput = document.getElementById('task-input');
const currentBlockElement = document.getElementById('current-block');
const connectionStatusElement = document.getElementById('connection-status');
const blockSlider = document.getElementById('block-slider');
const blockCountElement = document.getElementById('block-count');
const startBlockElement = document.getElementById('start-block');
const targetBlockElement = document.getElementById('target-block');
const blocksPassedElement = document.getElementById('blocks-passed');
const blocksTotalElement = document.getElementById('blocks-total');
const startButton = document.getElementById('start-button');
const resetButton = document.getElementById('reset-button');
const blocksRow = document.getElementById('blocks-row');
const searchingAnimation = document.getElementById('searching-animation');
const closeButton = document.getElementById('close-button');
const minimizeButton = document.getElementById('minimize-button');

// State variables
let websocket = null;
let currentBlock = null;
let startBlock = null;
let targetBlock = null;
let isTimerRunning = false;
let selectedBlockCount = 1;
let blocks = [];
let heartbeatInterval = null;
let averageBlockTimeSeconds = 600; // Default value 10 minutes (600 seconds)

// IPC communication setup
const { ipcRenderer } = require('electron');

// Close button handler
closeButton.addEventListener('click', () => {
  window.close();
});

// Minimize button handler
minimizeButton.addEventListener('click', () => {
  ipcRenderer.send('minimize-main-window');
});

// Event handler for when the search window is closed
ipcRenderer.on('searching-window-closed', () => {
  if (isTimerRunning) {
    const blocksRemaining = targetBlock - currentBlock;
    ipcRenderer.send('show-searching', {
      text: `Searching for new blocks... ${blocksRemaining} more to go!`
    });
  }
});

// Initialize WebSocket connection
connectToBlockchainAPI();

// Get initial block height using fetch API as a fallback
fetchCurrentBlockHeight();

// Fetch average block time from blockchain.info API
function fetchAverageBlockTime() {
  fetch('https://blockchain.info/q/interval')
    .then(response => response.text())
    .then(data => {
      averageBlockTimeSeconds = parseFloat(data);
      updateEstimatedTime();
      console.log(`Average block time: ${averageBlockTimeSeconds} seconds`);
    })
    .catch(error => {
      console.error('Error fetching average block time:', error);
    });
}

// Update estimated time based on slider value
function updateEstimatedTime() {
  const estimatedTimeMinutes = Math.round((averageBlockTimeSeconds * selectedBlockCount) / 60);
  const infoText = document.querySelector('.info-text');
  infoText.textContent = `Approx ${estimatedTimeMinutes} minutes to complete (Average block generation time: ${Math.round(averageBlockTimeSeconds / 60)} minutes)`;
}

// Update the block count display when the slider is moved
blockSlider.addEventListener('input', function() {
  selectedBlockCount = parseInt(this.value);
  blockCountElement.textContent = `${selectedBlockCount} ${selectedBlockCount === 1 ? 'Block' : 'Blocks'}`;
  updateSelectedBlocks();
  updateEstimatedTime();
});

// Handle task input
taskInput.addEventListener('input', function() {
  const task = this.value.trim();
  window.ipcRenderer.send('update-task', task);
});

// Fetch current block height using HTTP API as a fallback
function fetchCurrentBlockHeight() {
  fetch('https://blockchain.info/q/getblockcount')
    .then(response => response.text())
    .then(height => {
      if (!currentBlock) {
        currentBlock = parseInt(height);
        updateBlockDisplay();
        generateBlocks();
      }
    })
    .catch(error => {
      console.error('Error fetching block height:', error);
    });
}

// WebSocket Connection Setup
function connectToBlockchainAPI() {
  // Close existing connection if any
  if (websocket) {
    websocket.close();
  }

  // Clear existing heartbeat interval
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }

  // Update connection status
  connectionStatusElement.textContent = 'Connecting...';
  
  try {
    // Create a new WebSocket connection
    websocket = new WebSocket('wss://ws.blockchain.info/inv');

    // Handle connection open
    websocket.onopen = () => {
      console.log('WebSocket connection established');
      connectionStatusElement.textContent = 'Connected';
      
      // Subscribe to new blocks
      websocket.send(JSON.stringify({
        "op": "blocks_sub"
      }));
      
      // Send a ping to get the latest block
      websocket.send(JSON.stringify({
        "op": "ping_block"
      }));
      
      // Setup heartbeat to keep connection alive
      heartbeatInterval = setInterval(() => {
        if (websocket.readyState === WebSocket.OPEN) {
          websocket.send(JSON.stringify({
            "op": "ping"
          }));
          console.log('Heartbeat sent');
        }
      }, 60000); // Send heartbeat every 60 seconds (changed from 30 seconds)
    };

    // Handle incoming messages
    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      // Handle new block notifications
      if (data.op === 'block') {
        const blockHeight = data.x.height;
        currentBlock = blockHeight;
        updateBlockDisplay();
        
        // Update timer if it's running
        if (isTimerRunning) {
          updateTimer();
        }
        
        // Regenerate blocks
        generateBlocks();
      }
    };

    // Handle connection errors
    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
      connectionStatusElement.textContent = 'Error connecting';
    };

    // Handle connection close
    websocket.onclose = () => {
      console.log('WebSocket connection closed');
      connectionStatusElement.textContent = 'Disconnected';
      
      // Try to reconnect after a delay
      setTimeout(connectToBlockchainAPI, 10000); // Changed from 5000 to 10000 (10 seconds)
    };
  } catch (error) {
    console.error('Failed to create WebSocket connection:', error);
    connectionStatusElement.textContent = 'Connection failed';
    
    // Try to reconnect after a delay
    setTimeout(connectToBlockchainAPI, 10000); // Changed from 5000 to 10000 (10 seconds)
  }
}

// Update the block display with current block height
function updateBlockDisplay() {
  if (currentBlock) {
    currentBlockElement.textContent = currentBlock;
  }
}

// Generate blocks visualization
function generateBlocks() {
  // Clear existing blocks
  blocksRow.innerHTML = '';
  blocks = [];
  
  // Create blocks
  for (let i = 0; i < 10; i++) {
    const block = document.createElement('div');
    block.className = 'block';
    
    // Create block number element
    const blockNumber = document.createElement('div');
    blockNumber.className = 'block-number';
    blockNumber.textContent = currentBlock ? (currentBlock + i) : '?';
    blockNumber.style.fontSize = '12px'; // Reduce block number font size
    blockNumber.style.overflow = 'hidden'; // Prevent overflow
    blockNumber.style.textOverflow = 'ellipsis'; // Display ellipsis when text overflows
    
    // Create block label element
    const blockLabel = document.createElement('div');
    blockLabel.className = 'block-label';
    blockLabel.textContent = i === 0 ? 'Current' : `+${i}`;
    
    // Add elements to block
    block.appendChild(blockNumber);
    block.appendChild(blockLabel);
    
    // Add click event
    block.addEventListener('click', () => {
      selectedBlockCount = i + 1;
      blockSlider.value = selectedBlockCount;
      blockCountElement.textContent = `${selectedBlockCount} ${selectedBlockCount === 1 ? 'Block' : 'Blocks'}`;
      updateSelectedBlocks();
      updateEstimatedTime();
    });
    
    // Add to DOM and array
    blocksRow.appendChild(block);
    blocks.push(block);
  }
  
  // Update selected blocks
  updateSelectedBlocks();
}

// Update selected blocks based on slider value
function updateSelectedBlocks() {
  if (!blocks.length) return;
  
  blocks.forEach((block, index) => {
    block.classList.remove('current', 'selected');
    
    if (index === 0) {
      block.classList.add('current');
    }
    
    if (index > 0 && index <= selectedBlockCount - 1) {
      block.classList.add('selected');
    }
  });
}

// Create animated block element
function createAnimatedBlock(blockHeight, isTarget = false, isCurrent = false) {
  const block = document.createElement('div');
  block.className = 'animated-block';
  if (isTarget) block.classList.add('target');
  if (isCurrent) block.classList.add('current');
  
  // Create block number element
  const blockNumber = document.createElement('div');
  blockNumber.className = 'block-number';
  blockNumber.textContent = blockHeight;
  
  // Create block label element
  const blockLabel = document.createElement('div');
  blockLabel.className = 'block-label';
  blockLabel.textContent = isTarget ? 'TARGET' : (isCurrent ? 'CURRENT' : 'BLOCK');
  
  // Add elements to block
  block.appendChild(blockNumber);
  block.appendChild(blockLabel);
  
  return block;
}

// Create particle effects
function createParticles(block, count = 10) {
  const rect = block.getBoundingClientRect();
  const container = document.getElementById('block-animation-container');
  const containerRect = container.getBoundingClientRect();
  
  for (let i = 0; i < count; i++) {
    const particle = document.createElement('div');
    particle.className = 'block-particle';
    
    // Position particle relative to the block
    const x = rect.left - containerRect.left + rect.width / 2;
    const y = rect.top - containerRect.top + rect.height / 2;
    
    particle.style.left = `${x}px`;
    particle.style.top = `${y}px`;
    
    // Random direction and distance
    const angle = Math.random() * Math.PI * 2;
    const distance = 30 + Math.random() * 50;
    const tx = Math.cos(angle) * distance;
    const ty = Math.sin(angle) * distance;
    
    // Set CSS variables for the animation
    particle.style.setProperty('--tx', `${tx}px`);
    particle.style.setProperty('--ty', `${ty}px`);
    
    // Add animation
    particle.style.animation = `particleAnimation ${0.5 + Math.random() * 1}s forwards`;
    
    // Add to container
    container.appendChild(particle);
    
    // Remove particle after animation completes
    setTimeout(() => {
      if (particle.parentNode) {
        particle.parentNode.removeChild(particle);
      }
    }, 2000);
  }
}

// Animate a block moving across the screen
function animateBlock(blockHeight, isTarget = false, isCurrent = false) {
  const animatedBlocksContainer = document.getElementById('animated-blocks');
  const block = createAnimatedBlock(blockHeight, isTarget, isCurrent);
  
  // Add to container
  animatedBlocksContainer.appendChild(block);
  
  // Start animation after a short delay
  setTimeout(() => {
    block.classList.add('moving');
    
    // Add pulse effect for important blocks
    if (isTarget || isCurrent) {
      block.classList.add('pulse');
    }
    
    // Create particles for important blocks
    if (isTarget || isCurrent) {
      createParticles(block);
    }
    
    // Remove block after animation completes
    setTimeout(() => {
      if (block.parentNode) {
        block.parentNode.removeChild(block);
      }
    }, 10000); // Match the animation duration
  }, 100);
}

// Update the timer when a new block is found
function updateTimer() {
  if (!isTimerRunning || !currentBlock || !startBlock || !targetBlock) {
    return;
  }
  
  // Calculate blocks passed
  const blocksPassed = currentBlock - startBlock;
  const blocksTotal = targetBlock - startBlock;
  const blocksRemaining = targetBlock - currentBlock;
  
  // Update search window with current timer information
  ipcRenderer.send('update-searching', {
    task: taskInput.value,
    startBlock: startBlock,
    targetBlock: targetBlock,
    blocksPassed: blocksPassed,
    blocksTotal: blocksTotal,
    currentBlock: currentBlock
  });
  
  // Animate the new block
  animateBlock(currentBlock, currentBlock === targetBlock, true);
  
  // Add timer-active class to container to show animation
  document.querySelector('.container').classList.add('timer-active');
  
  // Check if the timer is complete
  if (currentBlock >= targetBlock) {
    // Timer complete
    isTimerRunning = false;
    
    // Update UI
    startButton.textContent = 'Start Timer';
    startButton.disabled = false;
    resetButton.disabled = true;
    blockSlider.disabled = false;
    taskInput.disabled = false;
    
    // Close search window
    ipcRenderer.send('hide-searching');
    
    // Show timer settings and restore original UI
    document.querySelector('.block-selector').style.display = 'block';
    document.querySelector('.task-input').classList.remove('task-active');
    document.querySelector('.container').classList.remove('timer-active');
    
    // Show completion message
    alert('Timer complete! You have successfully focused for the target number of blocks.');
    
    // Regenerate blocks
    generateBlocks();
  }
}

// Start timer button click handler
startButton.addEventListener('click', function() {
  // Validate task input
  const task = taskInput.value.trim();
  if (!task) {
    taskInput.classList.add('error');
    const errorElement = document.createElement('div');
    errorElement.className = 'task-input-error';
    errorElement.textContent = 'Please enter a task to focus on';
    taskInput.parentNode.appendChild(errorElement);
    return;
  }
  
  // Set the start and target blocks
  startBlock = currentBlock;
  targetBlock = startBlock + selectedBlockCount;
  
  // Update state
  isTimerRunning = true;
  
  // Update UI
  startButton.textContent = 'Timer Running';
  startButton.disabled = true;
  resetButton.disabled = false;
  blockSlider.disabled = true;
  taskInput.disabled = true;
  
  // Add timer-active class to container to show animation
  document.querySelector('.container').classList.add('timer-active');
  
  // Animate the current block
  animateBlock(currentBlock, false, true);
  
  // Animate the target block (preview)
  setTimeout(() => {
    animateBlock(targetBlock, true, false);
  }, 2000);
  
  // Display searching animation and timer info in a separate window
  ipcRenderer.send('show-searching', {
    task: taskInput.value,
    startBlock: startBlock,
    targetBlock: targetBlock,
    blocksPassed: 0,
    blocksTotal: selectedBlockCount,
    currentBlock: currentBlock
  });
  
  // Hide unnecessary UI elements
  document.querySelector('.block-selector').style.display = 'none';
  document.querySelector('.task-input').classList.add('task-active');
});

// Reset the timer
resetButton.addEventListener('click', function() {
  // Reset state
  isTimerRunning = false;
  startBlock = null;
  targetBlock = null;
  
  // Update UI
  startButton.textContent = 'Start Timer';
  startButton.disabled = false;
  resetButton.disabled = true;
  blockSlider.disabled = false;
  taskInput.disabled = false;
  
  // Close search window
  ipcRenderer.send('hide-searching');
  
  // Clear animation container
  document.getElementById('animated-blocks').innerHTML = '';
  
  // Remove timer-active class
  document.querySelector('.container').classList.remove('timer-active');
  
  // Show timer settings and restore original UI
  document.querySelector('.block-selector').style.display = 'block';
  document.querySelector('.task-input').classList.remove('task-active');
});

// Request notification permission on start
if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
  Notification.requestPermission();
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
  connectToBlockchainAPI();
  fetchAverageBlockTime();
}); 