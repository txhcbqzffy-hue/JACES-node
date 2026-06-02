const runtimeApiUrl = typeof window !== 'undefined' && window.__JACES_API_URL ? String(window.__JACES_API_URL).trim() : '';

export const API_URL = runtimeApiUrl || (typeof window !== 'undefined' ? window.location.origin : '');
