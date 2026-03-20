import client from './client';

export const getFolders = () => client.get('/folders');
export const createFolder = (name, parentId = null) => client.post('/folders', { name, parentId });
export const updateFolder = (id, data) => client.patch(`/folders/${id}`, data);
export const deleteFolder = (id) => client.delete(`/folders/${id}`);
export const moveNoteToFolder = (noteId, folderId) =>
  client.patch(`/folders/note/${noteId}/folder`, { folderId });
