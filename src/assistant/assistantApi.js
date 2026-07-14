import axios from 'axios';

const BASE = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api/v1/assistant`
  : '/api/v1/assistant';

const api = axios.create({ baseURL: BASE, headers: { 'Content-Type': 'application/json' } });

export const assistantApi = {
  chat: (messages, userRole) => api.post('/chat', { messages, userRole }),
};
