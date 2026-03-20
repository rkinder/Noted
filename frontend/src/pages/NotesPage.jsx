import { useState, useEffect } from 'react';
import { getNotes, deleteNote } from '../api/notes';
import { getFolders } from '../api/folders';
import { useAuth } from '../contexts/AuthContext';
import NoteList from '../components/NoteList.jsx';
import NoteEditor from '../components/NoteEditor.jsx';
import ShareModal from '../components/ShareModal.jsx';
import PresentationMode from '../components/PresentationMode.jsx';

export default function NotesPage() {
  const { user, logout } = useAuth();
  const [notes, setNotes] = useState([]);
  const [folders, setFolders] = useState([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [selectedNote, setSelectedNote] = useState(null);
  const [selectedFolderId, setSelectedFolderId] = useState(undefined); // undefined = All Notes
  const [shareTarget, setShareTarget] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [presentation, setPresentation] = useState(null);

  useEffect(() => {
    refreshAll();
  }, []);

  const refreshAll = async () => {
    setNotesLoading(true);
    try {
      const [notesData, foldersData] = await Promise.all([getNotes(), getFolders()]);
      setNotes(notesData);
      setFolders(foldersData);
      setSelectedNote(prev => prev ? notesData.find(n => n.id === prev.id) || prev : null);
    } finally {
      setNotesLoading(false);
    }
  };

  const handleCreated = (note) => {
    setNotes(prev => [note, ...prev]);
    setSelectedNote({ ...note, isOwner: true, permission: 'write' });
  };

  const handleSelect = (note) => setSelectedNote(note);

  const handleTitleChange = (noteId, newTitle) => {
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, title: newTitle } : n));
    setSelectedNote(prev => prev?.id === noteId ? { ...prev, title: newTitle } : prev);
  };

  const handleDeleted = async (noteId) => {
    if (!confirm('Delete this note? This cannot be undone.')) return;
    try {
      await deleteNote(noteId);
      setNotes(prev => prev.filter(n => n.id !== noteId));
      setSelectedNote(null);
    } catch (err) {
      alert(err.error || 'Delete failed');
    }
  };

  const handleShareUpdated = (updatedNote) => {
    setNotes(prev => prev.map(n => n.id === updatedNote.id ? { ...n, collaborators: updatedNote.collaborators } : n));
    setSelectedNote(prev => prev?.id === updatedNote.id ? { ...prev, collaborators: updatedNote.collaborators } : prev);
    setShareTarget(prev => prev ? { ...prev, collaborators: updatedNote.collaborators } : prev);
  };

  // ── Folder handlers ──
  const handleFolderCreated = (folder) => setFolders(prev => [...prev, folder]);

  const handleFolderUpdated = (updated) =>
    setFolders(prev => prev.map(f => f.id === updated.id ? updated : f));

  const handleFolderDeleted = (folderId) => {
    setFolders(prev => prev.filter(f => f.id !== folderId));
    if (selectedFolderId === folderId) setSelectedFolderId(undefined);
    // Notes that were in the folder are now unfoldered — re-fetch to get updated folderId
    setNotes(prev => prev.map(n => n.folderId === folderId ? { ...n, folderId: null } : n));
  };

  const handleNoteMoved = (noteId, folderId) => {
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, folderId } : n));
  };

  return (
    <div className="flex h-screen bg-surface-900 overflow-hidden">
      {/* Sidebar */}
      <div className={`flex flex-col bg-surface-800 border-r border-surface-600 transition-all duration-200 ${sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'}`}>
        {/* App header */}
        <div className="flex items-center gap-2 px-3 py-3 border-b border-surface-600">
          <div className="flex items-center justify-center w-7 h-7 bg-indigo-600 rounded-lg flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
          <span className="font-semibold text-white text-sm">Noted</span>
          <div className="flex-1" />
          <button onClick={refreshAll} className="text-gray-500 hover:text-gray-300 transition" title="Refresh">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-hidden">
          <NoteList
            notes={notes}
            folders={folders}
            selectedId={selectedNote?.id}
            selectedFolderId={selectedFolderId}
            onSelect={handleSelect}
            onCreated={handleCreated}
            onFolderSelect={setSelectedFolderId}
            onFolderCreated={handleFolderCreated}
            onFolderUpdated={handleFolderUpdated}
            onFolderDeleted={handleFolderDeleted}
            onNoteMoved={handleNoteMoved}
            loading={notesLoading}
          />
        </div>

        {/* User footer */}
        <div className="px-3 py-3 border-t border-surface-600">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-indigo-700 flex items-center justify-center text-xs font-medium text-white flex-shrink-0">
              {user?.email?.[0]?.toUpperCase()}
            </div>
            <span className="text-xs text-gray-400 truncate flex-1">{user?.email}</span>
            <button onClick={logout} className="text-gray-500 hover:text-gray-300 transition flex-shrink-0" title="Sign out">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center px-3 py-2 border-b border-surface-600 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="text-gray-400 hover:text-white transition mr-2"
            title="Toggle sidebar"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-sm text-gray-400 truncate">
            {selectedNote ? selectedNote.title || 'Untitled Note' : 'No note selected'}
          </span>
          {selectedNote && !selectedNote.isOwner && (
            <span className="ml-2 text-xs bg-surface-600 text-gray-400 px-2 py-0.5 rounded">
              {selectedNote.permission === 'write' ? 'Can edit' : 'Read only'}
            </span>
          )}
        </div>

        {/* Editor area */}
        <div className="flex-1 overflow-hidden">
          {selectedNote ? (
            <NoteEditor
              key={selectedNote.id}
              noteId={selectedNote.id}
              permission={selectedNote.permission}
              onTitleChange={handleTitleChange}
              onDeleted={handleDeleted}
              onShareClick={() => setShareTarget(selectedNote)}
              onPresent={setPresentation}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <div className="w-16 h-16 rounded-2xl bg-surface-700 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-gray-400 font-medium">Select a note or create a new one</p>
              <p className="text-gray-600 text-sm mt-1">Your notes are encrypted at rest</p>
            </div>
          )}
        </div>
      </div>

      {/* Presentation mode */}
      {presentation && (
        <PresentationMode
          title={presentation.title}
          content={presentation.content}
          onExit={() => setPresentation(null)}
        />
      )}

      {/* Share modal */}
      {shareTarget && (
        <ShareModal
          note={shareTarget}
          onClose={() => setShareTarget(null)}
          onUpdated={handleShareUpdated}
        />
      )}
    </div>
  );
}
