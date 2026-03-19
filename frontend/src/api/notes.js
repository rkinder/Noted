import client from './client';

export const getNotes = () => client.get('/notes');
export const getNote = (id) => client.get(`/notes/${id}`);
export const createNote = (title, content) => client.post('/notes', { title, content });
export const updateNote = (id, data) => client.put(`/notes/${id}`, data);
export const deleteNote = (id) => client.delete(`/notes/${id}`);
export const addCollaborator = (noteId, email, permission) =>
  client.post(`/notes/${noteId}/collaborators`, { email, permission });
export const removeCollaborator = (noteId, userId) =>
  client.delete(`/notes/${noteId}/collaborators/${userId}`);
