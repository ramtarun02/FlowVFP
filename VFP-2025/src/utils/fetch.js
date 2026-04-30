// Direct export approach (more reliable than global variables)
const getBaseURL = () => {
    // Packaged mode serves frontend and backend on one origin.
    if (import.meta.env.VITE_PACKAGED === 'true') {
        return '';
    }

    // In development, use relative URLs so Vite's dev-server proxy forwards
    // requests to the Flask backend — this avoids CORS entirely.
    const isDevelopment =
        import.meta.env.DEV ||
        import.meta.env.MODE === 'development';

    if (isDevelopment) {
        return '';
    }

    const prodURL = import.meta.env.VITE_API_URL || 'https://vfp-solver-gngfaahkh2fkbbhh.uksouth-01.azurewebsites.net';
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