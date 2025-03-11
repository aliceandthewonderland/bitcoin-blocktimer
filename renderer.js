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
const charCounter = document.getElementById('char-counter');
const clearButton = document.getElementById('clear-button');

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

// Add tracking for stacked blocks
let stackedBlocks = [];
const BLOCK_HEIGHT = 50; // Height of a block element
const BLOCK_SPACING = 5; // Space between stacked blocks
const MAX_VISIBLE_BLOCKS = 3; // Maximum blocks visible before scrolling

// Track which block heights have already been stacked
let stackedBlockHeights = new Set();

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

// Character counter for task input
taskInput.addEventListener('input', function() {
  const charCount = this.value.length;
  charCounter.textContent = `${charCount}/120`;
  
  // Remove any existing error messages when user starts typing again
  const errorElement = taskInput.parentNode.parentNode.querySelector('.task-input-error');
  if (errorElement) {
    errorElement.remove();
  }
  taskInput.classList.remove('error');
  
  // Update counter color based on character count
  if (charCount > 120) {
    charCounter.className = 'char-counter limit-exceeded';
  } else if (charCount > 60) {
    charCounter.className = 'char-counter limit-warning';
  } else {
    charCounter.className = 'char-counter';
  }
  
  // Show/hide clear button based on input content
  if (charCount > 0) {
    clearButton.style.display = 'flex';
  } else {
    clearButton.style.display = 'none';
  }
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
      // websocket.send(JSON.stringify({
      //   "op": "ping_block"
      // }));
      
      // Setup heartbeat to keep connection alive
      heartbeatInterval = setInterval(() => {
        if (websocket.readyState === WebSocket.OPEN) {
          websocket.send(JSON.stringify({
            "op": "ping"
          }));
          console.log('Heartbeat sent');
        }
      }, 60000); // Send heartbeat every 60 seconds 
    };

    // Handle incoming messages
    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      // Handle new block notifications
      if (data.op === 'block') {
        const blockHeight = data.x.height;
        
        // Check if this is a new block (not just a reconnection ping)
        const isNewBlock = blockHeight > currentBlock;
        
        // Only update if the new block height is greater than current
        if (isNewBlock) {
          currentBlock = blockHeight;
          updateBlockDisplay();
          
          // Update timer if it's running and this is a new block
          if (isTimerRunning) {
            updateTimer();
          }
          
          // Regenerate blocks
          generateBlocks();
        }
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
      selectedBlockCount = i;
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
  // On first run, default the selected value to 3 if it hasn't been changed yet.
  if (updateSelectedBlocks.firstRun === undefined) {
    selectedBlockCount = 3;
    if (blockSlider) {
      blockSlider.value = 3;
    }
    if (blockCountElement) {
      blockCountElement.textContent = `3 Blocks`;
    }
    updateSelectedBlocks.firstRun = false;
    updateEstimatedTime();
  }

  if (!blocks.length) return;
  
  blocks.forEach((block, index) => {
    block.classList.remove('current', 'selected');
    
    if (index === 0) {
      block.classList.add('current');
    }
    
    if (index > 0 && index <= selectedBlockCount) {
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

// Create standard particle effects
function createParticles(block, count = 15) {
  const rect = block.getBoundingClientRect();
  const container = document.getElementById('block-animation-container');
  const containerRect = container.getBoundingClientRect();
  
  // Get block color to match particles
  const isTarget = block.classList.contains('target');
  const isCurrent = block.classList.contains('current');
  
  let particleColor1, particleColor2;
  if (isTarget) {
    particleColor1 = '#ff7043';
    particleColor2 = '#ff5722';
  } else if (isCurrent) {
    particleColor1 = '#66bb6a';
    particleColor2 = '#4caf50';
  } else {
    particleColor1 = '#ffeb3b';
    particleColor2 = '#f9b404';
  }
  
  for (let i = 0; i < count; i++) {
    const particle = document.createElement('div');
    particle.className = 'block-particle';
    
    // Randomize particle size
    const size = 4 + Math.random() * 8;
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    
    // Set particle color
    particle.style.background = `radial-gradient(circle, ${particleColor1}, ${particleColor2})`;
    
    // Position particle relative to the block
    const x = rect.left - containerRect.left + rect.width / 2;
    const y = rect.top - containerRect.top + rect.height / 2;
    
    particle.style.left = `${x}px`;
    particle.style.top = `${y}px`;
    
    // Random direction and distance
    const angle = Math.random() * Math.PI * 2;
    const distance = 50 + Math.random() * 80;
    const tx = Math.cos(angle) * distance;
    const ty = Math.sin(angle) * distance;
    
    // Add some gravity effect
    const gravity = Math.random() * 20;
    
    // Set CSS variables for the animation
    particle.style.setProperty('--tx', `${tx}px`);
    particle.style.setProperty('--ty', `${ty + gravity}px`);
    
    // Randomize animation duration
    const duration = 0.8 + Math.random() * 1.5;
    
    // Add animation
    particle.style.animation = `particleAnimation ${duration}s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards`;
    
    // Add to container
    container.appendChild(particle);
    
    // Remove particle after animation completes
    setTimeout(() => {
      if (particle.parentNode) {
        particle.parentNode.removeChild(particle);
      }
    }, duration * 1000 + 100);
  }
}

// Create particle effects for when blocks stack
function createStackParticles(block) {
  const rect = block.getBoundingClientRect();
  const container = document.getElementById('block-animation-container');
  const containerRect = container.getBoundingClientRect();
  
  // Get the final position
  const blockBottom = parseInt(block.style.getPropertyValue('--stack-position') || '0');
  
  // Get block color to match particles
  const isTarget = block.classList.contains('target');
  const isCurrent = block.classList.contains('current');
  
  let particleColor1, particleColor2;
  if (isTarget) {
    particleColor1 = '#ff7043';
    particleColor2 = '#ff5722';
  } else if (isCurrent) {
    particleColor1 = '#66bb6a';
    particleColor2 = '#4caf50';
  } else {
    particleColor1 = '#ffeb3b';
    particleColor2 = '#f9b404';
  }
  
  // Create horizontal burst of particles
  for (let i = 0; i < 20; i++) {
    const particle = document.createElement('div');
    particle.className = 'block-particle';
    
    // Randomize particle size
    const size = 3 + Math.random() * 6;
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    
    // Set particle color
    particle.style.background = `radial-gradient(circle, ${particleColor1}, ${particleColor2})`;
    
    // Position particle at the block's landing position
    const x = rect.left - containerRect.left + rect.width / 2;
    const y = containerRect.height - blockBottom - rect.height / 2;
    
    particle.style.left = `${x}px`;
    particle.style.bottom = `${blockBottom - 5}px`;
    
    // Random direction and distance - more horizontally spread
    const angle = (Math.random() * Math.PI) - Math.PI/2; // -90 to 90 degrees
    const distance = 30 + Math.random() * 70;
    const tx = Math.cos(angle) * distance;
    const ty = Math.sin(angle) * distance * 0.5; // Less vertical movement
    
    // Set CSS variables for the animation
    particle.style.setProperty('--tx', `${tx}px`);
    particle.style.setProperty('--ty', `${ty}px`);
    
    // Randomize animation duration
    const duration = 0.5 + Math.random() * 0.8;
    
    // Add animation
    particle.style.animation = `particleAnimation ${duration}s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards`;
    
    // Add to container
    container.appendChild(particle);
    
    // Remove particle after animation completes
    setTimeout(() => {
      if (particle.parentNode) {
        particle.parentNode.removeChild(particle);
      }
    }, duration * 1000 + 100);
  }
}

// Animate a block moving across the screen
function animateBlock(blockHeight, isTarget = false, isCurrent = false) {
  const animatedBlocksContainer = document.getElementById('animated-blocks');
  const block = createAnimatedBlock(blockHeight, isTarget, isCurrent);
  
  // Add to container
  animatedBlocksContainer.appendChild(block);
  
  // Force a reflow before adding the animation class
  void block.offsetWidth;
  
  // Calculate stacking position
  let stackPosition = 10; // Base position from bottom (px)
  if (stackedBlocks.length > 0) {
    stackPosition = stackedBlocks.length * (BLOCK_HEIGHT + BLOCK_SPACING) + 10;
  }
  
  // Set the CSS variable for positioning
  block.style.setProperty('--stack-position', `${stackPosition}px`);
  
  // Add stacking animation
  block.classList.add('stacking');
  
  // Add pulse effect
  block.classList.add('pulse');
  
  // Create initial particles
  createParticles(block, 8);
  
  // Create landing particles when the block stacks into position
  setTimeout(() => {
    createStackParticles(block);
  }, 1000); // After the block has moved into position
  
  // Add block to tracked blocks
  stackedBlocks.push(block);
  
  // Check if we need to scroll blocks (when we have more than MAX_VISIBLE_BLOCKS)
  if (stackedBlocks.length > MAX_VISIBLE_BLOCKS) {
    scrollBlocks();
  }
}

// Function to scroll blocks down when new ones are added
function scrollBlocks() {
  // Need to scroll out oldest block
  const blockToRemove = stackedBlocks[0];
  
  // Set animation parameters for all blocks
  stackedBlocks.forEach((block, index) => {
    const currentPos = parseInt(getComputedStyle(block).bottom);
    const targetPos = index === 0 ? -BLOCK_HEIGHT : 
                     (index - 1) * (BLOCK_HEIGHT + BLOCK_SPACING) + 10;
    
    block.style.setProperty('--current-position', `${currentPos}px`);
    block.style.setProperty('--target-position', `${targetPos}px`);
    
    // Remove stacking class and add scrolling
    block.classList.remove('stacking');
    block.classList.add('scrolling');
  });
  
  // After animation completes, remove the first block
  setTimeout(() => {
    if (blockToRemove && blockToRemove.parentNode) {
      blockToRemove.parentNode.removeChild(blockToRemove);
      stackedBlocks.shift();
      
      // Reset positions for remaining blocks
      stackedBlocks.forEach((block, index) => {
        const newPos = index * (BLOCK_HEIGHT + BLOCK_SPACING) + 10;
        block.style.bottom = `${newPos}px`;
        block.classList.remove('scrolling');
      });
    }
  }, 1000);
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
  
  // Check if this block has already been stacked to prevent duplicates
  if (!stackedBlockHeights.has(currentBlock)) {
    // Update any existing "current" blocks to be regular blocks
    stackedBlocks.forEach(block => {
      if (block.classList.contains('current')) {
        block.classList.remove('current');
        // Update the block label to say "BLOCK" instead of "CURRENT"
        const blockLabel = block.querySelector('.block-label');
        if (blockLabel) {
          blockLabel.textContent = 'BLOCK';
        }
        // Update the block styling
        block.style.background = 'linear-gradient(145deg, #ffc107, #f9b404)';
        block.style.boxShadow = '0 0 15px rgba(249, 180, 4, 0.5), 0 5px 10px rgba(0, 0, 0, 0.3)';
      }
    });
    
    // Add to tracked heights
    stackedBlockHeights.add(currentBlock);
    
    // Animate the new block as the current block
    animateBlock(currentBlock, currentBlock === targetBlock, true);
  }
  
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
    
    // Reset tracked block heights
    stackedBlockHeights.clear();
    
    // Close search window
    ipcRenderer.send('hide-searching');
    
    // Show timer settings and restore original UI
    document.querySelector('.block-selector').style.display = 'block';
    document.querySelector('.task-input').classList.remove('task-active');
    document.querySelector('.container').classList.remove('timer-active');
    
    // Show completion message
    alert('Timer complete!');
    
    // Reset stacked blocks
    stackedBlocks = [];
    document.getElementById('animated-blocks').innerHTML = '';
    
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
    // Remove any existing error messages first
    const existingError = taskInput.parentNode.parentNode.querySelector('.task-input-error');
    if (existingError) {
      existingError.remove();
    }
    const errorElement = document.createElement('div');
    errorElement.className = 'task-input-error';
    errorElement.textContent = 'Please enter a task to focus on';
    taskInput.parentNode.parentNode.appendChild(errorElement);
    return;
  }

  // Check if task exceeds 120 character limit
  if (task.length > 120) {
    taskInput.classList.add('error');
    // Remove any existing error messages first
    const existingError = taskInput.parentNode.parentNode.querySelector('.task-input-error');
    if (existingError) {
      existingError.remove();
    }
    const errorElement = document.createElement('div');
    errorElement.className = 'task-input-error';
    errorElement.textContent = 'Task should be less than 120 characters';
    taskInput.parentNode.parentNode.appendChild(errorElement);
    return;
  }

  if (selectedBlockCount === 0) {
    // Remove any existing error messages first
    const existingError = taskInput.parentNode.parentNode.querySelector('.task-input-error');
    if (existingError) {
      existingError.remove();
    }
    const errorElement = document.createElement('div');
    errorElement.className = 'task-input-error';
    errorElement.textContent = 'Please select at least 1 block';
    taskInput.parentNode.parentNode.appendChild(errorElement);
    return;
  }
  
  // Clear any existing stacked blocks
  stackedBlocks = [];
  document.getElementById('animated-blocks').innerHTML = '';
  
  // Reset tracked block heights
  stackedBlockHeights.clear();
  
  // Set the start and target blocks
  startBlock = currentBlock;
  targetBlock = startBlock + selectedBlockCount;
  
  // Store initial block height
  if (currentBlock) {
    stackedBlockHeights.add(currentBlock);
  }
  
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
  
  // Animate the initial block (current)
  animateBlock(currentBlock, false, true);
  
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
  
  // Reset tracked block heights
  stackedBlockHeights.clear();
  
  // Close search window
  ipcRenderer.send('hide-searching');
  
  // Clear animation container
  document.getElementById('animated-blocks').innerHTML = '';
  
  // Reset stacked blocks array
  stackedBlocks = [];
  
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

// Clear error message when task input is focused
taskInput.addEventListener('focus', function() {
  const errorElement = taskInput.parentNode.parentNode.querySelector('.task-input-error');
  if (errorElement) {
    errorElement.remove();
  }
  taskInput.classList.remove('error');
});

// Clear button functionality
clearButton.addEventListener('click', function() {
  taskInput.value = '';
  charCounter.textContent = '0/120';
  charCounter.className = 'char-counter';
  
  // Remove any error messages
  const errorElement = taskInput.parentNode.parentNode.querySelector('.task-input-error');
  if (errorElement) {
    errorElement.remove();
  }
  taskInput.classList.remove('error');
  
  // Focus back on the input field
  taskInput.focus();
}); 