
import { fetchAuthSession } from 'aws-amplify/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export async function fetchWithAuth(path: string, options: RequestInit = {}) {
    try {
        const session = await fetchAuthSession();
        const token = session.tokens?.idToken?.toString();

        if (!token) {
            throw new Error('No authentication token found');
        }

        const headers = {
            ...options.headers,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        };

        const response = await fetch(`${API_URL}${path}`, {
            ...options,
            headers,
        });

        if (response.status === 401) {
            // Handle token expiry or invalidity if needed, though fetchAuthSession handles refresh
            throw new Error('Unauthorized');
        }

        return response;
    } catch (error) {
        throw error;
    }
}
