import io from 'socket.io-client';

// Resolve the Socket.IO base URL with sensible overrides
const getSocketURL = () => {
    const isDevelopment =
        import.meta.env.DEV ||
        import.meta.env.MODE === 'development';

    if (isDevelopment) {
        // Connect DIRECTLY to the Flask backend, bypassing the Vite proxy.
        //
        // Why: Socket.IO upgrades polling→WebSocket by opening a fresh HTTP
        // request with `Upgrade: websocket`.  Vite's http-proxy only intercepts
        // connections that arrive as WebSocket from the very first byte, so the
        // polling→WebSocket upgrade silently falls through to the Vite dev
        // server itself, which rejects it with "Invalid frame header" / 400.
        //
        // Flask-SocketIO sets cors_allowed_origins="*" in debug mode, so a
        // cross-origin connection from localhost:3000 → localhost:5000 is fine.
        return (
            import.meta.env.VITE_WS_URL ||
            import.meta.env.VITE_API_URL ||
            'http://127.0.0.1:5000'
        );
    }

    // Production: honor explicit override, then fall back to Azure
    return (
        import.meta.env.VITE_WS_URL ||
        import.meta.env.VITE_API_URL ||
        'https://vfp-solver-gngfaahkh2fkbbhh.uksouth-01.azurewebsites.net'
    );
};

// Create socket connection function
export const createSocket = (options = {}) => {
    const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development';

    const defaultOptions = {
        // In development, Werkzeug's built-in HTTP server cannot handle the
        // polling→WebSocket upgrade request: it returns a plain HTTP response
        // instead of a proper 101 Switching Protocols handshake, which the
        // browser reports as "Invalid frame header".  Polling-only avoids the
        // upgrade and works perfectly for our use case.
        // In production (Linux/Azure + eventlet) WebSocket is fine.
        transports: isDev ? ['polling'] : ['polling', 'websocket'],
        upgrade: !isDev,
        rememberUpgrade: false,
        timeout: 20000,
    };

    const socketURL = getSocketURL();
    // Only log for real connections (skip the autoConnect:false singleton)
    if (options.autoConnect !== false) {
        console.log('Connecting to Socket.IO:', socketURL, '(transport: polling)');
    }

    return io(socketURL, { ...defaultOptions, ...options });
};

// Singleton — created with autoConnect:false so it does NOT open a connection
// at module-import time.  Call socket.connect() explicitly when needed, or
// let individual components create their own sockets via createSocket().
export const socket = createSocket({ autoConnect: false });

export default socket;