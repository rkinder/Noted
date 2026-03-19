import { useState, useEffect, useRef } from 'react';
import { searchUsers } from '../api/auth';
import { addCollaborator, removeCollaborator } from '../api/notes';
import { useAuth } from '../contexts/AuthContext';

export default function ShareModal({ note, onClose, onUpdated }) {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [permission, setPermission] = useState('write');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const searchTimeout = useRef(null);

  const isOwner = note.ownerId === user.id;

  useEffect(() => {
    clearTimeout(searchTimeout.current);
    if (query.length < 2) { setResults([]); return; }
    searchTimeout.current = setTimeout(async () => {
      try {
        setResults(await searchUsers(query));
      } catch {
        setResults([]);
      }
    }, 300);
  }, [query]);

  const handleAdd = async (email) => {
    setError('');
    setAdding(true);
    try {
      const updated = await addCollaborator(note.id, email, permission);
      onUpdated(updated);
      setQuery('');
      setResults([]);
    } catch (err) {
      setError(err.error || 'Failed to add collaborator');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (userId) => {
    try {
      const updated = await removeCollaborator(note.id, userId);
      onUpdated(updated);
    } catch (err) {
      setError(err.error || 'Failed to remove collaborator');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="bg-surface-700 rounded-2xl border border-surface-500 shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-500">
          <div>
            <h2 className="text-base font-semibold text-white">Share note</h2>
            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{note.title}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {error && (
            <div className="bg-red-950/60 border border-red-800 rounded-lg px-3 py-2 text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Add collaborator */}
          {isOwner && (
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">
                Invite by email
              </label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    type="text" value={query} onChange={e => setQuery(e.target.value)}
                    placeholder="Search users…"
                    className="w-full bg-surface-800 border border-surface-500 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition"
                  />
                  {results.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-surface-800 border border-surface-500 rounded-lg overflow-hidden z-10 shadow-xl">
                      {results.map(u => (
                        <button
                          key={u.id}
                          onClick={() => handleAdd(u.email)}
                          disabled={adding}
                          className="w-full text-left px-3 py-2.5 text-sm text-gray-200 hover:bg-surface-600 transition flex items-center justify-between"
                        >
                          <span>{u.email}</span>
                          <span className="text-xs text-indigo-400">+ Add</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <select
                  value={permission} onChange={e => setPermission(e.target.value)}
                  className="bg-surface-800 border border-surface-500 rounded-lg px-2 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 transition"
                >
                  <option value="write">Can edit</option>
                  <option value="read">Can view</option>
                </select>
              </div>
            </div>
          )}

          {/* Current collaborators */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">
              People with access
            </label>
            <div className="space-y-1">
              {/* Owner */}
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-800">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-medium text-white">
                    {note.ownerEmail?.[0]?.toUpperCase() || 'O'}
                  </div>
                  <div>
                    <p className="text-sm text-gray-200">{note.ownerEmail || 'Owner'}</p>
                    {note.ownerId === user.id && <p className="text-xs text-gray-500">You</p>}
                  </div>
                </div>
                <span className="text-xs text-gray-400 bg-surface-600 px-2 py-0.5 rounded">Owner</span>
              </div>

              {note.collaborators.map(c => (
                <div key={c.userId} className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-800">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-surface-500 flex items-center justify-center text-xs font-medium text-gray-300">
                      {c.email[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm text-gray-200">{c.email}</p>
                      {c.userId === user.id && <p className="text-xs text-gray-500">You</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">
                      {c.permission === 'write' ? 'Can edit' : 'Can view'}
                    </span>
                    {(isOwner || c.userId === user.id) && (
                      <button
                        onClick={() => handleRemove(c.userId)}
                        className="text-gray-500 hover:text-red-400 transition"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {note.collaborators.length === 0 && (
                <p className="text-sm text-gray-500 px-3 py-2">No collaborators yet</p>
              )}
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-surface-500 flex justify-end">
          <button
            onClick={onClose}
            className="bg-surface-600 hover:bg-surface-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
