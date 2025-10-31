// Direct export approach (more reliable than global variables)
const getBaseURL = () => {
    console.log('Current NODE_ENV:', process.env.NODE_ENV);
    console.log('Current mode:', import.meta.env.MODE); // Vite specific

    // Check both Vite and traditional environment variables
    const isDevelopment =
        process.env.NODE_ENV === 'development' ||
        import.meta.env.DEV ||
        import.meta.env.MODE === 'development' ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1';

    if (isDevelopment) {
        console.log('Using development URL: http://127.0.0.1:5000');
        return 'http://127.0.0.1:5000';
    }

    // Fix: Add https:// protocol for Azure deployment
    const prodURL = process.env.VITE_API_URL || 'https://vfp-solver-gngfaahkh2fkbbhh.uksouth-01.azurewebsites.net';
    console.log('Using production URL:', prodURL);
    return prodURL;
};

const BASE_URL = getBaseURL();

export const fetchAPI = async (url, options = {}) => {
    const fullURL = url.startsWith('http') ? url : `${BASE_URL}${url}`;
    const response = await fetch(fullURL, options);

    // Get content type
    const contentType = response.headers.get('content-type') || '';

    // If response is a zip or other binary, return blob
    if (contentType.includes('application/zip') || contentType.includes('application/octet-stream')) {
        return {
            ok: response.ok,
            status: response.status,
            headers: response.headers,
            blob: () => response.blob(),
            response // for advanced use
        };
    }

    // If plain text, expose .text()
    if (contentType.includes('text/plain')) {
        const textData = await response.text();
        return {
            ok: response.ok,
            status: response.status,
            headers: response.headers,
            text: () => Promise.resolve(textData),
            response
        };
    }



    // Otherwise, try to parse as JSON
    let data;
    try {
        data = await response.json();
    } catch {
        data = null;
    }
    return {
        ok: response.ok,
        status: response.status,
        headers: response.headers,
        json: () => Promise.resolve(data),
        response
    };
};

// Export the base URL too
export const API_BASE_URL = BASE_URL;

// Default export
export default fetchAPI;