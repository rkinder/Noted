import client from './client';

export const register = (email, password) => client.post('/auth/register', { email, password });
export const login = (email, password) => client.post('/auth/login', { email, password });
export const getMe = () => client.get('/auth/me');
export const searchUsers = (q) => client.get('/auth/search', { params: { q } });
