import { useState, useEffect, useRef, useCallback } from 'react';
import MDEditor from '@uiw/react-md-editor';
import { getNote, updateNote } from '../api/notes';
import { useAuth } from '../contexts/AuthContext';
import { io } from 'socket.io-client';

const SAVE_DEBOUNCE_MS = 1500;

export default function NoteEditor({ noteId, permission, onTitleChange, onDeleted, onShareClick }) {
  const { user } = useAuth();
  const [note, setNote] = useState(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved' | 'saving' | 'unsaved' | 'error'
  const [loading, setLoading] = useState(true);
  const saveTimer = useRef(null);
  const socketRef = useRef(null);
  const suppressBroadcast = useRef(false);
  const canEdit = permission === 'write';

  // Load note
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getNote(noteId).then(n => {
      if (cancelled) return;
      setNote(n);
      setTitle(n.title);
      setContent(n.content);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [noteId]);

  // Socket.IO for real-time collaboration
  useEffect(() => {
    const token = localStorage.getItem('token');
    const socket = io({ auth: { token } });
    socketRef.current = socket;
    socket.emit('note:join', noteId);

    socket.on('note:update', ({ content: newContent, title: newTitle }) => {
      suppressBroadcast.current = true;
      if (newContent !== undefined) setContent(newContent);
      if (newTitle !== undefined) setTitle(newTitle);
      suppressBroadcast.current = false;
    });

    return () => {
      socket.emit('note:leave', noteId);
      socket.disconnect();
    };
  }, [noteId]);

  const scheduleSave = useCallback((newTitle, newContent) => {
    setSaveStatus('unsaved');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await updateNote(noteId, { title: newTitle, content: newContent });
        setSaveStatus('saved');
        onTitleChange(noteId, newTitle);
      } catch {
        setSaveStatus('error');
      }
    }, SAVE_DEBOUNCE_MS);
  }, [noteId, onTitleChange]);

  const handleTitleChange = (e) => {
    const val = e.target.value;
    setTitle(val);
    if (!suppressBroadcast.current) {
      socketRef.current?.emit('note:change', { noteId, title: val, content });
    }
    scheduleSave(val, content);
  };

  const handleContentChange = (val = '') => {
    setContent(val);
    if (!suppressBroadcast.current) {
      socketRef.current?.emit('note:change', { noteId, title, content: val });
    }
    scheduleSave(title, val);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        Loading note…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-surface-600 flex-shrink-0">
        {/* Save status */}
        <div className="flex-1 flex items-center gap-2">
          {saveStatus === 'saving' && (
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Saving…
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="text-xs text-gray-600 flex items-center gap-1">
              <svg className="w-3 h-3 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Saved
            </span>
          )}
          {saveStatus === 'unsaved' && (
            <span className="text-xs text-amber-600">Unsaved changes</span>
          )}
          {saveStatus === 'error' && (
            <span className="text-xs text-red-500">Save failed</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={onShareClick}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-surface-600 hover:bg-surface-500 px-3 py-1.5 rounded-lg transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Share
          </button>

          {note?.ownerId === user?.id && (
            <button
              onClick={() => onDeleted(noteId)}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-400 bg-surface-600 hover:bg-surface-500 px-3 py-1.5 rounded-lg transition"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Title */}
      <div className="px-4 pt-4 pb-2 flex-shrink-0">
        <input
          type="text" value={title} onChange={handleTitleChange} disabled={!canEdit}
          placeholder="Note title"
          className="w-full bg-transparent text-2xl font-bold text-white placeholder-gray-600 focus:outline-none disabled:opacity-60"
        />
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden px-4 pb-4" data-color-mode="dark">
        <MDEditor
          value={content}
          onChange={canEdit ? handleContentChange : undefined}
          height="100%"
          preview={canEdit ? 'live' : 'preview'}
          hideToolbar={!canEdit}
          visibleDragbar={false}
          style={{ height: '100%' }}
        />
      </div>
    </div>
  );
}
