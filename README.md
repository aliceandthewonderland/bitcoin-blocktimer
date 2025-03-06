# Bitcoin Block Timer

A focus timer that measures time using Bitcoin blocks instead of traditional clock time. Each Bitcoin block takes approximately 10 minutes to mine on average, making this a natural Pomodoro-like timer.

## Features

- Set a focus task and track your progress
- Set timer duration by selecting the number of Bitcoin blocks
- Real-time connection to the Bitcoin blockchain
- Clean, spacious UI for distraction-free focus
- Desktop notifications when your timer completes

## Installation

1. Make sure you have [Node.js](https://nodejs.org/) installed on your system
2. Clone this repository
3. Install dependencies:

```bash
npm install
```

## Usage

1. Start the application:

```bash
npm start
```

2. Enter the task you want to focus on
3. Use the slider to select how many Bitcoin blocks to wait for (each block is approximately 10 minutes)
4. Click "Start Timer" to begin
5. Work on your task until the timer completes
6. You will receive a notification when the timer is complete

## How it Works

This application connects to the Blockchain.com WebSocket API to receive real-time updates about new Bitcoin blocks being mined. The timer counts how many blocks have been mined since you started your focus session, and notifies you when your target number of blocks has been reached.

## License

MIT 