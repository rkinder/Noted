import { useState } from 'react';
import { createNote } from '../api/notes';
import { createFolder, updateFolder, deleteFolder, moveNoteToFolder } from '../api/folders';

function formatDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diffMins = Math.floor((now - d) / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function FolderIcon({ open }) {
  return open ? (
    <svg className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
    </svg>
  ) : (
    <svg className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
  );
}

// ─── Inline rename input ───────────────────────────────────────────────────────

function InlineInput({ initial, onConfirm, onCancel }) {
  const [value, setValue] = useState(initial);
  return (
    <input
      autoFocus
      value={value}
      onChange={e => setValue(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') onConfirm(value.trim());
        if (e.key === 'Escape') onCancel();
      }}
      onBlur={() => onConfirm(value.trim())}
      className="flex-1 bg-surface-700 text-white text-xs px-1.5 py-0.5 rounded outline-none border border-indigo-500 min-w-0"
    />
  );
}

// ─── NoteList ─────────────────────────────────────────────────────────────────

export default function NoteList({
  notes, folders, selectedId, selectedFolderId,
  onSelect, onCreated, onFolderSelect, onFolderCreated, onFolderUpdated, onFolderDeleted,
  onNoteMoved, loading,
}) {
  const [creating, setCreating] = useState(false);
  const [newFolderParent, setNewFolderParent] = useState(undefined); // undefined = closed
  const [renamingFolderId, setRenamingFolderId] = useState(null);
  const [openFolderIds, setOpenFolderIds] = useState(new Set());
  const [draggingNoteId, setDraggingNoteId] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(undefined); // folderId or null (root)

  const handleNew = async () => {
    setCreating(true);
    try {
      const note = await createNote('Untitled Note', '');
      onCreated(note);
    } finally {
      setCreating(false);
    }
  };

  const handleCreateFolder = async (name) => {
    if (!name) { setNewFolderParent(undefined); return; }
    const folder = await createFolder(name, newFolderParent || null);
    onFolderCreated(folder);
    setNewFolderParent(undefined);
  };

  const handleRenameFolder = async (folderId, name) => {
    setRenamingFolderId(null);
    if (!name) return;
    const updated = await updateFolder(folderId, { name });
    onFolderUpdated(updated);
  };

  const handleDeleteFolder = async (folderId) => {
    if (!confirm('Delete this folder? Notes inside will move to the parent folder.')) return;
    await deleteFolder(folderId);
    onFolderDeleted(folderId);
  };

  const toggleFolder = (folderId) => {
    setOpenFolderIds(prev => {
      const next = new Set(prev);
      next.has(folderId) ? next.delete(folderId) : next.add(folderId);
      return next;
    });
    onFolderSelect(folderId);
  };

  // ── Drag-and-drop ──
  const handleDragStart = (e, noteId) => {
    setDraggingNoteId(noteId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = async (e, folderId) => {
    e.preventDefault();
    setDropTargetId(undefined);
    if (!draggingNoteId) return;
    await moveNoteToFolder(draggingNoteId, folderId);
    onNoteMoved(draggingNoteId, folderId);
    setDraggingNoteId(null);
  };

  // ── Build folder tree ──
  const rootFolders = folders.filter(f => !f.parentId);
  const childFolders = (parentId) => folders.filter(f => f.parentId === parentId);

  // Visible notes: filtered by selectedFolderId (undefined = all notes)
  const visibleNotes = selectedFolderId !== undefined
    ? notes.filter(n => n.folderId === selectedFolderId)
    : notes;

  function renderFolder(folder, depth = 0) {
    const isOpen = openFolderIds.has(folder.id);
    const isSelected = selectedFolderId === folder.id;
    const children = childFolders(folder.id);
    const isDropTarget = dropTargetId === folder.id;

    return (
      <div key={folder.id}>
        <div
          className={`group flex items-center gap-1 px-2 py-1.5 rounded-lg mx-1 mb-0.5 cursor-pointer transition
            ${isSelected ? 'bg-indigo-600/20' : 'hover:bg-surface-600'}
            ${isDropTarget ? 'ring-1 ring-indigo-500 bg-indigo-600/10' : ''}`}
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          onClick={() => toggleFolder(folder.id)}
          onDragOver={e => { e.preventDefault(); setDropTargetId(folder.id); }}
          onDragLeave={() => setDropTargetId(undefined)}
          onDrop={e => handleDrop(e, folder.id)}
        >
          <FolderIcon open={isOpen} />

          {renamingFolderId === folder.id ? (
            <InlineInput
              initial={folder.name}
              onConfirm={name => handleRenameFolder(folder.id, name)}
              onCancel={() => setRenamingFolderId(null)}
            />
          ) : (
            <span className={`flex-1 text-xs truncate ${isSelected ? 'text-indigo-300' : 'text-gray-400'}`}>
              {folder.name}
            </span>
          )}

          {/* Folder actions (shown on hover) */}
          <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0">
            <button
              onClick={e => { e.stopPropagation(); setNewFolderParent(folder.id); setOpenFolderIds(p => new Set([...p, folder.id])); }}
              title="New subfolder"
              className="p-0.5 text-gray-500 hover:text-white rounded"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <button
              onClick={e => { e.stopPropagation(); setRenamingFolderId(folder.id); }}
              title="Rename"
              className="p-0.5 text-gray-500 hover:text-white rounded"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              onClick={e => { e.stopPropagation(); handleDeleteFolder(folder.id); }}
              title="Delete folder"
              className="p-0.5 text-gray-500 hover:text-red-400 rounded"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* New subfolder input */}
        {newFolderParent === folder.id && (
          <div className="flex items-center gap-1 px-2 py-1 mx-1" style={{ paddingLeft: `${8 + (depth + 1) * 12}px` }}>
            <FolderIcon open={false} />
            <InlineInput initial="" onConfirm={handleCreateFolder} onCancel={() => setNewFolderParent(undefined)} />
          </div>
        )}

        {/* Children */}
        {isOpen && children.map(c => renderFolder(c, depth + 1))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-3 border-b border-surface-600 flex items-center gap-2">
        <button
          onClick={handleNew}
          disabled={creating}
          className="flex-1 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-3 py-2 rounded-lg transition"
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New note
        </button>
        <button
          onClick={() => setNewFolderParent(null)}
          title="New folder"
          className="p-2 text-gray-400 hover:text-white bg-surface-600 hover:bg-surface-500 rounded-lg transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h4a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          </svg>
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto py-1">
        {loading && (
          <div className="px-4 py-8 text-center text-gray-500 text-sm">Loading…</div>
        )}

        {!loading && (
          <>
            {/* All Notes view shortcut */}
            <button
              onClick={() => onFolderSelect(undefined)}
              className={`w-full text-left flex items-center gap-1.5 px-3 py-1.5 rounded-lg mx-1 mb-0.5 text-xs transition
                ${selectedFolderId === undefined ? 'text-indigo-300 bg-indigo-600/20' : 'text-gray-500 hover:text-gray-300 hover:bg-surface-600'}`}
              onDragOver={e => { e.preventDefault(); setDropTargetId(null); }}
              onDragLeave={() => setDropTargetId(undefined)}
              onDrop={e => handleDrop(e, null)}
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              All Notes
              <span className="ml-auto text-gray-600">{notes.length}</span>
            </button>

            {/* New root folder input */}
            {newFolderParent === null && (
              <div className="flex items-center gap-1 px-2 py-1 mx-1">
                <FolderIcon open={false} />
                <InlineInput initial="" onConfirm={handleCreateFolder} onCancel={() => setNewFolderParent(undefined)} />
              </div>
            )}

            {/* Folder tree */}
            {rootFolders.map(f => renderFolder(f))}

            {/* Divider if there are folders */}
            {folders.length > 0 && <div className="border-t border-surface-700 mx-3 my-1.5" />}

            {/* Notes list */}
            {visibleNotes.length === 0 && (
              <div className="px-4 py-6 text-center text-gray-600 text-xs">
                {selectedFolderId !== undefined ? 'No notes in this folder' : 'No notes yet'}
              </div>
            )}

            {visibleNotes.map((note) => (
              <button
                key={note.id}
                onClick={() => onSelect(note)}
                draggable
                onDragStart={e => handleDragStart(e, note.id)}
                onDragEnd={() => setDraggingNoteId(null)}
                className={`w-full text-left px-3 py-2.5 rounded-lg mx-1 mb-0.5 transition group
                  ${draggingNoteId === note.id ? 'opacity-40' : ''}
                  ${selectedId === note.id
                    ? 'bg-indigo-600/20 border border-indigo-600/40'
                    : 'hover:bg-surface-600 border border-transparent'}`}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className={`text-sm font-medium truncate ${selectedId === note.id ? 'text-indigo-300' : 'text-gray-200'}`}>
                    {note.title || 'Untitled Note'}
                  </span>
                  {!note.isOwner && (
                    <span className="flex-shrink-0 text-[10px] bg-surface-500 text-gray-400 px-1.5 py-0.5 rounded">shared</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-xs text-gray-500">{formatDate(note.updatedAt)}</span>
                  {note.collaborators?.length > 0 && (
                    <span className="text-xs text-gray-600">
                      · {note.collaborators.length} collaborator{note.collaborators.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
