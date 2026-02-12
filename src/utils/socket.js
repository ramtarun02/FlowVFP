import io from 'socket.io-client';

// Resolve the Socket.IO base URL with sensible overrides
const getSocketURL = () => {
    // First, honor an explicit VITE_WS_URL override even in dev mode
    const overrideURL = import.meta.env.VITE_WS_URL;
    if (overrideURL) return overrideURL;

    const isDevelopment =
        import.meta.env.DEV ||
        import.meta.env.MODE === 'development' ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1';

    // When running the frontend locally but hitting a remote backend, allow
    // VITE_API_URL to double as the websocket base (keeps a single env var).
    if (isDevelopment && import.meta.env.VITE_API_URL) {
        return import.meta.env.VITE_API_URL.replace(/\/$/, '');
    }

    if (isDevelopment) {
        return 'http://127.0.0.1:5000';
    }

    // Production fallback to the Azure deployment
    return 'https://vfp-solver-gngfaahkh2fkbbhh.uksouth-01.azurewebsites.net';
};

// Create socket connection function
export const createSocket = (options = {}) => {
    const defaultOptions = {
        // Start with HTTP polling, then upgrade to websocket when available.
        transports: ['polling', 'websocket'],
        upgrade: true,
        rememberUpgrade: false, // always start with an HTTP request before upgrading
        timeout: 20000,
    };

    const socketURL = getSocketURL();
    console.log('Connecting to WebSocket:', socketURL);

    return io(socketURL, { ...defaultOptions, ...options });
};

// Create a default socket instance
export const socket = createSocket();

export default socket;