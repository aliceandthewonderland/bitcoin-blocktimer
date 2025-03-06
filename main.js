const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

let mainWindow;
let searchingWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    frame: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');
  
  // Open DevTools if needed
  // mainWindow.webContents.openDevTools();
}

// Create a separate window for search animation
function createSearchingWindow() {
  // Get the screen size
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
  
  searchingWindow = new BrowserWindow({
    width: 600,
    height: 400,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    skipTaskbar: true, // Do not show on taskbar
    x: screenWidth - 620, // 20px margin from the right
    y: 20, // 20px margin from the top
    resizable: false, // Not resizable
    movable: true,
    show: false
  });

  searchingWindow.loadFile('searching.html');
  
  // Remove reference when the window is closed
  searchingWindow.on('closed', () => {
    searchingWindow = null;
    // Notify renderer that timer window is closed
    if (mainWindow) {
      mainWindow.webContents.send('searching-window-closed');
    }
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Minimize main window
ipcMain.on('minimize-main-window', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

// Show search window when timer starts
ipcMain.on('show-searching', (event, data) => {
  if (!searchingWindow) {
    createSearchingWindow();
  }
  
  // Send data to search window
  searchingWindow.webContents.on('did-finish-load', () => {
    searchingWindow.webContents.send('update-searching', data);
    searchingWindow.show();
    
    // Minimize main window
    if (mainWindow) {
      mainWindow.minimize();
    }
  });
});

// Update search window when timer is updated
ipcMain.on('update-searching', (event, data) => {
  if (searchingWindow) {
    searchingWindow.webContents.send('update-searching', data);
  } else {
    // Recreate search window if it was closed
    createSearchingWindow();
    searchingWindow.webContents.on('did-finish-load', () => {
      searchingWindow.webContents.send('update-searching', data);
      searchingWindow.show();
    });
  }
});

// Close search window when timer ends
ipcMain.on('hide-searching', () => {
  if (searchingWindow) {
    searchingWindow.close();
    searchingWindow = null;
  }
});

// Listen for messages from the renderer process
ipcMain.on('update-task', (event, task) => {
  console.log('Task updated:', task);
});

// Add this listener near your other ipcMain event listeners

ipcMain.on('minimize-searching-window', () => {
  if (searchingWindow) {
    searchingWindow.minimize();
  }
}); 