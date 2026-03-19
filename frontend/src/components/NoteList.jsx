import { useState } from 'react';
import { createNote } from '../api/notes';

function formatDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function NoteList({ notes, selectedId, onSelect, onCreated, loading }) {
  const [creating, setCreating] = useState(false);

  const handleNew = async () => {
    setCreating(true);
    try {
      const note = await createNote('Untitled Note', '');
      onCreated(note);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-3 border-b border-surface-600">
        <button
          onClick={handleNew}
          disabled={creating}
          className="w-full flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-3 py-2 rounded-lg transition"
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New note
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1">
        {loading && (
          <div className="px-4 py-8 text-center text-gray-500 text-sm">Loading…</div>
        )}
        {!loading && notes.length === 0 && (
          <div className="px-4 py-8 text-center text-gray-500 text-sm">No notes yet</div>
        )}
        {notes.map((note) => (
          <button
            key={note.id}
            onClick={() => onSelect(note)}
            className={`w-full text-left px-3 py-2.5 rounded-lg mx-1 mb-0.5 transition group ${
              selectedId === note.id
                ? 'bg-indigo-600/20 border border-indigo-600/40'
                : 'hover:bg-surface-600 border border-transparent'
            }`}
          >
            <div className="flex items-start justify-between gap-1">
              <span className={`text-sm font-medium truncate ${selectedId === note.id ? 'text-indigo-300' : 'text-gray-200'}`}>
                {note.title || 'Untitled Note'}
              </span>
              {!note.isOwner && (
                <span className="flex-shrink-0 text-[10px] bg-surface-500 text-gray-400 px-1.5 py-0.5 rounded">
                  shared
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs text-gray-500">{formatDate(note.updatedAt)}</span>
              {note.collaborators.length > 0 && (
                <span className="text-xs text-gray-600">· {note.collaborators.length} collaborator{note.collaborators.length > 1 ? 's' : ''}</span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
